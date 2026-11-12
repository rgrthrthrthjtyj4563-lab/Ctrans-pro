/**
 * 业务明细导出「新建报告」抽屉的数据适配层（Figma Make 稿接入，2026-11）。
 *
 * 与旧三步向导的数据口径差异：
 * - 对账单列表来自真实结算单（已确认 && 未作废 && 会话业务范围内），编号沿用结算单 billNo
 *   （如 JS-2026-0004-01），不再使用旧稿的 DZ- 演示编号，也不取「最近一张对账单」默认值；
 * - 摘要按所选范围实时统计：拜访类（学术/日常/调研）数真实拜访记录，结算类（科室会议/
 *   学术推广/研究报告）数结算单明细行（每行 = 1 条已确认业务记录）；
 * - 组合条件按「业务归属月份」筛选（拜访 = visitDate 月份，结算行 = 结算单 serviceMonth），
 *   支持跨结算单聚合；
 * - 文件生成仍是原型演示：提交只产生任务状态机（生成中/已生成/失败），不产出真实文件。
 */
import { varietyInScope } from '../../data/cooperationModel';
import type { Task, VisitRecord } from '../../types';

export type ExportFormat = 'pdf' | 'excel';
export type ExportFileState = 'generating' | 'generated' | 'failed';
export type ExportMode = 'bill' | 'combo';
export type SummaryState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

/** 六类业务类型（与旧向导 buildBizTypes 同一套分类口径） */
export interface BizTypeCount {
  id: string;
  name: string;
  count: number;
}

export const BIZ_TYPE_DEFS: { id: string; name: string }[] = [
  { id: 'seminar', name: '学术拜访服务' },
  { id: 'visit', name: '日常拜访服务' },
  { id: 'dept', name: '科室会议服务' },
  { id: 'promo', name: '学术推广服务' },
  { id: 'survey', name: '调研问访服务' },
  { id: 'report', name: '研究报告服务' },
];

/** 拜访类别 → 业务类型（科室拜访/科室会为 TR-003 材料包口径，分别归入日常拜访/科室会议） */
const VISIT_CATEGORY_MAP: Record<string, string> = {
  学术拜访: 'seminar',
  日常拜访: 'visit',
  跟踪巡访服务: 'visit',
  科室拜访: 'visit',
  科室会: 'dept',
  信息收集和调研: 'survey',
};

/** 结算行服务项目 → 业务类型；医院/商业拜访行不映射（避免与拜访记录重复计数） */
const BILL_ITEM_TYPE_MAP: Record<string, string> = {
  科室会议: 'dept',
  学术推广: 'promo',
};

function lineItemTypeOf(itemName: string, categoryName: string): string | null {
  if (BILL_ITEM_TYPE_MAP[itemName]) return BILL_ITEM_TYPE_MAP[itemName];
  if (categoryName === '分析报告服务' || itemName.includes('研究报告')) return 'report';
  return null;
}

/** 会话口径判定由页面注入（useServingScope + usePharmaRegionScope 的叠加结果） */
export interface DrawerDataCtx {
  tasks: Task[];
  visits: VisitRecord[];
  taskInScope: (t: Task) => boolean;
  visitInScope: (v: VisitRecord) => boolean;
}

/* ─── 按对账单：可选结算单清单 ─────────────────────────────────────────────── */

export interface SelectableBill {
  billId: string;
  billNo: string;
  provider: string;
  holderPharma: string;
  varieties: string[];
  varietyLabel: string;
  /** 执行归属月份 YYYY-MM（结算单口径；空 = 未标注 */
  serviceMonth: string;
  servicePeriod: string;
  taskId: string;
  finalAmount: number;
  /** 结算行按业务类型的条数（行 = 条） */
  lineTypeCounts: Record<string, number>;
  /** 结算行凭证金额合计 */
  lineVoucherAmount: number;
}

export function listSelectableBills(ctx: DrawerDataCtx): SelectableBill[] {
  const bills: SelectableBill[] = [];
  ctx.tasks.forEach((t) => {
    if (!ctx.taskInScope(t)) return;
    t.settlements.forEach((b) => {
      // 仅授权范围内、已确认且未作废的单据可选（真实状态判定）
      if (b.voided || !b.confirmed) return;
      const lineTypeCounts: Record<string, number> = {};
      let lineVoucherAmount = 0;
      b.lines.forEach((l) => {
        const type = lineItemTypeOf(l.serviceItem, l.serviceType);
        if (type) lineTypeCounts[type] = (lineTypeCounts[type] ?? 0) + 1;
        lineVoucherAmount += l.actualAmount;
      });
      const varieties = [...new Set(b.lines.map((l) => l.variety))];
      bills.push({
        billId: b.id,
        billNo: b.billNo,
        provider: t.provider,
        holderPharma: t.holderPharma ?? '',
        varieties,
        varietyLabel: varieties.join('、') || (t.varieties[0] ?? ''),
        serviceMonth: b.serviceMonth ?? '',
        servicePeriod: b.servicePeriod,
        taskId: t.id,
        finalAmount: b.finalAmount,
        lineTypeCounts,
        lineVoucherAmount,
      });
    });
  });
  return bills.sort((a, b) => (a.billNo < b.billNo ? 1 : -1));
}

/* ─── 摘要统计 ────────────────────────────────────────────────────────────── */

export interface ScopeSummary {
  types: BizTypeCount[];
  totalCount: number;
  /** 凭证生成金额（拜访金额 + 结算行实际金额） */
  voucherAmount: number;
  /** 结算单申报金额（凭证上浮 ~2.1%，与旧向导口径一致） */
  declaredAmount: number;
  /** 关联任务服务地区（药厂区域范围下的行可见性锚点） */
  regions: string[];
}

const declaredOf = (amount: number) => Math.round((amount * 1.021) / 10) * 10;

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(BIZ_TYPE_DEFS.map((t) => [t.id, 0]));
}

function buildSummary(
  counts: Record<string, number>,
  voucherAmount: number,
  regions: string[],
): ScopeSummary {
  const types = BIZ_TYPE_DEFS.map((t) => ({ ...t, count: counts[t.id] ?? 0 }));
  return {
    types,
    totalCount: types.reduce((s, t) => s + t.count, 0),
    voucherAmount,
    declaredAmount: declaredOf(voucherAmount),
    regions,
  };
}

/** 按对账单摘要：拜访类数真实拜访记录（任务归集 + 归属月份），结算类数本单明细行 */
export function summarizeBill(ctx: DrawerDataCtx, bill: SelectableBill): ScopeSummary {
  const counts = emptyCounts();
  let voucherAmount = bill.lineVoucherAmount;
  Object.entries(bill.lineTypeCounts).forEach(([type, n]) => {
    counts[type] = (counts[type] ?? 0) + n;
  });
  ctx.visits.forEach((v) => {
    if (!ctx.visitInScope(v)) return;
    if (v.provider !== bill.provider || v.holderPharma !== bill.holderPharma) return;
    const monthOk = !bill.serviceMonth || v.visitDate.slice(0, 7) === bill.serviceMonth;
    if (!monthOk) return;
    // 任务归集记录（taskId）或品种命中本单品种的散点记录
    const hit =
      v.taskId === bill.taskId ||
      bill.varieties.some((vv) => varietyInScope(v.variety, [vv]));
    if (!hit) return;
    const type = VISIT_CATEGORY_MAP[v.visitCategory];
    if (!type) return;
    counts[type] += 1;
    voucherAmount += v.amount;
  });
  const task = ctx.tasks.find((t) => t.id === bill.taskId);
  return buildSummary(counts, voucherAmount, task ? [...task.regions] : []);
}

/* ─── 按组合条件 ──────────────────────────────────────────────────────────── */

export interface ComboConditions {
  /** 起点 'YYYY-MM'（按月）或 'YYYY-MM-DD'（按日），含边界 */
  monthStart: string;
  /** 终点，格式同起点，含边界 */
  monthEnd: string;
  /** 服务提供方；'' = 全部（服务商会话由抽屉固定为本企业后传入） */
  provider: string;
  /** 工作组；'' = 全部 */
  workgroup: string;
  /** 品种；'' = 全部 */
  variety: string;
  /** 服务专员；'' = 全部 */
  specialist: string;
}

/** 条件值的归属月（按月 'YYYY-MM' / 按日 'YYYY-MM-DD' 统一取前缀） */
const monthOfValue = (v: string) => v.slice(0, 7);

/** 拜访按 visitDate 过滤：按日时比较完整日期，按月时含边界整月 */
const visitInRange = (visitDate: string, c: ComboConditions) => {
  if (c.monthEnd.length === 10) return visitDate >= c.monthStart && visitDate <= c.monthEnd;
  const m = visitDate.slice(0, 7);
  return m >= c.monthStart && m <= c.monthEnd;
};

/** 结算数据只有归属月粒度：比较归属月是否落在区间月份（含边界月） */
const monthInRange = (m: string, c: ComboConditions) =>
  m >= monthOfValue(c.monthStart) && m <= monthOfValue(c.monthEnd);

/** 组合条件摘要：拜访按 visitDate 月份、结算行按 serviceMonth，跨结算单聚合 */
export function summarizeCombo(ctx: DrawerDataCtx, c: ComboConditions): ScopeSummary {
  const counts = emptyCounts();
  let voucherAmount = 0;
  const regions = new Set<string>();
  ctx.visits.forEach((v) => {
    if (!ctx.visitInScope(v)) return;
    if (c.provider && v.provider !== c.provider) return;
    if (c.workgroup && v.workGroup !== c.workgroup) return;
    if (c.variety && !varietyInScope(v.variety, [c.variety])) return;
    if (c.specialist && v.specialist !== c.specialist) return;
    if (!visitInRange(v.visitDate, c)) return;
    const type = VISIT_CATEGORY_MAP[v.visitCategory];
    if (!type) return;
    counts[type] += 1;
    voucherAmount += v.amount;
  });
  ctx.tasks.forEach((t) => {
    if (!ctx.taskInScope(t)) return;
    if (c.provider && t.provider !== c.provider) return;
    t.settlements.forEach((b) => {
      if (b.voided || !b.confirmed || !b.serviceMonth) return;
      if (!monthInRange(b.serviceMonth, c)) return;
      if (c.workgroup && b.workGroup !== c.workgroup) return;
      t.regions.forEach((r) => regions.add(r));
      b.lines.forEach((l) => {
        if (c.variety && !varietyInScope(l.variety, [c.variety])) return;
        const type = lineItemTypeOf(l.serviceItem, l.serviceType);
        if (!type) return;
        counts[type] += 1;
        voucherAmount += l.actualAmount;
      });
    });
  });
  return buildSummary(counts, voucherAmount, [...regions]);
}

/* ─── 组合条件下拉选项（随上级选择级联） ──────────────────────────────────── */

export interface ComboOptionPools {
  providers: string[];
  workgroups: string[];
  varieties: string[];
  specialists: string[];
}

/** 可选值池：始终取会话范围内真实出现过的值；上级条件变化后由抽屉清理失效选择 */
export function comboOptionPools(ctx: DrawerDataCtx, c: Partial<ComboConditions>): ComboOptionPools {
  const providers = new Set<string>();
  const workgroups = new Set<string>();
  const varieties = new Set<string>();
  const specialists = new Set<string>();
  ctx.visits.forEach((v) => {
    if (!ctx.visitInScope(v)) return;
    providers.add(v.provider);
    if (c.provider && v.provider !== c.provider) return;
    varieties.add(v.variety);
    workgroups.add(v.workGroup);
    if (!c.workgroup || v.workGroup === c.workgroup) specialists.add(v.specialist);
  });
  ctx.tasks.forEach((t) => {
    if (!ctx.taskInScope(t)) return;
    if (c.provider && t.provider !== c.provider) return;
    t.settlements.forEach((b) => {
      if (b.voided || !b.confirmed) return;
      providers.add(t.provider);
      workgroups.add(b.workGroup);
      b.lines.forEach((l) => varieties.add(l.variety));
    });
  });
  const sorted = (s: Set<string>) => [...s].filter(Boolean).sort();
  return { providers: sorted(providers), workgroups: sorted(workgroups), varieties: sorted(varieties), specialists: sorted(specialists) };
}

/* ─── 提交载荷 ────────────────────────────────────────────────────────────── */

export interface ExportRequest {
  mode: ExportMode;
  /** 对账单编号；组合条件报告为空串（列表显示「—」） */
  billNo: string;
  billId: string;
  /** 报告名称（自动生成） */
  name: string;
  provider: string;
  holderPharma: string;
  /** 品种展示值（全部品种时为空） */
  variety: string;
  /** 关联任务服务地区（区域可见性锚点） */
  regions: string[];
  records: number;
  typeNames: string[];
  formats: ExportFormat[];
  /** 范围主展示（单号或月份区间） */
  scopeLabel: string;
  scopeTags: string[];
  voucherAmount: number;
  declaredAmount: number;
  /** 演示开关：模拟一种格式生成失败（默认 false，正常结果全部生成成功） */
  simulateFailure: boolean;
}

/** '2026-09' → '2026年9月' */
export function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** 周期条件展示：'YYYY-MM' → '2026年9月'；'YYYY-MM-DD' → '2026年9月15日' */
export function periodLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${y}年${Number(m)}月${Number(d)}日`;
  }
  return monthLabel(value);
}
