/**
 * 服务商详情抽屉（2026-10-21 走查精简版 · 二轮）
 * 三页签：基本信息 / 准入材料 / 处理历史。
 * - 顶部状态小标题行已删：状态看「基本信息」页签；
 * - 「准入材料」并列铺开材料区与核查清单（不分子页签），填写类项并入材料区；
 *   审核中在内容顶部右侧显示逐项标记进度；
 * - 「处理历史」= 第三页签（当前任务全生命周期；原「合作记录」页签删除，合作状态看基本信息）；
 * - 外部准入：展示「外部已完成准入」与导入批次、时间、操作人、声明；
 * - 平台材料与核查清单仅对具备准入审核权限（vendor-access.approve）的角色可见；
 *   审核中就地逐项标记（通过/驳回+原因），全部通过即自动建立合作（store 幂等联动）。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  ClipboardCheck,
  FileText,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../complianceUi';
import type { ToastMessage } from '../../components/Toast';
import type { AccessTemplateItem, NavigateFn, VendorAccessRecord } from '../../types';
import {
  relationshipsOfPharma,
  subscribeCooperation,
  varietyAuthStateOf,
  type ProviderPharmaRelationship,
} from '../../data/cooperationModel';
import { useVendorAccess } from '../../context/VendorAccessContext';
import { usePermission } from '../../context/PermissionContext';
import { useContract } from '../../context/ContractContext';
import {
  DrawerTabs,
  GroupHeader,
  HistoryTimeline,
  SnapshotItemsView,
  VerdictBadge,
} from '../vendor-access/shared';
import { mono, modalInputStyle, providerNameOf, usccOfProvider, VerdictControl } from './parts';

type SectionKey = 'base' | 'basis' | 'history';

const INFLIGHT_STATUSES = ['待服务商提交', '审核中', '已驳回'];

function taskRowStatusOf(t: VendorAccessRecord): string {
  if (t.status === '待服务商提交') return '待提交';
  if (t.status === '审核中') return '待审核';
  if (t.status === '已驳回') return '待补充';
  return t.status;
}

function taskTimeOf(t: VendorAccessRecord): string {
  return t.submittedAt ?? t.claimedAt ?? t.createdAt ?? '';
}

/** 准入方式列口径（与主列表一致：平台审核 / 外部已准入） */
function methodLabelOf(source?: 'access' | 'manual'): string {
  return source === 'manual' ? '外部已准入' : '平台审核';
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  providerTenantId: string;
  pharmaTenantId: string;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate?: NavigateFn;
  onClose: () => void;
  initialSection?: SectionKey;
  /** 从列表「审核资料」进入时预选的在途任务 */
  initialTaskId?: string;
}

export function VendorDetailDrawer({ providerTenantId, pharmaTenantId, addToast, navigate, onClose, initialSection = 'base', initialTaskId }: Props) {
  const { records, rejectTask, approveTask, withdrawTask } = useVendorAccess();
  const { contractOf } = useContract();
  const { can, previewReadOnly } = usePermission();
  const canReview = can('vendor-access', 'approve') && !previewReadOnly;

  // 合作数据修订号：审核通过建立合作 / 暂停恢复终止后详情实时刷新
  const [coopRev, bump] = useState(0);
  useEffect(() => subscribeCooperation(() => bump((x) => x + 1)), []);

  const [section, setSection] = useState<SectionKey>(initialSection);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [checkState, setCheckState] = useState<Record<string, boolean>>({});
  const [verdictDraft, setVerdictDraft] = useState<Record<string, { verdict: 'pass' | 'reject'; reason: string }>>({});

  const [rejectError, setRejectError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [effFrom, setEffFrom] = useState('');
  const [effTo, setEffTo] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  /** 通过弹框成功段（二段式：确认段 → 就地成功反馈 + 品种授权/合同衔接引导） */
  const [approveDone, setApproveDone] = useState<{
    vendorName: string;
    providerTenantId: string;
    effFrom: string;
    effTo: string;
    coopCreated: boolean;
    authState: 'granted' | 'missing';
  } | null>(null);

  const providerName = providerNameOf(providerTenantId) ?? providerTenantId;
  const uscc = usccOfProvider(providerTenantId);

  const relationships = useMemo(() => {
    void coopRev;
    return relationshipsOfPharma(pharmaTenantId).filter((r) => r.providerTenantId === providerTenantId);
  }, [pharmaTenantId, providerTenantId, coopRev]);
  const rel: ProviderPharmaRelationship | undefined = relationships[relationships.length - 1];

  const tasks = useMemo(
    () =>
      records
        .filter((r) => r.pharmaTenantId === pharmaTenantId && r.providerTenantId === providerTenantId && r.status !== '已撤回')
        .slice()
        .sort((a, b) => taskTimeOf(b).localeCompare(taskTimeOf(a))),
    [records, pharmaTenantId, providerTenantId],
  );
  const activeTask = tasks.find((t) => INFLIGHT_STATUSES.includes(t.status));

  /** 展示任务：列表「查看/审核」带入指定任务；否则默认在途任务，再退最近一条 */
  const detail = taskId ? tasks.find((t) => t.id === taskId) : activeTask ?? tasks[0];
  const snapItems = detail?.requirementSnapshot.items ?? [];
  const checklistCount = snapItems.filter((i) => i.kind === 'checklist').length;
  const checklistBlocks = snapItems
    .filter((i) => i.kind === 'checklist')
    .map((item) => ({ item, points: (item.checkPoints ?? '').split('\n').map((s) => s.trim()).filter(Boolean) }));
  const checklistTotal = checklistBlocks.reduce((n, b) => n + b.points.length, 0);
  const checklistDone = checklistBlocks.reduce((n, b) => n + b.points.filter((_, i) => checkState[`${b.item.key}-${i}`]).length, 0);

  // 逐项审核结论（材料+填写项参与标记，核查类不参与）
  const reviewableItems = snapItems.filter((i) => i.kind !== 'checklist');
  const markedCount = reviewableItems.filter((i) => verdictDraft[i.key]).length;
  const rejectDrafts = reviewableItems.filter((i) => verdictDraft[i.key]?.verdict === 'reject');
  const rejectMissingReason = rejectDrafts.filter((i) => !verdictDraft[i.key].reason.trim());
  const allVerdictsMarked = !!detail?.submittedAt && reviewableItems.length > 0 && markedCount === reviewableItems.length;

  // 打开/切换任务时初始化结论草稿：审核中预填上轮结论（复审沿用），其余状态清空
  useEffect(() => {
    const target = taskId ? tasks.find((t) => t.id === taskId) : undefined;
    if (target?.status === '审核中' && target.itemVerdicts) {
      setVerdictDraft(Object.fromEntries(
        Object.entries(target.itemVerdicts).map(([k, v]) => [k, { verdict: v.verdict, reason: v.reason ?? '' }]),
      ));
    } else {
      setVerdictDraft({});
    }
    setCheckState({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // 每项卡片尾部结论插槽：审核中=标记控件（须审核权限）；已驳回=只读徽章；其余不渲染
  const verdictExtraOf = (item: AccessTemplateItem) => {
    if (!detail) return null;
    if (detail.status === '审核中' && canReview) {
      return (
        <VerdictControl
          value={verdictDraft[item.key]}
          onChange={(v) =>
            setVerdictDraft((p) => {
              const next = { ...p };
              if (v) next[item.key] = v;
              else delete next[item.key];
              return next;
            })
          }
        />
      );
    }
    if (detail.status === '已驳回' && detail.itemVerdicts) {
      const v = detail.itemVerdicts[item.key];
      return v ? <VerdictBadge verdict={v.verdict} reason={v.reason} /> : null;
    }
    return null;
  };

  function confirmApprove() {
    if (!detail) return;
    const res = approveTask(detail.id, effFrom, effTo);
    if (res.ok) {
      setApproveDone({
        vendorName: detail.vendorName,
        providerTenantId,
        effFrom,
        effTo,
        coopCreated: !!res.coopCreated,
        authState: varietyAuthStateOf(pharmaTenantId, providerTenantId),
      });
      setApproveOpen(false);
    } else {
      addToast({ type: 'error', title: '审核未生效', description: res.error });
    }
  }

  function confirmReject() {
    if (!detail) return;
    const res = rejectTask(
      detail.id,
      reviewableItems.map((i) => ({
        key: i.key,
        verdict: verdictDraft[i.key]?.verdict ?? 'pass',
        reason: verdictDraft[i.key]?.reason,
      })),
    );
    if (res.ok) {
      addToast({ type: 'warning', title: '已驳回退回修改', description: `${rejectDrafts.length} 项被驳回（其余 ${reviewableItems.length - rejectDrafts.length} 项通过）；服务商在原任务上修改后重新提交，通过项保留。` });
      setRejectOpen(false);
      setRejectError('');
      setVerdictDraft({});
    } else {
      setRejectError(res.error ?? '操作失败');
    }
  }

  function confirmWithdraw() {
    if (!detail) return;
    const res = withdrawTask(detail.id, '');
    if (res.ok) {
      addToast({ type: 'info', title: '任务已撤回', description: '已领取任务服务商端将立即失去权限；撤回记录经审计日志与服务商端「提交记录」查阅。' });
      setWithdrawOpen(false);
      setWithdrawError('');
      setTaskId(null);
    } else {
      setWithdrawError(res.error ?? '操作失败');
    }
  }

  /** 品种授权衔接引导：跳「业务授权」并预选该服务商 */
  function goConfigureVarietyAuth() {
    if (!navigate) {
      addToast({ type: 'info', title: '请前往「合作与授权 › 业务授权」', description: `为「${providerName}」配置品种授权。` });
      return;
    }
    navigate('variety-auth', { businessAuthProviderTenantId: providerTenantId });
  }

  /** 合同归档承接引导：跳「合同管理」直接打开该服务商的上传弹窗 */
  function goUploadContract() {
    if (!navigate) {
      addToast({ type: 'info', title: '请前往「合作与授权 › 合同管理」', description: `为「${providerName}」上传已签署合同。` });
      return;
    }
    navigate('contract-management', { contractUploadProviderTenantId: providerTenantId });
  }

  const contract = contractOf(providerTenantId);

  return (
    <Modal
      open
      title={`服务商详情 · ${providerName}`}
      onClose={onClose}
      width={960}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>关闭</Button>
          {detail && ['待服务商提交', '审核中'].includes(detail.status) && canReview && (
            <Button variant="danger" onClick={() => { setWithdrawOpen(true); setWithdrawError(''); }}>撤回任务</Button>
          )}
          {detail?.status === '审核中' && canReview && (
            <>
              <Button
                variant="danger"
                disabled={!allVerdictsMarked || rejectDrafts.length === 0 || rejectMissingReason.length > 0}
                onClick={() => { setRejectOpen(true); setRejectError(''); }}
              >
                驳回退回{rejectDrafts.length > 0 ? `（${rejectDrafts.length}）` : ''}
              </Button>
              <Button
                variant="primary"
                disabled={!allVerdictsMarked || rejectDrafts.length > 0}
                onClick={() => {
                  setApproveOpen(true);
                  const y = new Date();
                  y.setFullYear(y.getFullYear() + 1);
                  const p = (n: number) => String(n).padStart(2, '0');
                  setEffFrom(todayStr());
                  setEffTo(`${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`);
                }}
              >
                审核通过
              </Button>
            </>
          )}
        </>
      }
    >
      <DrawerTabs<SectionKey>
        tabs={[
          { key: 'base', label: '基本信息' },
          { key: 'basis', label: '准入材料' },
          { key: 'history', label: '处理历史' },
        ]}
        active={section}
        onChange={setSection}
      />

      <div style={{ paddingTop: 16, minHeight: 200 }}>
        {/* ── 基本信息 ── */}
        {section === 'base' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 2px' }}>
            {[
              ['服务商名称', providerName],
              ['统一社会信用代码', <span style={{ fontFamily: mono }}>{uscc ?? '—'}</span>],
              ['准入状态', activeTask ? taskRowStatusOf(activeTask) : '已准入'],
              ['合作状态', rel?.status === 'active' ? '合作中' : rel?.status === 'paused' ? '已暂停' : rel?.status === 'terminated' ? '已终止' : '尚未合作'],
              ['准入方式', rel ? methodLabelOf(rel.source) : '平台审核（准入任务进行中）'],
              ['合作生效日期', rel?.effectiveFrom ?? '—'],
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', gap: 16, padding: '9px 14px', borderRadius: 8, background: '#FAFBFC', border: '1px solid var(--color-border)', fontSize: 'var(--fs-13)' }}>
                <span style={{ width: 132, flexShrink: 0, color: 'var(--color-text-3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>{v}</span>
              </div>
            ))}
            {rel?.status === 'paused' && (
              <div style={{ padding: '9px 14px', borderRadius: 8, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-13)', color: '#92400E' }}>
                合作暂停：{rel.pausedAt} · {rel.pausedReason}
              </div>
            )}
            {rel?.status === 'terminated' && (
              <div style={{ padding: '9px 14px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6', fontSize: 'var(--fs-13)', color: '#C73A3A' }}>
                合作终止：{rel.terminatedAt} · {rel.terminatedReason}
              </div>
            )}
          </div>
        )}

        {/* ── 准入材料：材料区与核查清单并列铺开（不分子页签） ── */}
        {section === 'basis' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rel?.source === 'manual' && <ExternalBasisPanel rel={rel} />}

            {detail ? (
              canReview ? (
                <>
                  {detail.status === '审核中' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 'var(--fs-12)', fontWeight: 600, fontFamily: mono, color: '#2F6BCE' }}>
                      已标 {markedCount}/{reviewableItems.length}{rejectDrafts.length > 0 ? ` · 驳回 ${rejectDrafts.length}` : ''}
                    </div>
                  )}

                  {detail.submittedAt ? (
                    <SnapshotItemsView
                      snapshot={detail.requirementSnapshot}
                      attachments={detail.attachments}
                      responses={detail.itemResponses}
                      filterChecklist
                      review
                      licenseData={detail}
                      onToast={addToast}
                      itemExtra={verdictExtraOf}
                    />
                  ) : (
                    <EmptyState icon={FileText} title="服务商尚未提交材料" description="服务商提交的材料将出现在此处。" />
                  )}

                  {checklistCount > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <GroupHeader
                        name="核查清单"
                        right={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#FEF3E2', color: '#C77A16', fontWeight: 600 }}>仅审核方</span>
                            <span style={{ fontSize: 'var(--fs-11)', fontWeight: 700, fontFamily: mono, color: '#C77A16' }}>已核查 {checklistDone} / {checklistTotal}</span>
                          </span>
                        }
                      />
                      <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEF8EE', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E' }}>
                        核查项仅审核方可见，服务商全程不可见；勾选仅作核对记录，不落库。
                      </div>
                      {checklistBlocks.map(({ item, points }) => (
                        <div key={item.key}>
                          <GroupHeader name={item.group} right={<span style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)' }}>{item.name}</span>} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {points.map((pt, i) => {
                              const key = `${item.key}-${i}`;
                              return (
                                <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 8, border: `1px solid ${checkState[key] ? 'var(--color-brand)' : 'var(--color-border)'}`, cursor: 'pointer', background: checkState[key] ? 'var(--color-brand-subtle)' : '#fff' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!checkState[key]}
                                    onChange={(e) => setCheckState((p) => ({ ...p, [key]: e.target.checked }))}
                                    style={{ marginTop: 2, accentColor: 'var(--color-brand)', width: 15, height: 15 }}
                                  />
                                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', lineHeight: 1.6 }}>{pt}</div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-13)', color: 'var(--color-text-2)', lineHeight: 1.7 }}>
                  准入材料与核查清单仅对具备准入审核权限的角色开放查看；当前角色可查看任务状态与处理时间。
                </div>
              )
            ) : rel?.source === 'manual' ? null : (
              <EmptyState icon={ClipboardCheck} title="无平台准入任务" description="该服务商未经本厂线上准入流程（外部导入或历史数据）。" />
            )}
          </div>
        )}

        {/* ── 处理历史（当前任务全生命周期；合作状态看「基本信息」） ── */}
        {section === 'history' && (
          detail ? (
            <HistoryTimeline history={detail.history} />
          ) : (
            <EmptyState title="暂无处理历史" description="该服务商暂无平台准入任务记录。" />
          )
        )}

      </div>

      {/* ── 通过（二段式：确认段 → 成功段含品种授权/合同衔接引导） ── */}
      <Modal
        open={approveOpen || !!approveDone}
        title={approveDone ? '已通过准入审核' : '确认通过准入审核'}
        onClose={() => { setApproveOpen(false); setApproveDone(null); }}
        width={480}
        footer={
          approveDone ? (
            <>
              <Button variant="outline" onClick={() => { setApproveOpen(false); setApproveDone(null); }}>关闭</Button>
              {approveDone.authState === 'missing' && (
                <Button variant="primary" onClick={() => { setApproveOpen(false); setApproveDone(null); goConfigureVarietyAuth(); }}>
                  去配置品种授权
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setApproveOpen(false)}>取消</Button>
              <Button variant="primary" onClick={confirmApprove}>确认通过</Button>
            </>
          )
        }
      >
        {approveDone ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#E6F5ED', color: '#248A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={17} />
              </span>
              <div>
                <div style={{ fontSize: 'var(--fs-15)', fontWeight: 700, color: '#248A5A' }}>「{approveDone.vendorName}」已准入生效</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', marginTop: 2 }}>
                  有效期 {approveDone.effFrom} ~ {approveDone.effTo} · {approveDone.coopCreated ? '已建立合作关系（合作中 / 平台准入）' : '合作关系保持生效'}
                </div>
              </div>
            </div>
            {approveDone.authState === 'missing' ? (
              <div style={{ padding: '11px 14px', borderRadius: 8, background: '#FEF3E2', border: '1px solid #F5D99A', lineHeight: 1.8 }}>
                <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#92400E' }}>还差最后一步：品种授权</div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#92400E' }}>
                  该服务商还没有品种授权，暂时无法承接本厂任何业务；配置品种授权后即可正常开展合作。
                </div>
              </div>
            ) : (
              <div style={{ padding: '11px 14px', borderRadius: 8, background: '#E6F5ED', border: '1px solid #C8E9D6', fontSize: 'var(--fs-13)', color: '#248A5A' }}>
                品种授权已配置，该服务商可直接承接本厂业务。
              </div>
            )}
            {(() => {
              if (contract) {
                return (
                  <div style={{ marginTop: 10, padding: '11px 14px', borderRadius: 8, background: 'var(--color-brand-subtle)', border: '1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)', fontSize: 'var(--fs-13)', color: 'var(--color-brand)', lineHeight: 1.7 }}>
                    合同已归档：《{contract.contractFileName}》；如需更换文件，可在「合同管理」删除后重新上传。
                  </div>
                );
              }
              return (
                <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', lineHeight: 1.8 }}>
                  <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: 'var(--color-text-1)' }}>服务商已完成准入</div>
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', marginTop: 2 }}>下一步，归档双方已签署的合作合同</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
                    归档后，系统会辅助将合同中可识别的价目内容带入价目表草稿；后续调整可在价目表管理中完成。
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button variant="primary" size="sm" icon={<FileText size={13} />} onClick={() => { setApproveOpen(false); setApproveDone(null); goUploadContract(); }}>
                      上传已签署合同
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setApproveOpen(false); setApproveDone(null); }}>稍后处理</Button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 'var(--fs-14)', lineHeight: 1.7 }}>
              确认通过「{detail?.vendorName || providerName}」的准入任务？
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <Field label="有效期起始" required>
                <input type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} style={modalInputStyle} />
              </Field>
              <Field label="有效期截止" required>
                <input type="date" value={effTo} onChange={(e) => setEffTo(e.target.value)} style={modalInputStyle} />
              </Field>
            </div>
            <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 6, background: 'var(--color-brand-subtle)', fontSize: 'var(--fs-12)', color: 'var(--color-brand)', lineHeight: 1.7 }}>
              通过后该服务商的合作关系自动生效（合作中 / 平台准入），无需再添加或启用；品种业务授权可在「业务授权」中配置。
            </div>
          </div>
        )}
      </Modal>

      {/* ── 驳回（按项退回） ── */}
      <Modal
        open={rejectOpen}
        title={`驳回退回（${rejectDrafts.length} 项）`}
        onClose={() => { setRejectOpen(false); setRejectError(''); }}
        width={520}
        footer={
          <>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectError(''); }}>取消</Button>
            <Button variant="danger" onClick={confirmReject}>确认驳回退回</Button>
          </>
        }
      >
        <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
          任务将退回「{detail?.vendorName ?? providerName}」修改：下列 {rejectDrafts.length} 项须按原因修改后重新提交；其余 {reviewableItems.length - rejectDrafts.length} 项已通过，材料保留、无需重传。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rejectDrafts.map((i) => (
            <div key={i.key} style={{ padding: '9px 12px', borderRadius: 6, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
              <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#C73A3A' }}>{i.name}</div>
              <div style={{ marginTop: 3, fontSize: 'var(--fs-12)', color: '#C73A3A', lineHeight: 1.6 }}>驳回原因：{verdictDraft[i.key].reason.trim()}</div>
            </div>
          ))}
        </div>
        {rejectError && <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{rejectError}</div>}
      </Modal>

      {/* ── 撤回 ── */}
      <Modal
        open={withdrawOpen}
        title="撤回准入任务"
        onClose={() => { setWithdrawOpen(false); setWithdrawError(''); }}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => { setWithdrawOpen(false); setWithdrawError(''); }}>取消</Button>
            <Button variant="danger" onClick={confirmWithdraw}>确认撤回</Button>
          </>
        }
      >
        <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
          撤回后「{detail?.vendorName ?? providerName}」将立即失去该任务的材料提交与查看权限；如需继续准入须重新发起任务。
        </div>
        {withdrawError && <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{withdrawError}</div>}
      </Modal>
    </Modal>
  );
}

/** 外部准入依据面板：导入批次/时间/操作人/声明；存量缺省显示「历史数据未记录」 */
function ExternalBasisPanel({ rel }: { rel: ProviderPharmaRelationship }) {
  const meta = rel.importMeta;
  return (
    <div style={{ border: '1px solid #C9DDF7', borderRadius: 8, background: '#F7FAFE', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BadgeCheck size={16} style={{ color: '#2F6BCE' }} />
        <span style={{ fontSize: 'var(--fs-14)', fontWeight: 700, color: '#2F6BCE' }}>外部已完成准入</span>
        <span style={{ fontSize: 'var(--fs-11)', padding: '1px 8px', borderRadius: 4, color: '#2F6BCE', background: '#EBF2FE', border: '1px solid #C9DDF7', fontWeight: 600 }}>↧ 外部准入</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.8 }}>
        准入审核已在本厂自有系统或线下完成，材料由本厂留存。合作生效日（{rel.effectiveFrom}）为导入当天，不代表外部实际审核通过日期。
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'fit-content(120px) 1fr', rowGap: 6, columnGap: 14, fontSize: 'var(--fs-12)' }}>
        {[
          ['导入时间', meta?.importedAt],
          ['操作人', meta?.importedBy],
          ['导入批次', meta?.importBatchId],
        ].map(([k, v]) => (
          <div key={String(k)} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--color-text-3)' }}>{k}</span>
            <span style={{ color: 'var(--color-text-1)', fontFamily: k === '导入批次' ? mono : undefined }}>{v ?? <span style={{ color: '#9CA3AF' }}>历史数据未记录</span>}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
        <KeyRound size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
        <b>导入声明：</b>{meta?.declaration ?? '历史数据未记录（导入声明留痕自 2026-10-20 起随批次保存）'}
      </div>
    </div>
  );
}
