import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  FileDown,
  Info,
  ListChecks,
  MoreVertical,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { Button, IconButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { DetailDrawer } from '../components/DetailDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Tag } from '../components/StatusTag';
import { formatCNY } from '../constants';
import type { Role } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

/* ─── 页面内 mock：报告台账、业务类型、模板与口径选项 ──────────────────────── */

const PAGE_SIZE = 10;

const PROVIDERS = [
  '东方恒业推广有限公司',
  '康泰医药服务有限公司',
  '博润医学咨询有限责任公司',
];
const VARIETIES = ['示例品种 A', '贝立妥注射液', '复方维胺酯缓释片'];

interface ExportReport {
  no: string;
  name: string;
  dz: string;
  provider: string;
  variety: string;
  /** 业务记录数（笔） */
  records: number;
  createdAt: string;
  status: '已归档' | '草稿';
  declaredAmount: number;
  voucherAmount: number;
}

const SEED_REPORTS: ExportReport[] = [
  {
    no: 'BG-202609-0882',
    name: '2026年09月业务明细导出报告',
    dz: 'DZ-202609-0031',
    provider: PROVIDERS[0],
    variety: VARIETIES[0],
    records: 24,
    createdAt: '2026-09-09 16:45',
    status: '已归档',
    declaredAmount: 132000,
    voucherAmount: 128600,
  },
  {
    no: 'BG-202608-0771',
    name: '2026年08月全品种业务明细导出报告',
    dz: 'DZ-202608-0119',
    provider: PROVIDERS[1],
    variety: VARIETIES[1],
    records: 156,
    createdAt: '2026-08-31 18:20',
    status: '已归档',
    declaredAmount: 486000,
    voucherAmount: 471500,
  },
  {
    no: 'BG-202609-0805',
    name: '2026年Q3复方维胺酯缓释片明细导出报告',
    dz: 'DZ-202609-0012',
    provider: PROVIDERS[0],
    variety: VARIETIES[2],
    records: 42,
    createdAt: '2026-09-07 11:32',
    status: '已归档',
    declaredAmount: 205000,
    voucherAmount: 205000,
  },
  {
    no: 'BG-202609-0866',
    name: '2026年09月上半月学术研讨明细导出报告',
    dz: 'DZ-202609-0028',
    provider: PROVIDERS[2],
    variety: VARIETIES[0],
    records: 18,
    createdAt: '2026-09-09 15:10',
    status: '已归档',
    declaredAmount: 96000,
    voucherAmount: 92400,
  },
  {
    no: 'BG-202609-0879',
    name: '2026年09月临时合规自查（草稿）',
    dz: 'DZ-202609-0044',
    provider: PROVIDERS[0],
    variety: VARIETIES[0],
    records: 9,
    createdAt: '2026-09-09 10:14',
    status: '草稿',
    declaredAmount: 32000,
    voucherAmount: 0,
  },
];

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** 补齐到 28 条以撑满 3 页分页（演示数据，时间整体早于种子行以保持种子行在列表顶部） */
function buildReports(): ExportReport[] {
  const rows = [...SEED_REPORTS];
  const base = new Date('2026-09-08T09:00:00').getTime();
  const DAY = 24 * 60 * 60 * 1000;
  for (let i = rows.length; i < 28; i += 1) {
    const at = new Date(base - i * 1.5 * DAY);
    const month = at.getMonth() + 1;
    const provider = PROVIDERS[i % PROVIDERS.length];
    const variety = VARIETIES[i % VARIETIES.length];
    const seq = 900 - i * 7;
    rows.push({
      no: `BG-2026${pad(month)}-${pad(seq, 4)}`,
      name: `2026年${pad(month)}月第${i - 4}批业务明细导出报告`,
      dz: `DZ-2026${pad(month)}-${pad(seq - 400, 4)}`,
      provider,
      variety,
      records: 12 + ((i * 7) % 90),
      createdAt: `${at.getFullYear()}-${pad(month)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`,
      status: '已归档',
      declaredAmount: 40000 + ((i * 3300) % 160000),
      voucherAmount: 38000 + ((i * 3100) % 160000),
    });
  }
  return rows;
}

const INITIAL_REPORTS = buildReports();

interface BizType {
  id: string;
  name: string;
  /** 当前筛选条件下的数据量（选中后统计查询得到） */
  count: number;
  /** 数据量单位（场/次/组/份） */
  unit: string;
  docs: string;
  /** 凭证生成金额（实收票据） */
  amount: number;
  /** 结算单申报金额（服务方申报） */
  declared: number;
  note: string;
}

const BIZ_TYPES: BizType[] = [
  {
    id: 'seminar',
    name: '学术研讨会服务',
    count: 8,
    unit: '场',
    docs: '8 份会议纪要·课酬回执',
    amount: 48000,
    declared: 49200,
    note: '包含科室研讨会、城市学术论坛、讲座与专家课酬结算凭证。',
  },
  {
    id: 'visit',
    name: '医生拜访服务',
    count: 12,
    unit: '次',
    docs: '12 份临床打卡与沟通记录',
    amount: 36000,
    declared: 36900,
    note: '包含日常临床拜访打卡记录、学术反馈记录与沟通回执单。',
  },
  {
    id: 'dept',
    name: '科室推介会',
    count: 4,
    unit: '场',
    docs: '4 份签到表及宣讲记录',
    amount: 24000,
    declared: 24600,
    note: '包含院内科室产品推介、药品宣贯、会议签到及会议纪要。',
  },
  {
    id: 'digital',
    name: '数字营销传播服务',
    count: 2,
    unit: '组',
    docs: '2 份传播数据截图',
    amount: 5600,
    declared: 5750,
    note: '包含线上学术专题传播、指南图文阅读及数字内容分发统计。',
  },
  {
    id: 'survey',
    name: '调研问卷服务',
    count: 60,
    unit: '份',
    docs: '26 份问卷反馈及凭单',
    amount: 9000,
    declared: 9250,
    note: '包含临床用药满意度问卷、专家处方习惯调研真实样本汇总。',
  },
  {
    id: 'patient',
    name: '患者宣教活动',
    count: 3,
    unit: '场',
    docs: '3 份宣教手册派发清单',
    amount: 6000,
    declared: 6300,
    note: '包含慢病患教会场地安排、宣教手册派发及患者参与清单。',
  },
];

/* ─── 数字徽章：未统计 / 统计中（转圈） / 数字滚动出数 ──────────────────── */

function TypeBadge({ phase, count, unit }: { phase: 'idle' | 'loading' | 'done'; count: number; unit: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (phase !== 'done') {
      setDisplay(0);
      return;
    }
    let raf = 0;
    const start = Date.now();
    const dur = 320;
    const frame = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      setDisplay(Math.round(count * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, count]);

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '2px 8px',
    minHeight: 23,
    minWidth: 64,
    borderRadius: 4,
    fontSize: 'var(--fs-12)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  if (phase === 'loading') {
    return (
      <span style={{ ...base, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}>
        <span
          style={{
            width: 11,
            height: 11,
            border: '2px solid rgba(23,107,91,.25)',
            borderTopColor: 'var(--color-brand)',
            borderRadius: '50%',
            flexShrink: 0,
            animation: 'bzSpin 0.8s linear infinite',
          }}
        />
        统计中
      </span>
    );
  }
  if (phase !== 'done') {
    return <span style={{ ...base, background: '#F3F4F6', color: '#9CA3AF' }}>未统计</span>;
  }
  return (
    <span
      className="bz-badge-in"
      style={{ ...base, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}
    >
      {display} {unit}
    </span>
  );
}

const TEMPLATES = [
  {
    id: 1,
    name: '标准证据链',
    badge: 'A4 单页',
    recommended: true,
    desc: '适用：日常业务对账与归档核验，清晰呈现对账核心指标与凭证附件明细。',
    modules: ['基础信息', '业务摘要', '证据文件清单'],
  },
  {
    id: 2,
    name: '对账汇总',
    badge: 'A4 单页',
    recommended: false,
    desc: '适用：财务专员与审计高管快速查看金额核对与结算状态。',
    modules: ['金额摘要', '业务明细', '结算状态'],
  },
  {
    id: 3,
    name: '时间线审计',
    badge: 'A4 单页',
    recommended: false,
    desc: '适用：查看推广全生命周期的审批、结算与凭证流转过程记录。',
    modules: ['提交记录', '审核记录', '结算归档'],
  },
];

const WORK_GROUPS = ['华东医学事务一组', '华南临床推广二组', '全部工作组'];
const SPECIALISTS = ['全部专员（含专职/兼职）', '李明（华东大区主管）', '张华（学术专员）'];
const PERF_STATUS = ['已考核', '全部', '待考核'];
const EXPORT_SCOPES = ['导出全部内容', '仅导出汇总', '仅导出凭证明细清单'];

/** 当前对账单（步骤一顶部信息确认） */
const CURRENT_BILL = {
  dz: 'DZ-202609-0031',
  provider: PROVIDERS[0],
  variety: VARIETIES[0],
  period: '2026-09-01 至 2026-09-09',
  declaredAmount: 132000,
  voucherAmount: 128600,
  records: 24,
  sessions: '8 场',
};

const REPORT_NO = 'BG-202609-0882';

const TH: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 'var(--fs-12)',
  fontWeight: 600,
  color: '#9CA3AF',
  background: '#F9FAFB',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '12px',
  fontSize: 'var(--fs-13)',
  color: 'var(--color-text-1)',
  borderBottom: '1px solid #F3F4F6',
  verticalAlign: 'middle',
};
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
};
const CARD_TITLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 'var(--fs-15)',
  fontWeight: 600,
  color: 'var(--color-text-1)',
};
const LINK_BTN: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: 'var(--fs-13)',
  color: 'var(--color-brand)',
};
const CONTROL: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  fontSize: 'var(--fs-13)',
  color: 'var(--color-text-1)',
  background: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
};
const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-12)',
  color: '#9CA3AF',
  marginBottom: 4,
  fontWeight: 500,
};

function timeStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ─── 页面 ───────────────────────────────────────────────────────────────── */

export function BizDetailExport({ addToast, currentRole }: Props) {
  const [reports, setReports] = useState<ExportReport[]>(INITIAL_REPORTS);
  const [view, setView] = useState<'list' | 'flow'>('list');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 列表筛选
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // 三步向导状态
  const [billForm, setBillForm] = useState<Record<string, string>>({
    provider: CURRENT_BILL.provider,
    variety: CURRENT_BILL.variety,
    workGroup: WORK_GROUPS[0],
    specialist: SPECIALISTS[0],
    perfStatus: PERF_STATUS[0],
    period: '2026-08-10 - 2026-09-10',
    exportScope: EXPORT_SCOPES[0],
    remember: '1',
  });
  // 业务类型默认不选中；数字徽章是「选中后实时统计」的反馈（idle 未统计 / loading 统计中 / done 出数）
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [badgePhase, setBadgePhase] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});
  const badgeTimers = useRef<number[]>([]);
  const [template, setTemplate] = useState(1);
  const [reportName, setReportName] = useState('2026 年 09 月业务明细导出报告');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showAmountCompare, setShowAmountCompare] = useState(true);
  const [showEvidence, setShowEvidence] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  // 弹层
  const [successOpen, setSuccessOpen] = useState(false);
  const [drawerCode, setDrawerCode] = useState<string | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<ExportReport | null>(null);

  const roleIntro =
    currentRole === '药厂合规部门'
      ? '按对账单与服务方生成业务明细导出报告，用于合规留痕与审计调阅；导出口径以已归档明细为准。'
      : '按对账单与服务方生成业务明细导出报告：筛选统计口径、选择模板、单页预览并导出 A4 报告。';

  const selectedBiz = useMemo(
    () => BIZ_TYPES.filter((t) => selectedTypes.includes(t.id)),
    [selectedTypes],
  );
  const voucherTotal = selectedBiz.reduce((s, t) => s + t.amount, 0);
  const declaredTotal = selectedBiz.reduce((s, t) => s + t.declared, 0);
  const activeTemplate = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];
  // 徽章统计中数量（汇总条 / 参数核对行联动）
  const statLoading = selectedTypes.filter((id) => badgePhase[id] === 'loading').length;

  /* ── 列表 ── */
  const allRows = useMemo(
    () =>
      reports.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [reports],
  );

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (applied.dz && !r.dz.toLowerCase().includes(applied.dz.trim().toLowerCase())) return false;
        if (applied.provider && r.provider !== applied.provider) return false;
        if (applied.variety && r.variety !== applied.variety) return false;
        if (applied.dateFrom && r.createdAt.slice(0, 10) < applied.dateFrom) return false;
        if (applied.dateTo && r.createdAt.slice(0, 10) > applied.dateTo) return false;
        return true;
      }),
    [allRows, applied],
  );

  const pageData = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detailReport = drawerCode ? allRows.find((r) => r.dz === drawerCode) : undefined;

  const notifyExport = (fileName: string) => {
    addToast({
      type: 'info',
      title: '导出报告（演示）',
      description: `原型未生成真实文件，导出后应下载《${fileName}.pdf》。`,
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', title: '已复制', description: text });
    } catch {
      addToast({ type: 'info', title: '已复制（演示）', description: text });
    }
  };

  const openFlow = (target: 1 | 2 | 3) => {
    setView('flow');
    setStep(target);
  };

  const backToList = () => {
    setView('list');
    setStep(1);
  };

  /** 模拟按当前筛选统计某类型数据量：先转圈「统计中」，错峰完成后出数（演示查询） */
  const statType = (id: string, offsetMs: number) => {
    setBadgePhase((p) => ({ ...p, [id]: 'loading' }));
    badgeTimers.current.push(
      window.setTimeout(() => {
        setBadgePhase((p) => ({ ...p, [id]: 'done' }));
      }, 450 + offsetMs),
    );
  };

  const runCalc = () => {
    // 重新统计：卡片保持可见，仅已选类型徽章错峰重查；未选类型不受影响
    if (selectedTypes.length === 0) {
      addToast({ type: 'info', title: '尚未选择业务类型', description: '勾选类型后才会统计对应数据量。' });
      return;
    }
    selectedTypes.forEach((id, i) => {
      const idx = BIZ_TYPES.findIndex((t) => t.id === id);
      statType(id, i * 100 + Math.max(0, idx) * 40);
    });
    badgeTimers.current.push(
      window.setTimeout(() => {
        addToast({ type: 'success', title: '业务数据量已按当前筛选重新统计完成' });
      }, 600 + selectedTypes.length * 90),
    );
  };

  const setBill = (id: string, value: string) => {
    setBillForm((f) => ({ ...f, [id]: value }));
    if (id === 'provider' || id === 'variety') runCalc();
  };

  const toggleType = (id: string) => {
    if (selectedTypes.includes(id)) {
      // 取消勾选：数字随选中态清除，回到「未统计」
      setSelectedTypes(selectedTypes.filter((t) => t !== id));
      setBadgePhase((p) => ({ ...p, [id]: 'idle' }));
    } else {
      setSelectedTypes([...selectedTypes, id]);
      const idx = BIZ_TYPES.findIndex((t) => t.id === id);
      statType(id, Math.max(0, idx) * 60);
    }
  };

  const selectAllTypes = () => {
    if (selectedTypes.length === BIZ_TYPES.length) {
      setSelectedTypes([]);
      setBadgePhase({});
    } else {
      setSelectedTypes(BIZ_TYPES.map((t) => t.id));
      BIZ_TYPES.forEach((t, i) => statType(t.id, i * 120));
    }
  };

  // 卸载时清理模拟统计的定时器
  useEffect(
    () => () => {
      badgeTimers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const saveDraft = () => {
    const dz = `DZ-202609-${pad(900 + reports.length, 4)}`;
    setReports((prev) => [
      {
        no: `BG-202609-${pad(900 + prev.length, 4)}`,
        name: reportName,
        dz,
        provider: billForm.provider,
        variety: billForm.variety,
        records: CURRENT_BILL.records,
        createdAt: timeStamp().slice(0, 16),
        status: '草稿',
        declaredAmount: declaredTotal,
        voucherAmount: voucherTotal,
      },
      ...prev,
    ]);
    addToast({ type: 'success', title: '已暂存草稿', description: `${dz} 已写入报告台账（演示）` });
    backToList();
  };

  const confirmDeleteDraft = () => {
    if (!deleteDraft) return;
    setReports((prev) => prev.filter((r) => r.dz !== deleteDraft.dz));
    addToast({ type: 'success', title: '草稿已删除', description: deleteDraft.dz });
    setDeleteDraft(null);
  };

  const exportReport = () => {
    setExportLoading(true);
    window.setTimeout(() => {
      setExportLoading(false);
      setSuccessOpen(true);
    }, 600);
  };

  /* ── 视图：列表 ── */
  function renderList() {
    return (
      <>
        <PageHeader
          title="业务明细导出"
          description={roleIntro}
          actions={
            <>
              <Button
                variant="outline"
                size="md"
                icon={<FileDown size={14} />}
                onClick={() => notifyExport('业务明细导出报告清单')}
              >
                导出报告
              </Button>
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => openFlow(1)}>
                创建业务明细导出报告
              </Button>
            </>
          }
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <FilterBar
            fields={[
              { id: 'dz', label: '对账单编号', type: 'text', placeholder: '如 DZ-202609-0031' },
              {
                id: 'provider',
                label: '服务提供方',
                type: 'select',
                options: PROVIDERS.map((p) => ({ value: p, label: p })),
              },
              {
                id: 'variety',
                label: '品种',
                type: 'select',
                options: VARIETIES.map((v) => ({ value: v, label: v })),
              },
              { id: 'dateFrom', label: '创建时间（起）', type: 'date' },
              { id: 'dateTo', label: '创建时间（止）', type: 'date' },
            ]}
            values={filters}
            onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
            onSearch={() => {
              setApplied({ ...filters });
              setPage(1);
            }}
            onReset={() => {
              setFilters({});
              setApplied({});
              setPage(1);
            }}
            collapsedCount={5}
            stats={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
                <Info size={13} />
                系统字段规范：「结算单金额」与「凭证生成金额」支持分别核对与统计。
              </span>
            }
          />

          <div style={{ ...CARD, overflow: 'auto', marginBottom: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'center', width: 56 }}>序号</th>
                  <th style={TH}>报告名称</th>
                  <th style={TH}>对账单编号</th>
                  <th style={TH}>服务提供方</th>
                  <th style={TH}>品种</th>
                  <th style={{ ...TH, textAlign: 'right' }}>业务记录数</th>
                  <th style={TH}>创建时间</th>
                  <th style={{ ...TH, textAlign: 'center', width: 210 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        title="没有匹配的导出报告"
                        description="调整筛选条件，或直接创建一份新的业务明细导出报告。"
                        action={{ label: '创建业务明细导出报告', onClick: () => openFlow(1) }}
                      />
                    </td>
                  </tr>
                ) : (
                  pageData.map((r, i) => {
                    const isDraft = r.status === '草稿';
                    return (
                      <tr key={r.dz}>
                        <td style={{ ...TD, textAlign: 'center', color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
                          {pad((page - 1) * PAGE_SIZE + i + 1)}
                        </td>
                        <td style={TD}>
                          <button
                            style={{ ...LINK_BTN, color: 'var(--color-text-1)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => setDrawerCode(r.dz)}
                          >
                            {r.name}
                          </button>
                          {isDraft && (
                            <span style={{ marginLeft: 6 }}>
                              <Tag label="草稿" />
                            </span>
                          )}
                        </td>
                        <td style={{ ...TD, color: '#667085', fontFamily: 'var(--font-mono)' }}>{r.dz}</td>
                        <td style={TD}>{r.provider}</td>
                        <td style={TD}>
                          <Tag label={r.variety} color="brand" />
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {r.records} 笔
                        </td>
                        <td style={{ ...TD, color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>{r.createdAt}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {isDraft ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <button style={LINK_BTN} onClick={() => openFlow(2)}>
                                继续编辑
                              </button>
                              <span style={{ color: '#D1D5DB' }}>|</span>
                              <button style={{ ...LINK_BTN, color: 'var(--color-danger-fg)' }} onClick={() => setDeleteDraft(r)}>
                                删除
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <button style={LINK_BTN} onClick={() => setDrawerCode(r.dz)}>
                                查看
                              </button>
                              <span style={{ color: '#D1D5DB' }}>|</span>
                              <button style={{ ...LINK_BTN, color: '#2F6BCE' }} onClick={() => notifyExport(r.name)}>
                                下载 PDF
                              </button>
                              <span style={{ color: '#D1D5DB' }}>|</span>
                              <IconButton
                                variant="ghost"
                                size="sm"
                                icon={<MoreVertical size={15} />}
                                title="更多操作"
                                aria-label="更多操作"
                                onClick={() => copyText(r.no)}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
        </div>
      </>
    );
  }

  /* ── 视图：三步向导 ── */
  function renderFlow() {
    const stepMeta = [
      { id: 1 as const, title: '第一步：选择业务类型', hint: '勾选纳入报告的服务类型' },
      { id: 2 as const, title: '第二步：选择报告模板', hint: '标准证据链 / 对账汇总 / 时间线' },
      { id: 3 as const, title: '第三步：单页预览与导出', hint: 'A4 真实比例预览与生成报告' },
    ];

    return (
      <>
        <PageHeader
          title="创建业务明细导出报告"
          description="按对账单与服务方确认统计口径，选择模板后生成 A4 单页导出报告。"
          actions={
            <Button variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={backToList}>
              返回列表
            </Button>
          }
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* 步骤条 */}
          <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {stepMeta.map((s) => {
                const active = step === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStep(s.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      borderRadius: 8,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-brand-subtle)' : '#fff',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        fontSize: 'var(--fs-13)',
                        fontWeight: 700,
                        flexShrink: 0,
                        color: active ? '#fff' : '#9CA3AF',
                        background: active ? 'var(--color-brand)' : '#F3F4F6',
                      }}
                    >
                      {s.id}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--fs-14)',
                          fontWeight: active ? 600 : 400,
                          color: active ? 'var(--color-brand)' : 'var(--color-text-1)',
                        }}
                      >
                        {s.title}
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </>
    );
  }

  function renderStep1() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 生成条件设置 */}
        <div style={{ ...CARD, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 10,
              borderBottom: '1px solid var(--color-border)',
              marginBottom: 12,
            }}
          >
            <div style={CARD_TITLE}>
              <SlidersHorizontal size={17} color="var(--color-brand)" />
              导出报告生成条件设置
            </div>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={runCalc}>
              重新统计数据
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 12 }}>
            {[
              { id: 'provider', label: '服务提供方', options: PROVIDERS, required: true },
              { id: 'variety', label: '品种', options: VARIETIES, required: true },
              { id: 'workGroup', label: '工作组', options: WORK_GROUPS },
              { id: 'specialist', label: '服务专员', options: SPECIALISTS },
              { id: 'perfStatus', label: '绩效状态', options: PERF_STATUS },
              { id: 'exportScope', label: '导出内容', options: EXPORT_SCOPES },
            ].map((f) => (
              <div key={f.id}>
                <label style={FIELD_LABEL} htmlFor={`bz-${f.id}`}>
                  {f.required && <span style={{ color: 'var(--color-danger-fg)', marginRight: 2 }}>*</span>}
                  {f.label}
                </label>
                <select
                  id={`bz-${f.id}`}
                  value={billForm[f.id]}
                  onChange={(e) => setBill(f.id, e.target.value)}
                  style={{ ...CONTROL, cursor: 'pointer' }}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label style={FIELD_LABEL} htmlFor="bz-period">
                工作量周期
              </label>
              <input
                id="bz-period"
                type="text"
                value={billForm.period}
                onChange={(e) => setBill('period', e.target.value)}
                style={CONTROL}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 4 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={billForm.remember === '1'}
                  onChange={(e) => setBill('remember', e.target.checked ? '1' : '')}
                  style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }}
                />
                记住选项
              </label>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
                {statLoading > 0 ? (
                  <>
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        border: '2px solid rgba(23,107,91,.25)',
                        borderTopColor: 'var(--color-brand)',
                        borderRadius: '50%',
                        animation: 'bzSpin 0.8s linear infinite',
                      }}
                    />
                    {statLoading} 项统计中…
                  </>
                ) : selectedTypes.length > 0 ? (
                  <>
                    <ShieldCheck size={14} color="var(--color-brand)" />
                    参数实时核对完成
                  </>
                ) : (
                  '待选择业务类型后统计'
                )}
              </span>
            </div>
          </div>
        </div>

        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={CARD_TITLE}>
                <ListChecks size={17} color="var(--color-brand)" />
                选择需要纳入报告的业务类型
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-13)', color: '#667085' }}>
                勾选后系统按当前筛选条件实时统计数据量；数据量仅供参考，最终以导出报告为准。
              </p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={selectedTypes.length === BIZ_TYPES.length}
                onChange={selectAllTypes}
                style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }}
              />
              全选所有类型
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {BIZ_TYPES.map((t) => {
              const on = selectedTypes.includes(t.id);
              return (
                <label
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 14,
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--color-brand)' : 'var(--color-border)'}`,
                    background: on ? 'var(--color-brand-subtle)' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleType(t.id)}
                    style={{ accentColor: 'var(--color-brand)', width: 16, height: 16, marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)' }}>{t.name}</span>
                      <TypeBadge phase={badgePhase[t.id] ?? 'idle'} count={t.count} unit={t.unit} />
                    </span>
                    <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.6 }}>
                      {t.note}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <span style={{ fontSize: 'var(--fs-13)' }}>
              已选择{' '}
              <strong style={{ color: 'var(--color-brand)', fontSize: 'var(--fs-16)' }}>{selectedTypes.length}</strong>{' '}
              种业务类型
              {statLoading > 0 && (
                <span style={{ marginLeft: 6, fontSize: 'var(--fs-12)', color: 'var(--color-warning-fg)' }}>
                  （{statLoading} 种统计中…）
                </span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {selectedTypes.length === 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-12)', color: 'var(--color-danger-fg)' }}>
                  <AlertTriangle size={13} />
                  请至少勾选一种业务类型后继续
                </span>
              )}
              <Button variant="ghost" size="md" onClick={backToList}>
                取消
              </Button>
              <Button
                variant="primary"
                size="md"
                iconAfter={<ArrowRight size={14} />}
                disabled={selectedTypes.length === 0}
                onClick={() => setStep(2)}
              >
                下一步：选择模板
              </Button>
            </div>
          </div>
          <style>{`@keyframes bzSpin { to { transform: rotate(360deg); } }
            @keyframes bzBadgeIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
            .bz-badge-in { animation: bzBadgeIn 200ms ease; }
            @media (prefers-reduced-motion: reduce) {
              .bz-badge-in { animation: none; }
            }`}</style>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {TEMPLATES.map((t) => {
            const on = template === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 18,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  borderRadius: 8,
                  background: '#fff',
                  border: on ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
                  boxShadow: on ? '0 0 0 2px var(--color-brand-subtle)' : 'none',
                }}
              >
                {t.recommended && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 'var(--fs-11)',
                      fontWeight: 600,
                      color: 'var(--color-brand)',
                      background: 'var(--color-brand-subtle)',
                    }}
                  >
                    <Check size={12} />
                    默认推荐
                  </span>
                )}
                <div>
                  <TemplateThumb variant={t.id} />
                  <div style={{ ...CARD_TITLE, marginTop: 12 }}>
                    {t.name}
                    <Tag label="A4 单页" />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-13)', color: '#667085', lineHeight: 1.6 }}>{t.desc}</p>
                </div>
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF', marginBottom: 6 }}>
                    内容模块构成：
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    {t.modules.map((m, idx) => (
                      <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {idx > 0 && <span style={{ color: '#D1D5DB' }}>+</span>}
                        <Tag label={m} />
                      </span>
                    ))}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ ...CARD_TITLE, marginBottom: 12 }}>
            <SlidersHorizontal size={17} color="var(--color-brand)" />
            报告排版与要素控制选项
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <label style={FIELD_LABEL} htmlFor="bz-report-name">
                报告标题名称
              </label>
              <input
                id="bz-report-name"
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                style={CONTROL}
              />
            </div>
            <div>
              <span style={FIELD_LABEL}>页面方向</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'portrait' as const, label: '纵向 (Portrait)' },
                  { id: 'landscape' as const, label: '横向 (Landscape)' },
                ].map((o) => (
                  <Button
                    key={o.id}
                    variant={orientation === o.id ? 'secondary' : 'outline'}
                    size="md"
                    onClick={() => setOrientation(o.id)}
                    style={{ flex: 1 }}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
            {[
              {
                label: '是否显示独立金额比对',
                hint: '展示结算/凭证双金额',
                value: showAmountCompare,
                onChange: setShowAmountCompare,
              },
              {
                label: '是否显示证据文件摘要',
                hint: '汇总会议/签到清单',
                value: showEvidence,
                onChange: setShowEvidence,
              },
            ].map((o) => (
              <div key={o.label}>
                <span style={FIELD_LABEL}>{o.label}</span>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    height: 32,
                    padding: '0 10px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    fontSize: 'var(--fs-13)',
                    cursor: 'pointer',
                  }}
                >
                  {o.hint}
                  <input
                    type="checkbox"
                    checked={o.value}
                    onChange={(e) => o.onChange(e.target.checked)}
                    style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            ...CARD,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Button variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={() => setStep(1)}>
            上一步：修改业务类型
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="ghost" size="md" onClick={saveDraft}>
              暂存草稿
            </Button>
            <Button
              variant="primary"
              size="md"
              iconAfter={<Eye size={14} />}
              onClick={() => setStep(3)}
            >
              预览单页报告
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const fileName = `${reportName.replace(/\s/g, '')}`;
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: '#4B5563',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: orientation === 'portrait' ? 620 : 830,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 'var(--fs-12)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileDown size={14} />
                {fileName}.pdf
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.7)' }}>
                <ShieldCheck size={13} />
                A4 单页 · 已核验
              </span>
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
              <ReportSheet
                reportName={reportName}
                orientation={orientation}
                showAmountCompare={showAmountCompare}
                showEvidence={showEvidence}
                biz={selectedBiz}
                voucherTotal={voucherTotal}
                declaredTotal={declaredTotal}
              />
            </div>
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ ...CARD_TITLE, marginBottom: 12 }}>
              <SlidersHorizontal size={17} color="var(--color-brand)" />
              导出设置核验
            </div>

            <span style={FIELD_LABEL}>报告文件名</span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setReportName(e.target.value)}
              style={{ ...CONTROL, marginBottom: 12 }}
            />

            <span style={FIELD_LABEL}>页面规格</span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 6,
                background: '#F3F4F6',
                fontSize: 'var(--fs-13)',
                marginBottom: 12,
              }}
            >
              <span>A4 {orientation === 'portrait' ? '纵向' : '横向'}单页</span>
              <span style={{ color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
                {orientation === 'portrait' ? '210mm × 297mm' : '297mm × 210mm'}
              </span>
            </div>

            <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border)', marginBottom: 12 }}>
              <span style={{ ...FIELD_LABEL, marginBottom: 8 }}>数据统计核对</span>
              {[
                { label: '已选业务类型', value: `${selectedBiz.length} 种分类`, strong: true },
                { label: '结算单申报金额', value: formatCNY(declaredTotal), strong: true, mono: true },
                { label: '凭证生成金额', value: formatCNY(voucherTotal), strong: true, mono: true, brand: true },
                { label: '核对状态', value: '已通过', strong: true, success: true },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-12)', marginBottom: 6 }}>
                  <span style={{ color: '#667085' }}>{r.label}</span>
                  <span
                    style={{
                      fontWeight: r.strong ? 600 : 400,
                      fontFamily: r.mono ? 'var(--font-mono)' : 'inherit',
                      color: r.success ? 'var(--color-success-fg)' : r.brand ? 'var(--color-brand)' : 'var(--color-text-1)',
                    }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <span style={{ ...FIELD_LABEL, marginBottom: 8 }}>显示要素</span>
              {[
                { label: '显示独立双金额', on: showAmountCompare },
                { label: '显示证据文件清单', on: showEvidence },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-13)', marginBottom: 4 }}>
                  <span>{r.label}</span>
                  <span style={{ color: r.on ? 'var(--color-success-fg)' : '#9CA3AF', fontWeight: 600 }}>
                    {r.on ? '已开启' : '已关闭'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button
              variant="primary"
              size="lg"
              icon={<Download size={16} />}
              loading={exportLoading}
              onClick={exportReport}
            >
              {exportLoading ? '正在生成单页 PDF 报告…' : '导出单页 PDF 报告'}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setStep(2)}>
              返回修改模板
            </Button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: 12,
              borderRadius: 8,
              background: 'var(--color-info-bg)',
              border: '1px solid #D3E3F8',
              fontSize: 'var(--fs-12)',
              color: 'var(--color-info-fg)',
              lineHeight: 1.6,
            }}
          >
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0 }}>
              原型演示：导出动作不生成真实文件；正式环境此处输出 A4 PDF 供打印与内部财务审计存档。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {view === 'list' ? renderList() : renderFlow()}

      {/* 导出成功弹窗 */}
      <Modal
        open={successOpen}
        title="导出报告已生成"
        width={560}
        onClose={() => setSuccessOpen(false)}
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setSuccessOpen(false);
                backToList();
              }}
            >
              返回列表
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setSuccessOpen(false);
                backToList();
                setDrawerCode(CURRENT_BILL.dz);
              }}
            >
              查看报告
            </Button>
            <Button variant="primary" size="md" icon={<Download size={14} />} onClick={() => notifyExport(reportName)}>
              下载 PDF
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 16 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: 'var(--color-success-bg)',
              color: 'var(--color-success-fg)',
              marginBottom: 10,
            }}
          >
            <Check size={28} />
          </span>
          <div style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>单页导出报告已完成排版</div>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
            报告已按所选模板生成，可在系统中归档查阅，或下载 PDF 存档（原型仅演示流程）。
          </p>
        </div>

        <div style={{ background: '#F9FAFB', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
          {[
            { label: '报告名称：', value: reportName, strong: true },
            { label: '使用模板：', value: `${activeTemplate.name}（${activeTemplate.badge}）` },
            { label: '业务类型：', value: `已纳入 ${selectedBiz.length} 种推广服务` },
            {
              label: '核算金额：',
              value: `${formatCNY(voucherTotal)}（凭证）/ ${formatCNY(declaredTotal)}（结算）`,
            },
            { label: '页面规格：', value: `A4 单页（${orientation === 'portrait' ? '纵向' : '横向'}）` },
            { label: '生成时间：', value: timeStamp(), mono: true },
            { label: '报告编号：', value: REPORT_NO, mono: true, strong: true },
          ].map((r) => (
            <div
              key={r.label}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-13)', marginBottom: 6 }}
            >
              <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{r.label}</span>
              <span
                style={{
                  fontWeight: r.strong ? 600 : 400,
                  fontFamily: r.mono ? 'var(--font-mono)' : 'inherit',
                  textAlign: 'right',
                }}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </Modal>

      {/* 报告详情 */}
      <DetailDrawer
        open={Boolean(detailReport)}
        title="业务明细导出详情"
        subtitle={`对账单编号：${detailReport?.dz ?? ''}`}
        width={640}
        onClose={() => setDrawerCode(null)}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setDrawerCode(null)}>
              关闭
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setDrawerCode(null);
                openFlow(3);
              }}
            >
              打开单页预览
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Download size={14} />}
              onClick={() => notifyExport(detailReport?.name ?? reportName)}
            >
              直接下载 PDF
            </Button>
          </>
        }
      >
        {detailReport && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#F9FAFB', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>报告核验状态</span>
                <Tag label={detailReport.status === '草稿' ? '草稿未归档' : '审核合格已归档'} color={detailReport.status === '草稿' ? 'default' : 'success'} />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: '#fff',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                }}
              >
                <span style={{ fontSize: 'var(--fs-13)', fontFamily: 'var(--font-mono)' }}>报告编号：{detailReport.no}</span>
                <button style={{ ...LINK_BTN, fontSize: 'var(--fs-12)' }} onClick={() => copyText(detailReport.no)}>
                  复制
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              <div style={{ ...CARD_TITLE, fontSize: 'var(--fs-14)', marginBottom: 10 }}>
                <Receipt size={16} color="var(--color-brand)" />
                对账金额明细清单
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, padding: 12 }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>结算单金额（服务方申报）</span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-18)', fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                    {formatCNY(detailReport.declaredAmount)}
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>共 {detailReport.records} 笔业务明细</span>
                </div>
                <div style={{ background: 'var(--color-brand-subtle)', borderRadius: 6, padding: 12 }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--color-brand)', fontWeight: 600 }}>
                    凭证生成金额（实收票据）
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--fs-18)',
                      fontWeight: 700,
                      marginTop: 4,
                      color: 'var(--color-brand)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {formatCNY(detailReport.voucherAmount)}
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-warning-fg)' }}>
                    差额：{formatCNY(detailReport.declaredAmount - detailReport.voucherAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ ...CARD_TITLE, fontSize: 'var(--fs-14)', marginBottom: 12 }}>
                <RefreshCw size={16} color="var(--color-brand)" />
                业务报告流转历史
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 8, borderLeft: '2px solid var(--color-border)', marginLeft: 6 }}>
                {[
                  {
                    title: '生成单页业务明细导出报告',
                    meta: `${detailReport.createdAt}:00 | 操作人：${detailReport.provider} 专员`,
                    desc: '报告生成成功，A4 单页格式，已完成系统归档保存。',
                    active: true,
                  },
                  {
                    title: '风控部门复核',
                    meta: '2026-09-09 14:10:00 | 审核人：张主管',
                    desc: `完成 ${detailReport.records} 笔业务明细凭单审核，同意出具导出报告。`,
                    active: true,
                  },
                  {
                    title: '财务结算发票初核完成',
                    meta: '2026-09-08 11:20:15 | 审核人：王会计',
                    desc: '',
                    active: false,
                  },
                ].map((n) => (
                  <div key={n.title} style={{ position: 'relative', paddingLeft: 14 }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: -19,
                        top: 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: n.active ? 'var(--color-brand)' : '#D1D5DB',
                      }}
                    />
                    <span style={{ display: 'block', fontSize: 'var(--fs-14)', fontWeight: 600, color: n.active ? 'var(--color-text-1)' : '#9CA3AF' }}>
                      {n.title}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>{n.meta}</span>
                    {n.desc && <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-13)', color: '#667085' }}>{n.desc}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(deleteDraft)}
        title="删除该草稿报告？"
        description={`「${deleteDraft?.name ?? ''}」尚未归档，删除后不可恢复。`}
        impact="仅删除本地草稿记录，不影响已归档报告与结算数据。"
        confirmLabel="删除草稿"
        onConfirm={confirmDeleteDraft}
        onCancel={() => setDeleteDraft(null)}
      />
    </div>
  );
}

/* ─── 模板缩略图（A4 版式线框） ───────────────────────────────────────────── */
function TemplateThumb({ variant }: { variant: number }) {
  const bar = (w: string, h = 6) => (
    <span style={{ display: 'block', width: w, height: h, borderRadius: 3, background: '#D1D5DB' }} />
  );
  return (
    <div
      style={{
        height: 168,
        borderRadius: 6,
        background: '#F8FAFB',
        border: '1px solid var(--color-border)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'block', width: 64, height: 8, borderRadius: 3, background: 'var(--color-brand)' }} />
        {bar('40px', 5)}
      </div>
      {variant === 1 && (
        <>
          {bar('75%', 8)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ display: 'block', height: 26, borderRadius: 4, background: '#EDF1F4' }} />
            ))}
          </div>
          <span style={{ display: 'block', flex: 1, borderRadius: 4, background: '#EDF1F4' }} />
        </>
      )}
      {variant === 2 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <span style={{ display: 'block', height: 28, borderRadius: 4, background: 'var(--color-brand-subtle)' }} />
            <span style={{ display: 'block', height: 28, borderRadius: 4, background: '#EBF2FE' }} />
          </div>
          {bar('100%', 5)}
          {bar('100%', 5)}
          {bar('60%', 5)}
        </>
      )}
      {variant === 3 && (
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <span style={{ display: 'block', width: 2, background: '#D1D5DB', position: 'relative' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ display: 'block', height: 18, borderRadius: 4, background: '#EDF1F4' }} />
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
        {bar('56px', 5)}
        <span style={{ display: 'block', width: 14, height: 14, borderRadius: '50%', background: 'var(--color-brand-subtle)' }} />
      </div>
    </div>
  );
}

/* ─── A4 单页报告预览 ────────────────────────────────────────────────────── */
function ReportSheet({
  reportName,
  orientation,
  showAmountCompare,
  showEvidence,
  biz,
  voucherTotal,
  declaredTotal,
}: {
  reportName: string;
  orientation: 'portrait' | 'landscape';
  showAmountCompare: boolean;
  showEvidence: boolean;
  biz: BizType[];
  voucherTotal: number;
  declaredTotal: number;
}) {
  const maxWidth = orientation === 'portrait' ? 620 : 830;
  const cellLabel: React.CSSProperties = { display: 'block', fontSize: 'var(--fs-10)', color: '#9CA3AF' };
  const cellValue: React.CSSProperties = { display: 'block', fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-1)', marginTop: 2 };

  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        aspectRatio: orientation === 'portrait' ? '210 / 297' : '297 / 210',
        background: '#fff',
        borderRadius: 2,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '28px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* 抬头 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid var(--color-brand)', paddingBottom: 10 }}>
        <div>
          <span style={{ display: 'block', fontSize: 'var(--fs-10)', letterSpacing: '0.12em', color: '#9CA3AF' }}>
            贝医企业合作系统
          </span>
          <span style={{ display: 'block', fontSize: 'var(--fs-18)', fontWeight: 700, color: 'var(--color-text-1)', marginTop: 2 }}>
            {reportName || '业务明细导出报告'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 'var(--fs-10)', color: '#9CA3AF' }}>报告编号</span>
          <span style={{ display: 'block', fontSize: 'var(--fs-12)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-1)' }}>
            {REPORT_NO}
          </span>
        </div>
      </div>

      {/* 对账单信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, background: '#F8FAFB', border: '1px solid var(--color-border)', borderRadius: 4, padding: 12 }}>
        <div>
          <span style={cellLabel}>对账单编号</span>
          <span style={{ ...cellValue, fontFamily: 'var(--font-mono)' }}>{CURRENT_BILL.dz}</span>
        </div>
        <div>
          <span style={cellLabel}>服务提供方</span>
          <span style={cellValue}>{CURRENT_BILL.provider}</span>
        </div>
        <div>
          <span style={cellLabel}>推广品种</span>
          <span style={cellValue}>{CURRENT_BILL.variety}</span>
        </div>
        <div>
          <span style={cellLabel}>结算周期</span>
          <span style={{ ...cellValue, fontFamily: 'var(--font-mono)' }}>{CURRENT_BILL.period}</span>
        </div>
      </div>

      {/* 金额汇总 */}
      {showAmountCompare && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 4, padding: 12 }}>
            <span style={cellLabel}>结算单申报金额</span>
            <span style={{ display: 'block', fontSize: 'var(--fs-16)', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {formatCNY(declaredTotal)}
            </span>
            <span style={{ fontSize: 'var(--fs-10)', color: '#9CA3AF' }}>共 {CURRENT_BILL.records} 笔业务明细</span>
          </div>
          <div style={{ background: 'var(--color-brand-subtle)', borderRadius: 4, padding: 12 }}>
            <span style={{ ...cellLabel, color: 'var(--color-brand)', fontWeight: 600 }}>凭证生成金额</span>
            <span style={{ display: 'block', fontSize: 'var(--fs-16)', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4, color: 'var(--color-brand)' }}>
              {formatCNY(voucherTotal)}
            </span>
            <span style={{ fontSize: 'var(--fs-10)', color: 'var(--color-warning-fg)' }}>
              差额：{formatCNY(declaredTotal - voucherTotal)}
            </span>
          </div>
        </div>
      )}

      {/* 业务类型统计 */}
      <div>
        <span style={{ display: 'block', fontSize: 'var(--fs-12)', fontWeight: 600, marginBottom: 8 }}>
          纳入本次导出的业务类型统计
        </span>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['服务类型', '发生频次', '核验单据', '结算金额'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '6px 8px',
                    fontSize: 'var(--fs-10)',
                    fontWeight: 600,
                    color: '#9CA3AF',
                    background: '#F9FAFB',
                    borderBottom: '1px solid var(--color-border)',
                    textAlign: i === 3 ? 'right' : 'left',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {biz.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: '6px 8px', fontSize: 'var(--fs-11)', borderBottom: '1px solid #F3F4F6' }}>{t.name}</td>
                <td style={{ padding: '6px 8px', fontSize: 'var(--fs-11)', borderBottom: '1px solid #F3F4F6', fontFamily: 'var(--font-mono)' }}>{t.count} {t.unit}</td>
                <td style={{ padding: '6px 8px', fontSize: 'var(--fs-11)', borderBottom: '1px solid #F3F4F6', color: '#667085' }}>{t.docs}</td>
                <td style={{ padding: '6px 8px', fontSize: 'var(--fs-11)', borderBottom: '1px solid #F3F4F6', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {formatCNY(t.amount)}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ padding: '8px', fontSize: 'var(--fs-11)', fontWeight: 600 }}>
                合计（{biz.length} 种分类）
              </td>
              <td style={{ padding: '8px', fontSize: 'var(--fs-11)', fontWeight: 700, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-brand)' }}>
                {formatCNY(voucherTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 证据文件摘要 */}
      {showEvidence && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 4, padding: 12 }}>
          <span style={{ display: 'block', fontSize: 'var(--fs-12)', fontWeight: 600, marginBottom: 8 }}>证据文件摘要</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
            {[
              '会议纪要与课酬回执',
              '临床打卡与沟通记录',
              '会议签到表与宣讲记录',
              '数字传播数据截图',
              '问卷反馈原件与凭单',
              '宣教手册派发清单',
            ].map((d) => (
              <span key={d} style={{ fontSize: 'var(--fs-11)', color: '#667085' }}>
                · {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 声明与盖章 */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-10)', color: '#9CA3AF', lineHeight: 1.7 }}>
            本报告由贝医企业合作系统根据对账单关联的业务明细记录自动生成；完整业务流水与原始附件凭据可在「结算与对账」模块调阅。
          </p>
          <span style={{ fontSize: 'var(--fs-10)', color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
            生成时间：{timeStamp()}
          </span>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 'var(--fs-10)',
            fontWeight: 700,
            color: 'var(--color-danger-fg)',
            borderTop: '1px solid var(--color-danger-fg)',
            borderBottom: '1px solid var(--color-danger-fg)',
            padding: '2px 6px',
          }}
        >
          财务对账审核章
        </span>
      </div>
    </div>
  );
}
