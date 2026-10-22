import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { usePermission } from '../context/PermissionContext';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Tag } from '../components/StatusTag';
import { EmptyState } from '../components/EmptyState';
import type { Role } from '../types';
import { markPriceConfigStarted } from '../components/StartupGuide';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
}

// ===== 视觉 =====
const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px', fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', background: '#fff',
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap',
};
const panelStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8,
};
const numTd: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
const money = (n: number | null | undefined) =>
  '¥' + Number(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nval = (x: unknown): number | null => {
  if (String(x ?? '').trim() === '') return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const formatDate = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const nowStamp = () => formatDate(new Date()) + ' ' + new Date().toTimeString().slice(0, 5);
const today = () => formatDate(new Date());

// ===== 档位体系（医院等级 / 城市线级 / 会议组合） =====
const HOSP = ['三级甲等', '三级乙等', '二级甲等', '二级乙等', '一级', '社区', '民营', '未分级'];
const CITY = ['普通', '一线', '新一线', '二线', '三线', '四线', '五线'];
const HOSP_CITY = CITY.slice(1).map((t) => '城市线级｜' + t);
const MEETING = ['医院等级 × 按场次', '区域等级 × 按场次', '区域等级 × 按人数'];
const MEETING_LEVELS: Record<string, string[]> = {
  '医院等级 × 按场次': ['三甲', '三乙', '三级', '二甲', '二乙', '二级', '一级', '未评级'],
  '区域等级 × 按场次': ['一线区域', '二线区域', '三线区域', '四线区域'],
  '区域等级 × 按人数': ['一线区域', '二线区域', '三线区域', '四线区域'],
};
const meetingTier = (mode: string, level: string) => mode + '｜' + level;
const meetingTiers = (mode: string) => (MEETING_LEVELS[mode] ?? []).map((l) => meetingTier(mode, l));
const meetingLevel = (tier: string) => tier.split('｜').slice(-1)[0];

// 按旧价目表「价目类别」筛选顺序展示；这份目录不意味着每项已有演示价格。
const CATALOG_CATEGORIES = [
  '医院拜访', '商业拜访', '药房拜访', '问卷调查', '会议', '药事报告', '医院信息调研', '科室信息调研', '医生信息调研', '竞品调研',
  '市场容量调研报告', '竞品分析调研报告', '月度推广计划', '问卷调研分析报告', '流向分析报告', '信息反馈', '信息调研', '医学问询', '不良反应监测', '医院协访',
  '流向统计', '区域价格追踪', '库存信息收集', '药房协访', '义诊', '跟台服务', '品种准入', '服务商报告链', '商业调研', '随访',
  '药店调研', '市场环境分析报告', '市场推广策略', '问卷设计', '准入潜力评估', '终端产品使用调研', '政策调研报告',
];

type ServiceType = 'hospital' | 'city' | 'meeting' | 'flat' | 'custom';
interface ServiceItem { id: string; group: string; name: string; unit: string; type: ServiceType; initialTier?: string }
const BASE_SERVICES: ServiceItem[] = [
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

// ===== 计价方式（价格依据按业务组配置；未启用方式只读保留已填价格） =====
interface ModeOption { value: string; label: string; view: string }
const MODE_CONFIG: Record<string, { title: string; services: string[]; options: ModeOption[] }> = {
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
interface PriceRow { pub: number | null; priv: number | null; limit: number | null; overPub: number | null; overPriv: number | null }
const EMPTY_ROW: PriceRow = { pub: null, priv: null, limit: null, overPub: null, overPriv: null };
type PriceSet = 'base' | 'split';
/** serviceId -> tier -> 价格行 */
type Book = Record<string, Record<string, PriceRow>>;
/** 品种价目：公私两套价目集（升级版按业务日期二选一读取） */
type PriceBooks = Record<PriceSet, Book>;
interface Rules {
  mode: 'unified' | 'split-basic' | 'upgrade';
  cutoff: string | null;
  hospital: string; commerce: string; commResearch: string; pharmacy: string; meeting: string;
}
interface Snapshot {
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
interface VendorState {
  name: string;
  products: string[];
  published: Snapshot;
  draft: Snapshot | null;
  updatedAtByProduct: string[];
}
type VendorKey = 'A' | 'B';
type DB = Record<VendorKey, VendorState>;

// ===== 快照上的派生计算 =====
const baseTiers = (s: ServiceItem): string[] =>
  s.type === 'hospital' ? [...HOSP, ...HOSP_CITY] : s.type === 'city' ? CITY : s.type === 'meeting' ? MEETING.flatMap(meetingTiers) : [s.initialTier || '标准'];
const extras = (w: Snapshot, s: ServiceItem, mode: string) => w.extraTiers[s.id]?.[mode] ?? [];
const tiersOf = (s: ServiceItem, w: Snapshot) => [...new Set([...baseTiers(s), ...Object.values(w.extraTiers[s.id] ?? {}).flat()])];
const isArchived = (w: Snapshot, s: ServiceItem) => w.archivedServices.includes(s.id);
const modeKey = (s: ServiceItem): string | null =>
  s.type === 'hospital' ? 'hospital' : s.group === '商业调研' ? 'commResearch' : s.type === 'city' ? (s.id === 'pharmacy' ? 'pharmacy' : 'commerce') : s.type === 'meeting' ? 'meeting' : null;
const activeMode = (s: ServiceItem, w: Snapshot) => {
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
const visibleTiers = (s: ServiceItem, w: Snapshot, mode?: string) => {
  const m = mode ?? activeMode(s, w);
  return activeTiersOf(s, w, m, modeBaseTiers(s, m));
};
const referenceTiers = (s: ServiceItem, w: Snapshot) =>
  s.type === 'hospital' ? visibleTiers(s, w, 'hospital') : s.type === 'city' ? visibleTiers(s, w, 'ordinary') : visibleTiers(s, w);
/** 升级版按业务日期选价目集：达到切换日期读 split，否则 base */
const activeSet = (w: Snapshot, date: string): PriceSet => (w.rules.mode === 'upgrade' && w.rules.cutoff && date >= w.rules.cutoff ? 'split' : 'base');
const groupOfKey = (services: ServiceItem[], key: string) => services.find((s) => s.id === key.split('|')[0])?.group;
const labelKey = (services: ServiceItem[], key: string) => {
  const [id, t] = String(key ?? '').split('|');
  const s = services.find((x) => x.id === id);
  return s ? s.name + ' · ' + (s.type === 'meeting' ? t.replace('｜', ' · ') : t) : key;
};
const resolved = (w: Snapshot, set: PriceSet, id: string, tier: string, product: number): PriceRow =>
  w.pricesByProduct[product]?.[set]?.[id]?.[tier] ?? EMPTY_ROW;
const candidateFor = (w: Snapshot, product: number) => w.candidatesByProduct[product] ?? [];
const referenceValid = (services: ServiceItem[], w: Snapshot, key: string, product: number) => {
  const [id, tier] = String(key ?? '').split('|');
  const s = services.find((x) => x.id === id);
  return !!s && !isArchived(w, s) && !!w.enabled[id] && referenceTiers(s, w).includes(tier);
};
/** 发包标准价的主金额（对公），含不可用原因 */
const candidatePrice = (services: ServiceItem[], w: Snapshot, key: string, product: number): { value: number | null; reason: string } => {
  const [id, tier] = String(key ?? '').split('|');
  if (!referenceValid(services, w, key, product)) return { value: null, reason: '发包标准价目与当前方式不匹配，请重新选择' };
  const row = resolved(w, activeSet(w, today()), id, tier, product);
  return { value: row.pub, reason: row.pub === null ? '所选发包标准价的主金额未配置' : row.pub === 0 ? '发包标准价为 0，不能换算计划数量' : '' };
};
/** 每大类只能有一项发包标准价：替换该大类的候选 */
const selectGroupCandidate = (d: Snapshot, key: string, product: number, services: ServiceItem[]) => {
  const g = groupOfKey(services, key);
  const choices = d.candidatesByProduct[product];
  const idx = choices.findIndex((old) => groupOfKey(services, old) === g);
  if (idx >= 0) choices.splice(idx, 1, key); else choices.push(key);
};
const hasOptionalValues = (row?: PriceRow) => !!row && (row.limit != null || row.overPub != null || row.overPriv != null);
const draftOnlyService = (pub: Snapshot, w: Snapshot, s: ServiceItem) =>
  !!w.customServices.some((x) => x.id === s.id) && !pub.customServices.some((x) => x.id === s.id);
const draftOnlyTier = (pub: Snapshot, w: Snapshot, s: ServiceItem, tier: string) =>
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

function seedVendor(name: string, scale: number, mode: Rules['mode'], products: string[]): VendorState {
  const rules: Rules = {
    mode, cutoff: mode === 'upgrade' ? '2026-11-01' : null,
    hospital: 'hospital', commerce: 'ordinary', commResearch: 'ordinary', pharmacy: 'ordinary', meeting: '医院等级 × 按场次',
  };
  const published: Snapshot = {
    version: 1, effective: '2026-09-01',
    pricesByProduct: [makePrices(scale), makePrices(scale)],
    rules,
    enabled: Object.fromEntries(BASE_SERVICES.map((s) => [s.id, true])),
    candidatesByProduct: [],
    customServices: [], extraTiers: {}, archivedTiers: {}, archivedServices: [],
  };
  const seedGroups = CATALOG_CATEGORIES.filter((g) => BASE_SERVICES.some((s) => s.group === g));
  const candidates = seedGroups.map((g) => {
    const s = BASE_SERVICES.find((x) => x.group === g)!;
    return s.id + '|' + referenceTiers(s, published)[0];
  });
  published.candidatesByProduct = [[...candidates], [...candidates]];
  return { name, products, published, draft: null, updatedAtByProduct: products.map(() => published.effective + ' 09:00') };
}
const SEED: DB = {
  A: seedVendor('百益制药', 1, 'upgrade', ['希刻劳', '泰诺林']),
  B: seedVendor('东方恒业', 0.84, 'split-basic', ['双黄连', '格华止']),
};

type OptionalValues = { limit: number | null; overPub: number | null; overPriv: number | null };

// ===== 价格单元格：空=未配置，0=明确填写 0；下方对照已发布值；非法输入回退 =====
function MoneyCell({ value, published, readOnly, isInt, required, label, toast, onCommit }: {
  value: number | null;
  published: number | null;
  readOnly: boolean;
  isInt?: boolean;
  required?: boolean;
  label: string;
  toast: (title: string, type: ToastMessage['type']) => void;
  onCommit: (n: number | null) => void;
}) {
  const propText = value === null ? '' : String(value);
  const [text, setText] = useState(propText);
  useEffect(() => { setText(propText); }, [propText]);
  if (readOnly) {
    return (
      <td style={numTd}>
        <span style={{ fontWeight: 650, color: '#4A596D' }}>{value === null ? '未配置' : isInt ? value + ' 人' : money(value)}</span>
      </td>
    );
  }
  const commit = () => {
    const raw = text.trim();
    if (raw === propText) return;
    const n = nval(raw);
    if (raw === '') {
      if (required) { toast('对公和对私金额为必填，请输入 0 或正数', 'warning'); setText(propText); return; }
      onCommit(null);
      return;
    }
    if (n === null || (isInt && !Number.isInteger(n))) {
      toast(isInt ? '人数限制只能输入非负整数' : '金额只能输入 0 或正数', 'warning');
      setText(propText);
      return;
    }
    onCommit(n);
  };
  return (
    <td style={numTd}>
      <input
        style={{ ...inputStyle, width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        inputMode={isInt ? 'numeric' : 'decimal'}
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      />
      <div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', marginTop: 2, whiteSpace: 'nowrap' }}>
        已发布 {published === null ? '—' : isInt ? published + ' 人' : money(published)}
      </div>
    </td>
  );
}

// ===== 弹窗：新增价目类别（自建目录项） =====
function AddServiceModal({ group, productName, services, toast, onClose, onCreate }: {
  group: string;
  productName: string;
  services: ServiceItem[];
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onCreate: (v: { name: string; unit: string; first: string; pub: number; priv: number } & OptionalValues) => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('次');
  const [first, setFirst] = useState('');
  const [pub, setPub] = useState('');
  const [priv, setPriv] = useState('');
  const [showOpt, setShowOpt] = useState(false);
  const [limit, setLimit] = useState('');
  const [overPub, setOverPub] = useState('');
  const [overPriv, setOverPriv] = useState('');
  const valid = [name, unit, first].every((x) => x.trim() !== '') && nval(pub) !== null && nval(priv) !== null;
  const readOptional = (): OptionalValues | null => {
    if (limit.trim() && (nval(limit) === null || !Number.isInteger(Number(limit)))) { toast('人数限制须为非负整数', 'warning'); return null; }
    if (overPub.trim() && nval(overPub) === null) { toast('超员金额须为非负数', 'warning'); return null; }
    if (overPriv.trim() && nval(overPriv) === null) { toast('超员金额须为非负数', 'warning'); return null; }
    return { limit: limit.trim() ? nval(limit) : null, overPub: overPub.trim() ? nval(overPub) : null, overPriv: overPriv.trim() ? nval(overPriv) : null };
  };
  const submit = () => {
    if (!name.trim() || !unit.trim() || !first.trim()) { toast('请填写价目类别、首个类别和计量单位', 'warning'); return; }
    if (nval(pub) === null || nval(priv) === null) { toast('请填写有效的对公和对私金额，0 元也可以', 'warning'); return; }
    if (services.some((s) => s.group === group && s.name === name.trim())) { toast('当前业务大类已有同名价目类别', 'warning'); return; }
    const opt = readOptional();
    if (!opt) return;
    onCreate({ name: name.trim(), unit: unit.trim(), first: first.trim(), pub: nval(pub)!, priv: nval(priv)!, ...opt });
  };
  return (
    <Modal open title="新增价目类别" onClose={onClose} width={480}
      footer={<>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!valid} onClick={submit}>确认创建</Button>
      </>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>价目类别 *</span>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例如：医院信息反馈" />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>计量单位 *</span>
            <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={8} placeholder="次、条、场" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>首个类别 *</span>
            <input style={inputStyle} value={first} onChange={(e) => setFirst(e.target.value)} maxLength={30} placeholder="例如：普通" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对公金额 *</span>
            <input style={inputStyle} value={pub} onChange={(e) => setPub(e.target.value)} inputMode="decimal" placeholder="请输入金额" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对私金额 *</span>
            <input style={inputStyle} value={priv} onChange={(e) => setPriv(e.target.value)} inputMode="decimal" placeholder="请输入金额" />
          </label>
        </div>
        <div>
          <button type="button" onClick={() => setShowOpt((s) => !s)} style={{ ...linkBtnStyle, color: '#475467' }}>
            {showOpt ? '收起' : '展开'}人数与超员金额（可选）
          </button>
          {showOpt && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>人数限制（人）</span>
                <input style={inputStyle} value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>超员金额（元／人）</span>
                <input style={inputStyle} value={overPub} onChange={(e) => setOverPub(e.target.value)} inputMode="decimal" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对私超员金额（元／人）</span>
                <input style={inputStyle} value={overPriv} onChange={(e) => setOverPriv(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#98A2B3' }}>当前品种：{productName}。创建后可继续新增类别；价目类别和类别均由用户填写，不需选择计价模板。</p>
      </div>
    </Modal>
  );
}

// ===== 弹窗：新增类别（已有类别下加档位） =====
function AddTierModal({ svc, mode, toast, onClose, onCreate }: {
  svc: ServiceItem;
  mode: string;
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onCreate: (name: string, pub: number, priv: number, opt: OptionalValues) => void;
}) {
  const [name, setName] = useState('');
  const [pub, setPub] = useState('');
  const [priv, setPriv] = useState('');
  const [showOpt, setShowOpt] = useState(false);
  const [limit, setLimit] = useState('');
  const [overPub, setOverPub] = useState('');
  const [overPriv, setOverPriv] = useState('');
  const valid = name.trim() !== '' && nval(pub) !== null && nval(priv) !== null;
  const readOptional = (): OptionalValues | null => {
    if (limit.trim() && (nval(limit) === null || !Number.isInteger(Number(limit)))) { toast('人数限制须为非负整数', 'warning'); return null; }
    if (overPub.trim() && nval(overPub) === null) { toast('超员金额须为非负数', 'warning'); return null; }
    if (overPriv.trim() && nval(overPriv) === null) { toast('超员金额须为非负数', 'warning'); return null; }
    return { limit: limit.trim() ? nval(limit) : null, overPub: overPub.trim() ? nval(overPub) : null, overPriv: overPriv.trim() ? nval(overPriv) : null };
  };
  const submit = () => {
    if (!name.trim()) { toast('请填写类别名称', 'warning'); return; }
    if (nval(pub) === null || nval(priv) === null) { toast('请填写有效的对公和对私金额，0 元也可以', 'warning'); return; }
    const opt = readOptional();
    if (!opt) return;
    onCreate(name.trim(), nval(pub)!, nval(priv)!, opt);
  };
  return (
    <Modal open title="新增类别" onClose={onClose} width={480}
      footer={<>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!valid} onClick={submit}>确认创建</Button>
      </>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>类别名称 *</span>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="例如：三级甲等、20 人以下" />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对公金额 *</span>
            <input style={inputStyle} value={pub} onChange={(e) => setPub(e.target.value)} inputMode="decimal" placeholder="请输入金额" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对私金额 *</span>
            <input style={inputStyle} value={priv} onChange={(e) => setPriv(e.target.value)} inputMode="decimal" placeholder="请输入金额" />
          </label>
        </div>
        <div>
          <button type="button" onClick={() => setShowOpt((s) => !s)} style={{ ...linkBtnStyle, color: '#475467' }}>
            {showOpt ? '收起' : '展开'}人数与超员金额（可选）
          </button>
          {showOpt && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>人数限制（人）</span>
                <input style={inputStyle} value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>超员金额（元／人）</span>
                <input style={inputStyle} value={overPub} onChange={(e) => setOverPub(e.target.value)} inputMode="decimal" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>对私超员金额（元／人）</span>
                <input style={inputStyle} value={overPriv} onChange={(e) => setOverPriv(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#98A2B3' }}>
          只新增“{svc.name}”下的一个类别。保存后会出现在当前价格表；新增类别不会自动改变任务的取价规则。
        </p>
      </div>
    </Modal>
  );
}

// ===== 弹窗：管理价目类别（改名 / 停用 / 恢复 / 草稿删除） =====
function ManageServiceModal({ svc, isCustom, archived, canDelete, toast, onClose, onSaveMeta, onDelete, onArchive, onRestore }: {
  svc: ServiceItem;
  isCustom: boolean;
  archived: boolean;
  canDelete: boolean;
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onSaveMeta: (name: string, unit: string) => void;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [name, setName] = useState(svc.name);
  const [unit, setUnit] = useState(svc.unit);
  const sourceLabel = ({ custom: '用户自定义', hospital: '医院等级', city: '城市线', meeting: '会议档位', flat: '标准价' } as Record<string, string>)[svc.type] ?? '已有价目';
  const saveMeta = () => {
    if (!name.trim() || !unit.trim()) { toast('名称和计量单位不能为空', 'warning'); return; }
    onSaveMeta(name.trim(), unit.trim());
  };
  return (
    <Modal open title="管理价目类别" onClose={onClose} width={480}
      footer={<>
        {canDelete && <Button variant="outline" onClick={onDelete}>删除草稿价目类别</Button>}
        {archived && <Button variant="outline" onClick={onRestore}>恢复使用</Button>}
        {!archived && !canDelete && <Button variant="outline" onClick={onArchive}>停用价目类别</Button>}
        <span style={{ flex: 1 }} />
        <Button variant="outline" onClick={onClose}>取消</Button>
        {isCustom && !archived && <Button variant="primary" onClick={saveMeta}>保存修改</Button>}
      </>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>价目类别名称</span>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} disabled={!isCustom} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>计量单位</span>
            <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={8} disabled={!isCustom} />
          </label>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>类别来源</span>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: '#F7F9FC', color: '#4A596D', fontWeight: 600 }}>{sourceLabel}</div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#98A2B3' }}>
          {canDelete
            ? '尚未发布的自建价目类别可从草稿中删除；若本大类还有其他价目，请先更换发包标准价。'
            : '已发布或系统预置的价目类别只能停用；价格和历史版本保留，可恢复使用。当前发包标准价需先更换。'}
        </p>
      </div>
    </Modal>
  );
}

// ===== 弹窗：设置统一价（覆盖当前方式全部档位） =====
function UniformModal({ svc, viewLabel, tierCount, showOptional, toast, onClose, onApply }: {
  svc: ServiceItem;
  viewLabel: string;
  tierCount: number;
  showOptional: boolean;
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onApply: (values: Record<string, number>) => void;
}) {
  const labels: Record<string, string> = { pub: '对公金额', priv: '对私金额', overPub: '超员金额', overPriv: '对私超员金额' };
  const fields = showOptional ? ['pub', 'priv', 'overPub', 'overPriv'] : ['pub', 'priv'];
  const [vals, setVals] = useState<Record<string, string>>({});
  const submit = () => {
    const values: Record<string, number> = {};
    for (const k of fields) {
      const raw = (vals[k] ?? '').trim();
      if (!raw) continue;
      const n = nval(raw);
      if (n === null) { toast('金额只能输入 0 或正数', 'warning'); return; }
      values[k] = n;
    }
    if (!Object.keys(values).length) { toast('请至少输入一项统一金额', 'warning'); return; }
    onApply(values);
  };
  return (
    <Modal open title="设置统一价" onClose={onClose} width={440}
      footer={<>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={submit}>应用到当前档位</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {fields.map((k) => (
          <label key={k} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>
              {labels[k]}{k.startsWith('over') ? '（元／人）' : `（元／${svc.unit}）`}
            </span>
            <input style={inputStyle} value={vals[k] ?? ''} onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))} inputMode="decimal" placeholder="请输入金额" aria-label={`统一${labels[k]}`} />
          </label>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#98A2B3' }}>
        手动输入金额后，将覆盖“{svc.name} · {viewLabel}”当前 {tierCount} 个档位。留空字段不覆盖；另一种方式、其他分类及品种均不改变。
        {svc.type === 'meeting' && '人数限制保持各档原值。'}
      </p>
    </Modal>
  );
}

// ===== 主页面：列表（一级）→ 品种价目目录（二级）→ 价格维护（二级） =====
export function PriceTableConfig({ addToast, currentRole }: Props) {
  const { can } = usePermission();
  const canEdit = can('price-config', 'edit');
  const toast = (title: string, type: ToastMessage['type'] = 'info') => addToast({ type, title });

  const [db, setDb] = useState<DB>(() => clone(SEED));
  const [view, setView] = useState<'list' | 'catalog' | 'editor'>('list');
  const [vendorId, setVendorId] = useState<VendorKey>('A');
  const [product, setProduct] = useState(0);
  const [serviceId, setServiceId] = useState('academic');
  const [priceView, setPriceView] = useState<string | null>(null);
  const [group, setGroup] = useState('医院拜访');
  const [groupQuery, setGroupQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [optionalVisible, setOptionalVisible] = useState<Record<string, boolean>>({});
  const [highlightTier, setHighlightTier] = useState<string | null>(null);

  // 列表筛选（查询后才生效）
  const [fVendor, setFVendor] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [applied, setApplied] = useState({ vendor: '', product: '', from: '', to: '' });

  // 弹窗与标准价选择态
  const [modal, setModal] = useState<
    | null
    | { kind: 'addService' }
    | { kind: 'addTier' }
    | { kind: 'manageService' }
    | { kind: 'uniform' }
    | { kind: 'standard' }
    | { kind: 'confirmDeleteService' }
    | { kind: 'confirmDeleteTier'; tier: string }
    | { kind: 'confirmArchiveTier'; tier: string }
    | { kind: 'confirmReset' }
  >(null);
  const [standardFilter, setStandardFilter] = useState<string | null>(null);
  const [standardChoice, setStandardChoice] = useState<string | null>(null);
  const closeModal = () => setModal(null);

  // ===== 派生数据 =====
  const vendor = db[vendorId];
  const pub = vendor.published;
  const w = vendor.draft ?? pub;
  const services = useMemo(() => [...BASE_SERVICES, ...w.customServices], [w]);
  const productName = vendor.products[product] ?? '';
  const todayStr = useMemo(() => today(), []);
  const set = activeSet(w, todayStr);
  const svc = services.find((s) => s.id === serviceId) ?? services[0];

  /** 修改都先落到草稿；已发布快照不动，用于对照 */
  const writeDraft = (fn: (draft: Snapshot, v: VendorState) => void) =>
    setDb((prev) => {
      const next = clone(prev);
      const v = next[vendorId];
      if (!v.draft) v.draft = clone(v.published);
      fn(v.draft, v);
      v.updatedAtByProduct[product] = nowStamp();
      markPriceConfigStarted(); // 新手引导：价目板块首次产生配置即完成，标记永不复位
      return next;
    });
  const mutate = (fn: (d: DB) => void) =>
    setDb((prev) => { const next = clone(prev); fn(next); markPriceConfigStarted(); return next; });

  // 新增类别后滚动定位到新档位
  useEffect(() => {
    if (!highlightTier) return;
    const el = document.querySelector(`[data-tier-row="${CSS.escape(highlightTier)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightTier]);

  // ===== 列表页 =====
  const listRows = useMemo(() => (Object.entries(db) as [VendorKey, VendorState][]).flatMap(([vid, v]) =>
    v.products.map((p, pi) => ({
      vid, v, product: pi, productName: p,
      updatedAt: v.updatedAtByProduct[pi] ?? v.published.effective + ' 09:00',
    })),
  ).filter((r) =>
    (!applied.vendor || r.vid === applied.vendor)
    && (!applied.product || r.productName.toLowerCase().includes(applied.product.toLowerCase()))
    && (!applied.from || r.updatedAt.slice(0, 10) >= applied.from)
    && (!applied.to || r.updatedAt.slice(0, 10) <= applied.to),
  ), [db, applied]);

  const applySearch = () => {
    if (fFrom && fTo && fFrom > fTo) { toast('更新时间起不能晚于更新时间止', 'warning'); return; }
    setApplied({ vendor: fVendor, product: fProduct.trim(), from: fFrom, to: fTo });
  };
  const clearSearch = () => { setFVendor(''); setFProduct(''); setFFrom(''); setFTo(''); setApplied({ vendor: '', product: '', from: '', to: '' }); };

  const openProduct = (vid: VendorKey, pi: number) => {
    setVendorId(vid); setProduct(pi);
    setGroup('医院拜访'); setGroupQuery(''); setShowArchived(false);
    setServiceId('academic'); setPriceView(null); setOptionalVisible({}); setHighlightTier(null);
    setView('catalog');
  };

  // ===== 目录页 =====
  const matchQuery = (g: string) => g.toLowerCase().includes(groupQuery.trim().toLowerCase());
  const matchCount = CATALOG_CATEGORIES.filter(matchQuery).length;
  const groupServices = services.filter((s) => s.group === group && (!isArchived(w, s) || showArchived));
  const activeCount = services.filter((s) => s.group === group && !isArchived(w, s)).length;
  const standardKey = candidateFor(w, product).find((k) => groupOfKey(services, k) === group);

  const openEditor = (id: string) => {
    const s = services.find((x) => x.id === id);
    setServiceId(id);
    setPriceView(s ? activeMode(s, w) : null);
    setHighlightTier(null);
    setView('editor');
  };

  // ===== 维护页 =====
  const keyCfg = modeKey(svc) ? MODE_CONFIG[modeKey(svc)!] : undefined;
  const options = keyCfg?.options ?? [];
  const active = activeMode(svc, w);
  const viewMode = options.some((o) => o.value === priceView) ? priceView! : active;
  const viewOption = options.find((o) => o.value === viewMode);
  const readOnly = viewMode !== active || isArchived(w, svc);
  const rs = visibleTiers(svc, w, viewMode);
  const optionalShown = (s: ServiceItem, viewM: string) => {
    const saved = optionalVisible[s.id];
    if (saved !== undefined) return saved;
    if (s.type === 'meeting') return true;
    return visibleTiers(s, w, viewM).some((t) => hasOptionalValues(w.pricesByProduct[product]?.[set]?.[s.id]?.[t]));
  };
  const showOptional = optionalShown(svc, viewMode);
  const oldBook = pub.pricesByProduct[product];
  const oldSet = activeSet(pub, todayStr);
  const selected = candidateFor(w, product).find((k) => groupOfKey(services, k) === svc.group);
  const selectedPrice = selected ? candidatePrice(services, w, selected, product) : null;
  const editLocked = readOnly || !canEdit;

  const commitPrice = (tier: string, field: keyof PriceRow, n: number | null) => {
    writeDraft((d) => {
      const r = d.pricesByProduct[product]?.[set]?.[svc.id]?.[tier];
      if (r) r[field] = n;
    });
  };
  const onCandidateChange = (key: string) => {
    writeDraft((d) => selectGroupCandidate(d, key, product, services));
    toast(groupOfKey(services, key) + '发包标准价已改为 ' + labelKey(services, key), 'success');
  };

  // 新增价目类别
  const createService = (v: { name: string; unit: string; first: string; pub: number; priv: number } & OptionalValues) => {
    const item: ServiceItem = { id: 'user-' + Math.random().toString(36).slice(2, 10), group, name: v.name, unit: v.unit, type: 'custom', initialTier: v.first };
    writeDraft((d) => {
      d.customServices.push(item);
      d.enabled[item.id] = true;
      d.pricesByProduct.forEach((b, pi) => {
        (['base', 'split'] as PriceSet[]).forEach((st) => {
          b[st][item.id] = { [v.first]: { pub: pi === product ? v.pub : null, priv: pi === product ? v.priv : null, limit: pi === product ? v.limit : null, overPub: pi === product ? v.overPub : null, overPriv: pi === product ? v.overPriv : null } };
        });
      });
      d.candidatesByProduct.forEach((keys) => {
        if (!keys.some((k) => groupOfKey(services, k) === item.group)) keys.push(item.id + '|' + v.first);
      });
    });
    if (v.limit !== null || v.overPub !== null || v.overPriv !== null) setOptionalVisible((p) => ({ ...p, [item.id]: true }));
    closeModal();
    setServiceId(item.id);
    setPriceView(null);
    setView('editor');
    toast('价目类别已创建，当前品种价格已填写', 'success');
  };

  // 新增类别（档位）
  const openAddTier = () => {
    const mode = priceView ?? activeMode(svc, w);
    if (mode !== activeMode(svc, w)) { toast('未启用的价格方式不能新增类别', 'warning'); return; }
    setModal({ kind: 'addTier' });
  };
  const createTier = (name: string, pubV: number, privV: number, opt: OptionalValues) => {
    const s = svc;
    const mode = priceView ?? activeMode(s, w);
    const tier = s.type === 'meeting' ? meetingTier(mode, name) : s.type === 'hospital' && mode === 'regional' ? '城市线级｜' + name : name;
    if (tiersOf(s, w).includes(tier)) { toast('当前价目类别中已有同名类别', 'warning'); return; }
    writeDraft((d) => {
      d.extraTiers[s.id] ??= {};
      d.extraTiers[s.id][mode] ??= [];
      d.extraTiers[s.id][mode].push(tier);
      d.pricesByProduct.forEach((b, pi) => {
        (['base', 'split'] as PriceSet[]).forEach((st) => {
          b[st][s.id] ??= {};
          b[st][s.id][tier] = { pub: pi === product ? pubV : null, priv: pi === product ? privV : null, limit: pi === product ? opt.limit : null, overPub: pi === product ? opt.overPub : null, overPriv: pi === product ? opt.overPriv : null };
        });
      });
    });
    if (opt.limit !== null || opt.overPub !== null || opt.overPriv !== null) setOptionalVisible((p) => ({ ...p, [s.id]: true }));
    closeModal();
    setHighlightTier(tier);
    toast('类别已加入当前品种价格表', 'success');
  };

  // 管理价目类别
  const openManageService = (id: string) => { setServiceId(id); setModal({ kind: 'manageService' }); };
  const saveServiceMeta = (name: string, unit: string) => {
    const s = svc;
    if (services.some((x) => x.id !== s.id && x.group === s.group && x.name === name)) { toast('当前业务大类已有同名价目类别', 'warning'); return; }
    writeDraft((d) => {
      const item = d.customServices.find((x) => x.id === s.id);
      if (item) { item.name = name; item.unit = unit; }
    });
    closeModal();
    toast('价目类别已更新', 'success');
  };
  const deleteService = () => {
    const s = svc;
    if (!draftOnlyService(pub, w, s)) { toast('已发布价目类别只能停用', 'warning'); return; }
    const others = services.filter((x) => x.group === s.group && x.id !== s.id && !isArchived(w, x) && w.enabled[x.id]);
    if (others.length && vendor.products.some((_, pi) => candidateFor(w, pi).some((k) => k.startsWith(s.id + '|')))) {
      toast('请先更换本大类发包标准价', 'warning');
      return;
    }
    setModal({ kind: 'confirmDeleteService' });
  };
  const confirmDeleteService = () => {
    const s = svc;
    if (!draftOnlyService(pub, w, s)) return;
    writeDraft((d) => {
      d.customServices = d.customServices.filter((x) => x.id !== s.id);
      delete d.enabled[s.id];
      delete d.extraTiers[s.id];
      delete d.archivedTiers[s.id];
      d.archivedServices = d.archivedServices.filter((id) => id !== s.id);
      d.pricesByProduct.forEach((b) => {
        (['base', 'split'] as PriceSet[]).forEach((st) => { delete b[st][s.id]; });
      });
      d.candidatesByProduct.forEach((keys) => {
        for (let i = keys.length - 1; i >= 0; i--) if (keys[i].startsWith(s.id + '|')) keys.splice(i, 1);
      });
    });
    setOptionalVisible((p) => { const n = { ...p }; delete n[s.id]; return n; });
    closeModal();
    setGroup(s.group);
    setView('catalog');
    toast('草稿价目类别已删除', 'success');
  };
  const archiveService = () => {
    const s = svc;
    if (vendor.products.some((_, pi) => candidateFor(w, pi).some((k) => k.startsWith(s.id + '|')))) {
      toast('请先更换本大类发包标准价', 'warning');
      return;
    }
    writeDraft((d) => {
      if (!d.archivedServices.includes(s.id)) d.archivedServices.push(s.id);
      d.enabled[s.id] = false;
    });
    closeModal();
    setGroup(s.group);
    setView('catalog');
    toast('价目类别已停用，历史价格保留', 'success');
  };
  const restoreService = () => {
    writeDraft((d) => {
      d.archivedServices = d.archivedServices.filter((id) => id !== svc.id);
      d.enabled[svc.id] = true;
    });
    closeModal();
    toast('价目类别已恢复', 'success');
  };

  // 类别（档位）停用 / 恢复 / 删除
  const archiveTier = (tier: string) => {
    const s = svc;
    if (draftOnlyService(pub, w, s) && tier === s.initialTier) { deleteService(); return; }
    if (vendor.products.some((_, pi) => candidateFor(w, pi).includes(s.id + '|' + tier))) { toast('请先更换本大类发包标准价', 'warning'); return; }
    if (visibleTiers(s, w).length <= 1) { toast('至少保留一个可用类别', 'warning'); return; }
    if (draftOnlyTier(pub, w, s, tier)) { setModal({ kind: 'confirmDeleteTier', tier }); return; }
    setModal({ kind: 'confirmArchiveTier', tier });
  };
  const confirmDeleteTier = (tier: string) => {
    const s = svc;
    if (!draftOnlyTier(pub, w, s, tier)) return;
    if (vendor.products.some((_, pi) => candidateFor(w, pi).includes(s.id + '|' + tier))) { toast('请先更换本大类发包标准价', 'warning'); return; }
    writeDraft((d) => {
      Object.keys(d.extraTiers[s.id] ?? {}).forEach((mode) => {
        d.extraTiers[s.id][mode] = d.extraTiers[s.id][mode].filter((t) => t !== tier);
        if (!d.extraTiers[s.id][mode].length) delete d.extraTiers[s.id][mode];
      });
      if (!Object.keys(d.extraTiers[s.id] ?? {}).length) delete d.extraTiers[s.id];
      d.pricesByProduct.forEach((b) => {
        (['base', 'split'] as PriceSet[]).forEach((st) => { if (b[st][s.id]) delete b[st][s.id][tier]; });
      });
      d.archivedTiers[s.id] = (d.archivedTiers[s.id] ?? []).filter((t) => t !== tier);
      if (!d.archivedTiers[s.id].length) delete d.archivedTiers[s.id];
    });
    closeModal();
    toast('草稿类别已删除', 'success');
  };
  const confirmArchiveTier = (tier: string) => {
    const s = svc;
    writeDraft((d) => {
      d.archivedTiers[s.id] ??= [];
      if (!d.archivedTiers[s.id].includes(tier)) d.archivedTiers[s.id].push(tier);
    });
    closeModal();
    toast('类别已停用', 'success');
  };
  const restoreTier = (tier: string) => {
    const s = svc;
    writeDraft((d) => {
      d.archivedTiers[s.id] = (d.archivedTiers[s.id] ?? []).filter((x) => x !== tier);
    });
    toast('类别已恢复', 'success');
  };

  // 设置统一价
  const applyUniform = (values: Record<string, number>) => {
    const s = svc;
    const viewNow = priceView ?? activeMode(s, w);
    if (viewNow !== activeMode(s, w)) { toast('未启用视图只能查看', 'warning'); return; }
    const tiersHere = visibleTiers(s, w);
    const rows = w.pricesByProduct[product]?.[set]?.[s.id];
    const changes = tiersHere.reduce((c, t) => c + Object.keys(values).filter((k) => (rows?.[t]?.[k as keyof PriceRow] ?? null) !== values[k]).length, 0);
    if (!changes) { closeModal(); toast('全部档位已是输入的统一金额', 'info'); return; }
    writeDraft((d) => {
      const r = d.pricesByProduct[product][set][s.id];
      tiersHere.forEach((t) => Object.entries(values).forEach(([k, v]) => { r[t][k as keyof PriceRow] = v; }));
    });
    closeModal();
    toast('已将统一金额应用到当前业务全部档位', 'success');
  };

  // 发包标准价
  const standardGroupServices = services.filter((s) => s.group === svc.group && w.enabled[s.id] && !isArchived(w, s));
  const standardFilterSvc = services.find((s) => s.id === standardFilter) ?? standardGroupServices[0];
  const openStandard = () => {
    if (!standardGroupServices.length) { toast('本大类没有已开展的分类', 'warning'); return; }
    const sel = candidateFor(w, product).find((k) => groupOfKey(services, k) === svc.group);
    const initFilter = standardGroupServices.some((s) => s.id === standardFilter)
      ? standardFilter!
      : standardGroupServices.find((s) => s.id === sel?.split('|')[0])?.id ?? standardGroupServices[0].id;
    setStandardFilter(initFilter);
    setStandardChoice(sel ?? null);
    setModal({ kind: 'standard' });
  };
  const applyStandard = () => {
    const key = standardChoice;
    if (!key || !referenceValid(services, w, key, product) || groupOfKey(services, key) !== svc.group) {
      toast('请选择当前业务大类中的一项价目', 'warning');
      return;
    }
    writeDraft((d) => selectGroupCandidate(d, key, product, services));
    closeModal();
    toast('发包标准价已更新为 ' + labelKey(services, key), 'success');
  };

  // 重置本品种价目（恢复系统默认价目）
  const resetProduct = () => {
    mutate((d) => {
      const v = d[vendorId];
      v.draft = null;
      v.published.pricesByProduct[product] = clone(SEED[vendorId].published.pricesByProduct[product]);
      v.published.candidatesByProduct[product] = clone(SEED[vendorId].published.candidatesByProduct[product]);
      v.updatedAtByProduct[product] = nowStamp();
    });
    setGroup('医院拜访'); setServiceId('academic'); setPriceView(null); setHighlightTier(null); setShowArchived(false);
    setView('catalog');
    toast(productName + '的价目已重置为系统默认', 'success');
  };

  const draftTag = vendor.draft ? <Tag label="草稿未发布" color="warning" /> : null;

  // 弹窗层：三个视图共用（列表/目录/维护都可能触发）
  const modalLayer = (
    <>
      {modal?.kind === 'addService' && (
        <AddServiceModal group={group} productName={productName} services={services} toast={toast} onClose={closeModal} onCreate={createService} />
      )}
      {modal?.kind === 'addTier' && (
        <AddTierModal svc={svc} mode={priceView ?? activeMode(svc, w)} toast={toast} onClose={closeModal} onCreate={createTier} />
      )}
      {modal?.kind === 'manageService' && (
        <ManageServiceModal key={svc.id} svc={svc}
          isCustom={!!w.customServices.some((x) => x.id === svc.id)}
          archived={isArchived(w, svc)}
          canDelete={draftOnlyService(pub, w, svc)}
          toast={toast} onClose={closeModal}
          onSaveMeta={saveServiceMeta} onDelete={deleteService} onArchive={archiveService} onRestore={restoreService} />
      )}
      {modal?.kind === 'uniform' && (
        <UniformModal svc={svc} viewLabel={viewOption?.view ?? '当前价目'} tierCount={rs.length} showOptional={showOptional}
          toast={toast} onClose={closeModal} onApply={applyUniform} />
      )}
      {modal?.kind === 'standard' && (
        <Modal open title={`更换${svc.group}发包标准价`} onClose={closeModal} width={560}
          footer={<>
            <Button variant="outline" onClick={closeModal}>取消</Button>
            <Button variant="primary" onClick={applyStandard}>确认选择</Button>
          </>}>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-12)', color: '#667085' }}>在本大类中只能选一项分类价目。任务计划读取被选行的主金额；执行档位价格另按当前计价方式决定。</p>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 }}>业务分类</span>
            <select style={{ ...inputStyle }} value={standardFilterSvc?.id ?? ''} onChange={(e) => setStandardFilter(e.target.value)}>
              {standardGroupServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, marginTop: 10 }}>
            {(standardFilterSvc ? referenceTiers(standardFilterSvc, w) : []).map((t) => {
              const k = standardFilterSvc!.id + '|' + t;
              const row = resolved(w, set, standardFilterSvc!.id, t, product);
              return (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: standardChoice === k ? 'var(--color-brand-subtle)' : undefined }}>
                  <input type="radio" name="standard-choice" checked={standardChoice === k} onChange={() => setStandardChoice(k)} />
                  <span style={{ display: 'grid', gap: 2 }}>
                    <strong style={{ fontSize: 'var(--fs-13)' }}>{meetingLevel(t)}</strong>
                    <small style={{ color: '#667085', fontSize: 'var(--fs-11)' }}>
                      主金额 {row.pub === null ? '未配置' : money(row.pub)}/{standardFilterSvc!.unit}{selected === k ? ' · 当前标准价' : ''}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-12)', color: '#98A2B3' }}>切换业务分类后仍只保留一个选择。更换标准价不会改变发包比例。</p>
        </Modal>
      )}

      <ConfirmDialog open={modal?.kind === 'confirmDeleteService'} title="删除草稿价目类别" variant="warning"
        description={`将从草稿中删除“${svc.name}”及其全部类别价格。该操作不影响已发布版本；若这是本大类唯一价目，其发包选择也会移除。`}
        confirmLabel="确认删除" onCancel={closeModal} onConfirm={confirmDeleteService} />
      <ConfirmDialog open={modal?.kind === 'confirmDeleteTier'} title="删除草稿类别" variant="warning"
        description={`将从草稿中删除“${meetingLevel((modal as { tier: string })?.tier ?? '')}”及各品种对应价格，已发布版本不受影响。`}
        confirmLabel="确认删除" onCancel={closeModal} onConfirm={() => confirmDeleteTier((modal as { tier: string }).tier)} />
      <ConfirmDialog open={modal?.kind === 'confirmArchiveTier'} title="停用类别" variant="warning"
        description={`将停用“${meetingLevel((modal as { tier: string })?.tier ?? '')}”。历史价格保留，当前矩阵和发包候选中不再展示，之后可恢复。`}
        confirmLabel="确认停用" onCancel={closeModal} onConfirm={() => confirmArchiveTier((modal as { tier: string }).tier)} />
      <ConfirmDialog open={modal?.kind === 'confirmReset'} title={`重置${productName}价目`} variant="warning"
        description={`即将清空该品种已配置的价目，恢复为系统默认价目：现有价格将全部丢失，无法恢复；之后发起的发包、各业务填报、打绩效将按默认价目计算。如仅需调整个别价格，可直接在价目表中修改并保存。确定要重置吗？（本页为原型演示，仅重置本地演示数据）`}
        confirmLabel="确认重置" onCancel={closeModal} onConfirm={resetProduct} />
    </>
  );

  // ===== 渲染：列表页（一级） =====
  if (view === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader title="价目表配置" description="按品种查看当前价目；每个品种单独维护。" />
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...panelStyle, padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-11)', color: '#657388', fontWeight: 600 }}>药厂</span>
              <select style={{ ...inputStyle, width: 180 }} value={fVendor} onChange={(e) => setFVendor(e.target.value)}>
                <option value="">全部药厂</option>
                {(Object.entries(db) as [VendorKey, VendorState][]).map(([vid, v]) => (
                  <option key={vid} value={vid}>{v.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-11)', color: '#657388', fontWeight: 600 }}>包含品种名称</span>
              <input style={{ ...inputStyle, width: 200 }} value={fProduct} onChange={(e) => setFProduct(e.target.value)}
                placeholder="输入品种名称" autoComplete="off"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applySearch(); } }} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-11)', color: '#657388', fontWeight: 600 }}>更新时间起</span>
              <input type="date" style={{ ...inputStyle, width: 150 }} value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-11)', color: '#657388', fontWeight: 600 }}>更新时间止</span>
              <input type="date" style={{ ...inputStyle, width: 150 }} value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" onClick={applySearch}>查询</Button>
              <Button variant="outline" size="sm" onClick={clearSearch}>重置筛选</Button>
            </div>
          </div>

          <div style={{ ...panelStyle, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>{['序号', '价目表类型', '包含品种名称', '更新时间', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {listRows.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState title="没有符合筛选条件的品种" description="调整筛选条件后重试。" /></td></tr>
                ) : listRows.map((r, i) => (
                  <tr key={r.vid + r.product}>
                    <td style={{ ...td, color: '#98A2B3' }}>{i + 1}</td>
                    <td style={td}>品种价目表</td>
                    <td style={td}><strong>{r.productName}</strong></td>
                    <td style={td}>{r.updatedAt}</td>
                    <td style={td}>
                      <button type="button" style={linkBtnStyle} onClick={() => openProduct(r.vid, r.product)} aria-label={`编辑${r.productName}价目`}>编辑价目</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 'var(--fs-12)', color: '#98A2B3' }}>共 {listRows.length} 个品种</div>
        </div>
        {modalLayer}
      </div>
    );
  }

  // ===== 渲染：目录页（二级） =====
  if (view === 'catalog') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader title={`价目表 · ${productName}`}
          description={`当前品种：${productName}。按业务大类管理价目类别；类别和金额在详情中维护。`}
          actions={<>
            {draftTag}
            {canEdit && <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'confirmReset' })}>重置本品种价目</Button>}
            <Button variant="outline" size="sm" onClick={() => setView('list')}>返回列表</Button>
          </>} />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ ...panelStyle, padding: '12px 15px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 'var(--fs-15)', fontWeight: 650 }}>{group}</strong>
              <span style={{ fontSize: 'var(--fs-12)', color: '#667085', marginLeft: 8 }}>{activeCount} 个价目类别</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#667085', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />显示已停用
              </label>
              {canEdit && <Button variant="primary" size="sm" onClick={() => setModal({ kind: 'addService' })}>新增价目类别</Button>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
            {/* 左栏：业务大类导航 */}
            <div style={{ ...panelStyle, padding: 6, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '6px 6px 9px', borderBottom: '1px solid var(--color-border)' }}>
                <input style={{ ...inputStyle, height: 32, fontSize: 'var(--fs-12)' }} type="search" value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setGroupQuery(''); }}
                  placeholder="搜索业务大类" aria-label="搜索业务大类" autoComplete="off" />
                <div style={{ color: '#98A2B3', fontSize: 'var(--fs-11)', padding: '6px 3px 0' }}>匹配 {matchCount} / {CATALOG_CATEGORIES.length} 类</div>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {CATALOG_CATEGORIES.map((g) => matchQuery(g) && (
                  <button key={g} type="button" onClick={() => setGroup(g)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: 0, background: g === group ? 'var(--color-brand-subtle)' : 'transparent', padding: '8px 10px', borderRadius: 6, color: g === group ? 'var(--color-brand)' : '#637186', fontSize: 'var(--fs-12)', textAlign: 'left', cursor: 'pointer', fontWeight: g === group ? 650 : 400 }}>
                    {g}
                  </button>
                ))}
                {matchCount === 0 && <div style={{ padding: 16, color: '#98A2B3', fontSize: 'var(--fs-11)', textAlign: 'center' }}>没有匹配的业务大类</div>}
              </div>
            </div>

            {/* 右栏：当前大类价目列表 */}
            <div style={{ ...panelStyle, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr>{['业务项目', '代表档位', '对公价格', '对私价格', '操作'].map((h, i) => <th key={h} style={i >= 2 && i <= 3 ? { ...th, textAlign: 'right' } : th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#F5F7FB' }}>
                    <td colSpan={5} style={{ ...td, background: '#F5F7FB', borderBottom: '1px solid var(--color-border)' }}>
                      <b style={{ fontSize: 'var(--fs-12)' }}>{group}</b>
                      <span style={{ fontSize: 'var(--fs-11)', color: '#8090A3', marginLeft: 9 }}>
                        {groupServices.length ? groupServices.length + ' 个价目类别' : '尚未创建价目类别'}
                      </span>
                    </td>
                  </tr>
                  {groupServices.length === 0 ? (
                    <tr><td colSpan={5} style={{ ...td, color: '#8592A1' }}>当前大类尚无价目类别。点击上方“新增价目类别”，可自行建立项目和类别价格。</td></tr>
                  ) : groupServices.map((s) => {
                    const isStandard = standardKey?.split('|')[0] === s.id;
                    const tier = (isStandard && standardKey ? standardKey.split('|')[1] : visibleTiers(s, w)[0]) ?? '';
                    const rowNow = resolved(w, set, s.id, tier, product);
                    const isCustom = !!w.customServices.some((x) => x.id === s.id);
                    return (
                      <tr key={s.id} style={isStandard ? { background: 'var(--color-brand-subtle)' } : undefined}>
                        <td style={td}>
                          <span style={{ fontWeight: 650 }}>{s.name}</span>
                          {isStandard && <Tag label="本大类发包标准价" color="brand" />}
                        </td>
                        <td style={td}>{meetingLevel(tier)}</td>
                        <td style={numTd}><strong>{rowNow.pub === null ? '—' : money(rowNow.pub)}</strong></td>
                        <td style={numTd}><strong>{rowNow.priv === null ? '—' : money(rowNow.priv)}</strong></td>
                        <td style={td}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                            <button type="button" style={linkBtnStyle} onClick={() => openEditor(s.id)} aria-label={`维护${s.name}价格`}>维护价格</button>
                            {canEdit && <button type="button" style={linkBtnStyle} onClick={() => { openEditor(s.id); setModal({ kind: 'addTier' }); }} aria-label={`给${s.name}新增类别`}>新增类别</button>}
                            {isCustom && canEdit && <button type="button" style={linkBtnStyle} onClick={() => openManageService(s.id)} aria-label={`管理${s.name}价目类别`}>编辑类别</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {modalLayer}
      </div>
    );
  }

  // ===== 渲染：价格维护页（二级） =====
  const tierActionLabel = (t: string) =>
    draftOnlyService(pub, w, svc) && t === svc.initialTier ? '删除价目类别'
      : draftOnlyTier(pub, w, svc, t) ? '删除' : '停用';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title={svc.name} description={`当前品种：${productName} / ${svc.group} / 价格维护`}
        actions={<>
          {draftTag}
          <Button variant="outline" size="sm" onClick={() => setView('catalog')}>返回价目表</Button>
        </>} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 发包标准价 */}
        <div style={{ ...panelStyle, background: '#F9FBFF', borderColor: '#D9E4F8', padding: '15px 17px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-13)', fontWeight: 650 }}>{svc.group} · 发包标准价</h3>
            <Button variant="outline" size="sm" onClick={openStandard}>更换标准价</Button>
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', marginTop: 6 }}>
            <strong>{selected ? labelKey(services, selected) : '尚未选择'}</strong>
            <span style={{ color: '#667085' }}>
              {' '}· 主金额 {selectedPrice && selectedPrice.value !== null ? money(selectedPrice.value) : '待配置'}/{selected ? services.find((x) => x.id === selected.split('|')[0])?.unit || svc.unit : svc.unit}
            </span>
            {selectedPrice?.reason && <Tag label="标准价待处理" color="warning" />}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--fs-12)', color: '#667085' }}>本大类只选一项价目用于任务金额和计划数量；下方矩阵用于当前方式的执行取价。</p>
        </div>

        {/* 计价方式视图切换 */}
        {options.length > 1 && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }} aria-label="查看价格方式">
            {options.map((o) => {
              const current = o.value === viewMode;
              const isActive = active === o.value;
              return (
                <button key={o.value} type="button" aria-pressed={current} onClick={() => setPriceView(o.value)}
                  style={{ border: 'none', borderBottom: current ? '2px solid var(--color-brand)' : '2px solid transparent', background: '#fff', padding: '10px 13px', color: current ? (isActive ? 'var(--color-brand)' : '#43536A') : '#6D7888', borderBottomColor: current ? (isActive ? 'var(--color-brand)' : '#758298') : 'transparent', fontSize: 'var(--fs-12)', fontWeight: 650, cursor: 'pointer', marginBottom: -1 }}>
                  {o.view} · {isActive ? '当前使用' : '未启用 · 只读'}
                </button>
              );
            })}
          </div>
        )}
        {readOnly && (
          <div style={{ background: '#F4F7FF', borderLeft: '3px solid #2458D3', padding: '12px 15px', fontSize: 'var(--fs-12)', color: '#47566D' }}>
            <strong style={{ color: 'var(--color-text-1)' }}>{viewOption?.view ?? '非当前价格'}未启用，仅供查看。</strong>
            当前计价不读取这组价格；已填价格保留，不会自动复制到另一种方式。
          </div>
        )}
        {svc.type === 'meeting' && viewMode === '区域等级 × 按人数' && (
          <div style={{ background: '#FFF7E8', borderLeft: '3px solid #DCAA57', padding: '12px 15px', fontSize: 'var(--fs-12)', color: '#785A27' }}>
            “区域等级 × 按人数”与早期资料的组合限制存在冲突，保留为待核验演示状态。
          </div>
        )}

        {/* 档位矩阵 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 650 }}>类别价格 · {viewOption?.view ?? '当前价目'}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-12)', color: '#657388' }}>单位：元/{svc.unit} · 空值为未配置，0 为明确填写 0</span>
              <Button variant="outline" size="sm" aria-expanded={showOptional}
                onClick={() => setOptionalVisible((p) => ({ ...p, [svc.id]: !optionalShown(svc, viewMode) }))}>
                {showOptional ? '收起可选字段' : '显示可选字段（3）'}
              </Button>
              {editLocked || (
                <>
                  <Button variant="outline" size="sm" onClick={openAddTier}>新增类别</Button>
                  <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'uniform' })}>设置统一价</Button>
                </>
              )}
            </div>
          </div>
          <div style={{ ...panelStyle, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>类别</th>
                  <th style={{ ...th, textAlign: 'right' }}>对公金额 *</th>
                  <th style={{ ...th, textAlign: 'right' }}>对私金额 *</th>
                  {showOptional && <>
                    <th style={{ ...th, textAlign: 'right' }}>人数限制（人）</th>
                    <th style={{ ...th, textAlign: 'right' }}>超员金额（元／人）</th>
                    <th style={{ ...th, textAlign: 'right' }}>对私超员金额（元／人）</th>
                  </>}
                  <th style={th}>是否为发包金额</th>
                  <th style={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((t) => {
                  const cur = w.pricesByProduct[product]?.[set]?.[svc.id]?.[t] ?? EMPTY_ROW;
                  const old = oldBook?.[oldSet]?.[svc.id]?.[t] ?? EMPTY_ROW;
                  const key = svc.id + '|' + t;
                  const canStandard = !editLocked && referenceTiers(svc, w).includes(t);
                  return (
                    <tr key={t} data-tier-row={t} style={highlightTier === t ? { background: '#F0F6FF' } : undefined}>
                      <td style={td}><strong>{meetingLevel(t)}</strong></td>
                      <MoneyCell value={cur.pub} published={old.pub} readOnly={editLocked} required label={`${meetingLevel(t)} 对公金额`} toast={toast}
                        onCommit={(n) => commitPrice(t, 'pub', n)} />
                      <MoneyCell value={cur.priv} published={old.priv} readOnly={editLocked} required label={`${meetingLevel(t)} 对私金额`} toast={toast}
                        onCommit={(n) => commitPrice(t, 'priv', n)} />
                      {showOptional && <>
                        <MoneyCell value={cur.limit} published={old.limit} readOnly={editLocked} isInt label={`${meetingLevel(t)} 人数限制`} toast={toast}
                          onCommit={(n) => commitPrice(t, 'limit', n)} />
                        <MoneyCell value={cur.overPub} published={old.overPub} readOnly={editLocked} label={`${meetingLevel(t)} 超员金额`} toast={toast}
                          onCommit={(n) => commitPrice(t, 'overPub', n)} />
                        <MoneyCell value={cur.overPriv} published={old.overPriv} readOnly={editLocked} label={`${meetingLevel(t)} 对私超员金额`} toast={toast}
                          onCommit={(n) => commitPrice(t, 'overPriv', n)} />
                      </>}
                      <td style={td}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 'var(--fs-12)', color: selected === key ? 'var(--color-brand)' : '#657388', fontWeight: selected === key ? 700 : 400, cursor: canStandard ? 'pointer' : 'not-allowed', opacity: canStandard ? 1 : 0.6 }}>
                          <input type="radio" name="group-standard" checked={selected === key} disabled={!canStandard} onChange={() => onCandidateChange(key)} />
                          {selected === key ? '当前选用' : '设为发包价'}
                        </label>
                      </td>
                      <td style={td}>
                        {editLocked
                          ? <span style={{ fontSize: 'var(--fs-11)', color: '#98A2B3' }}>只读</span>
                          : <button type="button" onClick={() => archiveTier(t)} style={{ ...linkBtnStyle, color: '#BD4947' }}>{tierActionLabel(t)}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(w.archivedTiers[svc.id]?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '12px 0', color: '#667085', fontSize: 'var(--fs-12)' }}>
              <strong>已停用类别</strong>
              {w.archivedTiers[svc.id].map((t) => (
                <span key={t} style={{ border: '1px solid var(--color-border)', padding: '5px 8px', borderRadius: 6, background: '#F7F9FC' }}>
                  {meetingLevel(t)} <button type="button" style={linkBtnStyle} onClick={() => restoreTier(t)}>恢复</button>
                </span>
              ))}
            </div>
          )}
          {viewMode === 'regional' && svc.type === 'city' && (
            <p style={{ fontSize: 'var(--fs-12)', color: '#98A2B3', marginTop: 10, lineHeight: 1.6 }}>
              已划分城市线级但该档缺价时，不自动使用普通金额；只有未划分线级的城市才可能沿用普通金额，真实结算规则以业务样本核验。
            </p>
          )}
          {viewMode === 'regional' && svc.type === 'hospital' && (
            <p style={{ fontSize: 'var(--fs-12)', color: '#98A2B3', marginTop: 10, lineHeight: 1.6 }}>
              医院拜访城市线级为新版目标设计。旧表可能存在“医院等级 × 城市线级”双维价格，真实迁移前需逐项核验。
            </p>
          )}
          <p style={{ fontSize: 'var(--fs-12)', color: '#98A2B3', marginTop: 10, lineHeight: 1.6 }}>
            {editLocked ? '这里只读展示保留价格。' : '修改仅形成草稿，已发布价格在新版本发布前保持不变。'}
            {svc.type === 'meeting' && ' 会议人数与超员字段仅用于配置评审，不计算真实结算金额。'}
          </p>
        </div>
      </div>

      {modalLayer}
    </div>
  );
}
