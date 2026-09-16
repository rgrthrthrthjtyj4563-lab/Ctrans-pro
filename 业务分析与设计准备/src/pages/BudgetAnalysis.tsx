import { useMemo, useState } from 'react';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { usePermission } from '../context/PermissionContext';
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, useServingScope } from '../hooks/useServingBizScope';
import { relationshipsOfPharma, tenantNameOf } from '../data/cooperationModel';
import {
  formatCNY,
  MONTHS_1_12,
  monthOfServiceMonth,
  PROVINCES,
  REGION_NATIONWIDE,
} from '../constants';
import {
  DEMO_NOW,
  formatCoverage,
  isPairAuthorized,
  lineMatchesPlan,
  useTaskData,
} from '../context/TaskDataContext';
import { providers } from '../data/mockData';
import { TaskDetailModal, type DetailTab } from './TaskExecution';
import type { BudgetPlan, NavFocus, NavigateFn, Role, SettlementBill, SettlementLine, Task, VarietyProviderAuth } from '../types';

interface Props {
  currentRole?: Role;
  navigate: NavigateFn;
  focus?: NavFocus;
}

const CURRENT_MONTH = Number(DEMO_NOW.slice(5, 7));

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6',
  textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
};
const tdText: React.CSSProperties = { ...td, textAlign: 'left', fontFamily: 'inherit' };

const REGION_OPTIONS = [...PROVINCES, REGION_NATIONWIDE].map((r) => ({ value: r, label: r }));
const MONTH_OPTIONS = MONTHS_1_12.map((m) => ({ value: String(m), label: `${m}月` }));

/** 归集键 = 服务商 × 品种 × 地区 × 服务月份 */
interface ActualEntry {
  month: number;
  variety: string;
  region: string;
  provider: string;
  amount: number;
  line: SettlementLine;
  task: Task;
  bill: SettlementBill;
}

/** 结算单列表弹框中的一行：整单 + 落入当前口径的明细行 */
interface BillDrillRow {
  bill: SettlementBill;
  task: Task;
  lines: SettlementLine[];
  matchedAmount: number;
}

interface BillDetail {
  bill: SettlementBill;
  task: Task;
  matchedAmount: number;
}

/** 明细主键 = 服务商 × 品种 × 地区；budget 为展示层均摊值 */
interface DetailRow {
  provider: string;
  variety: string;
  region: string;
  budget: number;
  actual: number;
}

function authorizedCombosOf(
  plan: BudgetPlan,
  auths: VarietyProviderAuth[],
): { variety: string; region: string }[] {
  const regionAxis = plan.regions.includes(REGION_NATIONWIDE) ? [REGION_NATIONWIDE] : plan.regions;
  const pairs: { variety: string; region: string }[] = [];
  for (const variety of plan.varieties) {
    for (const region of regionAxis) {
      if (isPairAuthorized(auths, plan.provider, variety, region)) {
        pairs.push({ variety, region });
      }
    }
  }
  return pairs.sort((a, b) => {
    const cv = a.variety.localeCompare(b.variety);
    return cv !== 0 ? cv : a.region.localeCompare(b.region);
  });
}

/** 整除均摊：余数逐个 +1 补到排序后的前几个组合，Σ = amount */
function splitEven(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(amount / n);
  const rem = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function StatCard({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div style={{ flex: 1, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 18px', minWidth: 170 }}>
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-20)', fontWeight: 700, color: tone ?? '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {hint && <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function BudgetAnalysis({ navigate, focus }: Props) {
  const { tasks, budgetPlans, varieties, auths } = useTaskData();
  const { principal } = usePermission();
  // 统一会话口径（P0-E）：服务商 = 当前服务商 + 当前服务药厂 + 已授权品种 + 派生区域；
  // 药厂 = 本厂任务与本厂有生效合作的服务商；范围失效默认拒绝
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope();

  // 绑定模式：从预算计划行进入，整页口径锁定为该预算行（服务商 × 品种集合 × 地区集合 × 年度）
  const boundCtx = focus?.budgetAnalysis ?? null;
  const boundPlan = useMemo(
    () => (boundCtx ? budgetPlans.find((p) => p.id === boundCtx.budgetPlanId) ?? null : null),
    [boundCtx, budgetPlans],
  );

  // 会话口径的任务判定（与任务执行页同源：服务商四要素 / 药厂本厂）
  const taskInSessionScope = (t: Task) =>
    isProviderSession
      ? matchesProviderRow({ provider: t.provider, holderPharma: t.holderPharma, varieties: t.varieties, regions: t.regions })
      : isPharmaSession
        ? matchesPharmaRow(t)
        : true;
  // 会话口径的预算行判定：服务商=本企业+当前药厂范围；药厂=本厂有生效合作的服务商
  const planInSessionScope = (p: BudgetPlan) =>
    isProviderSession
      ? Boolean(scope) && matchesProviderRow({ provider: p.provider, holderPharma: scope!.pharmaName, varieties: p.varieties, regions: p.regions })
      : isPharmaSession
        ? relationshipsOfPharma(principal.realm === 'TENANT' ? principal.tenantId : '')
            .filter((r) => r.status === 'active')
            .some((r) => tenantNameOf(r.providerTenantId) === p.provider)
        : true;
  // 会话口径的筛选项：服务提供商下拉只出现会话内可选值
  const sessionProviders = useMemo(() => {
    if (isProviderSession && principal.realm === 'TENANT') return [principal.tenantName];
    if (isPharmaSession && principal.realm === 'TENANT') {
      return relationshipsOfPharma(principal.tenantId)
        .filter((r) => r.status === 'active')
        .map((r) => tenantNameOf(r.providerTenantId));
    }
    return providers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProviderSession, isPharmaSession, principal, matchesProviderRow]);
  const sessionVarieties = useMemo(() => {
    if (isProviderSession && scope) {
      return varieties.filter((v) => v.holder === scope.pharmaName && scope.varietyNames.some((n) => v.genericName === n || v.tradeName === n || v.tradeName.startsWith(n)));
    }
    if (isPharmaSession && principal.realm === 'TENANT') {
      return varieties.filter((v) => v.holder === principal.tenantName);
    }
    return varieties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varieties, isProviderSession, isPharmaSession, principal, scope]);

  const initialFilters: Record<string, string> = boundPlan
    ? { month: String(CURRENT_MONTH) }
    : { year: '2026', month: String(CURRENT_MONTH) };
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [applied, setApplied] = useState<Record<string, string>>(initialFilters);
  const [billDrill, setBillDrill] = useState<{ provider: string; variety: string; region: string; month: number } | null>(null);
  const [billDetail, setBillDetail] = useState<BillDetail | null>(null);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskTab, setTaskTab] = useState<DetailTab>('plan');

  const year = boundPlan ? boundPlan.year : Number(applied.year) || 2026;
  const monthFilter = applied.month ? Number(applied.month) : 0;

  const plans = useMemo(() => {
    if (boundPlan) return planInSessionScope(boundPlan) ? [boundPlan] : [];
    return budgetPlans.filter((p) => {
      if (!planInSessionScope(p)) return false;
      if (p.year !== year) return false;
      if (applied.provider && p.provider !== applied.provider) return false;
      if (applied.variety && !p.varieties.includes(applied.variety)) return false;
      if (applied.region && !p.regions.includes(applied.region) && !p.regions.includes(REGION_NATIONWIDE)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundPlan, budgetPlans, applied, year, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow, scope]);

  const lineMatchesFilter = (provider: string, variety: string, region: string) => {
    if (applied.provider && provider !== applied.provider) return false;
    if (applied.variety && variety !== applied.variety) return false;
    if (applied.region && region !== applied.region && applied.region !== REGION_NATIONWIDE) return false;
    return true;
  };

  const actualEntries = useMemo<ActualEntry[]>(() => {
    const rows: ActualEntry[] = [];
    tasks.forEach((task) => {
      if (task.taskStatus === '已撤销') return;
      // 会话口径过滤（与任务执行页同源）
      if (!taskInSessionScope(task)) return;
      task.settlements.forEach((bill) => {
        if (!bill.confirmed || bill.voided) return;
        if (!boundPlan && Number(bill.serviceMonth.slice(0, 4)) !== year) return;
        bill.lines.forEach((l) => {
          if (boundPlan) {
            if (!lineMatchesPlan(boundPlan, task.provider, l.variety, l.region, bill.serviceMonth)) return;
          } else if (!lineMatchesFilter(task.provider, l.variety, l.region)) {
            return;
          }
          rows.push({
            month: monthOfServiceMonth(bill.serviceMonth),
            variety: l.variety,
            region: l.region,
            provider: task.provider,
            amount: l.actualAmount,
            line: l,
            task,
            bill,
          });
        });
      });
    });
    return rows;
  }, [tasks, boundPlan, applied, year, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow]);

  const budgetOf = (m: number) => plans.reduce((s, p) => s + (p.months[m - 1] ?? 0), 0);
  const actualOf = (m: number) => actualEntries.filter((e) => e.month === m).reduce((s, e) => s + e.amount, 0);

  const monthScope = monthFilter ? [monthFilter] : MONTHS_1_12;
  const cardBudget = monthScope.reduce((s, m) => s + budgetOf(m), 0);
  const cardActual = monthScope.reduce((s, m) => s + actualOf(m), 0);
  const cardDev = cardBudget - cardActual;
  const cardDevRate = cardBudget === 0 ? '无预算' : `${cardDev >= 0 ? '+' : ''}${((cardDev / cardBudget) * 100).toFixed(1)}%`;

  const detailRows = useMemo<DetailRow[]>(() => {
    const keyOf = (p: string, v: string, r: string) => `${p}|${v}|${r}`;
    const map = new Map<string, DetailRow>();
    const touch = (provider: string, variety: string, region: string): DetailRow => {
      const k = keyOf(provider, variety, region);
      let row = map.get(k);
      if (!row) {
        row = { provider, variety, region, budget: 0, actual: 0 };
        map.set(k, row);
      }
      return row;
    };

    plans.forEach((plan) => {
      const combos = authorizedCombosOf(plan, auths);
      if (!combos.length) return;
      monthScope.forEach((m) => {
        const monthBudget = plan.months[m - 1] ?? 0;
        if (monthBudget <= 0) return;
        const shares = splitEven(monthBudget, combos.length);
        combos.forEach((c, i) => {
          touch(plan.provider, c.variety, c.region).budget += shares[i];
        });
      });
    });

    actualEntries.forEach((e) => {
      if (monthFilter && e.month !== monthFilter) return;
      touch(e.provider, e.variety, e.region).actual += e.amount;
    });

    return [...map.values()]
      .filter((r) => {
        if (applied.variety && r.variety !== applied.variety) return false;
        if (applied.region && r.region !== applied.region && r.region !== REGION_NATIONWIDE && applied.region !== REGION_NATIONWIDE) return false;
        return r.budget > 0 || r.actual > 0;
      })
      .sort((a, b) => {
        const cp = a.provider.localeCompare(b.provider);
        if (cp !== 0) return cp;
        const cv = a.variety.localeCompare(b.variety);
        return cv !== 0 ? cv : a.region.localeCompare(b.region);
      });
  }, [plans, auths, actualEntries, monthScope, monthFilter, applied.variety, applied.region]);

  const maxVal = Math.max(1, ...MONTHS_1_12.flatMap((m) => [budgetOf(m), actualOf(m)]));

  const billDrillRows = useMemo<BillDrillRow[]>(() => {
    if (!billDrill) return [];
    const map = new Map<string, BillDrillRow>();
    actualEntries.forEach((e) => {
      if (e.provider !== billDrill.provider) return;
      if (e.variety !== billDrill.variety) return;
      if (e.region !== billDrill.region) return;
      if (billDrill.month && e.month !== billDrill.month) return;
      let row = map.get(e.bill.id);
      if (!row) {
        row = { bill: e.bill, task: e.task, lines: [], matchedAmount: 0 };
        map.set(e.bill.id, row);
      }
      row.lines.push(e.line);
      row.matchedAmount += e.amount;
    });
    return [...map.values()];
  }, [actualEntries, billDrill]);
  const billDrillTotal = billDrillRows.reduce((s, r) => s + r.matchedAmount, 0);

  function drillMonth(m: number) {
    const next = { ...filters, month: String(m) };
    setFilters(next);
    setApplied(next);
  }

  function resetFilters() {
    const next: Record<string, string> = boundPlan
      ? { month: String(CURRENT_MONTH) }
      : { year: '2026', month: String(CURRENT_MONTH) };
    setFilters(next);
    setApplied(next);
  }

  function closeBillDrill() {
    setBillDrill(null);
    setBillDetail(null);
    setTaskDetail(null);
  }

  const liveTask = taskDetail ? (tasks.find((t) => t.id === taskDetail.id) ?? taskDetail) : null;

  if (boundCtx && !boundPlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title="预算执行分析"
          actions={
            <Button variant="outline" size="md" icon={<ArrowLeft size={14} />} onClick={() => navigate('budget-plan')}>
              返回预算计划
            </Button>
          }
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState title="预算行不存在" description="该预算行可能已被删除，请返回预算计划重新选择。" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="预算执行分析"
        description="明细粒度 = 服务商 × 品种 × 地区（默认当前月）。月度预算按预算行覆盖的授权「品种×地区」组合均摊（合计 = 服务商当月预算）；已结算实际按确认结算单零分摊归集。点击「已结算实际金额」→ 结算单列表 → 结算单号看整单明细 → 关联任务在本页查看任务详情。"
        actions={
          <Button variant="outline" size="md" icon={<ArrowLeft size={14} />} onClick={() => navigate('budget-plan')}>
            返回预算计划
          </Button>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {denied || (boundPlan && plans.length === 0) ? (
          <EmptyState
            icon={ShieldOff}
            title={denied ? NO_BIZ_SCOPE_TITLE : '该预算行不在当前会话范围内'}
            description={denied ? noBizScopeDescription(scope?.pharmaName) : '当前会话的业务范围不覆盖该预算行，无法查看其执行分析。'}
          />
        ) : (
        <>
        {boundPlan && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '10px 14px', marginBottom: 12, fontSize: 'var(--fs-13)',
            background: 'var(--color-brand-subtle)', border: '1px solid #B7DED6', borderRadius: 8, color: 'var(--color-brand)',
          }}>
            <span style={{ fontWeight: 600 }}>预算行口径：</span>
            <span>{boundPlan.year} 年 · {boundPlan.provider} · 品种 {formatCoverage(boundPlan.varieties)} · 地区 {formatCoverage(boundPlan.regions)}</span>
          </div>
        )}

        <FilterBar
          fields={boundPlan ? [
            { id: 'month', label: '月份', type: 'select', options: [{ value: '', label: '全部月份' }, ...MONTH_OPTIONS] },
          ] : [
            { id: 'year', label: '年度', type: 'select', options: [{ value: '2026', label: '2026' }, { value: '2027', label: '2027' }] },
            { id: 'month', label: '月份', type: 'select', options: [{ value: '', label: '全部月份' }, ...MONTH_OPTIONS] },
            { id: 'provider', label: '服务提供商', type: 'select', options: sessionProviders.map((p) => ({ value: p, label: p })) },
            { id: 'variety', label: '品种', type: 'select', options: sessionVarieties.map((v) => ({ value: v.tradeName, label: v.tradeName })) },
            { id: 'region', label: '区域', type: 'select', options: [{ value: '', label: '全部区域' }, ...REGION_OPTIONS] },
          ]}
          values={filters}
          onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
          onSearch={() => setApplied({ ...filters })}
          onReset={resetFilters}
        />

        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <StatCard label={`月度预算${monthFilter ? `（${monthFilter}月）` : '（全年）'}`} value={formatCNY(cardBudget)} />
          <StatCard label={`已结算实际${monthFilter ? `（${monthFilter}月）` : '（全年）'}`} value={formatCNY(cardActual)} tone="var(--color-brand)" />
          <StatCard
            label="差异（月度预算 − 已结算实际）"
            value={`${cardDev > 0 ? '+' : ''}${formatCNY(cardDev)}`}
            tone={cardDev < 0 ? '#C73A3A' : cardDev > 0 ? '#248A5A' : '#1F2937'}
          />
          <StatCard
            label="差异率（差异 ÷ 月度预算）"
            value={cardBudget === 0 ? '无预算' : cardDevRate}
            tone={cardBudget === 0 ? '#9CA3AF' : cardDev < 0 ? '#C73A3A' : cardDev > 0 ? '#248A5A' : '#1F2937'}
            hint={cardBudget === 0 ? '月度预算为 0，不计算百分比' : undefined}
          />
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 'var(--fs-13)', fontWeight: 650 }}>预算与实际并列柱状图（{year} 年 · 点击月份下钻）</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 'var(--fs-12)', color: '#667085' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#94A3B8', borderRadius: 2, marginRight: 4 }} />月度预算</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-brand)', borderRadius: 2, marginRight: 4 }} />已结算实际</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, overflowX: 'auto' }}>
            {MONTHS_1_12.map((m) => {
              const budget = budgetOf(m);
              const actual = actualOf(m);
              const dev = budget - actual;
              const active = monthFilter === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => drillMonth(m)}
                  title={`点击下钻 ${m} 月`}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64,
                    border: 'none', background: active ? 'var(--color-brand-subtle)' : 'transparent', borderRadius: 6, padding: '4px 0', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150, width: '100%', justifyContent: 'center' }}>
                    <div title={`${m}月 月度预算 ${formatCNY(budget)}`} style={{ width: 14, height: `${Math.max(2, (budget / maxVal) * 100)}%`, background: budget === 0 ? '#F3F4F6' : '#94A3B8', borderRadius: '3px 3px 0 0' }} />
                    <div title={`${m}月 已结算实际 ${formatCNY(actual)}`} style={{ width: 14, height: `${Math.max(2, (actual / maxVal) * 100)}%`, background: actual === 0 ? '#F3F4F6' : 'var(--color-brand)', borderRadius: '3px 3px 0 0' }} />
                  </div>
                  <div style={{ fontSize: 'calc(10.5px * var(--font-scale))', fontFamily: "'JetBrains Mono', monospace", color: dev < 0 ? '#C73A3A' : dev > 0 ? '#248A5A' : '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {budget === 0 && actual === 0 ? '—' : budget === 0 ? '无预算' : `${dev > 0 ? '+' : ''}${formatCNY(dev)}`}
                  </div>
                  <div style={{ fontSize: 'var(--fs-11)', color: active ? 'var(--color-brand)' : '#667085', fontWeight: active ? 700 : 400 }}>{m}月</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr>
                {['服务商', '品种', '地区', '月度预算', '已结算实际金额', '差异金额', '差异率'].map((h, i) => (
                  <th key={h} style={i < 3 ? { ...th, textAlign: 'left' } : th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailRows.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="暂无数据" description="当前筛选范围内没有预算或已结算实际。" /></td></tr>
              ) : detailRows.map((r) => {
                const dev = r.budget - r.actual;
                return (
                  <tr key={`${r.provider}|${r.variety}|${r.region}`}>
                    <td style={tdText}>{r.provider}</td>
                    <td style={tdText}>{r.variety}</td>
                    <td style={tdText}>{r.region}</td>
                    <td style={{ ...td, color: r.budget === 0 ? '#9CA3AF' : undefined }}>{r.budget === 0 ? '无预算' : formatCNY(r.budget)}</td>
                    <td style={td}>
                      {r.actual > 0 ? (
                        <button
                          onClick={() => setBillDrill({ provider: r.provider, variety: r.variety, region: r.region, month: monthFilter })}
                          style={{ color: 'var(--color-brand)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--fs-13)', padding: 0, textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatCNY(r.actual)}
                        </button>
                      ) : formatCNY(0)}
                    </td>
                    <td style={{ ...td, color: dev < 0 ? '#C73A3A' : dev > 0 ? '#248A5A' : '#9CA3AF' }}>
                      {r.budget === 0 && r.actual === 0 ? '—' : `${dev > 0 ? '+' : ''}${formatCNY(dev)}`}
                    </td>
                    <td style={{ ...td, color: r.budget === 0 ? '#9CA3AF' : dev < 0 ? '#C73A3A' : dev > 0 ? '#248A5A' : undefined }}>
                      {r.budget === 0 ? '无预算' : `${dev >= 0 ? '+' : ''}${((dev / r.budget) * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.8, marginBottom: 20 }}>
          口径说明：明细粒度 = 服务商 × 品种 × 地区（默认当前月）。月度预算按预算行覆盖的授权「品种×地区」组合整除均摊（余数补到前几个组合，合计 = 服务商当月预算），是展示层分摊值、不是落库数据。已结算实际按确认结算单零分摊归集。差异 = 月度预算 − 已结算实际；预算为 0 显示「无预算」。点击「已结算实际金额」打开结算单列表，点结算单号看整单明细，点关联任务在本页查看任务详情。
        </div>
        </>
        )}
      </div>

      <Modal
        open={!!billDrill}
        title={billDrill
          ? `实际结算明细 · ${billDrill.provider} · ${billDrill.variety} · ${billDrill.region}${billDrill.month ? ` · ${billDrill.month}月` : ''}`
          : ''}
        onClose={closeBillDrill}
        width={980}
        footer={<Button variant="outline" onClick={closeBillDrill}>关闭</Button>}
      >
        {billDrillRows.length === 0 ? (
          <EmptyState title="暂无结算单" description="该组合下没有已确认的结算单。" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['结算单号', '关联任务', '推广时段', '服务提供商', '工作组', '执行归属月份', '确认日期', '结算金额'].map((h) => <th key={h} style={{ ...th, textAlign: 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {billDrillRows.map((r) => (
                <tr key={r.bill.id}>
                  <td style={tdText}>
                    <button
                      onClick={() => setBillDetail({ bill: r.bill, task: r.task, matchedAmount: r.matchedAmount })}
                      style={{ color: 'var(--color-brand)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--fs-13)', padding: 0, textDecoration: 'underline' }}
                    >
                      {r.bill.billNo}
                    </button>
                  </td>
                  <td style={tdText}>
                    <button
                      onClick={() => { setTaskTab('plan'); setTaskDetail(r.task); }}
                      style={{ color: '#2F6BCE', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--fs-13)', padding: 0, textDecoration: 'underline' }}
                    >
                      {r.task.taskNo}
                    </button>
                  </td>
                  <td style={tdText}>{r.bill.servicePeriod}</td>
                  <td style={tdText}>{r.bill.provider}</td>
                  <td style={tdText}>{r.bill.workGroup}</td>
                  <td style={tdText}>{r.bill.serviceMonth}</td>
                  <td style={tdText}>{r.bill.confirmedAt ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{formatCNY(r.matchedAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...tdText, fontWeight: 600 }} colSpan={7}>合计（＝明细表该行「已结算实际金额」）</td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--color-brand)' }}>{formatCNY(billDrillTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Modal>

      <Modal
        open={!!billDetail}
        title={billDetail ? `结算单明细 · ${billDetail.bill.billNo}` : ''}
        onClose={() => setBillDetail(null)}
        width={980}
        footer={<Button variant="outline" onClick={() => setBillDetail(null)}>返回结算单列表</Button>}
      >
        {billDetail && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 16px', marginBottom: 16 }}>
              {[
                ['合同编号', billDetail.bill.contractNo],
                ['服务品种', [...new Set(billDetail.bill.lines.map((l) => l.variety))].join('、')],
                ['服务时间', billDetail.bill.servicePeriod],
                ['制单日', billDetail.bill.madeAt],
                ['服务提供方', billDetail.bill.provider],
                ['执行归属月份', billDetail.bill.serviceMonth],
                ['工作组', billDetail.bill.workGroup],
                ['确认', billDetail.bill.confirmedAt ? `${billDetail.bill.confirmedBy ?? '—'} · ${billDetail.bill.confirmedAt}` : '—'],
                ['付款凭证', billDetail.bill.paymentVoucher ?? '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', wordBreak: 'break-all' }}>{value}</div>
                </div>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['序号', '品种', '地区', '服务类型', '服务项目', '服务金额', '实际结算金额', '备注'].map((h) => <th key={h} style={{ ...th, textAlign: 'left' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {billDetail.bill.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td style={tdText}>{i + 1}</td>
                    <td style={tdText}>{l.variety}</td>
                    <td style={tdText}>{l.region}</td>
                    <td style={tdText}>{l.serviceType}</td>
                    <td style={tdText}>{l.serviceItem}</td>
                    <td style={td}>{formatCNY(l.serviceAmount)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{formatCNY(l.actualAmount)}</td>
                    <td style={{ ...tdText, color: l.remark ? undefined : '#9CA3AF' }}>{l.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, fontSize: 'var(--fs-13)' }}>
              <span style={{ color: '#667085' }}>最终结算金额（整单）：<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--color-text-1)' }}>{formatCNY(billDetail.bill.finalAmount)}</span></span>
              <span style={{ color: '#667085' }}>计入当前口径金额：<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--color-brand)' }}>{formatCNY(billDetail.matchedAmount)}</span></span>
            </div>
          </>
        )}
      </Modal>

      <TaskDetailModal
        task={liveTask}
        tab={taskTab}
        onTab={setTaskTab}
        onClose={() => setTaskDetail(null)}
        isSales={false}
        isProvider={false}
        onReview={() => {}}
        onConfirmBill={() => {}}
      />
    </div>
  );
}
