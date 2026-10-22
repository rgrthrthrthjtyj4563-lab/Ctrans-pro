import { useMemo, useState } from 'react';
import { Building2, Eye, FileText, Info } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { MetricCard } from '../../components/MetricCard';
import { StatusTag } from '../../components/StatusTag';
import type { ToastMessage } from '../../components/Toast';
import type { VendorAccessRecord } from '../../types';
import { useVendorAccess } from '../../context/VendorAccessContext';
import {
  HistoryTimeline,
  mono,
  SnapshotItemsView,
} from './shared';

/**
 * 服务商侧 · 提交记录（合作管理，2026-09-21 药厂发起制口径）
 * 只读台账：按药厂展示本服务商主体收到/提交过的全部准入任务与状态；
 * 待办任务（待服务商提交）可跳转「准入任务」提交材料。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const RESUME_KEY = 'va-resume-record';

/** 展示排序：可操作在前，在途次之，终态最后 */
const STATUS_ORDER: Record<string, number> = {
  待服务商提交: 0,
  审核中: 1,
  已准入: 2,
  已驳回: 3,
  已撤回: 4,
  已失效: 5,
  已撤销: 6,
};

/** 各终态/封闭态的原因字段（已撤回、已失效、已撤销必须显示原因；已驳回走按项结论汇总） */
const REASON_FIELD: Partial<Record<string, { label: string; field: keyof VendorAccessRecord }>> = {
  已失效: { label: '失效原因', field: 'invalidationReason' },
  已撤销: { label: '撤销原因', field: 'revocationReason' },
};

export function RecordsTab({ addToast }: Props) {
  const { myTasks } = useVendorAccess();
  const [detailId, setDetailId] = useState<string | null>(null);

  /** 已撤回/已失效/已撤销 的历史记录不在列表展示 */
  const shown = useMemo(
    () => myTasks.filter((r) => !['已撤回', '已失效', '已撤销'].includes(r.status)),
    [myTasks],
  );

  const sorted = useMemo(
    () =>
      [...shown].sort((a, b) => {
        const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (so !== 0) return so;
        return (b.submittedAt ?? b.claimedAt ?? '').localeCompare(a.submittedAt ?? a.claimedAt ?? '');
      }),
    [shown],
  );

  const detail = detailId ? shown.find((r) => r.id === detailId) : undefined;

  function resume(record: VendorAccessRecord) {
    sessionStorage.setItem(RESUME_KEY, record.id);
    addToast({
      type: 'info',
      title: `已定位「${record.pharmaName}」的准入任务`,
      description: '请前往「合作管理 › 准入任务」提交材料。',
    });
  }

  const reasonOf = (r: VendorAccessRecord) => {
    // 已驳回（按项退回）：汇总驳回项与通过数，可修改后重提；存量旧数据回退整单驳回原因
    if (r.status === '已驳回') {
      if (r.itemVerdicts) {
        const vs = Object.entries(r.itemVerdicts);
        const rjs = vs.filter(([, v]) => v.verdict === 'reject');
        const names = rjs.map(([k]) => r.requirementSnapshot.items.find((i) => i.key === k)?.name ?? k);
        return { label: '按项驳回', text: `${rjs.length} 项被驳回（${names.join('、')}），其余 ${vs.length - rjs.length} 项通过；修改后可在原任务上重新提交` };
      }
      const t = String(r.rejectionReason ?? '');
      return t ? { label: '驳回原因', text: t } : null;
    }
    const conf = REASON_FIELD[r.status];
    if (!conf) return null;
    const text = String(r[conf.field] ?? '');
    return text ? { label: conf.label, text } : null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="提交记录" description="按药厂查看本企业收到与提交过的准入任务及审核结果；详情为任务时点的清单快照。" dataRange="本企业" />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {shown.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="暂无待处理的药厂准入任务"
            description="暂无待处理的药厂准入任务，请联系合作药厂获取准入码。"
          />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
              <MetricCard compact title="合作药厂任务" value={new Set(shown.map((r) => r.pharmaTenantId)).size} icon={Building2} iconColor="#2F6BCE" iconBg="#EBF2FE" />
              <MetricCard compact title="在审" value={shown.filter((r) => ['待服务商提交', '审核中'].includes(r.status)).length} icon={Info} iconColor="#C77A16" iconBg="#FEF3E2" />
              <MetricCard compact title="已准入" value={shown.filter((r) => r.status === '已准入').length} icon={FileText} iconColor="#248A5A" iconBg="#E6F5ED" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sorted.map((r) => {
                const reason = reasonOf(r);
                const todo = r.status === '待服务商提交';
                const resubmit = r.status === '已驳回';
                return (
                  <div key={r.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 300 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--fs-15)', fontWeight: 700 }}>{r.pharmaName}</span>
                        <StatusTag status={r.status} />
                        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
                          {r.requirementSnapshot.templateName} <strong style={{ color: 'var(--color-brand)' }}>{r.templateVersion}</strong>
                        </span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>领取：<span style={{ fontFamily: mono }}>{r.claimedAt || '—'}</span></span>
                        {r.submittedAt && <span>最近提交：<span style={{ fontFamily: mono }}>{r.submittedAt}</span></span>}
                        {r.reviewedAt && <span>审核：{r.reviewedBy} · <span style={{ fontFamily: mono }}>{r.reviewedAt}</span></span>}
                        {r.status === '已准入' && <span style={{ color: '#248A5A' }}>有效期：{r.effectiveFrom} ~ {r.effectiveTo}</span>}
                      </div>
                      {reason && (
                        <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 560 }}>
                          {reason.label}：{reason.text}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => setDetailId(r.id)}>查看详情</Button>
                      {todo && (
                        <Button variant="primary" size="sm" onClick={() => resume(r)}>去提交材料</Button>
                      )}
                      {resubmit && (
                        <Button variant="primary" size="sm" onClick={() => resume(r)}>去修改重提</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 快照详情弹框（中心；服务商侧：核查项不可见） */}
      <Modal
        open={!!detail}
        title={detail ? `任务记录 · ${detail.pharmaName}` : ''}
        onClose={() => setDetailId(null)}
        width={760}
        footer={
          detail && (
            <>
              <Button variant="outline" onClick={() => setDetailId(null)}>关闭</Button>
              {detail.status === '待服务商提交' && (
                <Button variant="primary" onClick={() => { setDetailId(null); resume(detail); }}>去提交材料</Button>
              )}
              {detail.status === '已驳回' && (
                <Button variant="primary" onClick={() => { setDetailId(null); resume(detail); }}>去修改重提</Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusTag status={detail.status} />
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
                模板：<strong style={{ color: 'var(--color-brand)' }}>{detail.requirementSnapshot.templateName} {detail.templateVersion}</strong>
                {detail.submittedAt ? <> · 最近提交：<span style={{ fontFamily: mono }}>{detail.submittedAt}</span></> : null}
              </span>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 6, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
              <FileText size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                以下为<b>任务创建时点的材料清单快照</b>，药厂后续调整模板不影响本任务。
              </span>
            </div>

            {(() => {
              if (detail.status === '已驳回') {
                const vs = Object.values(detail.itemVerdicts ?? {});
                if (vs.length > 0) {
                  const rj = vs.filter((v) => v.verdict === 'reject').length;
                  return (
                    <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#C73A3A', marginBottom: 4 }}>
                        审核退回修改 · {rj} 项被驳回
                      </div>
                      <div style={{ fontSize: 'var(--fs-13)', color: '#C73A3A', lineHeight: 1.7 }}>
                        请在「准入任务」中按各项红字原因修改被驳回项后重新提交；其余 {vs.length - rj} 项已通过、无需重传。
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 8, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#374151', marginBottom: 4 }}>已驳回</div>
                    <div style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>驳回原因：<strong>{detail.rejectionReason ?? '—'}</strong>；如需继续准入，可修改材料后在原任务上重新提交。</div>
                  </div>
                );
              }
              const reason = detail ? reasonOf(detail) : null;
              if (!reason) return null;
              return (
                <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 8, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    {detail.status} · 材料提交已关闭
                  </div>
                  <div style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>{reason.label}：<strong>{reason.text}</strong></div>
                </div>
              );
            })()}
            {detail.status === '审核中' && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#EBF2FE', border: '1px solid #C9DDF7', fontSize: 'var(--fs-13)', color: '#2F6BCE' }}>
                材料已提交，等待{detail.pharmaName}审核。
              </div>
            )}
            {detail.status === '已准入' && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#E6F5ED', border: '1px solid #C8E9D6', fontSize: 'var(--fs-13)', color: '#248A5A' }}>
                已于 {detail.approvedAt} 由 {detail.reviewedBy} 审核通过并准入生效，有效期 {detail.effectiveFrom} ~ {detail.effectiveTo}。
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {detail.submittedAt ? (
                <SnapshotItemsView
                  snapshot={detail.requirementSnapshot}
                  attachments={detail.attachments}
                  responses={detail.itemResponses}
                  filterChecklist
                  licenseData={detail}
                  onToast={addToast}
                />
              ) : (
                <EmptyState icon={FileText} title="尚未提交材料" description="该任务在药厂撤回前您未提交材料。" />
              )}
              <div>
                <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>处理历史</div>
                <HistoryTimeline history={detail.history} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
