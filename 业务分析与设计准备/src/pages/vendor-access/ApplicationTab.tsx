import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Ban,
  ChevronLeft,
  FileText,
  Inbox,
  KeyRound,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { StatusTag } from '../../components/StatusTag';
import type { ToastMessage } from '../../components/Toast';
import type { AccessItemVerdict, AccessTemplateItem, VendorAccessRecord } from '../../types';
import {
  useVendorAccess,
  validateApplication,
  type AccessValidation,
  type VendorMaterialInput,
} from '../../context/VendorAccessContext';
import {
  AuditPointsBox as SharedAuditPoints,
  CountHint,
  FileChip,
  GroupHeader,
  HistoryTimeline,
  ItemMetaRow,
  mono,
  RefMaterialTag,
  SnapshotItemsView,
  VerdictBadge,
} from './shared';

/**
 * 服务商侧 · 准入任务（2026-09-21 反撮合整改）
 * 药厂是准入流程的唯一发起方：任务由药厂创建并发送给本服务商主体，
 * 本页只呈现「发给自己的任务」——不提供药厂搜索、药厂浏览或自主发起入口；
 * 服务商可在「待服务商提交」提交材料、在「已驳回」（按项退回）修改驳回项后重新提交。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const RESUME_KEY = 'va-resume-record';

/** 服务商可提交材料的窗口态：待服务商提交=首次提交；已驳回=按项退回后修改驳回项重新提交（通过项锁定） */
const EDITABLE_STATUSES = ['待服务商提交', '已驳回'];

export function MyTasksTab({ addToast }: Props) {
  const { myTasks, claimTask } = useVendorAccess();
  const [activeId, setActiveId] = useState<string | null>(null);
  /** 输入准入码发起准入 */
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimError, setClaimError] = useState('');

  function handleClaim() {
    const res = claimTask(claimCode);
    if (res.ok) {
      const claimed = myTasks.find((r) => r.id === res.taskId) ?? null;
      setClaimOpen(false);
      setClaimCode('');
      setClaimError('');
      addToast({
        type: 'success',
        title: '已发起准入',
        description: `任务已绑定本服务商主体（${claimed ? claimed.pharmaName : '药厂'}），请在列表中提交材料。`,
      });
    } else {
      setClaimError(res.error ?? '发起失败');
    }
  }

  // 从「提交记录」页带来的续办意图：直接进入对应任务的工作台
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resumedOnce.current) return;
    resumedOnce.current = true;
    const rid = sessionStorage.getItem(RESUME_KEY);
    if (!rid) return;
    sessionStorage.removeItem(RESUME_KEY);
    const task = myTasks.find((r) => r.id === rid);
    if (task) {
      setActiveId(task.id);
      addToast({ type: 'info', title: '已定位目标任务', description: `「${task.pharmaName}」的准入任务（${task.status}）。` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTasks]);

  const active = activeId ? myTasks.find((r) => r.id === activeId) : undefined;

  /** 列表展示口径：已撤回/已失效/已撤销 的历史记录不显示（撤回任务从「提交记录」口径中隐去） */
  const shownTasks = useMemo(
    () => myTasks.filter((r) => !['已撤回', '已失效', '已撤销'].includes(r.status)),
    [myTasks],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="准入任务"
        description="输入药厂提供的准入码，发起准入。您可仅在任务授权范围内提交材料。"
        dataRange="本服务商主体"
        actions={
          <Button variant="primary" size="sm" icon={<KeyRound size={14} />} onClick={() => setClaimOpen(true)}>
            输入准入码
          </Button>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {active ? (
          <TaskWorkspace task={active} addToast={addToast} onBack={() => setActiveId(null)} />
        ) : shownTasks.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="暂无准入任务"
            description="暂无待处理的药厂准入任务，请联系合作药厂获取准入码。"
          />
        ) : (
          <>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      {['药厂名称', '材料模板', '状态', '发起时间', '操作'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownTasks.map((r, idx) => {
                      const editable = EDITABLE_STATUSES.includes(r.status);
                      return (
                        <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '11px 14px', fontSize: 'var(--fs-13)', fontWeight: 600, borderBottom: '1px solid #F3F4F6' }}>
                            {r.pharmaName}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 'var(--fs-13)', borderBottom: '1px solid #F3F4F6' }}>
                            {r.requirementSnapshot.templateName}
                            <span style={{ color: 'var(--color-brand)', fontWeight: 600, marginLeft: 6 }}>{r.templateVersion}</span>
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #F3F4F6' }}>
                            <StatusTag status={r.status} />
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 'var(--fs-12)', fontFamily: mono, borderBottom: '1px solid #F3F4F6' }}>{r.claimedAt || '—'}</td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }}>
                            {editable && (
                              <Button variant="primary" size="sm" onClick={() => setActiveId(r.id)}>
                                {r.status === '已驳回' ? '修改后重新提交' : '提交材料'}
                              </Button>
                            )}
                            {!editable && (
                              <Button variant="ghost" size="sm" onClick={() => setActiveId(r.id)}>查看详情</Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 输入准入码发起准入（一次性；发起即绑定本服务商主体） */}
      <Modal
        open={claimOpen}
        title="输入准入码"
        onClose={() => setClaimOpen(false)}
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>取消</Button>
            <Button variant="primary" icon={<KeyRound size={13} />} disabled={claimCode.trim().length !== 8} onClick={handleClaim}>发起准入</Button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <input
            value={claimCode}
            onChange={(e) => { setClaimCode(e.target.value.toUpperCase().slice(0, 8)); if (claimError) setClaimError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && claimCode.trim().length === 8) handleClaim(); }}
            placeholder="8 位准入码"
            aria-label="8 位准入码"
            style={{ width: '100%', textAlign: 'center', fontFamily: mono, fontSize: 22, fontWeight: 700, letterSpacing: '0.25em', padding: '12px 10px', border: '1.5px solid var(--color-border-strong)', borderRadius: 8, outline: 'none', textTransform: 'uppercase' }}
          />
          <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
            请输入药厂线下提供给贵司的一次性准入码；发起后任务将绑定本服务商主体。
            <br />演示环境固定准入码：<span style={{ fontFamily: mono, fontWeight: 700, color: 'var(--color-text-2)' }}>12345678</span>
          </div>
          {claimError && <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{claimError}</div>}
        </div>
      </Modal>
    </div>
  );
}


// ─── 任务工作台（详情 + 状态内编辑）────────────────────────────────────────────

interface FormState {
  vendorName: string;
  creditCode: string;
  legalRep: string;
  address: string;
  contactName: string;
  contactMobile: string;
  itemResponses: Record<string, string>;
  attachments: Record<string, string[]>;
}

function formOfTask(task: VendorAccessRecord, prefill?: VendorAccessRecord): FormState {
  const src = task.status === '待服务商提交' && !task.submittedAt && prefill ? prefill : task;
  // 驳回重提：被驳回项的旧材料/旧填写清空，强制按驳回原因重新上传；通过项材料保留（锁定展示）
  const rejectedKeys = new Set(
    Object.entries(task.itemVerdicts ?? {}).filter(([, v]) => v.verdict === 'reject').map(([k]) => k),
  );
  return {
    vendorName: src.vendorName || '',
    creditCode: src.creditCode || '',
    legalRep: src.legalRep || '',
    address: src.address || '',
    contactName: src.contactName || '',
    contactMobile: src.contactMobile || '',
    itemResponses: Object.fromEntries(
      Object.entries(task.itemResponses).map(([k, v]) => [k, rejectedKeys.has(k) ? '' : v]),
    ),
    attachments: Object.fromEntries(
      Object.entries(task.attachments).map(([k, v]) => [k, rejectedKeys.has(k) ? [] : [...v]]),
    ),
  };
}

function TaskWorkspace({
  task,
  addToast,
  onBack,
}: {
  task: VendorAccessRecord;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  onBack: () => void;
}) {
  const { myTasks, submitTaskMaterial } = useVendorAccess();
  const editable = EDITABLE_STATUSES.includes(task.status);
  /** 驳回重提场景：通过项锁定只读、驳回项按原因修改 */
  const isResubmit = task.status === '已驳回';
  const verdicts = task.itemVerdicts ?? {};

  const [form, setForm] = useState<FormState>(() =>
    formOfTask(task, [...myTasks].find((r) => r.submittedAt)),
  );
  const [errors, setErrors] = useState<AccessValidation | null>(null);
  const [uploadFor, setUploadFor] = useState<AccessTemplateItem | null>(null);
  /** 上传弹窗中已勾选的文件名（原型仅记录文件名，不做真实解析） */
  const [pickedNames, setPickedNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const errorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const snapshot = task.requirementSnapshot;
  const items = snapshot.items.filter((i) => i.kind !== 'checklist');
  const groups = useMemo(() => [...new Set(items.map((i) => i.group))], [items]);

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit() {
    const validation = validateApplication(items, form);
    if (validation.all > 0) {
      setErrors(validation);
      const first = [...validation.missingFiles, ...validation.insufficient, ...validation.missingForms][0];
      if (first) errorRefs.current[first.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors(null);
    const res = submitTaskMaterial(task.id, form);
    if (res.ok) {
      addToast({
        type: 'success',
        title: isResubmit ? '已重新提交' : '已提交材料',
        description: isResubmit
          ? `修改后的材料已重新提交给${task.pharmaName}，等待药厂复审（通过项材料保留）。`
          : `已提交给${task.pharmaName}（按「${snapshot.templateName} ${task.templateVersion}」快照），等待药厂审核。`,
      });
      onBack();
    } else {
      addToast({ type: 'error', title: res.error ?? '提交失败' });
    }
  }

  function openUpload(item: AccessTemplateItem) {
    setUploadFor(item);
    setPickedNames([]);
    setUploadError('');
  }

  function addPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => f.name).filter((n) => n.trim());
    setPickedNames((prev) => [...prev, ...names]);
    if (uploadError) setUploadError('');
  }

  function confirmUpload() {
    if (!uploadFor) return;
    if (pickedNames.length === 0) { setUploadError('请先选择文件'); return; }
    if (uploadFor.kind === 'file') {
      // 文件类：仅保留一份（批量勾选时取第一份），重新选择即替换
      setForm((f) => ({ ...f, attachments: { ...f.attachments, [uploadFor.key]: [pickedNames[0]] } }));
    } else {
      // 图片类：一张或多张，分次上传累计
      setForm((f) => ({ ...f, attachments: { ...f.attachments, [uploadFor.key]: [...(f.attachments[uploadFor.key] ?? []), ...pickedNames] } }));
    }
    setUploadFor(null);
  }

  function removeFile(itemKey: string, idx: number) {
    setForm((f) => ({ ...f, attachments: { ...f.attachments, [itemKey]: (f.attachments[itemKey] ?? []).filter((_, i) => i !== idx) } }));
  }

  function groupProgress(group: string) {
    const gi = items.filter((i) => i.group === group);
    const requiredItems = gi.filter((i) => i.required);
    const done = requiredItems.filter((i) => {
      if (i.kind.startsWith('form-')) return String(form.itemResponses[i.key] ?? '').trim() !== '';
      const need = Math.max(1, i.minCount ?? 1);
      return (form.attachments[i.key] ?? []).filter((x) => x.trim()).length >= need;
    });
    const insufficient = gi.some((i) => {
      if (!i.kind.startsWith('form-') && i.minCount) {
        const n = (form.attachments[i.key] ?? []).filter((x) => x.trim()).length;
        return n > 0 && n < i.minCount;
      }
      return false;
    });
    const hasError = errors ? [...errors.missingFiles, ...errors.insufficient, ...errors.missingForms].some((i) => i.group === group) : false;
    return { total: requiredItems.length, done: done.length, insufficient, hasError, satisfied: requiredItems.length > 0 && done.length === requiredItems.length };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 返回 + 任务信息卡（药厂名称为只读信息，不可搜索/切换/跳转） */}
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #F3F4F6' }}>
          <Button variant="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={onBack}>返回任务列表</Button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--fs-16)', flexShrink: 0 }}>
            {task.pharmaName.slice(0, 1)}
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-15)', fontWeight: 700 }}>{task.pharmaName}</span>
              <StatusTag status={task.status} />
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
              <span>材料模板：{snapshot.templateName} · <strong style={{ color: 'var(--color-brand)' }}>{task.templateVersion}</strong></span>
              <span>发起时间：<span style={{ fontFamily: mono }}>{task.claimedAt || '—'}</span></span>
              {task.submittedAt && <span>最近提交：<span style={{ fontFamily: mono }}>{task.submittedAt}</span></span>}
              {task.status === '已准入' && (
                <span style={{ color: '#248A5A', fontWeight: 600 }}>有效期：{task.effectiveFrom} ~ {task.effectiveTo}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', maxWidth: 300 }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
            该任务由药厂发起，您仅可在任务授权范围内提交材料。
          </div>
        </div>
      </div>

      {/* 已驳回：按项退回（新口径）显示驳回统计；存量旧数据回退整单原因 */}
      {task.status === '已驳回' && (task.itemVerdicts ? (() => {
        const vs = Object.values(task.itemVerdicts!);
        const rj = vs.filter((v) => v.verdict === 'reject').length;
        return (
          <div style={{ padding: '14px 16px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
            <div style={{ fontSize: 'var(--fs-13)', color: '#C73A3A', lineHeight: 1.7 }}>
              <strong>审核退回修改：</strong>{rj} 项材料被驳回（见各项红字原因），请修改后在原任务上重新提交；其余 {vs.length - rj} 项已通过、锁定不可修改。
            </div>
          </div>
        );
      })() : (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>
            药厂驳回，原因：<strong>{task.rejectionReason ?? '—'}</strong>
          </div>
        </div>
      ))}
      {/* 其余终态原因横幅（已撤回、已失效、已撤销必须显示原因，并禁用材料提交） */}
      {CLOSED_REASON_OF[task.status] && (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>
            {CLOSED_LABEL_OF[task.status]}，原因：<strong>{closedReasonText(task)}</strong>
          </div>
        </div>
      )}
      {task.status === '审核中' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: '#EBF2FE', border: '1px solid #C9DDF7', fontSize: 'var(--fs-13)', color: '#2F6BCE' }}>
          <FileText size={14} />
          材料已提交，等待{task.pharmaName}审核。
        </div>
      )}
      {task.status === '已准入' && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#E6F5ED', border: '1px solid #C8E9D6', fontSize: 'var(--fs-13)', color: '#248A5A' }}>
          已于 {task.approvedAt} 由 {task.reviewedBy} 审核通过，有效期 {task.effectiveFrom} ~ {task.effectiveTo}。
        </div>
      )}

      {/* 编辑态：企业基础资料 + 材料清单（按任务快照，不随药厂模板调整变化） */}
      {editable && (
        <>
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F3F4F6' }}>
              <StepDot n={1} />
              <div>
                <div style={{ fontSize: 'var(--fs-14)', fontWeight: 700 }}>企业基础资料</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)', marginTop: 1 }}>提交后展示给药厂审核方</div>
              </div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px' }}>
              {([
                { key: 'vendorName', label: '公司名称', mono: false },
                { key: 'creditCode', label: '统一社会信用代码', mono: true },
                { key: 'legalRep', label: '法定代表人', mono: false },
                { key: 'address', label: '注册地址', mono: false },
                { key: 'contactName', label: '联系人姓名', mono: false },
                { key: 'contactMobile', label: '联系电话', mono: true },
              ] as const).map((f) => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)', gridColumn: f.key === 'address' ? '1 / -1' : undefined }}>
                  {f.label} <span style={{ color: '#C73A3A' }}>*</span>
                  <input
                    value={form[f.key]}
                    onChange={(e) => setFormValue(f.key, e.target.value)}
                    placeholder={f.key === 'creditCode' ? '18 位统一社会信用代码' : f.key === 'contactMobile' ? '11 位手机号' : `请输入${f.label}`}
                    style={{ ...appInputStyle, minWidth: 0, width: '100%', fontWeight: 400, fontFamily: f.mono ? mono : undefined }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
              <StepDot n={2} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--fs-14)', fontWeight: 700 }}>
                  {task.pharmaName} · {snapshot.templateName} {task.templateVersion} 准入材料清单
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)', marginTop: 1 }}>
                  共 {items.length} 项 · 必传 {items.filter((i) => i.required).length} 项
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {groups.map((g) => (
                  <span key={g} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontWeight: 600 }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 校验错误汇总条 */}
              {errors && errors.all > 0 && (
            <div className="va-fade-in" style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
              <Ban size={15} style={{ color: '#C73A3A', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 'var(--fs-13)', color: '#C73A3A' }}>
                <strong>还有 {errors.all} 处未完成，请补充后提交：</strong>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 3, fontSize: 'var(--fs-12)' }}>
                  {errors.missingFiles.length > 0 && <span>· 必传材料缺失 {errors.missingFiles.length} 项</span>}
                  {errors.insufficient.length > 0 && <span>· 图片数量不足 {errors.insufficient.length} 项</span>}
                  {errors.missingForms.length > 0 && <span>· 必填项未填 {errors.missingForms.length} 项</span>}
                </div>
              </div>
            </div>
          )}

          {/* 分组清单 */}
          {groups.map((group) => {
            const gi = items.filter((i) => i.group === group);
            const progress = groupProgress(group);
            return (
              <div key={group}>
                <GroupHeader
                  name={group}
                  count={gi.length}
                  right={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {progress.insufficient ? (
                        <span style={{ fontSize: 'var(--fs-11)', fontWeight: 600, color: '#C73A3A', background: '#FEECEC', padding: '2px 8px', borderRadius: 999 }}>存在份数不足</span>
                      ) : progress.satisfied ? (
                        <span style={{ fontSize: 'var(--fs-11)', fontWeight: 600, color: '#248A5A', background: '#E6F5ED', padding: '2px 8px', borderRadius: 999 }}>✓ 已满足本组要求</span>
                      ) : (
                        <span style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)' }}>必填 {progress.total} · 已完成 {progress.done}</span>
                      )}
                    </span>
                  }
                />
                <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  {gi.map((item, idx) => (
                    <MaterialItemRow
                      key={item.key}
                      item={item}
                      form={form}
                      hasError={errors ? [...errors.missingFiles, ...errors.insufficient, ...errors.missingForms].some((i) => i.key === item.key) : false}
                      isLast={idx === gi.length - 1}
                      rowRef={(el) => (errorRefs.current[item.key] = el)}
                      onOpenUpload={() => openUpload(item)}
                      onRemoveFile={(i) => removeFile(item.key, i)}
                      onResponse={(v) => setFormValue('itemResponses', { ...form.itemResponses, [item.key]: v })}
                      onToast={addToast}
                      resubmitVerdict={isResubmit ? verdicts[item.key] : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* 底部吸底操作条 */}
          <div style={{ position: 'sticky', bottom: -16, margin: '0 -16px -16px', padding: '12px 16px', background: 'rgba(255,255,255,0.96)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 8, zIndex: 10, backdropFilter: 'none' }}>
            <Button variant="outline" onClick={onBack}>暂不提交，返回列表</Button>
            <Button variant="primary" onClick={handleSubmit}>{isResubmit ? '修改完成，重新提交 →' : '提交材料 →'}</Button>
          </div>
        </>
      )}

      {/* 只读态：已提交材料快照 + 处理历史（审核中/已准入/终态） */}
      {!editable && (
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
              已提交材料（{snapshot.templateName} {task.templateVersion} 快照）
            </div>
            {task.submittedAt ? (
              <SnapshotItemsView
                snapshot={snapshot}
                attachments={task.attachments}
                responses={task.itemResponses}
                filterChecklist
                licenseData={task}
                onToast={addToast}
              />
            ) : (
              <EmptyState icon={FileText} title="尚未提交材料" description="药厂撤回任务前您未提交材料，材料区不开放。" />
            )}
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>处理历史</div>
            <HistoryTimeline history={task.history} />
          </div>
        </div>
      )}

      {/* 上传弹窗（文件类=仅一份，可批量勾选；图片类=一至多张；原型仅记录文件名） */}
      <Modal
        open={!!uploadFor}
        title={uploadFor ? `${uploadFor.kind === 'image' ? '上传图片' : '上传文件'} · ${uploadFor.name}` : ''}
        onClose={() => setUploadFor(null)}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadFor(null)}>取消</Button>
            <Button variant="primary" icon={<Upload size={13} />} disabled={pickedNames.length === 0} onClick={confirmUpload}>确认上传</Button>
          </>
        }
      >
        {uploadFor && (
          <>
            <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 6, background: '#F9FAFB', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.7 }}>
              {uploadFor.kind === 'image'
                ? <>可一次选择多张图片，分次上传累计；{uploadFor.minCount ? <>药厂要求至少 <strong>{uploadFor.minCount}</strong> 张。</> : '数量不限。'}</>
                : <>支持批量选择文件，但本项仅保留 <strong>1 份</strong>；重新选择即替换。</>}
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { addPicked(e.target.files); e.target.value = ''; }}
            />
            <button
              onClick={() => uploadInputRef.current?.click()}
              style={{
                width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '20px 16px', borderRadius: 8, cursor: 'pointer',
                border: '1.5px dashed var(--color-border-strong)', background: '#FAFBFC', color: '#667085',
              }}
            >
              <Upload size={18} style={{ color: 'var(--color-brand)' }} />
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>
                {uploadFor.kind === 'image' ? '选择图片（可多选）' : '选择文件（可批量勾选）'}
              </span>
              <span style={{ fontSize: 'var(--fs-12)' }}>原型仅记录文件名，不做真实文件解析</span>
            </button>

            {pickedNames.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                {(uploadFor.kind === 'file' ? pickedNames.slice(0, 1) : pickedNames).map((n, i) => (
                  <FileChip key={`${n}-${i}`} name={n} onRemove={() => setPickedNames((p) => p.filter((_, idx) => idx !== (uploadFor.kind === 'file' ? 0 : i)))} />
                ))}
                {uploadFor.kind === 'file' && pickedNames.length > 1 && (
                  <div style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>已批量勾选 {pickedNames.length} 个文件，确认后仅保留第一份。</div>
                )}
              </div>
            )}

            {uploadError && <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{uploadError}</div>}
          </>
        )}
      </Modal>
    </div>
  );
}

/** 终态原因字段映射（已撤回/已失效/已撤销 必须显示原因；已驳回走按项结论横幅，存量旧数据在横幅内回退整单原因） */
const CLOSED_REASON_OF: Partial<Record<string, (r: VendorAccessRecord) => string>> = {
  已撤回: (r) => r.withdrawalReason ?? '',
  已失效: (r) => r.invalidationReason ?? '',
  已撤销: (r) => r.revocationReason ?? '',
};

const CLOSED_LABEL_OF: Record<string, string> = {
  已撤回: '药厂已撤回该任务',
  已失效: '准入已失效',
  已撤销: '药厂已撤销准入',
};

function closedReasonText(task: VendorAccessRecord): string {
  return CLOSED_REASON_OF[task.status]?.(task) || '—';
}

function StepDot({ n }: { n: number }) {
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-brand)', color: '#fff', fontSize: 'var(--fs-12)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {n}
    </div>
  );
}

// ─── 材料清单项行（按 kind 渲染）──────────────────────────────────────────────

function MaterialItemRow({
  item,
  form,
  hasError,
  isLast,
  rowRef,
  onOpenUpload,
  onRemoveFile,
  onResponse,
  onToast,
  resubmitVerdict,
}: {
  item: AccessTemplateItem;
  form: FormState;
  hasError: boolean;
  isLast: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onOpenUpload: () => void;
  onRemoveFile: (idx: number) => void;
  onResponse: (value: string) => void;
  onToast: (msg: { type: 'info'; title: string; description?: string }) => void;
  /** 驳回重提场景的项级结论：pass=锁定只读，reject=红条原因+正常编辑 */
  resubmitVerdict?: AccessItemVerdict;
}) {
  const files = form.attachments[item.key] ?? [];
  const response = String(form.itemResponses[item.key] ?? '');
  const isUpload = item.kind === 'file' || item.kind === 'image';
  const lockedPass = resubmitVerdict?.verdict === 'pass';
  const rejected = resubmitVerdict?.verdict === 'reject';
  const rowStyle = hasError
    ? { borderLeft: '3px solid #C73A3A', background: '#FFFBF5' }
    : { borderLeft: '3px solid transparent' };

  return (
    <div ref={rowRef} style={{ padding: '13px 16px', borderBottom: isLast ? 'none' : '1px solid #F3F4F6', ...rowStyle, ...(lockedPass ? { background: '#FAFDFB' } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ItemMetaRow item={item} />
      </div>

      {item.templateRef && (
            <div style={{ margin: '9px 0 0 38px' }}>
              <RefMaterialTag refMat={item.templateRef} onToast={onToast} />
            </div>
          )}

      {rejected && (
        <div style={{ margin: '9px 0 0 38px' }}>
          <VerdictBadge verdict="reject" reason={resubmitVerdict.reason} />
        </div>
      )}

      {lockedPass ? (
        /* 驳回重提：上轮已通过的项锁定只读，材料保留、不可修改 */
        <div style={{ margin: '10px 0 0 38px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <VerdictBadge verdict="pass" />
          {!isUpload && response.trim() !== '' && (
            <div style={{ fontSize: 'var(--fs-13)' }}>
              <span style={{ color: 'var(--color-text-3)' }}>填写值：</span>
              <strong>{response}</strong>
            </div>
          )}
          {isUpload && files.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {files.map((f, i) => <FileChip key={`${f}-${i}`} name={f} />)}
            </div>
          )}
          <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>该项已通过审核，无需修改。</span>
        </div>
      ) : (
        <>
          {isUpload && (
            <div style={{ margin: '10px 0 0 38px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              {item.kind === 'image' ? (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {files.map((f, i) => (
                      <div key={`${f}-${i}`} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--color-brand-subtle)', border: '1.5px solid color-mix(in srgb, var(--color-brand) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={18} style={{ color: 'var(--color-brand)' }} />
                        <button
                          onClick={() => onRemoveFile(i)}
                          title="移除"
                          style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', border: 'none', background: '#C73A3A', color: '#fff', fontSize: 10, lineHeight: 1, cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={onOpenUpload}
                      style={{ width: 64, height: 64, borderRadius: 8, border: '1.5px dashed color-mix(in srgb, var(--color-brand) 40%, transparent)', background: '#FAFBFC', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--color-brand)' }}
                    >
                      <Upload size={14} />
                      <span style={{ fontSize: 10 }}>添加照片</span>
                    </button>
                  </div>
                  {item.minCount ? <CountHint current={files.filter((f) => f.trim()).length} min={item.minCount} unit="张" /> : null}
                </>
              ) : (
                <>
                  {files.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {files.slice(0, 1).map((f, i) => (
                        <FileChip key={`${f}-${i}`} name={f} onRemove={() => onRemoveFile(i)} />
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={onOpenUpload}>
                    {files.length > 0 ? '重新上传（替换）' : '上传文件'}
                  </Button>
                </>
              )}
            </div>
          )}

          {item.kind.startsWith('form-') && (
            <div style={{ margin: '10px 0 0 38px' }}>
              {item.kind === 'form-text' && (
                <input value={response} onChange={(e) => onResponse(e.target.value)} placeholder="请输入" style={appInputStyle} />
              )}
              {item.kind === 'form-number' && (
                <input type="number" value={response} onChange={(e) => onResponse(e.target.value)} placeholder="0" style={{ ...appInputStyle, maxWidth: 140, fontFamily: mono }} />
              )}
              {item.kind === 'form-date' && (
                <input type="date" value={response} onChange={(e) => onResponse(e.target.value)} style={appInputStyle} />
              )}
              {item.kind === 'form-select' && (
                (item.options?.length ?? 0) <= 3 ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(item.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--fs-13)',
                          border: response === opt ? '1.5px solid var(--color-brand)' : '1px solid var(--color-border)',
                          background: response === opt ? 'var(--color-brand-subtle)' : '#fff',
                          fontWeight: response === opt ? 600 : 400,
                        }}
                      >
                        <input type="radio" name={`va-${item.key}`} checked={response === opt} onChange={() => onResponse(opt)} style={{ accentColor: 'var(--color-brand)' }} />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : (
                  <select value={response} onChange={(e) => onResponse(e.target.value)} style={appInputStyle}>
                    <option value="">请选择…</option>
                    {(item.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )
              )}
            </div>
          )}
        </>
      )}

      <div style={{ margin: '9px 0 0 38px' }}>
        <SharedAuditPoints item={item} />
      </div>
    </div>
  );
}

const appInputStyle: CSSProperties = {
  border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '8px 10px',
  fontSize: 'var(--fs-13)', outline: 'none', background: '#fff', minWidth: 200,
};
