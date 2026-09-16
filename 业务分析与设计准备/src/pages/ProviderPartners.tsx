/**
 * 合作药厂与业务授权（服务商侧 · 只读）：2026-09-15 拍板将服务商侧
 * 原先分列的两个合作/授权菜单合并为本页。
 *
 * - 以药厂为主列表，一家药厂一行；合作状态与业务授权均由药厂控制，本页只读；
 * - 点击药厂打开详情，分「合作状态」「授权品种」「内部使用范围」三区；
 * - 授权品种展示：批准文号、适用科室、通用名、商品名、包装规格、单位、剂型、
 *   药品上市许可持有人（MAH）、授权区域（由药厂品种授权派生，只读）、授权状态、
 *   撤销/失效原因（仅对外标准文案）；
 * - 「内部使用范围」只读展示当前哪些成员/角色正在使用该药厂品种；配置入口在
 *   「角色与数据范围 · 已授权成员」。
 */
import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { StatusTag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  activeAuthSummaryOfRelationship,
  authorizationsOfRelationship,
  businessAuthKindLabel,
  businessAuthStatusLabel,
  relationshipsOfProvider,
  subscribeCooperation,
  tenantNameOf,
  type ProviderPharmaRelationship,
} from '../data/cooperationModel';
import { seedVarieties } from '../data/mockData';
import type { ToastMessage } from '../components/Toast';
import { InfoBanner, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

interface VarietyMeta {
  genericName: string
  tradeName: string
  approvalNo: string
  applicableDept: string
  packSpec: string
  unit: string
  dosageForm: string
  holder: string
}

/** 品种授权行 → 主数据字段（按通用名匹配；未建档品种给出占位） */
function varietyMeta(varietyName: string): VarietyMeta {
  const hit = seedVarieties.find(v => v.genericName === varietyName)
  return {
    genericName: hit?.genericName ?? varietyName,
    tradeName: hit?.tradeName ?? '—',
    approvalNo: hit?.approvalNo ?? '—',
    // 适用科室为正式展示名称；历史「通用科室」字段仅做兼容映射
    applicableDept: hit?.applicableDept ?? '—',
    packSpec: hit ? `${hit.spec} · ${hit.package}` : '—',
    unit: hit?.unit ?? '—',
    dosageForm: hit?.dosageForm ?? '—',
    holder: hit?.holder ?? '—',
  }
}

export function ProviderPartners({ addToast }: Props) {
  void addToast;
  const store = usePermission();
  const { principal, users, assignments, roles } = store;
  const providerTenantId = principal.realm === 'TENANT' ? principal.tenantId : '';
  const providerName = principal.realm === 'TENANT' ? principal.tenantName : '';

  const [coopRev, bump] = useState(0);
  useEffect(() => subscribeCooperation(() => bump(x => x + 1)), []);
  const rows = useMemo(() => {
    void coopRev;
    return relationshipsOfProvider(providerTenantId);
  }, [providerTenantId, coopRev]);

  const [detailRelId, setDetailRelId] = useState<string | null>(null);
  const detailRel = rows.find(r => r.id === detailRelId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="合作药厂与业务授权"
        description={`「${providerName}」与各药厂的合作状态、授权品种与内部使用范围（只读）。合作生效、暂停、终止与品种授权的授予/撤销均由药厂控制。`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <InfoBanner>
            一家药厂一行，点击查看合作状态、授权品种（批准文号 / 适用科室 / MAH / 派生授权区域等）与内部使用范围。
            员工可处理的药厂与品种，须在药厂授权范围内由「角色与数据范围 · 已授权成员」授予；授权被药厂撤销后对应业务全员即时不可操作。
          </InfoBanner>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <EmptyState title="暂无合作药厂" description="通过「准入申请」被药厂审核通过后，合作关系会自动建立并进入本清单。" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['合作药厂', '合作状态', '合作生效', '有效品种', '最近使用', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(rel => {
                  const sum = activeAuthSummaryOfRelationship(rel.id);
                  return (
                    <tr key={rel.id} style={{ cursor: 'pointer' }} onClick={() => setDetailRelId(rel.id)}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Building2 size={14} aria-hidden style={{ color: '#9CA3AF' }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{tenantNameOf(rel.pharmaTenantId)}</div>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>点击查看授权品种与内部使用范围</div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <StatusTag
                          status={rel.status === 'active' ? '合作生效' : rel.status === 'paused' ? '合作暂停' : '合作终止'}
                          size="sm"
                        />
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{rel.effectiveFrom}</td>
                      <td style={tdStyle}>
                        {sum.varieties.length === 0 ? (
                          <span style={{ color: '#C77A16' }}>无有效品种授权</span>
                        ) : (
                          <span style={{ color: '#248A5A' }}>{sum.varieties.join('、')}</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: '#667085' }}>{rel.lastUsedAt ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF' }}><ChevronRight size={14} aria-hidden /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detailRel && (
        <PharmaAuthDetail
          rel={detailRel}
          providerTenantId={providerTenantId}
          onClose={() => setDetailRelId(null)}
          users={users}
          assignments={assignments}
          roles={roles}
        />
      )}
    </div>
  );
}

function PharmaAuthDetail({
  rel, providerTenantId, onClose, users, assignments, roles,
}: {
  rel: ProviderPharmaRelationship;
  providerTenantId: string;
  onClose: () => void;
  users: ReturnType<typeof usePermission>['users'];
  assignments: ReturnType<typeof usePermission>['assignments'];
  roles: ReturnType<typeof usePermission>['roles'];
}) {
  const auths = authorizationsOfRelationship(rel.id);
  const varietyAuths = auths.filter(a => a.kind === 'variety');
  const otherAuths = auths.filter(a => a.kind !== 'variety');
  const pharmaName = tenantNameOf(rel.pharmaTenantId);

  /** 内部使用范围：本服务商名下被授予该药厂的成员授权（只读；配置在「角色与数据范围」） */
  const internalUses = assignments.filter(
    a => a.tenantId === providerTenantId && (a.pharmaTenantIds ?? []).includes(rel.pharmaTenantId),
  );

  return (
    <Modal open title={`合作药厂与业务授权 · ${pharmaName}`} onClose={onClose} width={880} maxHeight="82vh"
      footer={<Button variant="primary" onClick={onClose}>关闭</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 一、合作状态 */}
        <section>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--fs-13)', fontWeight: 700, color: 'var(--color-text-1)' }}>① 合作状态（药厂控制 · 本服务商只读）</h4>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'grid', gap: 6, fontSize: 'var(--fs-13)' }}>
            <div>
              <span style={{ color: '#9CA3AF' }}>合作状态 </span>
              <StatusTag status={rel.status === 'active' ? '合作生效' : rel.status === 'paused' ? '合作暂停' : '合作终止'} size="sm" />
            </div>
            <div><span style={{ color: '#9CA3AF' }}>合作生效日（准入通过） </span>{rel.effectiveFrom}</div>
            {rel.pausedAt && <div><span style={{ color: '#9CA3AF' }}>暂停时间 </span>{rel.pausedAt}{rel.pausedReason ? ` · ${rel.pausedReason}` : ''}</div>}
            {rel.terminatedAt && <div><span style={{ color: '#9CA3AF' }}>终止时间 </span>{rel.terminatedAt}{rel.terminatedReason ? ` · ${rel.terminatedReason}` : ''}</div>}
            <div><span style={{ color: '#9CA3AF' }}>最近使用 </span>{rel.lastUsedAt ?? '—'}</div>
            {rel.status !== 'active' && (
              <div style={{ color: '#C77A16', fontSize: 'var(--fs-12)' }}>
                合作未生效期间：药厂不能授予新的业务授权，本服务商全员不可进入该药厂业务空间。
              </div>
            )}
          </div>
        </section>

        {/* 二、授权品种 */}
        <section>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--fs-13)', fontWeight: 700, color: 'var(--color-text-1)' }}>② 授权品种（含已撤销记录）</h4>
          {varietyAuths.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              药厂尚未授予品种业务授权（合作生效后由药厂在「业务授权」页授予）。
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr>
                      {['通用名 / 商品名', '批准文号', '适用科室', '剂型', '包装规格', '单位', '上市许可持有人', '授权区域（派生·只读）', '授权状态', '撤销/失效原因'].map(h => (
                        <th key={h} style={{ ...thStyle, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {varietyAuths.flatMap(auth =>
                      auth.items.map((name, i) => {
                        const meta = varietyMeta(name);
                        const regions = auth.lineRegions && auth.lineRegions.length > 0
                          ? auth.lineRegions
                          : activeAuthSummaryOfRelationship(rel.id).regions;
                        return (
                          <tr key={`${auth.id}-${i}`}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{meta.genericName}</div>
                              <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>{meta.tradeName}</div>
                            </td>
                            <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{meta.approvalNo}</td>
                            <td style={tdStyle}>{meta.applicableDept}</td>
                            <td style={tdStyle}>{meta.dosageForm}</td>
                            <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{meta.packSpec}</td>
                            <td style={tdStyle}>{meta.unit}</td>
                            <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{meta.holder}</td>
                            <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{regions.length > 0 ? regions.join('、') : '—'}</td>
                            <td style={tdStyle}><StatusTag status={businessAuthStatusLabel(auth.status)} size="sm" /></td>
                            <td style={{ ...tdStyle, fontSize: 'var(--fs-12)', color: auth.status === 'active' ? '#9CA3AF' : '#C73A3A', maxWidth: 220 }}>
                              {auth.status === 'active'
                                ? '—'
                                : auth.revokedAt
                                  ? `${auth.revokedBy ?? '药厂'} 于 ${auth.revokedAt}${auth.reason ? `：${auth.reason}` : ''}`
                                  : auth.reason || '已失效'}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {otherAuths.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#667085' }}>
              其他资格：{otherAuths.map(a => `${businessAuthKindLabel(a.kind)}（${a.items.join('、')}）· ${businessAuthStatusLabel(a.status)}`).join('；')}
            </div>
          )}
        </section>

        {/* 三、内部使用范围 */}
        <section>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--fs-13)', fontWeight: 700, color: 'var(--color-text-1)' }}>③ 内部使用范围（只读 · 配置在「角色与数据范围」）</h4>
          {internalUses.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              暂无成员被授予该药厂；服务商管理员可在「角色与数据范围 · 已授权成员」中，在药厂授权范围内为成员配置。
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['成员', '角色', '可处理品种', '授权状态'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {internalUses.map(a => {
                    const user = users.find(u => u.id === a.userId);
                    const roleName = roles.find(r => r.id === a.roleId)?.name ?? '（已删除角色）';
                    const allVarieties = activeAuthSummaryOfRelationship(rel.id).varieties;
                    const scoped = a.varietyNames && a.varietyNames.length > 0 ? a.varietyNames : allVarieties;
                    return (
                      <tr key={a.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{user?.name ?? a.userId}</div>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{user?.account}</div>
                        </td>
                        <td style={tdStyle}>{roleName}</td>
                        <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{scoped.length > 0 ? scoped.join('、') : '—'}</td>
                        <td style={tdStyle}><StatusTag status={a.status === 'active' ? '生效' : a.status === 'revoked' ? '已回收' : a.status === 'expired' ? '已过期' : '待复核'} size="sm" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
