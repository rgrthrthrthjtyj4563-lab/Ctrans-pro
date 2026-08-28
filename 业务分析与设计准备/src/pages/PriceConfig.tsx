import { useMemo, useState } from 'react';
import {
  Copy, Percent, RefreshCw, Download, Upload, FileText, Link2, CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Tag } from '../components/StatusTag';
import type { Role } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
  /** 入口价目类型：base=基础价目表，gs=公私分离价目表，report=报告价目表 */
  kind?: 'base' | 'gs' | 'report';
}

type Kind = 'base' | 'gs' | 'report';
type Page = 'base-list' | 'base-price' | 'base-ratio'
  | 'gs-list' | 'gs-price'
  | 'report-list' | 'report-price' | 'report-ratio'
  | 'city-level';
type TaskView = 'basic' | 'meeting' | 'region';
type PriceMode = 'traditional' | 'region';

const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px', fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--color-brand)', fontSize: 'var(--fs-13)', fontFamily: 'inherit', textAlign: 'left',
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ===== 品种与价目数据（原型 1:1） =====

interface Product {
  id: number;
  commonName: string;
  tradeName: string;
  approvalNumber: string;
  package: string;
  spec: string;
  unit: string;
  company: string;
  calcType?: string;
}

const BASE_PRODUCTS: Product[] = [
  { id: 1, commonName: '头孢克洛干混悬剂', tradeName: '希刻劳', approvalNumber: '国药准字H12345678', package: '-', spec: '5g', unit: '盒', company: '长安药厂', calcType: '传统模式' },
  { id: 2, commonName: '对乙酰氨基酚', tradeName: '泰诺林', approvalNumber: '国药准字Z33333333', package: '-', spec: '50ml', unit: '瓶', company: '长安药厂', calcType: '传统模式' },
  { id: 3, commonName: '感冒灵颗粒', tradeName: '999感冒灵', approvalNumber: '国药准字S12345679', package: '-', spec: '10袋/盒', unit: '盒', company: '测试药企名称', calcType: '传统模式' },
];

const GS_PRODUCTS: Product[] = [
  { id: 1, commonName: '小儿肺热清颗粒', tradeName: '小儿肺热清', approvalNumber: '国药准字Z20113001', package: '-', spec: '6袋/盒', unit: '盒', company: '大连美罗中药厂有限公司', calcType: '区域模式' },
  { id: 2, commonName: '双黄连口服液', tradeName: '双黄连', approvalNumber: '国药准字Z20010002', package: '-', spec: '10ml*6支', unit: '盒', company: '大连美罗中药厂有限公司', calcType: '区域模式' },
];

const REPORT_PRODUCTS: Product[] = [
  { id: 1, commonName: '左甲状腺素钠片', tradeName: '优甲乐', approvalNumber: '国药准字H20140052', package: '-', spec: '100片装', unit: '盒', company: '程秋明测试药厂' },
  { id: 2, commonName: '盐酸二甲双胍片', tradeName: '格华止', approvalNumber: '国药准字H20160001', package: '-', spec: '60片装', unit: '盒', company: '程秋明测试药厂' },
];

const PRODUCTS: Record<Kind, Product[]> = { base: BASE_PRODUCTS, gs: GS_PRODUCTS, report: REPORT_PRODUCTS };

const HOSPITAL_LEVELS = ['三级甲等', '三级乙等', '二级甲等', '二级乙等', '一级', '社区', '民营', '未分级'];

const REGION_PUBLIC_FIELDS = [
  { prop: 'line1', label: '一线' },
  { prop: 'lineNew1', label: '新一线' },
  { prop: 'line2', label: '二线' },
  { prop: 'line3', label: '三线' },
  { prop: 'line4', label: '四线' },
  { prop: 'line5', label: '五线' },
];
const REGION_PRIVATE_FIELDS = [
  { prop: 'privateLine1', label: '对私一线' },
  { prop: 'privateLineNew1', label: '对私新一线' },
  { prop: 'privateLine2', label: '对私二线' },
  { prop: 'privateLine3', label: '对私三线' },
  { prop: 'privateLine4', label: '对私四线' },
  { prop: 'privateLine5', label: '对私五线' },
];

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

function createBaseGroups(): Group[] {
  return [
    {
      cat1: '医院拜访',
      rows: [
        {
          id: 1, cat2: '学术拜访', hasLevels: true, expanded: true, groupNo: '拜访组-01', isMeeting: false,
          levels: uniformLevels('900', '120', '品种定制值', '拜访组-01').map((l) => ({ ...l, isContract: l.name === '三级甲等' })),
        },
        { id: 2, cat2: '上门日常拜访', hasLevels: true, expanded: false, groupNo: '拜访组-01', isMeeting: false, levels: uniformLevels('0', '0', '品种定制值', '拜访组-01') },
        { id: 3, cat2: '网络日常拜访', hasLevels: true, expanded: false, groupNo: '拜访组-02', isMeeting: false, levels: uniformLevels('', '', '未配置', '拜访组-02') },
        {
          id: 4, cat2: '信息收集和调研', hasLevels: true, expanded: false, groupNo: '拜访组-03', isMeeting: false,
          levels: uniformLevels('460', '50', '默认模板值', '拜访组-03').map((l, i) => (i > 2 ? { ...l, price: '', privatePrice: '', source: '未配置' } : l)),
        },
        { id: 5, cat2: '跟踪巡访服务', hasLevels: true, expanded: false, groupNo: '拜访组-04', isMeeting: false, levels: uniformLevels('520', '80', '品种定制值', '拜访组-04') },
        { id: 6, cat2: '第三终端服务', hasLevels: true, expanded: false, groupNo: '拜访组-05', isMeeting: false, levels: uniformLevels('300', '0', '品种定制值', '拜访组-05') },
      ],
    },
    {
      cat1: '会议',
      rows: [
        {
          id: 7, cat2: '院内学术会', hasLevels: false, expanded: true, groupNo: '会议组-01', isMeeting: true,
          levels: [{ ...makeLeaf('院内学术会', '1800', '500', '品种定制值', '会议组-01'), limit: '80', overPrice: '100', privateOverPrice: '60' }],
        },
        {
          id: 8, cat2: '科室会', hasLevels: false, expanded: true, groupNo: '会议组-01', isMeeting: true,
          levels: [{ ...makeLeaf('科室会', '1200', '300', '品种定制值', '会议组-01'), isContract: true }],
        },
      ],
    },
    {
      cat1: '问卷调查',
      rows: [
        {
          id: 9, cat2: '医生问卷调查', hasLevels: false, expanded: true, groupNo: '问卷组-01', isMeeting: false,
          levels: [{ ...makeLeaf('医生问卷调查', '500', '60', '品种定制值', '问卷组-01') }],
        },
      ],
    },
  ];
}

function createGsGroups(): Group[] {
  const groups = clone(createBaseGroups());
  groups.forEach((group) => {
    group.rows.forEach((row) => {
      row.levels.forEach((leaf) => {
        leaf.isContract = false;
        if (!leaf.privatePrice) leaf.privatePrice = '0';
        leaf.line1 = leaf.line1 || '160';
        leaf.lineNew1 = leaf.lineNew1 || '140';
        leaf.line2 = leaf.line2 || '120';
        leaf.line3 = leaf.line3 || '100';
        leaf.line4 = leaf.line4 || '80';
        leaf.line5 = leaf.line5 || '60';
        leaf.privateLine1 = leaf.privateLine1 || '100';
        leaf.privateLineNew1 = leaf.privateLineNew1 || '90';
        leaf.privateLine2 = leaf.privateLine2 || '80';
        leaf.privateLine3 = leaf.privateLine3 || '';
        leaf.privateLine4 = leaf.privateLine4 || '';
        leaf.privateLine5 = leaf.privateLine5 || '';
      });
    });
  });
  return groups;
}

interface ReportRow { cat2: string; price: string; }
interface ReportGroup { cat1: string; rows: ReportRow[]; }

function createReportGroups(): ReportGroup[] {
  return [
    { cat1: '终端调研', rows: [{ cat2: '终端产品使用情况', price: '50000' }, { cat2: '终端产品使用调研', price: '0' }] },
    { cat1: '药事服务', rows: [{ cat2: '联合用药研究', price: '800000' }, { cat2: '不良反应监测', price: '' }] },
  ];
}

const BASE_RATIO_FIELDS = [
  { prop: 'p1', label: '医院拜访比例' }, { prop: 'p2', label: '信息调研比例' }, { prop: 'p3', label: '医院协访比例' },
  { prop: 'p4', label: '会议比例' }, { prop: 'p5', label: '义诊比例' }, { prop: 'p6', label: '医学问询比例' },
  { prop: 'p7', label: '不良反应监测比例' }, { prop: 'p8', label: '商业拜访比例' }, { prop: 'p9', label: '药房拜访比例' },
  { prop: 'p10', label: '药房协访比例' }, { prop: 'p11', label: '问卷调查比例' }, { prop: 'p12', label: '信息反馈比例' },
  { prop: 'p13', label: '医院信息调研比例' }, { prop: 'p14', label: '科室信息调研比例' }, { prop: 'p15', label: '医生信息比例' },
];

const BASE_RATIO_DEFAULTS: Record<string, number> = {
  p1: 20, p2: 10, p3: 10, p4: 15, p5: 5, p6: 5, p7: 5, p8: 5, p9: 5, p10: 4, p11: 4, p12: 4, p13: 2, p14: 2, p15: 0,
};

const REPORT_RATIO_FIELDS = [
  { prop: 'p1', label: '终端产品使用情况' }, { prop: 'p2', label: '省区计划' }, { prop: 'p3', label: '地市计划' },
  { prop: 'p4', label: '终端计划' }, { prop: 'p5', label: '终端准入潜力评估' }, { prop: 'p6', label: '问卷分析报告' },
  { prop: 'p7', label: '调查问卷' }, { prop: 'p8', label: '市场容量调研' }, { prop: 'p9', label: '市场环境分析' },
  { prop: 'p10', label: '竞品分析调研' }, { prop: 'p11', label: '流向数据调研分析' }, { prop: 'p12', label: '库存数据调研分析' },
  { prop: 'p13', label: '政策调研' }, { prop: 'p14', label: '深度版（国家政策）' }, { prop: 'p15', label: '定制版' },
  { prop: 'p16', label: '医生处方行为深度分析' }, { prop: 'p17', label: '不良反应监测' }, { prop: 'p18', label: '不良反应研究' },
  { prop: 'p19', label: '临床' },
];

const REPORT_RATIO_DEFAULTS: Record<string, number> = {
  p1: 10, p2: 10, p3: 10, p4: 10, p5: 10, p6: 10, p7: 10, p8: 10, p9: 10, p10: 10,
  p11: 0, p12: 0, p13: 0, p14: 0, p15: 0, p16: 0, p17: 0, p18: 0, p19: 0,
};

interface CityLevel { city: string; level: string; }
const CITY_LEVEL_DATA: CityLevel[] = [
  { city: '北京市', level: '一线' },
  { city: '上海市', level: '一线' },
  { city: '杭州市', level: '新一线' },
  { city: '成都市', level: '新一线' },
  { city: '无锡市', level: '二线' },
  { city: '温州市', level: '三线' },
];

const LEVEL_OPTIONS = ['一线', '新一线', '二线', '三线', '四线', '五线'];

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
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '9999px',
      fontSize: 'var(--fs-12)', border: `1px solid ${s.border}`, background: s.bg, color: s.fg, whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

const getBasicStatus = (leaf: Leaf, requirePrivate: boolean) => {
  const baseReady = isConfigured(leaf.price);
  const privateReady = requirePrivate ? isConfigured(leaf.privatePrice) : true;
  return baseReady && privateReady ? '已配置' : '未配置';
};
const getMeetingStatus = (leaf: Leaf, requirePrivate: boolean) => {
  const limitReady = isConfigured(leaf.limit);
  const overReady = isConfigured(leaf.overPrice);
  const privateOverReady = requirePrivate ? isConfigured(leaf.privateOverPrice) : true;
  return limitReady && overReady && privateOverReady ? '已配置' : '未配置';
};
const getRegionStatus = (leaf: Leaf, requirePrivate: boolean) => {
  const publicReady = REGION_PUBLIC_FIELDS.every((f) => isConfigured(leaf[f.prop as keyof Leaf] as string));
  const privateReady = requirePrivate ? REGION_PRIVATE_FIELDS.every((f) => isConfigured(leaf[f.prop as keyof Leaf] as string)) : true;
  return publicReady && privateReady ? '已配置' : '未配置';
};
const getReportStatus = (row: ReportRow) => (isConfigured(row.price) ? '已配置' : '未配置');

const statusForView = (leaf: Leaf, view: TaskView) => {
  if (view === 'meeting') return getMeetingStatus(leaf, true);
  if (view === 'region') return getRegionStatus(leaf, true);
  return getBasicStatus(leaf, true);
};

const getGroupStatusText = (configured: number, total: number) => {
  if (configured === 0) return '未配置';
  if (configured === total) return '已完成';
  return '部分完成';
};

// ===== 主组件 =====

export function PriceConfig({ addToast, currentRole, kind: initialKind = 'base' }: Props) {
  const canWrite = currentRole === '药厂销售部门';

  // 页面与菜单
  const [page, setPage] = useState<Page>(`${initialKind}-list`);
  const [editId, setEditId] = useState<number>(1);
  const [taskView, setTaskView] = useState<TaskView>('basic');
  const [priceMode, setPriceMode] = useState<{ base: PriceMode; gs: PriceMode }>({ base: 'traditional', gs: 'region' });

  // 每个品种的价目配置（归属「配置主体」；绑定品种与源共享同一份数据 → 编辑源自动同步到已绑定品种）
  const [configs, setConfigs] = useState<Record<Kind, Record<number, Group[]>>>(() => ({
    base: { 1: createBaseGroups(), 2: createBaseGroups(), 3: createBaseGroups() },
    gs: { 1: createGsGroups(), 2: createGsGroups() },
    report: { 1: [], 2: [] },
  }));
  const [reportCfg, setReportCfg] = useState<Record<number, ReportGroup[]>>(() => ({ 1: createReportGroups(), 2: createReportGroups() }));

  // 绑定关系：品种 → 配置主体（默认自己）
  const [bindings, setBindings] = useState<Record<Kind, Record<number, number>>>({
    base: { 1: 1, 2: 2, 3: 3 },
    gs: { 1: 1, 2: 2 },
    report: { 1: 1, 2: 2 },
  });

  // 比例（按配置主体）
  const [baseRatios, setBaseRatios] = useState<Record<number, Record<string, number>>>(() => ({
    1: { ...BASE_RATIO_DEFAULTS }, 2: { ...BASE_RATIO_DEFAULTS }, 3: { ...BASE_RATIO_DEFAULTS },
  }));
  const [reportRatios, setReportRatios] = useState<Record<number, Record<string, number>>>(() => ({
    1: { ...REPORT_RATIO_DEFAULTS }, 2: { ...REPORT_RATIO_DEFAULTS },
  }));

  // 城市级别
  const [cityLevels, setCityLevels] = useState<CityLevel[]>(() => clone(CITY_LEVEL_DATA));

  // 编辑中的配置副本与已保存快照（「查看修改」基于两者对比）
  const [draftGroups, setDraftGroups] = useState<Group[]>([]);
  const [draftReports, setDraftReports] = useState<ReportGroup[]>([]);
  const [draftRatio, setDraftRatio] = useState<Record<string, number>>({});
  const [draftCity, setDraftCity] = useState<CityLevel[]>([]);
  const [snapGroups, setSnapGroups] = useState<string>('[]');
  const [snapReports, setSnapReports] = useState<string>('[]');
  const [snapRatio, setSnapRatio] = useState<string>('{}');
  const [snapCity, setSnapCity] = useState<string>('[]');
  const [snapMode, setSnapMode] = useState<string>('{}');
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // 列表筛选
  const [listFilters, setListFilters] = useState<Record<Kind, { commonName: string; tradeName: string; company: string }>>({
    base: { commonName: '', tradeName: '', company: '' },
    gs: { commonName: '', tradeName: '', company: '' },
    report: { commonName: '', tradeName: '', company: '' },
  });
  const [tabFilters, setTabFilters] = useState<Record<'base' | 'gs', Record<TaskView, string>>>({
    base: { basic: 'all', meeting: 'all', region: 'all' },
    gs: { basic: 'all', meeting: 'all', region: 'all' },
  });
  const [searchFilters, setSearchFilters] = useState<Record<'base' | 'gs', { category: string; keyword: string }>>({
    base: { category: '', keyword: '' },
    gs: { category: '', keyword: '' },
  });

  // 复制 / 批量 / 恢复 / 未保存 / 修改 / 比例确认 / 统一价
  const [copyForms, setCopyForms] = useState<Record<Kind, { source: number; target: number }>>({
    base: { source: 1, target: 2 }, gs: { source: 1, target: 2 }, report: { source: 1, target: 2 },
  });
  const [copyModal, setCopyModal] = useState<{ open: boolean; module: string; action: string; sourceText: string; targetText: string }>({ open: false, module: '', action: '', sourceText: '', targetText: '' });
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');
  const [batchCompany, setBatchCompany] = useState('长安药厂');
  const [batchTargets, setBatchTargets] = useState<number[]>([]);
  const [batchSource, setBatchSource] = useState(1);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [restoreModal, setRestoreModal] = useState('');
  const [unsavedModal, setUnsavedModal] = useState(false);
  const [pendingPage, setPendingPage] = useState<Page | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesList, setChangesList] = useState<{ module: string; item: string; field: string; before: string; after: string }[]>([]);
  const [ratioConfirm, setRatioConfirm] = useState<{ type: string; sum: number } | null>(null);
  const [unified, setUnified] = useState<{ row: PriceRow; price: string; privatePrice: string } | null>(null);

  // 绑定交互
  const [bindSingle, setBindSingle] = useState<{ open: boolean; module: string; sourceText: string; targetText: string }>({ open: false, module: '', sourceText: '', targetText: '' });
  const [unbindTarget, setUnbindTarget] = useState<{ kind: Kind; id: number; name: string; owner: string } | null>(null);
  const [unbindStep2, setUnbindStep2] = useState(false);

  const kindOfPage = (p: Page): Kind => (p.startsWith('base') ? 'base' : p.startsWith('gs') ? 'gs' : 'report');
  const activeKind = kindOfPage(page);
  const currentProducts = PRODUCTS[activeKind];
  const ownerOf = (k: Kind, id: number) => bindings[k][id] ?? id;
  const productById = (k: Kind, id: number) => PRODUCTS[k].find((p) => p.id === id);
  const productName = (k: Kind, id: number) => productById(k, id)?.tradeName ?? '—';
  const editProduct = productById(activeKind, editId) ?? currentProducts[0];
  const editOwner = ownerOf(activeKind, editId);
  const editOwnerProduct = productById(activeKind, editOwner);
  const isBound = editOwner !== editId;

  // 页面标题
  const pageTitleOf: Record<Page, string> = {
    'base-list': '基础价目表', 'base-price': '基础价目表', 'base-ratio': '基础价目表',
    'gs-list': '公私分离价目表', 'gs-price': '公私分离价目表',
    'report-list': '报告价目表', 'report-price': '报告价目表', 'report-ratio': '报告价目表',
    'city-level': '配置品种城市级别',
  };

  function openPriceEdit(kind: Kind, id: number) {
    if (!canWrite) return;
    if (hasUnsaved) { requestNav(page); return; }
    setPage(kind === 'base' ? 'base-price' : 'gs-price');
    setEditId(id);
    setTaskView('basic');
    const owner = ownerOf(kind, id);
    setDraftGroups(clone(configs[kind][owner]));
    setSnapGroups(JSON.stringify(clone(configs[kind][owner])));
    setSnapMode(JSON.stringify(priceMode));
  }

  function openRatioEdit(id: number, kind: Kind) {
    if (!canWrite) return;
    if (hasUnsaved) { requestNav(page); return; }
    setPage(kind === 'base' ? 'base-ratio' : 'report-ratio');
    setEditId(id);
    const owner = ownerOf(kind, id);
    const ratio = kind === 'base' ? baseRatios[owner] : reportRatios[owner];
    setDraftRatio({ ...ratio });
    setSnapRatio(JSON.stringify(ratio));
  }

  function openReportEdit(id: number) {
    if (!canWrite) return;
    if (hasUnsaved) { requestNav(page); return; }
    setPage('report-price');
    setEditId(id);
    const owner = ownerOf('report', id);
    setDraftReports(clone(reportCfg[owner]));
    setSnapReports(JSON.stringify(clone(reportCfg[owner])));
  }

  function openCityLevel() {
    if (hasUnsaved) { requestNav('city-level'); return; }
    setPage('city-level');
    setDraftCity(clone(cityLevels));
    setSnapCity(JSON.stringify(clone(cityLevels)));
    setSnapMode(JSON.stringify(priceMode));
  }

  function requestNav(target: Page) {
    if (hasUnsaved) {
      setPendingPage(target);
      setUnsavedModal(true);
      return;
    }
    goImmediate(target);
  }

  function goImmediate(target: Page) {
    if (target === page) return;
    setPage(target);
    setHasUnsaved(false);
  }

  function confirmLeave() {
    setUnsavedModal(false);
    setHasUnsaved(false);
    if (pendingPage) {
      goImmediate(pendingPage);
      setPendingPage(null);
    }
  }

  // 列表筛选
  const filteredProducts = useMemo(() => {
    const f = listFilters[activeKind];
    return currentProducts.filter((p) => (
      (!f.commonName || p.commonName.includes(f.commonName))
      && (!f.tradeName || p.tradeName.includes(f.tradeName))
      && (!f.company || p.company.includes(f.company))
    ));
  }, [currentProducts, listFilters, activeKind]);

  const resetListFilters = (kind: Kind) => {
    setListFilters((prev) => ({ ...prev, [kind]: { commonName: '', tradeName: '', company: '' } }));
  };

  // 复制配置（原型语义：覆盖目标配置，不建立绑定）
  function showCopyModal(module: string, action: string) {
    const kind: Kind = module === '基础价目表' ? 'base' : module === '公私分离价目表' ? 'gs' : 'report';
    const src = productName(kind, copyForms[kind].source);
    const tgt = productName(kind, copyForms[kind].target);
    setCopyModal({ open: true, module, action, sourceText: `${src}（${productById(kind, copyForms[kind].source)?.company ?? ''}）`, targetText: `${tgt}（${productById(kind, copyForms[kind].target)?.company ?? ''}）` });
  }

  function confirmCopy() {
    const kind: Kind = copyModal.module === '基础价目表' ? 'base' : copyModal.module === '公私分离价目表' ? 'gs' : 'report';
    const src = copyForms[kind].source;
    const tgt = copyForms[kind].target;
    if (copyModal.action === '价格配置' || copyModal.action === '比例表复制') {
      setConfigs((prev) => {
        const next = clone(prev);
        next[kind][tgt] = clone(prev[kind][src]);
        return next;
      });
    } else if (copyModal.action === '发包比例' || copyModal.action === '报告比例') {
      if (kind === 'base') setBaseRatios((prev) => ({ ...prev, [tgt]: { ...prev[src] } }));
      else if (kind === 'report') setReportRatios((prev) => ({ ...prev, [tgt]: { ...prev[src] } }));
    } else if (copyModal.action === '报告价格') {
      setReportCfg((prev) => ({ ...prev, [tgt]: clone(prev[src]) }));
    }
    setCopyModal((m) => ({ ...m, open: false }));
    addToast({ type: 'success', title: `${copyModal.action}已提交`, description: `${copyModal.sourceText} → ${copyModal.targetText}` });
  }

  // 绑定价目配置（新特性：目标品种与源品种共用同一份配置，编辑源自动同步）
  function showBindSingle() {
    const kind = activeKind;
    const src = copyForms[kind].source;
    const tgt = copyForms[kind].target;
    if (src === tgt) {
      addToast({ type: 'error', title: '无法绑定', description: '源品种与目标品种相同' });
      return;
    }
    if (ownerOf(kind, tgt) === src) {
      addToast({ type: 'info', title: '已绑定', description: `${productName(kind, tgt)} 已在使用 ${productName(kind, src)} 的价目配置` });
      return;
    }
    setBindSingle({ open: true, module: pageTitleOf[page], sourceText: productName(kind, src), targetText: productName(kind, tgt) });
  }

  function confirmBindSingle() {
    const kind = activeKind;
    const src = copyForms[kind].source;
    const tgt = copyForms[kind].target;
    setBindings((prev) => ({ ...prev, [kind]: { ...prev[kind], [tgt]: src } }));
    setBindSingle((m) => ({ ...m, open: false }));
    addToast({ type: 'success', title: '绑定成功', description: `${productName(kind, tgt)} 已绑定 ${productName(kind, src)} 的价目配置，后续编辑源品种将自动同步` });
  }

  // 批量复制 → 批量绑定（二次确认）
  function showBatchCopy(id: number, title: string) {
    setBatchSource(id);
    setBatchTitle(title);
    setBatchCompany(productById(activeKind, id)?.company ?? '长安药厂');
    setBatchTargets([]);
    setBatchOpen(true);
  }

  function confirmBatchCopyFirst() {
    if (!batchTargets.length) {
      addToast({ type: 'error', title: '请选择目标品种', description: '至少选择一个目标品种' });
      return;
    }
    setBatchOpen(false);
    setBatchConfirm(true);
  }

  function confirmBatchCopyFinal() {
    const kind = activeKind;
    const src = batchSource;
    setBindings((prev) => {
      const next = clone(prev);
      batchTargets.forEach((t) => { next[kind][t] = src; });
      return next;
    });
    setBatchConfirm(false);
    addToast({ type: 'success', title: '批量绑定成功', description: `${productName(kind, src)} 的价目配置已应用到 ${batchTargets.length} 个品种，后续编辑自动同步` });
  }

  // 解绑（双重确认）
  function askUnbind(kind: Kind, id: number) {
    setUnbindTarget({ kind, id, name: productName(kind, id), owner: productName(kind, ownerOf(kind, id)) });
    setUnbindStep2(false);
  }

  function confirmUnbind1() {
    setUnbindStep2(true);
  }

  function confirmUnbind2() {
    if (!unbindTarget) return;
    const { kind, id } = unbindTarget;
    const owner = ownerOf(kind, id);
    if (kind === 'report') {
      setReportCfg((prev) => ({ ...prev, [id]: clone(prev[owner]) }));
      setReportRatios((prev) => ({ ...prev, [id]: { ...prev[owner] } }));
    } else {
      setConfigs((prev) => {
        const next = clone(prev);
        next[kind][id] = clone(prev[kind][owner]);
        return next;
      });
      if (kind === 'base') setBaseRatios((prev) => ({ ...prev, [id]: { ...prev[owner] } }));
    }
    setBindings((prev) => ({ ...prev, [kind]: { ...prev[kind], [id]: id } }));
    setUnbindTarget(null);
    addToast({ type: 'success', title: '已解除绑定', description: `${unbindTarget.name} 已使用独立的价目配置（当前值已保留为副本）` });
  }

  // 保存与快照
  function savePrice(kind: Kind) {
    const owner = ownerOf(kind, editId);
    setConfigs((prev) => {
      const next = clone(prev);
      next[kind][owner] = clone(draftGroups);
      return next;
    });
    setSnapGroups(JSON.stringify(clone(draftGroups)));
    setSnapMode(JSON.stringify(priceMode));
    setHasUnsaved(false);
    addToast({ type: 'success', title: '保存价格配置', description: `${productName(kind, editId)}（${isBound ? `使用 ${editOwnerProduct?.tradeName ?? ''} 的价目配置` : '独立配置'}）` });
  }

  function saveReport() {
    const owner = ownerOf('report', editId);
    setReportCfg((prev) => ({ ...prev, [owner]: clone(draftReports) }));
    setSnapReports(JSON.stringify(clone(draftReports)));
    setHasUnsaved(false);
    addToast({ type: 'success', title: '保存报告价格配置', description: productName('report', editId) });
  }

  function saveRatio(kind: Kind) {
    const owner = ownerOf(kind, editId);
    if (kind === 'base') setBaseRatios((prev) => ({ ...prev, [owner]: { ...draftRatio } }));
    else setReportRatios((prev) => ({ ...prev, [owner]: { ...draftRatio } }));
    setSnapRatio(JSON.stringify(draftRatio));
    setHasUnsaved(false);
    addToast({ type: 'success', title: '保存比例配置', description: productName(kind, editId) });
  }

  function saveCity() {
    setCityLevels(clone(draftCity));
    setSnapCity(JSON.stringify(clone(draftCity)));
    setSnapMode(JSON.stringify(priceMode));
    setHasUnsaved(false);
    addToast({ type: 'success', title: '保存成功', description: '城市级别已保存' });
  }

  function handleRatioSave(kind: Kind, type: string, sum: number) {
    if (sum !== 100) {
      setRatioConfirm({ type, sum });
      return;
    }
    saveRatio(kind);
  }

  function confirmRatioSave() {
    const kind = page === 'base-ratio' ? 'base' : 'report';
    saveRatio(kind);
    setRatioConfirm(null);
  }

  // 恢复默认
  function confirmRestore() {
    if (page === 'base-price' || page === 'gs-price') {
      const defaults = page === 'gs-price' ? createGsGroups() : createBaseGroups();
      setDraftGroups(defaults);
      setSnapGroups(JSON.stringify(defaults));
    } else if (page === 'report-price') {
      const defaults = createReportGroups();
      setDraftReports(defaults);
      setSnapReports(JSON.stringify(defaults));
    } else if (page === 'base-ratio' || page === 'report-ratio') {
      const defaults = page === 'base-ratio' ? { ...BASE_RATIO_DEFAULTS } : { ...REPORT_RATIO_DEFAULTS };
      setDraftRatio(defaults);
      setSnapRatio(JSON.stringify(defaults));
    } else if (page === 'city-level') {
      const defaults = clone(CITY_LEVEL_DATA);
      setDraftCity(defaults);
      setSnapCity(JSON.stringify(defaults));
    }
    setHasUnsaved(false);
    setRestoreModal('');
    addToast({ type: 'success', title: `已恢复默认${restoreModal.replace(/^恢复默认/, '')}`, description: '当前品种配置已重置为默认模板值' });
  }

  // 查看修改
  const FIELD_LABELS: Record<string, string> = {
    price: '金额', privatePrice: '对私金额', limit: '人数限制', overPrice: '超员金额', privateOverPrice: '对私超员金额',
    line1: '一线', lineNew1: '新一线', line2: '二线', line3: '三线', line4: '四线', line5: '五线',
    privateLine1: '对私一线', privateLineNew1: '对私新一线', privateLine2: '对私二线', privateLine3: '对私三线', privateLine4: '对私四线', privateLine5: '对私五线',
  };
  const REGION_FIELD_PROPS = [...REGION_PUBLIC_FIELDS.map((f) => f.prop), ...REGION_PRIVATE_FIELDS.map((f) => f.prop)];
  const PRICE_FIELD_PROPS = ['price', 'privatePrice', 'limit', 'overPrice', 'privateOverPrice', ...REGION_FIELD_PROPS];

  function leafLabel(row: PriceRow, leaf: Leaf) {
    return row.hasLevels ? `${row.cat2} · ${leaf.name}` : row.cat2;
  }

  function collectPriceChanges(before: Group[], after: Group[], module: string) {
    const result: typeof changesList = [];
    after.forEach((group, gi) => {
      const oldGroup = before[gi];
      if (!oldGroup) return;
      group.rows.forEach((row, ri) => {
        const oldRow = oldGroup.rows[ri];
        if (!oldRow) return;
        row.levels.forEach((leaf, li) => {
          const oldLeaf = oldRow.levels[li];
          if (!oldLeaf) return;
          const label = leafLabel(row, leaf);
          PRICE_FIELD_PROPS.forEach((field) => {
            if ((leaf[field as keyof Leaf] ?? '') !== (oldLeaf[field as keyof Leaf] ?? '')) {
              result.push({
                module,
                item: `${group.cat1} / ${label}`,
                field: FIELD_LABELS[field] ?? field,
                before: (oldLeaf[field as keyof Leaf] as string) || '空',
                after: (leaf[field as keyof Leaf] as string) || '空',
              });
            }
          });
          if (leaf.isContract !== oldLeaf.isContract) {
            result.push({ module, item: `${group.cat1} / ${label}`, field: '是否发包金额', before: oldLeaf.isContract ? '是' : '否', after: leaf.isContract ? '是' : '否' });
          }
        });
      });
    });
    return result;
  }

  function collectReportChanges(before: ReportGroup[], after: ReportGroup[]) {
    const result: typeof changesList = [];
    after.forEach((group, gi) => {
      const oldGroup = before[gi];
      if (!oldGroup) return;
      group.rows.forEach((row, ri) => {
        const oldRow = oldGroup.rows[ri];
        if (!oldRow) return;
        if ((row.price || '') !== (oldRow.price || '')) {
          result.push({ module: '报告价目表', item: `${group.cat1} / ${row.cat2}`, field: '金额', before: oldRow.price || '空', after: row.price || '空' });
        }
      });
    });
    return result;
  }

  function collectRatioChanges(before: Record<string, number>, after: Record<string, number>, module: string, fields: { prop: string; label: string }[]) {
    const result: typeof changesList = [];
    fields.forEach((f) => {
      if ((before[f.prop] || 0) !== (after[f.prop] || 0)) {
        result.push({ module, item: f.label, field: '比例值', before: `${before[f.prop] || 0}%`, after: `${after[f.prop] || 0}%` });
      }
    });
    return result;
  }

  function collectCityChanges(before: CityLevel[], after: CityLevel[]) {
    const result: typeof changesList = [];
    after.forEach((item, i) => {
      const old = before[i];
      if (old && item.level !== old.level) {
        result.push({ module: '城市级别', item: item.city, field: '当前级别', before: old.level, after: item.level });
      }
    });
    return result;
  }

  function collectModeChanges(before: string, after: { base: PriceMode; gs: PriceMode }) {
    const result: typeof changesList = [];
    let old: { base: PriceMode; gs: PriceMode };
    try { old = JSON.parse(before) as { base: PriceMode; gs: PriceMode }; } catch { return result; }
    if (old.base !== after.base) {
      result.push({ module: '基础价目表', item: '页面顶部配置开关', field: '价格模式', before: old.base === 'region' ? '区域模式' : '传统模式', after: after.base === 'region' ? '区域模式' : '传统模式' });
    }
    if (old.gs !== after.gs) {
      result.push({ module: '公私分离价目表', item: '页面顶部配置开关', field: '价格模式', before: old.gs === 'region' ? '区域模式' : '传统模式', after: after.gs === 'region' ? '区域模式' : '传统模式' });
    }
    return result;
  }

  function computeChanges() {
    let result: typeof changesList = [];
    if (page === 'base-price') result = collectPriceChanges(JSON.parse(snapGroups), draftGroups, '基础价目表');
    else if (page === 'gs-price') result = collectPriceChanges(JSON.parse(snapGroups), draftGroups, '公私分离价目表');
    else if (page === 'report-price') result = collectReportChanges(JSON.parse(snapReports), draftReports);
    else if (page === 'base-ratio') result = collectRatioChanges(JSON.parse(snapRatio), draftRatio, '基础比例', BASE_RATIO_FIELDS);
    else if (page === 'report-ratio') result = collectRatioChanges(JSON.parse(snapRatio), draftRatio, '报告比例', REPORT_RATIO_FIELDS);
    else if (page === 'city-level') result = collectCityChanges(JSON.parse(snapCity), draftCity);
    result = result.concat(collectModeChanges(snapMode, priceMode));
    if (!result.length) {
      addToast({ type: 'info', title: '暂无修改', description: '当前配置与上次保存一致' });
      return;
    }
    setChangesList(result);
    setChangesOpen(true);
  }

  // 展开/收起
  function setAllLevelsExpanded(expanded: boolean) {
    setDraftGroups((prev) => prev.map((g) => ({ ...g, rows: g.rows.map((r) => (r.hasLevels ? { ...r, expanded } : r)) })));
  }

  // 发包金额切换：同工作组唯一
  function handleContractChange(row: PriceRow, leaf: Leaf) {
    setHasUnsaved(true);
    if (!leaf.isContract) return;
    let replaced = '';
    const groups = clone(draftGroups);
    groups.forEach((g) => {
      g.rows.forEach((r) => {
        r.levels.forEach((sub) => {
          if (sub !== leaf && sub.groupNo === leaf.groupNo && sub.isContract) {
            sub.isContract = false;
            replaced = leafLabel(r, sub);
          }
        });
      });
    });
    setDraftGroups(groups);
    if (replaced) {
      addToast({ type: 'info', title: '发包金额已切换', description: `工作组 ${leaf.groupNo} 发包金额已由「${replaced}」切换为「${leafLabel(row, leaf)}」` });
    }
  }

  // 显示分组（对齐原型 getDisplayGroups）
  function getDisplayGroups(view: TaskView): { cat1: string; displayRows: { type: 'master' | 'leaf' | 'flat'; row: PriceRow; leaf: Leaf; configured: number; total: number }[]; totalCount: number; configuredCount: number; statusText: string }[] {
    const kind = page === 'gs-price' ? 'gs' : 'base';
    const filterValue = tabFilters[kind][view];
    const search = searchFilters[kind];
    const keyword = search.keyword.trim();
    const category = search.category;
    return draftGroups
      .map((group) => {
        if (category && group.cat1 !== category) return null;
        const rows = view === 'meeting' ? group.rows.filter((r) => r.isMeeting) : group.rows;
        const groupHit = !!keyword && group.cat1.includes(keyword);
        const leafVisible = (row: PriceRow, leaf: Leaf) => {
          if (keyword && !groupHit) {
            if (!row.cat2.includes(keyword) && !leaf.name.includes(keyword)) return false;
          }
          if (filterValue === 'all') return true;
          if (filterValue === 'unconfigured') return statusForView(leaf, view) === '未配置';
          if (filterValue === 'configured') return statusForView(leaf, view) === '已配置';
          if (filterValue === 'private') return REGION_PRIVATE_FIELDS.some((f) => !isConfigured(leaf[f.prop as keyof Leaf] as string));
          if (filterValue === 'contract') return leaf.isContract === true;
          return true;
        };
        const allLeaves: Leaf[] = [];
        rows.forEach((r) => r.levels.forEach((l) => allLeaves.push(l)));
        const totalCount = allLeaves.length;
        const configuredCount = allLeaves.filter((l) => statusForView(l, view) === '已配置').length;
        const displayRows: { type: 'master' | 'leaf' | 'flat'; row: PriceRow; leaf: Leaf; configured: number; total: number }[] = [];
        rows.forEach((row) => {
          if (row.hasLevels) {
            const rowConfigured = row.levels.filter((l) => statusForView(l, view) === '已配置').length;
            let visibleLeaves: Leaf[];
            if (!keyword && filterValue === 'all') {
              visibleLeaves = row.expanded ? row.levels : [];
            } else {
              visibleLeaves = row.levels.filter((l) => leafVisible(row, l));
            }
            if ((!keyword && filterValue === 'all') || visibleLeaves.length > 0) {
              displayRows.push({ type: 'master', row, leaf: row.levels[0], configured: rowConfigured, total: row.levels.length });
              visibleLeaves.forEach((l) => displayRows.push({ type: 'leaf', row, leaf: l, configured: rowConfigured, total: row.levels.length }));
            }
          } else if (leafVisible(row, row.levels[0])) {
            displayRows.push({ type: 'flat', row, leaf: row.levels[0], configured: 0, total: 1 });
          }
        });
        return {
          cat1: group.cat1,
          displayRows,
          totalCount,
          configuredCount,
          statusText: getGroupStatusText(configuredCount, totalCount),
        };
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.displayRows.length > 0);
  }

  function getTaskSummary(view: TaskView) {
    let total = 0;
    let configured = 0;
    draftGroups.forEach((g) => {
      g.rows.forEach((r) => {
        if (view === 'meeting' && !r.isMeeting) return;
        r.levels.forEach((l) => {
          total += 1;
          if (statusForView(l, view) === '已配置') configured += 1;
        });
      });
    });
    return `${configured}/${total} 项已配置`;
  }

  function getKeywordMatchCount(view: TaskView, keyword: string) {
    const kw = keyword.trim();
    if (!kw) return 0;
    let count = 0;
    draftGroups.forEach((g) => {
      const groupHit = g.cat1.includes(kw);
      g.rows.forEach((r) => {
        if (view === 'meeting' && !r.isMeeting) return;
        r.levels.forEach((l) => {
          if (groupHit || r.cat2.includes(kw) || l.name.includes(kw)) count += 1;
        });
      });
    });
    return count;
  }

  const priceModeOfKind = (k: Kind) => (k === 'gs' ? priceMode.gs : priceMode.base);
  const ratioSum = Object.values(draftRatio).reduce((s, v) => s + (Number(v) || 0), 0);
  const kindListPage: Record<Kind, Page> = { base: 'base-list', gs: 'gs-list', report: 'report-list' };
  const KIND_LABEL: Record<Kind, string> = { base: '基础价目表', gs: '公私分离价目表', report: '报告价目表' };

  // ===== 渲染 =====

  function renderModeSwitch(kind: Kind) {
    const mode = priceModeOfKind(kind);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>价格模式：</span>
        <button
          type="button"
          onClick={() => {
            setPriceMode((prev) => ({ ...prev, [kind === 'gs' ? 'gs' : 'base']: mode === 'region' ? 'traditional' : 'region' }));
            setHasUnsaved(true);
          }}
          disabled={!canWrite}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6,
            background: mode === 'region' ? 'var(--color-brand-subtle)' : '#F3F4F6',
            border: `1px solid ${mode === 'region' ? 'var(--color-brand)' : 'var(--color-border)'}`,
            color: mode === 'region' ? 'var(--color-brand)' : '#667085', cursor: canWrite ? 'pointer' : 'not-allowed', fontSize: 'var(--fs-12)',
          }}
        >
          {mode === 'region' ? '区域模式' : '传统模式'}
        </button>
      </div>
    );
  }

  function renderInfoBar(text: React.ReactNode, tone: 'plain' | 'warning' | 'success' | 'danger' = 'plain') {
    const map = {
      plain: { bg: '#fff', fg: '#606266', border: 'var(--color-border)' },
      warning: { bg: '#FDF6EC', fg: '#C77A16', border: '#F5DCAC' },
      success: { bg: '#F0F9EB', fg: '#248A5A', border: '#BBE7CE' },
      danger: { bg: '#FEF0F0', fg: '#C73A3A', border: '#F9C6C6' },
    }[tone];
    return (
      <div style={{
        background: map.bg, color: map.fg, border: `1px solid ${map.border}`, borderRadius: 6,
        padding: '10px 12px', marginBottom: 16, lineHeight: 1.7, fontSize: 'var(--fs-13)',
      }}>
        {text}
      </div>
    );
  }

  function renderList(kind: Kind) {
    const products = filteredProducts;
    const title = pageTitleOf[kindListPage[kind]];
    const f = listFilters[kind];
    const isBase = kind === 'base';
    const isGs = kind === 'gs';
    const isReport = kind === 'report';
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)' }}>{title}</h1>
          <span style={{
            padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)',
            background: '#ECF5FF', color: '#409EFF', border: '1px solid #B3D8FF',
          }}>品种实际配置</span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#909399' }}>
            {isBase ? '维护委托代征业务使用的基础价目与配置入口。' : isGs ? '维护公私分离升级版场景价格，与基础价目表保持同一套层级与 0/空 判定逻辑。' : '维护通道代付报告类价格与比例配置。'}
          </span>
        </div>

        {/* 复制配置 + 多品种绑定入口 */}
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 12 }}>复制配置</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={copyForms[kind].source}
                onChange={(e) => setCopyForms((prev) => ({ ...prev, [kind]: { ...prev[kind], source: Number(e.target.value) } }))}
                style={{ ...inputStyle, width: 240 }}
              >
                {PRODUCTS[kind].map((p) => <option key={p.id} value={p.id}>{p.tradeName}（{p.commonName}）</option>)}
              </select>
              <select
                value={copyForms[kind].target}
                onChange={(e) => setCopyForms((prev) => ({ ...prev, [kind]: { ...prev[kind], target: Number(e.target.value) } }))}
                style={{ ...inputStyle, width: 240 }}
              >
                {PRODUCTS[kind].map((p) => <option key={p.id} value={p.id}>{p.tradeName}（{p.commonName}）</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {isBase && (
                <>
                  <Button variant="secondary" size="md" icon={<Copy size={14} />} onClick={() => showCopyModal('基础价目表', '价格配置')}>复制价格配置</Button>
                  <Button variant="secondary" size="md" icon={<Percent size={14} />} onClick={() => showCopyModal('基础价目表', '发包比例')}>复制发包比例</Button>
                  <Button variant="soft" size="md" icon={<Link2 size={14} />} onClick={showBindSingle}>绑定价目配置</Button>
                </>
              )}
              {isGs && (
                <>
                  <Button variant="secondary" size="md" icon={<Copy size={14} />} onClick={() => showCopyModal('公私分离价目表', '价格配置')}>复制价格配置</Button>
                  <Button variant="secondary" size="md" icon={<Percent size={14} />} onClick={() => showCopyModal('公私分离价目表', '比例表复制')}>比例表复制</Button>
                  <Button variant="soft" size="md" icon={<Link2 size={14} />} onClick={showBindSingle}>绑定价目配置</Button>
                </>
              )}
              {isReport && (
                <>
                  <Button variant="secondary" size="md" icon={<FileText size={14} />} onClick={() => showCopyModal('报告价目表', '报告价格')}>复制报告价格</Button>
                  <Button variant="secondary" size="md" icon={<Percent size={14} />} onClick={() => showCopyModal('报告价目表', '报告比例')}>复制报告比例</Button>
                  <Button variant="soft" size="md" icon={<Link2 size={14} />} onClick={showBindSingle}>绑定价目配置</Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 品种列表 */}
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: 'var(--color-text-1)' }}>品种列表</div>
            <span style={{ fontSize: 'var(--fs-12)', color: '#909399' }}>共 {products.length} 条记录</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '0 16px 12px' }}>
            <input placeholder="通用名" value={f.commonName} onChange={(e) => setListFilters((prev) => ({ ...prev, [kind]: { ...prev[kind], commonName: e.target.value } }))} style={inputStyle} />
            <input placeholder="商品名" value={f.tradeName} onChange={(e) => setListFilters((prev) => ({ ...prev, [kind]: { ...prev[kind], tradeName: e.target.value } }))} style={inputStyle} />
            <input placeholder="药品上市许可持有人" value={f.company} onChange={(e) => setListFilters((prev) => ({ ...prev, [kind]: { ...prev[kind], company: e.target.value } }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
            <Button variant="primary" size="sm" onClick={() => addToast({ type: 'success', title: `${title}列表`, description: '已按当前条件筛选' })}>筛选</Button>
            <Button variant="secondary" size="sm" onClick={() => resetListFilters(kind)}>重置</Button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {['序号', '通用名', '商品名', '批准文号', '包装', '规格', '单位', '药品上市许可持有人'].concat(isReport ? [] : ['算费方式']).concat(['操作']).map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const owner = ownerOf(kind, p.id);
                const bound = owner !== p.id;
                const ownerName = productName(kind, owner);
                return (
                  <tr key={p.id}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}>{p.commonName}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {p.tradeName}
                        {bound && <Tag label={`已绑定：${ownerName}`} color="info" />}
                      </div>
                    </td>
                    <td style={td}>{p.approvalNumber}</td>
                    <td style={td}>{p.package}</td>
                    <td style={td}>{p.spec}</td>
                    <td style={td}>{p.unit}</td>
                    <td style={td}>{p.company}</td>
                    {!isReport && <td style={td}>{p.calcType ?? '—'}</td>}
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {isBase && (
                          <>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openPriceEdit('base', p.id)}>编辑基础价格</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openRatioEdit(p.id, 'base')}>编辑发包比例</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => showBatchCopy(p.id, '批量复制价格')}>批量复制价格</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openCityLevel()}>配置品种城市级别</button>
                          </>
                        )}
                        {isGs && (
                          <>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openPriceEdit('gs', p.id)}>编辑公私分离价格</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => showBatchCopy(p.id, '批量复制价格')}>批量复制价格</button>
                          </>
                        )}
                        {isReport && (
                          <>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openReportEdit(p.id)}>编辑报告价格</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => openRatioEdit(p.id, 'report')}>编辑报告比例</button>
                            <button type="button" style={linkBtn} disabled={!canWrite} onClick={() => showBatchCopy(p.id, '批量复制价目表')}>批量复制价目表</button>
                          </>
                        )}
                        {bound && (
                          <button type="button" style={{ ...linkBtn, color: '#C73A3A' }} onClick={() => askUnbind(kind, p.id)}>解绑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!products.length && (
                <tr><td colSpan={isReport ? 9 : 10} style={{ ...td, textAlign: 'center', color: '#9CA3AF' }}>暂无符合条件的品种</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderPriceEdit(kind: Kind) {
    const isGs = kind === 'gs';
    const mode = priceModeOfKind(kind);
    const title = isGs ? '公私分离价目表' : '基础价目表';
    const searchKey = isGs ? 'gs' : 'base';
    const tabKey = searchKey;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)' }}>{title}</h1>
          <span style={{
            padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)',
            background: '#ECF5FF', color: '#409EFF', border: '1px solid #B3D8FF',
          }}>品种实际配置</span>
        </div>
        {renderInfoBar(
          <>
            当前品种：{editProduct.tradeName}（{editProduct.commonName} / {editProduct.approvalNumber} / {editProduct.company}）<br />
            {isBound && <><strong style={{ color: 'var(--color-brand)' }}>当前使用 {editOwnerProduct?.tradeName} 的价目配置</strong>（编辑将同步到全部已绑定品种）<br /></>}
            药厂开关：{isGs ? '公私分离升级版' : '公私分离基础版'}；价格模式：{mode === 'region' ? '区域模式' : '传统模式'}。
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Button variant="primary" size="md" onClick={() => savePrice(kind)}>保存价格配置</Button>
          <Button variant="secondary" size="md" icon={<CheckCircle2 size={14} />} onClick={computeChanges}>查看修改</Button>
          <Button variant="danger" size="md" icon={<RefreshCw size={14} />} onClick={() => setRestoreModal('恢复默认价格')}>恢复默认价格</Button>
          <Button variant="secondary" size="md" icon={<Download size={14} />} onClick={() => addToast({ type: 'success', title: '导出价格配置', description: '已触发' })}>导出价格配置</Button>
          <Button variant="secondary" size="md" icon={<Upload size={14} />} onClick={() => addToast({ type: 'success', title: '导入价格配置', description: '已触发' })}>导入价格配置</Button>
          <span style={{ fontSize: 'var(--fs-12)', color: '#909399' }}>统一规则：空=未配置，0=已配置。</span>
          <div style={{ marginLeft: 'auto' }}>{renderModeSwitch(kind)}</div>
        </div>

        {/* task-nav */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
          {([
            ['basic', '基础价格', getTaskSummary('basic')],
            ['meeting', '会议价格', getTaskSummary('meeting')],
            ['region', '区域价格', mode === 'region' ? '覆盖全部业务（含会议），新增对私一线至对私五线。' : '覆盖全部业务（含会议），当前为传统模式，区域字段仅占位不生效。'],
          ] as [TaskView, string, string][]).map(([view, label, summary]) => (
            <div
              key={view}
              onClick={() => setTaskView(view)}
              style={{
                border: taskView === view ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
                borderRadius: 6, padding: '12px 16px', cursor: 'pointer', background: '#fff',
                boxShadow: taskView === view ? '0 2px 8px rgba(23,107,91,0.18)' : 'none',
              }}
            >
              <div style={{ fontSize: 'var(--fs-15)', fontWeight: 700, marginBottom: 8 }}>{label}</div>
              <div style={{ color: '#909399', fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>{summary}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 0 }}>
          {taskView === 'basic' && (
            <div style={{ padding: 16 }}>
              {renderInfoBar(
                isGs
                  ? '基础价格对齐基础价目表：空=未配置，0=已配置；对私金额纳入配置完成检查且不可灰化。含等级档位的服务项展开后按等级逐档配置，可用「统一价」一次应用到全部档位。'
                  : '基础价格负责金额、对私金额与发包标记。含等级档位的服务项（如医院拜访）展开后按等级逐档配置，可用「统一价」一次应用到全部档位。',
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <select
                  value={searchFilters[searchKey].category}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], category: e.target.value } }))}
                  style={{ ...inputStyle, width: 200 }}
                >
                  <option value="">全部价目类别</option>
                  {draftGroups.map((g) => <option key={g.cat1} value={g.cat1}>{g.cat1}</option>)}
                </select>
                <input
                  placeholder="输入服务项 / 等级名称，输入即筛选"
                  value={searchFilters[searchKey].keyword}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], keyword: e.target.value } }))}
                  style={{ ...inputStyle, width: 300 }}
                />
                <Button variant="secondary" size="sm" onClick={() => setSearchFilters((prev) => ({ ...prev, [searchKey]: { category: '', keyword: '' } }))}>重置</Button>
                {searchFilters[searchKey].keyword && (
                  <span style={{ fontSize: 'var(--fs-12)', color: '#909399' }}>匹配 {getKeywordMatchCount('basic', searchFilters[searchKey].keyword)} 项</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['all', '全部'], ['unconfigured', '只看未配置'], ['configured', '只看已配置'], ...(isGs ? [] : [['contract', '只看发包金额']])].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTabFilters((prev) => ({ ...prev, [tabKey]: { ...prev[tabKey], basic: val } }))}
                      style={{
                        padding: '4px 12px', borderRadius: 4, fontSize: 'var(--fs-12)', cursor: 'pointer',
                        background: tabFilters[tabKey].basic === val ? 'var(--color-brand)' : '#fff',
                        color: tabFilters[tabKey].basic === val ? '#fff' : '#667085',
                        border: `1px solid ${tabFilters[tabKey].basic === val ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" size="sm" onClick={() => { setDraftGroups((prev) => prev.map((g) => ({ ...g, rows: g.rows.map((r) => (r.hasLevels ? { ...r, expanded: true } : r)) }))); }}>展开全部</Button>
                  <Button variant="secondary" size="sm" onClick={() => setAllLevelsExpanded(false)}>收起全部</Button>
                </div>
              </div>
              {renderGroupTables('basic', isGs)}
            </div>
          )}

          {taskView === 'meeting' && (
            <div style={{ padding: 16 }}>
              {renderInfoBar(
                isGs
                  ? '会议价格仅保留人数限制、超员金额、对私超员金额，不重复配置金额与对私金额。会议行无等级档位，单行直接编辑。'
                  : '会议价格只补充人数限制、超员金额、对私超员金额；金额、对私金额与发包标记在基础价格视图维护。会议行无等级档位，单行直接编辑。',
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <select
                  value={searchFilters[searchKey].category}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], category: e.target.value } }))}
                  style={{ ...inputStyle, width: 200 }}
                >
                  <option value="">全部价目类别</option>
                  {draftGroups.map((g) => <option key={g.cat1} value={g.cat1}>{g.cat1}</option>)}
                </select>
                <input
                  placeholder="输入服务项 / 等级名称，输入即筛选"
                  value={searchFilters[searchKey].keyword}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], keyword: e.target.value } }))}
                  style={{ ...inputStyle, width: 300 }}
                />
                <Button variant="secondary" size="sm" onClick={() => setSearchFilters((prev) => ({ ...prev, [searchKey]: { category: '', keyword: '' } }))}>重置</Button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[['all', '全部'], ['unconfigured', '只看未配置'], ['configured', '只看已配置']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTabFilters((prev) => ({ ...prev, [tabKey]: { ...prev[tabKey], meeting: val } }))}
                    style={{
                      padding: '4px 12px', borderRadius: 4, fontSize: 'var(--fs-12)', cursor: 'pointer',
                      background: tabFilters[tabKey].meeting === val ? 'var(--color-brand)' : '#fff',
                      color: tabFilters[tabKey].meeting === val ? '#fff' : '#667085',
                      border: `1px solid ${tabFilters[tabKey].meeting === val ? 'var(--color-brand)' : 'var(--color-border)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {renderGroupTables('meeting', isGs)}
            </div>
          )}

          {taskView === 'region' && (
            <div style={{ padding: 16 }}>
              {renderInfoBar(
                isGs
                  ? '区域价格覆盖全部业务（含会议），删除重复金额字段，新增对私一线至对私五线。'
                  : '区域价格是基础价格补充，不重复配置金额，覆盖全部业务（含会议）并保留业务分类。',
              )}
              {mode !== 'region' ? (
                renderInfoBar('当前为传统模式，区域价格字段保留但整体置灰；如需配置区域价格，请先切换顶部“价格模式”为“区域模式”。', 'warning')
              ) : (
                renderInfoBar(isGs ? '当前为区域模式，区域字段可直接编辑；公私分离场景下对私城市线级字段为必查。' : '当前为区域模式，区域字段可直接编辑；对私城市线级字段用于公私分离场景。', 'success')
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <select
                  value={searchFilters[searchKey].category}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], category: e.target.value } }))}
                  style={{ ...inputStyle, width: 200 }}
                >
                  <option value="">全部价目类别</option>
                  {draftGroups.map((g) => <option key={g.cat1} value={g.cat1}>{g.cat1}</option>)}
                </select>
                <input
                  placeholder="输入服务项 / 等级名称，输入即筛选"
                  value={searchFilters[searchKey].keyword}
                  onChange={(e) => setSearchFilters((prev) => ({ ...prev, [searchKey]: { ...prev[searchKey], keyword: e.target.value } }))}
                  style={{ ...inputStyle, width: 300 }}
                />
                <Button variant="secondary" size="sm" onClick={() => setSearchFilters((prev) => ({ ...prev, [searchKey]: { category: '', keyword: '' } }))}>重置</Button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[['all', '全部'], ['unconfigured', '只看未配置'], ['configured', '只看已配置'], ['private', '只看对私']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTabFilters((prev) => ({ ...prev, [tabKey]: { ...prev[tabKey], region: val } }))}
                    style={{
                      padding: '4px 12px', borderRadius: 4, fontSize: 'var(--fs-12)', cursor: 'pointer',
                      background: tabFilters[tabKey].region === val ? 'var(--color-brand)' : '#fff',
                      color: tabFilters[tabKey].region === val ? '#fff' : '#667085',
                      border: `1px solid ${tabFilters[tabKey].region === val ? 'var(--color-brand)' : 'var(--color-border)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {renderGroupTables('region', isGs)}
            </div>
          )}
        </div>
      </>
    );
  }

  function renderGroupTables(view: TaskView, isGs: boolean) {
    const kind = isGs ? 'gs' : 'base';
    const filterValue = tabFilters[kind][view];
    const mode = priceModeOfKind(kind);
    const groups = getDisplayGroups(view);
    return (
      <div>
        {groups.map((group) => (
          <div key={group.cat1} style={{ border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: '#F9FAFC', fontWeight: 700, fontSize: 'var(--fs-13)', color: 'var(--color-text-1)',
            }}>
              <span>{group.cat1}</span>
              <span style={{ fontWeight: 400, color: '#909399' }}>{group.configuredCount}/{group.totalCount} 已配置 · {group.statusText}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {view === 'basic' && ['服务项 / 等级', '金额', '对私金额', '工作组号', '是否发包金额', '价格来源', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}
                  {view === 'meeting' && ['类别', '人数限制', '超员金额', '对私超员金额', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}
                  {view === 'region' && (['服务项 / 等级'].concat(filterValue === 'private' ? [] : REGION_PUBLIC_FIELDS.map((f) => f.label)).concat(REGION_PRIVATE_FIELDS.map((f) => f.label)).concat(['状态'])).map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {group.displayRows.map((d, i) => (
                  <tr key={`${d.type}-${d.row.id}-${d.leaf.name}-${i}`} style={{ background: d.type === 'leaf' ? '#FAFCFF' : undefined }}>
                    {view !== 'meeting' && (
                      <td style={td}>
                        {d.type === 'master' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setDraftGroups((prev) => prev.map((g) => ({ ...g, rows: g.rows.map((r) => (r.id === d.row.id ? { ...r, expanded: !r.expanded } : r)) })))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#909399', fontSize: 'var(--fs-12)', padding: 0 }}
                            >
                              {d.row.expanded ? '▼' : '▶'}
                            </button>
                            <strong style={{ color: 'var(--color-text-1)' }}>{d.row.cat2}</strong>
                            <span style={{ color: '#909399', fontSize: 'var(--fs-12)' }}>{d.configured}/{d.total} 档已配置</span>
                            {canWrite && <button type="button" style={linkBtn} onClick={() => setUnified({ row: d.row, price: d.row.levels[0].price || '', privatePrice: d.row.levels[0].privatePrice || '' })}>统一价</button>}
                          </div>
                        ) : (
                          <div style={{ paddingLeft: 26 }}>
                            <span style={{ color: '#C0C4CC', marginRight: 6 }}>├</span>{d.leaf.name}
                          </div>
                        )}
                      </td>
                    )}
                    {view === 'basic' && (
                      d.type === 'master' ? (
                        <>
                          <td style={td}><span style={{ color: '#909399' }}>—</span></td>
                          <td style={td}><span style={{ color: '#909399' }}>—</span></td>
                          <td style={td}><span style={{ color: '#909399' }}>{d.row.groupNo}</span></td>
                          <td style={td}><span style={{ color: '#909399' }}>{d.row.levels.some((l) => l.isContract) ? '含发包行' : '—'}</span></td>
                          <td style={td}><span style={{ color: '#909399' }}>—</span></td>
                          <td style={td}><StatusPill text={d.configured === d.total ? '已配置' : '未配置'} /></td>
                        </>
                      ) : (
                        <>
                          <td style={td}><input value={d.leaf.price} onChange={(e) => { patchLeaf(d.row, d.leaf, { price: e.target.value }); }} disabled={!canWrite} style={{ ...inputStyle, height: 28 }} /></td>
                          <td style={td}><input value={d.leaf.privatePrice} onChange={(e) => { patchLeaf(d.row, d.leaf, { privatePrice: e.target.value }); }} disabled={!canWrite} style={{ ...inputStyle, height: 28 }} /></td>
                          <td style={td}><span style={{ color: '#909399' }}>{d.leaf.groupNo}</span></td>
                          <td style={td} align="center">
                            <input type="checkbox" checked={d.leaf.isContract} disabled={!canWrite} onChange={(e) => { const next = { ...d.leaf, isContract: e.target.checked }; d.leaf.isContract = e.target.checked; setDraftGroups((prev) => prev.map((g) => ({ ...g, rows: g.rows.map((r) => (r.id === d.row.id ? { ...r, levels: r.levels.map((l) => (l === d.leaf ? next : l)) } : r)) }))); setHasUnsaved(true); handleContractChange(d.row, next); }} />
                          </td>
                          <td style={td}><span style={{ color: '#909399' }}>{d.leaf.source}</span></td>
                          <td style={td}><StatusPill text={getBasicStatus(d.leaf, true)} /></td>
                        </>
                      )
                    )}
                    {view === 'meeting' && (
                      <>
                        <td style={td}><span style={{ paddingLeft: 26 }}><span style={{ color: '#C0C4CC', marginRight: 6 }}>├</span>{d.leaf.name}</span></td>
                        <td style={td}><input value={d.leaf.limit} onChange={(e) => { patchLeaf(d.row, d.leaf, { limit: e.target.value }); }} disabled={!canWrite} style={{ ...inputStyle, height: 28 }} /></td>
                        <td style={td}><input value={d.leaf.overPrice} onChange={(e) => { patchLeaf(d.row, d.leaf, { overPrice: e.target.value }); }} disabled={!canWrite} style={{ ...inputStyle, height: 28 }} /></td>
                        <td style={td}><input value={d.leaf.privateOverPrice} onChange={(e) => { patchLeaf(d.row, d.leaf, { privateOverPrice: e.target.value }); }} disabled={!canWrite} style={{ ...inputStyle, height: 28 }} /></td>
                        <td style={td}><StatusPill text={getMeetingStatus(d.leaf, true)} /></td>
                      </>
                    )}
                    {view === 'region' && (
                      <>
                        <td style={td}>
                          {d.type === 'master' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => setDraftGroups((prev) => prev.map((g) => ({ ...g, rows: g.rows.map((r) => (r.id === d.row.id ? { ...r, expanded: !r.expanded } : r)) })))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#909399', fontSize: 'var(--fs-12)', padding: 0 }}
                              >
                                {d.row.expanded ? '▼' : '▶'}
                              </button>
                              <strong style={{ color: 'var(--color-text-1)' }}>{d.row.cat2}</strong>
                              <span style={{ color: '#909399', fontSize: 'var(--fs-12)' }}>{d.configured}/{d.total} 档已配置</span>
                            </div>
                          ) : (
                            <div style={{ paddingLeft: 26 }}><span style={{ color: '#C0C4CC', marginRight: 6 }}>├</span>{d.row.hasLevels ? d.leaf.name : d.leaf.name}</div>
                          )}
                        </td>
                        {filterValue !== 'private' && REGION_PUBLIC_FIELDS.map((f) => (
                          <td key={f.prop} style={td}>
                            {d.type === 'master' ? <span style={{ color: '#909399' }}>—</span> : (
                              <input
                                value={d.leaf[f.prop as keyof Leaf] as string}
                                onChange={(e) => { patchLeaf(d.row, d.leaf, { [f.prop]: e.target.value }); }}
                                disabled={!canWrite || mode !== 'region'}
                                style={{ ...inputStyle, height: 28, ...(mode !== 'region' ? { background: '#F9FAFB', color: '#98A2B3' } : {}) }}
                              />
                            )}
                          </td>
                        ))}
                        {REGION_PRIVATE_FIELDS.map((f) => (
                          <td key={f.prop} style={td}>
                            {d.type === 'master' ? <span style={{ color: '#909399' }}>—</span> : (
                              <input
                                value={d.leaf[f.prop as keyof Leaf] as string}
                                onChange={(e) => { patchLeaf(d.row, d.leaf, { [f.prop]: e.target.value }); }}
                                disabled={!canWrite || mode !== 'region'}
                                style={{ ...inputStyle, height: 28, ...(mode !== 'region' ? { background: '#F9FAFB', color: '#98A2B3' } : {}) }}
                              />
                            )}
                          </td>
                        ))}
                        <td style={td}>
                          {d.type === 'master' ? <StatusPill text={d.configured === d.total ? '已配置' : '未配置'} /> : <StatusPill text={getRegionStatus(d.leaf, true)} />}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {!group.displayRows.length && (
                  <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#9CA3AF' }}>当前筛选条件下无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
        {!groups.length && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '32px 0' }}>当前筛选条件下无数据</div>
        )}
      </div>
    );
  }

  function patchLeaf(row: PriceRow, leaf: Leaf, patch: Partial<Leaf>) {
    setHasUnsaved(true);
    setDraftGroups((prev) => prev.map((g) => ({
      ...g,
      rows: g.rows.map((r) => {
        if (r.id !== row.id) return r;
        return { ...r, levels: r.levels.map((l) => (l === leaf ? { ...l, ...patch } : l)) };
      }),
    })));
  }

  function renderRatioEdit(kind: Kind) {
    const fields = kind === 'base' ? BASE_RATIO_FIELDS : REPORT_RATIO_FIELDS;
    const title = kind === 'base' ? '基础价目表' : '报告价目表';
    const headerClass = ratioSum === 100 ? { bg: '#F0F9EB', fg: '#248A5A', border: '#BBE7CE' } : ratioSum === 0 ? { bg: '#FEF0F0', fg: '#C73A3A', border: '#F9C6C6' } : { bg: '#FDF6EC', fg: '#C77A16', border: '#F5DCAC' };
    const headerText = ratioSum === 100 ? '合计正常' : ratioSum === 0 ? '未配置' : '合计异常（可保存）';
    const diffText = ratioSum === 100 ? '比例合计已达到 100%。' : ratioSum === 0 ? '当前所有比例为空或 0。' : ratioSum < 100 ? `距离 100% 还差 ${100 - ratioSum}%` : `超出 100% ${ratioSum - 100}%`;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)' }}>{title}</h1>
          <span style={{
            padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)',
            background: '#ECF5FF', color: '#409EFF', border: '1px solid #B3D8FF',
          }}>品种实际配置</span>
        </div>
        {renderInfoBar(
          <>
            当前品种：{editProduct.tradeName}（{editProduct.commonName} / {editProduct.approvalNumber} / {editProduct.company}）
            {isBound && <>；<strong style={{ color: 'var(--color-brand)' }}>当前使用 {editOwnerProduct?.tradeName} 的价目配置</strong>（编辑将同步到全部已绑定品种）</>}
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Button variant="primary" size="md" onClick={() => handleRatioSave(kind, kind === 'base' ? '基础比例' : '报告比例', ratioSum)}>保存比例配置</Button>
          <Button variant="secondary" size="md" icon={<CheckCircle2 size={14} />} onClick={computeChanges}>查看修改</Button>
          <Button variant="danger" size="md" icon={<RefreshCw size={14} />} onClick={() => setRestoreModal('恢复默认比例')}>恢复默认比例</Button>
        </div>
        <div style={{ background: '#fff', borderRadius: 6, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{
            padding: 16, borderRadius: 6, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8,
            background: headerClass.bg, color: headerClass.fg, border: `1px solid ${headerClass.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-15)' }}>当前合计价目比例</span>
              <strong style={{ fontSize: 'var(--fs-22)' }}>{ratioSum}%</strong>
              <span>{headerText}</span>
            </div>
            <div>{diffText}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            {fields.map((f) => (
              <div key={f.prop} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 8, borderBottom: '1px solid #EBEEF5' }}>
                <div style={{ flex: 1, color: '#606266' }}>{f.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={draftRatio[f.prop] ?? 0}
                    onChange={(e) => { setDraftRatio((prev) => ({ ...prev, [f.prop]: Number(e.target.value) || 0 })); setHasUnsaved(true); }}
                    disabled={!canWrite}
                    style={{ ...inputStyle, width: 180 }}
                  />
                  <span style={{ color: '#909399' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  function renderReportEdit() {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)' }}>报告价目表</h1>
          <span style={{
            padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)',
            background: '#ECF5FF', color: '#409EFF', border: '1px solid #B3D8FF',
          }}>品种实际配置</span>
        </div>
        {renderInfoBar(
          <>
            当前品种：{editProduct.tradeName}（{editProduct.commonName} / {editProduct.approvalNumber} / {editProduct.company}）
            {isBound && <>；<strong style={{ color: 'var(--color-brand)' }}>当前使用 {editOwnerProduct?.tradeName} 的价目配置</strong>（编辑将同步到全部已绑定品种）</>}
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Button variant="primary" size="md" onClick={saveReport}>保存报告价格配置</Button>
          <Button variant="secondary" size="md" icon={<CheckCircle2 size={14} />} onClick={computeChanges}>查看修改</Button>
          <Button variant="danger" size="md" icon={<RefreshCw size={14} />} onClick={() => setRestoreModal('恢复默认报告价格')}>恢复默认报告价格</Button>
          <Button variant="secondary" size="md" icon={<Download size={14} />} onClick={() => addToast({ type: 'success', title: '导出报告价格', description: '已触发' })}>导出报告价格</Button>
          <Button variant="secondary" size="md" icon={<Upload size={14} />} onClick={() => addToast({ type: 'success', title: '导入报告价格', description: '已触发' })}>导入报告价格</Button>
        </div>
        {renderInfoBar('报告价格判定规则：空=未配置，0=已配置。状态只看金额是否为空，不再把 0 判成未配置。')}
        <div style={{ background: '#fff', borderRadius: 6, padding: 0 }}>
          {draftReports.map((group) => (
            <div key={group.cat1} style={{ border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#F9FAFC', fontWeight: 700, fontSize: 'var(--fs-13)', color: 'var(--color-text-1)',
              }}>
                <span>{group.cat1}</span>
                <span style={{ fontWeight: 400, color: '#909399' }}>{group.rows.filter((r) => isConfigured(r.price)).length}/{group.rows.length} 已配置</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['价目小类', '金额（元/次）', '状态'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.cat2}>
                      <td style={td}>{row.cat2}</td>
                      <td style={td}>
                        <input
                          value={row.price}
                          onChange={(e) => {
                            setHasUnsaved(true);
                            setDraftReports((prev) => prev.map((g) => (g.cat1 === group.cat1 ? { ...g, rows: g.rows.map((r) => (r.cat2 === row.cat2 ? { ...r, price: e.target.value } : r)) } : g)));
                          }}
                          disabled={!canWrite}
                          style={{ ...inputStyle, height: 28, width: 220 }}
                        />
                      </td>
                      <td style={td}><StatusPill text={getReportStatus(row)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderCityLevel() {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)' }}>配置品种城市级别</h1>
          <span style={{
            padding: '2px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)',
            background: '#FDF6EC', color: '#E6A23C', border: '1px solid #FAECD8',
          }}>保持现状</span>
        </div>
        {renderInfoBar('当前入口保持“从基础价目表列表直接跳转独立页面”的现状，本次不改跳转逻辑。', 'warning')}
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['城市名称', '当前级别'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {draftCity.map((c, i) => (
                <tr key={c.city}>
                  <td style={td}>{c.city}</td>
                  <td style={td}>
                    <select
                      value={c.level}
                      onChange={(e) => {
                        setHasUnsaved(true);
                        setDraftCity((prev) => prev.map((x, xi) => (xi === i ? { ...x, level: e.target.value } : x)));
                      }}
                      disabled={!canWrite}
                      style={{ ...inputStyle, width: 180 }}
                    >
                      {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, padding: 16 }}>
            <Button variant="primary" size="md" onClick={saveCity}>保存</Button>
            <Button variant="secondary" size="md" onClick={() => requestNav('base-list')}>返回基础价目表</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={pageTitleOf[page]}
        description={`价目管理 · ${KIND_LABEL[kindOfPage(page)]}`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {page === 'base-list' && renderList('base')}
        {page === 'base-price' && renderPriceEdit('base')}
        {page === 'base-ratio' && renderRatioEdit('base')}
        {page === 'gs-list' && renderList('gs')}
        {page === 'gs-price' && renderPriceEdit('gs')}
        {page === 'report-list' && renderList('report')}
        {page === 'report-price' && renderReportEdit()}
        {page === 'report-ratio' && renderRatioEdit('report')}
        {page === 'city-level' && renderCityLevel()}
      </div>

      {/* 未保存提示 */}
      <Modal open={unsavedModal} title="提示" onClose={() => setUnsavedModal(false)} width={420}
        footer={<>
          <Button variant="outline" onClick={() => setUnsavedModal(false)}>返回编辑</Button>
          <Button variant="primary" onClick={confirmLeave}>继续离开</Button>
        </>}>
        <div style={{ lineHeight: 1.8, fontSize: 'var(--fs-13)', color: '#667085' }}>当前存在未保存修改，继续跳转将丢失本页修改。</div>
      </Modal>

      {/* 复制确认 */}
      <Modal open={copyModal.open} title={`确认${copyModal.action}？`} onClose={() => setCopyModal((m) => ({ ...m, open: false }))} width={600}
        footer={<>
          <Button variant="outline" onClick={() => setCopyModal((m) => ({ ...m, open: false }))}>取消</Button>
          <Button variant="primary" onClick={confirmCopy}>确认</Button>
        </>}>
        <div style={{ lineHeight: 2, fontSize: 'var(--fs-13)' }}>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>所属模块：</span>{copyModal.module}</div>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>复制内容：</span>{copyModal.action}</div>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>源品种：</span>{copyModal.sourceText}</div>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>目标品种：</span>{copyModal.targetText}</div>
        </div>
        <div style={{ marginTop: 16, background: '#FDF6EC', color: '#C77A16', border: '1px solid #F5DCAC', borderRadius: 6, padding: '10px 12px', fontSize: 'var(--fs-13)', lineHeight: 1.7 }}>
          复制将覆盖目标品种对应配置，请确认源和目标无误。
        </div>
      </Modal>

      {/* 绑定确认（单品种） */}
      <ConfirmDialog
        open={bindSingle.open}
        title="确认绑定价目配置？"
        description="目标品种将使用源品种的价目配置，后续编辑源品种会自动同步到已绑定品种。"
        impact={`所属模块：${bindSingle.module}；源品种：${bindSingle.sourceText}；目标品种：${bindSingle.targetText}。解绑需二次确认，解绑后目标品种保留当前值副本。`}
        confirmLabel="确认绑定"
        variant="warning"
        onConfirm={confirmBindSingle}
        onCancel={() => setBindSingle((m) => ({ ...m, open: false }))}
      />

      {/* 批量复制 → 批量绑定 */}
      <Modal open={batchOpen} title={batchTitle} onClose={() => setBatchOpen(false)} width={720}
        footer={<>
          <Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button>
          <Button variant="primary" onClick={confirmBatchCopyFirst}>确认复制</Button>
        </>}>
        <div style={{ background: '#ECF5FF', color: '#606266', borderRadius: 6, padding: '10px 12px', marginBottom: 16, fontSize: 'var(--fs-13)', lineHeight: 1.7 }}>
          支持按目标药厂批量选择多个品种，执行前二次确认；绑定后编辑源品种将同步到全部目标品种。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>目标药厂</span>
          <select value={batchCompany} onChange={(e) => setBatchCompany(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
            {[...new Set(PRODUCTS[activeKind].map((p) => p.company))].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'start', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>目标品种</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PRODUCTS[activeKind].filter((p) => p.id !== batchSource).map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={batchTargets.includes(p.id)}
                  onChange={(e) => setBatchTargets((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                />
                {p.tradeName}（{p.commonName}）
                {ownerOf(activeKind, p.id) === batchSource && <span style={{ color: '#909399', fontSize: 'var(--fs-12)' }}>已绑定当前源</span>}
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* 批量绑定二次确认 */}
      <ConfirmDialog
        open={batchConfirm}
        title="确认批量绑定？"
        description={`以下品种将绑定到「${productName(activeKind, batchSource)}」的价目配置。`}
        impact={`价目类型：${KIND_LABEL[activeKind]}；源品种：${productName(activeKind, batchSource)}；目标品种：${batchTargets.map((t) => productName(activeKind, t)).join('、')}。绑定后编辑源品种会自动同步到目标品种；解绑需二次确认。`}
        confirmLabel="确认绑定"
        variant="warning"
        onConfirm={confirmBatchCopyFinal}
        onCancel={() => setBatchConfirm(false)}
      />

      {/* 解绑双重确认 */}
      <ConfirmDialog
        open={!!unbindTarget && !unbindStep2}
        title="解除绑定？"
        description={`「${unbindTarget?.name ?? ''}」当前使用「${unbindTarget?.owner ?? ''}」的价目配置，解除后将不再随源品种修改而同步。`}
        impact="解绑后目标品种保留当前价目配置的副本，可独立修改。"
        confirmLabel="继续解绑"
        variant="danger"
        onConfirm={confirmUnbind1}
        onCancel={() => setUnbindTarget(null)}
      />
      <ConfirmDialog
        open={!!unbindTarget && unbindStep2}
        title="再次确认解除绑定"
        description={`请再次确认：解除「${unbindTarget?.name ?? ''}」与「${unbindTarget?.owner ?? ''}」的价目配置绑定关系？此操作将建立独立配置，之后两品种互不影响。`}
        confirmLabel="确认解绑"
        variant="danger"
        onConfirm={confirmUnbind2}
        onCancel={() => setUnbindStep2(false)}
      />

      {/* 恢复默认 */}
      <ConfirmDialog
        open={!!restoreModal}
        title={`确认恢复默认${restoreModal.replace(/^恢复默认/, '')}？`}
        description="该操作会覆盖当前品种正在维护的配置，恢复后需重新录入本次修改内容。"
        impact="恢复为默认模板值后，当前未保存的修改将丢失。"
        confirmLabel="确认恢复默认"
        variant="danger"
        onConfirm={confirmRestore}
        onCancel={() => setRestoreModal('')}
      />

      {/* 查看修改 */}
      <Modal open={changesOpen} title="查看修改" onClose={() => setChangesOpen(false)} width={760}
        footer={<Button variant="outline" onClick={() => setChangesOpen(false)}>关闭</Button>}>
        <div style={{ background: '#FDF6EC', color: '#C77A16', border: '1px solid #F5DCAC', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontSize: 'var(--fs-13)' }}>
          当前共识别 {changesList.length} 项未保存修改。
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'auto', maxHeight: 420 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['模块', '项目分类', '字段', '修改前', '修改后'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {changesList.map((c, i) => (
                <tr key={i}>
                  <td style={td}>{c.module}</td>
                  <td style={td}>{c.item}</td>
                  <td style={td}>{c.field}</td>
                  <td style={{ ...td, color: '#C73A3A' }}>{c.before}</td>
                  <td style={{ ...td, color: 'var(--color-brand)' }}>{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* 比例合计异常确认 */}
      <Modal open={!!ratioConfirm} title="确认保存" onClose={() => setRatioConfirm(null)} width={420}
        footer={<>
          <Button variant="outline" onClick={() => setRatioConfirm(null)}>取消</Button>
          <Button variant="primary" onClick={confirmRatioSave}>仍然保存</Button>
        </>}>
        <div style={{ lineHeight: 1.8, fontSize: 'var(--fs-13)' }}>
          当前比例合计为 <strong>{ratioConfirm?.sum ?? 0}%</strong>，未等于 100%。<br />
          比例合计异常可能影响发包分配，是否仍然保存？
        </div>
      </Modal>

      {/* 统一价 */}
      <Modal open={!!unified} title="统一价应用到全部等级档位" onClose={() => setUnified(null)} width={520}
        footer={<>
          <Button variant="outline" onClick={() => setUnified(null)}>取消</Button>
          <Button variant="primary" onClick={() => {
            if (!unified) return;
            setDraftGroups((prev) => prev.map((g) => ({
              ...g,
              rows: g.rows.map((r) => (r.id === unified.row.id ? { ...r, levels: r.levels.map((l) => ({ ...l, price: unified.price, privatePrice: unified.privatePrice })) } : r)),
            })));
            addToast({ type: 'success', title: '已应用统一价', description: `「${unified.row.cat2}」全部 ${unified.row.levels.length} 个等级档位已更新` });
            setHasUnsaved(true);
            setUnified(null);
          }}>应用到全部档位</Button>
        </>}>
        <div style={{ lineHeight: 2, marginBottom: 12, fontSize: 'var(--fs-13)' }}>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>服务项：</span>{unified?.row.cat2}</div>
          <div><span style={{ color: '#909399', display: 'inline-block', width: 88 }}>应用范围：</span>全部 {unified?.row.levels.length} 个等级档位</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>金额</span>
          <input value={unified?.price ?? ''} onChange={(e) => setUnified((prev) => (prev ? { ...prev, price: e.target.value } : prev))} placeholder="元/次；留空则全部档位置为未配置" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>对私金额</span>
          <input value={unified?.privatePrice ?? ''} onChange={(e) => setUnified((prev) => (prev ? { ...prev, privatePrice: e.target.value } : prev))} placeholder="元/次" style={inputStyle} />
        </div>
        <div style={{ background: '#FDF6EC', color: '#C77A16', border: '1px solid #F5DCAC', borderRadius: 6, padding: '10px 12px', fontSize: 'var(--fs-13)', lineHeight: 1.7 }}>
          将覆盖该服务项全部等级档位的金额与对私金额（发包标记、区域价格不受影响），应用后计入未保存修改，可在「查看修改」中逐档核对。
        </div>
      </Modal>
    </div>
  );
}
