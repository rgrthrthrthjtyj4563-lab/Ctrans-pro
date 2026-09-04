import { Fragment, useMemo, useState } from 'react';
import { Link2, Copy, Unlink, RefreshCw, Download, Upload, Repeat2, Building2, Table2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Tag } from '../components/StatusTag';
import { EmptyState } from '../components/EmptyState';
import type { Role } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

// ===== 视觉 =====
const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px', fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontFamily: 'inherit', textAlign: 'left',
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ===== 品种（列表 = 品种 × 药厂 × 绑定价目表） =====
interface Variety {
  id: string;
  commonName: string;
  tradeName: string;
  holder: string; // 药厂名称
}
const VARIETIES: Variety[] = [
  { id: 'V-001', commonName: '头孢克洛干混悬剂', tradeName: '希刻劳', holder: '长安药厂' },
  { id: 'V-002', commonName: '对乙酰氨基酚', tradeName: '泰诺林', holder: '长安药厂' },
  { id: 'V-003', commonName: '感冒灵颗粒', tradeName: '999感冒灵', holder: '测试药企名称' },
  { id: 'V-004', commonName: '小儿肺热清颗粒', tradeName: '小儿肺热清', holder: '大连美罗中药厂有限公司' },
  { id: 'V-005', commonName: '双黄连口服液', tradeName: '双黄连', holder: '大连美罗中药厂有限公司' },
  { id: 'V-006', commonName: '左甲状腺素钠片', tradeName: '优甲乐', holder: '程秋明测试药厂' },
  { id: 'V-007', commonName: '盐酸二甲双胍片', tradeName: '格华止', holder: '程秋明测试药厂' },
];

const TEMPLATES = ['标准推广价目表 2026', '公私分离价目表 2026', '报告价目表 2026'];

/** 绑定状态：inherit=继承药厂默认；template=绑定某模板（共享同步）；own=品种自有副本（独立定制） */
type BindMode = 'inherit' | 'template' | 'own';
interface Binding {
  mode: BindMode;
  tableName?: string; // template / own 时的表名
}
const seedBindings = (): Record<string, Binding> => ({
  'V-001': { mode: 'inherit' },
  'V-002': { mode: 'inherit' },
  'V-003': { mode: 'template', tableName: '标准推广价目表 2026' },
  'V-004': { mode: 'own', tableName: '小儿肺热清 定制品' },
  'V-005': { mode: 'own', tableName: '双黄连 定制品' },
  'V-006': { mode: 'inherit' },
  'V-007': { mode: 'template', tableName: '报告价目表 2026' },
});

const BIND_LABEL: Record<BindMode, string> = {
  inherit: '继承自药厂',
  template: '模板绑定',
  own: '品种自有副本',
};
const BIND_COLOR: Record<BindMode, 'default' | 'info' | 'brand'> = {
  inherit: 'default',
  template: 'info',
  own: 'brand',
};

// ===== 价目数据模型（一张表四个价格区） =====
const HOSPITAL_LEVELS = ['三级甲等', '三级乙等', '二级甲等', '二级乙等', '一级', '社区', '民营', '未分级'];
const REGION_PUBLIC_FIELDS = [
  { prop: 'line1', label: '一线' }, { prop: 'lineNew1', label: '新一线' }, { prop: 'line2', label: '二线' },
  { prop: 'line3', label: '三线' }, { prop: 'line4', label: '四线' }, { prop: 'line5', label: '五线' },
] as const;
const REGION_PRIVATE_FIELDS = [
  { prop: 'privateLine1', label: '对私一线' }, { prop: 'privateLineNew1', label: '对私新一线' }, { prop: 'privateLine2', label: '对私二线' },
  { prop: 'privateLine3', label: '对私三线' }, { prop: 'privateLine4', label: '对私四线' }, { prop: 'privateLine5', label: '对私五线' },
] as const;

interface Leaf {
  name: string;
  price: string;
  privatePrice: string;
  groupNo: string;
  isContract: boolean;
  source: string;
  limit: string;
  overPrice: string;
  privateOverPrice: string;
  line1: string; lineNew1: string; line2: string; line3: string; line4: string; line5: string;
  privateLine1: string; privateLineNew1: string; privateLine2: string; privateLine3: string; privateLine4: string; privateLine5: string;
}
interface PriceRow {
  id: number;
  cat2: string;
  hasLevels: boolean;
  expanded: boolean;
  groupNo: string;
  isMeeting: boolean;
  levels: Leaf[];
}
interface Group {
  cat1: string;
  rows: PriceRow[];
}

function makeLeaf(name: string, price: string, privatePrice: string, source: string, groupNo: string): Leaf {
  return {
    name, price, privatePrice, groupNo, isContract: false, source,
    limit: '', overPrice: '', privateOverPrice: '',
    line1: '', lineNew1: '', line2: '', line3: '', line4: '', line5: '',
    privateLine1: '', privateLineNew1: '', privateLine2: '', privateLine3: '', privateLine4: '', privateLine5: '',
  };
}
function uniformLevels(price: string, privatePrice: string, source: string, groupNo: string): Leaf[] {
  return HOSPITAL_LEVELS.map((name) => makeLeaf(name, price, privatePrice, source, groupNo));
}
function createGroups(): Group[] {
  return [
    {
      cat1: '医院拜访',
      rows: [
        { id: 1, cat2: '学术拜访', hasLevels: true, expanded: true, groupNo: '拜访组-01', isMeeting: false, levels: uniformLevels('900', '120', '品种定制值', '拜访组-01').map((l) => ({ ...l, isContract: l.name === '三级甲等' })) },
        { id: 2, cat2: '上门日常拜访', hasLevels: true, expanded: false, groupNo: '拜访组-01', isMeeting: false, levels: uniformLevels('0', '0', '品种定制值', '拜访组-01') },
        { id: 3, cat2: '网络日常拜访', hasLevels: true, expanded: false, groupNo: '拜访组-02', isMeeting: false, levels: uniformLevels('', '', '未配置', '拜访组-02') },
        { id: 4, cat2: '信息收集和调研', hasLevels: true, expanded: false, groupNo: '拜访组-03', isMeeting: false, levels: uniformLevels('460', '50', '默认模板值', '拜访组-03') },
        { id: 5, cat2: '跟踪巡访服务', hasLevels: true, expanded: false, groupNo: '拜访组-04', isMeeting: false, levels: uniformLevels('520', '80', '品种定制值', '拜访组-04') },
        { id: 6, cat2: '第三终端服务', hasLevels: true, expanded: false, groupNo: '拜访组-05', isMeeting: false, levels: uniformLevels('300', '0', '品种定制值', '拜访组-05') },
      ],
    },
    {
      cat1: '会议',
      rows: [
        { id: 7, cat2: '院内学术会', hasLevels: false, expanded: true, groupNo: '会议组-01', isMeeting: true, levels: [{ ...makeLeaf('院内学术会', '1800', '500', '品种定制值', '会议组-01'), limit: '80', overPrice: '100', privateOverPrice: '60' }] },
        { id: 8, cat2: '科室会', hasLevels: false, expanded: true, groupNo: '会议组-01', isMeeting: true, levels: [{ ...makeLeaf('科室会', '1200', '300', '品种定制值', '会议组-01'), isContract: true }] },
      ],
    },
    {
      cat1: '问卷调查',
      rows: [
        { id: 9, cat2: '医生问卷调查', hasLevels: false, expanded: true, groupNo: '问卷组-01', isMeeting: false, levels: [makeLeaf('医生问卷调查', '500', '60', '品种定制值', '问卷组-01')] },
      ],
    },
  ];
}

interface ReportRow { cat2: string; price: string; }
interface ReportGroup { cat1: string; rows: ReportRow[]; }
function createReportGroups(): ReportGroup[] {
  return [
    { cat1: '终端调研', rows: [{ cat2: '终端产品使用情况', price: '50000' }, { cat2: '终端产品使用调研', price: '0' }] },
    { cat1: '药事服务', rows: [{ cat2: '联合用药研究', price: '800000' }, { cat2: '不良反应监测', price: '' }] },
  ];
}

// ===== 状态判定（空=未配置，0=已配置） =====
const isConfigured = (v: string) => v !== '' && v != null;
function statusOf(text: string): { fg: string; bg: string; border: string } {
  if (text === '已配置') return { fg: '#248A5A', bg: '#E6F5ED', border: '#BBE7CE' };
  if (text === '未配置') return { fg: '#C77A16', bg: '#FDF6EC', border: '#F5DCAC' };
  return { fg: '#C73A3A', bg: '#FEF0F0', border: '#F9C6C6' };
}
function StatusPill({ text }: { text: string }) {
  const s = statusOf(text);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)', border: `1px solid ${s.border}`, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}
function MiniSwitch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{ width: 34, height: 18, borderRadius: 9999, border: 'none', background: on ? '#2F6BCE' : '#CBD5E1', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(16px)' : 'none', transition: 'transform 160ms ease' }} />
    </button>
  );
}

const getBasicStatus = (leaf: Leaf, requirePrivate: boolean) =>
  isConfigured(leaf.price) && (requirePrivate ? isConfigured(leaf.privatePrice) : true) ? '已配置' : '未配置';
const getMeetingStatus = (leaf: Leaf, requirePrivate: boolean) =>
  isConfigured(leaf.limit) && isConfigured(leaf.overPrice) && (requirePrivate ? isConfigured(leaf.privateOverPrice) : true) ? '已配置' : '未配置';
const getRegionStatus = (leaf: Leaf, requirePrivate: boolean) => {
  const pub = REGION_PUBLIC_FIELDS.every((f) => isConfigured(leaf[f.prop] as string));
  const priv = requirePrivate ? REGION_PRIVATE_FIELDS.every((f) => isConfigured(leaf[f.prop] as string)) : true;
  return pub && priv ? '已配置' : '未配置';
};
const getReportStatus = (row: ReportRow) => (isConfigured(row.price) ? '已配置' : '未配置');

type PriceArea = 'basic' | 'meeting' | 'report' | 'region';
type Filter = 'all' | 'unconfigured' | 'configured';

export function PriceTableConfig({ addToast, currentRole }: Props) {
  const canEdit = currentRole === '药厂销售部门';

  // 绑定模型
  const [pharmaDefault, setPharmaDefault] = useState(TEMPLATES[0]);
  const [bindings, setBindings] = useState<Record<string, Binding>>(seedBindings);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editing, setEditing] = useState<Variety | null>(null);

  // 列表筛选
  const [fCommon, setFCommon] = useState('');
  const [fTrade, setFTrade] = useState('');
  const [fHolder, setFHolder] = useState('');
  const [applied, setApplied] = useState({ common: '', trade: '', holder: '' });

  // 编辑页
  const [area, setArea] = useState<PriceArea>('basic');
  const [groups, setGroups] = useState<Group[]>(createGroups);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>(createReportGroups);
  const [regionEnabled, setRegionEnabled] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [pharmaMode, setPharmaMode] = useState<'合一' | '基础版' | '升级版'>('基础版');
  const requirePrivate = pharmaMode !== '合一';

  // 弹窗
  const [rebindTarget, setRebindTarget] = useState<Variety | null>(null);
  const [rebindChoice, setRebindChoice] = useState<string>('inherit');
  const [unbindTarget, setUnbindTarget] = useState<Variety | null>(null);
  const [defaultModal, setDefaultModal] = useState(false);
  const [defaultChoice, setDefaultChoice] = useState(TEMPLATES[0]);
  /** 批量换绑：多品种共用一张价目表的最小实现 */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchChoice, setBatchChoice] = useState('inherit');
  /** 列表视角：table = 按价目表（一行一表、品种列多品种）；variety = 按品种（原列表） */
  const [viewMode, setViewMode] = useState<'table' | 'variety'>('table');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  /** 管理品种弹窗：目标表名 + 勾选集合 */
  const [manageTarget, setManageTarget] = useState<string | null>(null);
  const [managePicked, setManagePicked] = useState<Set<string>>(new Set());

  const effectiveTable = (v: Variety): string => {
    const b = bindings[v.id];
    if (b.mode === 'inherit') return pharmaDefault;
    return b.tableName ?? pharmaDefault;
  };

  const filtered = useMemo(() => VARIETIES.filter((v) => {
    if (applied.common && !v.commonName.includes(applied.common)) return false;
    if (applied.trade && !v.tradeName.includes(applied.trade)) return false;
    if (applied.holder && !v.holder.includes(applied.holder)) return false;
    return true;
  }), [applied]);

  const inheritCount = VARIETIES.filter((v) => bindings[v.id].mode === 'inherit').length;

  /** 价目表视角聚合：一行 = 一张价目表，品种列 = 生效绑定（继承 + 模板）在该表上的全部品种 */
  const tableRows = useMemo(() => {
    const byName = new Map<string, Variety[]>();
    VARIETIES.forEach((v) => {
      const t = effectiveTable(v);
      byName.set(t, [...(byName.get(t) ?? []), v]);
    });
    const names = new Set<string>([pharmaDefault, ...TEMPLATES]);
    Object.values(bindings).forEach((b) => {
      if (b.mode === 'own' && b.tableName) names.add(b.tableName);
    });
    return [...names].map((name) => ({
      name,
      isDefault: name === pharmaDefault,
      source: name === pharmaDefault ? '药厂默认' : TEMPLATES.includes(name) ? '模板' : '品种定制副本',
      varieties: byName.get(name) ?? [],
    })).sort((a, b) => b.varieties.length - a.varieties.length || a.name.localeCompare(b.name));
  }, [bindings, pharmaDefault, effectiveTable]);

  function openManage(tableName: string) {
    const current = new Set((tableRows.find((r) => r.name === tableName)?.varieties ?? []).map((v) => v.id));
    setManagePicked(current);
    setManageTarget(tableName);
  }

  /** 管理品种：勾选挂到目标表（默认表=继承，其他=模板绑定）；取消勾选移出（回到药厂默认继承） */
  function applyManage() {
    if (!manageTarget) return;
    const isDefaultTable = manageTarget === pharmaDefault;
    setBindings((prev) => {
      const next = { ...prev };
      VARIETIES.forEach((v) => {
        if (bindings[v.id].mode === 'own') return; // 定制副本品种不参与批量挂载
        const on = managePicked.has(v.id);
        if (isDefaultTable) {
          if (on) next[v.id] = { mode: 'inherit' };
        } else {
          next[v.id] = on ? { mode: 'template', tableName: manageTarget } : { mode: 'inherit' };
        }
      });
      return next;
    });
    const count = VARIETIES.filter((v) => bindings[v.id].mode !== 'own' && managePicked.has(v.id)).length;
    addToast({ type: 'success', title: '绑定关系已更新', description: `${manageTarget} 当前绑定 ${count} 个品种（含继承）` });
    setManageTarget(null);
  }

  const toggleManagePicked = (id: string) =>
    setManagePicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  function openEdit(v: Variety) {
    setEditing(v);
    setGroups(createGroups());
    setReportGroups(createReportGroups());
    setArea('basic');
    setFilter('all');
    setRegionEnabled(bindings[v.id].mode === 'own');
    setView('edit');
  }

  function applyRebind() {
    if (!rebindTarget) return;
    if (rebindChoice === 'inherit') {
      setBindings((prev) => ({ ...prev, [rebindTarget.id]: { mode: 'inherit' } }));
      addToast({ type: 'success', title: '已改为继承药厂默认', description: `${rebindTarget.tradeName} → ${pharmaDefault}` });
    } else {
      setBindings((prev) => ({ ...prev, [rebindTarget.id]: { mode: 'template', tableName: rebindChoice } }));
      addToast({ type: 'success', title: '已换绑模板', description: `${rebindTarget.tradeName} → ${rebindChoice}（共享同步）` });
    }
    setRebindTarget(null);
  }

  function applyUnbind() {
    if (!unbindTarget) return;
    const copyName = `${unbindTarget.tradeName} 定制品`;
    setBindings((prev) => ({ ...prev, [unbindTarget.id]: { mode: 'own', tableName: copyName } }));
    addToast({ type: 'success', title: '已解绑生成副本', description: `${copyName} 独立维护，模板变更不再影响该品种` });
    setUnbindTarget(null);
  }

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  function applyBatchRebind() {
    if (!selected.size) return;
    setBindings((prev) => {
      const next = { ...prev };
      selected.forEach((id) => {
        next[id] = batchChoice === 'inherit' ? { mode: 'inherit' } : { mode: 'template', tableName: batchChoice };
      });
      return next;
    });
    const target = batchChoice === 'inherit' ? `药厂默认（${pharmaDefault}）` : batchChoice;
    addToast({ type: 'success', title: `已批量换绑 ${selected.size} 个品种`, description: `统一挂到 ${target}，多品种共用同一张价目表` });
    setSelected(new Set());
    setBatchOpen(false);
  }

  const patchLeaf = (cat1: string, rowId: number, idx: number, patch: Partial<Leaf>) =>
    setGroups((prev) => prev.map((gg) => (gg.cat1 !== cat1 ? gg : {
      ...gg,
      rows: gg.rows.map((rr) => (rr.id !== rowId ? rr : {
        ...rr,
        levels: rr.levels.map((ll, i) => (i === idx ? { ...ll, ...patch } : ll)),
      })),
    })));

  const toggleExpand = (cat1: string, rowId: number) =>
    setGroups((prev) => prev.map((gg) => (gg.cat1 !== cat1 ? gg : { ...gg, rows: gg.rows.map((rr) => (rr.id === rowId ? { ...rr, expanded: !rr.expanded } : rr)) })));

  /** 是否发包金额开关：同一业务组（行内）仅允许一档为发包 */
  const toggleContract = (cat1: string, rowId: number, idx: number, on: boolean) =>
    setGroups((prev) => prev.map((gg) => (gg.cat1 !== cat1 ? gg : {
      ...gg,
      rows: gg.rows.map((rr) => (rr.id !== rowId ? rr : {
        ...rr,
        levels: rr.levels.map((ll, i) => (i === idx ? { ...ll, isContract: on } : { ...ll, isContract: false })),
      })),
    })));

  /** 行内「统一价」：把首档金额/对私应用到该行全部等级 */
  const uniformRow = (cat1: string, rowId: number) => {
    setGroups((prev) => prev.map((gg) => (gg.cat1 !== cat1 ? gg : {
      ...gg,
      rows: gg.rows.map((rr) => (rr.id !== rowId ? rr : {
        ...rr,
        levels: rr.levels.map((ll) => ({ ...ll, price: rr.levels[0].price, privatePrice: rr.levels[0].privatePrice, source: '同类复用' })),
      })),
    })));
    addToast({ type: 'success', title: '已统一该行各等级价格', description: '全部等级已应用首档金额与对私金额' });
  };

  const rowConfiguredCount = (row: PriceRow) => row.levels.filter((l) => getBasicStatus(l, requirePrivate) === '已配置').length;
  const groupStatusText = (c: number, t: number) => (c === 0 ? '未配置' : c === t ? '已配置' : '部分完成');

  /** 医院拜访同类服务项复用：把每个拜访行首档价格统一应用到全部等级 */
  function reuseHospital() {
    setGroups((prev) => prev.map((g) => (g.cat1 !== '医院拜访' ? g : {
      ...g,
      rows: g.rows.map((r) => (r.hasLevels && r.levels.length ? { ...r, levels: r.levels.map((l) => ({ ...l, price: r.levels[0].price, privatePrice: r.levels[0].privatePrice, source: '同类复用' })) } : r)),
    })));
    addToast({ type: 'success', title: '已复用医院拜访同类服务项', description: '各拜访类型全部等级已统一为首档价格' });
  }

  const leafMatchesFilter = (leaf: Leaf, status: string) =>
    filter === 'all' || (filter === 'configured' ? status === '已配置' : status === '未配置');

  // ===== 列表页 =====
  if (view === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title="价目表配置"
          description="药厂绑定默认价目表，品种自动继承；特殊品种可解绑生成副本独立定价。绑定=共享同步，副本=独立定制。"
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* 药厂默认价目表 */}
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}><Building2 size={18} /></span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 'var(--fs-14)', fontWeight: 650 }}>药厂默认价目表</div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2 }}>
                当前：<strong style={{ color: 'var(--color-text-1)' }}>{pharmaDefault}</strong> · {inheritCount} 个品种继承此表
              </div>
            </div>
            {canEdit && <Button variant="outline" size="sm" icon={<Link2 size={13} />} onClick={() => { setDefaultChoice(pharmaDefault); setDefaultModal(true); }}>换绑默认表</Button>}
          </div>

          {/* 筛选 */}
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={fCommon} onChange={(e) => setFCommon(e.target.value)} placeholder="通用名" style={{ ...inputStyle, width: 150 }} />
            <input value={fTrade} onChange={(e) => setFTrade(e.target.value)} placeholder="商品名" style={{ ...inputStyle, width: 150 }} />
            <input value={fHolder} onChange={(e) => setFHolder(e.target.value)} placeholder="药品上市许可持有人" style={{ ...inputStyle, width: 180 }} />
            <Button variant="primary" size="sm" onClick={() => setApplied({ common: fCommon, trade: fTrade, holder: fHolder })}>筛选</Button>
            <Button variant="outline" size="sm" onClick={() => { setFCommon(''); setFTrade(''); setFHolder(''); setApplied({ common: '', trade: '', holder: '' }); }}>重置</Button>
          </div>

          {/* 视角切换：按价目表（默认，一行一表）/ 按品种 */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            {([['table', '按价目表'], ['variety', '按品种']] as ['table' | 'variety', string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setViewMode(id); setSelected(new Set()); }}
                style={{ padding: '7px 16px', border: '1px solid var(--color-border)', background: viewMode === id ? 'var(--color-brand-subtle)' : '#fff', color: viewMode === id ? 'var(--color-brand)' : '#667085', fontWeight: viewMode === id ? 650 : 500, fontSize: 'var(--fs-13)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>

          {/* 价目表视角：一行 = 一张价目表，品种列显示共用的多个品种 */}
          {viewMode === 'table' && (
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                <thead>
                  <tr>{['价目表', '来源', '绑定品种', '品种数', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    const shown = expandedTable === row.name ? row.varieties : row.varieties.slice(0, 4);
                    const hidden = row.varieties.length - shown.length;
                    return (
                      <tr key={row.name}>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Table2 size={14} style={{ color: '#98A2B3' }} />
                            <strong>{row.name}</strong>
                            {row.isDefault && <Tag label="药厂默认" color="brand" />}
                          </div>
                        </td>
                        <td style={td}>{row.source}</td>
                        <td style={td}>
                          {row.varieties.length === 0 ? (
                            <span style={{ color: '#98A2B3', fontSize: 'var(--fs-12)' }}>暂无品种绑定</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {shown.map((v) => (
                                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 9999, background: bindings[v.id].mode === 'inherit' ? '#F2F4F7' : 'var(--color-brand-subtle)', color: bindings[v.id].mode === 'inherit' ? '#475467' : 'var(--color-brand)', fontSize: 'var(--fs-12)' }}>
                                  {v.tradeName}{bindings[v.id].mode === 'inherit' ? '' : bindings[v.id].mode === 'own' ? ' · 定制' : ' · 指定'}
                                </span>
                              ))}
                              {hidden > 0 && (
                                <button type="button" onClick={() => setExpandedTable(row.name)} style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>+{hidden} 个品种</button>
                              )}
                              {expandedTable === row.name && row.varieties.length > 4 && (
                                <button type="button" onClick={() => setExpandedTable(null)} style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>收起</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}>{row.varieties.length}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row.varieties[0] ?? VARIETIES[0])}>编辑价格</Button>
                            {canEdit && <Button variant="ghost" size="sm" icon={<Link2 size={12} />} onClick={() => openManage(row.name)}>管理品种</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 品种视角：批量操作条 + 原列表 */}
          {viewMode === 'variety' && canEdit && selected.size > 0 && (
            <div style={{ background: 'var(--color-brand-subtle)', border: '1px solid #BBE7CE', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'var(--fs-13)', color: 'var(--color-brand)' }}>已选 {selected.size} 个品种</strong>
              <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>批量换绑后，这些品种将共用同一张价目表（共享同步）</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" icon={<Link2 size={13} />} onClick={() => { setBatchChoice('inherit'); setBatchOpen(true); }}>批量换绑</Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>取消选择</Button>
              </span>
            </div>
          )}

          {/* 绑定列表（品种视角） */}
          {viewMode === 'variety' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  {canEdit && (
                    <th style={{ ...th, width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="全选品种"
                        checked={selected.size > 0 && selected.size === filtered.length}
                        ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                        onChange={() => setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((x) => x.id))))}
                      />
                    </th>
                  )}
                  {['品种名称', '药厂名称', '绑定价目表', '绑定方式', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={canEdit ? 6 : 5}><EmptyState title="暂无匹配品种" description="调整筛选条件后重试。" /></td></tr>
                ) : filtered.map((v) => {
                  const b = bindings[v.id];
                  return (
                    <tr key={v.id}>
                      {canEdit && (
                        <td style={td}>
                          <input type="checkbox" aria-label={`选择 ${v.tradeName}`} checked={selected.has(v.id)} onChange={() => toggleSelected(v.id)} />
                        </td>
                      )}
                      <td style={td}><strong>{v.tradeName}</strong><div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', marginTop: 2 }}>{v.commonName}</div></td>
                      <td style={td}>{v.holder}</td>
                      <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Table2 size={13} style={{ color: '#98A2B3' }} />{effectiveTable(v)}</span></td>
                      <td style={td}><Tag label={BIND_LABEL[b.mode]} color={BIND_COLOR[b.mode]} /></td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>编辑价目</Button>
                          {canEdit && b.mode !== 'inherit' && <Button variant="ghost" size="sm" onClick={() => { setRebindTarget(v); setRebindChoice('inherit'); }}>换绑</Button>}
                          {canEdit && b.mode !== 'own' && <Button variant="ghost" size="sm" icon={<Unlink size={12} />} onClick={() => setUnbindTarget(v)}>解绑定制</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {/* 管理品种弹窗：把品种挂到某张价目表 / 移出 */}
        <Modal open={!!manageTarget} title={`管理品种 · ${manageTarget ?? ''}`} onClose={() => setManageTarget(null)} width={520}
          footer={<><Button variant="outline" onClick={() => setManageTarget(null)}>取消</Button><Button variant="primary" onClick={applyManage}>确认更新绑定</Button></>}>
          <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 12, lineHeight: 1.7 }}>
            勾选 = 挂到本表（{manageTarget === pharmaDefault ? '跟随药厂默认' : '模板绑定，共享同步'}）；取消勾选 = 移出本表（回到药厂默认继承）。
            {manageTarget === pharmaDefault && ' 继承药厂默认的品种无法从默认表移出，如需改绑请在「按品种」视图操作。'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {VARIETIES.map((v) => {
              const b = bindings[v.id];
              const isOwn = b.mode === 'own';
              const on = managePicked.has(v.id);
              const disabled = isOwn || (manageTarget === pharmaDefault && (b.mode === 'inherit' || effectiveTable(v) === pharmaDefault));
              return (
                <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', padding: '4px 0', opacity: disabled ? 0.55 : 1 }}>
                  <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggleManagePicked(v.id)} />
                  <span>{v.tradeName}<span style={{ color: '#98A2B3', marginLeft: 6, fontSize: 'var(--fs-11)' }}>{v.holder}</span></span>
                  {isOwn && <Tag label="定制中" color="warning" />}
                  {!isOwn && b.mode === 'inherit' && <Tag label="继承中" color="default" />}
                </label>
              );
            })}
          </div>
        </Modal>

        {/* 换绑弹窗 */}
        <Modal open={!!rebindTarget} title={`换绑价目表 · ${rebindTarget?.tradeName ?? ''}`} onClose={() => setRebindTarget(null)} width={460}
          footer={<><Button variant="outline" onClick={() => setRebindTarget(null)}>取消</Button><Button variant="primary" onClick={applyRebind}>确认换绑</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
              <input type="radio" checked={rebindChoice === 'inherit'} onChange={() => setRebindChoice('inherit')} />
              跟随药厂默认（{pharmaDefault}）
            </label>
            {TEMPLATES.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
                <input type="radio" checked={rebindChoice === t} onChange={() => setRebindChoice(t)} />
                {t}（共享同步）
              </label>
            ))}
          </div>
        </Modal>

        {/* 解绑确认 */}
        <ConfirmDialog open={!!unbindTarget} title="解绑生成副本" variant="warning"
          description={`解绑后将为「${unbindTarget?.tradeName ?? ''}」生成独立定制品副本，此后模板价目变更不再影响该品种。是否继续？`}
          confirmLabel="解绑生成副本" onCancel={() => setUnbindTarget(null)} onConfirm={applyUnbind} />

        {/* 批量换绑弹窗：多品种共用一张价目表 */}
        <Modal open={batchOpen} title={`批量换绑 · 已选 ${selected.size} 个品种`} onClose={() => setBatchOpen(false)} width={460}
          footer={<><Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button><Button variant="primary" onClick={applyBatchRebind}>确认批量换绑</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, fontSize: 'var(--fs-12)', color: '#667085' }}>
            换绑后所选品种将共用同一张价目表：模板价格一处修改、全部同步生效。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
              <input type="radio" checked={batchChoice === 'inherit'} onChange={() => setBatchChoice('inherit')} />
              跟随药厂默认（{pharmaDefault}）
            </label>
            {TEMPLATES.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
                <input type="radio" checked={batchChoice === t} onChange={() => setBatchChoice(t)} />
                {t}（共享同步）
              </label>
            ))}
          </div>
        </Modal>

        {/* 默认表换绑 */}
        <Modal open={defaultModal} title="换绑药厂默认价目表" onClose={() => setDefaultModal(false)} width={460}
          footer={<><Button variant="outline" onClick={() => setDefaultModal(false)}>取消</Button><Button variant="primary" onClick={() => { setPharmaDefault(defaultChoice); setDefaultModal(false); addToast({ type: 'success', title: '已换绑默认表', description: `${inheritCount} 个继承品种同步生效` }); }}>确认</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TEMPLATES.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
                <input type="radio" checked={defaultChoice === t} onChange={() => setDefaultChoice(t)} />
                {t}
              </label>
            ))}
          </div>
        </Modal>
      </div>
    );
  }

  // ===== 编辑页（一张表四个价格区） =====
  const v = editing!;
  const shareCount = VARIETIES.filter((x) => x.id !== v.id && effectiveTable(x) === effectiveTable(v)).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={`编辑价目 · ${v.tradeName}`}
        description={`绑定：${effectiveTable(v)}（${BIND_LABEL[bindings[v.id].mode]}） · 当前与 ${shareCount} 个品种共用此表${shareCount > 0 ? '，修改价格将同步影响这些品种' : ''}`}
        actions={<Button variant="outline" size="sm" onClick={() => setView('list')}>返回列表</Button>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 顶部操作区 */}
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && <Button variant="primary" size="sm" onClick={() => addToast({ type: 'success', title: '价格配置已保存' })}>保存价格配置</Button>}
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={() => { setGroups(createGroups()); setReportGroups(createReportGroups()); addToast({ type: 'success', title: '已恢复默认价格' }); }}>恢复默认</Button>
          <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={() => addToast({ type: 'info', title: '导出价格配置（演示）' })}>导出</Button>
          {canEdit && <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => addToast({ type: 'info', title: '导入价格配置（演示）' })}>导入</Button>}
          {canEdit && area === 'basic' && <Button variant="outline" size="sm" icon={<Repeat2 size={13} />} onClick={reuseHospital}>医院拜访同类服务项复用</Button>}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#667085' }}>
            药厂公私模式
            <select value={pharmaMode} onChange={(e) => setPharmaMode(e.target.value as typeof pharmaMode)} style={{ ...inputStyle, width: 130, height: 28 }}>
              <option value="合一">公私合一</option>
              <option value="基础版">公私分离基础版</option>
              <option value="升级版">公私分离升级版</option>
            </select>
          </span>
        </div>

        {/* 四价格区页签 */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
          {([['basic', '基础价格'], ['meeting', '会议价格'], ['report', '报告价格'], ['region', '区域价格']] as [PriceArea, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setArea(id); setFilter('all'); }}
              style={{ padding: '10px 15px', border: 'none', borderBottom: area === id ? '2px solid var(--color-brand)' : '2px solid transparent', background: 'none', color: area === id ? 'var(--color-brand)' : '#667085', fontWeight: area === id ? 650 : 500, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* 基础价格 */}
        {area === 'basic' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {([['all', '全部'], ['unconfigured', '只看未配置'], ['configured', '只看已配置']] as [Filter, string][]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} style={{ padding: '4px 12px', borderRadius: 9999, border: '1px solid var(--color-border)', background: filter === id ? 'var(--color-brand-subtle)' : '#fff', color: filter === id ? 'var(--color-brand)' : '#667085', fontSize: 'var(--fs-12)', cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
            {groups.filter((g) => !g.rows.every((r) => r.isMeeting)).map((g) => (
              <div key={g.cat1} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--fs-14)', fontWeight: 650, marginBottom: 8 }}>{g.cat1}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['服务项 / 等级', '金额', '对私金额', '是否发包金额', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {g.rows.filter((r) => !r.isMeeting).map((r) => {
                      if (!r.hasLevels) {
                        const leaf = r.levels[0];
                        const status = getBasicStatus(leaf, requirePrivate);
                        if (!leafMatchesFilter(leaf, status)) return null;
                        return (
                          <tr key={r.id}>
                            <td style={td}>
                              <strong>{r.cat2}</strong>
                              <div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', marginTop: 2 }}>业务组号 {r.groupNo} · {leaf.source}</div>
                            </td>
                            <td style={td}><input value={leaf.price} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { price: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                            <td style={td}><input value={leaf.privatePrice} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { privatePrice: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                            <td style={td}><MiniSwitch on={leaf.isContract} disabled={!canEdit} onChange={(v) => toggleContract(g.cat1, r.id, 0, v)} /></td>
                            <td style={td}><StatusPill text={status} /></td>
                          </tr>
                        );
                      }
                      const cfg = rowConfiguredCount(r);
                      const anyContract = r.levels.some((l) => l.isContract);
                      return (
                        <Fragment key={r.id}>
                          <tr style={{ background: '#F8FAFC' }}>
                            <td style={td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => toggleExpand(g.cat1, r.id)} style={{ ...linkBtnStyle, color: '#667085' }}>{r.expanded ? '▼' : '▶'}</button>
                                <strong>{r.cat2}</strong>
                                <span style={{ fontSize: 'var(--fs-12)', color: '#98A2B3' }}>{cfg}/{r.levels.length} 档已配置</span>
                                {canEdit && <button type="button" onClick={() => uniformRow(g.cat1, r.id)} style={linkBtnStyle}>统一价</button>}
                              </div>
                              <div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', marginTop: 2, paddingLeft: 22 }}>业务组号 {r.groupNo} · 价格来源 {r.levels[0]?.source ?? '—'}</div>
                            </td>
                            <td style={td}>—</td>
                            <td style={td}>—</td>
                            <td style={td}>{anyContract ? <Tag label="含发包行" color="info" /> : '—'}</td>
                            <td style={td}><StatusPill text={groupStatusText(cfg, r.levels.length)} /></td>
                          </tr>
                          {r.expanded && r.levels.map((leaf, li) => {
                            const status = getBasicStatus(leaf, requirePrivate);
                            if (!leafMatchesFilter(leaf, status)) return null;
                            return (
                              <tr key={`${r.id}-${li}`}>
                                <td style={{ ...td, paddingLeft: 30, color: '#667085' }}>└ {leaf.name}</td>
                                <td style={td}><input value={leaf.price} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, li, { price: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                                <td style={td}><input value={leaf.privatePrice} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, li, { privatePrice: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                                <td style={td}><MiniSwitch on={leaf.isContract} disabled={!canEdit} onChange={(v) => toggleContract(g.cat1, r.id, li, v)} /></td>
                                <td style={td}><StatusPill text={status} /></td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* 会议价格 */}
        {area === 'meeting' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 12 }}>会议价格只补充人数限制 / 超员金额 / 对私超员金额，不重复配置金额。</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['会议类别', '人数限制', '超员金额', '对私超员金额', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {groups.flatMap((g) => g.rows.filter((r) => r.isMeeting).map((r) => {
                  const leaf = r.levels[0];
                  const status = getMeetingStatus(leaf, requirePrivate);
                  if (!leafMatchesFilter(leaf, status)) return null;
                  return (
                    <tr key={r.id}>
                      <td style={td}>{r.cat2}</td>
                      <td style={td}><input value={leaf.limit} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { limit: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                      <td style={td}><input value={leaf.overPrice} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { overPrice: e.target.value })} style={{ ...inputStyle, width: 90 }} /></td>
                      <td style={td}><input value={leaf.privateOverPrice} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { privateOverPrice: e.target.value })} style={{ ...inputStyle, width: 100 }} /></td>
                      <td style={td}><StatusPill text={status} /></td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}

        {/* 报告价格 */}
        {area === 'report' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
            {canEdit && <div style={{ marginBottom: 12 }}><Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => addToast({ type: 'info', title: '导入报告价格（演示）' })}>导入报告价格</Button></div>}
            {reportGroups.map((g) => (
              <div key={g.cat1} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--fs-14)', fontWeight: 650, marginBottom: 8 }}>{g.cat1}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['价目小类', '金额', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {g.rows.map((row, ri) => {
                      const status = getReportStatus(row);
                      return (
                        <tr key={row.cat2}>
                          <td style={td}>{row.cat2}</td>
                          <td style={td}><input value={row.price} disabled={!canEdit} onChange={(e) => setReportGroups((prev) => prev.map((gg) => gg.cat1 !== g.cat1 ? gg : { ...gg, rows: gg.rows.map((rr, i) => (i === ri ? { ...rr, price: e.target.value } : rr)) }))} style={{ ...inputStyle, width: 120 }} /></td>
                          <td style={td}><StatusPill text={status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* 区域价格（默认关，开关开启） */}
        {area === 'region' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 'var(--fs-14)', fontWeight: 650 }}>区域价格（城市线级）</span>
              <button type="button" role="switch" aria-checked={regionEnabled} disabled={!canEdit}
                onClick={() => { setRegionEnabled((s) => !s); addToast({ type: 'success', title: regionEnabled ? '区域价格已关闭' : '区域价格已开启' }); }}
                style={{ width: 36, height: 20, borderRadius: 9999, border: 'none', background: regionEnabled ? 'var(--color-brand)' : '#CBD5E1', position: 'relative', cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                <span style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transform: regionEnabled ? 'translateX(16px)' : 'none', transition: 'transform 160ms ease' }} />
              </button>
              <Tag label={regionEnabled ? '已开启' : '默认关闭'} color={regionEnabled ? 'success' : 'default'} />
            </div>
            {!regionEnabled ? (
              <EmptyState title="区域价格未开启" description="开启后按城市线级（一线~五线 + 对私线级）配置补充价格，替代基础价格的统一金额。" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', overflow: 'auto' }}>
                <thead><tr>{['服务项', ...REGION_PUBLIC_FIELDS.map((f) => f.label), ...REGION_PRIVATE_FIELDS.map((f) => f.label), '状态'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {groups.flatMap((g) => g.rows.filter((r) => !r.isMeeting).map((r) => {
                    const leaf = r.levels[0];
                    const status = getRegionStatus(leaf, requirePrivate);
                    return (
                      <tr key={r.id}>
                        <td style={td}>{r.cat2}</td>
                        {REGION_PUBLIC_FIELDS.map((f) => (
                          <td key={f.prop} style={td}><input value={leaf[f.prop] as string} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { [f.prop]: e.target.value } as Partial<Leaf>)} style={{ ...inputStyle, width: 64 }} /></td>
                        ))}
                        {REGION_PRIVATE_FIELDS.map((f) => (
                          <td key={f.prop} style={td}><input value={leaf[f.prop] as string} disabled={!canEdit} onChange={(e) => patchLeaf(g.cat1, r.id, 0, { [f.prop]: e.target.value } as Partial<Leaf>)} style={{ ...inputStyle, width: 64 }} /></td>
                        ))}
                        <td style={td}><StatusPill text={status} /></td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
