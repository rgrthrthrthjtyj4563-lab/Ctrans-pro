import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEMO_HOLDER,
  DEMO_PROVIDER,
  filterAuthorizedProviders,
  isPairAuthorized,
  regionsOfProvider,
  seedAuths,
  seedBudgetPlans,
  seedPriceItems,
  seedPriceRatios,
  seedReportPrices,
  seedTasks,
  seedVarieties,
  varietiesOfProvider,
} from '../data/mockData';
import { formatCNY } from '../constants';
import type {
  BudgetPlan,
  CreateAuthInput,
  CreateBudgetPlanInput,
  CreateTaskInput,
  PriceItem,
  PriceRatio,
  ReportPrice,
  Role,
  ServiceItem,
  SettlementBill,
  SettlementLine,
  Task,
  Variety,
  VarietyProviderAuth,
  WorkgroupSplit,
  WorkloadAssign,
  WorkloadStage,
} from '../types';

export { formatCNY, cny } from '../constants';
export { DEMO_PROVIDER, DEMO_HOLDER, isPairAuthorized, varietiesOfProvider, regionsOfProvider };

export function formatCoverage(items: string[]): string {
  if (!items.length) return '—';
  if (items.includes('全国') && items.length === 1) return '全国';
  return items.join('、');
}

export function formatMoney(n: number, masked = false): string {
  return formatCNY(n, masked);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const DEMO_NOW = '2026-08-24 12:00';
const ROLE_ACTOR: Record<Role, string> = { 药厂销售部门: '李强', 药厂合规部门: '合规管理员', 服务提供商: '服务商' };

interface MutationResult<T = void> {
  ok: boolean;
  error?: string;
  warning?: string;
  data?: T;
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, '0');
}

function nextId(prefix: string, ids: string[]): string {
  const nums = ids.map((id) => Number(id.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n));
  return `${prefix}-${pad(Math.max(0, ...nums) + 1)}`;
}

/** 剩余可结算金额：结算完结后作废为 0 */
export function remainingOfTask(task: Task): number {
  if (task.remainingVoided) return 0;
  return Math.max(0, task.planAmount - task.settledAmount);
}

/** 任务是否含推广服务（市场推广服务价目类别） */
export function hasPromoItems(task: Task): boolean {
  return task.serviceItems.some((it) => it.category === '市场推广服务');
}

/** 任务是否含报告服务（分析报告服务 / 问卷调研与分析服务） */
export function hasReportItems(task: Task): boolean {
  return task.serviceItems.some((it) => it.category !== '市场推广服务');
}

export function workloadStageOf(task: Task): WorkloadStage {
  if (task.workloadAssigns.length > 0) return '已分配到专员';
  if (task.workgroupSplits.length > 0) return '已拆解到工作组';
  return '未拆解';
}

/** 工作量进度：已完成 n / 待审核 m / 未完成 k */
export function progressCountOf(task: Task): { done: number; review: number; todo: number } {
  return {
    done: task.workloadAssigns.filter((a) => a.progress === '已完成').length,
    review: task.workloadAssigns.filter((a) => a.progress === '待审核').length,
    todo: task.workloadAssigns.filter((a) => a.progress === '未完成').length,
  };
}

export function workloadStageLabel(task: Task): string {
  if (!hasPromoItems(task)) return '报告服务，无需拆解';
  const stage = workloadStageOf(task);
  if (stage !== '已分配到专员') return stage;
  const { done, review, todo } = progressCountOf(task);
  return `已分配到专员（已完成 ${done} / 待审核 ${review} / 未完成 ${todo}）`;
}

/** 展示层状态映射：数据层手册词 → 主状态 + 辅助状态（V2 设计方案 5.5） */
export function displayStatusOf(task: Task): { main: string; aux?: string; owner: string } {
  if (task.taskStatus === '待确认') return { main: '待服务商确认', owner: '服务提供商' };
  if (task.taskStatus === '已撤销') return { main: '已撤销', owner: '—' };
  if (task.taskStatus === '已结算') return { main: '已结算', owner: '—' };
  if (task.reconStatus === '对账中') return { main: '待药厂处理', aux: '对账中', owner: '药厂' };
  if (task.reports.some((r) => r.status === '待审核')) return { main: '执行中', aux: '报告待审核', owner: '药厂' };
  return { main: '执行中', owner: hasPromoItems(task) ? '服务提供商' : '服务提供商' };
}

/** 任务可发起结算的服务月份（存在已审核且未选入结算单的任务量） */
export function settleableMonths(task: Task): string[] {
  const months = task.workloadAssigns
    .filter((a) => a.progress === '已完成' && !a.settledBillNo)
    .map((a) => a.serviceMonth);
  return [...new Set(months)].sort();
}

/** 某服务月份下可发起结算的工作组 */
export function settleableWorkGroups(task: Task, serviceMonth: string): string[] {
  const groups = task.workloadAssigns
    .filter((a) => a.progress === '已完成' && !a.settledBillNo && a.serviceMonth === serviceMonth)
    .map((a) => a.workGroup);
  return [...new Set(groups)];
}

/** 结算明细行是否落入该预算行覆盖范围（服务商 × 品种 × 地区 × 服务月份所属年度） */
export function lineMatchesPlan(plan: BudgetPlan, provider: string, variety: string, region: string, serviceMonth: string): boolean {
  if (provider !== plan.provider) return false;
  if (Number(serviceMonth.slice(0, 4)) !== plan.year) return false;
  if (!plan.varieties.includes(variety)) return false;
  if (plan.regions.includes('全国')) return true;
  return plan.regions.includes(region);
}

/** 派生：预算行实际结算金额 = Σ 已确认结算明细（零分摊，按 服务商×品种×地区×服务月份 落回） */
export function actualAmountOf(plan: BudgetPlan, tasks: Task[]): number {
  let sum = 0;
  tasks.forEach((t) => {
    if (t.provider !== plan.provider) return;
    t.settlements.forEach((bill) => {
      if (!bill.confirmed) return;
      bill.lines.forEach((l) => {
        if (lineMatchesPlan(plan, t.provider, l.variety, l.region, bill.serviceMonth)) {
          sum += l.actualAmount;
        }
      });
    });
  });
  return sum;
}

/** 差异 = 年度预算金额 − 实际结算金额 */
export function budgetDiffOf(plan: BudgetPlan, tasks: Task[]): number {
  return plan.yearAmount - actualAmountOf(plan, tasks);
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${pad(month, 2)}-${pad(d, 2)}`;
}

/** 任务推广时段覆盖的自然月（1-12），用于冻结判定 */
export function monthsCoveredByTask(task: Task, year: number): number[] {
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const start = `${year}-${pad(m, 2)}-01`;
    const end = lastDayOfMonth(year, m);
    if (task.startDate <= end && task.endDate >= start) months.push(m);
  }
  return months;
}

/**
 * 冻结判定：某月该服务商存在「执行中」任务（推广时段覆盖该月）即冻结。
 * 粒度 = 服务商 × 月份，不再按品种/地区细分。
 */
export function frozenMonthsOf(provider: string, year: number, tasks: Task[]): number[] {
  const set = new Set<number>();
  tasks.forEach((t) => {
    if (t.provider !== provider || t.taskStatus !== '执行中') return;
    monthsCoveredByTask(t, year).forEach((m) => set.add(m));
  });
  return [...set].sort((a, b) => a - b);
}

/** 全年结束后整行锁定（演示时钟 DEMO_NOW） */
export function isBudgetYearLocked(year: number): boolean {
  return year < Number(DEMO_NOW.slice(0, 4));
}

interface TaskDataContextValue {
  tasks: Task[];
  budgetPlans: BudgetPlan[];
  varieties: Variety[];
  auths: VarietyProviderAuth[];
  priceItems: PriceItem[];
  priceRatios: PriceRatio[];
  reportPrices: ReportPrice[];
  authorizedProviders: (varietyName: string, region: string) => string[];
  varietiesOf: (provider: string) => string[];
  regionsOf: (provider: string, varieties?: string[]) => string[];
  createBudgetPlan: (input: CreateBudgetPlanInput) => MutationResult<BudgetPlan>;
  updateBudgetPlan: (id: string, patch: { yearAmount?: number; months?: number[] }) => MutationResult<BudgetPlan>;
  createTask: (input: CreateTaskInput, role?: Role) => MutationResult<Task>;
  revokeTask: (id: string) => MutationResult<Task>;
  confirmTask: (id: string) => MutationResult<Task>;
  splitToWorkgroup: (taskId: string, splits: Omit<WorkgroupSplit, 'id'>[]) => MutationResult<Task>;
  assignWorkload: (taskId: string, assigns: Omit<WorkloadAssign, 'id'>[]) => MutationResult<Task>;
  uploadReport: (taskId: string, name: string) => MutationResult<Task>;
  reviewReport: (taskId: string, reportId: string, pass: boolean, comment: string) => MutationResult<Task>;
  startSettlement: (taskId: string, serviceMonth: string, workGroup: string, workloadIds: string[]) => MutationResult<Task>;
  confirmSettlement: (taskId: string, billId: string, lines: SettlementLine[]) => MutationResult<Task>;
  completeSettlement: (taskId: string) => MutationResult<Task>;
  uploadPaymentVoucher: (taskId: string, billId: string, name: string) => MutationResult<Task>;
  createVariety: (input: Omit<Variety, 'id'>) => MutationResult<Variety>;
  updateVariety: (id: string, patch: Partial<Variety>) => MutationResult<Variety>;
  createAuth: (input: CreateAuthInput) => MutationResult<VarietyProviderAuth>;
  updateAuth: (id: string, input: CreateAuthInput) => MutationResult<VarietyProviderAuth>;
  deleteAuth: (id: string) => MutationResult;
  savePriceItems: (varietyId: string, items: PriceItem[]) => MutationResult;
  savePriceRatios: (varietyId: string, ratios: PriceRatio[]) => MutationResult;
  saveReportPrices: (varietyId: string, prices: ReportPrice[]) => MutationResult;
  copyPriceList: (fromVarietyId: string, toVarietyIds: string[]) => MutationResult;
}

const TaskDataContext = createContext<TaskDataContextValue | null>(null);

export function TaskDataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(() => clone(seedTasks));
  const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>(() => clone(seedBudgetPlans));
  const [varieties, setVarieties] = useState<Variety[]>(() => clone(seedVarieties));
  const [auths, setAuths] = useState<VarietyProviderAuth[]>(() => clone(seedAuths));
  const [priceItems, setPriceItems] = useState<PriceItem[]>(() => clone(seedPriceItems));
  const [priceRatios, setPriceRatios] = useState<PriceRatio[]>(() => clone(seedPriceRatios));
  const [reportPrices, setReportPrices] = useState<ReportPrice[]>(() => clone(seedReportPrices));

  const authorizedProviders = useCallback(
    (varietyName: string, region: string) => filterAuthorizedProviders(auths, varietyName, [region]),
    [auths],
  );

  const varietiesOf = useCallback(
    (provider: string) => varietiesOfProvider(auths, provider),
    [auths],
  );

  const regionsOf = useCallback(
    (provider: string, varieties?: string[]) => regionsOfProvider(auths, provider, varieties),
    [auths],
  );

  // ─── 预算计划：纯计划数据，与任务零交点，不阻断任何操作 ───

  const createBudgetPlan = useCallback((input: CreateBudgetPlanInput): MutationResult<BudgetPlan> => {
    if (!input.provider) return { ok: false, error: '请选择服务商' };
    if (!input.varieties?.length) return { ok: false, error: '请选择覆盖品种' };
    if (!input.regions?.length) return { ok: false, error: '请选择覆盖地区' };
    if (!Number.isFinite(input.yearAmount) || input.yearAmount <= 0) return { ok: false, error: '请填写年度预算' };
    const dup = budgetPlans.find((p) => p.year === input.year && p.provider === input.provider);
    if (dup) return { ok: false, error: '同年度、同服务商已有预算行，请直接编辑' };
    const authorizedVarieties = varietiesOfProvider(auths, input.provider);
    for (const variety of input.varieties) {
      if (!authorizedVarieties.includes(variety)) {
        return { ok: false, error: `${input.provider} 未获得「${variety}」的授权` };
      }
    }
    for (const region of input.regions) {
      const covered = input.varieties.some((v) => isPairAuthorized(auths, input.provider, v, region));
      if (!covered) {
        return { ok: false, error: `${input.provider} 未获得所选品种在「${region}」的授权` };
      }
    }
    const base = Math.floor(input.yearAmount / 12);
    const months = input.months ?? Array.from({ length: 12 }, () => base);
    if (input.months) months[11] += input.yearAmount - months.reduce((s, m) => s + m, 0);
    const row: BudgetPlan = {
      id: nextId('BP', budgetPlans.map((p) => p.id)),
      year: input.year,
      provider: input.provider,
      varieties: [...input.varieties],
      regions: [...input.regions],
      yearAmount: Math.round(input.yearAmount),
      months: months.map((m) => Math.round(m)),
      updatedAt: DEMO_NOW,
    };
    setBudgetPlans((prev) => [row, ...prev]);
    return { ok: true, data: row };
  }, [auths, budgetPlans]);

  const updateBudgetPlan = useCallback((
    id: string,
    patch: { yearAmount?: number; months?: number[] },
  ): MutationResult<BudgetPlan> => {
    const row = budgetPlans.find((p) => p.id === id);
    if (!row) return { ok: false, error: '预算行不存在' };
    if (isBudgetYearLocked(row.year)) return { ok: false, error: '该年度已结束，整行锁定不可修改' };
    if (patch.months) {
      const frozen = frozenMonthsOf(row.provider, row.year, tasks);
      const changed = frozen.find((m) => (patch.months![m - 1] ?? 0) !== (row.months[m - 1] ?? 0));
      if (changed != null) return { ok: false, error: `${changed}月已有任务执行中，月度预算已冻结` };
    }
    const next: BudgetPlan = {
      ...row,
      yearAmount: patch.yearAmount != null ? Math.round(patch.yearAmount) : row.yearAmount,
      months: patch.months ? patch.months.map((m) => Math.round(m)) : row.months,
      updatedAt: DEMO_NOW,
    };
    setBudgetPlans((prev) => prev.map((p) => (p.id === id ? next : p)));
    const sum = next.months.reduce((s, m) => s + m, 0);
    const warning = sum !== next.yearAmount
      ? `月度预算合计 ${formatCNY(sum)} 与年度预算 ${formatCNY(next.yearAmount)} 差 ${formatCNY(Math.abs(sum - next.yearAmount))}，已保存（仅提示，不阻断）`
      : undefined;
    return { ok: true, data: next, warning };
  }, [budgetPlans, tasks]);

  // ─── 任务：创建不做任何预算校验 ───

  const createTask = useCallback((input: CreateTaskInput, role: Role = '药厂销售部门'): MutationResult<Task> => {
    if (!input.provider) return { ok: false, error: '请选择服务提供商' };
    if (!input.varieties?.length) return { ok: false, error: '请选择品种' };
    if (!input.regions?.length) return { ok: false, error: '请选择服务地区' };
    if (!input.startDate || !input.endDate) return { ok: false, error: '请选择推广时间' };
    if (input.endDate < input.startDate) return { ok: false, error: '结束日期不能早于开始日期' };
    const items = input.serviceItems.filter((it) => it.amount > 0);
    if (!items.length) return { ok: false, error: '请至少填写一项服务项目的推广金额' };
    if (items.some((it) => !it.variety || !input.varieties.includes(it.variety))) {
      return { ok: false, error: '服务项目必须归属已选品种' };
    }

    for (const variety of input.varieties) {
      for (const region of input.regions) {
        if (!isPairAuthorized(auths, input.provider, variety, region)) {
          return { ok: false, error: `${input.provider} 未获得「${variety}」在「${region}」的授权` };
        }
      }
    }

    const first = varieties.find((v) => v.tradeName === input.varieties[0]);
    const planAmount = items.reduce((s, it) => s + it.amount, 0);
    const n = tasks.length + 1;
    const id = `TR-${pad(n)}`;
    const task: Task = {
      id,
      taskNo: `TK-2026-${pad(n, 4)}`,
      taskName: `${input.varieties.join('、')}_${first?.holder ?? DEMO_HOLDER}`,
      varieties: [...input.varieties],
      provider: input.provider,
      regions: [...input.regions],
      startDate: input.startDate,
      endDate: input.endDate,
      planAmount: Math.round(planAmount),
      settledAmount: 0,
      remainingVoided: false,
      taskStatus: '待确认',
      reconStatus: '未发起',
      createdAt: DEMO_NOW,
      createdBy: ROLE_ACTOR[role],
      serviceItems: items.map((it, i) => ({ ...it, id: it.id || `${id}-SI-${i + 1}` })),
      workgroupSplits: [],
      workloadAssigns: [],
      reports: [],
      settlements: [],
    };
    setTasks((prev) => [task, ...prev]);
    return { ok: true, data: task };
  }, [auths, tasks, varieties]);

  const revokeTask = useCallback((id: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.taskStatus !== '待确认') return { ok: false, error: '仅待确认任务可以撤销' };
    const next: Task = { ...task, taskStatus: '已撤销' };
    setTasks((prev) => prev.map((t) => (t.id === id ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const confirmTask = useCallback((id: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.taskStatus !== '待确认') return { ok: false, error: '仅待确认任务可以确认' };
    const next: Task = { ...task, taskStatus: '执行中' };
    setTasks((prev) => prev.map((t) => (t.id === id ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const splitToWorkgroup = useCallback((taskId: string, splits: Omit<WorkgroupSplit, 'id'>[]): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.taskStatus !== '执行中') return { ok: false, error: '仅执行中任务可拆解' };
    const sum = splits.reduce((s, x) => s + x.amount, 0);
    if (sum > task.planAmount) return { ok: false, error: `累计拆解金额 ${formatCNY(sum)} 超过计划总金额 ${formatCNY(task.planAmount)}` };
    if (splits.some((s) => !s.workGroup || !s.variety || !s.region || s.amount <= 0)) {
      return { ok: false, error: '请完整填写工作组、品种、地区、推广金额和时区' };
    }
    if (splits.some((s) => !task.varieties.includes(s.variety) || !task.regions.includes(s.region))) {
      return { ok: false, error: '拆解的品种/地区必须属于本任务覆盖范围' };
    }
    const next: Task = {
      ...task,
      workgroupSplits: splits.map((s, i) => ({ ...s, id: `${taskId}-WG-${i + 1}` })),
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const assignWorkload = useCallback((taskId: string, assigns: Omit<WorkloadAssign, 'id'>[]): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.workgroupSplits.length === 0) return { ok: false, error: '请先拆分任务包到工作组' };
    if (assigns.some((a) => !a.specialist || !a.variety || !a.region || a.workload <= 0 || a.amount <= 0 || !a.serviceMonth || !a.itemName)) {
      return { ok: false, error: '请完整填写品种、地区、服务项目、服务月份、专员、工作量和金额' };
    }
    if (assigns.some((a) => !task.varieties.includes(a.variety) || !task.regions.includes(a.region))) {
      return { ok: false, error: '工作量的品种/地区必须属于本任务覆盖范围' };
    }
    // 已选入结算单的任务量不可被覆盖移除
    const kept = new Set(assigns.map((a) => `${a.specialist}|${a.serviceMonth}|${a.itemName}`));
    const droppedSettled = task.workloadAssigns.some(
      (a) => a.settledBillNo && !kept.has(`${a.specialist}|${a.serviceMonth}|${a.itemName}`),
    );
    if (droppedSettled) return { ok: false, error: '已选入结算单的任务量不可移除，请保留对应记录' };
    const next: Task = {
      ...task,
      workloadAssigns: assigns.map((a, i) => ({ ...a, id: `${taskId}-WL-${i + 1}` })),
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const uploadReport = useCallback((taskId: string, name: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (!name.trim()) return { ok: false, error: '请填写报告名称' };
    const report = {
      id: `${taskId}-RP-${task.reports.length + 1}`,
      name: name.trim(),
      uploadedAt: DEMO_NOW,
      uploadedBy: DEMO_PROVIDER,
      status: '待审核' as const,
      comment: '',
    };
    const next: Task = { ...task, reports: [...task.reports, report] };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const reviewReport = useCallback((taskId: string, reportId: string, pass: boolean, comment: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (!pass && !comment.trim()) return { ok: false, error: '驳回意见必填' };
    const next: Task = {
      ...task,
      reports: task.reports.map((r) => r.id === reportId
        ? { ...r, status: pass ? '通过' : '驳回', comment: comment.trim() }
        : r),
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  // ─── 按服务月份结算：先选月份、勾选该月已审核任务量；一张结算单只对应一个月份 ───

  const startSettlement = useCallback((taskId: string, serviceMonth: string, workGroup: string, workloadIds: string[]): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.taskStatus !== '执行中') return { ok: false, error: '仅执行中任务可发起结算' };
    if (task.reconStatus === '对账中') return { ok: false, error: '已有结算单待确认' };
    if (!/^\d{4}-\d{2}$/.test(serviceMonth)) return { ok: false, error: '请选择服务月份' };
    if (!workGroup) return { ok: false, error: '请选择工作组' };

    const chosen = task.workloadAssigns.filter((a) => workloadIds.includes(a.id));
    if (!chosen.length) return { ok: false, error: '请勾选该月该工作组已审核的任务量' };
    const invalid = chosen.find((a) => a.progress !== '已完成' || a.settledBillNo || a.serviceMonth !== serviceMonth || a.workGroup !== workGroup);
    if (invalid) return { ok: false, error: '只能选择该服务月份、该工作组下已审核且未结算的任务量' };

    // 按 品种×地区×服务类型×服务项目 汇总成结算单明细行（零分摊）
    const grouped = new Map<string, SettlementLine>();
    chosen.forEach((a) => {
      const key = `${a.variety}|${a.region}|${a.category}|${a.itemName}`;
      const exist = grouped.get(key);
      if (exist) {
        exist.serviceAmount += a.amount;
        exist.actualAmount += a.amount;
      } else {
        grouped.set(key, {
          id: key,
          variety: a.variety,
          region: a.region,
          serviceType: a.category,
          serviceItem: a.itemName,
          serviceAmount: a.amount,
          actualAmount: a.amount,
          remark: '',
        });
      }
    });
    const lines = [...grouped.values()].map((l, i) => ({ ...l, id: `${taskId}-L-${Date.now()}-${i}` }));
    const amount = lines.reduce((s, l) => s + l.actualAmount, 0);
    const remain = remainingOfTask(task);
    if (amount <= 0) return { ok: false, error: '结算金额须大于 0' };
    if (amount > remain) return { ok: false, error: `结算金额 ${formatCNY(amount)} 超过剩余可结算金额 ${formatCNY(remain)}` };

    const seq = task.settlements.length + 1;
    const billNo = `JS-2026-${task.taskNo.slice(-4)}-${pad(seq, 2)}`;
    const bill: SettlementBill = {
      id: `${taskId}-SB-${seq}`,
      billNo,
      contractNo: 'HT-2026-BY-001',
      workGroup,
      servicePeriod: `${task.startDate} ~ ${task.endDate}`,
      serviceMonth,
      madeAt: '2026-08-24',
      provider: task.provider,
      lines,
      finalAmount: amount,
      confirmed: false,
    };
    const next: Task = {
      ...task,
      reconStatus: '对账中',
      settlements: [...task.settlements, bill],
      workloadAssigns: task.workloadAssigns.map((a) => (workloadIds.includes(a.id) ? { ...a, settledBillNo: billNo } : a)),
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const confirmSettlement = useCallback((taskId: string, billId: string, lines: SettlementLine[]): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    const bill = task.settlements.find((b) => b.id === billId);
    if (!bill || bill.confirmed) return { ok: false, error: '结算单不存在或已确认' };
    if (lines.some((l) => !l.variety || !l.region)) return { ok: false, error: '结算明细须包含品种和地区' };
    const changed = lines.some((l, i) => l.actualAmount !== bill.lines[i]?.actualAmount);
    if (changed && lines.some((l, i) => l.actualAmount !== bill.lines[i]?.actualAmount && !l.remark.trim())) {
      return { ok: false, error: '调整实际结算金额时备注必填（调整原因，及与服务商达成一致的确认信息）' };
    }
    const finalAmount = lines.reduce((s, l) => s + l.actualAmount, 0);
    const remain = remainingOfTask(task);
    if (finalAmount > remain) return { ok: false, error: `实际结算金额超过剩余可结算金额 ${formatCNY(remain)}` };
    const newSettled = task.settledAmount + finalAmount;
    const allCleared = newSettled >= task.planAmount;
    const nextBills = task.settlements.map((b) => b.id === billId
      ? { ...b, lines, finalAmount, confirmed: true, confirmedAt: DEMO_NOW, confirmedBy: '李强' }
      : b);
    const next: Task = {
      ...task,
      settledAmount: newSettled,
      reconStatus: '已结算',
      taskStatus: allCleared ? '已结算' : '执行中',
      settlements: nextBills,
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const completeSettlement = useCallback((taskId: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.taskStatus === '已结算' && task.remainingVoided) return { ok: false, error: '任务已结算完结' };
    const remain = remainingOfTask(task);
    const next: Task = {
      ...task,
      remainingVoided: remain > 0,
      taskStatus: '已结算',
      reconStatus: '已结算',
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const uploadPaymentVoucher = useCallback((taskId: string, billId: string, name: string): MutationResult<Task> => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (!name.trim()) return { ok: false, error: '请填写凭证文件名' };
    const next: Task = {
      ...task,
      settlements: task.settlements.map((b) => b.id === billId ? { ...b, paymentVoucher: name.trim() } : b),
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)));
    return { ok: true, data: next };
  }, [tasks]);

  const createVariety = useCallback((input: Omit<Variety, 'id'>): MutationResult<Variety> => {
    if (!input.genericName || !input.tradeName) return { ok: false, error: '请填写通用名和商品名' };
    const id = nextId('V', varieties.map((v) => v.id));
    const row: Variety = { ...input, id, holder: input.holder || DEMO_HOLDER };
    setVarieties((prev) => [...prev, row]);
    return { ok: true, data: row };
  }, [varieties]);

  const updateVariety = useCallback((id: string, patch: Partial<Variety>): MutationResult<Variety> => {
    const row = varieties.find((v) => v.id === id);
    if (!row) return { ok: false, error: '品种不存在' };
    const next = { ...row, ...patch, id };
    setVarieties((prev) => prev.map((v) => (v.id === id ? next : v)));
    return { ok: true, data: next };
  }, [varieties]);

  const assertAuthUnique = useCallback((input: CreateAuthInput, exceptId?: string): string | undefined => {
    if (!input.provider || !input.varietyId || input.regions.length === 0) return '请填写服务提供方、品种和管理区域';
    const variety = varieties.find((v) => v.id === input.varietyId);
    const others = auths.filter((a) => a.id !== exceptId && a.varietyId === input.varietyId);
    for (const region of input.regions) {
      const hit = others.find((a) => {
        if (region === '全国' || a.regions.includes('全国')) return a.provider !== input.provider;
        return a.regions.includes(region) && a.provider !== input.provider;
      });
      if (hit) {
        return `针对${variety?.tradeName || '该品种'}，区域「${region === '全国' ? '全国' : region}」已授权给${hit.provider}，同一管理区域内仅能对应一家服务提供方`;
      }
    }
    return undefined;
  }, [auths, varieties]);

  const createAuth = useCallback((input: CreateAuthInput): MutationResult<VarietyProviderAuth> => {
    const err = assertAuthUnique(input);
    if (err) return { ok: false, error: err };
    const variety = varieties.find((v) => v.id === input.varietyId)!;
    const row: VarietyProviderAuth = {
      id: nextId('AUTH', auths.map((a) => a.id)),
      provider: input.provider,
      varietyId: input.varietyId,
      varietyName: variety.tradeName,
      holder: variety.holder,
      regions: [...input.regions],
    };
    setAuths((prev) => [row, ...prev]);
    return { ok: true, data: row };
  }, [assertAuthUnique, auths, varieties]);

  const updateAuth = useCallback((id: string, input: CreateAuthInput): MutationResult<VarietyProviderAuth> => {
    const err = assertAuthUnique(input, id);
    if (err) return { ok: false, error: err };
    const row = auths.find((a) => a.id === id);
    if (!row) return { ok: false, error: '授权记录不存在' };
    const variety = varieties.find((v) => v.id === input.varietyId)!;
    const next: VarietyProviderAuth = {
      ...row,
      provider: input.provider,
      varietyId: input.varietyId,
      varietyName: variety.tradeName,
      holder: variety.holder,
      regions: [...input.regions],
    };
    setAuths((prev) => prev.map((a) => (a.id === id ? next : a)));
    return { ok: true, data: next };
  }, [assertAuthUnique, auths, varieties]);

  const deleteAuth = useCallback((id: string): MutationResult => {
    setAuths((prev) => prev.filter((a) => a.id !== id));
    return { ok: true };
  }, []);

  const savePriceItems = useCallback((varietyId: string, items: PriceItem[]): MutationResult => {
    setPriceItems((prev) => [...prev.filter((p) => p.varietyId !== varietyId), ...items]);
    return { ok: true };
  }, []);

  const savePriceRatios = useCallback((varietyId: string, ratios: PriceRatio[]): MutationResult => {
    const sum = ratios.reduce((s, r) => s + r.ratio, 0);
    if (sum !== 100) return { ok: false, error: `工作量比例合计必须为 100%，当前为 ${sum}%` };
    setPriceRatios((prev) => [...prev.filter((p) => p.varietyId !== varietyId), ...ratios]);
    return { ok: true };
  }, []);

  const saveReportPrices = useCallback((varietyId: string, prices: ReportPrice[]): MutationResult => {
    const sum = prices.reduce((s, r) => s + r.ratio, 0);
    if (sum !== 100) return { ok: false, error: `报告比例合计必须为 100%，当前为 ${sum}%` };
    setReportPrices((prev) => [...prev.filter((p) => p.varietyId !== varietyId), ...prices]);
    return { ok: true };
  }, []);

  const copyPriceList = useCallback((fromVarietyId: string, toVarietyIds: string[]): MutationResult => {
    if (!toVarietyIds.length) return { ok: false, error: '请选择目标品种' };
    const srcItems = priceItems.filter((p) => p.varietyId === fromVarietyId);
    const srcRatios = priceRatios.filter((p) => p.varietyId === fromVarietyId);
    const srcReports = reportPrices.filter((p) => p.varietyId === fromVarietyId);
    setPriceItems((prev) => {
      let next = prev.filter((p) => !toVarietyIds.includes(p.varietyId));
      toVarietyIds.forEach((vid) => {
        next = next.concat(srcItems.map((it, i) => ({ ...it, id: `PI-${vid}-${i + 1}`, varietyId: vid })));
      });
      return next;
    });
    setPriceRatios((prev) => {
      let next = prev.filter((p) => !toVarietyIds.includes(p.varietyId));
      toVarietyIds.forEach((vid) => {
        next = next.concat(srcRatios.map((it, i) => ({ ...it, id: `PR-${vid}-${i + 1}`, varietyId: vid })));
      });
      return next;
    });
    setReportPrices((prev) => {
      let next = prev.filter((p) => !toVarietyIds.includes(p.varietyId));
      toVarietyIds.forEach((vid) => {
        next = next.concat(srcReports.map((it, i) => ({ ...it, id: `RP-${vid}-${i + 1}`, varietyId: vid })));
      });
      return next;
    });
    return { ok: true };
  }, [priceItems, priceRatios, reportPrices]);

  const value = useMemo<TaskDataContextValue>(() => ({
    tasks, budgetPlans, varieties, auths, priceItems, priceRatios, reportPrices,
    authorizedProviders, varietiesOf, regionsOf,
    createBudgetPlan, updateBudgetPlan,
    createTask, revokeTask, confirmTask,
    splitToWorkgroup, assignWorkload, uploadReport, reviewReport,
    startSettlement, confirmSettlement, completeSettlement, uploadPaymentVoucher,
    createVariety, updateVariety, createAuth, updateAuth, deleteAuth,
    savePriceItems, savePriceRatios, saveReportPrices, copyPriceList,
  }), [
    tasks, budgetPlans, varieties, auths, priceItems, priceRatios, reportPrices,
    authorizedProviders, varietiesOf, regionsOf,
    createBudgetPlan, updateBudgetPlan,
    createTask, revokeTask, confirmTask,
    splitToWorkgroup, assignWorkload, uploadReport, reviewReport,
    startSettlement, confirmSettlement, completeSettlement, uploadPaymentVoucher,
    createVariety, updateVariety, createAuth, updateAuth, deleteAuth,
    savePriceItems, savePriceRatios, saveReportPrices, copyPriceList,
  ]);

  return <TaskDataContext.Provider value={value}>{children}</TaskDataContext.Provider>;
}

export function useTaskData(): TaskDataContextValue {
  const ctx = useContext(TaskDataContext);
  if (!ctx) throw new Error('useTaskData must be used within TaskDataProvider');
  return ctx;
}

// 仅保留类型导出给页面使用
export type { ServiceItem };
