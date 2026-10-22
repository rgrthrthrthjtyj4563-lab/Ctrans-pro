import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, FileText,
  Info, Loader2, PencilLine, Plus, RefreshCw, Search, Trash2, Upload, X,
} from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { queryNmpaDrugs, type NmpaDrugRecord } from '../data/nmpaDrugRegistry';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import type { ToastMessage } from '../components/Toast';
import { DEMO_HOLDER, useTaskData } from '../context/TaskDataContext';
import { usePermission } from '../context/PermissionContext';
import type { NavigateFn, Role, Variety } from '../types';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
  navigate?: NavigateFn;
}

interface ContractCandidate { id: string; name: string; contractName: string; clue: string; }
interface VarietyAttachment { id: string; name: string; type: string; size: string; uploader: string; uploadedAt: string; }

const CONTRACT_CANDIDATES: ContractCandidate[] = [
  { id: 'contract-candidate-ezetimibe', name: '依折麦布片', contractName: '004市场综合服务协议', clue: '覆盖华东地区，关联 32 条服务价目' },
  { id: 'contract-candidate-ticagrelor', name: '替格瑞洛片', contractName: '004市场综合服务协议', clue: '覆盖华北地区，关联 18 条服务价目' },
];

const emptyForm: Omit<Variety, 'id'> = {
  genericName: '', tradeName: '', approvalNo: '', applicableDept: '', dosageForm: '',
  spec: '', package: '', unit: '', holder: DEMO_HOLDER, manufacturer: '', validUntil: '', activePriceBookId: '',
};

const initialAttachments: Record<string, VarietyAttachment[]> = {
  'V-001': [
    { id: 'attachment-1', name: '阿托伐他汀钙片说明书.pdf', type: '药品说明书', size: '2.4 MB', uploader: '张华', uploadedAt: '2026-09-23 14:22' },
    { id: 'attachment-2', name: '批准证明文件.pdf', type: '批准证明文件', size: '1.1 MB', uploader: '张华', uploadedAt: '2026-09-23 14:20' },
  ],
};

const inputStyle: CSSProperties = {
  width: '100%', height: 34, padding: '0 10px', border: '1px solid var(--color-border-strong)',
  borderRadius: 6, outline: 'none', color: 'var(--color-text-1)', background: '#fff', fontFamily: 'inherit', fontSize: 'var(--fs-13)',
};

function priceStatusOf(variety: Variety) { return variety.activePriceBookId ? '已配置' : '未配置'; }
function varietyDisplayName(variety: Variety) { return [variety.genericName, variety.spec, variety.package].filter(Boolean).join(' '); }

export function VarietyManage({ addToast, navigate }: Props) {
  const { varieties, createVariety, updateVariety } = useTaskData();
  const { can } = usePermission();
  const canWrite = can('varieties', 'edit');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Variety | null>(null);
  const [detailTab, setDetailTab] = useState<'basic' | 'attachments'>('basic');
  const [drawer, setDrawer] = useState<{ editing?: Variety; candidate?: ContractCandidate; prefill?: NmpaDrugRecord } | null>(null);
  const [contractHintDismissed, setContractHintDismissed] = useState(false);
  const [contractHintExpanded, setContractHintExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState<'全部' | '已配置' | '未配置'>('全部');
  const [attachmentMap, setAttachmentMap] = useState<Record<string, VarietyAttachment[]>>(initialAttachments);
  const [showPriceGuide, setShowPriceGuide] = useState(false);

  const pendingCandidates = useMemo(
    () => CONTRACT_CANDIDATES.filter((candidate) => !varieties.some((variety) => variety.genericName.trim() === candidate.name)),
    [varieties],
  );
  const filteredVarieties = useMemo(() => {
    const query = search.trim().toLowerCase();
    return varieties.filter((variety) => {
      const hitSearch = !query || [variety.genericName, variety.tradeName, variety.approvalNo, variety.holder]
        .some((value) => value.toLowerCase().includes(query));
      return hitSearch && (priceFilter === '全部' || priceStatusOf(variety) === priceFilter);
    });
  }, [priceFilter, search, varieties]);

  function openCreate(candidate?: ContractCandidate) { setDrawer({ candidate }); }
  function openEdit(variety: Variety) { setDrawer({ editing: variety }); }
  function openDetail(variety: Variety, tab: 'basic' | 'attachments' = 'basic', shouldShowPriceGuide = false) {
    setSelected(variety); setDetailTab(tab); setShowPriceGuide(shouldShowPriceGuide && !variety.activePriceBookId); setView('detail');
  }
  function goToPriceConfig() {
    if (navigate) { navigate('price-config'); return; }
    addToast({ type: 'info', title: '请前往价目表配置', description: '已为该品种保留价目配置入口。' });
  }
  function addAttachment(file: File) {
    if (!selected) return;
    const attachment: VarietyAttachment = {
      id: `attachment-${Date.now()}`, name: file.name, type: '其他资料',
      size: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`,
      uploader: '当前用户', uploadedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    setAttachmentMap((map) => ({ ...map, [selected.id]: [...(map[selected.id] ?? []), attachment] }));
    addToast({ type: 'success', title: '资料已上传', description: file.name });
  }
  function removeAttachment(attachmentId: string) {
    if (!selected) return;
    setAttachmentMap((map) => ({ ...map, [selected.id]: (map[selected.id] ?? []).filter((attachment) => attachment.id !== attachmentId) }));
    addToast({ type: 'success', title: '资料已删除' });
  }

  if (view === 'detail' && selected) {
    const current = varieties.find((variety) => variety.id === selected.id) ?? selected;
    return <VarietyDetail
      variety={current} tab={detailTab} onBack={() => setView('list')} onTabChange={setDetailTab}
      onEdit={() => openEdit(current)} onGoToPriceConfig={goToPriceConfig}
      onDismissPriceGuide={() => setShowPriceGuide(false)} showPriceGuide={showPriceGuide && !current.activePriceBookId}
      attachments={attachmentMap[current.id] ?? []} onAddAttachment={addAttachment} onDeleteAttachment={removeAttachment} canWrite={canWrite}
    />;
  }

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader title="品种管理" description="维护药厂实际经营品种及其资料、合同线索和价目配置情况。" />
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', gap: 8 }}>
          {canWrite && <Button variant="primary" icon={<Plus size={15} />} onClick={() => openCreate()}>新建品种</Button>}
          {canWrite && <Button variant="outline" onClick={() => addToast({ type: 'info', title: '批量导入待接入', description: '当前原型保留入口，尚未导入任何品种数据。' })}>批量导入</Button>}
        </div>
        <div style={filterStyle}>
          <label style={searchBoxStyle}><Search size={15} color="#98A2B3" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索通用名、商品名、批准文号" style={{ border: 'none', outline: 'none', minWidth: 210, fontFamily: 'inherit', fontSize: 'var(--fs-13)' }} /></label>
          <select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value as typeof priceFilter)} style={{ ...inputStyle, width: 126 }}><option value="全部">价目配置状态</option><option value="已配置">已配置</option><option value="未配置">未配置</option></select>
          <button type="button" onClick={() => { setSearch(''); setPriceFilter('全部'); }} style={resetButtonStyle}>重置</button>
        </div>
      </div>
      {!contractHintDismissed && pendingCandidates.length > 0 && <ContractCandidateCard candidates={pendingCandidates} expanded={contractHintExpanded} onToggle={() => setContractHintExpanded((expanded) => !expanded)} onDismiss={() => setContractHintDismissed(true)} onCreate={openCreate} canWrite={canWrite} />}
      <div style={tableCardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}><thead><tr>{['通用名 / 商品名', '规格 / 包装', '批准文号', '剂型', '上市许可持有人', '价目配置', '关联合同', '最近更新', '操作'].map((label) => <th key={label} style={thStyle}>{label}</th>)}</tr></thead>
          <tbody>{filteredVarieties.length === 0 ? <tr><td colSpan={9}><EmptyState title="未找到品种" description="请调整筛选条件，或新建一个品种档案。" /></td></tr> : filteredVarieties.map((variety) => {
            const configured = Boolean(variety.activePriceBookId);
            return <tr key={variety.id} style={{ borderBottom: '1px solid #F1F3F5' }}>
              <td style={tdStyle}><div style={{ fontWeight: 600 }}>{variety.genericName}</div><div style={{ color: 'var(--color-text-2)', fontSize: 'var(--fs-12)', marginTop: 2 }}>{variety.tradeName || '—'}</div></td>
              <td style={tdStyle}>{[variety.spec, variety.package].filter(Boolean).join(' · ') || '—'}</td><td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)' }}>{variety.approvalNo || '—'}</td><td style={tdStyle}>{variety.dosageForm || '—'}</td><td style={tdStyle}>{variety.holder || '—'}</td>
              <td style={tdStyle}><StatusPill tone={configured ? 'success' : 'warning'}>{configured ? '已配置' : '未配置'}</StatusPill></td><td style={tdStyle}><StatusPill tone="neutral">{variety.id === 'V-001' ? '1 份' : '—'}</StatusPill></td><td style={{ ...tdStyle, color: 'var(--color-text-2)', fontSize: 'var(--fs-12)' }}>2026-09-23</td>
              <td style={tdStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" onClick={() => openDetail(variety)} style={actionLinkStyle}>查看</button>{canWrite && <><span style={{ color: '#D0D5DD' }}>|</span><button type="button" onClick={() => openEdit(variety)} style={{ ...actionLinkStyle, color: 'var(--color-text-2)' }}>编辑</button></>}</div></td>
            </tr>;
          })}</tbody>
        </table>
        <div style={paginationStyle}>共 {filteredVarieties.length} 条记录</div>
      </div>
    </div>
    {drawer && <VarietyDrawer key={drawer.editing ? `edit-${drawer.editing.id}` : drawer.prefill ? `prefill-${drawer.prefill.id}` : `create-${drawer.candidate?.id ?? 'blank'}`} editing={drawer.editing} candidate={drawer.candidate} prefillRecord={drawer.prefill} varieties={varieties} onClose={() => setDrawer(null)} onCreateFromRecord={(record) => setDrawer({ prefill: record })} onSubmit={(form) => {
      const result = drawer.editing ? updateVariety(drawer.editing.id, form) : createVariety(form);
      if (!result.ok || !result.data) return { ok: false, message: result.error ?? '保存失败' };
      setDrawer(null); addToast({ type: 'success', title: drawer.editing ? '品种已更新' : '品种已创建', description: result.data.genericName }); openDetail(result.data, 'basic', !drawer.editing); return { ok: true };
    }} />}
  </div>;
}

function ContractCandidateCard({ candidates, expanded, onToggle, onDismiss, onCreate, canWrite }: { candidates: ContractCandidate[]; expanded: boolean; onToggle: () => void; onDismiss: () => void; onCreate: (candidate: ContractCandidate) => void; canWrite: boolean }) {
  return <section style={{ marginBottom: 16, border: '1px solid #F2C66D', background: '#FFF9E9', borderRadius: 8, overflow: 'hidden' }}>
    <div style={{ display: 'flex', gap: 12, padding: 16 }}><div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: '0 0 auto', color: '#A95F00', background: '#FEF0C7', borderRadius: 7 }}><FileText size={18} /></div><div style={{ minWidth: 0, flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div style={{ fontSize: 'var(--fs-14)', fontWeight: 650, color: '#7A4900' }}>合同中发现 {candidates.length} 个未建档品种</div><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button type="button" onClick={onDismiss} style={candidateTextButtonStyle}>暂不处理</button><button type="button" aria-label={expanded ? '收起候选品种' : '展开候选品种'} onClick={onToggle} style={iconTextButtonStyle}><ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }} /></button></div></div><p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#9A6207', lineHeight: 1.65 }}>《004市场综合服务协议》提到了以下品种，但合同未包含规格、批准文号等识别信息，系统暂未找到对应品种档案。</p></div></div>
    {expanded && candidates.map((candidate) => <div key={candidate.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(180px, 1.35fr) minmax(220px, 1.6fr) auto', gap: 18, alignItems: 'center', padding: '12px 16px 12px 62px', borderTop: '1px solid #F8DEA4', background: '#FFFDF6' }}><CandidateCell label="合同候选名称" value={candidate.name} strong /><CandidateCell label="来源合同" value={candidate.contractName} /><CandidateCell label="合同线索" value={candidate.clue} />{canWrite && <Button size="sm" variant="primary" onClick={() => onCreate(candidate)}>去新建品种</Button>}</div>)}
  </section>;
}
function CandidateCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div><div style={{ color: '#A56B0B', fontSize: 'var(--fs-12)', marginBottom: 3 }}>{label}</div><div style={{ color: '#744500', fontSize: 'var(--fs-13)', fontWeight: strong ? 650 : 400 }}>{value}</div></div>; }

type NmpaQueryStatus = 'idle' | 'querying' | 'empty' | 'single' | 'multi' | 'applied';
type VarietyForm = Omit<Variety, 'id'>;

/** 联查可回填的表单字段（批准文号在编辑态受「另一实际品种」保护，不参与差异采用） */
const QUERY_MAPPED_KEYS = ['tradeName', 'genericName', 'approvalNo', 'dosageForm', 'spec', 'package', 'manufacturer'] as const;
type QueryMappedKey = (typeof QUERY_MAPPED_KEYS)[number];

const DIFF_FIELDS: Array<{ key: QueryMappedKey; label: string }> = [
  { key: 'tradeName', label: '商品名' },
  { key: 'genericName', label: '通用名' },
  { key: 'dosageForm', label: '剂型' },
  { key: 'spec', label: '规格' },
  { key: 'package', label: '包装' },
  { key: 'manufacturer', label: '生产企业' },
];

/** 只回填药监局记录里非空的字段，空值保持表单现状由用户补充 */
function recordFormPatch(record: NmpaDrugRecord): Partial<VarietyForm> {
  const patch: Partial<VarietyForm> = {};
  for (const key of QUERY_MAPPED_KEYS) if (record[key].trim()) patch[key] = record[key].trim();
  return patch;
}

function VarietyDrawer({ editing, candidate, prefillRecord, varieties, onClose, onSubmit, onCreateFromRecord }: {
  editing?: Variety; candidate?: ContractCandidate; prefillRecord?: NmpaDrugRecord; varieties: Variety[];
  onClose: () => void; onSubmit: (form: Omit<Variety, 'id'>) => { ok: boolean; message?: string }; onCreateFromRecord: (record: NmpaDrugRecord) => void;
}) {
  const { principal } = usePermission();
  const pharmaName = (principal.realm === 'TENANT' ? principal.tenantName : '') || DEMO_HOLDER;
  const [form, setForm] = useState<VarietyForm>(() => {
    if (editing) return { ...editing };
    const base: VarietyForm = { ...emptyForm, genericName: candidate?.name ?? '' };
    return prefillRecord ? { ...base, ...recordFormPatch(prefillRecord) } : base;
  });
  const [expanded, setExpanded] = useState(false); const [error, setError] = useState('');
  const [queryStatus, setQueryStatus] = useState<NmpaQueryStatus>(prefillRecord ? 'applied' : 'idle');
  const [queryResults, setQueryResults] = useState<NmpaDrugRecord[]>([]);
  const [pickedRecord, setPickedRecord] = useState<NmpaDrugRecord | null>(null);
  const [broughtKeys, setBroughtKeys] = useState<ReadonlySet<string>>(() => new Set(prefillRecord ? Object.keys(recordFormPatch(prefillRecord)) : []));
  const [adoptedKeys, setAdoptedKeys] = useState<ReadonlySet<string>>(new Set());
  const [reviewRecord, setReviewRecord] = useState<NmpaDrugRecord | null>(null);
  const [reviewRows, setReviewRows] = useState<Array<{ key: QueryMappedKey; label: string; current: string; next: string }>>([]);
  const [missingNotice, setMissingNotice] = useState(false);
  const [pendingNotice, setPendingNotice] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const querySeqRef = useRef(0);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onClose]);
  function set<K extends keyof VarietyForm>(key: K, value: VarietyForm[K]) { setForm((previous) => ({ ...previous, [key]: value })); }
  function patchForm(patch: Partial<VarietyForm>) { setForm((previous) => ({ ...previous, ...patch })); }

  function runQuery() {
    const approvalNo = form.approvalNo.trim(); const genericName = form.genericName.trim();
    if (!approvalNo && !genericName) return;
    const seq = ++querySeqRef.current;
    setQueryStatus('querying'); setPickedRecord(null); setReviewRecord(null); setReviewRows([]);
    queryNmpaDrugs({ approvalNo, genericName }).then((records) => {
      if (seq !== querySeqRef.current) return;
      setQueryResults(records);
      setQueryStatus(records.length === 0 ? 'empty' : records.length === 1 ? 'single' : 'multi');
      setPendingNotice(false);
    });
  }
  // 新建态：批准文号或通用名任一有值后 500ms 自动联查；编辑态仅手动触发，带入完成后不再自动重查。
  useEffect(() => {
    if (editing || queryStatus === 'applied') return;
    if (!form.approvalNo.trim() && !form.genericName.trim()) return;
    const timer = setTimeout(runQuery, 500);
    return () => clearTimeout(timer);
  }, [form.approvalNo, form.genericName]);

  function startEditQuery() {
    if (!form.approvalNo.trim() && !form.genericName.trim()) { setMissingNotice(true); return; }
    setMissingNotice(false); runQuery();
  }
  function restartQuery() {
    setQueryStatus('idle'); setQueryResults([]); setPickedRecord(null); setReviewRecord(null); setReviewRows([]);
    runQuery();
  }
  function bringInRecord(record: NmpaDrugRecord) {
    const patch = recordFormPatch(record);
    patchForm(patch); setBroughtKeys(new Set(Object.keys(patch))); setAdoptedKeys(new Set()); setPickedRecord(null); setQueryStatus('applied');
  }
  /** 编辑态选中记录：批准文号不同进保护分支，相同进差异采用面板（无差异直接收起） */
  function chooseForReview(record: NmpaDrugRecord) {
    setPickedRecord(null); setAdoptedKeys(new Set());
    if (record.approvalNo.trim() !== form.approvalNo.trim()) { setReviewRecord(record); setReviewRows([]); return; }
    const rows = DIFF_FIELDS
      .filter(({ key }) => String(form[key] ?? '').trim() !== record[key].trim())
      .map(({ key, label }) => ({ key, label, current: String(form[key] ?? '').trim(), next: record[key].trim() }));
    if (rows.length === 0) { setReviewRecord(null); setReviewRows([]); setQueryStatus('applied'); return; }
    setReviewRecord(record); setReviewRows(rows);
  }
  function adoptRow(key: QueryMappedKey) {
    const row = reviewRows.find((item) => item.key === key);
    if (!row || !reviewRecord) return;
    patchForm({ [key]: row.next });
    setAdoptedKeys((previous) => new Set(previous).add(key));
  }
  function adoptAllRows() {
    if (!reviewRecord) return;
    const patch: Partial<VarietyForm> = {}; const next = new Set(adoptedKeys);
    for (const row of reviewRows) { patch[row.key] = row.next; next.add(row.key); }
    patchForm(patch); setAdoptedKeys(next); setConfirmAllOpen(false);
  }
  function finishReview() {
    if (!reviewRecord) return;
    setReviewRecord(null); setReviewRows([]); setBroughtKeys(new Set()); setQueryStatus('applied');
  }
  function fieldMark(key: QueryMappedKey | 'unit'): 'brought' | 'missing' | undefined {
    if (queryStatus !== 'applied') return undefined;
    if (broughtKeys.has(key) || adoptedKeys.has(key)) return 'brought';
    if (!String(form[key] ?? '').trim()) return 'missing';
    return undefined;
  }
  function submit() {
    if (queryStatus === 'querying' && !pendingNotice) { setPendingNotice(true); return; }
    setPendingNotice(false);
    const required: Array<[keyof VarietyForm, string]> = [['genericName', '通用名'], ['approvalNo', '批准文号'], ['dosageForm', '剂型'], ['spec', '规格'], ['package', '包装'], ['unit', '最小制剂单位']];
    const missing = required.find(([key]) => !String(form[key]).trim()); if (missing) { setError(`请填写${missing[1]}`); return; }
    const duplicate = varieties.find((variety) => variety.approvalNo === form.approvalNo && variety.id !== editing?.id); if (duplicate) { setError('该批准文号已存在，请查看现有品种档案'); return; }
    // 现有主数据模型要求商品名非空；缺省时以通用名作为展示名。持有人=当前登录药厂，保存时自动写入。
    const result = onSubmit({ ...form, tradeName: form.tradeName.trim() || form.genericName.trim(), holder: pharmaName }); if (!result.ok) setError(result.message ?? '保存失败');
  }

  const triggerFilled = Boolean(form.approvalNo.trim() || form.genericName.trim());
  const reviewMismatch = reviewRecord !== null && reviewRecord.approvalNo.trim() !== form.approvalNo.trim();
  const singleRecord = queryResults.length === 1 ? queryResults[0] : null;
  return <div style={drawerOverlayStyle} role="presentation" onMouseDown={onClose}><aside role="dialog" aria-modal="true" aria-label={editing ? '编辑品种' : '新建品种'} style={drawerStyle} onMouseDown={(event) => event.stopPropagation()}>
    <div style={drawerHeaderStyle}><h2 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>{editing ? '编辑品种' : '新建品种'}</h2><button type="button" onClick={onClose} style={iconTextButtonStyle}><X size={18} /></button></div>
    {candidate && <div style={sourceHintStyle}><Info size={16} style={{ flex: '0 0 auto', marginTop: 1 }} /><span><strong>来源线索：</strong>合同中提到“{candidate.name}”。该名称仅用于辅助录入，请根据实际药品信息补全规格和批准文号。</span></div>}
    <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
      {pendingNotice && <div role="status" style={pendingNoticeStyle}>药监局信息仍在查询中。可继续等待，或按当前填写内容保存。</div>}
      {error && <div role="alert" style={{ marginBottom: 14, padding: '9px 10px', borderRadius: 6, background: 'var(--color-danger-bg)', color: 'var(--color-danger-fg)', fontSize: 'var(--fs-12)' }}>{error}</div>}

      {(!editing || queryStatus !== 'idle') && <section style={nmpaSectionStyle} aria-label="药监局药品信息联查">
        <div style={nmpaBarStyle}>
          <span style={nmpaBarTextStyle}>当前药厂：<strong style={{ color: 'var(--color-text-1)' }}>{pharmaName}</strong></span>
          {!editing && queryStatus !== 'applied' && <Button size="sm" variant="outline" loading={queryStatus === 'querying'} disabled={!triggerFilled} onClick={runQuery}>{queryStatus === 'querying' ? '查询中' : '查询'}</Button>}
        </div>
        {queryStatus === 'idle' && <p style={nmpaHintStyle}>输入批准文号或通用名后，系统将查询药监局药品信息，并带入可获取的字段。</p>}
        {queryStatus === 'querying' && <div style={nmpaLoadingStyle}><Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' }} />正在查询药监局药品信息，请稍候…</div>}
        {queryStatus === 'empty' && <div style={nmpaEmptyStyle}>
          <span>未查到相关药品记录。您可以检查批准文号或通用名后重新查询，或继续手工填写品种信息。</span>
          <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={restartQuery}>重新查询</Button>
        </div>}
        {(queryStatus === 'single' || queryStatus === 'multi') && !reviewRecord && <>
          <div style={nmpaTitleStyle}>{queryStatus === 'single' ? '查到 1 条药监局药品记录' : `查到 ${queryResults.length} 条药监局药品记录，请选择实际品种`}</div>
          {queryStatus === 'single' && singleRecord && <NmpaRecordCard record={singleRecord} footer={<Button size="sm" variant="primary" onClick={() => (editing ? chooseForReview(singleRecord) : bringInRecord(singleRecord))}>确认带入</Button>} />}
          {queryStatus === 'multi' && <>
            {queryResults.map((record) => <NmpaRecordCard key={record.id} record={record} selectable selected={pickedRecord?.id === record.id} onSelect={() => setPickedRecord(record)} />)}
            <div style={nmpaMultiFooterStyle}>
              {!pickedRecord && <span style={{ color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' }}>请选择一条药品记录</span>}
              <Button size="sm" variant="primary" disabled={!pickedRecord} onClick={() => pickedRecord && (editing ? chooseForReview(pickedRecord) : bringInRecord(pickedRecord))}>带入所选信息</Button>
            </div>
          </>}
        </>}
        {reviewRecord && !reviewMismatch && <div style={reviewPanelStyle}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 650, color: 'var(--color-text-1)' }}>确认更新</div>
          <p style={{ margin: '4px 0 10px', color: 'var(--color-text-2)', fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>以下信息与药监局查询结果不同，请选择是否采用查询值。</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['字段', '当前品种信息', '药监局查询信息', '操作'].map((label) => <th key={label} style={reviewThStyle}>{label}</th>)}</tr></thead>
            <tbody>{reviewRows.map((row) => <tr key={row.key}>
              <td style={reviewTdStyle}>{row.label}</td>
              <td style={{ ...reviewTdStyle, color: 'var(--color-text-2)' }}>{row.current || '—'}</td>
              <td style={{ ...reviewTdStyle, fontWeight: 550 }}>{row.next || '—'}</td>
              <td style={reviewTdStyle}>{adoptedKeys.has(row.key)
                ? <span style={{ color: 'var(--color-success-fg)', fontSize: 'var(--fs-12)' }}>已采用</span>
                : <button type="button" style={actionLinkStyle} onClick={() => adoptRow(row.key)}>采用查询值</button>}</td>
            </tr>)}</tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button size="sm" variant="outline" onClick={() => setConfirmAllOpen(true)}>全部采用查询值</Button>
            <Button size="sm" variant="primary" onClick={finishReview}>完成</Button>
          </div>
        </div>}
        {reviewRecord && reviewMismatch && <div style={nmpaMismatchStyle}>
          <AlertTriangle size={18} style={{ color: '#B54708', flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: '#7A4900', fontSize: 'var(--fs-13)', fontWeight: 650 }}>所选记录的批准文号与当前品种不同</div>
            <p style={{ margin: '4px 0 8px', color: '#9A6207', fontSize: 'var(--fs-12)', lineHeight: 1.65 }}>可能是另一项实际品种。请新建品种档案，或重新选择查询记录。当前品种：<span style={{ fontFamily: 'var(--font-mono)' }}>{form.approvalNo || '—'}</span>　·　所选记录：<span style={{ fontFamily: 'var(--font-mono)' }}>{reviewRecord.approvalNo}</span></p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="primary" onClick={() => onCreateFromRecord(reviewRecord)}>新建品种</Button>
              <Button size="sm" variant="outline" onClick={() => { setReviewRecord(null); setReviewRows([]); }}>返回选择</Button>
            </div>
          </div>
        </div>}
        {queryStatus === 'applied' && <div style={nmpaAppliedStyle}>
          <CheckCircle2 size={16} style={{ color: 'var(--color-success-fg)', flex: '0 0 auto' }} />
          <span style={{ flex: 1 }}>已带入药监局药品信息。您可以补充或修改后再保存。</span>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={restartQuery}>重新查询</Button>
        </div>}
      </section>}

      <section>
        {editing
          ? <div style={sectionHeadRowStyle}>
              <h3 style={sectionHeadTextStyle}>基础识别信息</h3>
              <Button size="sm" variant="outline" icon={<Search size={13} />} onClick={startEditQuery}>联查药监局信息</Button>
            </div>
          : <SectionHeading>基础识别信息</SectionHeading>}
        {missingNotice && <div role="alert" style={missingNoticeStyle}>
          <span style={{ flex: 1 }}>请先填写批准文号或通用名，再查询药监局药品信息。</span>
          <button type="button" onClick={() => setMissingNotice(false)} style={candidateTextButtonStyle}>知道了</button>
        </div>}
        <div style={formGridStyle}>
          <FormField label="批准文号" required mark={fieldMark('approvalNo')}><input value={form.approvalNo} onChange={(event) => set('approvalNo', event.target.value)} placeholder="如：国药准字H20051408" style={inputStyle} /></FormField>
          <FormField label="通用名" required mark={fieldMark('genericName')}><input value={form.genericName} onChange={(event) => set('genericName', event.target.value)} placeholder="如：阿托伐他汀钙片" style={inputStyle} /></FormField>
          <FormField label="商品名" hint="选填" mark={fieldMark('tradeName')}><input value={form.tradeName} onChange={(event) => set('tradeName', event.target.value)} placeholder="如：力普妥" style={inputStyle} /></FormField>
          <FormField label="剂型" required mark={fieldMark('dosageForm')}><input value={form.dosageForm} onChange={(event) => set('dosageForm', event.target.value)} placeholder="如：片剂" style={inputStyle} /></FormField>
          <FormField label="规格" required mark={fieldMark('spec')}><input value={form.spec} onChange={(event) => set('spec', event.target.value)} placeholder="如：10mg" style={inputStyle} /></FormField>
          <FormField label="包装" required mark={fieldMark('package')}><input value={form.package} onChange={(event) => set('package', event.target.value)} placeholder="如：7片/盒" style={inputStyle} /></FormField>
          <FormField label="最小制剂单位" required mark={fieldMark('unit')}><input value={form.unit} onChange={(event) => set('unit', event.target.value)} placeholder="如：片" style={inputStyle} /></FormField>
          <FormField label="生产企业" hint="选填" mark={fieldMark('manufacturer')}><input value={form.manufacturer} onChange={(event) => set('manufacturer', event.target.value)} placeholder="可填写实际生产企业" style={inputStyle} /></FormField>
        </div>
        <p style={holderNoteStyle}>药品上市许可持有人默认为当前登录药厂（{pharmaName}），保存时自动写入，无需填写。</p>
      </section>
      <section style={{ marginTop: 22 }}><button type="button" onClick={() => setExpanded((value) => !value)} style={{ ...iconTextButtonStyle, gap: 5, color: 'var(--color-text-2)', fontSize: 'var(--fs-12)', fontWeight: 600 }}><ChevronRight size={15} style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 150ms ease' }} />补充信息（可折叠）</button>{expanded && <div style={{ ...formGridStyle, marginTop: 14 }}><FormField label="适用科室"><input value={form.applicableDept} onChange={(event) => set('applicableDept', event.target.value)} placeholder="如：心内科" style={inputStyle} /></FormField><FormField label="有效期 / 停用说明"><input type="date" value={form.validUntil} onChange={(event) => set('validUntil', event.target.value)} style={inputStyle} /></FormField></div>}</section>
      <p style={{ margin: '22px 0 0', padding: '9px 10px', borderRadius: 6, color: 'var(--color-text-2)', background: '#F8FAFC', fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>保存后将建立实际品种档案，合同线索不会自动写入品种资料或价目。</p>
    </div>
    <div style={drawerFooterStyle}><Button variant="outline" onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>{editing ? '保存修改' : '保存并继续配置价目'}</Button></div>
    <ConfirmDialog open={confirmAllOpen} variant="warning" title="全部采用查询值" description={`确认后将把 ${reviewRows.length} 个差异字段（${reviewRows.map((row) => row.label).join('、')}）全部更新为药监局查询值。`} confirmLabel="确认采用" onConfirm={adoptAllRows} onCancel={() => setConfirmAllOpen(false)} />
  </aside></div>;
}

function NmpaRecordCard({ record, selectable, selected, onSelect, footer }: { record: NmpaDrugRecord; selectable?: boolean; selected?: boolean; onSelect?: () => void; footer?: React.ReactNode }) {
  return <div role={selectable ? 'radio' : undefined} aria-checked={selectable ? Boolean(selected) : undefined} aria-label={selectable ? `${record.tradeName} ${record.spec} ${record.package}` : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? onSelect : undefined} onKeyDown={selectable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(); } } : undefined} style={{ ...nmpaCardStyle, borderColor: selected ? 'var(--color-brand)' : '#E4E7EC', cursor: selectable ? 'pointer' : 'default' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {selectable && <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selected ? 'var(--color-brand)' : '#CBD5E1'}`, background: selected ? 'var(--color-brand)' : 'transparent', boxShadow: 'inset 0 0 0 3px #fff', flex: '0 0 auto', marginTop: 2 }} />}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        <NmpaField label="商品名" value={record.tradeName} strong />
        <NmpaField label="通用名" value={record.genericName} />
        <NmpaField label="批准文号" value={record.approvalNo} mono />
        <NmpaField label="剂型" value={record.dosageForm} />
        <NmpaField label="规格" value={record.spec} />
        <NmpaField label="包装" value={record.package} />
        <NmpaField label="上市许可持有人 / 生产企业" value={`${record.holder} · ${record.manufacturer}`} full />
      </div>
    </div>
    {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>{footer}</div>}
  </div>;
}
function NmpaField({ label, value, strong, mono, full }: { label: string; value: string; strong?: boolean; mono?: boolean; full?: boolean }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}>
    <div style={{ color: 'var(--color-text-3)', fontSize: 'var(--fs-11)' }}>{label}</div>
    <div style={{ marginTop: 1, color: 'var(--color-text-1)', fontSize: 'var(--fs-12)', fontWeight: strong ? 650 : 450, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value || '—'}</div>
  </div>;
}

function VarietyDetail({ variety, tab, onBack, onTabChange, onEdit, onGoToPriceConfig, onDismissPriceGuide, showPriceGuide, attachments, onAddAttachment, onDeleteAttachment, canWrite }: { variety: Variety; tab: 'basic' | 'attachments'; onBack: () => void; onTabChange: (tab: 'basic' | 'attachments') => void; onEdit: () => void; onGoToPriceConfig: () => void; onDismissPriceGuide: () => void; showPriceGuide: boolean; attachments: VarietyAttachment[]; onAddAttachment: (file: File) => void; onDeleteAttachment: (id: string) => void; canWrite: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><header style={{ padding: '18px 24px 0', background: '#fff', borderBottom: '1px solid var(--color-border)' }}><button type="button" onClick={onBack} style={{ ...actionLinkStyle, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-2)', marginBottom: 10 }}><ArrowLeft size={14} />返回品种管理</button><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}><div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 650 }}>{varietyDisplayName(variety)}</h1><StatusPill tone={variety.activePriceBookId ? 'success' : 'warning'}>{variety.activePriceBookId ? '价目已配置' : '价目未配置'}</StatusPill></div><div style={{ marginTop: 6, color: 'var(--color-text-2)', fontSize: 'var(--fs-12)' }}>批准文号：<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-1)' }}>{variety.approvalNo || '—'}</span><span style={{ marginLeft: 16 }}>上市许可持有人：{variety.holder || '—'}</span><span style={{ marginLeft: 16 }}>剂型：{variety.dosageForm || '—'}</span></div></div>{canWrite && <Button variant="outline" icon={<PencilLine size={14} />} onClick={onEdit}>编辑品种</Button>}</div><div style={{ display: 'flex', gap: 0, marginTop: 16 }}><DetailTab active={tab === 'basic'} onClick={() => onTabChange('basic')}>基础信息</DetailTab><DetailTab active={tab === 'attachments'} onClick={() => onTabChange('attachments')}>资料附件</DetailTab></div></header><main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{tab === 'basic' ? <BasicDetail variety={variety} onGoToPriceConfig={onGoToPriceConfig} onDismissPriceGuide={onDismissPriceGuide} showPriceGuide={showPriceGuide} /> : <AttachmentDetail attachments={attachments} onAddAttachment={onAddAttachment} onDeleteAttachment={onDeleteAttachment} fileInputRef={fileInputRef} canWrite={canWrite} />}</main></div>;
}

function BasicDetail({ variety, onGoToPriceConfig, onDismissPriceGuide, showPriceGuide }: { variety: Variety; onGoToPriceConfig: () => void; onDismissPriceGuide: () => void; showPriceGuide: boolean }) {
  return <>{showPriceGuide && <section style={successGuideStyle}><div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--color-success-fg)', background: '#DDF3E5', flex: '0 0 auto' }}><CheckCircle2 size={19} /></div><div style={{ flex: 1 }}><div style={{ color: '#176B46', fontSize: 'var(--fs-14)', fontWeight: 650 }}>品种已创建，尚未配置价目</div><p style={{ margin: '4px 0 10px', color: '#277351', fontSize: 'var(--fs-12)', lineHeight: 1.65 }}>可前往价目表配置，为该品种补充服务价目。合同提取结果仅作为配置线索，不会自动生效。</p><div style={{ display: 'flex', gap: 8 }}><Button variant="primary" size="sm" onClick={onGoToPriceConfig}>去配置价目</Button><Button variant="ghost" size="sm" onClick={onDismissPriceGuide} style={{ color: '#277351' }}>稍后处理</Button></div></div></section>}<section style={detailCardStyle}><h2 style={detailSectionTitleStyle}>基础识别信息</h2><DetailGrid values={[[ '通用名', variety.genericName ], [ '商品名', variety.tradeName ], [ '批准文号', variety.approvalNo ], [ '剂型', variety.dosageForm ], [ '规格', variety.spec ], [ '包装', variety.package ], [ '最小制剂单位', variety.unit ], [ '药品上市许可持有人', variety.holder ], [ '生产企业', variety.manufacturer ]]} /><div style={detailDividerStyle} /><h2 style={detailSectionTitleStyle}>补充信息</h2><DetailGrid values={[[ '适用科室', variety.applicableDept ], [ '有效期 / 停用说明', variety.validUntil ]]} /><div style={{ marginTop: 22, color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' }}>最近更新：2026-09-23 14:22 · 当前用户</div></section></>;
}

function AttachmentDetail({ attachments, onAddAttachment, onDeleteAttachment, fileInputRef, canWrite }: { attachments: VarietyAttachment[]; onAddAttachment: (file: File) => void; onDeleteAttachment: (id: string) => void; fileInputRef: React.RefObject<HTMLInputElement | null>; canWrite: boolean }) {
  function selectFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) onAddAttachment(file); event.target.value = ''; }
  return <section style={detailCardStyle}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 16, borderBottom: '1px solid #F1F3F5' }}><div><h2 style={{ ...detailSectionTitleStyle, marginBottom: 4 }}>资料附件</h2><p style={{ margin: 0, color: 'var(--color-text-2)', fontSize: 'var(--fs-12)' }}>上传与该品种相关的说明书、批准证明文件或其他资料，仅对当前品种生效。</p></div>{canWrite && <><input ref={fileInputRef} onChange={selectFile} type="file" style={{ display: 'none' }} /><Button variant="primary" size="sm" icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>上传资料</Button></>}</div>{attachments.length === 0 ? <EmptyState title="暂未上传品种资料" description="说明书、批准证明文件等资料会保存在当前品种档案内。" action={canWrite ? { label: '上传资料', onClick: () => fileInputRef.current?.click() } : undefined} /> : <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}><thead><tr>{['文件名称', '资料类型', '文件大小', '上传人', '上传时间', '操作'].map((label) => <th key={label} style={thStyle}>{label}</th>)}</tr></thead><tbody>{attachments.map((attachment) => <tr key={attachment.id} style={{ borderTop: '1px solid #F1F3F5' }}><td style={tdStyle}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 550 }}><FileText size={16} color="var(--color-brand)" />{attachment.name}</span></td><td style={tdStyle}>{attachment.type}</td><td style={tdStyle}>{attachment.size}</td><td style={tdStyle}>{attachment.uploader}</td><td style={tdStyle}>{attachment.uploadedAt}</td><td style={tdStyle}><div style={{ display: 'flex', gap: 6 }}><button type="button" title="预览" style={attachmentIconButtonStyle}><Eye size={15} /></button><button type="button" title="下载" style={attachmentIconButtonStyle}><Download size={15} /></button>{canWrite && <button type="button" title="删除" onClick={() => onDeleteAttachment(attachment.id)} style={{ ...attachmentIconButtonStyle, color: 'var(--color-danger-fg)' }}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table>}</section>;
}

function DetailGrid({ values }: { values: Array<[string, string]> }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px 32px' }}>{values.map(([label, value]) => <div key={label}><div style={{ color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' }}>{label}</div><div style={{ marginTop: 3, color: 'var(--color-text-1)', fontSize: 'var(--fs-13)', fontWeight: 550 }}>{value || '—'}</div></div>)}</div>; }
function DetailTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ padding: '10px 16px', border: 'none', borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent', background: 'transparent', color: active ? 'var(--color-brand)' : 'var(--color-text-2)', fontFamily: 'inherit', fontSize: 'var(--fs-13)', fontWeight: active ? 650 : 450, cursor: 'pointer' }}>{children}</button>; }
function FormField({ label, required, hint, full, mark, children }: { label: string; required?: boolean; hint?: string; full?: boolean; mark?: 'brought' | 'missing'; children: React.ReactNode }) { return <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}><div style={{ marginBottom: 6, color: 'var(--color-text-1)', fontSize: 'var(--fs-12)', fontWeight: 550 }}>{label}{required && <span style={{ marginLeft: 2, color: 'var(--color-danger-fg)' }}>*</span>}{hint && <span style={{ marginLeft: 4, color: 'var(--color-text-3)', fontWeight: 400 }}>（{hint}）</span>}{mark === 'brought' && <span style={markBroughtStyle}>药监局带入</span>}{mark === 'missing' && <span style={markMissingStyle}>需补充</span>}</div>{children}</label>; }
function SectionHeading({ children }: { children: React.ReactNode }) { return <h3 style={{ margin: '0 0 14px', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{children}</h3>; }
function StatusPill({ tone, children }: { tone: 'success' | 'warning' | 'neutral'; children: React.ReactNode }) { const colors = { success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-fg)' }, warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-fg)' }, neutral: { bg: 'var(--color-neutral-bg)', fg: 'var(--color-neutral-fg)' } }[tone]; return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 4, background: colors.bg, color: colors.fg, fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' }}>{children}</span>; }

const toolbarStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 };
const filterStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' };
const searchBoxStyle: CSSProperties = { height: 34, display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', background: '#fff', border: '1px solid var(--color-border-strong)', borderRadius: 6 };
const resetButtonStyle: CSSProperties = { height: 32, padding: '0 8px', border: 'none', background: 'transparent', color: 'var(--color-text-2)', fontFamily: 'inherit', fontSize: 'var(--fs-13)', cursor: 'pointer' };
const tableCardStyle: CSSProperties = { background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' };
const thStyle: CSSProperties = { padding: '10px 12px', background: 'var(--color-table-stripe)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-2)', fontSize: 'var(--fs-12)', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: CSSProperties = { padding: '12px', color: 'var(--color-text-1)', fontSize: 'var(--fs-13)', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const paginationStyle: CSSProperties = { padding: '10px 12px', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)', borderTop: '1px solid #F1F3F5' };
const actionLinkStyle: CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: 'var(--color-brand)', fontFamily: 'inherit', fontSize: 'var(--fs-12)', fontWeight: 550, cursor: 'pointer' };
const candidateTextButtonStyle: CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: '#A36300', fontFamily: 'inherit', fontSize: 'var(--fs-12)', cursor: 'pointer' };
const iconTextButtonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 3, border: 'none', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' };
const drawerOverlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(17,24,39,0.3)' };
const drawerStyle: CSSProperties = { width: 560, maxWidth: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', boxShadow: 'var(--shadow-xl)' };
const drawerHeaderStyle: CSSProperties = { height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--color-border)', flex: '0 0 auto' };
const sourceHintStyle: CSSProperties = { display: 'flex', gap: 8, margin: '16px 20px 0', padding: '10px 12px', border: '1px solid #BFD8FE', borderRadius: 7, background: 'var(--color-info-bg)', color: '#245AA5', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' };
const drawerFooterStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--color-border)', flex: '0 0 auto' };

/** 药监局联查区 */
const nmpaSectionStyle: CSSProperties = { marginBottom: 20, padding: 14, border: '1px solid #E4E7EC', borderRadius: 8, background: '#F8FAFC' };
const nmpaBarStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const nmpaBarTextStyle: CSSProperties = { color: 'var(--color-text-2)', fontSize: 'var(--fs-12)' };
const nmpaHintStyle: CSSProperties = { margin: '10px 0 0', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const nmpaLoadingStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--color-text-2)', fontSize: 'var(--fs-12)' };
const nmpaEmptyStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, padding: '10px 12px', borderRadius: 6, background: '#EEF1F5', color: 'var(--color-text-2)', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const nmpaTitleStyle: CSSProperties = { margin: '12px 0 0', fontSize: 'var(--fs-13)', fontWeight: 650, color: 'var(--color-text-1)' };
const nmpaCardStyle: CSSProperties = { marginTop: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid #E4E7EC', background: '#fff' };
const nmpaMultiFooterStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 };
const nmpaAppliedStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 10px', borderRadius: 6, background: '#F0FAF3', border: '1px solid #B9E4C9', color: '#176B46', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const nmpaMismatchStyle: CSSProperties = { display: 'flex', gap: 10, marginTop: 10, padding: 12, borderRadius: 7, background: '#FFF9E9', border: '1px solid #F2C66D' };
const reviewPanelStyle: CSSProperties = { marginTop: 10, padding: 12, borderRadius: 7, background: '#fff', border: '1px solid #BFD8FE' };
const reviewThStyle: CSSProperties = { padding: '6px 8px', background: '#F8FAFC', borderBottom: '1px solid #E4E7EC', textAlign: 'left', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)', fontWeight: 600, whiteSpace: 'nowrap' };
const reviewTdStyle: CSSProperties = { padding: '7px 8px', borderBottom: '1px solid #F1F3F5', color: 'var(--color-text-1)', fontSize: 'var(--fs-12)', verticalAlign: 'middle' };
const pendingNoticeStyle: CSSProperties = { marginBottom: 14, padding: '8px 10px', borderRadius: 6, background: 'var(--color-info-bg)', border: '1px solid #BFD8FE', color: '#245AA5', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const missingNoticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 10px', borderRadius: 6, background: '#FEF0C7', border: '1px solid #F8DEA4', color: '#7A4900', fontSize: 'var(--fs-12)', lineHeight: 1.6 };
const sectionHeadRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 };
const sectionHeadTextStyle: CSSProperties = { margin: 0, color: 'var(--color-text-3)', fontSize: 'var(--fs-12)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 400 };
const holderNoteStyle: CSSProperties = { margin: '10px 0 0', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' };
const markBroughtStyle: CSSProperties = { marginLeft: 6, color: 'var(--color-success-fg)', fontWeight: 400, fontSize: 'var(--fs-11)' };
const markMissingStyle: CSSProperties = { marginLeft: 6, color: 'var(--color-text-3)', fontWeight: 400, fontSize: 'var(--fs-11)' };
const successGuideStyle: CSSProperties = { display: 'flex', gap: 12, marginBottom: 18, padding: 16, border: '1px solid #B9E4C9', borderRadius: 8, background: '#F0FAF3' };
const detailCardStyle: CSSProperties = { background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 };
const detailSectionTitleStyle: CSSProperties = { margin: '0 0 16px', color: 'var(--color-text-1)', fontSize: 'var(--fs-14)', fontWeight: 650 };
const detailDividerStyle: CSSProperties = { height: 1, margin: '22px 0', background: '#F1F3F5' };
const attachmentIconButtonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 27, height: 27, padding: 0, border: '1px solid var(--color-border)', borderRadius: 5, color: 'var(--color-text-2)', background: '#fff', cursor: 'pointer' };
