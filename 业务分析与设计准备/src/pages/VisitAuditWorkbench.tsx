/**
 * 拜访管理审核工作台（业务数据管理）。
 *
 * 医院拜访 / 商业拜访 / 药房拜访三个二级页面共用本组件（page 入参切换文案与数据）。
 * 视觉与交互对齐项目设计基准：页头状态页签（PageHeader）、筛选区（FilterBar）、
 * 状态标签（StatusTag）、分页（Pagination）、居中详情弹窗（DetailDrawer）、
 * 确认弹窗（ConfirmDialog）/ 意见弹窗（Modal）、时间线（Timeline）、
 * 空态（EmptyState）与全局 Toast 均复用 components 设计组件，不再维护独立配色。
 */
import { useMemo, useState, type CSSProperties } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Clock,
  Download,
  Info,
  MapPin,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag, Tag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { Timeline } from '../components/Timeline';
import { EmptyState } from '../components/EmptyState';
import type { ToastMessage } from '../components/Toast';

export type VisitAuditPageKey = 'hospital' | 'business' | 'pharmacy';
type AuditState = '待审核' | '已通过' | '已驳回';
type StatusTab = '全部' | AuditState;
type DrawerTab = '拜访详情' | '审核日志';

interface VisitAuditWorkbenchProps {
  page: VisitAuditPageKey;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

type Visit = {
  id: number;
  specialist: string;
  provider: string;
  group: string;
  target: string;
  targetMeta: string;
  visitor: string;
  product: string;
  category: string;
  content: string;
  date: string;
  time: string;
  location: string;
  performance: '未打绩效' | '已打绩效';
  status: AuditState;
  opinion: string;
  amount?: string;
};

export const VISIT_AUDIT_PAGE_CONFIG: Record<
  VisitAuditPageKey,
  { title: string; subtitle: string; target: string; date: string }
> = {
  hospital: { title: '医院拜访管理', subtitle: '查看医院拜访记录并处理审核', target: '拜访医院', date: '拜访时间' },
  business: { title: '商业拜访管理', subtitle: '查看商业拜访记录并处理审核', target: '拜访公司', date: '拜访日期' },
  pharmacy: { title: '药房拜访管理', subtitle: '查看药房拜访记录并处理审核', target: '拜访药房', date: '拜访日期' },
};

const visits: Record<VisitAuditPageKey, Visit[]> = {
  hospital: [
    { id: 1, specialist: '陈思远', provider: '华东医药服务有限公司', group: '上海一组', target: '上海市第一人民医院', targetMeta: '三级甲等 · 心内科', visitor: '王主任', product: '瑞舒伐他汀钙片 10mg×7片', category: '学术拜访', content: '介绍最新临床研究进展，与科室沟通患者用药反馈。', date: '2025-06-18', time: '09:00 — 10:15', location: '门诊楼 4F 心内科', performance: '未打绩效', status: '待审核', opinion: '—' },
    { id: 2, specialist: '周亦航', provider: '华东医药服务有限公司', group: '上海二组', target: '复旦大学附属中山医院', targetMeta: '三级甲等 · 呼吸科', visitor: '李医生', product: '吸入用布地奈德混悬液 2ml', category: '跟踪巡访服务', content: '跟进科室产品使用情况，收集医护人员反馈。', date: '2025-06-18', time: '14:20 — 15:00', location: '2号楼呼吸科', performance: '已打绩效', status: '已通过', opinion: '信息完整，审核通过。' },
    { id: 3, specialist: '林若安', provider: '苏南健康服务中心', group: '江苏三组', target: '苏州市立医院', targetMeta: '三级乙等 · 消化科', visitor: '张主任', product: '奥美拉唑肠溶胶囊 20mg', category: '信息收集和调研', content: '收集院内相关品种覆盖及临床使用情况。', date: '2025-06-17', time: '11:00 — 11:35', location: '本部门诊 3F', performance: '未打绩效', status: '已驳回', opinion: '拜访内容描述不完整，请补充核实。' },
    { id: 4, specialist: '许知行', provider: '浙江康桥咨询有限公司', group: '浙江一组', target: '浙江大学医学院附属第二医院', targetMeta: '三级甲等 · 神经内科', visitor: '赵医生', product: '银杏叶片 24片', category: '日常拜访', content: '日常回访，了解患者用药反馈。', date: '2025-06-17', time: '15:10 — 16:00', location: '解放路院区', performance: '未打绩效', status: '待审核', opinion: '—' },
    { id: 5, specialist: '沈星河', provider: '华东医药服务有限公司', group: '上海一组', target: '上海市第六人民医院', targetMeta: '三级甲等 · 骨科', visitor: '顾主任', product: '塞来昔布胶囊 0.2g', category: '学术拜访', content: '沟通骨关节炎疼痛管理临床路径。', date: '2025-06-16', time: '10:30 — 11:20', location: '宜山路院区', performance: '已打绩效', status: '待审核', opinion: '—' },
  ],
  business: [
    { id: 1, specialist: '陈思远', provider: '华东医药服务有限公司', group: '上海一组', target: '国药控股上海有限公司', targetMeta: '商业公司', visitor: '刘经理', product: '瑞舒伐他汀钙片 10mg×7片', category: '商务服务', content: '沟通本月产品配送计划及重点区域库存安排。', date: '2025-06-18', time: '09:30 — 10:30', location: '上海市黄浦区龙华东路385号', performance: '未打绩效', status: '待审核', opinion: '—' },
    { id: 2, specialist: '周亦航', provider: '苏南健康服务中心', group: '江苏二组', target: '上药控股江苏股份有限公司', targetMeta: '商业公司', visitor: '孙主管', product: '吸入用布地奈德混悬液 2ml', category: '商业库存信息收集', content: '核对商业库存及近三个月流向数据。', date: '2025-06-17', time: '14:00 — 14:45', location: '南京市雨花台区软件大道', performance: '已打绩效', status: '已通过', opinion: '已核对拜访信息，审核通过。' },
    { id: 3, specialist: '许知行', provider: '浙江康桥咨询有限公司', group: '浙江一组', target: '浙江英特药业有限责任公司', targetMeta: '商业公司', visitor: '郑经理', product: '银杏叶片 24片', category: '商业信息收集和调研', content: '调研区域终端覆盖及配送效率。', date: '2025-06-16', time: '11:15 — 12:00', location: '杭州市拱墅区康桥路', performance: '未打绩效', status: '已驳回', opinion: '拜访位置与公司注册地址不一致，请核对。' },
  ],
  pharmacy: [
    { id: 1, specialist: '陈思远', provider: '华东医药服务有限公司', group: '上海一组', target: '益丰大药房（静安店）', targetMeta: '连锁药房', visitor: '朱店长', product: '瑞舒伐他汀钙片', category: '日常拜访', content: '了解产品陈列、库存及消费者反馈。', date: '2025-06-18', time: '10:00 — 10:40', location: '上海市静安区', performance: '未打绩效', status: '待审核', opinion: '—', amount: '¥ 2,860.00' },
    { id: 2, specialist: '周亦航', provider: '苏南健康服务中心', group: '江苏二组', target: '海王星辰（新街口店）', targetMeta: '连锁药房', visitor: '陈药师', product: '吸入用布地奈德混悬液', category: '跟踪巡访', content: '跟进动销情况，收集患者咨询重点。', date: '2025-06-17', time: '15:20 — 16:05', location: '南京市秦淮区', performance: '已打绩效', status: '已通过', opinion: '信息核验无误。', amount: '¥ 1,540.00' },
    { id: 3, specialist: '林若安', provider: '浙江康桥咨询有限公司', group: '浙江一组', target: '老百姓大药房（西湖店）', targetMeta: '连锁药房', visitor: '王店长', product: '银杏叶片', category: '信息收集', content: '收集竞品陈列与门店库存信息。', date: '2025-06-16', time: '13:00 — 13:30', location: '杭州市西湖区', performance: '未打绩效', status: '已驳回', opinion: '拜访内容缺少有效信息。', amount: '—' },
  ],
};

const PAGE_SIZE = 10;

function hashLatLng(seed: string): { lat: string; lng: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const lat = (25.1032 + ((h % 180) - 90) / 10000).toFixed(4);
  const lng = (117.0297 + (((h >> 9) % 180) - 90) / 10000).toFixed(4);
  return { lat, lng };
}

function periodOf(time: string) {
  const [start, end] = time.split(' — ');
  return { start, end };
}

function recordNo(visit: Visit) {
  return `VIS-202506-${String(visit.id).padStart(4, '0')}`;
}

function specialistAccount(visit: Visit) {
  return `u${202500 + visit.id}`;
}

/** 详情弹窗内的页签（与拜访管理页详情弹窗同款交互） */
function drawerTabStyle(active: boolean): CSSProperties {
  return {
    padding: '8px 0',
    fontSize: 'var(--fs-13)',
    color: active ? 'var(--color-brand)' : '#667085',
    border: 'none',
    borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    marginBottom: -1,
    fontFamily: 'inherit',
    fontWeight: active ? 600 : 400,
  };
}

/** 列表行内操作链接（与拜访管理页同款） */
const rowLinkStyle: CSSProperties = { border: 'none', background: 'none', padding: 0, color: '#2F6BCE', cursor: 'pointer', fontSize: 'var(--fs-13)' };

function th(label: string, w?: string | number) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 'var(--fs-12)',
      fontWeight: 600,
      color: '#9CA3AF',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: '#F9FAFB',
      borderBottom: '1px solid var(--color-border)',
      whiteSpace: 'nowrap',
      width: w,
    }}>
      {label}
    </th>
  );
}

/** 拜访签到示意地图（与拜访管理页详情同款画法） */
function VisitLocationMap({ visit }: { visit: Visit }) {
  const { lat, lng } = hashLatLng(`${visit.target}-${visit.id}`);
  const pinX = 268;
  const pinY = 148;

  return (
    <div style={{
      position: 'relative',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
      background: '#F6F8FA',
    }}>
      <svg viewBox="0 0 640 360" width="100%" style={{ display: 'block' }} aria-hidden>
        <rect x="28" y="24" width="148" height="92" rx="6" fill="#E9EDF1" />
        <rect x="196" y="18" width="118" height="74" rx="6" fill="#EEF1F4" />
        <rect x="332" y="32" width="96" height="86" rx="6" fill="#E9EDF1" />
        <rect x="28" y="136" width="86" height="70" rx="6" fill="#EEF1F4" />
        <rect x="340" y="176" width="132" height="88" rx="6" fill="#E9EDF1" />
        <rect x="496" y="168" width="112" height="76" rx="6" fill="#EEF1F4" />
        <rect x="196" y="248" width="124" height="72" rx="6" fill="#E9EDF1" />
        <rect x="470" y="36" width="132" height="82" rx="8" fill="#E6F5ED" />
        <rect x="36" y="248" width="176" height="72" rx="14" fill="#EBF2FE" />
        <line x1="0" y1="228" x2="640" y2="118" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round" />
        <line x1="120" y1="0" x2="120" y2="360" stroke="#FFFFFF" strokeWidth="10" />
        <line x1="0" y1="120" x2="640" y2="120" stroke="#FFFFFF" strokeWidth="8" />
        <line x1="0" y1="210" x2="640" y2="210" stroke="#FFFFFF" strokeWidth="8" />
        <line x1="320" y1="0" x2="320" y2="360" stroke="#FFFFFF" strokeWidth="8" />
        <line x1="480" y1="0" x2="480" y2="360" stroke="#FFFFFF" strokeWidth="8" />
        <line x1="0" y1="300" x2="640" y2="300" stroke="#FFFFFF" strokeWidth="8" />
        <circle className="visit-audit-pin-pulse" cx={pinX} cy={pinY} r="28" fill="var(--color-brand)" />
        <circle cx={pinX} cy={pinY} r="7" fill="var(--color-brand)" stroke="#FFFFFF" strokeWidth="2" />
      </svg>
      <MapPin
        size={18}
        color="var(--color-brand)"
        aria-hidden
        style={{
          position: 'absolute',
          left: `${(pinX / 640) * 100}%`,
          top: `${(pinY / 360) * 100}%`,
          transform: 'translate(-50%, calc(-100% - 10px))',
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'absolute',
        left: `${((pinX + 36) / 640) * 100}%`,
        top: `${((pinY - 52) / 360) * 100}%`,
        width: 248,
        maxWidth: '52%',
        background: '#FFFFFF',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginBottom: 4 }}>打卡位置</div>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', lineHeight: 1.5, marginBottom: 8 }}>
          {visit.location}
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#667085', fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
          {visit.date} {periodOf(visit.time).start}
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
          N{lat}° E{lng}°
        </div>
      </div>
      <div style={{
        position: 'absolute',
        right: 10,
        bottom: 8,
        fontSize: 'var(--fs-11)',
        color: '#9CA3AF',
        pointerEvents: 'none',
      }}>
        示意地图
      </div>
      <style>{`
        .visit-audit-pin-pulse { opacity: 0.15; }
        @keyframes visitAuditPinPulse {
          0% { opacity: 0.15; }
          70% { opacity: 0; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .visit-audit-pin-pulse { animation: visitAuditPinPulse 2.2s ease-out infinite; }
        }
      `}</style>
    </div>
  );
}

export function VisitAuditWorkbench({ page, addToast }: VisitAuditWorkbenchProps) {
  const config = VISIT_AUDIT_PAGE_CONFIG[page];
  const source = visits[page];

  const [statusTab, setStatusTab] = useState<StatusTab>('全部');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pageNum, setPageNum] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [drawerRecord, setDrawerRecord] = useState<Visit | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('拜访详情');
  const [approveTarget, setApproveTarget] = useState<null | { batch: boolean; count?: number }>(null);
  const [rejectTarget, setRejectTarget] = useState<null | { batch: boolean; count?: number }>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [apptOpen, setApptOpen] = useState(false);

  const counts = useMemo(() => ({
    全部: source.length,
    待审核: source.filter(x => x.status === '待审核').length,
    已通过: source.filter(x => x.status === '已通过').length,
    已驳回: source.filter(x => x.status === '已驳回').length,
  }), [source]);

  const filtered = useMemo(() => {
    return source.filter(r => {
      const { start, end } = periodOf(r.time);
      if (statusTab !== '全部' && r.status !== statusTab) return false;
      if (filters.provider && r.provider !== filters.provider) return false;
      if (filters.workGroup && r.group !== filters.workGroup) return false;
      if (filters.target && !r.target.includes(filters.target)) return false;
      if (filters.auditStatus && r.status !== filters.auditStatus) return false;
      if (filters.variety && !r.product.includes(filters.variety)) return false;
      if (filters.performance && r.performance !== filters.performance) return false;
      if (filters.category && r.category !== filters.category) return false;
      if (filters.hospitalGrade && !r.targetMeta.includes(filters.hospitalGrade)) return false;
      if (filters.startOnTime && (start.endsWith(':00') ? '是' : '否') !== filters.startOnTime) return false;
      if (filters.endOnTime && (end.endsWith(':00') ? '是' : '否') !== filters.endOnTime) return false;
      if (filters.startDate && r.date < filters.startDate) return false;
      if (filters.endDate && r.date > filters.endDate) return false;
      return true;
    });
  }, [source, statusTab, filters]);

  const statusCounts = useMemo(() => {
    const c: Record<AuditState, number> = { 待审核: 0, 已通过: 0, 已驳回: 0 };
    filtered.forEach(r => { c[r.status] += 1; });
    return c;
  }, [filtered]);

  const pageData = filtered.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

  const uniqueOptions = (values: string[]) =>
    Array.from(new Set(values)).map(v => ({ value: v, label: v }));

  const filterFields = [
    { id: 'provider', label: '服务提供方', type: 'select' as const, options: uniqueOptions(source.map(r => r.provider)) },
    { id: 'workGroup', label: '工作组', type: 'select' as const, options: uniqueOptions(source.map(r => r.group)) },
    { id: 'target', label: config.target, type: 'text' as const, placeholder: page === 'pharmacy' ? '搜索药房名称' : `搜索${config.target}` },
    { id: 'startDate', label: config.date, type: 'date' as const },
    { id: 'endDate', label: '结束日期', type: 'date' as const },
    { id: 'auditStatus', label: '审核状态', type: 'select' as const, options: [
      { value: '待审核', label: '待审核' },
      { value: '已通过', label: '已通过' },
      { value: '已驳回', label: '已驳回' },
    ]},
    { id: 'variety', label: '品种名称', type: 'select' as const, options: uniqueOptions(source.map(r => r.product)) },
    { id: 'performance', label: '绩效状态', type: 'select' as const, options: [
      { value: '已打绩效', label: '已打绩效' },
      { value: '未打绩效', label: '未打绩效' },
    ]},
    ...(page !== 'pharmacy' ? [{ id: 'category', label: '拜访类别', type: 'select' as const, options: uniqueOptions(source.map(r => r.category)) }] : []),
    ...(page === 'hospital' ? [{ id: 'hospitalGrade', label: '医院等级', type: 'select' as const, options: [
      { value: '三级甲等', label: '三级甲等' },
      { value: '三级乙等', label: '三级乙等' },
    ] }] : []),
    { id: 'startOnTime', label: '开始时间是否为整点', type: 'select' as const, options: [{ value: '是', label: '是' }, { value: '否', label: '否' }] },
    { id: 'endOnTime', label: '结束时间是否为整点', type: 'select' as const, options: [{ value: '是', label: '是' }, { value: '否', label: '否' }] },
  ];

  function handleFilterChange(id: string, val: string) {
    setFilters(prev => ({ ...prev, [id]: val }));
  }
  function handleReset() {
    setFilters({});
    setStatusTab('全部');
    setPageNum(1);
    setSelected([]);
  }
  function toggleRow(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    if (selected.length === pageData.length) setSelected([]);
    else setSelected(pageData.map(r => r.id));
  }

  function openDrawer(record: Visit) {
    setDrawerRecord(record);
    setDrawerTab('拜访详情');
  }
  function closeDrawer() {
    setDrawerRecord(null);
    setDrawerTab('拜访详情');
  }

  function submitApprove() {
    const batch = approveTarget?.batch;
    addToast({
      type: 'success',
      title: batch ? `批量审核通过 ${approveTarget?.count ?? 0} 条` : '审核已通过',
      description: batch
        ? '二级审核已完成且结果生效，操作已写入操作日志'
        : `${drawerRecord ? recordNo(drawerRecord) : '该记录'} 二级审核完成，操作已写入操作日志`,
    });
    setApproveTarget(null);
    closeDrawer();
  }

  function submitReject() {
    const batch = rejectTarget?.batch;
    if (!rejectComment.trim()) return;
    addToast({
      type: 'warning',
      title: batch ? `批量审核驳回 ${rejectTarget?.count ?? 0} 条` : '已驳回该条拜访记录',
      description: `审核意见：${rejectComment.trim()}`,
    });
    setRejectTarget(null);
    setRejectComment('');
    closeDrawer();
  }

  const statsNode = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 'var(--fs-13)' }}>
      <span style={{ color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条</span>
      {(['待审核', '已通过', '已驳回'] as AuditState[]).map(s => (
        <span key={s} style={{ color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}>
          <StatusTag status={s} size="sm" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: '#374151' }}>{statusCounts[s]}</span>
        </span>
      ))}
    </div>
  );

  const hasBatch = page !== 'pharmacy' && selected.length > 0;
  const extraActions = (
    <>
      <Button variant="outline" size="sm" icon={<Download size={13} />}>导出</Button>
      {hasBatch && (
        <>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085', padding: '0 4px' }}>已选 {selected.length} 条（仅本页）</span>
          <Button variant="secondary" size="sm" icon={<CheckCircle size={13} />} onClick={() => setApproveTarget({ batch: true, count: selected.length })}>批量审核通过</Button>
          <Button variant="secondary" size="sm" icon={<XCircle size={13} />} style={{ color: '#C73A3A' }} onClick={() => setRejectTarget({ batch: true, count: selected.length })}>批量审核驳回</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>清空选择</Button>
        </>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={config.title}
        description={config.subtitle}
        updatedAt="10:24"
        tabs={[
          { id: '全部', label: '全部', count: counts['全部'] },
          { id: '待审核', label: '待审核', count: counts['待审核'] },
          { id: '已通过', label: '已通过', count: counts['已通过'] },
          { id: '已驳回', label: '已驳回', count: counts['已驳回'] },
        ]}
        activeTab={statusTab}
        onTabChange={t => { setStatusTab(t as StatusTab); setPageNum(1); setSelected([]); }}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={handleFilterChange}
          onSearch={() => setPageNum(1)}
          onReset={handleReset}
          stats={statsNode}
          extraActions={extraActions}
          collapsedCount={5}
        />

        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            {pageData.length === 0 ? (
              <EmptyState
                title="没有符合条件的拜访记录"
                description="尝试调整筛选条件或清除当前筛选。"
                action={{ label: '重置筛选', onClick: handleReset }}
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr>
                    {page !== 'pharmacy' && (
                      <th style={{
                        padding: '10px 12px',
                        background: '#F9FAFB',
                        borderBottom: '1px solid var(--color-border)',
                        width: 40,
                      }}>
                        <input
                          type="checkbox"
                          checked={selected.length === pageData.length && pageData.length > 0}
                          onChange={toggleAll}
                          style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                        />
                      </th>
                    )}
                    {th('序号', 50)}
                    {th('服务专员')}
                    {th('服务提供方 / 工作组')}
                    {th(page === 'hospital' ? '医院 / 科室' : page === 'business' ? '被拜访商业公司' : '被拜访药房')}
                    {th('被拜访人')}
                    {th('拜访品种及规格')}
                    {th('拜访日期 / 时段', 150)}
                    {page === 'pharmacy' && th('金额', 110)}
                    {th('绩效状态')}
                    {th('审核状态')}
                    {th('审核意见')}
                    {th('操作', 130)}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((record, idx) => (
                    <tr
                      key={record.id}
                      style={{
                        background: selected.includes(record.id) ? '#F0FAF7' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                      onMouseEnter={e => { if (!selected.includes(record.id)) (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                      onMouseLeave={e => { if (!selected.includes(record.id)) (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                    >
                      {page !== 'pharmacy' && (
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            type="checkbox"
                            checked={selected.includes(record.id)}
                            onChange={() => toggleRow(record.id)}
                            style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                          />
                        </td>
                      )}
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(pageNum - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>{record.specialist}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                          {specialistAccount(record)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 160 }}>
                        <div style={{ fontSize: 'var(--fs-13)', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.provider}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{record.group}</div>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 180 }}>
                        <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.target}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{record.targetMeta}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', whiteSpace: 'nowrap' }}>{record.visitor}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 170 }}>
                        <div style={{ fontSize: 'var(--fs-13)', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.product}>{record.product}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{record.category}</div>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#374151', fontFamily: "'JetBrains Mono', monospace" }}>{record.date}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{record.time}</div>
                      </td>
                      {page === 'pharmacy' && (
                        <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                          {record.amount ?? '—'}
                        </td>
                      )}
                      <td style={{ padding: '10px 12px' }}>
                        <StatusTag status={record.performance} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusTag status={record.status} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#667085', maxWidth: 170 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.opinion}>
                          {record.opinion}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => openDrawer(record)} style={rowLinkStyle}>查看</button>
                          {record.status === '待审核' && (
                            <>
                              <span style={{ color: '#E5E7EB' }}>｜</span>
                              <button type="button" onClick={() => setApproveTarget({ batch: false })} style={rowLinkStyle}>通过</button>
                              <span style={{ color: '#E5E7EB' }}>｜</span>
                              <button type="button" onClick={() => { setRejectComment(''); setRejectTarget({ batch: false }); }} style={rowLinkStyle}>驳回</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filtered.length > 0 && (
            <div style={{ padding: '0 16px', borderTop: '1px solid #F3F4F6' }}>
              <Pagination page={pageNum} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPageNum} />
            </div>
          )}
        </div>

        <p style={{ margin: '12px 4px 0', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
          审核状态与可操作权限以实际业务规则为准；“整点”仅为记录信息，不代表异常。
        </p>
      </div>

      {/* 详情弹窗 */}
      <DetailDrawer
        open={!!drawerRecord}
        title={drawerRecord ? `拜访记录 · ${recordNo(drawerRecord)}` : ''}
        subtitle={drawerRecord ? `${config.title} · ${drawerRecord.target}` : ''}
        width={720}
        onClose={closeDrawer}
        footer={
          drawerRecord ? (
            <>
              <Button variant="outline" size="md" onClick={closeDrawer}>关闭</Button>
              {drawerRecord.status === '待审核' && (
                <>
                  <Button variant="danger" size="md" icon={<XCircle size={14} />} onClick={() => { setRejectComment(''); setRejectTarget({ batch: false }); }}>驳回</Button>
                  <Button variant="primary" size="md" icon={<CheckCircle size={14} />} onClick={() => setApproveTarget({ batch: false })}>通过</Button>
                </>
              )}
            </>
          ) : null
        }
      >
        {drawerRecord && (
          <div>
            <div style={{
              display: 'flex',
              gap: 20,
              borderBottom: '1px solid var(--color-border)',
              marginBottom: 16,
            }}>
              <button type="button" onClick={() => setDrawerTab('拜访详情')} style={drawerTabStyle(drawerTab === '拜访详情')}>拜访详情</button>
              <button type="button" onClick={() => setDrawerTab('审核日志')} style={drawerTabStyle(drawerTab === '审核日志')}>审核日志</button>
            </div>

            {drawerTab === '拜访详情' && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: '#F9FAFB',
                  borderRadius: '8px',
                  marginBottom: 20,
                  border: '1px solid var(--color-border)',
                }}>
                  <StatusTag status={drawerRecord.status} />
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>·</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>绩效状态：</span>
                  <StatusTag status={drawerRecord.performance} size="sm" />
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                    提交于 {drawerRecord.date} 17:24
                  </span>
                </div>

                {drawerRecord.status === '已驳回' && (
                  <div style={{
                    padding: '10px 14px',
                    background: '#FEECEC',
                    border: '1px solid #FECACA',
                    borderRadius: '6px',
                    marginBottom: 16,
                    fontSize: 'var(--fs-13)',
                    color: '#C73A3A',
                    display: 'flex',
                    gap: 8,
                  }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>驳回意见：</strong>{drawerRecord.opinion === '—' ? '见审核日志' : drawerRecord.opinion}
                    </div>
                  </div>
                )}

                <FieldGroup title="拜访对象信息">
                  <FieldItem
                    label="服务专员"
                    value={
                      <span>
                        {drawerRecord.specialist}{' '}
                        <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>
                          {specialistAccount(drawerRecord)}
                        </span>
                      </span>
                    }
                  />
                  <FieldItem label="服务提供方" value={drawerRecord.provider} />
                  <FieldItem label="工作组" value={drawerRecord.group} />
                  <FieldItem label={config.target} value={drawerRecord.target} />
                  <FieldItem label={page === 'hospital' ? '医院等级 / 科室' : '对象类型'} value={drawerRecord.targetMeta} />
                  <FieldItem label="被拜访人" value={drawerRecord.visitor} />
                </FieldGroup>

                <FieldGroup title="拜访内容">
                  <FieldItem label="拜访类别" value={drawerRecord.category} />
                  <FieldItem label="品种及规格" value={drawerRecord.product} />
                  <FieldItem label="拜访内容" value={drawerRecord.content} span />
                  <FieldItem label="拜访位置" value={drawerRecord.location} span />
                  {page === 'pharmacy' && <FieldItem label="金额" value={drawerRecord.amount ?? '—'} />}
                </FieldGroup>

                <FieldGroup title="时间信息">
                  <FieldItem label={config.date} value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.date}</span>} />
                  <FieldItem label="拜访时段" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.time}</span>} />
                  <FieldItem label="开始时间是否为整点" value={periodOf(drawerRecord.time).start.endsWith(':00') ? '是' : '否'} />
                  <FieldItem label="结束时间是否为整点" value={periodOf(drawerRecord.time).end.endsWith(':00') ? '是' : '否'} />
                </FieldGroup>

                {drawerRecord.category === '学术拜访' && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{
                      fontSize: 'var(--fs-12)',
                      fontWeight: 600,
                      color: '#9CA3AF',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span>预约凭证</span>
                      <Tag label="学术拜访必需" color="brand" />
                      <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
                    </div>
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', flexShrink: 0 }}>
                          <Smartphone size={16} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>APP 预约凭证</div>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>凭证编号：APT-20250618-0086</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setApptOpen(true)}>查看时间线</Button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 14px' }}>
                        {([
                          ['预约对象', drawerRecord.visitor],
                          ['预约时间', `${drawerRecord.date} ${periodOf(drawerRecord.time).start}`],
                          ['计划拜访时段', drawerRecord.time],
                          ['预约来源', '服务专员 APP'],
                        ] as [string, string][]).map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginBottom: 2 }}>{k}</div>
                            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '8px 14px', background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Info size={13} style={{ flexShrink: 0 }} />
                        PC 端仅展示预约信息，预约与确认动作均在服务专员 APP 内完成。
                      </div>
                    </div>
                  </div>
                )}

                <FieldGroup title="地图定位">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <VisitLocationMap visit={drawerRecord} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>{drawerRecord.location}</span>
                      <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>定位精度 18 米 · 签到位置与拜访对象相距 86 米</span>
                      <Tag label="范围内" color="success" />
                    </div>
                  </div>
                </FieldGroup>

                <FieldGroup title={`照片附件（3 张）`}>
                  {([
                    { src: 'https://images.unsplash.com/photo-1759045313316-0ed8915057fe?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600', label: '拜访场所外景' },
                    { src: 'https://images.unsplash.com/photo-1689048494522-d61159872e51?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600', label: '现场定位环境' },
                    { src: 'https://images.unsplash.com/photo-1631462199549-becc852f4b64?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600', label: '拜访凭证照片' },
                  ]).map(photo => (
                    <div key={photo.src}>
                      <img
                        src={photo.src}
                        alt={photo.label}
                        style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)', display: 'block' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 'var(--fs-12)', color: '#667085' }}>
                        <Camera size={12} style={{ flexShrink: 0 }} />
                        {photo.label}
                      </div>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
                    照片仅用于审核核验，拍摄时间与原始文件信息均已保留。
                  </div>
                </FieldGroup>

                <FieldGroup title="审核信息">
                  <FieldItem label="审核状态" value={<StatusTag status={drawerRecord.status} />} />
                  <FieldItem label="绩效状态" value={<StatusTag status={drawerRecord.performance} />} />
                  <FieldItem label="审核意见" value={drawerRecord.opinion} span />
                </FieldGroup>
              </>
            )}

            {drawerTab === '审核日志' && (
              <AuditLogPanel visit={drawerRecord} />
            )}
          </div>
        )}
      </DetailDrawer>

      {/* 预约时间线（学术拜访凭证） */}
      {drawerRecord && apptOpen && (
        <Modal
          open
          title="预约时间线"
          titleNote={`APT-20250618-0086 · ${drawerRecord.target}`}
          width={560}
          onClose={() => setApptOpen(false)}
          footer={<Button variant="primary" size="md" onClick={() => setApptOpen(false)}>关闭</Button>}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-success-bg)', borderRadius: 8, marginBottom: 16 }}>
            <CheckCircle size={15} color="var(--color-success-fg)" />
            <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-success-fg)' }}>预约已确认</span>
            <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>预约时间与本次拜访记录匹配</span>
            <span style={{ marginLeft: 'auto' }}><Tag label="凭证有效" color="success" /></span>
          </div>
          <Timeline events={[
            { id: 'apt-1', type: '创建', operator: `服务专员 · ${drawerRecord.specialist}`, time: '2025-06-16 14:32', detail: `在 APP 发起学术拜访预约（时段 ${drawerRecord.date} ${drawerRecord.time}）` },
            { id: 'apt-2', type: '核验', operator: `${drawerRecord.visitor} · APP 预约确认`, time: '2025-06-16 16:08', detail: '预约对象已确认本次拜访预约' },
            { id: 'apt-3', type: '核验', operator: '签到核验', time: `${drawerRecord.date} 08:56`, detail: `已在预约地点附近完成签到，距离目标位置 86 米（${drawerRecord.location}）` },
            { id: 'apt-4', type: '提交', operator: `服务专员 · ${drawerRecord.specialist}`, time: `${drawerRecord.date} 17:24`, detail: '预约凭证已自动关联到本次学术拜访记录，进入企业审核流程' },
          ]} />
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#FEF3E2', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 'var(--fs-12)', color: '#C77A16', display: 'flex', gap: 8 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div><strong>只读凭证：</strong>预约信息不可在 PC 端修改。若信息有误，请联系服务专员在 APP 端处理。</div>
          </div>
        </Modal>
      )}

      {/* 审核通过确认 */}
      <ConfirmDialog
        open={approveTarget !== null}
        title={approveTarget?.batch ? `批量审核通过 ${approveTarget.count} 条` : '确认二级审核通过？'}
        description={approveTarget?.batch
          ? `本次将在二级审核节点处理已选择的 ${approveTarget.count} 条记录，范围为当前页。提交前系统将校验一级审核状态与操作权限。`
          : '该记录已通过一级审核。请确认已完成最终核对，通过后二级审核完成且结果正式生效。'
        }
        impact="操作将写入操作日志，并通知服务专员审核结果。"
        confirmLabel="确认通过"
        variant="warning"
        onConfirm={submitApprove}
        onCancel={() => setApproveTarget(null)}
      />

      {/* 审核驳回（需填写审核意见） */}
      <Modal
        open={rejectTarget !== null}
        title={rejectTarget?.batch ? `批量审核驳回 ${rejectTarget.count} 条` : '二级审核驳回'}
        width={480}
        onClose={() => { setRejectTarget(null); setRejectComment(''); }}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => { setRejectTarget(null); setRejectComment(''); }}>取消</Button>
            <Button variant="danger" size="md" disabled={!rejectComment.trim()} onClick={submitReject}>确认驳回</Button>
          </>
        }
      >
        <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-13)', color: '#667085', lineHeight: 1.6 }}>
          {rejectTarget?.batch
            ? `将对选中的 ${rejectTarget.count} 条记录执行二级审核驳回，审核意见将应用于全部选中记录。`
            : '该记录已通过一级审核。请填写审核意见，驳回后审核流程将结束并通知服务专员。'
          }
        </p>
        <textarea
          value={rejectComment}
          maxLength={200}
          onChange={e => setRejectComment(e.target.value)}
          placeholder={rejectTarget?.batch ? '请输入统一审核意见，该意见将应用于全部选中记录' : '请输入审核意见'}
          style={{
            width: '100%',
            minHeight: 80,
            padding: '8px 10px',
            fontSize: 'var(--fs-13)',
            color: 'var(--color-text-1)',
            background: '#FFFFFF',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.6,
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          {rejectComment.length} / 200
        </div>
      </Modal>
    </div>
  );
}

/** 审核日志：两级审核进度 + 审核记录时间线 + 规则说明 */
function AuditLogPanel({ visit }: { visit: Visit }) {
  const finished = visit.status !== '待审核';
  const rejected = visit.status === '已驳回';

  const routeNodes = [
    { key: 'lv1', title: '一级审核', sub: '区域审核员', state: 'complete' as const },
    { key: 'lv2', title: '二级审核', sub: '企业审核管理员', state: finished ? ('complete' as const) : ('current' as const) },
    { key: 'done', title: '审核完成', sub: '结果生效', state: finished ? ('complete' as const) : ('pending' as const) },
  ];
  const nodeStyle = {
    complete: { bg: '#E6F5ED', fg: '#248A5A', line: '#248A5A' },
    current: { bg: 'var(--color-brand-subtle)', fg: 'var(--color-brand)', line: '#E5E7EB' },
    pending: { bg: '#F3F4F6', fg: '#9CA3AF', line: '#E5E7EB' },
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20 }}>
        {routeNodes.map((node, i) => {
          const s = nodeStyle[node.state];
          return (
            <div key={node.key} style={{ display: 'flex', flex: i < routeNodes.length - 1 ? 1 : '0 0 auto', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  background: s.bg, color: s.fg, fontSize: 'var(--fs-12)', fontWeight: 600, flexShrink: 0,
                }}>
                  {node.state === 'complete' ? '✓' : i + 1}
                </span>
                <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-1)' }}>{node.title}</div>
                <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{node.sub}</div>
              </div>
              {i < routeNodes.length - 1 && (
                <span style={{ flex: 1, height: 2, background: s.line, marginTop: 13, margin: '13px 8px 0' }} />
              )}
            </div>
          );
        })}
      </div>

      {!finished && (
        <div style={{ padding: '10px 14px', background: '#F9FAFB', border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Clock size={15} color="var(--color-brand)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>
            <strong>等待二级审核：</strong>一级审核已通过，当前记录需要由企业审核管理员完成最终审核。
          </div>
        </div>
      )}

      <FieldGroup title="审核记录">
        <div style={{ gridColumn: '1 / -1' }}>
          <Timeline events={[
            ...(finished ? [{
              id: 'log-lv2',
              type: (rejected ? '审核驳回' : '审核通过') as '审核驳回' | '审核通过',
              operator: '企业审核管理员 · 赵明',
              role: '二级审核',
              time: `${visit.date} 18:06`,
              comment: visit.opinion === '—' ? undefined : visit.opinion,
            }] : []),
            {
              id: 'log-lv1',
              type: '审核通过' as const,
              operator: '区域审核员 · 李雯',
              role: '一级审核',
              time: `${visit.date} 17:48`,
              comment: '拜访对象、时间及现场信息核验一致，同意提交二级审核。',
            },
            {
              id: 'log-submit',
              type: '提交' as const,
              operator: `服务专员 · ${visit.specialist}`,
              time: `${visit.date} 17:24`,
              detail: '记录已提交，进入一级审核。',
            },
          ]} />
        </div>
      </FieldGroup>

      <div style={{ padding: '10px 14px', background: '#FEF3E2', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 'var(--fs-12)', color: '#C77A16', display: 'flex', gap: 8 }}>
        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <div><strong>审核规则说明：</strong>一级审核通过后进入二级审核；二级审核通过后记录最终生效。任一节点驳回，流程结束并通知提交人。</div>
      </div>
    </div>
  );
}
