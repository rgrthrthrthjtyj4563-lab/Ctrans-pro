/**
 * 工作组管理（仅服务商）—— 任务承接配置页（2026-09-15 拍板）。
 *
 * 唯一职责：指定/变更工作组组长、展示任务承接状态、提示异常与变更记录。
 * 禁止承担：新建第二套工作组（在「组织架构」建组）、维护成员归属（组织架构/用户管理）、
 * 配置跨企业合作关系（药厂侧）。工作组与药厂品种的可处理范围来自成员被授予的
 * 角色与数据范围（「角色与数据范围 · 已授权成员」），本页不配置。
 *
 * 组长规则：每个有效工作组仅一名有效组长（属于本组 ∧ 账号启用 ∧ 持有生效
 * 「工作组组长」角色）；组长失效时显示「待指定组长」，该组禁止接收新的管理任务。
 */
import { useEffect, useMemo, useState } from 'react';
import { UserCheck, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import { identityLabel, orgChildren, orgPathLabel, resolveGroupLeader } from '../data/permissions';
import { membershipOfUserInTenant, membershipsOfTenant, subscribeTenantMemberships } from '../data/cooperationModel';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

export function WorkGroupManage({ addToast }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, principal, can, previewReadOnly, groupLeaders, groupLeaderChanges, setGroupLeader } = store;
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : '';
  const providerRoot = orgs.find(o => o.id === tenantRootId);
  const isProvider = principal.realm === 'TENANT' && principal.tenantKind === 'provider';

  // 成员身份实时联动（调岗/建档即时刷新组长有效性）
  const [, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);

  const canEdit = can('workgroup-manage', 'edit') && !previewReadOnly;

  const groups = useMemo(
    () => orgChildren(orgs, tenantRootId).filter(o => o.type === 'group'),
    [orgs, tenantRootId],
  );

  const memberships = useMemo(() => membershipsOfTenant(tenantRootId), [tenantRootId]);

  /** 组长有效性：实时派生（不属于本组/停用/角色回收 → 待指定组长） */
  const leaderOf = (groupId: string) =>
    resolveGroupLeader(groupId, groupLeaders[groupId], {
      users,
      assignments,
      memberships,
      tenantId: tenantRootId,
    });

  /** 组内成员名单（按成员身份 orgUnit，不读 User 主档） */
  const membersOf = (groupId: string) =>
    memberships
      .filter(m => m.orgUnitId === groupId)
      .map(m => users.find(u => u.id === m.userId))
      .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const [appoint, setAppoint] = useState<{ groupId: string; groupName: string; userId: string; reason: string; error: string } | null>(null);

  function submitAppoint() {
    if (!appoint) return;
    if (!appoint.userId) {
      setAppoint({ ...appoint, error: '请选择本组成员' });
      return;
    }
    const result = setGroupLeader({
      groupId: appoint.groupId,
      groupName: appoint.groupName,
      userId: appoint.userId,
      reason: appoint.reason,
    });
    if (!result.ok) {
      setAppoint({ ...appoint, error: result.error || '保存失败' });
      return;
    }
    const name = users.find(u => u.id === appoint.userId)?.name ?? '';
    addToast({
      type: 'success',
      title: groupLeaders[appoint.groupId] ? '组长已变更' : '组长已指定',
      description: `${appoint.groupName} · ${identityLabel('工作组组长', appoint.groupName)} = ${name}；历史任务与审计记录保留。`,
    });
    setAppoint(null);
  }

  const changes = groupLeaderChanges.filter(c => c.groupId && groups.some(g => g.id === c.groupId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="工作组管理"
        description={`「${providerRoot?.name ?? '本服务商'}」工作组的组长指定与任务承接状态。工作组的建立、成员归属与调整在「组织架构」维护；可处理药厂/品种范围在「角色与数据范围」按成员授予。`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <InfoBanner>
            每个工作组仅一名有效组长：组长必须属于本组、账号启用并持有生效「工作组组长」角色；
            组长失效时该组显示「待指定组长」并<b>禁止接收新的管理任务</b>（历史任务与审计保留）。
            服务商管理员向工作组下派管理任务后，任务默认由组长承接，再由组长分派给服务专员。
          </InfoBanner>
        </div>
        {!isProvider ? (
          <EmptyState title="仅服务商使用工作组" description="药厂与系统管理后台没有工作组概念。" />
        ) : groups.length === 0 ? (
          <EmptyState title="尚无工作组" description="请在「组织架构」的服务商根节点下新建工作组，再回到本页指定组长。" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
            {groups.map(g => {
              const members = membersOf(g.id);
              const leader = leaderOf(g.id);
              const leaderOk = leader.status === 'valid';
              return (
                <div key={g.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600, flex: 1 }}>{g.name}</span>
                    <Tag label="工作组" color="brand" />
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>{orgPathLabel(orgs, g.id)}</div>

                  {/* 组长区（身份展示统一格式） */}
                  <div
                    style={{
                      border: `1px solid ${leaderOk ? '#E6F5ED' : '#FDE68A'}`,
                      background: leaderOk ? '#F6FCF8' : '#FEF9EE',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <UserCheck size={13} aria-hidden style={{ color: leaderOk ? '#248A5A' : '#C77A16' }} />
                      {leader.status === 'valid' ? (
                        <>
                          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{identityLabel('工作组组长', g.name)}</span>
                          <span style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>= {leader.userName}</span>
                          <StatusTag status="组长有效" size="sm" />
                        </>
                      ) : leader.status === 'none' ? (
                        <>
                          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: '#C77A16' }}>待指定组长</span>
                          <StatusTag status="待指定组长" size="sm" />
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: '#C77A16' }}>待指定组长</span>
                          <StatusTag status="组长失效" size="sm" />
                          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>（原组长 {leader.userName} · {leader.reason}）</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 承接状态 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)' }}>
                    {leaderOk ? (
                      <span style={{ color: '#248A5A' }}>● 可承接管理任务：新任务默认进入组长「{leader.userName}」待办，由组长分派给服务专员</span>
                    ) : (
                      <span style={{ color: '#C77A16' }}>● 禁止下派新的管理任务：该工作组尚未配置有效组长（任务下派控件将禁用并提示）</span>
                    )}
                  </div>

                  {/* 成员名单（只读；归属在组织架构/用户管理维护） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#374151' }}>
                    <Users size={13} /> {members.length} 名成员
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.6 }}>
                    {members.length === 0
                      ? '（暂无成员，请在「组织架构」调整成员归属）'
                      : members.map(m => m.name).join('、')}
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAppoint({ groupId: g.id, groupName: g.name, userId: '', reason: '', error: '' })}
                      >
                        {groupLeaders[g.id] ? '更换组长' : '指定组长'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 组长变更记录（历史任务与审计不因组长变更删除） */}
        {isProvider && changes.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>
              组长变更记录（本地模拟审计 · 保留操作者、时间与原因）
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['时间', '工作组', '操作者', '摘要'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {changes.map((c, idx) => (
                  <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{c.at}</td>
                    <td style={tdStyle}>{c.groupName}</td>
                    <td style={tdStyle}>{c.actor}</td>
                    <td style={tdStyle}>{c.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 指定/更换组长 */}
      {appoint && (
        <Modal open title={groupLeaders[appoint.groupId] ? `更换组长 · ${appoint.groupName}` : `指定组长 · ${appoint.groupName}`} onClose={() => setAppoint(null)} width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setAppoint(null)}>取消</Button>
              <Button variant="primary" onClick={submitAppoint}>确认{groupLeaders[appoint.groupId] ? '变更' : '指定'}</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              组长必须属于「{appoint.groupName}」、账号启用并持有生效「工作组组长」角色；
              未持有角色的成员请先在「角色与数据范围 · 已授权成员」页签为TA授予该角色。
            </InfoBanner>
            {appoint.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{appoint.error}</div>}
            <Field label="组长（从本组成员中选择）" required>
              <select value={appoint.userId} onChange={e => setAppoint({ ...appoint, userId: e.target.value, error: '' })} style={inputStyle}>
                <option value="">选择本组成员</option>
                {membersOf(appoint.groupId).map(m => {
                  const today = new Date().toISOString().slice(0, 10);
                  const hasLeadRole = assignments.some(
                    a => a.userId === m.id && a.tenantId === tenantRootId && a.roleId === 'role-group-lead' && a.status === 'active' && a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today),
                  );
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.account}{hasLeadRole ? '（持工作组组长角色）' : '（未持工作组组长角色）'}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="变更原因" required hint="随本地审计记录保留">
              <input value={appoint.reason} onChange={e => setAppoint({ ...appoint, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：原组长调岗，由新任组长承接" />
            </Field>
            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
              变更后：已有历史任务与审计记录保留；新组长仅承接变更后的待办与新任务。
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
