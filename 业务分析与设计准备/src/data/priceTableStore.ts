// ===== 价目表共享数据层（2026-11-10 从 PriceTableConfig 页面抽出）=====
// 价格矩阵从页面内部 useState 提升为模块级 store：问卷配置、任务发包等消费方
// 与价目维护页读写同一份数据。保持内存态（不持久化），与原页面行为一致。
import { useSyncExternalStore } from 'react';

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
export const money = (n: number | null | undefined) =>
  '¥' + Number(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const nval = (x: unknown): number | null => {
  if (String(x ?? '').trim() === '') return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export const formatDate = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
export const nowStamp = () => formatDate(new Date()) + ' ' + new Date().toTimeString().slice(0, 5);
export const today = () => formatDate(new Date());

// ===== 档位体系（医院等级 / 城市线级 / 会议组合） =====
export const HOSP = ['三级甲等', '三级乙等', '二级甲等', '二级乙等', '一级', '社区', '民营', '未分级'];
export const CITY = ['普通', '一线', '新一线', '二线', '三线', '四线', '五线'];
export const HOSP_CITY = CITY.slice(1).map((t) => '城市线级｜' + t);
export const MEETING = ['医院等级 × 按场次', '区域等级 × 按场次', '区域等级 × 按人数'];
export const MEETING_LEVELS: Record<string, string[]> = {
  '医院等级 × 按场次': ['三甲', '三乙', '三级', '二甲', '二乙', '二级', '一级', '未评级'],
  '区域等级 × 按场次': ['一线区域', '二线区域', '三线区域', '四线区域'],
  '区域等级 × 按人数': ['一线区域', '二线区域', '三线区域', '四线区域'],
};
export const meetingTier = (mode: string, level: string) => mode + '｜' + level;
export const meetingTiers = (mode: string) => (MEETING_LEVELS[mode] ?? []).map((l) => meetingTier(mode, l));
export const meetingLevel = (tier: string) => tier.split('｜').slice(-1)[0];

// 37 类按两大业务域归组（业务域 = 价目目录左栏树形导航的一级节点）。
// 类别内部保持旧价目表「价目类别」的筛选顺序；这份目录不意味着每项已有演示价格。
export const CATEGORY_DOMAINS: { name: string; categories: string[] }[] = [
  {
    name: '推广服务业务',
    categories: [
      '医院拜访', '商业拜访', '药房拜访', '问卷调查', '会议', '医院信息调研', '科室信息调研', '医生信息调研', '竞品调研',
      '信息反馈', '信息调研', '医学问询', '不良反应监测', '医院协访', '流向统计', '区域价格追踪', '库存信息收集',
      '药房协访', '义诊', '跟台服务', '品种准入', '商业调研', '随访', '药店调研',
    ],
  },
  {
    name: '调研收集与分析报告业务',
    categories: [
      '药事报告', '市场容量调研报告', '竞品分析调研报告', '月度推广计划', '问卷调研分析报告', '流向分析报告',
      '服务商报告链', '市场环境分析报告', '市场推广策略', '问卷设计', '准入潜力评估', '终端产品使用调研', '政策调研报告',
    ],
  },
];
export const CATALOG_CATEGORIES = CATEGORY_DOMAINS.flatMap((d) => d.categories);

export type ServiceType = 'hospital' | 'city' | 'meeting' | 'flat' | 'custom';
export interface ServiceItem { id: string; group: string; name: string; unit: string; type: ServiceType; initialTier?: string }
export const BASE_SERVICES: ServiceItem[] = [
  { id: 'academic', group: '医院拜访', name: '学术拜访', unit: '次', type: 'hospital' },
  { id: 'home', group: '医院拜访', name: '上门日常拜访', unit: '次', type: 'hospital' },
  { id: 'online', group: '医院拜访', name: '网络日常拜访', unit: '次', type: 'hospital' },
  { id: 'research', group: '医院拜访', name: '信息收集和调研', unit: '次', type: 'hospital' },
  { id: 'follow', group: '医院拜访', name: '跟踪巡访服务', unit: '次', type: 'hospital' },
  { id: 'third', group: '医院拜访', name: '第三终端服务', unit: '次', type: 'hospital' },
  { id: 'commerce', group: '商业拜访', name: '每次商业拜访定价', unit: '次', type: 'city' },
  { id: 'commResearch', group: '商业调研', name: '商业信息收集和调研', unit: '次', type: 'city' },
  { id: 'stockResearch', group: '商业拜访', name: '商业库存信息收集', unit: '次', type: 'city' },
  { id: 'pharmacy', group: '药房拜访', name: '药房拜访', unit: '次', type: 'city' },
  { id: 'meeting', group: '会议', name: '科室会议', unit: '场', type: 'meeting' },
  { id: 'inventory', group: '库存信息收集', name: '库存信息收集', unit: '条', type: 'flat' },
  { id: 'report', group: '市场环境分析报告', name: '市场环境分析报告', unit: '份', type: 'flat' },
  { id: 'surveyReport', group: '问卷调研分析报告', name: '问卷调研分析报告', unit: '份', type: 'flat' },
  { id: 'terminalReport', group: '终端产品使用调研', name: '终端产品使用调研', unit: '份', type: 'flat' },

];

// ===== 问卷调查大类种子（计价方案，2026-11-09 预置）=====
// 档位 = 填写对象；id 与 questionnaireStore 预登记的方案 id 对齐（surveyStd / surveyUrgent），
// 问卷页「计价归属」/价目页「关联问卷」开箱即用。问卷调查大类不参与发包标准价（按问卷取价）。
export const SURVEY_GROUP = '问卷调查';
export const SURVEY_TIERS = ['医生', '患者', '商业公司'];
export const SURVEY_SEED_SERVICES: ServiceItem[] = [
  { id: 'surveyStd', group: SURVEY_GROUP, name: '问卷调研', unit: '份', type: 'custom', initialTier: '医生' },
  { id: 'surveyUrgent', group: SURVEY_GROUP, name: '问卷调研-加急', unit: '份', type: 'custom', initialTier: '医生' },
];
/** 对公/对私基价（未乘 scale；品种差异见 seedVendor 的 perProduct 系数） */
export const SURVEY_SEED_PRICES: Record<string, Record<string, [number, number]>> = {
  surveyStd: { 医生: [1000, 800], 患者: [600, 500], 商业公司: [900, 700] },
  surveyUrgent: { 医生: [1500, 1200], 患者: [1000, 800], 商业公司: [1300, 1000] },
};

// ===== 计价方式（价格依据按业务组配置；未启用方式只读保留已填价格） =====
export interface ModeOption { value: string; label: string; view: string }
export const MODE_CONFIG: Record<string, { title: string; services: string[]; options: ModeOption[] }> = {
  hospital: {
    title: '医院拜访', services: ['academic', 'home', 'online', 'research', 'follow', 'third'], options: [
      { value: 'hospital', label: '按医院等级', view: '医院等级价格' },
      { value: 'regional', label: '按城市线级', view: '城市线级价格' },
    ],
  },
  commerce: {
    title: '商业拜访', services: ['commerce', 'stockResearch'], options: [
      { value: 'ordinary', label: '普通金额', view: '普通价格' },
      { value: 'regional', label: '按城市线级', view: '城市线级价格' },
    ],
  },
  commResearch: {
    title: '商业调研', services: ['commResearch'], options: [
      { value: 'ordinary', label: '普通金额', view: '普通价格' },
      { value: 'regional', label: '按城市线级', view: '城市线级价格' },
    ],
  },
  pharmacy: {
    title: '药房拜访', services: ['pharmacy'], options: [
      { value: 'ordinary', label: '普通金额', view: '普通价格' },
      { value: 'regional', label: '按城市线级', view: '城市线级价格' },
    ],
  },
  meeting: {
    title: '会议', services: ['meeting'], options: [
      { value: '医院等级 × 按场次', label: '医院等级 × 按场次', view: '医院等级价格' },
      { value: '区域等级 × 按场次', label: '省份区域等级 × 按场次', view: '省份区域等级价格' },
      { value: '区域等级 × 按人数', label: '省份区域等级 × 按人数', view: '省份区域等级 · 按人数' },
    ],
  },
};

// ===== 数据模型：价格按品种隔离；草稿-发布两态；已发布值用于对照 =====
export interface PriceRow { pub: number | null; priv: number | null; limit: number | null; overPub: number | null; overPriv: number | null }
export const EMPTY_ROW: PriceRow = { pub: null, priv: null, limit: null, overPub: null, overPriv: null };
export type PriceSet = 'base' | 'split';
/** serviceId -> tier -> 价格行 */
export type Book = Record<string, Record<string, PriceRow>>;
/** 品种价目：公私两套价目集（升级版按业务日期二选一读取） */
export type PriceBooks = Record<PriceSet, Book>;
export interface Rules {
  mode: 'unified' | 'split-basic' | 'upgrade';
  cutoff: string | null;
  hospital: string; commerce: string; commResearch: string; pharmacy: string; meeting: string;
}
export interface Snapshot {
  version: number;
  effective: string;
  pricesByProduct: PriceBooks[];
  rules: Rules;
  enabled: Record<string, boolean>;
  /** 每个品种各大类的发包标准价：'serviceId|tier' */
  candidatesByProduct: string[][];
  customServices: ServiceItem[];
  /** 自建档位：serviceId -> 方式 -> tier 列表 */
  extraTiers: Record<string, Record<string, string[]>>;
  archivedTiers: Record<string, string[]>;
  archivedServices: string[];
}
export interface VendorState {
  name: string;
  products: string[];
  published: Snapshot;
  draft: Snapshot | null;
  updatedAtByProduct: string[];
}
export type VendorKey = 'A' | 'B';
export type DB = Record<VendorKey, VendorState>;

// ===== 快照上的派生计算 =====
export const baseTiers = (s: ServiceItem): string[] =>
  s.type === 'hospital' ? [...HOSP, ...HOSP_CITY] : s.type === 'city' ? CITY : s.type === 'meeting' ? MEETING.flatMap(meetingTiers) : [s.initialTier || '标准'];
const extras = (w: Snapshot, s: ServiceItem, mode: string) => w.extraTiers[s.id]?.[mode] ?? [];
export const tiersOf = (s: ServiceItem, w: Snapshot) => [...new Set([...baseTiers(s), ...Object.values(w.extraTiers[s.id] ?? {}).flat()])];
export const isArchived = (w: Snapshot, s: ServiceItem) => w.archivedServices.includes(s.id);
export const modeKey = (s: ServiceItem): string | null =>
  s.type === 'hospital' ? 'hospital' : s.group === '商业调研' ? 'commResearch' : s.type === 'city' ? (s.id === 'pharmacy' ? 'pharmacy' : 'commerce') : s.type === 'meeting' ? 'meeting' : null;
export const activeMode = (s: ServiceItem, w: Snapshot) => {
  const ruleOf = (key: string) => (w.rules as unknown as Record<string, string | null>)[key];
  return s.type === 'hospital' ? (ruleOf('hospital') || 'hospital')
    : s.type === 'city' ? (ruleOf(modeKey(s) ?? '') || 'ordinary')
      : s.type === 'meeting' ? w.rules.meeting : 'standard';
};
const modeBaseTiers = (s: ServiceItem, mode: string): string[] =>
  s.type === 'hospital' ? (mode === 'regional' ? HOSP_CITY : HOSP)
    : s.type === 'city' ? (mode === 'regional' ? CITY.slice(1) : ['普通'])
      : s.type === 'meeting' ? meetingTiers(mode) : [s.initialTier || '标准'];
const activeTiersOf = (s: ServiceItem, w: Snapshot, mode: string, base: string[]) =>
  [...new Set([...base, ...extras(w, s, mode)])].filter((t) => !w.archivedTiers[s.id]?.includes(t));
export const visibleTiers = (s: ServiceItem, w: Snapshot, mode?: string) => {
  const m = mode ?? activeMode(s, w);
  return activeTiersOf(s, w, m, modeBaseTiers(s, m));
};
export const referenceTiers = (s: ServiceItem, w: Snapshot) =>
  s.type === 'hospital' ? visibleTiers(s, w, 'hospital') : s.type === 'city' ? visibleTiers(s, w, 'ordinary') : visibleTiers(s, w);
/** 升级版按业务日期选价目集：达到切换日期读 split，否则 base */
export const activeSet = (w: Snapshot, date: string): PriceSet => (w.rules.mode === 'upgrade' && w.rules.cutoff && date >= w.rules.cutoff ? 'split' : 'base');
export const groupOfKey = (services: ServiceItem[], key: string) => services.find((s) => s.id === key.split('|')[0])?.group;
export const labelKey = (services: ServiceItem[], key: string) => {
  const [id, t] = String(key ?? '').split('|');
  const s = services.find((x) => x.id === id);
  return s ? s.name + ' · ' + (s.type === 'meeting' ? t.replace('｜', ' · ') : t) : key;
};
export const resolved = (w: Snapshot, set: PriceSet, id: string, tier: string, product: number): PriceRow =>
  w.pricesByProduct[product]?.[set]?.[id]?.[tier] ?? EMPTY_ROW;
export const candidateFor = (w: Snapshot, product: number) => w.candidatesByProduct[product] ?? [];
/** 每大类只能有一项发包标准价：替换该大类的候选 */
export const selectGroupCandidate = (d: Snapshot, key: string, product: number, services: ServiceItem[]) => {
  const g = groupOfKey(services, key);
  const choices = d.candidatesByProduct[product];
  const idx = choices.findIndex((old) => groupOfKey(services, old) === g);
  if (idx >= 0) choices.splice(idx, 1, key); else choices.push(key);
};
export const hasOptionalValues = (row?: PriceRow) => !!row && (row.limit != null || row.overPub != null || row.overPriv != null);
export const draftOnlyService = (pub: Snapshot, w: Snapshot, s: ServiceItem) =>
  !!w.customServices.some((x) => x.id === s.id) && !pub.customServices.some((x) => x.id === s.id);
export const draftOnlyTier = (pub: Snapshot, w: Snapshot, s: ServiceItem, tier: string) =>
  Object.values(w.extraTiers[s.id] ?? {}).some((rows) => rows.includes(tier)) && !Object.values(pub.extraTiers[s.id] ?? {}).some((rows) => rows.includes(tier));

// ===== 种子 =====
function makePrices(scale: number): { base: Book; split: Book } {
  const base: Book = {}, split: Book = {};
  BASE_SERVICES.forEach((s, i) => {
    base[s.id] = {}; split[s.id] = {};
    baseTiers(s).forEach((tier, j) => {
      let v = s.type === 'hospital' ? Math.max(160, 500 - i * 28 - j * 35)
        : s.type === 'city' ? Math.max(110, 400 - i * 7 - j * 22)
          : s.id === 'meeting' ? 1800 + j * 250 : s.id === 'report' ? 5000 : s.type === 'flat' ? 300 + i * 30 : 3400;
      if (s.id === 'academic' && tier === '三级甲等') v = 500;
      if (s.id === 'commerce' && tier === '普通') v = 400;
      if (s.id === 'pharmacy' && tier === '普通') v = 250;
      if (s.id === 'report') v = 5000;
      if (s.id === 'surveyReport') v = 3200;
      if (s.id === 'terminalReport') v = 4200;
      const empty = (s.id === 'stockResearch' && tier === '五线') || (s.id === 'online' && tier === '未分级') || (s.id === 'academic' && tier === '城市线级｜五线');
      if (s.type === 'meeting') {
        v = 2000 + (j % 8) * 80 + (j >= 8 ? 180 : 0);
        base[s.id][tier] = { pub: Math.round(v * scale), priv: Math.round(v * scale * 0.8), limit: 20, overPub: Math.round(100 * scale), overPriv: Math.round(80 * scale) };
        split[s.id][tier] = { pub: Math.round(v * scale * 1.12), priv: Math.round(v * scale * 0.9), limit: 20, overPub: Math.round(110 * scale), overPriv: Math.round(88 * scale) };
      } else {
        base[s.id][tier] = { pub: empty ? null : Math.round(v * scale), priv: empty ? null : Math.round(v * scale * 0.18), limit: null, overPub: null, overPriv: null };
        split[s.id][tier] = { pub: empty ? null : Math.round(v * scale * 1.12), priv: empty ? null : Math.round(v * scale * 0.23), limit: null, overPub: null, overPriv: null };
      }
    });
  });
  return { base, split };
}

/** 问卷种子价的品种差异系数：同方案分品种不同价（演示「同名方案允许分品种价格不同」） */
const SURVEY_PRODUCT_FACTOR = [1, 0.9];

function seedVendor(name: string, scale: number, mode: Rules['mode'], products: string[]): VendorState {
  const rules: Rules = {
    mode, cutoff: mode === 'upgrade' ? '2026-11-01' : null,
    hospital: 'hospital', commerce: 'ordinary', commResearch: 'ordinary', pharmacy: 'ordinary', meeting: '医院等级 × 按场次',
  };
  const published: Snapshot = {
    version: 1, effective: '2026-09-01',
    pricesByProduct: [makePrices(scale), makePrices(scale)],
    rules,
    enabled: Object.fromEntries([...BASE_SERVICES, ...SURVEY_SEED_SERVICES].map((s) => [s.id, true])),
    candidatesByProduct: [],
    customServices: SURVEY_SEED_SERVICES.map((s) => ({ ...s })), extraTiers: {}, archivedTiers: {}, archivedServices: [],
  };
  // 问卷调查：三档（医生/患者/商业公司）双套（base/split）价格；首档走 initialTier，其余入 extraTiers；
  // 按品种下标乘差异系数（第 2 个品种 ×0.9），使分品种价差在演示中可见
  for (const s of SURVEY_SEED_SERVICES) {
    published.extraTiers[s.id] = { standard: SURVEY_TIERS.slice(1) };
    published.pricesByProduct.forEach((book, pi) => {
      const f = SURVEY_PRODUCT_FACTOR[pi] ?? 1;
      (['base', 'split'] as PriceSet[]).forEach((st) => {
        book[st][s.id] = {};
        SURVEY_TIERS.forEach((t) => {
          const [pv, xv] = SURVEY_SEED_PRICES[s.id][t];
          book[st][s.id][t] = st === 'base'
            ? { pub: Math.round(pv * scale * f), priv: Math.round(xv * scale * f), limit: null, overPub: null, overPriv: null }
            : { pub: Math.round(pv * scale * 1.12 * f), priv: Math.round(xv * scale * 0.9 * f), limit: null, overPub: null, overPriv: null };
        });
      });
    });
  }
  const seedGroups = CATALOG_CATEGORIES.filter((g) => BASE_SERVICES.some((s) => s.group === g));
  const candidates = seedGroups.map((g) => {
    const s = BASE_SERVICES.find((x) => x.group === g)!;
    return s.id + '|' + referenceTiers(s, published)[0];
  });
  published.candidatesByProduct = [[...candidates], [...candidates]];
  return { name, products, published, draft: null, updatedAtByProduct: products.map(() => published.effective + ' 09:00') };
}
export const SEED: DB = {
  A: seedVendor('百益制药', 1, 'upgrade', ['希刻劳', '泰诺林']),
  B: seedVendor('东方恒业', 0.84, 'split-basic', ['双黄连', '格华止']),
};

// ===== store 机制：模块级状态 + 订阅；rev 自增保证 useSyncExternalStore 快照变化 =====
interface StoreState { db: DB; rev: number }
let state: StoreState = { db: clone(SEED), rev: 0 };
const listeners = new Set<() => void>();

function commit(next: DB) {
  state = { db: next, rev: state.rev + 1 };
  listeners.forEach((l) => l());
}

/** 读当前价目库（问卷/任务侧只读消费） */
export function getDb(): DB {
  return state.db;
}

export function subscribePriceTableStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React 订阅入口：任何价目写入后组件重渲染 */
export function usePriceTableStoreSync(): number {
  return useSyncExternalStore(subscribePriceTableStore, () => state.rev);
}

/** 草稿写入：克隆整库 → 保证 draft 存在 → fn 修改 draft → 刷新品种更新时间 */
export function applyDraft(vendorId: VendorKey, product: number, fn: (draft: Snapshot, v: VendorState) => void) {
  const next = clone(state.db);
  const v = next[vendorId];
  if (!v.draft) v.draft = clone(v.published);
  fn(v.draft, v);
  v.updatedAtByProduct[product] = nowStamp();
  commit(next);
}

/** 整库变更（重置等）：fn 直接改克隆后的 DB */
export function mutateDB(fn: (d: DB) => void) {
  const next = clone(state.db);
  fn(next);
  commit(next);
}

// ===== 问卷/任务侧查询 API =====
/** 全部品种名（两 vendor 品种按序并集；问卷配置的品种宇宙） */
export function allProductNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  Object.values(state.db).forEach((v) => v.products.forEach((p) => {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }));
  return out;
}

/** 问卷计价取价：品种 × 计价方案 × 填写对象档位 → 对公/对私（草稿优先，业务日期选价目集）。
 *  任一环节缺失返回 null（= 未配置），0 是有效配置价。 */
export function surveyPriceOf(product: string, serviceId: string, audience: string): { pub: number | null; priv: number | null } {
  for (const v of Object.values(state.db)) {
    const pi = v.products.indexOf(product);
    if (pi < 0) continue;
    const w = v.draft ?? v.published;
    const row = w.pricesByProduct[pi]?.[activeSet(w, today())]?.[serviceId]?.[audience];
    return { pub: row?.pub ?? null, priv: row?.priv ?? null };
  }
  return { pub: null, priv: null };
}

/** 方案显示名（schemes 登记缺失时回退 id） */
export function serviceNameOf(services: ServiceItem[], id: string): string {
  return services.find((s) => s.id === id)?.name ?? id;
}
