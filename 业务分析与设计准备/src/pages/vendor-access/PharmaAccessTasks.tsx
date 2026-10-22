/**
 * 服务商准入 · 药厂侧（2026-10-21 走查整改：页签化回归）
 * 页面级两页签同页切换：准入任务 / 准入模板（不再用按钮跳次级视图）。
 * - 准入码制（2026-09-21）+ 按项审核（2026-10-16）口径的任务列表：
 *   药厂选模板创建任务生成一次性准入码线下告知；服务商输码领取提交材料后在此逐项审核，
 *   通过即自动建立合作；可见状态五个（待领取/待服务商提交/审核中/已驳回/已准入）；
 * - 待领取任务行内管理准入码（查看/重新生成/撤回）；「审核」直达该任务材料审核
 *   （详情抽屉「准入材料」区，逐项 通过/驳回+原因）；
 * - 准入模板页签：模板维护（TemplateTab，embedded 无页头）。
 * 动作权限沿用 vendor-access 原键：发起/重新生成/撤回=create+approve；审核=approve。
 */
import { useMemo, useState } from 'react';
import {
  Ban,
  Inbox,
  KeyRound,
  Plus,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { StatusTag } from '../../components/StatusTag';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import type { ToastMessage } from '../../components/Toast';
import type { NavigateFn, VendorAccessRecord } from '../../types';
import { useVendorAccess } from '../../context/VendorAccessContext';
import { usePermission } from '../../context/PermissionContext';
import { DrawerTabs, mono } from './shared';
import { ComposeTaskModal, providerNameOf } from '../vendor-management/parts';
import { VendorDetailDrawer } from '../vendor-management/DetailDrawer';
import { TemplateTab } from './TemplateTab';
import { tdStyle, thStyle } from '../permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate?: NavigateFn;
}

/** 列表可见状态（旧版口径；已撤回等历史不展示）与排序 */
const VISIBLE_STATUSES = ['待领取', '待服务商提交', '审核中', '已驳回', '已准入'] as const;
const ORDER: Record<string, number> = { 待领取: 0, 审核中: 1, 待服务商提交: 2, 已驳回: 3, 已准入: 4 };
/** 允许撤回的任务状态（store 守卫口径） */
const WITHDRAWABLE_STATUSES = ['待领取', '待服务商提交', '审核中'];

function timeOf(t: VendorAccessRecord): string {
  return t.submittedAt ?? t.claimedAt ?? t.createdAt ?? '';
}

export function PharmaAccessTasks({ addToast, navigate }: Props) {
  const { principal, can, previewReadOnly } = usePermission();
  const pharmaTenantId = principal.realm === 'TENANT' && principal.tenantKind === 'pharma' ? principal.tenantId : '';
  const pharmaName = principal.realm === 'TENANT' ? principal.tenantName : '';

  const canEnter = can('vendor-access', 'view');
  const canIssue = can('vendor-access', 'create') && can('vendor-access', 'approve') && !previewReadOnly;
  const canReview = can('vendor-access', 'approve') && !previewReadOnly;

  const { records, regenerateCode, withdrawTask } = useVendorAccess();
  const [tab, setTab] = useState<'tasks' | 'templates'>('tasks');
  const [filters, setFilters] = useState<Record<string, string>>({ kw: '', status: '' });
  const [applied, setApplied] = useState<Record<string, string>>({ kw: '', status: '' });

  const [composeOpen, setComposeOpen] = useState(false);
  /** 待领取任务行：查看准入码 */
  const [codeTaskId, setCodeTaskId] = useState<string | null>(null);
  /** 撤回确认 */
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState('');
  /** 已绑定任务：打开统一详情（审核/查看） */
  const [detail, setDetail] = useState<{ providerTenantId: string; section: 'base' | 'basis'; taskId?: string } | null>(null);

  const mine = useMemo(
    () => records
      .filter((r) => r.pharmaTenantId === pharmaTenantId && (VISIBLE_STATUSES as readonly string[]).includes(r.status))
      .slice()
      .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || timeOf(b).localeCompare(timeOf(a))),
    [records, pharmaTenantId],
  );

  const filtered = useMemo(() => {
    const kw = applied.kw?.trim().toLowerCase();
    return mine.filter((t) => {
      // 已领取但未提交材料的任务快照上无企业名：以注册中心解析主体名兜底
      const name = t.vendorName || (t.providerTenantId ? providerNameOf(t.providerTenantId) : undefined) || '';
      if (kw) {
        const hay = `${name} ${t.creditCode} ${t.id}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (applied.status && t.status !== applied.status) return false;
      return true;
    });
  }, [mine, applied]);

  const codeTask = codeTaskId ? records.find((r) => r.id === codeTaskId) : undefined;
  const withdrawTarget = withdrawId ? records.find((r) => r.id === withdrawId) : undefined;
  const pendingReview = mine.filter((t) => t.status === '审核中').length;

  if (!canEnter) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState icon={Ban} title="无权访问" description="服务商准入仅对具备准入任务权限的药厂角色开放。" />
      </div>
    );
  }

  function handleRegenerate(taskId: string) {
    const res = regenerateCode(taskId);
    if (res.ok) {
      addToast({ type: 'success', title: '已重新生成准入码', description: `新准入码 ${res.admissionCode ?? ''}，旧码已作废。` });
    } else {
      addToast({ type: 'error', title: res.error ?? '操作失败' });
    }
  }

  function confirmWithdraw() {
    if (!withdrawId) return;
    const res = withdrawTask(withdrawId, '');
    if (res.ok) {
      addToast({ type: 'info', title: '任务已撤回', description: '未领取任务撤回后准入码同步失效；已领取任务服务商端将立即失去权限。' });
      setWithdrawId(null);
      setWithdrawError('');
    } else {
      setWithdrawError(res.error ?? '操作失败');
    }
  }

  function openDetail(task: VendorAccessRecord, review: boolean) {
    setDetail({ providerTenantId: task.providerTenantId!, section: review ? 'basis' : 'base', taskId: task.id });
  }

  /** 行内操作（按状态；权限沿用原键，不合并放大） */
  function rowOps(t: VendorAccessRecord) {
    const withdrawable = WITHDRAWABLE_STATUSES.includes(t.status);
    return (
      <>
        {t.status === '待领取' && (
          <>
            <Button variant="primary" size="sm" icon={<KeyRound size={13} />} onClick={() => setCodeTaskId(t.id)}>查看准入码</Button>
            {canIssue && <Button variant="ghost" size="sm" onClick={() => handleRegenerate(t.id)}>重新生成码</Button>}
          </>
        )}
        {t.status === '待服务商提交' && (
          <Button variant="primary" size="sm" onClick={() => openDetail(t, false)}>查看详情</Button>
        )}
        {t.status === '审核中' && (
          canReview
            ? <Button variant="primary" size="sm" onClick={() => openDetail(t, true)}>审核</Button>
            : <Button variant="primary" size="sm" onClick={() => openDetail(t, false)}>查看详情</Button>
        )}
        {(t.status === '已驳回' || t.status === '已准入') && (
          <Button variant="ghost" size="sm" onClick={() => openDetail(t, false)}>查看详情</Button>
        )}
        {canIssue && withdrawable && (
          <Button variant="ghost" size="sm" onClick={() => { setWithdrawId(t.id); setWithdrawError(''); }}>撤回任务</Button>
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="服务商准入"
        description={`「${pharmaName}」的准入任务：创建任务生成一次性准入码，线下告知服务商；服务商输码领取并提交材料后在此审核，通过即自动建立合作。`}
        actions={
          tab === 'tasks' && canIssue ? (
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setComposeOpen(true)}>发起准入任务</Button>
          ) : undefined
        }
      />

      <div style={{ padding: '0 16px' }}>
        <DrawerTabs<'tasks' | 'templates'>
          tabs={[
            { key: 'tasks', label: '准入任务' },
            { key: 'templates', label: '准入模板' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'templates' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <TemplateTab embedded addToast={addToast} pharmaTenantId={pharmaTenantId} pharmaName={pharmaName} />
        </div>
      ) : (
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <FilterBar
          fields={[
            { id: 'kw', label: '服务商', type: 'text' as const, placeholder: '名称 / 统一社会信用代码 / 任务编号', width: 230 },
            { id: 'status', label: '状态', type: 'select' as const, options: [{ value: '', label: '全部' }, ...VISIBLE_STATUSES.map((v) => ({ value: v, label: v }))] },
          ]}
          values={filters}
          onChange={(id, val) => setFilters((p) => ({ ...p, [id]: val }))}
          onSearch={() => setApplied(filters)}
          onReset={() => { setFilters({ kw: '', status: '' }); setApplied({ kw: '', status: '' }); }}
          stats={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: mono }}>{filtered.length}</strong> 条
              {pendingReview > 0 && (
                <button
                  onClick={() => { setFilters((p) => ({ ...p, status: '审核中' })); setApplied((p) => ({ ...p, status: '审核中' })); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #F5D99A', background: '#FEF3E2', color: '#C77A16', borderRadius: 999, padding: '2px 10px', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer' }}
                >
                  待审核 {pendingReview}
                </button>
              )}
            </span>
          }
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {mine.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="暂无准入任务"
              description="点击「发起准入任务」创建任务并生成一次性准入码；外部已准入的服务商可在「合作关系」页直接导入。"
              action={canIssue ? <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setComposeOpen(true)}>发起准入任务</Button> : undefined}
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="没有符合筛选条件的任务" description="调整搜索或状态筛选后重试。" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>{['服务商', '材料模板', '状态', '创建时间', '操作'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const displayName = t.vendorName || (t.providerTenantId ? providerNameOf(t.providerTenantId) : undefined) || '';
                    return (
                    <tr key={t.id}>
                      <td style={tdStyle}>
                        <button
                          onClick={() => (t.status === '待领取' ? setCodeTaskId(t.id) : openDetail(t, false))}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-1)', fontSize: 'var(--fs-13)' }}
                        >
                          {displayName || <span style={{ color: '#98A2B3', fontWeight: 500 }}>— 待领取（未绑定服务商）</span>}
                        </button>
                        <div style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)', marginTop: 2, fontFamily: mono }}>
                          {t.status === '待领取'
                            ? `任务 ${t.id} · 准入码 ${t.admissionCode ?? '—'}`
                            : `${t.id}${t.creditCode ? ` · ${t.creditCode}` : ''}`}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 'var(--fs-13)' }}>{t.requirementSnapshot.templateName}</div>
                        <div style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)' }}>{t.templateVersion}</div>
                      </td>
                      <td style={tdStyle}><StatusTag status={t.status} size="sm" /></td>
                      <td style={{ ...tdStyle, fontFamily: mono, whiteSpace: 'nowrap' }}>{t.createdAt || '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{rowOps(t)}</div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {composeOpen && (
        <ComposeTaskModal
          pharmaName={pharmaName}
          addToast={addToast}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {detail && (
        <VendorDetailDrawer
          key={`${detail.providerTenantId}:${detail.section}:${detail.taskId ?? ''}`}
          providerTenantId={detail.providerTenantId}
          pharmaTenantId={pharmaTenantId}
          addToast={addToast}
          navigate={navigate}
          initialSection={detail.section}
          initialTaskId={detail.taskId}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 待领取任务行 · 查看准入码 */}
      {codeTask && (
        <Modal
          open
          title={`准入任务 · ${codeTask.id}`}
          onClose={() => setCodeTaskId(null)}
          width={480}
          footer={<Button variant="primary" onClick={() => setCodeTaskId(null)}>关闭</Button>}
        >
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-2)' }}>一次性准入码（待领取）</div>
            <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--color-brand)', margin: '10px 0 6px' }}>
              {codeTask.admissionCode}
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<KeyRound size={13} />}
              onClick={() => addToast({ type: 'info', title: '（演示）准入码已复制', description: '原型不访问剪贴板，请手动记录。' })}
            >
              复制准入码
            </Button>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 6, fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
            <div>材料模板：{codeTask.requirementSnapshot.templateName} {codeTask.templateVersion}</div>
            <div>创建时间：<span style={{ fontFamily: mono }}>{codeTask.createdAt}</span> · 创建人：{codeTask.createdBy || '—'}</div>
          </div>
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.8 }}>
            请通过<strong>线下渠道</strong>（电话/微信/邮件）将准入码告知意向服务商；服务商在「准入任务」输入码后，任务即绑定其主体并开始提交材料。
          </div>
        </Modal>
      )}

      {/* 撤回确认 */}
      <Modal
        open={!!withdrawTarget}
        title="撤回准入任务"
        onClose={() => { setWithdrawId(null); setWithdrawError(''); }}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => { setWithdrawId(null); setWithdrawError(''); }}>取消</Button>
            <Button variant="danger" onClick={confirmWithdraw}>确认撤回</Button>
          </>
        }
      >
        <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
          {withdrawTarget?.status === '待领取'
            ? '撤回后该准入码立即失效；未领取任务不涉及任何服务商。'
            : `撤回后「${withdrawTarget?.vendorName ?? ''}」将立即失去该任务的材料提交与查看权限；如需继续准入须重新发起任务。`}
        </div>
        {withdrawError && <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{withdrawError}</div>}
      </Modal>
    </div>
  );
}
