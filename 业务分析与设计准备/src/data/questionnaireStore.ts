/**
 * 问卷共享存储（模块级 store，模式同 tenantPackages.ts）
 *
 * 模型 v4（2026-11-10，按品种归属）：
 * - 问卷库数据：问卷配置页与价目表配置页共享同一份（localStorage 演示持久化）；
 * - 计价归属：问卷 × 品种 → 计价方案（serviceId）。
 *   · 「计价方案」由问卷调查大类的价目类别承载（档位=填写对象，价格按品种/公私在价目 store 维护）；
 *   · 每份问卷的每个适用品种显式保存归属，无默认方案、无动态继承；
 *   · 归属条目为 null = 待补齐（v3 迁移无法确定，或方案被删除）；
 *   · 取价：任务按 品种 × 填写对象 × 公私口径 在方案下取唯一价格，创建任务时快照锁定题目版本与公私单价。
 * - v3 的「默认方案 + 逐问卷例外」模型已废弃（读取 v3 旧键时一次性迁移：
 *   例外 > 默认；全品种问卷展开为显式品种清单）。
 *
 * 生产环境由服务端承载；此处为原型演示口径。
 */
import { useSyncExternalStore } from 'react';
import { allProductNames, surveyPriceOf, SURVEY_GROUP } from './priceTableStore';
import type { QuestionnaireTaskSnapshot } from '../types';

export type QuestionKind = '单选' | '多选' | '填空';
export interface QuestionItem { title: string; kind: QuestionKind; options?: string[] }
export interface QuestionnaireVersion { version: number; createdAt: string; note: string; questions: QuestionItem[] }
export interface Questionnaire {
  code: string;
  name: string;
  type: string;
  audience: '医生' | '患者' | '商业公司';
  /** 按品种计价归属：品种名 → 计价方案 serviceId；null = 待补齐。适用品种 = Object.keys(pricing) */
  pricing: Record<string, string | null>;
  status: '启用' | '停用';
  versions: QuestionnaireVersion[];
  /** 被任务引用数（演示值）：>0 时不可删除，只能停用 */
  taskRefs: number;
}

/** 计价方案登记项：由价目页在创建/改名/删除问卷调查类价目类别时同步 */
export interface SchemeInfo { name: string; group: string }

/** 问卷调查业务大类（当前唯一的问卷计价域）；权威定义在 priceTableStore */
export { SURVEY_GROUP };

interface State {
  version: 4;
  /** 变更序号：每次 commit 递增，作为 useSyncExternalStore 快照 */
  rev: number;
  questionnaires: Questionnaire[];
  schemes: Record<string, SchemeInfo>;
}

const STORAGE_KEY = 'baiyee-questionnaire-store-v4';
const LEGACY_V3_KEY = 'baiyee-questionnaire-store-v3';

const ALL_PRODUCTS = () => allProductNames();

/** 绑定某问卷全部品种到某方案（种子/迁移用） */
const bindAll = (varieties: string[], serviceId: string | null): Record<string, string | null> =>
  Object.fromEntries(varieties.map((v) => [v, serviceId]));

const SEED: Questionnaire[] = [
  {
    code: 'QX-2026-0001', name: '科室会满意度调研问卷', type: '满意度', audience: '医生',
    pricing: bindAll(['希刻劳'], 'surveyStd'), status: '启用', taskRefs: 2,
    versions: [
      { version: 1, createdAt: '2026-08-12 10:20', note: '初始导入', questions: [
        { title: '您对本次科室会的整体满意度如何？', kind: '单选', options: ['非常满意', '满意', '一般', '不满意'] },
        { title: '您认为会议内容对临床工作的帮助程度？', kind: '单选', options: ['很大帮助', '有一定帮助', '帮助有限', '没有帮助'] },
        { title: '您希望后续会议增加哪些内容？', kind: '多选', options: ['最新临床研究', '用药经验分享', '病例讨论', '指南解读', '其他'] },
      ] },
      { version: 2, createdAt: '2026-10-09 15:40', note: '替换：增加开放建议题', questions: [
        { title: '您对本次科室会的整体满意度如何？', kind: '单选', options: ['非常满意', '满意', '一般', '不满意'] },
        { title: '您认为会议内容对临床工作的帮助程度？', kind: '单选', options: ['很大帮助', '有一定帮助', '帮助有限', '没有帮助'] },
        { title: '您希望后续会议增加哪些内容？', kind: '多选', options: ['最新临床研究', '用药经验分享', '病例讨论', '指南解读', '其他'] },
        { title: '您对会议组织有何建议？', kind: '填空' },
      ] },
    ],
  },
  {
    code: 'QX-2026-0002', name: '合理用药认知调研问卷', type: '合理用药', audience: '医生',
    pricing: bindAll(ALL_PRODUCTS(), 'surveyUrgent'), status: '启用', taskRefs: 1,
    versions: [
      { version: 1, createdAt: '2026-09-03 09:10', note: '初始导入', questions: [
        { title: '您在处方该类药品时最关注的因素是？', kind: '单选', options: ['疗效', '安全性', '价格', '医保报销', '患者依从性'] },
        { title: '您遇到过的用药顾虑有哪些？', kind: '多选', options: ['不良反应', '药物相互作用', '特殊人群用药', '剂型不便', '其他'] },
        { title: '请描述您通常的剂量调整策略。', kind: '填空' },
      ] },
    ],
  },
  {
    code: 'QX-2026-0003', name: '患者用药依从性问卷', type: '用药依从性', audience: '患者',
    pricing: bindAll(ALL_PRODUCTS(), 'surveyStd'), status: '停用', taskRefs: 0,
    versions: [
      { version: 1, createdAt: '2026-07-21 14:05', note: '初始导入', questions: [
        { title: '您是否按医嘱按时服药？', kind: '单选', options: ['完全按医嘱', '偶尔遗漏', '经常遗漏', '几乎不按医嘱'] },
        { title: '漏服药的主要原因是什么？', kind: '多选', options: ['忘记', '副作用', '药费负担', '服药次数太多', '其他'] },
        { title: '您希望获得哪方面的用药指导？', kind: '填空' },
      ] },
    ],
  },
];

function cloneQ(q: Questionnaire): Questionnaire {
  return {
    ...q,
    pricing: { ...q.pricing },
    versions: q.versions.map((v) => ({ ...v, questions: v.questions.map((x) => ({ ...x, options: x.options ? [...x.options] : undefined })) })),
  };
}

/** 预置计价方案登记（id 与价目 store SURVEY_SEED_SERVICES 对齐，开箱即用） */
const PRESET_SCHEMES: Record<string, SchemeInfo> = {
  surveyStd: { name: '问卷调研', group: SURVEY_GROUP },
  surveyUrgent: { name: '问卷调研-加急', group: SURVEY_GROUP },
};

function buildSeedState(): State {
  return {
    version: 4,
    rev: 0,
    questionnaires: SEED.map(cloneQ),
    schemes: { ...PRESET_SCHEMES },
  };
}

// ===== v3 → v4 一次性迁移 =====
interface LegacyV3Raw {
  version?: number;
  questionnaires?: Array<Omit<Questionnaire, 'pricing'> & { varieties?: string[]; pricing?: Record<string, string | null> }>;
  link?: { defaults?: Record<string, string>; exceptions?: Record<string, string> };
  schemes?: Record<string, SchemeInfo>;
}

/**
 * 迁移规则：
 * - 适用品种展开为显式清单（v3 空数组 = 全品种 → 当前全部品种）；
 * - 归属 = 例外 > 默认；方案登记中不存在（已删）或两处皆无 → null（待补齐）；
 * - 缺价不落库：价格在价目 store（内存态），缺价状态由渲染层实时计算。
 */
export function migrateV3(raw: LegacyV3Raw, products: string[]): State {
  const schemes = raw.schemes ?? { ...PRESET_SCHEMES };
  const fallback = raw.link?.defaults?.[SURVEY_GROUP] ?? null;
  const safeFallback = fallback && schemes[fallback] ? fallback : null;
  const questionnaires: Questionnaire[] = (raw.questionnaires ?? []).map((q) => {
    const varieties = q.pricing
      ? Object.keys(q.pricing) // 已是 v4 形态（幂等保护）
      : (q.varieties?.length ? q.varieties : products);
    const ex = raw.link?.exceptions?.[q.code];
    const own = ex && schemes[ex] ? ex : null;
    const schemeId = own ?? safeFallback;
    // 剥离 legacy 的 varieties 字段：v4 的适用品种 = Object.keys(pricing)
    const { varieties: _dropped, ...rest } = q;
    return { ...rest, pricing: bindAll(varieties, schemeId) };
  });
  return { version: 4, rev: 0, questionnaires, schemes };
}

function loadState(): State {
  try {
    const rawV4 = window.localStorage.getItem(STORAGE_KEY);
    if (rawV4) {
      const parsed = JSON.parse(rawV4) as State;
      if (parsed?.version === 4 && Array.isArray(parsed.questionnaires)) return parsed;
    }
    const rawV3 = window.localStorage.getItem(LEGACY_V3_KEY);
    if (rawV3) {
      const legacy = JSON.parse(rawV3) as LegacyV3Raw;
      if (legacy?.version === 3 && Array.isArray(legacy.questionnaires)) return migrateV3(legacy, ALL_PRODUCTS());
    }
  } catch {
    /* 解析失败回落种子 */
  }
  return buildSeedState();
}

let state: State = loadState();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 写失败静默降级：仅内存态演示 */
  }
}

function commit(next: State): void {
  state = { ...next, rev: state.rev + 1 };
  persist();
  listeners.forEach((cb) => cb());
}

// 模块加载即落 v4 键：v3 迁移结果一次性固化，此后不再读旧键
if (window.localStorage.getItem(STORAGE_KEY) === null) persist();

export function subscribeQuestionnaireStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getQuestionnaireStoreSnapshot(): State {
  return state;
}

/** React 订阅入口：快照取自增 rev，任何写入都会触发重渲染 */
export function useQuestionnaireStoreSync(): number {
  return useSyncExternalStore(subscribeQuestionnaireStore, () => state.rev);
}

// ===== 问卷库 =====
export function listQuestionnaires(): Questionnaire[] {
  return [...state.questionnaires];
}

export function listEnabledQuestionnaires(): Questionnaire[] {
  return state.questionnaires.filter((q) => q.status === '启用');
}

export function nextQuestionnaireCode(): string {
  const seq = state.questionnaires.reduce((max, q) => Math.max(max, Number(q.code.split('-')[2]) || 0), 0) + 1;
  return 'QX-2026-' + String(seq).padStart(4, '0');
}

export function saveQuestionnaire(q: Omit<Questionnaire, 'taskRefs'>): Questionnaire {
  const created: Questionnaire = { ...cloneQ(q as Questionnaire), taskRefs: 0 };
  commit({ ...state, questionnaires: [...state.questionnaires, created] });
  return created;
}

export function replaceQuestionnaireVersion(code: string, questions: QuestionItem[], createdAt: string): void {
  commit({
    ...state,
    questionnaires: state.questionnaires.map((q) => q.code === code
      ? { ...q, versions: [...q.versions, { version: q.versions[q.versions.length - 1].version + 1, createdAt, note: '替换题目', questions: questions.map((x) => ({ ...x, options: x.options ? [...x.options] : undefined })) }] }
      : q),
  });
}

export function setQuestionnaireStatus(code: string, status: Questionnaire['status']): void {
  commit({ ...state, questionnaires: state.questionnaires.map((q) => q.code === code ? { ...q, status } : q) });
}

export function removeQuestionnaire(code: string): void {
  commit({ ...state, questionnaires: state.questionnaires.filter((q) => q.code !== code) });
}

/** 重置演示数据（问卷配置页「恢复演示数据」用） */
export function resetQuestionnaireStore(): void {
  commit(buildSeedState());
}

// ===== 计价方案登记（价目页维护问卷调查类价目类别时同步） =====
export function registerScheme(serviceId: string, name: string, group: string): void {
  commit({ ...state, schemes: { ...state.schemes, [serviceId]: { name, group } } });
}

export function renameScheme(serviceId: string, name: string): void {
  const info = state.schemes[serviceId];
  if (!info) return;
  commit({ ...state, schemes: { ...state.schemes, [serviceId]: { ...info, name } } });
}

/** 价目类别被删除时：清登记项，并把指向它的品种归属置 null（待补齐） */
export function unlinkService(serviceId: string): void {
  const schemes = { ...state.schemes };
  delete schemes[serviceId];
  const questionnaires = state.questionnaires.map((q) => {
    const entries = Object.entries(q.pricing);
    if (!entries.some(([, id]) => id === serviceId)) return q;
    const pricing: Record<string, string | null> = {};
    for (const [v, id] of entries) pricing[v] = id === serviceId ? null : id;
    return { ...q, pricing };
  });
  commit({ ...state, schemes, questionnaires });
}

export function surveySchemes(): { id: string; name: string }[] {
  return Object.entries(state.schemes)
    .filter(([, info]) => info.group === '问卷调查')
    .map(([id, info]) => ({ id, name: info.name }));
}

// ===== 计价归属：问卷 × 品种 → 方案 =====
/**
 * 取某问卷某品种的归属方案 id。
 * undefined = 该品种不在适用范围；null = 在范围内但待补齐（无归属或方案已删）。
 */
export function schemeOf(code: string, variety: string): string | null | undefined {
  const q = state.questionnaires.find((x) => x.code === code);
  if (!q || !(variety in q.pricing)) return undefined;
  const id = q.pricing[variety];
  return id && state.schemes[id] ? id : null;
}

/** 整表替换某问卷的品种归属（创建/维护弹窗保存用） */
export function bindQuestionnaire(code: string, pricing: Record<string, string | null>): void {
  commit({
    ...state,
    questionnaires: state.questionnaires.map((q) => q.code === code ? { ...q, pricing: { ...pricing } } : q),
  });
}

/** 绑定到某方案的问卷及其品种（价目页只读反查） */
export function questionnairesOfScheme(serviceId: string): { code: string; name: string; audience: Questionnaire['audience']; status: Questionnaire['status']; varieties: string[] }[] {
  return state.questionnaires
    .map((q) => ({
      code: q.code, name: q.name, audience: q.audience, status: q.status,
      varieties: Object.entries(q.pricing).filter(([, id]) => id === serviceId).map(([v]) => v),
    }))
    .filter((r) => r.varieties.length > 0);
}

/**
 * 任务创建时的问卷计价快照：按 问卷 × 品种 锁定最新题目版本与公私单价。
 * unitPrice 来自创建流程按对公口径解析的单价（权威值）；对私价按当前价目实时读取一并锁定。
 * 问卷/方案/版本任一缺失返回 null（创建方负责拦截，不应走到这里）。
 */
export function questionnaireTaskSnapshot(code: string, variety: string, unitPrice: number): QuestionnaireTaskSnapshot | null {
  const q = state.questionnaires.find((x) => x.code === code);
  const schemeId = q ? q.pricing[variety] : undefined;
  if (!q || !schemeId || !state.schemes[schemeId]) return null;
  const version = q.versions[q.versions.length - 1];
  if (!version) return null;
  const price = surveyPriceOf(variety, schemeId, q.audience);
  return {
    code: q.code,
    name: q.name,
    audience: q.audience,
    variety,
    schemeId,
    schemeName: state.schemes[schemeId].name,
    version: version.version,
    versionCreatedAt: version.createdAt,
    questions: version.questions.map((x) => ({ ...x, options: x.options ? [...x.options] : undefined })),
    prices: { pub: unitPrice, priv: price.priv },
  };
}
