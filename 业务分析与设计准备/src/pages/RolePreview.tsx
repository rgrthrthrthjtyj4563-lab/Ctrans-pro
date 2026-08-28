import { useMemo, useState } from 'react';
import { Eye, LayoutDashboard, Lock } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  RESOURCE_PAGES,
  SENSITIVE_FIELDS,
  fieldPolicyLabel,
  pageHasAction,
  scopeLabel,
  visiblePageIds,
} from '../data/permissions';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';
import type { ToastMessage } from '../components/Toast';
import type { NavigateFn } from '../types';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate: NavigateFn;
}

export function RolePreview({ addToast, navigate }: Props) {
  const store = usePermission();
  const { roles, orgs, users, preview, startPreview, exitPreview } = store;
  const [roleId, setRoleId] = useState(preview?.roleId ?? roles.find(r => r.status === 'enabled')?.id ?? '');
  const [orgId, setOrgId] = useState(preview?.orgId ?? 'org-pharma');
  const [userId, setUserId] = useState(preview?.userId ?? '');

  const role = roles.find(r => r.id === roleId);
  const org = orgs.find(o => o.id === orgId);
  const user = users.find(u => u.id === userId);
  const pages = useMemo(() => (role ? visiblePageIds(role) : []), [role]);
  const pageRows = RESOURCE_PAGES.filter(p => pages.includes(p.id));

  function launch() {
    if (!roleId || !orgId) {
      addToast({ type: 'error', title: '请选择角色和组织' });
      return;
    }
    startPreview({ roleId, orgId, userId: userId || undefined });
    addToast({ type: 'info', title: '已进入预览模式', description: '写操作、导出和附件下载已禁用' });
    navigate('dashboard');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="角色预览"
        description="选择角色 + 组织 + 可选用户，进入只读预览。用于验收菜单、按钮和脱敏，不会产生业务写入。"
        actions={
          preview ? (
            <Button variant="outline" size="md" onClick={() => { exitPreview(); addToast({ type: 'info', title: '已退出预览' }); }}>
              退出当前预览
            </Button>
          ) : (
            <Button variant="primary" size="md" icon={<Eye size={14} />} onClick={launch}>进入只读预览</Button>
          )
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <InfoBanner tone="warning">
            预览期间顶部将固定显示橙色横幅。禁止写操作、导出、附件下载和对外调用；所有进入/退出将写入权限审计。
          </InfoBanner>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
            <Field label="模拟角色" required>
              <select value={roleId} onChange={e => setRoleId(e.target.value)} style={inputStyle}>
                {roles.filter(r => r.status !== 'disabled').map(r => (
                  <option key={r.id} value={r.id}>{r.name}（{r.kind === 'preset' ? '预置' : '定制'}）</option>
                ))}
              </select>
            </Field>
            <Field label="当前组织" required>
              <select value={orgId} onChange={e => setOrgId(e.target.value)} style={inputStyle}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="可选用户" hint="不选则只按角色预览">
              <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
                <option value="">不指定用户</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.orgName}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {role && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <LayoutDashboard size={15} style={{ color: 'var(--color-brand)' }} />
                <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>将看到的菜单与按钮</span>
                <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{pageRows.length} 个页面</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>页面</th>
                    <th style={thStyle}>可执行操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p, idx) => (
                    <tr key={p.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{p.module}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {p.actions.filter(a => pageHasAction(role, p.id, a.key)).map(a => (
                            <Tag key={a.key} label={a.label} color={a.risk ? 'warning' : 'brand'} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, marginBottom: 10 }}>预览上下文</div>
                <KV label="角色" value={role.name} />
                <KV label="类型" value={role.kind === 'preset' ? '预置' : '定制'} />
                <KV label="数据范围" value={scopeLabel(role.defaultScope)} />
                <KV label="组织" value={org?.name ?? '—'} />
                <KV label="用户" value={user ? `${user.name}（${user.account}）` : '未指定'} />
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#C77A16' }}>
                  <Lock size={13} /> 预览会话禁止写操作与导出
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--fs-14)', fontWeight: 600 }}>
                  敏感字段展示
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {SENSITIVE_FIELDS.map(f => {
                      const policy = role.fieldPolicies[f.key] ?? 'visible';
                      return (
                        <tr key={f.key}>
                          <td style={tdStyle}>{f.name}</td>
                          <td style={tdStyle}>
                            <Tag
                              label={fieldPolicyLabel(policy)}
                              color={policy === 'hidden' ? 'danger' : policy === 'mask' ? 'warning' : 'success'}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 'var(--fs-13)', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ color: '#9CA3AF' }}>{label}</span>
      <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
