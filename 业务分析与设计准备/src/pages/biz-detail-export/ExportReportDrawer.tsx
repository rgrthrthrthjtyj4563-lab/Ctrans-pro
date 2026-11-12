/**
 * 业务明细导出 · 「新建报告」右侧抽屉（替换旧三步向导的创建入口）。
 *
 * 交互参考 Figma Make 稿（业务报告导出与生成）：右侧贴边 ~600px 抽屉 + 遮罩，
 * 正文依次为 导出范围（按对账单 / 按组合条件）→ 本次导出摘要 → 导出类型（PDF/Excel）。
 * 与参考稿的差异：
 * - 数据全部走真实会话口径（useServingScope / usePharmaRegionScope 由页面注入），
 *   参考稿的 bills/billTypes/comboTypes/一键填入/固定条数不移植；
 * - 「药厂端/服务商端」切换按钮不移植，身份以登录会话为准（服务商端服务提供方固定本企业）；
 * - 查询为演示异步（setTimeout + 令牌防串写），结果由真实数据即时计算；
 * - 查询失败 / 生成失败仅通过底部「演示选项」显式模拟，正常路径全部成功。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  Info,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { ToastMessage } from '../../components/Toast';
import {
  comboOptionPools,
  listSelectableBills,
  monthLabel,
  periodLabel,
  summarizeBill,
  summarizeCombo,
  type ComboConditions,
  type DrawerDataCtx,
  type ExportFileState,
  type ExportFormat,
  type ExportMode,
  type ExportRequest,
  type ScopeSummary,
  type SelectableBill,
  type SummaryState,
} from './exportDrawerModel';
import { ComboSelect } from './ComboSelect';
import { PeriodRangePicker } from './PeriodRangePicker';
import './export-report-drawer.css';

/* ─── 列表用：任务状态（单一状态，不按文件拆分展示） ──────────────────────── */

/** 单条报告的任务状态（单一状态）：生成中 / 生成失败 / 已生成 */
export function ExportTaskStatus({ files }: { files: Partial<Record<ExportFormat, ExportFileState>> }) {
  const states = Object.values(files);
  const hasFailed = states.includes('failed');
  const hasLoading = states.includes('generating');
  const state = hasLoading ? 'generating' : hasFailed ? 'failed' : 'generated';
  const text = hasLoading ? '生成中' : hasFailed ? '生成失败' : '已生成';
  const color =
    state === 'generated'
      ? 'var(--color-success-fg)'
      : state === 'failed'
        ? 'var(--color-danger-fg)'
        : 'var(--color-warning-fg)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 25,
        borderRadius: 13,
        padding: '0 9px',
        fontSize: 'var(--fs-12)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color,
        background:
          state === 'generated'
            ? 'var(--color-success-bg)'
            : state === 'failed'
              ? 'var(--color-danger-bg)'
              : 'var(--color-warning-bg)',
      }}
    >
      {hasLoading ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            borderRightColor: 'transparent',
            animation: 'bxrSpin 0.8s linear infinite',
            display: 'inline-block',
          }}
        />
      ) : (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      )}
      {text}
    </span>
  );
}

const ALL_PROVIDER = '';
const ALL_WORKGROUP = '';
const ALL_VARIETY = '';
const ALL_SPECIALIST = '';

interface ModeSummary {
  state: SummaryState;
  data: ScopeSummary | null;
  /** 组合条件模式：查询时应用的快照（摘要展示与提交都以它为准） */
  appliedConditions: ComboConditions | null;
}

const IDLE_SUMMARY: ModeSummary = { state: 'idle', data: null, appliedConditions: null };

export interface ExportReportDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 提交（页面负责写台账、模拟文件生成与提示） */
  onSubmit: (req: ExportRequest) => void;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  /** 会话口径数据与判定（页面组装） */
  dataCtx: DrawerDataCtx;
  isProviderSession: boolean;
  /** 药厂会话（文档化会话口径；组合条件归属药厂由页面计算传入） */
  isPharmaSession: boolean;
  /** 本企业名（服务商会话固定为本企业） */
  tenantName: string;
  /** 服务商会话的当前服务药厂 */
  currentPharmaName?: string;
  /** 组合条件报告的归属药厂兜底（非对账单模式行归属） */
  comboHolderPharma: string;
}

/* ─── 三态复选框 ──────────────────────────────────────────────────────────── */

function CheckBox({ checked, partial, disabled }: { checked: boolean; partial?: boolean; disabled?: boolean }) {
  const on = checked || partial;
  return (
    <span
      className={`bxr-checkbox ${on ? 'bxr-checked' : ''} ${disabled ? 'bxr-disabled' : ''}`}
      aria-hidden
    >
      {partial ? <i /> : checked ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  );
}

/* ─── 抽屉 ────────────────────────────────────────────────────────────────── */

export function ExportReportDrawer({
  open,
  onClose,
  onSubmit,
  addToast,
  dataCtx,
  isProviderSession,
  isPharmaSession,
  tenantName,
  currentPharmaName,
  comboHolderPharma,
}: ExportReportDrawerProps) {
  // isPharmaSession 当前只用于文档化会话口径；组合条件归属药厂由页面计算传入
  const [mode, setMode] = useState<ExportMode>('bill');
  const [billMenuOpen, setBillMenuOpen] = useState(false);
  const [billSearch, setBillSearch] = useState('');
  const [selectedBillId, setSelectedBillId] = useState('');
  const [summaryByMode, setSummaryByMode] = useState<Record<ExportMode, ModeSummary>>({
    bill: IDLE_SUMMARY,
    combo: IDLE_SUMMARY,
  });
  const [monthStart, setMonthStart] = useState('');
  const [monthEnd, setMonthEnd] = useState('');
  const [provider, setProvider] = useState(ALL_PROVIDER);
  const [workgroup, setWorkgroup] = useState(ALL_WORKGROUP);
  const [variety, setVariety] = useState(ALL_VARIETY);
  const [specialist, setSpecialist] = useState(ALL_SPECIALIST);
  const [comboApplied, setComboApplied] = useState(false);
  const [comboDirty, setComboDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedTypesByMode, setSelectedTypesByMode] = useState<Record<ExportMode, string[]>>({
    bill: [],
    combo: [],
  });
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf']);
  const [submitting, setSubmitting] = useState(false);
  // 演示选项（原型无后端：显式模拟故障，正常路径不受影响）
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoFailQuery, setDemoFailQuery] = useState(false);
  const [demoFailGenerate, setDemoFailGenerate] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const billMenuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  /** 查询令牌：模式切换 / 关闭 / 新查询都会使旧超时作废，旧请求不得写入当前模式 */
  const queryToken = useRef(0);
  const modeRef = useRef<ExportMode>('bill');
  const timersRef = useRef<number[]>([]);

  const bills = useMemo(() => listSelectableBills(dataCtx), [dataCtx]);
  const selectedBill: SelectableBill | null =
    bills.find((b) => b.billId === selectedBillId) ?? null;

  const billSearchKey = billSearch.trim().toLowerCase();
  const filteredBills = useMemo(
    () => bills.filter((b) => `${b.billNo}${b.provider}`.toLowerCase().includes(billSearchKey)),
    [bills, billSearchKey],
  );

  /** 组合条件的当前取值（服务商会话服务提供方固定本企业） */
  const conditionsNow: ComboConditions = {
    monthStart,
    monthEnd,
    provider: isProviderSession ? tenantName : provider,
    workgroup,
    variety,
    specialist,
  };
  const pools = useMemo(
    () => comboOptionPools(dataCtx, { provider: conditionsNow.provider || undefined }),
    // conditionsNow 随渲染重建；选项池按数据 + 当前服务提供方计算即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataCtx, conditionsNow.provider],
  );
  const monthOrderInvalid = Boolean(monthStart && monthEnd && monthStart > monthEnd);

  const activeSummary = summaryByMode[mode];
  const selectedTypes = selectedTypesByMode[mode];
  const selectedBiz = (activeSummary.data?.types ?? []).filter((t) => selectedTypes.includes(t.id));
  const recordCount = selectedBiz.reduce((s, t) => s + t.count, 0);
  const summaryReady =
    activeSummary.state === 'ready' && activeSummary.data !== null && !(mode === 'combo' && comboDirty);
  const canSubmit = summaryReady && recordCount > 0 && formats.length > 0 && !submitting;

  /* ── 打开 / 关闭：重置为默认态（按对账单、未选单、PDF 已选），焦点管理 ── */

  const resetAll = useCallback(() => {
    queryToken.current += 1;
    modeRef.current = 'bill';
    setMode('bill');
    setBillMenuOpen(false);
    setBillSearch('');
    setSelectedBillId('');
    setSummaryByMode({ bill: IDLE_SUMMARY, combo: IDLE_SUMMARY });
    setMonthStart('');
    setMonthEnd('');
    setProvider(ALL_PROVIDER);
    setWorkgroup(ALL_WORKGROUP);
    setVariety(ALL_VARIETY);
    setSpecialist(ALL_SPECIALIST);
    setComboApplied(false);
    setComboDirty(false);
    setExpanded(false);
    setSelectedTypesByMode({ bill: [], combo: [] });
    setFormats(['pdf']);
    setSubmitting(false);
    setDemoOpen(false);
    setDemoFailQuery(false);
    setDemoFailGenerate(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    resetAll();
    // 等抽屉挂载后把焦点移入
    const t = window.setTimeout(() => drawerRef.current?.focus(), 0);
    timersRef.current.push(t);
    return () => {
      window.clearTimeout(t);
    };
  }, [open, resetAll]);

  useEffect(() => {
    if (open) return;
    restoreFocusRef.current?.focus?.();
    restoreFocusRef.current = null;
  }, [open]);

  // 卸载清理演示查询定时器
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const closeDrawer = useCallback(() => {
    if (submitting) return;
    queryToken.current += 1;
    setBillMenuOpen(false);
    onClose();
  }, [submitting, onClose]);

  // Escape 关闭（提交中防误关）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDrawer();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  // 对账单下拉：点击外部关闭
  useEffect(() => {
    if (!billMenuOpen) return;
    const outside = (e: MouseEvent) => {
      if (billMenuRef.current && !billMenuRef.current.contains(e.target as Node)) setBillMenuOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [billMenuOpen]);

  /* ── 查询（演示异步：令牌 + 模式双守卫，旧请求不得写入当前模式） ── */

  const runQuery = useCallback(
    (target: ExportMode, compute: () => ScopeSummary, applied?: ComboConditions) => {
      const token = ++queryToken.current;
      const failThis = demoFailQuery;
      setDemoFailQuery(false); // 一次性：勾选后仅下一次查询失败，重试即恢复
      setSummaryByMode((cur) => ({
        ...cur,
        [target]: { state: 'loading', data: null, appliedConditions: null },
      }));
      const timer = window.setTimeout(() => {
        if (token !== queryToken.current || modeRef.current !== target) return;
        if (failThis) {
          setSummaryByMode((cur) => ({
            ...cur,
            [target]: { state: 'error', data: null, appliedConditions: null },
          }));
          return;
        }
        const data = compute();
        if (data.totalCount === 0) {
          setSummaryByMode((cur) => ({
            ...cur,
            [target]: { state: 'empty', data, appliedConditions: applied ?? null },
          }));
          setSelectedTypesByMode((cur) => ({ ...cur, [target]: [] }));
          return;
        }
        setSummaryByMode((cur) => ({
          ...cur,
          [target]: { state: 'ready', data, appliedConditions: applied ?? null },
        }));
        // 默认选中有数据的类型；0 条类型不可选
        setSelectedTypesByMode((cur) => ({
          ...cur,
          [target]: data.types.filter((t) => t.count > 0).map((t) => t.id),
        }));
      }, 560);
      timersRef.current.push(timer);
    },
    [demoFailQuery],
  );

  const switchMode = (next: ExportMode) => {
    if (submitting || next === mode) return;
    queryToken.current += 1; // 切模式作废在途查询
    modeRef.current = next;
    setMode(next);
    setExpanded(false);
    setBillMenuOpen(false);
  };

  const chooseBill = (bill: SelectableBill) => {
    setSelectedBillId(bill.billId);
    setBillMenuOpen(false);
    setBillSearch('');
    setExpanded(false);
    runQuery('bill', () => summarizeBill(dataCtx, bill));
  };

  const retrySummary = () => {
    if (mode === 'bill') {
      if (selectedBill) runQuery('bill', () => summarizeBill(dataCtx, selectedBill));
      return;
    }
    // 组合条件重试：按当前表单值重新应用
    if (!monthStart || !monthEnd || monthOrderInvalid) return;
    const snapshot = { ...conditionsNow };
    setComboDirty(false);
    setComboApplied(true);
    setExpanded(false);
    runQuery('combo', () => summarizeCombo(dataCtx, snapshot), snapshot);
  };

  /* ── 组合条件：级联与失效清理 ── */

  const markDirty = () => {
    if (comboApplied) setComboDirty(true);
  };

  const changeProvider = (value: string) => {
    setProvider(value);
    const nextPools = comboOptionPools(dataCtx, { provider: value || undefined });
    const cleared: string[] = [];
    if (workgroup && !nextPools.workgroups.includes(workgroup)) {
      setWorkgroup(ALL_WORKGROUP);
      cleared.push('工作组');
    }
    if (specialist && !nextPools.specialists.includes(specialist)) {
      setSpecialist(ALL_SPECIALIST);
      cleared.push('服务专员');
    }
    if (cleared.length) {
      addToast({
        type: 'info',
        title: '服务提供方已切换',
        description: `原选择的${cleared.join('、')}在新范围内不可用，已自动清除。`,
      });
    }
    markDirty();
  };

  const changeWorkgroup = (value: string) => {
    setWorkgroup(value);
    const nextPools = comboOptionPools(dataCtx, {
      provider: conditionsNow.provider || undefined,
      workgroup: value || undefined,
    });
    if (specialist && !nextPools.specialists.includes(specialist)) {
      setSpecialist(ALL_SPECIALIST);
      addToast({
        type: 'info',
        title: '工作组已切换',
        description: '原选择的服务专员在新工作组不可用，已自动清除。',
      });
    }
    markDirty();
  };

  const applyConditions = () => {
    if (!monthStart || !monthEnd || monthOrderInvalid || submitting) return;
    if (comboApplied && !comboDirty) return;
    const snapshot = { ...conditionsNow };
    setComboDirty(false);
    setComboApplied(true);
    setExpanded(false);
    runQuery('combo', () => summarizeCombo(dataCtx, snapshot), snapshot);
  };

  /* ── 业务类型 / 格式 ── */

  const toggleBusiness = (id: string, count: number) => {
    if (submitting || count === 0) return;
    setSelectedTypesByMode((cur) => ({
      ...cur,
      [mode]: cur[mode].includes(id) ? cur[mode].filter((t) => t !== id) : [...cur[mode], id],
    }));
  };

  const toggleFormat = (format: ExportFormat) => {
    if (submitting) return;
    setFormats((cur) => (cur.includes(format) ? cur.filter((f) => f !== format) : [...cur, format]));
  };

  const allFormats = formats.length === 2;
  const someFormats = formats.length === 1;

  /* ── 提交 ── */

  const submitReport = () => {
    if (!canSubmit || !activeSummary.data) return;
    setSubmitting(true);
    const data = activeSummary.data;
    const isCombo = mode === 'combo';
    const chosenFormats = [...formats];
    const failGenerate = demoFailGenerate;
    const timer = window.setTimeout(() => {
      const bill = selectedBill;
      const appliedCombo = activeSummary.appliedConditions;
      const providerValue = isCombo
        ? isProviderSession
          ? tenantName
          : provider || '全部授权服务提供方'
        : (bill?.provider ?? '');
      // 范围标签只保留实际筛选值（「全部…」占位与模式标签由列表另行展示，避免重复）
      const scopeTags = isCombo
        ? [isProviderSession ? '本企业' : provider, workgroup, variety, specialist].filter(
            (v) => v && !v.startsWith('全部'),
          )
        : [];
      const request: ExportRequest = {
        mode,
        billNo: bill?.billNo ?? '',
        billId: bill?.billId ?? '',
        name: isCombo
          ? `${periodLabel(monthStart)}至${periodLabel(monthEnd)}业务明细报告`
          : `${monthLabel(bill?.serviceMonth ?? '') || bill?.servicePeriod || ''}业务明细报告`,
        provider: providerValue,
        holderPharma: isCombo ? comboHolderPharma : (bill?.holderPharma ?? comboHolderPharma),
        variety: isCombo ? variety : (bill?.varietyLabel ?? ''),
        regions: data.regions,
        records: recordCount,
        typeNames: selectedBiz.map((t) => t.name),
        formats: chosenFormats,
        scopeLabel: isCombo
          ? `${periodLabel(monthStart)} 至 ${periodLabel(monthEnd)}`
          : (bill?.billNo ?? ''),
        scopeTags,
        voucherAmount: data.voucherAmount,
        declaredAmount: data.declaredAmount,
        simulateFailure: failGenerate,
      };
      onSubmit(request);
      setSubmitting(false);
      queryToken.current += 1;
      onClose();
    }, 720);
    timersRef.current.push(timer);
  };

  /* ── 底部提示 ── */

  const footerHint = (): string => {
    if (mode === 'bill' && !selectedBill) return '请先选择对账单';
    if (mode === 'combo' && (!monthStart || !monthEnd)) return '请先选择工作量周期并应用条件';
    if (mode === 'combo' && monthOrderInvalid) return '工作量周期起月不能晚于止月';
    if (mode === 'combo' && comboDirty) return '条件已修改，请重新应用后生成';
    if (activeSummary.state === 'loading') return '正在查询可导出业务，完成后可生成';
    if (activeSummary.state === 'empty') return '未找到符合条件的业务记录';
    if (activeSummary.state === 'error') return '读取失败，请重试';
    if (summaryReady && recordCount === 0) return '请至少选择一种有记录的业务类型';
    if (formats.length === 0) return '请至少选择一种导出格式';
    if (submitting) return '正在提交，请稍候…';
    return '两种格式使用同一份导出范围与数据快照，生成后可在列表下载';
  };

  if (!open) return null;

  const providerDisabled = isProviderSession;
  const providerDisplay = isProviderSession
    ? `本企业（当前服务药厂：${currentPharmaName ?? '未选择'}）`
    : '';

  return (
    <>
      <div className="bxr-scrim" onClick={closeDrawer} aria-hidden />
      <div
        ref={drawerRef}
        className="bxr-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="新建报告"
        tabIndex={-1}
      >
        {/* 头部 */}
        <div className="bxr-header">
          <div>
            <h2>新建报告</h2>
            <p>设置导出范围和文件类型，生成业务明细报告</p>
          </div>
          <button className="bxr-close" onClick={closeDrawer} disabled={submitting} aria-label="关闭抽屉">
            <X size={20} />
          </button>
        </div>

        {/* 主体 */}
        <div className="bxr-body">
          {/* ── 导出范围 ── */}
          <section className="bxr-section">
            <div className="bxr-section-title">
              <div>
                <h3>
                  导出范围<i>*</i>
                </h3>
                <p>选择一种方式确定本次导出的业务记录</p>
              </div>
            </div>
            <div className="bxr-mode-tabs" role="tablist" aria-label="导出范围模式">
              <button
                role="tab"
                aria-selected={mode === 'bill'}
                className={mode === 'bill' ? 'active' : ''}
                disabled={submitting}
                onClick={() => switchMode('bill')}
              >
                <span className="bxr-mode-radio">{mode === 'bill' && <i />}</span>按对账单
              </button>
              <button
                role="tab"
                aria-selected={mode === 'combo'}
                className={mode === 'combo' ? 'active' : ''}
                disabled={submitting}
                onClick={() => switchMode('combo')}
              >
                <span className="bxr-mode-radio">{mode === 'combo' && <i />}</span>按组合条件
              </button>
            </div>

            {mode === 'bill' ? (
              <div>
                <div className="bxr-bill-select" ref={billMenuRef}>
                  <span className="bxr-field-label">对账单</span>
                  <button
                    className={`bxr-select-trigger ${billMenuOpen ? 'focused' : ''}`}
                    onClick={() => !submitting && setBillMenuOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={billMenuOpen}
                  >
                    {selectedBill ? (
                      <span>
                        <strong>{selectedBill.billNo}</strong>
                        <small>
                          {selectedBill.provider} · 归属 {monthLabel(selectedBill.serviceMonth) || selectedBill.servicePeriod}
                        </small>
                      </span>
                    ) : (
                      <em>搜索并选择对账单</em>
                    )}
                    <ChevronDown size={16} />
                  </button>
                  {billMenuOpen && (
                    <div className="bxr-select-menu">
                      <div className="bxr-select-search">
                        <Search size={16} />
                        <input
                          autoFocus
                          value={billSearch}
                          onChange={(e) => setBillSearch(e.target.value)}
                          placeholder="搜索对账单编号或服务提供方"
                          aria-label="搜索对账单"
                        />
                      </div>
                      <div className="bxr-select-label">仅展示授权范围内、已确认且未作废的结算单</div>
                      <div className="bxr-select-list" role="listbox" aria-label="可选取的对账单">
                        {filteredBills.length === 0 ? (
                          <div className="bxr-no-result">未找到匹配的对账单</div>
                        ) : (
                          filteredBills.map((bill) => (
                            <button
                              key={bill.billId}
                              role="option"
                              aria-selected={selectedBillId === bill.billId}
                              className={selectedBillId === bill.billId ? 'selected' : ''}
                              onClick={() => chooseBill(bill)}
                            >
                              <span className="bxr-radio">
                                {selectedBillId === bill.billId && <i />}
                              </span>
                              <span>
                                <strong>{bill.billNo}</strong>
                                <small>
                                  {bill.provider} · {monthLabel(bill.serviceMonth) || bill.servicePeriod} ·{' '}
                                  {bill.varietyLabel}
                                </small>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {selectedBill && (
                  <div className="bxr-bill-detail">
                    <div>
                      <span>服务提供方</span>
                      <strong>{selectedBill.provider}</strong>
                    </div>
                    <div className="bxr-detail-pair">
                      <div>
                        <span>品种</span>
                        <strong>{selectedBill.varietyLabel}</strong>
                      </div>
                      <div>
                        <span>结算周期</span>
                        <strong>{selectedBill.servicePeriod}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="bxr-combo-intro">
                  <span>按业务归属月份导出业务明细，支持跨结算单聚合</span>
                </div>
                <div className="bxr-field">
                  <span className="bxr-field-label">
                    工作量周期<i style={{ color: 'var(--color-danger-fg)', fontStyle: 'normal', marginLeft: 2 }}>*</i>
                  </span>
                  <PeriodRangePicker
                    start={monthStart}
                    end={monthEnd}
                    disabled={submitting}
                    invalid={monthOrderInvalid}
                    onChange={(s, e) => {
                      setMonthStart(s);
                      setMonthEnd(e);
                      markDirty();
                    }}
                  />
                  {monthOrderInvalid ? (
                    <small className="bxr-field-error">起点不能晚于终点，请调整后再应用</small>
                  ) : (
                    <small className="bxr-field-hint">支持按月或按具体日期筛选业务记录（含边界）</small>
                  )}
                </div>
                <div className="bxr-combo-grid">
                  <div className="bxr-field">
                    <span className="bxr-field-label">服务提供方</span>
                    <ComboSelect
                      label="服务提供方"
                      value={providerDisabled ? '' : provider}
                      disabled={providerDisabled || submitting}
                      options={
                        providerDisabled
                          ? [{ value: '', label: providerDisplay }]
                          : [
                              { value: ALL_PROVIDER, label: '全部授权服务提供方' },
                              ...pools.providers.map((p) => ({ value: p, label: p })),
                            ]
                      }
                      onChange={changeProvider}
                    />
                    {providerDisabled && (
                      <small className="bxr-field-hint">服务商会话按本企业及当前服务药厂导出</small>
                    )}
                  </div>
                  <div className="bxr-field">
                    <span className="bxr-field-label">工作组</span>
                    <ComboSelect
                      label="工作组"
                      value={workgroup}
                      disabled={submitting}
                      options={[
                        { value: ALL_WORKGROUP, label: '全部工作组' },
                        ...pools.workgroups.map((w) => ({ value: w, label: w })),
                      ]}
                      onChange={changeWorkgroup}
                    />
                  </div>
                  <div className="bxr-field">
                    <span className="bxr-field-label">品种</span>
                    <ComboSelect
                      label="品种"
                      value={variety}
                      disabled={submitting}
                      options={[
                        { value: ALL_VARIETY, label: '全部品种' },
                        ...pools.varieties.map((v) => ({ value: v, label: v })),
                      ]}
                      onChange={(v) => {
                        setVariety(v);
                        markDirty();
                      }}
                    />
                  </div>
                  <div className="bxr-field">
                    <span className="bxr-field-label">服务专员</span>
                    <ComboSelect
                      label="服务专员"
                      value={specialist}
                      disabled={submitting}
                      options={[
                        { value: ALL_SPECIALIST, label: '全部服务专员' },
                        ...pools.specialists.map((s) => ({ value: s, label: s })),
                      ]}
                      onChange={(v) => {
                        setSpecialist(v);
                        markDirty();
                      }}
                    />
                  </div>
                </div>
                <div className="bxr-apply-row">
                  <span>
                    {monthOrderInvalid
                      ? '周期顺序有误，请先调整'
                      : !comboApplied
                        ? '选择工作量周期后，应用条件查看结果'
                        : comboDirty
                          ? '条件已修改，请重新应用'
                          : '条件已应用'}
                  </span>
                  <button
                    className="bxr-apply-button"
                    disabled={
                      !monthStart ||
                      !monthEnd ||
                      monthOrderInvalid ||
                      submitting ||
                      (comboApplied && !comboDirty) ||
                      activeSummary.state === 'loading'
                    }
                    onClick={applyConditions}
                  >
                    {activeSummary.state === 'loading' && <span className="bxr-loader" />}
                    应用条件
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── 本次导出摘要 ── */}
          <section className="bxr-section">
            <div className="bxr-section-title">
              <div>
                <h3>本次导出摘要</h3>
                <p>
                  {mode === 'combo' && comboDirty
                    ? '以下为上次应用结果，重新应用条件后更新'
                    : '仅统计当前权限范围内可导出的业务记录'}
                </p>
              </div>
              {mode === 'combo' && comboDirty && <span className="bxr-previous-tag">上次结果</span>}
            </div>

            {activeSummary.state === 'idle' && (
              <div className="bxr-empty-summary">
                <span>
                  <FileText size={22} />
                </span>
                <strong>{mode === 'bill' ? '选择对账单后查看摘要' : '应用组合条件后查看摘要'}</strong>
                <p>
                  {mode === 'combo'
                    ? '选择工作量周期后，应用条件查看结果'
                    : '系统将读取本单已确认业务与关联拜访记录'}
                </p>
              </div>
            )}
            {activeSummary.state === 'loading' && (
              <div className="bxr-summary-loading" aria-live="polite">
                <div className="bxr-skeleton-row">
                  <i />
                  <span>
                    <b />
                    <b />
                  </span>
                </div>
                <div className="bxr-skeleton-line" />
                <p>
                  <span className="bxr-loader" />
                  正在查询可导出业务...
                </p>
              </div>
            )}
            {activeSummary.state === 'error' && (
              <div className="bxr-state-panel bxr-error-panel" role="alert">
                <span className="bxr-state-icon">
                  <AlertTriangle size={19} />
                </span>
                <div>
                  <strong>读取失败</strong>
                  <p>暂时无法读取符合范围的业务记录，请重试。</p>
                  <button onClick={retrySummary}>
                    <RefreshCw size={14} />
                    重试
                  </button>
                </div>
              </div>
            )}
            {activeSummary.state === 'empty' && (
              <div className="bxr-state-panel bxr-empty-panel">
                <span className="bxr-state-icon">
                  <Info size={19} />
                </span>
                <div>
                  <strong>未找到符合条件的业务</strong>
                  <p>
                    {mode === 'combo'
                      ? '当前周期与筛选条件下没有可导出的业务记录，请调整后重新应用。'
                      : '此对账单暂无当前权限内可导出的记录，请更换对账单。'}
                  </p>
                  {mode === 'combo' && (
                    <button
                      onClick={() => {
                        setMonthStart('');
                        setMonthEnd('');
                        setComboApplied(false);
                        setComboDirty(false);
                        setSummaryByMode((cur) => ({ ...cur, combo: IDLE_SUMMARY }));
                      }}
                    >
                      修改条件
                    </button>
                  )}
                </div>
              </div>
            )}
            {activeSummary.state === 'ready' && activeSummary.data && (
              <div className={mode === 'combo' && comboDirty ? 'bxr-stale-summary' : ''}>
                <div className="bxr-summary-card">
                  <div className="bxr-summary-top">
                    <div>
                      <span className="bxr-summary-kicker">
                        {mode === 'bill' ? '按对账单' : '组合条件'}
                      </span>
                      <h4>
                        已选 {selectedBiz.length} <small>类</small>
                        <i />
                        {recordCount} <small>条业务记录</small>
                      </h4>
                    </div>
                    <span className="bxr-ready-check">
                      <Check size={16} />
                    </span>
                  </div>
                  <div className="bxr-scope-summary">
                    <span>本次范围</span>
                    <strong>
                      {mode === 'bill'
                        ? (selectedBill?.billNo ?? '—')
                        : `${periodLabel(monthStart)} 至 ${periodLabel(monthEnd)}`}
                    </strong>
                  </div>
                  {mode === 'combo' && (
                    <div className="bxr-scope-tags">
                      {(activeSummary.appliedConditions
                        ? [
                            isProviderSession
                              ? '本企业'
                              : activeSummary.appliedConditions.provider || '全部授权服务提供方',
                            activeSummary.appliedConditions.workgroup || '全部工作组',
                            activeSummary.appliedConditions.variety || '全部品种',
                            activeSummary.appliedConditions.specialist || '全部服务专员',
                          ]
                        : []
                      ).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <p className="bxr-permission-note">
                    <Info size={13} />
                    仅含当前权限内记录；证据清单仅列文件信息和关联业务
                  </p>
                </div>
                <button
                  className={`bxr-adjust-toggle ${expanded ? 'bxr-expanded' : ''}`}
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  调整业务类型
                  <ChevronDown size={15} />
                </button>
                {expanded && (
                  <div className="bxr-business-list">
                    <div className="bxr-business-head">
                      <strong>选择业务类型</strong>
                      <span>
                        已选 {selectedBiz.length}/{activeSummary.data.types.filter((t) => t.count > 0).length} 类
                      </span>
                    </div>
                    {activeSummary.data.types.map((t) => (
                      <label key={t.id} className={t.count === 0 ? 'bxr-disabled' : ''}>
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(t.id)}
                          disabled={t.count === 0 || submitting}
                          onChange={() => toggleBusiness(t.id, t.count)}
                        />
                        <CheckBox checked={selectedTypes.includes(t.id)} disabled={t.count === 0} />
                        <span>{t.name}</span>
                        <b>{t.count} 条</b>
                      </label>
                    ))}
                  </div>
                )}
                {recordCount === 0 && (
                  <p className="bxr-inline-error">
                    <AlertTriangle size={14} />
                    已选记录为零，请至少选择一种有记录的业务类型
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── 导出类型 ── */}
          <section className="bxr-section">
            <div className="bxr-format-heading">
              <div>
                <h3>
                  导出类型<i>*</i>
                </h3>
                <p>两种文件使用同一批记录和已应用条件，类型切换不触发业务查询</p>
              </div>
              <button
                onClick={() => !submitting && setFormats(allFormats ? [] : ['pdf', 'excel'])}
                disabled={submitting}
                aria-label="全选格式"
              >
                <CheckBox checked={allFormats} partial={someFormats} />
                全选格式
              </button>
            </div>
            <div className="bxr-format-options">
              <label className={formats.includes('pdf') ? 'bxr-selected' : ''}>
                <input
                  type="checkbox"
                  checked={formats.includes('pdf')}
                  disabled={submitting}
                  onChange={() => toggleFormat('pdf')}
                />
                <CheckBox checked={formats.includes('pdf')} />
                <span className="bxr-format-icon">PDF</span>
                <div>
                  <strong>
                    导出明细 PDF 版 <b>(.pdf)</b>
                  </strong>
                  <p>固定 A4 版式，含范围、汇总、业务明细和证据文件清单，自动分页，便于阅读、打印和存档</p>
                </div>
              </label>
              <label className={formats.includes('excel') ? 'bxr-selected' : ''}>
                <input
                  type="checkbox"
                  checked={formats.includes('excel')}
                  disabled={submitting}
                  onChange={() => toggleFormat('excel')}
                />
                <CheckBox checked={formats.includes('excel')} />
                <span className="bxr-format-icon excel">XLS</span>
                <div>
                  <strong>
                    导出明细 Excel 版 <b>(.xlsx)</b>
                  </strong>
                  <p>含导出说明、业务明细和证据文件清单工作表，便于筛选、核对和二次统计</p>
                </div>
              </label>
            </div>
            {formats.length === 0 && (
              <p className="bxr-inline-error">
                <AlertTriangle size={14} />
                请至少选择一种导出格式
              </p>
            )}
          </section>
        </div>

        {/* 底栏 */}
        <div className="bxr-footer">
          <div className="bxr-footer-left">
            <div className="bxr-footer-hint" aria-live="polite">
              {footerHint()}
            </div>
            <button className="bxr-demo-toggle" onClick={() => setDemoOpen((v) => !v)}>
              演示选项 <ChevronDown size={11} />
            </button>
            {demoOpen && (
              <div className="bxr-demo-panel">
                <label>
                  <input
                    type="checkbox"
                    checked={demoFailQuery}
                    onChange={(e) => setDemoFailQuery(e.target.checked)}
                  />
                  模拟下一次查询失败
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={demoFailGenerate}
                    onChange={(e) => setDemoFailGenerate(e.target.checked)}
                  />
                  模拟一种格式生成失败
                </label>
                <span>原型演示开关：不影响正常结果，正常路径全部成功</span>
              </div>
            )}
          </div>
          <div className="bxr-footer-actions">
            <button className="bxr-cancel-button" onClick={closeDrawer} disabled={submitting}>
              取消
            </button>
            <button className="bxr-submit-button" disabled={!canSubmit} onClick={submitReport}>
              {submitting && <span className="bxr-button-spinner" />}
              {submitting ? '提交中' : '生成报告'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
