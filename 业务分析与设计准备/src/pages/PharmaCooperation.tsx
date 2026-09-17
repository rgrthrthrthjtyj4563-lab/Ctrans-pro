/**
 * 合作关系（药厂侧）：本药厂与各服务商的合作关系台账与生命周期控制。
 * 只负责合作语义（生效/暂停/恢复/终止）；品种/项目/区域资格在「业务授权」。
 * 暂停/终止由药厂控制，实时影响服务商全员可进入范围（员工授权无法绕过）。
 * 数据源 = cooperationModel（服务商准入通过后的合作生效记录 + 软件服务方运行时建租户）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Eye, Pause, Play, ShieldX } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  activeAuthSummaryOfRelationship,
  relationshipStatusLabel,
  subscribeCooperation,
  relationshipsOfPharma,
  pauseRelationship,
  resumeRelationship,
  terminateRelationship,
  tenantNameOf,
} from '../data/cooperationModel';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  /** 「查看授权」跳转业务授权页并预选该服务商（业务授权是产品/区域唯一维护入口） */
  onOpenAuthorization?: (providerTenantId: string) => void;
}

export function PharmaCooperation({ addToast, onOpenAuthorization }: Props) {
  const store = usePermission();
  const { principal, can, previewReadOnly, logAudit } = store;
  const pharmaTenantId = principal.realm === 'TENANT' ? principal.tenantId : '';
  const pharmaName = principal.realm === 'TENANT' ? principal.tenantName : '';

  // 合作数据修订号进 memo 依赖：暂停/恢复/终止后列表实时刷新（bump 只触发重渲染不够）
  const [coopRev, bump] = useState(0);
  useEffect(() => subscribeCooperation(() => bump(x => x + 1)), []);

  const rows = useMemo(() => {
    void coopRev;
    return relationshipsOfPharma(pharmaTenantId);
  }, [pharmaTenantId, coopRev]);
  const canEdit = can('pharma-cooperation', 'edit') && !previewReadOnly;
  const canApprove = can('pharma-cooperation', 'approve') && !previewReadOnly;

  const [op, setOp] = useState<{ kind: 'pause' | 'resume' | 'terminate'; relId: string; providerName: string; reason: string; error: string } | null>(null);

  function submitOp() {
    if (!op) return;
    if (!op.reason.trim()) {
      setOp({ ...op, error: '请填写原因（对外展示文案）' });
      return;
    }
    const actor = principal.name;
    const result = op.kind === 'pause'
      ? pauseRelationship(op.relId, op.reason.trim(), actor)
      : op.kind === 'resume'
        ? resumeRelationship(op.relId, op.reason.trim(), actor)
        : terminateRelationship(op.relId, op.reason.trim(), actor);
    if (!result.ok) {
      setOp({ ...op, error: result.error || '操作失败' });
      return;
    }
    for (const a of result.audits) {
      logAudit({ module: '合作关系', action: { pause: '暂停合作', resume: '恢复合作', terminate: '终止合作' }[op.kind], target: a.target, resource: `cooperation.${op.kind}`, reason: a.detail ?? op.reason.trim() });
    }
    addToast({ type: 'success', title: '合作关系已更新', description: `${op.providerName} · ${result.audits[0]?.reasonCode ?? ''}` });
    setOp(null);
  }

  const statusTone = (s: string) => (s === 'active' ? 'success' : s === 'paused' ? 'warning' : 'danger');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="合作关系"
        description={`管理「${pharmaName}」与各服务商的合作生命周期。业务资格（品种/项目/区域）在「业务授权」维护。`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <InfoBanner>暂停/终止即时生效：该服务商全员（含已授权员工）立即不能再进入本药厂业务；恢复后按员工授权与业务授权当前状态重算。</InfoBanner>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <EmptyState title="暂无合作关系" description="服务商通过「服务商准入」审核合作后进入本台账。" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                <thead>
                  <tr>{['服务商', '合作状态', '合作生效', '业务授权摘要', '暂停/终止说明', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(rel => {
                    const providerName = tenantNameOf(rel.providerTenantId);
                    const sum = activeAuthSummaryOfRelationship(rel.id);
                    return (
                      <tr key={rel.id}>
                        <td style={tdStyle}><div style={{ fontWeight: 600 }}>{providerName}</div><div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{rel.id}</div></td>
                        <td style={tdStyle}><StatusTag status={relationshipStatusLabel(rel.status)} size="sm" /></td>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{rel.effectiveFrom}</td>
                        <td style={tdStyle}>
                          <div style={{ fontSize: 'var(--fs-12)' }}>已授权产品 {sum.varieties.length} 个</div>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>授权区域 {sum.regions.length} 个</div>
                          {onOpenAuthorization && (
                            <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => onOpenAuthorization(rel.providerTenantId)}>查看授权</Button>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {rel.status === 'paused' && <span style={{ color: '#C77A16' }}>{rel.pausedAt} · {rel.pausedReason}</span>}
                          {rel.status === 'terminated' && <span style={{ color: '#C73A3A' }}>{rel.terminatedAt} · {rel.terminatedReason}</span>}
                          {rel.status === 'active' && <span style={{ color: '#9CA3AF' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {canApprove && rel.status === 'active' && (
                              <Button variant="ghost" size="sm" icon={<Pause size={13} />} onClick={() => setOp({ kind: 'pause', relId: rel.id, providerName, reason: '', error: '' })}>暂停</Button>
                            )}
                            {canApprove && rel.status === 'paused' && (
                              <Button variant="ghost" size="sm" icon={<Play size={13} />} onClick={() => setOp({ kind: 'resume', relId: rel.id, providerName, reason: '', error: '' })}>恢复</Button>
                            )}
                            {canEdit && rel.status !== 'terminated' && (
                              <Button variant="ghost" size="sm" icon={<ShieldX size={13} />} onClick={() => setOp({ kind: 'terminate', relId: rel.id, providerName, reason: '', error: '' })}>终止</Button>
                            )}
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
      </div>

      {op && (
        <Modal open title={{ pause: '暂停合作', resume: '恢复合作', terminate: '终止合作' }[op.kind]} onClose={() => setOp(null)} width={520}
          footer={<><Button variant="outline" onClick={() => setOp(null)}>取消</Button><Button variant={op.kind === 'terminate' ? 'danger' : 'primary'} onClick={submitOp}>确认</Button></>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {op.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{op.error}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}><span style={{ color: '#9CA3AF' }}>服务商</span><strong>{op.providerName}</strong></div>
            <InfoBanner tone={op.kind === 'terminate' ? 'danger' : 'warning'}>
              {op.kind === 'terminate'
                ? '终止将同时撤销该关系下全部业务授权（历史记录保留）；如需恢复合作须重新走准入。'
                : op.kind === 'pause'
                  ? '暂停即时阻断该服务商全员进入本药厂业务，其当前会话在下一次请求时失效。'
                  : '恢复后仍需员工授权与业务授权均有效，员工才可进入。'}
            </InfoBanner>
            <Field label="原因" required hint="只填适合对外展示的文案（随操作审计保留）">
              <textarea value={op.reason} onChange={e => setOp({ ...op, reason: e.target.value, error: '' })} rows={2} style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }} placeholder="例如：合作协议待续签" />
            </Field>
            {op.kind !== 'pause' && <Tag label="操作人将记录为当前登录用户" color="default" />}
          </div>
        </Modal>
      )}
    </div>
  );
}
