/**
 * 业务授权（药厂侧，原「品种授权」归位扩展）：药厂向服务商授予
 * 品种 / 项目 / 区域等业务服务资格（企业间授权）。
 * 列表与表单按独立字段呈现：服务提供方 / 药品上市许可持有人（本厂，只读）/
 * 授权内容（资格类型）/ 品种名称 / 授权区域 / 授权状态 / 生效期。
 * 只有合作关系生效时可新增或撤销授权（模型层兜底 + 按钮禁用双保险）；
 * 撤销与生效期到期即时影响服务商全员（员工授权无法绕过）。
 * 服务商员工的实际处理范围由服务商在「角色与数据范围 · 已授权成员」授予（只收窄）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StatusTag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  authorizationsOfRelationship,
  businessAuthKindLabel,
  businessAuthRuntimeStatus,
  businessAuthStatusLabel,
  relationshipsOfPharma,
  subscribeCooperation,
  tenantNameOf,
  grantBusinessAuth,
  revokeBusinessAuth,
  type BusinessAuthKind,
  type BusinessAuthorization,
} from '../data/cooperationModel';
import { REGION_SCOPE_OPTIONS, VARIETY_OPTIONS } from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  /** 从合作关系页「查看授权」跳转时预选的服务商租户 id */
  focusProviderTenantId?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function BusinessAuthorization({ addToast, focusProviderTenantId }: Props) {
  const store = usePermission();
  const { principal, can, previewReadOnly, logAudit } = store;
  const pharmaTenantId = principal.realm === 'TENANT' ? principal.tenantId : '';
  const pharmaName = principal.realm === 'TENANT' ? principal.tenantName : '';

  // 合作数据修订号进 memo 依赖：合作状态变化后左栏徽标实时刷新
  const [coopRev, bump] = useState(0);
  useEffect(() => subscribeCooperation(() => bump(x => x + 1)), []);

  const rels = useMemo(() => {
    void coopRev;
    return relationshipsOfPharma(pharmaTenantId);
  }, [pharmaTenantId, coopRev]);
  const canEdit = can('variety-auth', 'create') && !previewReadOnly;

  const [grant, setGrant] = useState<{ relationshipId: string; providerName: string; kind: BusinessAuthKind; items: string[]; lineRegions: string[]; effectiveFrom: string; effectiveTo: string; reason: string; error: string } | null>(null);
  const [revoke, setRevoke] = useState<{ authId: string; label: string; reason: string; error: string } | null>(null);
  const [selectedRel, setSelectedRel] = useState<string>(
    focusProviderTenantId ? rels.find(r => r.providerTenantId === focusProviderTenantId)?.id ?? '' : '',
  );
  const [expanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');

  function itemOptions(kind: BusinessAuthKind) {
    if (kind === 'variety') return VARIETY_OPTIONS;
    if (kind === 'region') return REGION_SCOPE_OPTIONS;
    return ["百益陕西推广项目", "华康甘肃试点项目", "Q2 科室会", "新增合作试点"];
  }

  function toggleItem(id: string, next: boolean) {
    if (!grant) return;
    setGrant({ ...grant, items: next ? [...new Set([...grant.items, id])] : grant.items.filter(x => x !== id), error: '' });
  }

  function toggleLineRegion(region: string, next: boolean) {
    if (!grant) return;
    setGrant({ ...grant, lineRegions: next ? [...new Set([...grant.lineRegions, region])] : grant.lineRegions.filter(x => x !== region), error: '' });
  }

  function submitGrant() {
    if (!grant) return;
    if (grant.items.length === 0) return setGrant({ ...grant, error: '请选择至少一项授权内容' });
    if (!grant.reason.trim()) return setGrant({ ...grant, error: '请填写授予原因' });
    const result = grantBusinessAuth({
      relationshipId: grant.relationshipId,
      kind: grant.kind,
      items: grant.items,
      lineRegions: grant.lineRegions,
      effectiveFrom: grant.effectiveFrom || undefined,
      effectiveTo: grant.effectiveTo || undefined,
      reason: grant.reason.trim(),
      actor: principal.name,
    });
    if (!result.ok) return setGrant({ ...grant, error: result.error || '授权失败' });
    for (const a of result.audits) {
      logAudit({ module: '业务授权', action: '授予业务资格', target: a.target, resource: 'variety-auth.create', reason: a.detail ?? grant.reason.trim() });
    }
    addToast({ type: 'success', title: '业务授权已生效', description: `${grant.providerName} · ${businessAuthKindLabel(grant.kind)}：${grant.items.join('、')}` });
    setGrant(null);
  }

  function submitRevoke() {
    if (!revoke) return;
    if (!revoke.reason.trim()) return setRevoke({ ...revoke, error: '请填写撤销原因' });
    const result = revokeBusinessAuth(revoke.authId, revoke.reason.trim(), principal.name);
    if (!result.ok) return setRevoke({ ...revoke, error: result.error || '撤销失败' });
    for (const a of result.audits) {
      logAudit({ module: '业务授权', action: '撤销业务资格', target: a.target, resource: 'variety-auth.delete', reason: a.detail ?? revoke.reason.trim() });
    }
    addToast({ type: 'success', title: '业务授权已撤销', description: '服务商全员对应业务即时不可操作；历史记录保留。' });
    setRevoke(null);
  }

  const activeRel = rels.find(r => r.id === selectedRel) ?? rels[0];
  const relAuths = activeRel ? authorizationsOfRelationship(activeRel.id) : [];
  // 合作关系生效才允许新增 / 撤销授权（模型层兜底 + UI 禁用）
  const relActive = activeRel?.status === 'active';

  // 搜索：按品种名称 / 授权区域 / 授权内容 / 状态 / 服务提供方独立字段检索
  const filteredAuths = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return relAuths;
    return relAuths.filter((a) => {
      const varietyText = a.kind === 'variety' ? a.items.join(' ') : '';
      const regionText = [...(a.lineRegions ?? []), ...(a.kind === 'region' ? a.items : [])].join(' ');
      const contentText = `${businessAuthKindLabel(a.kind)} ${a.kind === 'project' ? a.items.join(' ') : ''}`;
      const statusText = businessAuthStatusLabel(businessAuthRuntimeStatus(a));
      const providerText = activeRel ? tenantNameOf(activeRel.providerTenantId) : '';
      return [varietyText, regionText, contentText, statusText, providerText].some((t) => t.toLowerCase().includes(q));
    });
  }, [relAuths, query, activeRel]);

  /** 授权行的派生区域展示：品种行级区域，缺省回退关系级区域授权 */
  const authRegionsOf = (a: BusinessAuthorization, relRegions: string[]): string[] => {
    if (a.kind === 'region') return a.items;
    if (a.kind === 'variety') return a.lineRegions && a.lineRegions.length > 0 ? a.lineRegions : relRegions;
    return [];
  };

  const relRegions = activeRel ? authorizationsOfRelationship(activeRel.id).filter(x => x.kind === 'region' && businessAuthRuntimeStatus(x) === 'active').flatMap(x => x.items) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="业务授权"
        description={`向与本药厂（${pharmaName}）合作的服务商授予品种 / 项目 / 区域等业务服务资格。`}
        actions={activeRel && canEdit ? (
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            disabled={!relActive}
            title={relActive ? undefined : '合作关系未生效，仅有效合作关系可授予业务授权'}
            onClick={() => setGrant({ relationshipId: activeRel.id, providerName: tenantNameOf(activeRel.providerTenantId), kind: 'variety', items: [], lineRegions: [], effectiveFrom: todayIso(), effectiveTo: '', reason: '', error: '' })}
          >
            新建授权
          </Button>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <InfoBanner>本药厂对服务商的企业间授权，与服务商内部对员工的授权相互独立：服务商为员工授予时，只能在本页已授范围内收窄。仅合作关系生效时可新增或撤销授权。</InfoBanner>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* 左：合作服务商选择 */}
          <div style={{ width: 240, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>合作服务商</div>
            {rels.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>暂无合作服务商</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {rels.map(rel => (
                  <button key={rel.id} type="button" onClick={() => { setSelectedRel(rel.id); setQuery(''); void expanded; }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', textAlign: 'left',
                      border: `1px solid ${rel.id === activeRel?.id ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      background: rel.id === activeRel?.id ? 'var(--color-brand-subtle)' : '#fff',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenantNameOf(rel.providerTenantId)}</span>
                    {rel.status !== 'active' && <span style={{ fontSize: 'var(--fs-11)', color: rel.status === 'terminated' ? '#6B7280' : '#C77A16', flexShrink: 0 }}>{rel.status === 'terminated' ? '已终止' : '已暂停'}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 右：授权清单（独立字段列） */}
          <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {!activeRel ? (
              <EmptyState title="请选择合作服务商" description="从左侧选择一个服务商查看与管理其业务授权。" />
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>{tenantNameOf(activeRel.providerTenantId)}</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>合作生效 {activeRel.effectiveFrom}</span>
                  {activeRel.status !== 'active' && <span style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>· 合作{activeRel.status === 'terminated' ? '已终止' : '已暂停'}，不能新增或撤销业务授权（仅有效合作关系可维护）</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 8, color: '#9CA3AF' }} aria-hidden />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="搜索品种 / 区域 / 状态…"
                      aria-label="搜索业务授权"
                      style={{ ...inputStyle, paddingLeft: 28, width: 220 }}
                    />
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
                    <thead>
                      <tr>{['服务提供方', '上市许可持有人', '授权内容', '品种名称', '授权区域', '授权状态', '生效期', '授予人 · 时间', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredAuths.length === 0 ? (
                        <tr><td colSpan={9} style={{ padding: 0 }}><EmptyState title={query ? '没有匹配的授权记录' : '尚无业务授权'} description={query ? '调整搜索条件后重试。' : '点击右上角「新建授权」向该服务商授予资格。'} /></td></tr>
                      ) : (
                        filteredAuths.map(a => {
                          const runtime = businessAuthRuntimeStatus(a);
                          const regions = authRegionsOf(a, relRegions);
                          return (
                            <tr key={a.id}>
                              <td style={tdStyle}>{tenantNameOf(activeRel.providerTenantId)}</td>
                              <td style={tdStyle}>{pharmaName}</td>
                              <td style={tdStyle}>{businessAuthKindLabel(a.kind)}</td>
                              <td style={tdStyle}>{a.kind === 'variety' ? a.items.join('、') : '—'}</td>
                              <td style={{ ...tdStyle, color: regions.length ? undefined : '#9CA3AF' }}>{regions.length ? regions.join('、') : '不限'}</td>
                              <td style={tdStyle}><StatusTag status={businessAuthStatusLabel(runtime)} size="sm" /></td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 'var(--fs-12)', fontFamily: "'JetBrains Mono', monospace" }}>
                                {a.effectiveFrom ?? a.grantedAt.slice(0, 10)} ~ {a.effectiveTo ?? '长期'}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 'var(--fs-12)' }}>
                                {a.grantedBy} · {a.grantedAt}
                                {runtime === 'revoked' && <div style={{ color: '#C73A3A' }}>{a.revokedBy} 撤销：{a.reason}</div>}
                              </td>
                              <td style={tdStyle}>
                                {canEdit && runtime === 'active' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<Trash2 size={13} />}
                                    disabled={!relActive}
                                    title={relActive ? undefined : '合作关系未生效，不能撤销业务授权'}
                                    onClick={() => setRevoke({ authId: a.id, label: `${businessAuthKindLabel(a.kind)}：${a.items.join('、')}`, reason: '', error: '' })}
                                  >
                                    撤销
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 新建授权 */}
      {grant && (
        <Modal open title="新建业务授权" onClose={() => setGrant(null)} width={620}
          footer={<><Button variant="outline" onClick={() => setGrant(null)}>取消</Button><Button variant="primary" onClick={submitGrant}>确认授予</Button></>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {grant.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{grant.error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="服务提供方"><div style={{ ...inputStyle, background: '#F9FAFB' }}>{grant.providerName}</div></Field>
              <Field label="药品上市许可持有人"><div style={{ ...inputStyle, background: '#F9FAFB' }}>{pharmaName}</div></Field>
            </div>
            <Field label="授权内容" required>
              <select value={grant.kind} onChange={e => setGrant({ ...grant, kind: e.target.value as BusinessAuthKind, items: [], lineRegions: [] })} style={inputStyle}>
                <option value="variety">品种</option>
                <option value="project">项目</option>
                <option value="region">区域</option>
              </select>
            </Field>
            <Field label={grant.kind === 'variety' ? '品种名称' : '授权内容明细'} required hint="可多选">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {itemOptions(grant.kind).map(opt => (
                  <button key={opt} type="button" onClick={() => toggleItem(opt, !grant.items.includes(opt))}
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 'var(--fs-12)', cursor: 'pointer',
                      border: `1px solid ${grant.items.includes(opt) ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      background: grant.items.includes(opt) ? 'var(--color-brand-subtle)' : '#fff',
                      color: grant.items.includes(opt) ? 'var(--color-brand)' : '#374151',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>
            {grant.kind === 'variety' && (
              <Field label="授权区域" hint="不选 = 回退该关系区域授权；区域只在药厂侧授权时配置，服务商只读派生">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {REGION_SCOPE_OPTIONS.map(region => (
                    <button key={region} type="button" onClick={() => toggleLineRegion(region, !grant.lineRegions.includes(region))}
                      style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 'var(--fs-12)', cursor: 'pointer',
                        border: `1px solid ${grant.lineRegions.includes(region) ? 'var(--color-brand)' : 'var(--color-border)'}`,
                        background: grant.lineRegions.includes(region) ? 'var(--color-brand-subtle)' : '#fff',
                        color: grant.lineRegions.includes(region) ? 'var(--color-brand)' : '#374151',
                      }}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="生效日期" required>
                <input type="date" value={grant.effectiveFrom} onChange={e => setGrant({ ...grant, effectiveFrom: e.target.value, error: '' })} style={inputStyle} />
              </Field>
              <Field label="失效日期" hint="留空 = 长期有效">
                <input type="date" value={grant.effectiveTo} onChange={e => setGrant({ ...grant, effectiveTo: e.target.value, error: '' })} style={inputStyle} />
              </Field>
            </div>
            <Field label="授予原因" required>
              <input value={grant.reason} onChange={e => setGrant({ ...grant, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：2026 H2 陕西区域推广合作" />
            </Field>
          </div>
        </Modal>
      )}

      {/* 撤销 */}
      {revoke && (
        <Modal open title="撤销业务授权" onClose={() => setRevoke(null)} width={520}
          footer={<><Button variant="outline" onClick={() => setRevoke(null)}>取消</Button><Button variant="danger" onClick={submitRevoke}>确认撤销</Button></>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {revoke.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{revoke.error}</div>}
            <div style={{ fontSize: 'var(--fs-13)' }}><span style={{ color: '#9CA3AF' }}>撤销内容 </span><strong>{revoke.label}</strong></div>
            <InfoBanner tone="warning">撤销后该服务商全员对应业务即时不可操作（员工授权无法绕过药厂授权）。历史记录保留可查。</InfoBanner>
            <Field label="撤销原因" required>
              <input value={revoke.reason} onChange={e => setRevoke({ ...revoke, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：合作范围调整" />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
