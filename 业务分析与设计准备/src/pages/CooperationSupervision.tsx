/**
 * 合作关系监管（平台侧 · 只读）：跨租户的药厂—服务商合作关系与业务授权状态一览。
 * 平台只做监管与统计，不介入企业间授权决策；任何合作/授权操作都在药厂工作空间完成。
 */
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { StatusTag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  allRelationshipRows,
  relationshipStatusLabel,
  subscribeCooperation,
  type BusinessAuthStatus,
} from '../data/cooperationModel';
import type { ToastMessage } from '../components/Toast';
import { InfoBanner, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const AUTH_LABEL: Record<BusinessAuthStatus | 'none', string> = {
  active: '有效',
  revoked: '已撤销',
  expired: '已过期',
  none: '未授予',
};

export function CooperationSupervision({ addToast }: Props) {
  void addToast;
  const { principal } = usePermission();
  const [coopRev, bump] = useState(0);
  useEffect(() => subscribeCooperation(() => bump(x => x + 1)), []);
  const rows = useMemo(() => {
    void coopRev;
    return allRelationshipRows();
  }, [coopRev]);

  const active = rows.filter(r => r.relationship.status === 'active').length;
  const paused = rows.filter(r => r.relationship.status === 'paused').length;
  const revoked = rows.filter(r => r.varietyAuthStatus === 'revoked').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="合作关系监管"
        description={`平台只读监管各租户间的合作与业务授权状态（当前身份：${principal.realm === 'PLATFORM' ? principal.platformRoleName : principal.activeRoleName}）。操作权限归药厂工作空间。`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)' }}>共 <strong>{rows.length}</strong> 条合作</span>
          <span style={{ color: '#248A5A' }}>生效 {active}</span>
          <span style={{ color: '#C77A16' }}>暂停 {paused}</span>
          <span style={{ color: '#C73A3A' }}>业务授权撤销 {revoked}</span>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <EmptyState title="暂无合作记录" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['药厂', '服务商', '合作状态', '合作生效', '品种授权', '最近使用'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ relationship: r, pharmaName, providerName, varietyItems, varietyAuthStatus }) => (
                  <tr key={r.id}>
                    <td style={tdStyle}><div style={{ fontWeight: 600 }}>{pharmaName}</div></td>
                    <td style={tdStyle}>{providerName}</td>
                    <td style={tdStyle}><StatusTag status={relationshipStatusLabel(r.status)} size="sm" /></td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{r.effectiveFrom}</td>
                    <td style={tdStyle}>
                      {AUTH_LABEL[varietyAuthStatus]}
                      {varietyAuthStatus === 'active' && <span style={{ color: '#9CA3AF', fontSize: 'var(--fs-12)' }}> · {varietyItems.join('、')}</span>}
                      {varietyAuthStatus === 'revoked' && <span style={{ color: '#C73A3A', fontSize: 'var(--fs-12)' }}> · 药厂已收回</span>}
                    </td>
                    <td style={{ ...tdStyle, color: '#667085' }}>{r.lastUsedAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
          平台不修改合作状态与业务授权：如需暂停合作或收回授权，由对应药厂在其工作空间「合作关系 / 业务授权」操作。
        </div>
      </div>
    </div>
  );
}
