/**
 * 结构化业务范围编辑器（2026-11 企业管理重构 · 红线条 7 公共组件）：
 * 「药厂 → 品种 → 区域收窄」固定三级联动，组织架构（部门默认承接）、用户管理
 * （新建成员顺手配置）与角色管理（成员授权个人收窄）三处复用同一事实源。
 *
 * 口径：
 * - 药厂列表仅展示「合作生效 ∧ 存在有效品种授权」的药厂（grantablePharmasForProvider）；
 * - 品种仅展示该药厂有效授权给本服务商的品种；取消勾选药厂时同步清除该药厂下
 *   已选品种与区域（cleanBizScopesOnPharmaToggle，修复 P1-03 残留）；
 * - 品种/区域各有显式「全部 / 指定」口径（2026-11 §4 空选语义）：全部=显式选择、
 *   继续受上游约束；指定=在授权上限内收窄，取消最后一项保持空选并提示、不可保存；
 * - 运行时仍与上游有效授权实时取交集（默认拒绝），本编辑器只负责「配置意图」。
 */
import { useMemo } from 'react';
import { Building2, CheckCircle2, PauseCircle, XCircle } from 'lucide-react';
import { Button } from './Button';
import {
  authorizedVarietyLinesOfPharma,
  cleanBizScopesOnPharmaToggle,
  grantablePharmasForProvider,
  relationshipBetween,
  relationshipStatusLabel,
} from '../data/cooperationModel';
import { tenantNameOf } from '../data/cooperationModel';
import { bizScopeModeOf, type BizScopeItem } from '../data/permissions';

/** 品种授权行（ BizScopeEditor 内部形状：品种名 × 授权区域上限） */
interface EffectiveAuthLine {
  varietyName: string;
  regions: string[];
}

const chip = (active: boolean) =>
  ({
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 'var(--fs-12)',
    fontWeight: 500,
    border: active ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
    background: active ? 'var(--color-brand-subtle)' : '#fff',
    color: active ? 'var(--color-brand)' : '#374151',
    cursor: 'pointer',
  }) as const;

/** 药厂上游授权健康度（卡片标签）：合作状态 × 品种授权有效性实时判定 */
export function pharmaAuthHealth(providerTenantId: string, pharmaTenantId: string): '有效' | '合作暂停' | '授权已撤销' | '无有效授权' {
  const rel = relationshipBetween(pharmaTenantId, providerTenantId);
  if (!rel || rel.status === 'terminated') return '无有效授权';
  if (rel.status === 'paused') return '合作暂停';
  const lines = authorizedVarietyLinesOfPharma(providerTenantId, pharmaTenantId);
  if (lines.length === 0) return '授权已撤销';
  return '有效';
}

/** 已配置业务范围的只读卡片（部门承接范围展示区） */
export function BizScopeCards({
  providerTenantId,
  scopes,
  onConfigure,
  configureLabel = '配置业务范围',
  canConfigure,
}: {
  providerTenantId: string;
  scopes: BizScopeItem[];
  onConfigure?: () => void;
  configureLabel?: string;
  canConfigure?: boolean;
}) {
  const grantable = useMemo(() => new Set(grantablePharmasForProvider(providerTenantId)), [providerTenantId]);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {scopes.length === 0 ? (
        <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: '14px 16px', fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
          尚未配置业务承接范围：部门成员在授权时选「继承部门业务范围」将无可继承内容。点击「{configureLabel}」按 药厂 → 品种 → 区域 配置。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {scopes.map(scope => {
            const health = pharmaAuthHealth(providerTenantId, scope.pharmaTenantId);
            const lines = authorizedVarietyLinesOfPharma(providerTenantId, scope.pharmaTenantId);
            const ceiling = [...new Set(lines.flatMap(l => l.regions))];
            const healthStyle =
              health === '有效'
                ? { fg: '#248A5A', bg: '#E6F5ED' }
                : health === '合作暂停'
                  ? { fg: '#C77A16', bg: '#FEF3E2' }
                  : { fg: '#C73A3A', bg: '#FEECEC' };
            const HealthIcon = health === '有效' ? CheckCircle2 : health === '合作暂停' ? PauseCircle : XCircle;
            const narrowed = scope.regionCodes.length > 0;
            return (
              <div key={scope.pharmaTenantId} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Building2 size={14} style={{ color: 'var(--color-brand)' }} />
                  <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{tenantNameOf(scope.pharmaTenantId)}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, fontSize: '11px', background: healthStyle.bg, color: healthStyle.fg }}>
                    <HealthIcon size={10} /> {health}
                    {!grantable.has(scope.pharmaTenantId) && '（运行时默认拒绝）'}
                  </span>
                  {onConfigure && canConfigure !== false && (
                    <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={onConfigure}>
                      {scope.pharmaTenantId ? '调整' : configureLabel}
                    </Button>
                  )}
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span>品种：</span>
                  {scope.varietyNames.length === 0
                    ? <span style={{ fontWeight: 500, color: '#374151' }}>全部已授权品种</span>
                    : scope.varietyNames.map(v => <span key={v} style={{ background: '#F3F4F6', borderRadius: 4, padding: '1px 6px' }}>{v}</span>)}
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span>区域：</span>
                  {narrowed ? (
                    <>
                      <span style={{ color: '#C77A16', fontWeight: 500 }}>已收窄</span>
                      {scope.regionCodes.map(r => <span key={r} style={{ background: '#FEF3E2', borderRadius: 4, padding: '1px 6px', color: '#C77A16' }}>{r}</span>)}
                      <span style={{ color: '#9CA3AF' }}>（药厂授权上限：{ceiling.length > 0 ? ceiling.join('、') : '—'}）</span>
                    </>
                  ) : (
                    <span style={{ fontWeight: 500, color: '#374151' }}>继承授权区域{ceiling.length > 0 ? `（${ceiling.join('、')}）` : ''}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {onConfigure && canConfigure !== false && (
        <Button variant="outline" size="sm" onClick={onConfigure}>{scopes.length === 0 ? configureLabel : '配置业务范围'}</Button>
      )}
    </div>
  );
}

/**
 * 三级联动编辑器主体（弹窗内使用）：受控组件，value/onChange 全量结构化条目。
 * providerTenantId 决定可选药厂与品种/区域上限。
 *
 * 2026-11 拍板（§4 空选语义）：每个药厂条目的品种/区域各有显式「全部 / 指定」口径——
 * 「全部」是显式选择而非空数组的隐式含义；「指定」模式取消最后一项时保持空选并提示
 * 「至少选一项」，保存由 validateBizScopes 拦截；取消关闭弹窗不落库，原配置不变。
 */
export function BizScopeEditor({
  providerTenantId,
  value,
  onChange,
}: {
  providerTenantId: string;
  value: BizScopeItem[];
  onChange: (next: BizScopeItem[]) => void;
}) {
  const grantableIds = useMemo(() => grantablePharmasForProvider(providerTenantId), [providerTenantId]);
  const candidates = grantableIds.concat(value.map(s => s.pharmaTenantId).filter(id => !grantableIds.includes(id)));

  const togglePharma = (pharmaId: string, checked: boolean) => {
    onChange(cleanBizScopesOnPharmaToggle(value, pharmaId, checked, providerTenantId));
  };

  const updateScope = (pharmaId: string, part: Partial<BizScopeItem>) => {
    onChange(value.map(s => (s.pharmaTenantId === pharmaId ? { ...s, ...part } : s)));
  };

  /** 切换品种口径：all→pick 先落当前全选（从全量开始收窄）；pick→all 清空清单并显式声明全部 */
  const setVarietyMode = (scope: BizScopeItem, lines: EffectiveAuthLine[], mode: 'all' | 'pick') => {
    if (mode === 'all') updateScope(scope.pharmaTenantId, { varietyMode: 'all', varietyNames: [] });
    else updateScope(scope.pharmaTenantId, { varietyMode: 'pick', varietyNames: [...new Set(lines.map(l => l.varietyName))] });
  };

  /** 切换区域口径：all→pick 先按当前品种约束落全量区域；pick→all 清空清单并显式声明全部 */
  const setRegionMode = (scope: BizScopeItem, regions: string[], mode: 'all' | 'pick') => {
    if (mode === 'all') updateScope(scope.pharmaTenantId, { regionMode: 'all', regionCodes: [] });
    else updateScope(scope.pharmaTenantId, { regionMode: 'pick', regionCodes: [...regions] });
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {candidates.length === 0 && (
        <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: 14, fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
          本服务商当前没有「合作生效 ∧ 有效品种授权」的药厂，无可配置承接范围。
        </div>
      )}
      {candidates.map(pharmaId => {
        const scope = value.find(s => s.pharmaTenantId === pharmaId);
        const checked = Boolean(scope);
        const rel = relationshipBetween(pharmaId, providerTenantId);
        const health = pharmaAuthHealth(providerTenantId, pharmaId);
        const lines = authorizedVarietyLinesOfPharma(providerTenantId, pharmaId);
        const disabled = health !== '有效';
        const varietyMode = scope ? bizScopeModeOf(scope.varietyNames, scope.varietyMode) : 'all';
        const regionMode = scope ? bizScopeModeOf(scope.regionCodes, scope.regionMode) : 'all';
        const activeLines = scope && varietyMode === 'pick'
          ? lines.filter(l => scope.varietyNames.includes(l.varietyName))
          : lines;
        const regionOptions = [...new Set(activeLines.flatMap(l => l.regions))];
        const varietyEmptyPick = varietyMode === 'pick' && (scope?.varietyNames.length ?? 0) === 0;
        const regionEmptyPick = regionMode === 'pick' && (scope?.regionCodes.length ?? 0) === 0;
        return (
          <div key={pharmaId} style={{ border: checked ? '1px solid var(--color-brand)' : '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 8, opacity: disabled ? 0.72 : 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => togglePharma(pharmaId, e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--color-brand)' }}
              />
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{tenantNameOf(pharmaId)}</span>
              <span style={{ fontSize: 'var(--fs-12)', color: rel ? (rel.status === 'active' ? '#248A5A' : '#C77A16') : '#C73A3A' }}>
                {rel ? relationshipStatusLabel(rel.status) : '无合作关系'}
                {health === '授权已撤销' ? ' · 品种授权已撤销' : ''}
              </span>
              <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginLeft: 'auto' }}>
                授权品种 {lines.length} 个
              </span>
            </label>
            {checked && !disabled && scope && (
              <>
                <div style={{ paddingLeft: 23, display: 'grid', gap: 6 }}>
                  {/* 品种口径：全部 / 指定 显式切换 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>品种口径</span>
                    <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                      {([['all', '全部已授权品种'], ['pick', '指定品种']] as const).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setVarietyMode(scope, lines, m)}
                          style={{
                            padding: '3px 12px', fontSize: 'var(--fs-12)', border: 'none', cursor: 'pointer',
                            background: varietyMode === m ? 'var(--color-brand-subtle)' : '#fff',
                            color: varietyMode === m ? 'var(--color-brand)' : '#374151', fontWeight: varietyMode === m ? 600 : 400,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {varietyMode === 'all' && (
                      <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>该药厂全部 {lines.length} 个已授权品种；运行时继续受上游实时约束</span>
                    )}
                  </div>
                  {varietyMode === 'pick' && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {lines.map(line => {
                          const on = scope.varietyNames.includes(line.varietyName);
                          return (
                            <button
                              key={line.varietyName}
                              type="button"
                              style={chip(on)}
                              onClick={() => {
                                // 指定模式：取消最后一项时保持空选（不得自动回全选），由提示与校验兜底
                                const next = on
                                  ? scope.varietyNames.filter(v => v !== line.varietyName)
                                  : [...scope.varietyNames, line.varietyName];
                                updateScope(pharmaId, { varietyNames: next });
                              }}
                            >
                              {line.varietyName}
                            </button>
                          );
                        })}
                      </div>
                      {varietyEmptyPick && (
                        <div style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>
                          至少选择一个品种；若为全部品种请切回「全部已授权品种」，或取消勾选该药厂。当前空选不可保存。
                        </div>
                      )}
                    </>
                  )}
                  {/* 区域口径：全部 / 指定 显式切换；候选区域按所选品种约束 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>区域口径</span>
                    <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                      {([['all', '全部授权区域'], ['pick', '指定区域']] as const).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRegionMode(scope, regionOptions, m)}
                          style={{
                            padding: '3px 12px', fontSize: 'var(--fs-12)', border: 'none', cursor: 'pointer',
                            background: regionMode === m ? 'var(--color-brand-subtle)' : '#fff',
                            color: regionMode === m ? 'var(--color-brand)' : '#374151', fontWeight: regionMode === m ? 600 : 400,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {regionMode === 'all' && (
                      <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
                        继承所选品种授权区域{regionOptions.length > 0 ? `（${regionOptions.join('、')}）` : ''}
                      </span>
                    )}
                  </div>
                  {regionMode === 'pick' && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {regionOptions.map(region => {
                          const on = scope.regionCodes.includes(region);
                          return (
                            <button
                              key={region}
                              type="button"
                              style={{ ...chip(on), ...(on ? { borderColor: '#C77A16', color: '#C77A16', background: '#FEF3E2' } : {}) }}
                              onClick={() => {
                                // 指定模式：取消最后一项时保持空选（不得自动回全选）
                                const next = on
                                  ? scope.regionCodes.filter(r => r !== region)
                                  : [...scope.regionCodes, region];
                                updateScope(pharmaId, { regionCodes: next });
                              }}
                            >
                              {region}
                            </button>
                          );
                        })}
                      </div>
                      {regionEmptyPick && (
                        <div style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>
                          至少选择一个区域；若不限区域请切回「全部授权区域」。当前空选不可保存。
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
