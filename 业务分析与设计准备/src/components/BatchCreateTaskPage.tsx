import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { ArrowLeft } from "lucide-react"
import { Modal } from "./Modal"
import { ConfirmDialog } from "./ConfirmDialog"
import { Button } from "./Button"
import { Tag } from "./StatusTag"
import {
  defaultSettlementPeriods,
  isPriceBookActive,
  recommendedBudget,
  varietyPriceBook,
} from "../domain/taskV4"
import { useTaskData, type MutationResult } from "../context/TaskDataContext"
import {
  amountForQty,
  deriveCategoryItems,
  sameAmount,
  splitAmountAcrossCombos,
  splitBudgetEvenly,
  splitQtyAcrossCombos,
  type PlanItemState,
} from "../domain/batchAdjust"
import {
  REPORT_GROUP_TITLE,
  REPORT_SERVICE_CATEGORIES,
  serviceCategoryFullName,
  serviceCategoryLabel,
  serviceCategoryShort,
  formatCNY,
} from "../constants"
import type {
  CreateTaskInput,
  PriceBook,
  PriceBookRule,
  RoundingLog,
  ServiceCategory,
  ServiceItem,
  Task,
} from "../types"
import type { ToastMessage } from "./Toast"

/**
 * 多服务商批量发包（两步，应用内整页：任务执行页点「创建任务」整体切换进来）：
 * ① 多选品种（限同一张价目表）→ 带出授权地区与可承接服务商（可移除/重加）→ 勾服务类别
 *   （市场推广服务 + 报告组「调研与报告一体化服务」三类子服务）→ 调整统一业务比例。
 * ② 预算在已选服务类别间平均回填为类别计划金额 → 按统一比例派生项目计划金额与整数测算数量；
 *   需要时进「调整工作量」弹窗改数量（推广区含「调查问卷」行；报告区按子服务页签编辑）→ 一次提交。
 * 计算顺序：预算 → 类别平均 → 比例分配金额 → 金额÷单价取整数量；初始金额不因取整反写，
 * 地区是执行范围、不参与均摊与取整。提交后每家服务商生成独立任务，走原有确认 / 拆解 / 审核 / 结算链路。
 * 推广「调查问卷」的计划份数在此录入，是下游 拆包→工作组→专员 二维码链路的额度来源（2026-11-20 迭代）。
 * 离开页面时自动保存未完成草稿（localStorage），下次进入恢复；提交全部成功后草稿清除。
 */

const MEMORY_KEY = "by-create-task-memory"
const DRAFT_KEY = "by-create-task-draft-v2"

const STEP_LABELS = ["品种、地区、比例与服务商", "预算回填与提交"]

/** AI 统筹建议：分析步骤文案与每次打开的免费额度（会话态，不落草稿） */
const AI_STEPS = [
  "梳理本企业往期任务",
  "检查本次业务比例",
  "归纳同类任务配置特征",
]
const AI_QUOTA_TOTAL = 10

const PROMO_CATEGORY: ServiceCategory = "市场推广服务"

/** 新建任务默认勾选：仅市场推广服务（2026-11-20 迭代 §2.1） */
const DEFAULT_CAT_ON: Record<string, boolean> = {
  市场推广服务: true,
  分析报告服务: false,
  问卷调研与分析服务: false,
  数据收集与报表提交服务: false,
}

/** 服务商的计划状态：预算快照 + 各类别分配（初始金额 / 初始数量 / 当前值 / 调整标记） */
interface CatPlanState {
  /** 类别分配基准：初始＝预算平均分配值，用户改类别金额后随之更新；弹窗保存不改变它 */
  baseline: number
  /** 用户是否已主动修改过该类别（金额或数量）：true 后不再按统一比例自动重派生 */
  frozen: boolean
  items: Record<string, PlanItemState>
}

/** 预算快照：金额 + 是否已配置（区分「已配置为 ¥0」与「未配置」） */
interface BudgetSnapshot {
  amount: number
  configured: boolean
}

interface ProviderPlanState {
  /** 进入第二步时的预算快照（金额来源），之后不随第一步选择变化自动改写 */
  budget: BudgetSnapshot
  categories: Partial<Record<ServiceCategory, CatPlanState>>
}

type PlanMap = Record<string, ProviderPlanState>

/** 弹窗草稿单元格：数量输入文本 + 该数量对应的显示金额 */
interface WorkDraftCell {
  text: string
  amount: number
}

/** 草稿保存时间戳：M-D HH:mm */
function stampNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface BatchDraft {
  savedAt: string
  step: number
  varietySel: string[]
  startDate: string
  endDate: string
  remember: boolean
  pickedRegions: string[]
  catOn: Record<string, boolean>
  ratioDraft: Record<string, string>
  /** 旧版（按品种选问卷）遗留字段：仅用于恢复时识别旧草稿并给出复核提示，新草稿不再写入 */
  surveyPick?: Record<string, string>
  removed: string[]
  plans: PlanMap
  vendorSearch: string
  invalidOnly: boolean
  pasteText: string
}

/** 价目表按类别分组（保持价目表内顺序；全部类别按价目规则计价） */
function visibleGroups(
  book: PriceBook | undefined,
): { category: ServiceCategory; rules: PriceBookRule[] }[] {
  if (!book) return []
  const order: ServiceCategory[] = []
  const map = new Map<ServiceCategory, PriceBookRule[]>()
  book.rules.forEach((r) => {
    if (!map.has(r.category)) {
      map.set(r.category, [])
      order.push(r.category)
    }
    map.get(r.category)!.push(r)
  })
  return order.map((category) => ({ category, rules: map.get(category)! }))
}

/** 价目表比例归一化为百分比，作为比例输入的预填值 */
function defaultRatiosFor(book: PriceBook | undefined): Record<string, string> {
  const draft: Record<string, string> = {}
  visibleGroups(book).forEach((g) => {
    const weight = g.rules.reduce((s, r) => s + r.ratio, 0) || 1
    g.rules.forEach((r) => {
      draft[r.name] = String(Math.round((r.ratio / weight) * 10000) / 100)
    })
  })
  return draft
}

const cents = (v: number) => Math.round(v * 100) / 100

/**
 * 恢复的草稿计划对齐当前价目表：剔除价目中已不存在的项目与空类别。
 * 旧版「按品种选问卷」类别的项目名（问卷名 · 品种）不会匹配新价目规则，
 * 恢复后由待复核提示引导用户重新配置该类别（2026-11-20 迭代 §5）。
 */
function sanitizePlans(plans: PlanMap, book: PriceBook | undefined): PlanMap {
  if (!book) return plans
  const ruleNames = new Map<string, Set<string>>()
  book.rules.forEach((r) => {
    const set = ruleNames.get(r.category) ?? new Set<string>()
    set.add(r.name)
    ruleNames.set(r.category, set)
  })
  const next: PlanMap = {}
  Object.entries(plans).forEach(([provider, p]) => {
    const categories: Partial<Record<ServiceCategory, CatPlanState>> = {}
    Object.entries(p.categories).forEach(([cat, state]) => {
      const allowed = ruleNames.get(cat)
      if (!allowed) return
      const items = Object.fromEntries(
        Object.entries(state.items).filter(([name]) => allowed.has(name)),
      )
      if (Object.keys(items).length)
        categories[cat as ServiceCategory] = { ...state, items }
    })
    next[provider] = { ...p, categories }
  })
  return next
}

interface SubmitOutcome {
  provider: string
  ok: boolean
  taskNo?: string
  planAmount?: number
  error?: string
  warning?: string
}

interface Props {
  onClose: () => void
  addToast: (msg: Omit<ToastMessage, "id">) => void
  /** 创建任务的服务委托方（本厂）名称；任务随会话按本厂隔离 */
  holderPharma: string
}

const bctCss = `
.bct-card{border:1px solid var(--color-border);border-radius:10px;padding:16px;margin-top:14px;background:#fff}
.bct-card>h4{margin:0;font-size:15px;color:var(--color-text-1)}
.bct-card>.bct-desc{color:#8A94A5;font-size:12px;margin:4px 0 14px}
.bct-form{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:14px}
.bct-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.bct-field>span{color:#667185;font-size:12px}
.bct-field input,.bct-field select{height:34px;border:1px solid var(--color-border);border-radius:6px;padding:0 10px;font:inherit;color:var(--color-text-1);background:#fff;width:100%}
.bct-subhead{display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px;padding-top:14px;border-top:1px solid #F3F4F6}
.bct-subhead h5{margin:0;font-size:13px;color:var(--color-text-1)}
.bct-subhead p{margin:3px 0 0;font-size:11px;color:#8A94A5}
.bct-region-picker{display:flex;flex-wrap:wrap;gap:8px;max-height:150px;overflow-y:auto;padding:2px 0 4px}
.bct-region-picker label{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #DFE5ED;border-radius:6px;color:#5D6B7D;font-size:12px;cursor:pointer;background:#fff}
.bct-region-picker label.checked{background:var(--color-brand-subtle);border-color:var(--color-brand);color:var(--color-brand);font-weight:600}
.bct-region-picker input{accent-color:var(--color-brand)}
.bct-category-checks{display:flex;gap:16px;align-items:stretch;color:#44536C;font-size:13px;flex-wrap:wrap}
.bct-category-checks label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;white-space:nowrap}
.bct-category-checks input{accent-color:var(--color-brand)}
/* 报告组「调研与报告一体化服务」：标题 + 三个子服务复选框，宽度不足时换行 */
.bct-cat-group{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px 18px;border:1px solid #DFE8E3;border-radius:8px;padding:8px 14px;background:#FBFDFC}
.bct-cat-group>b{font-size:13px;color:#44536C;font-weight:600;position:relative;padding-left:10px}
.bct-cat-group>b::before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;background:var(--color-brand)}
.bct-ratio-list{display:flex;flex-direction:column;gap:12px}
.bct-ratio-group{border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
.bct-ratio-group-head{display:flex;align-items:center;justify-content:space-between;background:#F7FAF9;padding:10px 14px}
.bct-ratio-group-head b{font-size:13px}
.bct-ratio-group-head small{display:block;color:#8090A4;font-size:11px;margin-top:2px}
.bct-ratio-grid{display:grid;grid-template-columns:minmax(170px,2fr) minmax(120px,1fr) 120px;gap:12px;align-items:center;padding:8px 14px;border-top:1px solid #F0F2F5;font-size:12px}
.bct-ratio-grid.head{color:#758398;background:#FAFBFD;font-weight:600}
.bct-ratio-grid label{display:flex;align-items:center;gap:4px;justify-content:flex-end}
.bct-ratio-grid input{height:30px;width:78px;border:1px solid #D7DEE9;border-radius:5px;text-align:right;padding:0 8px;font:inherit}
.bct-money-input{height:32px;width:120px;border:1px solid var(--color-border);border-radius:5px;text-align:right;padding:0 9px;font:inherit;font-variant-numeric:tabular-nums}
.bct-money-readonly{height:32px;width:120px;display:inline-flex;align-items:center;justify-content:flex-end;padding:0 9px;font-variant-numeric:tabular-nums;font-weight:600;color:var(--color-text-1);background:#F7F9FB;border:1px solid #EEF1F5;border-radius:5px}
.bct-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:0;background:var(--color-brand-subtle);border:1px solid #D8EAE5;border-radius:10px;padding:14px 8px;margin-bottom:14px}
.bct-summary>div{position:relative;padding:0 18px;border-right:1px solid #D8EAE5;min-width:0}
.bct-summary>div:last-child{border:0}
.bct-summary>div.bct-has-pop{cursor:help}
.bct-summary span{display:block;color:#5E7A72;font-size:11px;margin-bottom:4px}
.bct-summary b{font-size:17px;color:var(--color-text-1);white-space:nowrap}
.bct-summary b.danger{color:#C73A3A}
.bct-pop{display:none;position:absolute;top:calc(100% + 8px);left:10px;z-index:60;min-width:240px;max-width:340px;max-height:230px;overflow-y:auto;background:#fff;border:1px solid #D9E0E8;border-radius:8px;box-shadow:0 10px 26px rgba(15,23,42,.16);padding:10px 12px;font-size:12px;font-weight:400;color:var(--color-text-1);line-height:1.8;white-space:normal;text-align:left}
.bct-summary>div:hover .bct-pop{display:block}
.bct-table-wrap{overflow:auto;max-height:460px;border:1px solid var(--color-border);border-radius:8px}
table.bct-table{width:100%;border-collapse:collapse;font-size:12px;min-width:920px}
.bct-table th{position:sticky;top:0;z-index:2;background:#F9FAFB;color:#687286;text-align:left;font-weight:600;padding:9px 12px;border-bottom:1px solid var(--color-border);white-space:nowrap}
.bct-table td{padding:10px 12px;border-bottom:1px solid #F3F4F6;vertical-align:middle}
.bct-table .sticky-col{position:sticky;left:0;background:#fff;z-index:1;min-width:200px}
.bct-table th.sticky-col{z-index:3}
.bct-table tr:hover td{background:#FAFCFB}
.bct-table tr.bct-row-error td{background:#FFFAFA}
.bct-table .sub{display:block;color:#8A94A5;font-size:11px;margin-top:3px;font-weight:400}
.bct-result-hero{display:flex;align-items:center;gap:14px;border:1px solid var(--color-border);border-radius:10px;padding:18px;margin-bottom:4px}
.bct-result-mark{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;font-size:22px;font-weight:800;flex-shrink:0}
.bct-tabs{display:flex;gap:22px;border-bottom:1px solid #E4E8EE;height:36px;align-items:flex-start;margin:14px 0 0}
.bct-tabs button{border:0;background:transparent;color:#6D778A;padding:0 0 10px;cursor:pointer;font-weight:600;font-size:13px;font-family:inherit}
.bct-tabs button.on{color:var(--color-brand);border-bottom:2px solid var(--color-brand)}
.bct-footnote{color:#778396;font-size:11px;padding-top:10px}
.bct-link{border:0;background:transparent;color:var(--color-brand);cursor:pointer;font-weight:600;padding:2px 0;font-size:12px;font-family:inherit;text-align:left}
.bct-link:hover{text-decoration:underline}
.bct-paste-area{width:100%;min-height:220px;border:1px solid var(--color-border);border-radius:6px;padding:12px;resize:vertical;font:inherit;margin-top:10px;box-sizing:border-box}
/* ─── 调整工作量弹窗 ─── */
.bct-adj-top{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 18px;background:#F5F7FA;border:1px solid #E8EDF3;border-radius:8px;padding:10px 14px;font-size:12px;color:#657185;margin-bottom:14px}
.bct-adj-top b{color:var(--color-text-1);font-weight:600}
.bct-adj-cat{border:1px solid #E2E8F0;border-radius:8px;margin-bottom:16px;overflow:hidden}
.bct-adj-cat-head{display:flex;align-items:center;background:#F7FAF9;padding:10px 14px}
.bct-adj-cat-head b{font-size:13px;color:var(--color-text-1)}
/* 报告组：组头（组名 + 报告小计）与子服务页签 */
.bct-adj-report-head{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F7FAF9;padding:10px 14px;border-bottom:1px solid #EEF1F4}
.bct-adj-report-head b{font-size:13px;color:var(--color-text-1)}
.bct-adj-report-head .sum{font-size:12px;color:#657185;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.bct-adj-report-head .sum b{font-size:12px;font-variant-numeric:tabular-nums}
.bct-adj-tabs{display:flex;overflow-x:auto;background:#FBFCFD;border-bottom:1px solid #E2E8F0;scrollbar-width:thin}
.bct-adj-tab{position:relative;flex:none;border:0;background:transparent;cursor:pointer;font:inherit;font-size:12px;font-weight:600;color:#6D778A;padding:9px 14px;white-space:nowrap}
.bct-adj-tab:hover{color:var(--color-brand)}
.bct-adj-tab[aria-selected="true"]{color:var(--color-brand)}
.bct-adj-tab[aria-selected="true"]::after{content:"";position:absolute;inset:auto 8px -1px;border-block-end:2px solid var(--color-brand)}
.bct-adj-tab:focus-visible{outline:2px solid var(--color-brand);outline-offset:-2px}
.bct-adj-tab .err-badge{display:inline-block;margin-left:6px;font-size:10px;font-weight:600;color:#B45309;background:#FFF4E0;border:1px solid #F2D19A;border-radius:8px;padding:0 6px;line-height:16px;vertical-align:1px}
.bct-adj-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.bct-adj-table th{color:#758398;background:#FAFBFD;font-weight:600;text-align:right;padding:7px 14px;border-top:1px solid #F0F2F5;border-bottom:1px solid #F0F2F5;white-space:nowrap}
.bct-adj-table th:first-child{text-align:left;padding-left:14px}
.bct-adj-table td{padding:8px 14px;border-bottom:1px solid #F3F4F6;text-align:right;vertical-align:top}
.bct-adj-table td:first-child{text-align:left}
.bct-adj-table tr.sum td{background:#FAFBFD;color:#4B5563;font-weight:600;border-bottom:0}
.bct-adj-step{display:inline-flex;align-items:center;gap:0;border:1px solid #D9DFE7;border-radius:5px;background:#fff;overflow:hidden}
.bct-adj-step button{border:0;background:transparent;width:26px;height:28px;cursor:pointer;color:#44536C;font-size:14px;line-height:1;padding:0}
.bct-adj-step button:hover:not(:disabled){background:var(--color-brand-subtle);color:var(--color-brand)}
.bct-adj-step button:disabled{color:#C0C7D2;cursor:not-allowed}
.bct-adj-step input{border:0;width:64px;height:28px;text-align:center;font:inherit;outline:none;background:transparent}
.bct-adj-step .unit{padding:0 8px 0 2px;color:#8A94A5;font-size:11px}
.bct-adj-step:focus-within{border-color:var(--color-brand)}
.bct-adj-sub{display:block;font-size:11px;color:#98A2B3;margin-top:3px;font-weight:400;line-height:1.4}
.bct-adj-sub.warn{color:#B45309}
.bct-adj-budget{display:flex;align-items:center;gap:28px;border-top:1px solid #E4E8EE;padding:12px 2px 0;font-size:12px;color:#657185}
.bct-adj-budget b{color:var(--color-text-1);font-variant-numeric:tabular-nums}
.bct-combo{position:relative;max-width:420px}
/* 组合框嵌在 .bct-field 内：先反转 .bct-field input 罩进来的 100% 宽 / 34 高 / 边框内边距 */
.bct-combo input{width:auto;height:auto;border:0;padding:0;margin:0;background:transparent;box-shadow:none}
.bct-combo-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;border:1px solid #DFE5ED;border-radius:6px;background:#fff;padding:0 10px;cursor:pointer;font:inherit;text-align:left}
.bct-combo-trigger:hover{border-color:var(--color-brand)}
.bct-combo-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text-1);font-size:14px}
.bct-combo-value.ph{color:#9AA3B2}
.bct-combo-caret{font-style:normal;font-size:10px;color:#6B7280;transition:transform .15s;flex-shrink:0}
.bct-combo.open .bct-combo-caret{transform:rotate(180deg)}
.bct-combo-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;background:#fff;border:1px solid #D9E0E8;border-radius:8px;box-shadow:0 10px 26px rgba(15,23,42,.14);overflow:hidden}
.bct-combo-search{display:flex;align-items:center;gap:6px;height:38px;padding:0 11px;border-bottom:1px solid #EEF1F4;color:#9AA3B2}
.bct-combo-search:focus-within{border-bottom-color:var(--color-brand)}
.bct-combo-search input{flex:1;min-width:0;font:inherit;font-size:12px;color:var(--color-text-1)}
.bct-combo-search button{border:0;background:transparent;padding:0;cursor:pointer;color:#9AA3B2;font-size:14px;line-height:1}
.bct-combo-list{max-height:198px;overflow-y:auto;padding:4px 0}
.bct-combo-list label{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:12px;color:var(--color-text-1);cursor:pointer}
.bct-combo-list label:hover{background:#F7FAF9}
.bct-combo-list label.off{opacity:.45;cursor:not-allowed}
.bct-combo-list label.off:hover{background:transparent}
.bct-combo-list input[type="checkbox"]{width:13px;height:13px;min-width:13px;flex-shrink:0;accent-color:var(--color-brand);appearance:auto;cursor:pointer}
.bct-combo-list .bct-combo-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bct-combo-list .picked{color:var(--color-brand);font-size:11px;flex-shrink:0}
.bct-combo-empty{padding:18px 12px;text-align:center;color:#9AA3B2;font-size:12px}
.bct-combo-foot{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-top:1px solid #EEF1F4;color:#8A94A5;font-size:11px}
.bct-combo-chips{display:flex;align-items:center;gap:6px;margin-top:8px;min-height:24px;font-size:11px;max-width:420px}
.bct-combo-chip{display:inline-flex;align-items:center;gap:4px;max-width:240px;min-width:0;background:var(--color-brand-subtle);color:var(--color-brand);border-radius:5px;padding:3px 8px}
.bct-combo-chip .txt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bct-combo-chip button{border:0;background:transparent;padding:0;cursor:pointer;color:var(--color-brand);font-size:13px;line-height:1}
.bct-combo-more{flex-shrink:0;border:1px solid #E3E8EF;background:#F5F7FA;color:#44536C;border-radius:5px;padding:3px 8px;cursor:pointer;font:inherit;font-size:11px}
.bct-combo-more:hover{background:var(--color-brand-subtle);border-color:var(--color-brand);color:var(--color-brand)}
.bct-combo-clear{margin-left:auto;border:0;background:transparent;cursor:pointer;color:#6B7280;font:inherit;font-size:11px;padding:2px 4px}
.bct-combo-clear:hover{color:var(--color-brand)}
.bct-ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.bct-ai-btnbox{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;padding-top:2px}
.bct-ai-btnrow{display:flex;align-items:center;gap:10px}
.bct-ai-quota{font-size:11px;color:#9AA3B2;white-space:nowrap}
.bct-ai-btn{height:30px;border-radius:6px;border:1px solid var(--color-brand);background:#fff;color:var(--color-brand);font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:0 12px;transition:background .15s}
.bct-ai-btn:hover:not(:disabled){background:var(--color-brand-subtle)}
.bct-ai-btn:disabled{border-color:#E5E7EB;background:#F9FAFB;color:#C0C4CC;cursor:not-allowed}
.bct-ai-hint{font-size:11px;color:#9AA3B2}
.bct-ai-panel{margin-top:12px;border:1px solid #E2E8F0;border-radius:8px;animation:bctAiFade .3s ease;overflow:hidden}
@keyframes bctAiFade{from{opacity:0;transform:translateY(-4px)}to{opacity:1}}
.bct-ai-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;border-bottom:1px solid #EEF1F4}
.bct-ai-title-box{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.bct-ai-title{color:var(--color-brand);font-weight:600;font-size:12px}
.bct-ai-meta{color:#9AA3B2;font-size:11px}
.bct-ai-strip{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;border-bottom:1px solid #EEF1F4;font-size:12px}
.bct-ai-strip.warn{color:#A15C07;background:#FFFDF7}
.bct-ai-strip.ok{color:var(--color-brand);background:#F7FBF9}
.bct-ai-strip.mute{color:#6B7280;background:#FAFBFC}
.bct-ai-progress{height:3px;border-radius:2px;background:#EEF2EF;overflow:hidden}
.bct-ai-progress i{display:block;height:100%;border-radius:2px;background:#7FB79D;transition:width 1.2s ease-out}
.bct-ai-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0 0;padding:0;list-style:none;font-size:12px;color:#C0C4CC}
.bct-ai-steps li{display:flex;align-items:center;gap:7px;transition:color .5s;min-width:0}
.bct-ai-steps li.on{color:#374151}
.bct-ai-stepdot{width:16px;height:16px;border-radius:50%;border:1px solid #D1D5DB;display:grid;place-items:center;font-size:10px;flex-shrink:0;color:#C0C4CC}
.bct-ai-stepdot.cur{border-color:var(--color-brand);color:var(--color-brand)}
.bct-ai-stepdot.done{border-color:var(--color-brand);background:var(--color-brand);color:#fff}
.bct-ai-pulse{animation:bctAiPulse 1.2s ease-in-out infinite}
@keyframes bctAiPulse{0%,100%{opacity:.3}50%{opacity:1}}
.bct-ai-body{padding:14px}
.bct-ai-body.dim{opacity:.6}
.bct-ai-headline{margin:0;font-size:14px;font-weight:600;color:var(--color-text-1)}
.bct-ai-cols{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;margin-top:12px}
.bct-ai-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;align-self:start}
.bct-ai-table th{color:#6B7280;font-weight:400;font-size:12px;text-align:right;padding:6px 0;border-bottom:1px solid #EEF1F4;white-space:nowrap}
.bct-ai-table th:first-child{text-align:left}
.bct-ai-table td{padding:7px 0;text-align:right;border-bottom:1px solid #F3F4F6;color:var(--color-text-1)}
.bct-ai-table td:first-child{text-align:left}
.bct-ai-table th:last-child,.bct-ai-table td:last-child{padding-left:8px}
.bct-ai-table td.cur{color:#6B7280}
.bct-ai-table td.sug{font-weight:600}
.bct-ai-table td.up{color:var(--color-brand)}
.bct-ai-table td.down{color:#B45309}
.bct-ai-table td.flat{color:#9AA3B2}
.bct-ai-table tr.sum td{color:#6B7280;border-bottom:0}
.bct-ai-table tr.sum td.sug{color:var(--color-text-1)}
.bct-ai-reasons{font-size:12px;line-height:1.7;color:#374151;min-width:0}
.bct-ai-reasons h6{margin:0 0 6px;font-size:12px;font-weight:400;color:#6B7280}
.bct-ai-reasons ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.bct-ai-note{margin:12px 0 0;font-size:11px;color:#9AA3B2}
.bct-ai-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.bct-ai-ghost{height:32px;border-radius:6px;border:1px solid #D1D5DB;background:#fff;color:#374151;font:inherit;font-size:12px;cursor:pointer;padding:0 14px}
.bct-ai-ghost:hover{background:#F9FAFB}
.bct-ai-primary{height:32px;border-radius:6px;border:0;background:var(--color-brand);color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:0 14px}
.bct-ratio-grid input.bct-adopted{border-color:var(--color-brand);background:var(--color-brand-subtle)}
/* ─── 整页模式（应用壳内页面，侧边栏/顶栏保留）：页头条带返回、内容区滚动、底部固定操作条 ─── */
.bct-shell{display:flex;flex-direction:column;height:100%}
.bct-head{background:#fff;border-bottom:1px solid var(--color-border);padding:13px 24px;display:flex;align-items:center;gap:13px}
.bct-back{border:0;background:transparent;cursor:pointer;color:#6B7280;width:30px;height:30px;border-radius:6px;display:grid;place-items:center;flex-shrink:0}
.bct-back:hover{background:#F3F4F6;color:var(--color-text-1)}
.bct-head h3{margin:0;font-size:17px;font-weight:600;color:var(--color-text-1);line-height:1.35}
.bct-head-note{margin-top:3px;font-size:12px;color:#8A94A5}
.bct-body{flex:1;min-height:0;overflow-y:auto;padding:14px 24px 20px}
.bct-footbar{background:#fff;border-top:1px solid var(--color-border);padding:11px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0}
`

/** 应用内整页：由任务执行页条件渲染（进入 = 挂载、返回 = 卸载），onClose 即「返回任务列表」 */
export function BatchCreateTaskPage({
  onClose,
  addToast,
  holderPharma,
}: Props) {
  const { varieties, priceBooks, auths, budgetPlans, createTaskBatch } =
    useTaskData()

  const [step, setStep] = useState(0)
  const [varietySel, setVarietySel] = useState<string[]>([])
  const [startDate, setStartDate] = useState("2026-09-01")
  const [endDate, setEndDate] = useState("2026-09-30")
  const [remember, setRemember] = useState(false)
  const [pickedRegions, setPickedRegions] = useState<string[]>([])
  const [catOn, setCatOn] = useState<Record<string, boolean>>({
    ...DEFAULT_CAT_ON,
  })
  const [ratioDraft, setRatioDraft] = useState<Record<string, string>>({})
  const [removed, setRemoved] = useState<string[]>([])
  const [plans, setPlans] = useState<PlanMap>({})
  const [vendorSearch, setVendorSearch] = useState("")
  const [invalidOnly, setInvalidOnly] = useState(false)
  /** 「调整工作量」弹窗：目标服务商 + 数量草稿（类别名→业务项目名→单元格，会话态） */
  const [workDrawerFor, setWorkDrawerFor] = useState<string | null>(null)
  const [workQtyDraft, setWorkQtyDraft] =
    useState<Record<string, Record<string, WorkDraftCell>>>({})
  /** 弹窗内报告区当前页签（报告子服务类别）；null = 未打开或只选推广 */
  const [workTab, setWorkTab] = useState<ServiceCategory | null>(null)
  /** 弹窗内「恢复初始分配」覆盖前确认 */
  const [confirmRestore, setConfirmRestore] = useState(false)
  /** 第二步直接修改「存在数量调整」的类别金额：覆盖前确认；null = 无待确认项 */
  const [pendingCatEdit, setPendingCatEdit] = useState<{
    provider: string
    category: ServiceCategory
    value: number
  } | null>(null)
  /** 第一步取消「已调整」的类别：移出前确认；null = 无待确认项 */
  const [pendingCatOff, setPendingCatOff] = useState<ServiceCategory | null>(
    null,
  )
  /** 恢复的草稿含旧版「按品种选问卷」配置：显示待复核提示 */
  const [legacySurveyNote, setLegacySurveyNote] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  /** 清空重填二次确认 */
  const [confirmClear, setConfirmClear] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [outcomes, setOutcomes] = useState<SubmitOutcome[]>([])
  const [resultFilter, setResultFilter] = useState<"全部" | "成功" | "失败">(
    "全部",
  )
  /** 本次打开恢复的草稿时间戳；null = 未恢复草稿 */
  const [restoredAt, setRestoredAt] = useState<string | null>(null)
  /** 打开时实际落入的推广时间（记忆值或默认值），用于判断内容是否仍为全新默认 */
  const openedWithRef = useRef({
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  })

  /** 品种下拉面板：触发框 + 搜索下拉 + 多选摘要行 */
  const [varietyOpen, setVarietyOpen] = useState(false)
  const [varietySearch, setVarietySearch] = useState("")
  const varietyRef = useRef<HTMLDivElement>(null)

  /** AI 统筹建议（会话态）：额度 / 加载步骤 / 结果快照，随弹窗关闭重置 */
  const [aiState, setAiState] =
    useState<"idle" | "loading" | "done" | "adopted" | "rejected">("idle")
  const [aiStep, setAiStep] = useState(0)
  const [aiQuota, setAiQuota] = useState(AI_QUOTA_TOTAL)
  /** 结果对应的表单快照 key；与当前不一致 → 已过期 */
  const [aiSnap, setAiSnap] = useState("")
  /** 采纳前的全局比例（撤销用） */
  const [aiBefore, setAiBefore] = useState<Record<string, string> | null>(null)
  const [aiCollapsed, setAiCollapsed] = useState(false)
  const [aiSuggested, setAiSuggested] = useState<Record<string, number> | null>(
    null,
  )
  const [aiRuleNames, setAiRuleNames] = useState<string[]>([])
  const [aiHeadline, setAiHeadline] = useState("")
  const [aiReasons, setAiReasons] = useState<string[]>([])
  const aiTimers = useRef<number[]>([])

  // ─── 派生数据 ───────────────────────────────────────────────

  /** 可选品种 = 有服务商授权且绑定生效价目表 */
  const varietyOptions = useMemo(() => {
    const names = new Set(auths.map((a) => a.varietyName))
    return varieties.filter(
      (v) =>
        names.has(v.tradeName) &&
        isPriceBookActive(varietyPriceBook(v, priceBooks)),
    )
  }, [auths, varieties, priceBooks])

  /** 品种集合的共享价目表；跨表混选被选择器禁用，此处为兜底（不一致 → undefined） */
  function bookFor(sel: string[]): PriceBook | undefined {
    if (!sel.length) return undefined
    const books = sel.map((name) =>
      varietyPriceBook(
        varieties.find((v) => v.tradeName === name),
        priceBooks,
      ),
    )
    if (books.some((b) => !isPriceBookActive(b))) return undefined
    return books.every((b) => b!.id === books[0]!.id) ? books[0] : undefined
  }
  const lockedBook = useMemo(
    () => bookFor(varietySel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [varietySel, varieties, priceBooks],
  )

  /** 锁定价目表按类别分组（已过滤本期不提供的类别，保持价目表内顺序） */
  const catGroups = useMemo(() => visibleGroups(lockedBook), [lockedBook])

  /** 所选品种集合的授权地区全集（含「全国」授权） */
  function poolForVarieties(sel: string[]): string[] {
    const set = new Set<string>()
    auths
      .filter((a) => sel.includes(a.varietyName))
      .forEach((a) => a.regions.forEach((r) => set.add(r)))
    return [...set].sort((a, b) =>
      a === "全国" ? 1 : b === "全国" ? -1 : a.localeCompare(b, "zh-CN"),
    )
  }
  const regionPool = useMemo(
    () => poolForVarieties(varietySel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auths, varietySel],
  )

  /** 某服务商在「全部所选品种 × 所选地区」下的有效执行地区：
   *  任务按品种×地区逐对校验授权，因此取各品种授权的交集；全部品种均有全国授权 → [全国] */
  function effectiveRegions(provider: string): string[] {
    if (!varietySel.length) return []
    const rowsByVar = varietySel.map((v) =>
      auths.filter((a) => a.provider === provider && a.varietyName === v),
    )
    if (rowsByVar.some((rows) => rows.length === 0)) return []
    if (rowsByVar.every((rows) => rows.some((a) => a.regions.includes("全国"))))
      return ["全国"]
    const picked = pickedRegions.filter((r) => r !== "全国")
    return picked.filter((r) =>
      rowsByVar.every((rows) => rows.some((a) => a.regions.includes(r))),
    )
  }

  /** 候选服务商名单（对全部所选品种在所选地区均有授权） */
  const candidateRows = useMemo(() => {
    const providers = [
      ...new Set(
        auths
          .filter((a) => varietySel.includes(a.varietyName))
          .map((a) => a.provider),
      ),
    ]
    return providers
      .map((provider) => ({ provider, regions: effectiveRegions(provider) }))
      .filter((r) => r.regions.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auths, varietySel, pickedRegions])

  /** 已勾选的服务类别分组（含推广与报告三类，全部按价目规则计价、参与统一业务比例） */
  const pickedCatGroups = useMemo(
    () => catGroups.filter((g) => catOn[g.category]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catGroups, catOn],
  )

  /** 第一步「匹配的服务商」列表的预算口径：按 服务商 × 品种 × 执行地区 × 推广期覆盖月份 匹配预算行汇总 */
  function liveBudgetFor(provider: string, regions: string[]) {
    return recommendedBudget({
      provider,
      varieties: [...varietySel],
      regions,
      startDate,
      endDate,
      categories: pickedCatGroups.map((g) => g.category),
      plans: budgetPlans,
    })
  }

  /** 类别当前计划金额＝Σ项目当前金额（分口径取整） */
  function catCurrentAmount(cat: CatPlanState | undefined): number {
    if (!cat) return 0
    return cents(Object.values(cat.items).reduce((s, it) => s + it.amount, 0))
  }

  interface RowView {
    provider: string
    regions: string[]
    included: boolean
    /** 进入第二步时带入的预算快照；未初始化前＝当前匹配值 */
    budget: BudgetSnapshot
    cats: Partial<Record<ServiceCategory, CatPlanState>>
    /** 各类别当前计划金额（Σ项目金额） */
    catCurrent: Partial<Record<ServiceCategory, number>>
    /** 计划合计＝Σ类别当前计划金额 */
    total: number
    /** 任一项目存在用户数量调整（「已调整工作量」标记） */
    hasAdjusted: boolean
    /** 是否已生成过计划（进入过第二步） */
    initialized: boolean
  }

  const rows: RowView[] = candidateRows.map((c) => {
    const p = plans[c.provider]
    const cats: Partial<Record<ServiceCategory, CatPlanState>> = {}
    const catCurrent: Partial<Record<ServiceCategory, number>> = {}
    let hasAdjusted = false
    if (p) {
      pickedCatGroups.forEach((g) => {
        const cat = p.categories[g.category]
        if (cat) {
          cats[g.category] = cat
          catCurrent[g.category] = catCurrentAmount(cat)
          if (Object.values(cat.items).some((it) => it.adjusted))
            hasAdjusted = true
        }
      })
    }
    return {
      provider: c.provider,
      regions: c.regions,
      included: !removed.includes(c.provider),
      budget: p?.budget ?? liveBudgetFor(c.provider, c.regions),
      cats,
      catCurrent,
      total: cents(
        pickedCatGroups.reduce((s, g) => s + (catCurrent[g.category] ?? 0), 0),
      ),
      hasAdjusted,
      initialized: !!p,
    }
  })
  const selectedRows = rows.filter((r) => r.included)
  const outcomeOf = (provider: string) =>
    outcomes.find((o) => o.provider === provider && o.ok)

  /** 品种集合摘要：多选时行内只显计数（悬停 title 看全量名单），单选显名称 */
  function varietySummary(): { text: string; full: string | undefined } {
    return varietySel.length > 1
      ? { text: `共 ${varietySel.length} 个品种`, full: varietySel.join("、") }
      : { text: varietySel[0] ?? "—", full: undefined }
  }

  /** 全局业务比例（仅勾选类别参与校验）；非法返回 null */
  function readRatios(
    source: Record<string, string>,
  ): Record<string, number> | null {
    const result: Record<string, number> = {}
    for (const g of catGroups) {
      if (!catOn[g.category]) continue
      let sum = 0
      for (const r of g.rules) {
        const raw = source[r.name]
        if (raw === undefined || raw.trim() === "") return null
        const v = Number(raw)
        if (!Number.isFinite(v) || v < 0 || v > 100) return null
        result[r.name] = v
        sum += v
      }
      if (Math.abs(sum - 100) > 0.001) return null
    }
    return result
  }
  const globalRatios = readRatios(ratioDraft)

  function defaultRatioMap(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(defaultRatiosFor(lockedBook)).map(([k, v]) => [
        k,
        Number(v),
      ]),
    )
  }

  /** 派生某个类别计划：基准 × 当前统一比例 → 项目初始金额 + floor 数量 */
  function deriveCatPlan(
    baseline: number,
    g: { category?: ServiceCategory; rules: PriceBookRule[] },
    ratios: Record<string, number> | null,
  ): CatPlanState {
    const items = deriveCategoryItems(
      baseline,
      g.rules.map((r) => ({
        name: r.name,
        unit: r.unit,
        unitPrice: r.amount,
        ratio: (ratios ?? defaultRatioMap())[r.name] ?? 0,
      })),
    )
    return {
      baseline,
      frozen: false,
      items: Object.fromEntries(items.map((it) => [it.name, it])),
    }
  }

  /** 行内校验（UX 级；提交时 context 侧还有强校验兜底） */
  function rowError(row: RowView): string {
    if (outcomeOf(row.provider)) return ""
    const values = pickedCatGroups.map((g) => row.catCurrent[g.category] ?? 0)
    if (values.some((v) => !Number.isFinite(v) || v < 0))
      return "计划金额不能为负数"
    if (row.total <= 0)
      return row.budget.configured
        ? "请填写大于 0 的计划金额"
        : "未配置预算，请手动填写计划金额"
    if (buildItems(row).items.length === 0)
      return "计划金额按比例摊算后没有有效服务项目明细，请调大金额"
    return ""
  }

  /**
   * 组装提交将生成的 serviceItems：各类别项目按 当前数量 / 当前金额 在
   * 品种 × 执行地区组合间守恒分摊（数量 floor＋余数、金额按分处理尾差），
   * 提交不重新取整，总数量与总金额与页面确认值一致。
   */
  function buildItems(
    row: RowView,
  ): {
    items: ServiceItem[]
    roundingLogs: RoundingLog[]
  } {
    if (!lockedBook) return { items: [], roundingLogs: [] }
    const combos: { variety: string; region: string }[] = []
    varietySel.forEach((v) =>
      row.regions.forEach((r) => combos.push({ variety: v, region: r })),
    )
    const n = Math.max(1, combos.length)
    const items: ServiceItem[] = []
    pickedCatGroups.forEach((g) => {
      const cat = row.cats[g.category]
      if (!cat) return
      g.rules.forEach((r) => {
        const it = cat.items[r.name]
        if (!it) return
        const qtys = splitQtyAcrossCombos(it.qty, n)
        const amounts = splitAmountAcrossCombos(it.amount, n)
        combos.forEach((c, i) => {
          if (qtys[i] <= 0 && (amounts[i] ?? 0) <= 0) return
          items.push({
            id: `new-${items.length}`,
            variety: c.variety,
            region: c.region,
            category: r.category,
            name: r.name,
            unitPrice: r.amount,
            unit: r.unit,
            qty: qtys[i],
            amount: amounts[i],
            suggestedUnitPrice: r.amount,
            suggestedAmount: amounts[i],
            adjustReason: "",
          })
        })
      })
    })
    return { items, roundingLogs: [] }
  }

  const errorCount = selectedRows.filter((r) => rowError(r)).length
  const planTotal = cents(selectedRows.reduce((s, r) => s + r.total, 0))

  /** AI 建议的过期判定：分析所依据的品种 / 日期 / 地区 / 服务类别 / 比例任一变更 */
  const aiKey = JSON.stringify([
    varietySel,
    startDate,
    endDate,
    pickedRegions,
    catOn,
    ratioDraft,
  ])
  const aiHasResult =
    aiState === "done" || aiState === "adopted" || aiState === "rejected"
  const aiStale = aiHasResult && aiSnap !== aiKey

  // ─── 交互 ───────────────────────────────────────────────────

  /** 品种下拉：点击面板外关闭 */
  useEffect(() => {
    if (!varietyOpen) return
    const close = (event: MouseEvent) => {
      if (!varietyRef.current?.contains(event.target as Node))
        setVarietyOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [varietyOpen])

  /** 卸载时清掉 AI 分析的模拟定时器 */
  useEffect(() => () => aiTimers.current.forEach(clearTimeout), [])

  /** 整页模式：Esc 返回列表（粘贴/工作弹窗/确认弹窗打开时让位，由弹窗自身处理） */
  useEffect(() => {
    if (workDrawerFor || pasteOpen || confirmClear || pendingCatEdit || pendingCatOff)
      return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workDrawerFor, pasteOpen, confirmClear, pendingCatEdit, pendingCatOff])

  /**
   * 进入初始化：优先恢复上次离开自动保存的草稿（品种仍可选才恢复），否则全新默认。
   * 品种就绪后默认全选其授权地区并预填价目表比例（多选切换同此重置）。
   */
  useEffect(() => {
    // 记住的推广时间（勾选「记住」上次保存的）
    let memoDates: { startDate?: string; endDate?: string } | null = null
    try {
      memoDates = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null")
    } catch {
      memoDates = null
    }
    const initStart = memoDates?.startDate || "2026-09-01"
    const initEnd = memoDates?.endDate || "2026-09-30"
    setStartDate(initStart)
    setEndDate(initEnd)
    setRemember(!!memoDates?.startDate)
    openedWithRef.current = { startDate: initStart, endDate: initEnd }
    setWorkDrawerFor(null)
    setWorkTab(null)
    setConfirmRestore(false)
    setPendingCatEdit(null)
    setPendingCatOff(null)
    setLegacySurveyNote(false)
    setPasteOpen(false)
    setConfirmClear(false)
    setOutcomes([])
    setResultFilter("全部")
    setRestoredAt(null)
    aiTimers.current.forEach(clearTimeout)
    setAiState("idle")
    setAiStep(0)
    setAiQuota(AI_QUOTA_TOTAL)
    setAiSnap("")
    setAiBefore(null)
    setAiCollapsed(false)
    setAiSuggested(null)
    setAiRuleNames([])
    setAiHeadline("")
    setAiReasons([])
    setVarietyOpen(false)
    setVarietySearch("")

    let draft: BatchDraft | null = null
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")
    } catch {
      draft = null
    }
    const draftSel = (draft?.varietySel ?? []).filter((n) =>
      varietyOptions.some((o) => o.tradeName === n),
    )
    if (draft && draftSel.length) {
      const pool = poolForVarieties(draftSel)
      setStep(draft.step === 1 ? 1 : 0)
      setVarietySel(draftSel)
      setStartDate(draft.startDate || initStart)
      setEndDate(draft.endDate || initEnd)
      setRemember(!!draft.remember)
      setPickedRegions(
        (draft.pickedRegions ?? []).filter((r) => pool.includes(r)),
      )
      setCatOn({ ...DEFAULT_CAT_ON, ...(draft.catOn ?? {}) })
      setRatioDraft(draft.ratioDraft ?? defaultRatiosFor(bookFor(draftSel)))
      // 旧版草稿带「按品种选问卷」配置：恢复后提示复核服务类别与工作量（§5 存量兼容）
      setLegacySurveyNote(Object.keys(draft.surveyPick ?? {}).length > 0)
      setRemoved(draft.removed ?? [])
      // 计划状态整包恢复：含预算快照、分配基准、初始金额/数量与用户调整；先对齐当前价目表
      setPlans(sanitizePlans(draft.plans ?? {}, bookFor(draftSel)))
      setVendorSearch(draft.vendorSearch ?? "")
      setInvalidOnly(!!draft.invalidOnly)
      setPasteText(draft.pasteText ?? "")
      setRestoredAt(draft.savedAt ?? "")
      return
    }

    const freshSel = varietyOptions.length ? [varietyOptions[0].tradeName] : []
    setStep(0)
    setVarietySel(freshSel)
    setPickedRegions(poolForVarieties(freshSel))
    setRatioDraft(defaultRatiosFor(bookFor(freshSel)))
    setCatOn({ ...DEFAULT_CAT_ON })
    setRemoved([])
    setPlans({})
    setVendorSearch("")
    setInvalidOnly(false)
    setPasteText("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 应用新品种集合：地区重置为全选新授权池、比例重预填、已生成计划与结果清空 */
  function applyVarietySel(next: string[]) {
    setVarietySel(next)
    setPickedRegions(poolForVarieties(next))
    setRatioDraft(defaultRatiosFor(bookFor(next)))
    setRemoved([])
    setPlans({})
    setOutcomes([])
    setVendorSearch("")
    setInvalidOnly(false)
    setRestoredAt(null)
    setLegacySurveyNote(false)
  }

  /** 多选品种：地区重置为全选新授权池、比例重预填、已填金额与结果清空 */
  function changeVarietySel(name: string, checked: boolean) {
    const next = checked
      ? [...varietySel, name]
      : varietySel.filter((v) => v !== name)
    if (!next.length) {
      addToast({ type: "error", title: "至少保留一个推广品种" })
      return
    }
    applyVarietySel(next)
  }

  /**
   * 全选：把当前搜索过滤下可勾选（同价目表、未禁用）的品种全部加入；
   * 已选项与禁选项不动， selections 为空（无可选项）时按钮置灰不响应
   */
  function selectAllVarieties() {
    const keyword = varietySearch.trim().toLowerCase()
    const addable = varietyOptions
      .filter((v) => v.tradeName.toLowerCase().includes(keyword))
      .filter(
        (v) =>
          varietySel.includes(v.tradeName) ||
          (!!lockedBook &&
            !!varietyPriceBook(v, priceBooks) &&
            varietyPriceBook(v, priceBooks)!.id === lockedBook.id),
      )
      .map((v) => v.tradeName)
    const next = [...new Set([...varietySel, ...addable])]
    if (next.length === varietySel.length) return
    applyVarietySel(next)
  }

  function changeRegion(region: string, checked: boolean) {
    setPickedRegions((prev) =>
      checked ? [...prev, region] : prev.filter((r) => r !== region),
    )
  }

  function toggleVendor(provider: string, included: boolean) {
    setRemoved((prev) =>
      included
        ? prev.filter((p) => p !== provider)
        : [...new Set([...prev, provider])],
    )
  }

  /**
   * 计划状态与选择上下文的同步：
   * - enter（进入第二步）：为尚无计划的服务商初始化——预算快照带入，预算在已选
   *   服务类别间按分平均回填为类别基准；未配置预算时全部为 0，等用户手动填写。
   * - sync（第一步勾选类别变化）：只调整已有计划。未选类别移除；新增类别在
   *   「该服务商无任何用户修改」时按预算快照重新均摊（首次回填口径），
   *   否则新类别从 0 起手动填写；未被用户修改的类别按当前统一比例重派生项目（基准不变）。
   * 预算快照一经带入不再自动改写：改地区、改日期不重算计划，差额由第二步差额列反映。
   */
  function ensurePlans(mode: "enter" | "sync") {
    const ratios = globalRatios ?? defaultRatioMap()
    setPlans((prev) => {
      const next: PlanMap = { ...prev }
      selectedRows.forEach((row) => {
        const existing = next[row.provider]
        if (!existing) {
          if (mode !== "enter") return
          const budget = liveBudgetFor(row.provider, row.regions)
          const even = budget.configured
            ? splitBudgetEvenly(budget.amount, pickedCatGroups.length)
            : pickedCatGroups.map(() => 0)
          next[row.provider] = {
            budget: { amount: budget.amount, configured: budget.configured },
            categories: Object.fromEntries(
              pickedCatGroups.map((g, i) => [
                g.category,
                deriveCatPlan(even[i] ?? 0, g, ratios),
              ]),
            ),
          }
          return
        }
        const untouched = !pickedCatGroups.some(
          (g) => existing.categories[g.category]?.frozen,
        )
        const hasMissing = pickedCatGroups.some(
          (g) => !existing.categories[g.category],
        )
        const categories: Partial<Record<ServiceCategory, CatPlanState>> = {}
        if (hasMissing && untouched && existing.budget.configured) {
          const even = splitBudgetEvenly(
            existing.budget.amount,
            pickedCatGroups.length,
          )
          pickedCatGroups.forEach((g, i) => {
            categories[g.category] = deriveCatPlan(even[i] ?? 0, g, ratios)
          })
        } else {
          pickedCatGroups.forEach((g) => {
            const old = existing.categories[g.category]
            categories[g.category] = !old
              ? deriveCatPlan(0, g, ratios)
              : old.frozen
                ? old
                : deriveCatPlan(old.baseline, g, ratios)
          })
        }
        next[row.provider] = { ...existing, categories }
      })
      return next
    })
  }

  /** 勾选服务类别变化：新增类别按首次回填口径处理；取消「已调整」类别先确认再移出（§2.1） */
  function changeCategory(category: ServiceCategory, on: boolean) {
    if (!on) {
      const hasAdjusted = Object.values(plans).some(
        (p) =>
          p.categories[category] &&
          (p.categories[category]!.frozen ||
            Object.values(p.categories[category]!.items).some((it) => it.adjusted)),
      )
      if (hasAdjusted) {
        setPendingCatOff(category)
        return
      }
    }
    setCatOn({ ...catOn, [category]: on })
    ensurePlans("sync")
  }

  /** 确认取消已调整类别：仅移除本类计划，其他类别与其他服务商的调整各自保留 */
  function confirmCatOff() {
    const category = pendingCatOff
    if (!category) return
    setCatOn({ ...catOn, [category]: false })
    ensurePlans("sync")
    setPendingCatOff(null)
  }

  /** 用户在第二步修改类别计划金额（确认后执行）：仅重新分配该服务商该类别，新金额成为分配基准 */
  function requestCatAmount(
    provider: string,
    category: ServiceCategory,
    value: number,
  ) {
    const g = pickedCatGroups.find((x) => x.category === category)
    if (!g) return
    const v = cents(Math.max(0, Number.isFinite(value) ? value : 0))
    const cat = plans[provider]?.categories[category]
    if (cat && sameAmount(v, catCurrentAmount(cat))) return
    const hasAdjusted =
      !!cat && Object.values(cat.items).some((it) => it.adjusted)
    if (cat && hasAdjusted) {
      setPendingCatEdit({ provider, category, value: v })
      return
    }
    applyCatAmount(provider, category, v)
  }

  /** 重新分配单个类别：按统一比例派生新的项目金额与整数数量，原有数量调整被替换 */
  function applyCatAmount(
    provider: string,
    category: ServiceCategory,
    value: number,
  ) {
    const g = pickedCatGroups.find((x) => x.category === category)
    if (!g) return
    setPlans((prev) => {
      const cur =
        prev[provider] ??
        {
          budget: { amount: 0, configured: false },
          categories: {},
        } as ProviderPlanState
      return {
        ...prev,
        [provider]: {
          ...cur,
          categories: {
            ...cur.categories,
            [category]: {
              ...deriveCatPlan(value, g, globalRatios ?? defaultRatioMap()),
              frozen: true,
            },
          },
        },
      }
    })
  }

  /** Excel 粘贴：匹配行把差额计入首个已选服务类别；存在数量调整的服务商不覆盖，单独提示 */
  function pasteAmounts() {
    const lines = pasteText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    let matched = 0
    let skipped = 0
    const updates = new Map<string, number>()
    for (const line of lines) {
      const separator = line.includes("\t")
        ? line.indexOf("\t")
        : line.search(/[,，]/)
      const name = separator < 0 ? line.trim() : line.slice(0, separator).trim()
      const amountText = separator < 0 ? "" : line.slice(separator + 1).trim()
      const row = selectedRows.find((r) => r.provider === name)
      const amount = Number(amountText.replace(/[￥,，\s]/g, ""))
      if (row && Number.isFinite(amount) && amount > 0) {
        updates.set(row.provider, amount)
        matched++
      }
    }
    updates.forEach((amount, provider) => {
      const primary = pickedCatGroups[0]?.category
      if (!primary) return
      const primaryCat = plans[provider]?.categories[primary]
      if (
        primaryCat &&
        Object.values(primaryCat.items).some((it) => it.adjusted)
      ) {
        skipped++
        return
      }
      const others = pickedCatGroups.slice(1).reduce((s, g) => {
        const cat = plans[provider]?.categories[g.category]
        return s + (cat ? catCurrentAmount(cat) : 0)
      }, 0)
      applyCatAmount(provider, primary, cents(amount - others))
    })
    setPasteOpen(false)
    addToast({
      type: skipped ? "warning" : "info",
      title: `已匹配并更新 ${matched - skipped} 家；未匹配 ${
        lines.length - matched
      } 行${
        skipped ? `；${skipped} 家存在已调整工作量，未覆盖，请单独修改` : ""
      }`,
    })
  }

  /** 打开「调整工作量」：从已保存计划生成独立草稿（取消/关闭不改变第二步已保存数据） */
  function openWorkDrawer(provider: string) {
    const p = plans[provider]
    if (!p) return
    const draft: Record<string, Record<string, WorkDraftCell>> = {}
    pickedCatGroups.forEach((g) => {
      const cat = p.categories[g.category]
      if (!cat) return
      draft[g.category] = Object.fromEntries(
        g.rules
          .map((r) => {
            const it = cat.items[r.name]
            return it
              ? [r.name, { text: String(it.qty), amount: it.amount }]
              : null
          })
          .filter((x): x is [string, WorkDraftCell] => !!x),
      )
    })
    setWorkQtyDraft(draft)
    setConfirmRestore(false)
    // 报告区默认选中顺序最靠前的已选页签：分析报告 → 调研问卷与分析 → 数据收集与报表提交（§3.2）
    setWorkTab(
      REPORT_SERVICE_CATEGORIES.find(
        (c) => catOn[c] && p.categories[c],
      ) ?? null,
    )
    setWorkDrawerFor(provider)
  }

  /** 草稿行输入是否为合法数量：非负整数（空值＝暂未确认，沿用已保存数量） */
  function draftTextOk(text: string): boolean {
    return /^\d{1,7}$/.test(text)
  }

  /** 草稿行当前数量：输入合法时＝输入值，否则＝打开时的已保存数量 */
  function draftQtyOf(cell: WorkDraftCell, saved: PlanItemState): number {
    return draftTextOk(cell.text) ? Number(cell.text) : saved.qty
  }

  /** 草稿行当前金额：与数量同口径——输入空值/非法时沿用已保存金额，不当作用户确认的修改 */
  function draftAmountOf(cell: WorkDraftCell, saved: PlanItemState): number {
    return draftTextOk(cell.text) ? cell.amount : saved.amount
  }

  /** 数量输入：与当前显示值不同的合法整数才是有效修改，金额随即变为 数量 × 单价 */
  function changeDraftQty(category: string, item: PlanItemState, text: string) {
    setWorkQtyDraft((prev) => {
      const cell = prev[category]?.[item.name] ?? {
        text: String(item.qty),
        amount: item.amount,
      }
      const curQty = draftQtyOf(cell, item)
      let amount = item.amount
      if (draftTextOk(text)) {
        const n = Number(text)
        amount = n !== curQty ? amountForQty(n, item.unitPrice) : cell.amount
      }
      return {
        ...prev,
        [category]: {
          ...(prev[category] ?? {}),
          [item.name]: { text, amount },
        },
      }
    })
  }

  /** 加减按钮：在当前显示数量上 ±1（0 为下限），视为有效修改 */
  function stepDraftQty(category: string, item: PlanItemState, delta: 1 | -1) {
    setWorkQtyDraft((prev) => {
      const cell = prev[category]?.[item.name] ?? {
        text: String(item.qty),
        amount: item.amount,
      }
      const curQty = draftQtyOf(cell, item)
      const next = Math.max(0, Math.min(9_999_999, curQty + delta))
      return {
        ...prev,
        [category]: {
          ...(prev[category] ?? {}),
          [item.name]: {
            text: String(next),
            amount: amountForQty(next, item.unitPrice),
          },
        },
      }
    })
  }

  /** 离开数量输入框：内容非法（空 / 负数 / 非整数）时按上次有效数量回显；「0」是有效输入保留（§3.4） */
  function blurDraftQty(category: string, item: PlanItemState) {
    setWorkQtyDraft((prev) => {
      const cell = prev[category]?.[item.name]
      if (!cell || draftTextOk(cell.text)) return prev
      return {
        ...prev,
        [category]: {
          ...(prev[category] ?? {}),
          [item.name]: {
            text: String(draftQtyOf(cell, item)),
            amount: item.amount,
          },
        },
      }
    })
  }

  /**
   * 弹窗内「恢复初始分配」：草稿整体回到当前分配基准下的初始整数数量与初始项目金额
   * （一并恢复，不用 数量×单价 重算），覆盖前做一次简短确认；保存前仍可取消。
   */
  function restoreInitialAllocation() {
    const provider = workDrawerFor
    if (!provider) return
    const p = plans[provider]
    if (!p) return
    setWorkQtyDraft(() => {
      const draft: Record<string, Record<string, WorkDraftCell>> = {}
      pickedCatGroups.forEach((g) => {
        const cat = p.categories[g.category]
        if (!cat) return
        draft[g.category] = Object.fromEntries(
          g.rules
            .map((r) => {
              const it = cat.items[r.name]
              return it
                ? [
                    r.name,
                    { text: String(it.initialQty), amount: it.initialAmount },
                  ]
                : null
            })
            .filter((x): x is [string, WorkDraftCell] => !!x),
        )
      })
      return draft
    })
    setConfirmRestore(false)
  }

  /**
   * 保存调整工作量：只有被有效修改的项目金额变为 数量 × 单价，其余保留原计划金额；
   * 类别分配基准不变；保存后第二步回显真实计划金额与预算差额。
   */
  function saveWorkDrawer() {
    const provider = workDrawerFor
    const p = provider ? plans[provider] : undefined
    if (!provider || !p) return
    // 非法数量：定位到首个有错误的页签（§3.2），字段级提示保留在数量控件下
    const invalidCat = pickedCatGroups.find((g) =>
      Object.values(workQtyDraft[g.category] ?? {}).some(
        (c) => c.text !== "" && !draftTextOk(c.text),
      ),
    )
    if (invalidCat) {
      if (invalidCat.category !== PROMO_CATEGORY) setWorkTab(invalidCat.category)
      addToast({ type: "error", title: "数量必须为非负整数，已定位到需修正的位置" })
      return
    }
    setPlans((prev) => {
      const cur = prev[provider]
      if (!cur) return prev
      const categories = { ...cur.categories }
      pickedCatGroups.forEach((g) => {
        const cat = categories[g.category]
        if (!cat) return
        const items: Record<string, PlanItemState> = {}
        let catAdjusted = false
        g.rules.forEach((r) => {
          const saved = cat.items[r.name]
          if (!saved) return
          const cell = workQtyDraft[g.category]?.[r.name] ?? {
            text: String(saved.qty),
            amount: saved.amount,
          }
          const qty = draftQtyOf(cell, saved)
          const amount = draftAmountOf(cell, saved)
          const adjusted = !(
            qty === saved.initialQty && sameAmount(amount, saved.initialAmount)
          )
          if (adjusted) catAdjusted = true
          items[r.name] = { ...saved, qty, amount, adjusted }
        })
        categories[g.category] = {
          ...cat,
          items,
          frozen: cat.frozen || catAdjusted,
        }
      })
      return { ...prev, [provider]: { ...cur, categories } }
    })
    setWorkDrawerFor(null)
    addToast({ type: "success", title: `${provider} 的工作量调整已保存` })
  }

  // ─── AI 统筹建议 ────────────────────────────────────────────

  /** 可分析 = 品种 / 日期 / 地区 / 服务类别齐备，且各已选类别比例分别合计 100% */
  function aiReady(): boolean {
    return !!(
      varietySel.length &&
      pickedRegions.length &&
      catOn["市场推广服务"] &&
      globalRatios &&
      !dateError()
    )
  }

  /**
   * 演示建议规则（口径对齐设计稿 40/10/30/20 → 45/15/25/15）：
   * 市场推广组内拜访类合计上调 10 个百分点（拜访项均摊上调、其余项按余量均摊让出），
   * 整数化后尾差补到最大项；无拜访类或无可让空间时改为建议价目表标准配比。
   */
  function computeAiSuggestion(): {
    ratios: Record<string, number>
    ruleNames: string[]
    headline: string
    reasons: string[]
  } | null {
    const group = catGroups.find((g) => g.category === "市场推广服务")
    if (!group || !group.rules.length) return null
    const cur = (name: string) => Number(ratioDraft[name]) || 0
    const visit = group.rules.filter((r) => r.name.includes("拜访"))
    const rest = group.rules.filter((r) => !r.name.includes("拜访"))
    const visitTotal = visit.reduce((s, r) => s + cur(r.name), 0)
    if (!visit.length || visitTotal <= 0 || visitTotal >= 100) {
      const weight = group.rules.reduce((s, r) => s + r.ratio, 0) || 1
      const ratios: Record<string, number> = {}
      group.rules.forEach((r) => {
        ratios[r.name] = Math.round((r.ratio / weight) * 100)
      })
      ratios[group.rules[0].name] +=
        100 - group.rules.reduce((s, r) => s + ratios[r.name], 0)
      return {
        ratios,
        ruleNames: group.rules.map((r) => r.name),
        headline: "建议将各业务项目比例调整为价目表标准配比。",
        reasons: [
          "本企业往期任务：近期同品种任务多采用价目表标准配比发包。",
          "本次业务结构：当前比例与价目表标准配比存在偏差。",
          "同类配置倾向：AI 识别到同类品种任务整体沿用标准配比。",
        ],
      }
    }
    const boost = Math.min(10, 100 - visitTotal)
    const out: Record<string, number> = {}
    visit.forEach((r) => {
      out[r.name] = cur(r.name) + boost / visit.length
    })
    let shrink = boost
    const pool = rest.map((r) => ({ name: r.name, left: cur(r.name) }))
    while (shrink > 0.0001 && pool.some((p) => p.left > 0.0001)) {
      const live = pool.filter((p) => p.left > 0.0001)
      const share = shrink / live.length
      live.forEach((p) => {
        const give = Math.min(share, p.left)
        p.left -= give
        shrink -= give
      })
    }
    pool.forEach((p) => {
      out[p.name] = p.left
    })
    const ratios: Record<string, number> = {}
    group.rules.forEach((r) => {
      ratios[r.name] = Math.round(out[r.name])
    })
    const anchor = [...group.rules].sort(
      (a, b) => ratios[b.name] - ratios[a.name],
    )[0]
    ratios[anchor.name] +=
      100 - group.rules.reduce((s, r) => s + ratios[r.name], 0)
    return {
      ratios,
      ruleNames: group.rules.map((r) => r.name),
      headline: `建议将拜访类合计从当前 ${Math.round(visitTotal)}% 调整至 ${Math.round(visitTotal + boost)}%，适度降低会议及学术推广比例。`,
      reasons: [
        "本企业往期任务：近期同品种任务中，拜访类执行完成度较稳定，占比呈上升走势。",
        `本次业务结构：当前会议与学术推广合计 ${Math.round(100 - visitTotal)}%，单价较高，覆盖面相对集中。`,
        "同类配置倾向：AI 识别到同类品种任务整体更倾向以拜访为主、会议为辅。",
      ],
    }
  }

  /** 发起分析：三步模拟加载，结果生成才扣次数并落快照 */
  function aiAnalyze() {
    if (!aiReady() || aiState === "loading" || aiQuota <= 0) return
    aiTimers.current.forEach(clearTimeout)
    setAiState("loading")
    setAiStep(0)
    setAiCollapsed(false)
    setAiBefore(null)
    const snapshotKey = aiKey
    const suggestion = computeAiSuggestion()
    ;[1300, 2600, 3900].forEach((t, i) => {
      aiTimers.current.push(
        window.setTimeout(() => {
          if (i < 2) setAiStep(i + 1)
          else {
            if (suggestion) {
              setAiSuggested(suggestion.ratios)
              setAiRuleNames(suggestion.ruleNames)
              setAiHeadline(suggestion.headline)
              setAiReasons(suggestion.reasons)
            }
            setAiState("done")
            setAiQuota((q) => q - 1)
            setAiSnap(snapshotKey)
          }
        }, t),
      )
    })
  }

  /** 采纳：建议比例写入全局比例（保留其他类别的值），可撤销 */
  function aiAdopt() {
    if (!aiSuggested) return
    const next = {
      ...ratioDraft,
      ...Object.fromEntries(
        Object.entries(aiSuggested).map(([k, v]) => [k, String(v)]),
      ),
    }
    setAiBefore({ ...ratioDraft })
    setRatioDraft(next)
    setAiState("adopted")
    setAiSnap(
      JSON.stringify([
        varietySel,
        startDate,
        endDate,
        pickedRegions,
        catOn,
        next,
      ]),
    )
  }

  function aiUndo() {
    if (!aiBefore) return
    const restored = aiBefore
    setRatioDraft(restored)
    setAiState("done")
    setAiSnap(
      JSON.stringify([
        varietySel,
        startDate,
        endDate,
        pickedRegions,
        catOn,
        restored,
      ]),
    )
    setAiBefore(null)
  }

  function aiReject() {
    setAiState("rejected")
    setAiCollapsed(true)
  }

  function dateError(): string {
    if (!startDate || !endDate) return "请选择推广时间"
    if (endDate < startDate) return "结束日期不能早于开始日期"
    return ""
  }

  function goStep1() {
    const err = dateError()
    if (err) return addToast({ type: "error", title: err })
    if (!varietySel.length)
      return addToast({ type: "error", title: "请选择推广品种" })
    if (!pickedRegions.length)
      return addToast({ type: "error", title: "请选择推广地区" })
    if (!pickedCatGroups.length)
      return addToast({ type: "error", title: "请至少选择一种服务类别" })
    if (!selectedRows.length)
      return addToast({ type: "error", title: "请至少选择一家服务商" })
    if (globalRatios === null)
      return addToast({
        type: "error",
        title: "请将各服务类别的业务比例分别调整为 100%",
      })
    // 进入第二步：预算在已选类别间平均回填（仅首次初始化，已有计划不被覆盖）
    ensurePlans("enter")
    setStep(1)
  }

  function submit() {
    const pending = selectedRows.filter((r) => !outcomeOf(r.provider))
    if (!pending.length) {
      setStep(2)
      return
    }
    const invalid = pending.find((r) => rowError(r))
    if (invalid)
      return addToast({
        type: "error",
        title: `有 ${pending.filter((r) => rowError(r)).length} 家尚未通过校验：${rowError(invalid)}`,
      })
    const inputs: CreateTaskInput[] = pending.map((row) => {
      const { items, roundingLogs } = buildItems(row)
      return {
        varieties: [...varietySel],
        provider: row.provider,
        holderPharma,
        regions: [...row.regions],
        startDate,
        endDate,
        serviceItems: items,
        settlementPeriods: defaultSettlementPeriods(startDate, endDate),
        roundingLogs,
        filledAmount: cents(row.total),
      }
    })
    const results: MutationResult<Task>[] = createTaskBatch(inputs)
    const fresh: SubmitOutcome[] = pending.map((row, i) => {
      const res = results[i]
      return res.ok
        ? {
            provider: row.provider,
            ok: true,
            taskNo: res.data?.taskNo,
            planAmount: res.data?.planAmount,
            warning: res.warning,
          }
        : { provider: row.provider, ok: false, error: res.error }
    })
    setOutcomes((prev) => [
      ...prev.filter((o) => !pending.some((p) => p.provider === o.provider)),
      ...fresh,
    ])
    setStep(2)
    const okN = fresh.filter((o) => o.ok).length
    const badN = fresh.length - okN
    addToast({
      type: badN ? "warning" : "success",
      title: badN
        ? `本次成功发包 ${okN} 家；${badN} 家创建失败，可在结果中查看原因`
        : `本次成功发包 ${okN} 家，每家已生成独立任务`,
    })
  }

  /** 内容是否仍是全新默认（与刚打开时一致）：一致则关闭时不落草稿 */
  function isPristine(): boolean {
    const freshSel = varietyOptions.length ? [varietyOptions[0].tradeName] : []
    return (
      step === 0 &&
      varietySel.join("\u0001") === freshSel.join("\u0001") &&
      startDate === openedWithRef.current.startDate &&
      endDate === openedWithRef.current.endDate &&
      !remember &&
      JSON.stringify(pickedRegions) === JSON.stringify(regionPool) &&
      JSON.stringify(catOn) === JSON.stringify(DEFAULT_CAT_ON) &&
      JSON.stringify(ratioDraft) ===
        JSON.stringify(defaultRatiosFor(lockedBook)) &&
      !removed.length &&
      !Object.keys(plans).length &&
      !vendorSearch.trim() &&
      !invalidOnly &&
      !pasteText.trim()
    )
  }

  /**
   * 关闭时收集草稿：
   * - 第 0/1 步且有实际改动 → 存当前全部内容（含计划状态：预算快照、基准、初始/当前金额数量）；
   * - 第 2 步（已提交）全部成功 → 清草稿；
   * - 第 2 步部分失败 → 存失败行草稿，已成功的服务商移入「已移除」名单，防止重复发包。
   */
  function collectDraft(): BatchDraft | null {
    const base = {
      savedAt: stampNow(),
      varietySel,
      startDate,
      endDate,
      remember,
      pickedRegions,
      catOn,
      ratioDraft,
      plans,
      vendorSearch,
      invalidOnly,
      pasteText,
    }
    if (step === 2) {
      if (!badOutcomes.length) return null
      const succeeded = new Set(okOutcomes.map((o) => o.provider))
      return {
        ...base,
        step: 1,
        removed: [...new Set([...removed, ...succeeded])],
      }
    }
    return isPristine() ? null : { ...base, step, removed }
  }

  /** 所有关闭路径统一走这里：先自动保存草稿与「记住推广时间」，再关 */
  function requestClose() {
    try {
      const draft = collectDraft()
      if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* 存储不可用时静默 */
    }
    // 记忆口径与旧入口一致：勾选记住时写入，未勾选且有旧值时清除
    try {
      if (remember) {
        localStorage.setItem(MEMORY_KEY, JSON.stringify({ startDate, endDate }))
      } else if (localStorage.getItem(MEMORY_KEY)) {
        localStorage.removeItem(MEMORY_KEY)
      }
    } catch {
      /* 存储不可用时静默 */
    }
    onClose()
  }

  /** 清空已恢复的草稿，回到全新默认 */
  function clearDraftAndReset() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* 存储不可用时静默 */
    }
    const freshSel = varietyOptions.length ? [varietyOptions[0].tradeName] : []
    setStep(0)
    setVarietySel(freshSel)
    setPickedRegions(poolForVarieties(freshSel))
    setRatioDraft(defaultRatiosFor(bookFor(freshSel)))
    setCatOn({ ...DEFAULT_CAT_ON })
    setRemoved([])
    setPlans({})
    setVendorSearch("")
    setInvalidOnly(false)
    setPasteText("")
    setOutcomes([])
    setResultFilter("全部")
    setRestoredAt(null)
    setLegacySurveyNote(false)
    setWorkDrawerFor(null)
    setWorkTab(null)
    setConfirmRestore(false)
    setPendingCatEdit(null)
    setPendingCatOff(null)
    aiTimers.current.forEach(clearTimeout)
    setAiState("idle")
    setAiStep(0)
    setAiQuota(AI_QUOTA_TOTAL)
    setAiSnap("")
    setAiBefore(null)
    setAiCollapsed(false)
    setAiSuggested(null)
    setAiRuleNames([])
    setAiHeadline("")
    setAiReasons([])
    addToast({ type: "info", title: "已清空草稿，从默认开始" })
  }

  const pendingCount = selectedRows.filter((r) => !outcomeOf(r.provider)).length
  const shownCandidates = candidateRows.filter(
    (c) =>
      !vendorSearch ||
      c.provider.includes(vendorSearch) ||
      c.regions.some((r) => r.includes(vendorSearch)),
  )
  const okOutcomes = outcomes.filter((o) => o.ok)
  const badOutcomes = outcomes.filter((o) => !o.ok)
  const resultRows = outcomes.filter(
    (o) =>
      resultFilter === "全部" ||
      (resultFilter === "成功" && o.ok) ||
      (resultFilter === "失败" && !o.ok),
  )

  // ─── 渲染 ───────────────────────────────────────────────────

  const stepBar = (
    <div
      style={{
        display: "flex",
        gap: 0,
        alignItems: "center",
        margin: "2px 0 4px",
      }}
    >
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            color: i <= step && step < 2 ? "var(--color-brand)" : "#9099A9",
            fontWeight: i <= step && step < 2 ? 600 : 400,
          }}
        >
          <i
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background:
                i <= step && step < 2 ? "var(--color-brand)" : "#E9EDF2",
              color: i <= step && step < 2 ? "#fff" : "#9099A9",
              display: "grid",
              placeItems: "center",
              fontStyle: "normal",
              fontSize: 11,
            }}
          >
            {i + 1}
          </i>
          <span style={{ margin: "0 8px 0 6px", fontSize: 12 }}>{label}</span>
          {i === 0 && (
            <b style={{ width: 90, height: 1, background: "#DCE1E8" }} />
          )}
        </div>
      ))}
    </div>
  )

  const stepScope = (
    <>
      <div className="bct-card">
        <h4>确定业务范围</h4>
        <p className="bct-desc">
          先选品种（可多选，限同一张价目表）；系统带出所选品种授权覆盖的地区及可承接服务商。按金额发包，不预设承诺次数。
        </p>
        <div className="bct-field">
          <span>
            推广品种（可多选）· 已选 {varietySel.length}{" "}
            个，同一任务内共用下方价目表快照
          </span>
          <div
            ref={varietyRef}
            className={`bct-combo${varietyOpen ? " open" : ""}`}
          >
            <button
              type="button"
              className="bct-combo-trigger"
              onClick={() => setVarietyOpen((o) => !o)}
            >
              <span
                className={`bct-combo-value${varietySel.length ? "" : " ph"}`}
              >
                {varietySel.length === 1
                  ? varietySel[0]
                  : varietySel.length
                    ? `已选择 ${varietySel.length} 个品种`
                    : "请选择推广品种"}
              </span>
              <i className="bct-combo-caret" aria-hidden>
                ▼
              </i>
            </button>
            {varietyOpen && (
              <div className="bct-combo-panel">
                <div className="bct-combo-search">
                  <span aria-hidden>⌕</span>
                  <input
                    autoFocus
                    value={varietySearch}
                    onChange={(e) => setVarietySearch(e.target.value)}
                    placeholder="搜索品种名称或规格"
                    aria-label="搜索推广品种"
                  />
                  {varietySearch && (
                    <button
                      type="button"
                      aria-label="清空搜索"
                      onClick={() => setVarietySearch("")}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="bct-combo-list">
                  {varietyOptions
                    .filter((v) =>
                      v.tradeName
                        .toLowerCase()
                        .includes(varietySearch.trim().toLowerCase()),
                    )
                    .map((v) => {
                      const checked = varietySel.includes(v.tradeName)
                      const book = varietyPriceBook(v, priceBooks)
                      const disabled =
                        !checked &&
                        !!varietySel.length &&
                        (!lockedBook || !book || book.id !== lockedBook.id)
                      return (
                        <label
                          key={v.tradeName}
                          className={disabled ? "off" : ""}
                          title={
                            disabled
                              ? "与已选品种绑定的价目表不一致，不能在同一任务中发包"
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={(e) =>
                              changeVarietySel(v.tradeName, e.target.checked)
                            }
                          />
                          <span className="bct-combo-name">{v.tradeName}</span>
                          {checked && <span className="picked">已选</span>}
                        </label>
                      )
                    })}
                  {!varietyOptions.some((v) =>
                    v.tradeName
                      .toLowerCase()
                      .includes(varietySearch.trim().toLowerCase()),
                  ) && <div className="bct-combo-empty">未找到匹配品种</div>}
                </div>
                <div className="bct-combo-foot">
                  <button
                    type="button"
                    className="bct-link"
                    onClick={selectAllVarieties}
                  >
                    全选
                  </button>
                  <span>已选择 {varietySel.length} 个</span>
                  <button
                    className="bct-link"
                    onClick={() => setVarietyOpen(false)}
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
          {varietySel.length > 1 && (
            <div className="bct-combo-chips">
              <span className="bct-combo-chip" title={varietySel[0]}>
                <span className="txt">{varietySel[0]}</span>
                <button
                  type="button"
                  aria-label={`移除品种 ${varietySel[0]}`}
                  onClick={() => changeVarietySel(varietySel[0], false)}
                >
                  ×
                </button>
              </span>
              <button
                type="button"
                className="bct-combo-more"
                title={varietySel.slice(1).join("、")}
                onClick={() => setVarietyOpen(true)}
              >
                另 {varietySel.length - 1} 个
              </button>
              <button
                type="button"
                className="bct-combo-clear"
                onClick={() =>
                  addToast({ type: "error", title: "至少保留一个推广品种" })
                }
              >
                清空
              </button>
            </div>
          )}
          {!varietyOptions.length && (
            <span style={{ color: "#8A94A5", fontSize: 12 }}>
              暂无可发包品种（需有服务商授权且绑定生效价目表）
            </span>
          )}
        </div>
        <div
          className="bct-form"
          style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}
        >
          <label className="bct-field">
            <span>推广开始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="bct-field">
            <span>推广结束日期</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        {lockedBook && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#5E7A72" }}>
            标准价目表：{lockedBook.name}（{lockedBook.version}）·
            创建时锁定快照
          </p>
        )}
        <div className="bct-subhead">
          <div>
            <h5>推广地区</h5>
            <p>
              已按所选 {varietySel.length}{" "}
              个品种的合作授权取并集；勾选地区后，服务商名单立即更新。
            </p>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <button
              className="bct-link"
              onClick={() => setPickedRegions(regionPool)}
            >
              全选地区
            </button>
            <button className="bct-link" onClick={() => setPickedRegions([])}>
              清空
            </button>
          </div>
        </div>
        <div className="bct-region-picker">
          {regionPool.map((region) => (
            <label
              key={region}
              className={pickedRegions.includes(region) ? "checked" : ""}
            >
              <input
                type="checkbox"
                checked={pickedRegions.includes(region)}
                onChange={(e) => changeRegion(region, e.target.checked)}
              />
              {region}
            </label>
          ))}
          {!regionPool.length && (
            <span style={{ color: "#8A94A5", fontSize: 12 }}>
              所选品种暂无授权地区
            </span>
          )}
        </div>
        <div className="bct-subhead">
          <div>
            <h5>本次服务类别</h5>
            <p>选择本次发包涉及的服务。下一步按服务商配置计划金额和工作量。</p>
          </div>
        </div>
        <div className="bct-category-checks">
          {/* 市场推广服务：推广明细底部含「调查问卷」行，计划份数在第二步填写（§1.1） */}
          <label>
            <input
              type="checkbox"
              checked={!!catOn[PROMO_CATEGORY]}
              onChange={(e) => changeCategory(PROMO_CATEGORY, e.target.checked)}
            />
            市场推广服务
          </label>
          {/* 报告组：三个子服务可单选 / 多选，也可与市场推广一起选择；宽度不足时换行 */}
          <span className="bct-cat-group">
            <b>{REPORT_GROUP_TITLE}</b>
            {REPORT_SERVICE_CATEGORIES.map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={!!catOn[category]}
                  onChange={(e) => changeCategory(category, e.target.checked)}
                />
                {serviceCategoryLabel(category)}
              </label>
            ))}
          </span>
        </div>
        {/* 所选类别无匹配价目：就地提示，可回上一步取消选择或先维护价目（§2.1 / §3.4） */}
        {pickedCatGroups
          .filter((g) => !g.rules.length)
          .map((g) => (
            <p
              key={g.category}
              style={{ margin: "8px 0 0", fontSize: 12, color: "#B45309" }}
            >
              {serviceCategoryFullName(g.category)}
              ：当前范围暂无可用价目，可取消选择该类别，或维护价目后继续。
            </p>
          ))}
        <label
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            marginTop: 16,
            fontSize: 12,
            color: "#5D6B7D",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: "var(--color-brand)" }}
          />
          记住本次推广时间，下次自动填入
        </label>
      </div>

      <div className="bct-card">
        <div className="bct-ai-head">
          <div>
            <h4 style={{ margin: 0 }}>统一业务比例</h4>
            <p className="bct-desc" style={{ margin: "4px 0 0" }}>
              每类业务分别合计 100%。第二步仍可为某家服务商单独调整。
            </p>
          </div>
          <div className="bct-ai-btnbox">
            <div className="bct-ai-btnrow">
              <span className="bct-ai-quota">
                每月免费 {AI_QUOTA_TOTAL} 次 · 本月剩余 {aiQuota} 次
              </span>
              <button
                type="button"
                className="bct-ai-btn"
                onClick={aiAnalyze}
                disabled={!aiReady() || aiState === "loading" || aiQuota <= 0}
                title={
                  aiReady()
                    ? undefined
                    : "请先完成品种、日期、地区、服务类别，并使比例合计 100%"
                }
              >
                ✦{" "}
                {aiState === "loading"
                  ? "分析中…"
                  : aiStale
                    ? "重新分析"
                    : "AI 统筹建议"}
              </button>
            </div>
            {!aiReady() && (
              <span className="bct-ai-hint">
                完成上方信息且比例合计 100% 后可用
              </span>
            )}
          </div>
        </div>
        <div className="bct-ratio-list" style={{ marginTop: 14 }}>
          {catGroups
            .filter((g) => catOn[g.category])
            .map((g) => {
              const sum = g.rules.reduce(
                (s, r) => s + (Number(ratioDraft[r.name]) || 0),
                0,
              )
              return (
                <section className="bct-ratio-group" key={g.category}>
                  <div className="bct-ratio-group-head">
                    <div>
                      <b>{g.category}</b>
                      <small>{g.rules.length} 项业务</small>
                    </div>
                    <Tag
                      color={Math.abs(sum - 100) < 0.001 ? "success" : "danger"}
                      label={`合计 ${Math.round(sum * 100) / 100}%`}
                    />
                  </div>
                  <div className="bct-ratio-grid head">
                    <span>业务项目</span>
                    <span>参考单价</span>
                    <span style={{ textAlign: "right" }}>默认占比</span>
                  </div>
                  {g.rules.map((r) => (
                    <div className="bct-ratio-grid" key={r.id}>
                      <span>{r.name}</span>
                      <span>
                        {formatCNY(r.amount)} / {r.unit}
                      </span>
                      <label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          aria-label={`${r.name}默认比例`}
                          className={
                            aiState === "adopted" &&
                            !aiStale &&
                            aiSuggested &&
                            r.name in aiSuggested
                              ? "bct-adopted"
                              : undefined
                          }
                          value={ratioDraft[r.name] ?? ""}
                          onChange={(e) =>
                            setRatioDraft((prev) => ({
                              ...prev,
                              [r.name]: e.target.value,
                            }))
                          }
                        />
                        %
                      </label>
                    </div>
                  ))}
                </section>
              )
            })}
          {!catGroups.some((g) => catOn[g.category]) && (
            <span style={{ color: "#8A94A5", fontSize: 12 }}>
              请先勾选服务类别
            </span>
          )}
        </div>

        {aiState === "loading" && (
          <div className="bct-ai-panel">
            <div className="bct-ai-bar">
              <span className="bct-ai-title">✦ AI 统筹建议 · 分析中</span>
              <span className="bct-ai-meta">
                约需几秒，结果生成后才计入次数
              </span>
            </div>
            <div style={{ padding: "12px 14px 14px" }}>
              <div className="bct-ai-progress">
                <i style={{ width: `${((aiStep + 1) / 3) * 92}%` }} />
              </div>
              <ol className="bct-ai-steps">
                {AI_STEPS.map((s, i) => (
                  <li key={s} className={i <= aiStep ? "on" : ""}>
                    <span
                      className={`bct-ai-stepdot${
                        i < aiStep ? " done" : i === aiStep ? " cur" : ""
                      }`}
                    >
                      {i < aiStep ? "✓" : i + 1}
                    </span>
                    {s}
                    {i === aiStep && <span className="bct-ai-pulse">…</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {aiHasResult && (
          <div className="bct-ai-panel">
            <div className="bct-ai-bar">
              <div className="bct-ai-title-box">
                <span className="bct-ai-title">✦ AI 统筹建议</span>
                {aiStale ? (
                  <Tag color="warning" label="已过期" />
                ) : aiState === "adopted" ? (
                  <Tag color="success" label="已采纳" />
                ) : aiState === "rejected" ? (
                  <Tag color="default" label="未采纳" />
                ) : null}
                <span className="bct-ai-meta">
                  演示数据 · 已使用 {AI_QUOTA_TOTAL - aiQuota} 次额度
                </span>
              </div>
              <button
                className="bct-link"
                onClick={() => setAiCollapsed(!aiCollapsed)}
              >
                {aiCollapsed ? "查看建议（不扣次数）" : "收起"}
              </button>
            </div>
            {aiStale && (
              <div className="bct-ai-strip warn">
                <span>
                  品种、日期、地区、服务类别或比例已变更，以下建议基于变更前的信息，仅供参考。
                </span>
                <button
                  className="bct-link"
                  onClick={aiAnalyze}
                  disabled={!aiReady() || aiQuota <= 0}
                  style={{ opacity: aiReady() && aiQuota > 0 ? 1 : 0.45 }}
                >
                  重新分析（消耗 1 次）
                </button>
              </div>
            )}
            {aiState === "adopted" && !aiStale && (
              <div className="bct-ai-strip ok">
                <span>
                  ✓ 已采纳：{aiRuleNames.length} 项建议比例已写入上方表格，合计
                  100%。仍可手动微调。
                </span>
                <button className="bct-link" onClick={aiUndo}>
                  撤销，恢复采纳前比例
                </button>
              </div>
            )}
            {aiState === "rejected" && !aiStale && (
              <div className="bct-ai-strip mute">
                已保留当前比例（
                {aiRuleNames
                  .map((n) => `${Number((aiBefore ?? ratioDraft)[n]) || 0}%`)
                  .join(" / ")}
                {aiCollapsed
                  ? " 未改动）。建议已收起，可随时再次查看。"
                  : " 未改动）。"}
              </div>
            )}
            {!aiCollapsed && (
              <div className={`bct-ai-body${aiStale ? " dim" : ""}`}>
                <p className="bct-ai-headline">{aiHeadline}</p>
                <div className="bct-ai-cols">
                  <table className="bct-ai-table">
                    <thead>
                      <tr>
                        <th>业务项目</th>
                        <th>当前比例</th>
                        <th>AI 建议比例</th>
                        <th>变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiRuleNames.map((name) => {
                        const cur = Number((aiBefore ?? ratioDraft)[name]) || 0
                        const sug = aiSuggested?.[name] ?? 0
                        const d = cents(sug - cur)
                        return (
                          <tr key={name}>
                            <td>{name}</td>
                            <td className="cur">{cur}%</td>
                            <td className="sug">{sug}%</td>
                            <td
                              className={d > 0 ? "up" : d < 0 ? "down" : "flat"}
                            >
                              {d > 0 ? "+" : ""}
                              {d}%
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="sum">
                        <td>合计</td>
                        <td>100%</td>
                        <td className="sug">
                          {aiRuleNames.reduce(
                            (s, n) => s + (aiSuggested?.[n] ?? 0),
                            0,
                          )}
                          %
                        </td>
                        <td>—</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="bct-ai-reasons">
                    <h6>依据</h6>
                    <ol>
                      {aiReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ol>
                  </div>
                </div>
                <p className="bct-ai-note">
                  建议比例可调整，最终仍需结合本次推广目标与服务商能力确认。
                </p>
                {aiState === "done" && !aiStale && (
                  <div className="bct-ai-actions">
                    <button
                      type="button"
                      className="bct-ai-ghost"
                      onClick={aiReject}
                    >
                      不采纳，保留当前比例
                    </button>
                    <button
                      type="button"
                      className="bct-ai-primary"
                      onClick={aiAdopt}
                    >
                      采纳建议
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bct-card">
        <h4>匹配的服务商</h4>
        <p className="bct-desc">
          按品种、地区和有效合作授权筛出；可从本次名单中移除，也可重新加入。
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 16,
            marginBottom: 10,
          }}
        >
          <label className="bct-field" style={{ width: 230 }}>
            <span>查找服务商或地区</span>
            <input
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="输入名称或省份"
            />
          </label>
          <span style={{ color: "#778396", fontSize: 12 }}>
            已选地区 {pickedRegions.length} 个 · {selectedRows.length} 家已选 /{" "}
            {candidateRows.length} 家可选
          </span>
        </div>
        <div className="bct-table-wrap" style={{ maxHeight: 320 }}>
          <table className="bct-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>服务商</th>
                <th>服务地区</th>
                <th>本次预算</th>
                <th>本次状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {shownCandidates.map((c) => {
                const included = !removed.includes(c.provider)
                const budget = liveBudgetFor(c.provider, c.regions)
                return (
                  <tr key={c.provider} style={{ opacity: included ? 1 : 0.6 }}>
                    <td>
                      <b>{c.provider}</b>
                    </td>
                    <td>{c.regions.join("、")}</td>
                    <td
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: budget.configured
                          ? "var(--color-text-1)"
                          : "#98A2B3",
                      }}
                      title={budget.detail}
                    >
                      {budget.configured ? formatCNY(budget.amount) : "未配置"}
                    </td>
                    <td>
                      <Tag
                        color={included ? "success" : "default"}
                        label={included ? "已加入" : "已移除"}
                      />
                    </td>
                    <td>
                      <button
                        className="bct-link"
                        onClick={() => toggleVendor(c.provider, !included)}
                      >
                        {included ? "移除" : "重新加入"}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!shownCandidates.length && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "#8A94A5",
                    }}
                  >
                    该品种和地区下暂无可用服务商
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )

  const visibleStep2Rows = selectedRows.filter(
    (r) => !invalidOnly || rowError(r),
  )

  /** 金额表列分组：推广单列；报告三类归入「调研与报告一体化服务」组头（§3.1） */
  const promoPickedGroups = pickedCatGroups.filter(
    (g) => g.category === PROMO_CATEGORY,
  )
  const reportPickedGroups = pickedCatGroups.filter(
    (g) => g.category !== PROMO_CATEGORY,
  )
  const amountHeaderRows = reportPickedGroups.length ? 2 : 1

  /** 预算差额展示：未配置＝—，计划小于预算＝未安排，超出＝超预算（警告色） */
  function renderDiff(
    budget: BudgetSnapshot,
    total: number,
  ) {
    if (!budget.configured) return <span style={{ color: "#98A2B3" }}>—</span>
    const d = cents(budget.amount - total)
    if (Math.abs(d) < 0.005) return formatCNY(0)
    if (d > 0)
      return <span style={{ color: "#5D6B7D" }}>未安排 {formatCNY(d)}</span>
    return (
      <span style={{ color: "#B45309", fontWeight: 600 }}>
        超预算 {formatCNY(-d)}
      </span>
    )
  }

  const stepAmount = (
    <>
      <div className="bct-summary">
        <div className="bct-has-pop">
          <span>已选品种</span>
          <b>{varietySel.length} 个</b>
          {varietySel.length > 0 && (
            <div className="bct-pop">{varietySel.join("、")}</div>
          )}
        </div>
        <div className="bct-has-pop">
          <span>包含区域</span>
          <b>{pickedRegions.length} 个</b>
          {pickedRegions.length > 0 && (
            <div className="bct-pop">{pickedRegions.join("、")}</div>
          )}
        </div>
        <div>
          <span>计划已生成</span>
          <b>{selectedRows.filter((r) => r.total > 0).length} 家</b>
        </div>
        <div>
          <span>本次计划总金额</span>
          <b>{formatCNY(planTotal)}</b>
        </div>
        <div>
          <span>异常</span>
          <b className={errorCount ? "danger" : ""}>{errorCount} 家</b>
        </div>
      </div>
      <div className="bct-card" style={{ marginTop: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0 }}>服务商计划金额</h4>
            <p className="bct-desc" style={{ margin: "4px 0 0" }}>
              本次预算在已选服务类别间平均回填；计划合计＝推广小计与各报告子服务金额之和（只读）。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              onClick={() => {
                setPasteText("")
                setPasteOpen(true)
              }}
            >
              从 Excel 粘贴总金额
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setInvalidOnly(!invalidOnly)}
            >
              {invalidOnly ? "显示全部" : "仅看异常"}
            </Button>
          </div>
        </div>
        <div className="bct-table-wrap">
          <table className="bct-table">
            <thead>
              <tr>
                <th className="sticky-col" rowSpan={amountHeaderRows}>
                  服务商
                </th>
                <th rowSpan={amountHeaderRows}>本次预算</th>
                {promoPickedGroups.map((g) => (
                  <th
                    key={g.category}
                    rowSpan={amountHeaderRows}
                    title={serviceCategoryFullName(g.category)}
                  >
                    {serviceCategoryShort(g.category)}
                  </th>
                ))}
                {reportPickedGroups.length > 0 && (
                  <th colSpan={reportPickedGroups.length}>
                    {REPORT_GROUP_TITLE}
                  </th>
                )}
                <th rowSpan={amountHeaderRows}>计划合计</th>
                <th rowSpan={amountHeaderRows}>预算差额</th>
                <th rowSpan={amountHeaderRows}>操作</th>
              </tr>
              {reportPickedGroups.length > 0 && (
                <tr>
                  {reportPickedGroups.map((g) => (
                    <th
                      key={g.category}
                      title={serviceCategoryFullName(g.category)}
                    >
                      {serviceCategoryShort(g.category)}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {visibleStep2Rows.map((row) => {
                const err = rowError(row)
                const done = outcomeOf(row.provider)
                return (
                  <tr key={row.provider} className={err ? "bct-row-error" : ""}>
                    <td className="sticky-col">
                      <b>{row.provider}</b>
                      {(row.hasAdjusted || done || err) && (
                        <small className="sub">
                          {row.hasAdjusted ? "已调整工作量" : ""}
                          {row.hasAdjusted && done ? " · " : ""}
                          {done ? `已创建 ${done.taskNo}` : err || ""}
                        </small>
                      )}
                    </td>
                    <td
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: row.budget.configured
                          ? "var(--color-text-1)"
                          : "#98A2B3",
                      }}
                    >
                      {row.budget.configured
                        ? formatCNY(row.budget.amount)
                        : "未配置"}
                    </td>
                    {pickedCatGroups.map((g) => {
                      const pending =
                        pendingCatEdit &&
                        pendingCatEdit.provider === row.provider &&
                        pendingCatEdit.category === g.category
                          ? pendingCatEdit.value
                          : null
                      return (
                        <td key={g.category}>
                          <input
                            className="bct-money-input"
                            type="number"
                            min={0}
                            step={0.01}
                            aria-label={`${row.provider} ${serviceCategoryFullName(g.category)}`}
                            value={
                              pending ?? cents(row.catCurrent[g.category] ?? 0)
                            }
                            disabled={!!done}
                            onChange={(e) =>
                              requestCatAmount(
                                row.provider,
                                g.category,
                                Number(e.target.value) || 0,
                              )
                            }
                          />
                        </td>
                      )
                    })}
                    <td>
                      <div className="bct-money-readonly">
                        {formatCNY(row.total)}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {renderDiff(row.budget, row.total)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="bct-link"
                        onClick={() => openWorkDrawer(row.provider)}
                        disabled={!!done || !row.initialized}
                        style={{ opacity: done || !row.initialized ? 0.4 : 1 }}
                        title={
                          row.initialized
                            ? undefined
                            : "计划尚未生成，请重新进入本页"
                        }
                      >
                        调整工作量
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!visibleStep2Rows.length && (
                <tr>
                  <td
                    colSpan={pickedCatGroups.length + 5}
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "#8A94A5",
                    }}
                  >
                    {invalidOnly ? "没有异常服务商" : "请先在第一步选择服务商"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bct-footnote">
          仅显示第一步选中的服务类别；报告三类金额列归入「调研与报告一体化服务」组，列头悬停可见完整名称。
          未配置预算时差额显示「—」，可手动填写计划金额；从 Excel 粘贴的总金额将计入首个已选服务类别。
        </div>
      </div>
    </>
  )

  const stepResult = (
    <div className="bct-card" style={{ marginTop: 0 }}>
      <div className="bct-result-hero">
        <div
          className="bct-result-mark"
          style={{
            background: badOutcomes.length ? "#FEF3E2" : "#E6F5ED",
            color: badOutcomes.length ? "#C77A16" : "#248A5A",
          }}
        >
          {badOutcomes.length ? "!" : "✓"}
        </div>
        <div>
          <h4 style={{ margin: 0 }}>
            {badOutcomes.length ? "提交完成（部分失败）" : "提交完成"}
          </h4>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A94A5" }}>
            每家成功服务商已生成独立任务，进入「待确认」；失败行可返回修改后重新提交。
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 26 }}>
          <span style={{ color: "#548066", fontSize: 12 }}>
            <b style={{ fontSize: 24 }}>{okOutcomes.length}</b> 成功
          </span>
          <span
            style={{
              color: badOutcomes.length ? "#C73A3A" : "#8A94A5",
              fontSize: 12,
            }}
          >
            <b style={{ fontSize: 24 }}>{badOutcomes.length}</b> 失败
          </span>
        </div>
      </div>
      <div className="bct-tabs">
        {(["全部", "成功", "失败"] as const).map((x) => (
          <button
            key={x}
            className={resultFilter === x ? "on" : ""}
            onClick={() => setResultFilter(x)}
          >
            {x}{" "}
            {x === "全部"
              ? outcomes.length
              : x === "成功"
                ? okOutcomes.length
                : badOutcomes.length}
          </button>
        ))}
      </div>
      <div className="bct-table-wrap" style={{ marginTop: 12, maxHeight: 320 }}>
        <table className="bct-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>服务商</th>
              <th>品种 / 地区</th>
              <th>任务金额</th>
              <th>提交结果</th>
              <th>独立任务编号</th>
              <th>任务状态</th>
            </tr>
          </thead>
          <tbody>
            {resultRows.map((o) => {
              const row = rows.find((r) => r.provider === o.provider)
              return (
                <tr key={o.provider} className={o.ok ? "" : "bct-row-error"}>
                  <td>
                    <b>{o.provider}</b>
                  </td>
                  <td>
                    <span title={varietySummary().full}>
                      {varietySummary().text}
                    </span>{" "}
                    / {(row?.regions ?? []).join("、")}
                  </td>
                  <td>{formatCNY(row?.total ?? 0)}</td>
                  <td>
                    {o.ok ? (
                      <>
                        <Tag color="success" label="创建成功" />
                        {o.warning && (
                          <small className="sub" style={{ color: "#B45309" }}>
                            {o.warning}
                          </small>
                        )}
                      </>
                    ) : (
                      <>
                        <Tag color="danger" label="创建失败" />
                        <small className="sub" style={{ color: "#BD4545" }}>
                          {o.error}
                        </small>
                      </>
                    )}
                  </td>
                  <td>{o.ok ? o.taskNo : "—"}</td>
                  <td>
                    {o.ok ? <Tag color="warning" label="待确认" /> : "未创建"}
                  </td>
                </tr>
              )
            })}
            {!resultRows.length && (
              <tr>
                <td
                  colSpan={6}
                  style={{ textAlign: "center", padding: 30, color: "#8A94A5" }}
                >
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const drawerRow = workDrawerFor
    ? rows.find((r) => r.provider === workDrawerFor)
    : undefined

  /** 弹窗草稿行（渲染与保存共用同一求值）：输入文本 + 当前数量 + 当前显示金额 */
  interface DrawerRowView {
    rule: PriceBookRule
    saved: PlanItemState
    cell: WorkDraftCell
    /** 草稿当前数量（输入合法时＝输入值；空值沿用已保存数量） */
    qty: number
    /** 非空但不是非负整数（数据错误，阻止保存） */
    invalid: boolean
  }

  const drawerCats: {
    group: { category: ServiceCategory; rules: PriceBookRule[] }
    rows: DrawerRowView[]
    catTotal: number
  }[] = (() => {
    if (!drawerRow) return []
    const p = plans[drawerRow.provider]
    if (!p) return []
    return pickedCatGroups
      .map((g) => {
        const cat = p.categories[g.category]
        if (!cat) return null
        const rows: DrawerRowView[] = []
        g.rules.forEach((r) => {
          const saved = cat.items[r.name]
          if (!saved) return
          const cell = workQtyDraft[g.category]?.[r.name] ?? {
            text: String(saved.qty),
            amount: saved.amount,
          }
          rows.push({
            rule: r,
            saved,
            cell,
            qty: draftQtyOf(cell, saved),
            invalid: cell.text !== "" && !draftTextOk(cell.text),
          })
        })
        return {
          group: g,
          rows,
          catTotal: cents(
            rows.reduce((s, x) => s + draftAmountOf(x.cell, x.saved), 0),
          ),
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  })()

  /** 草稿计划合计（跨类别金额求和） */
  const drawerDraftTotal = cents(drawerCats.reduce((s, c) => s + c.catTotal, 0))
  /** 推广区 / 报告区拆分：推广独立成区，报告三类以页签编辑（§3.2） */
  const drawerPromo =
    drawerCats.find((c) => c.group.category === PROMO_CATEGORY) ?? null
  const drawerReports = drawerCats.filter(
    (c) => c.group.category !== PROMO_CATEGORY,
  )
  const drawerReportTotal = cents(
    drawerReports.reduce((s, c) => s + c.catTotal, 0),
  )
  /** 各类别非法输入数：页签角标（非当前页签也显示错误提示） */
  const drawerInvalidByCat: Partial<Record<ServiceCategory, number>> =
    Object.fromEntries(
      drawerCats
        .map((c) => [c.group.category, c.rows.filter((x) => x.invalid).length] as const)
        .filter(([, n]) => n > 0),
    )
  /** 当前页签的类别内容（草稿跨页签保留在同一弹窗） */
  const activeReport =
    drawerReports.find((c) => c.group.category === workTab) ??
    drawerReports[0] ??
    null

  /**
   * 报告页签键盘导航：←/→/↑/↓ 相邻移动、Home/End 跳两端，选中随焦点移动；
   * 页签为 roving tabindex（选中页签 tabindex=0，其余 -1）。
   */
  function moveReportTab(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    category: ServiceCategory,
  ) {
    const cats = drawerReports.map((c) => c.group.category)
    const i = cats.indexOf(category)
    if (i < 0) return
    let next = -1
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % cats.length
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + cats.length) % cats.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = cats.length - 1
    if (next < 0) return
    event.preventDefault()
    setWorkTab(cats[next])
    requestAnimationFrame(() => {
      const list = event.currentTarget.parentElement
      const target = list?.querySelector<HTMLButtonElement>(
        `[data-cat="${CSS.escape(cats[next])}"]`,
      )
      target?.focus()
    })
  }

  /** 弹窗单类明细表（推广区 / 报告页签共用）：数量步进 + 行内错误 + 本类小计 */
  function renderDrawerTable(
    entry: (typeof drawerCats)[number],
    sumLabel: string,
  ) {
    if (!entry.rows.length)
      return (
        <div
          style={{
            padding: "24px 14px",
            textAlign: "center",
            color: "#8A94A5",
            fontSize: 12,
          }}
        >
          当前服务范围暂无可用价目
        </div>
      )
    return (
      <table className="bct-adj-table">
        <thead>
          <tr>
            <th>服务项目</th>
            <th>单价</th>
            <th>计划数量</th>
            <th>计划金额</th>
          </tr>
        </thead>
        <tbody>
          {entry.rows.map((x) => (
            <tr key={x.rule.id}>
              <td>
                <b>{x.rule.name}</b>
              </td>
              <td>
                {formatCNY(x.rule.amount)} / {x.rule.unit}
              </td>
              <td>
                <span className="bct-adj-step">
                  <button
                    type="button"
                    aria-label={`减少${x.rule.name}数量`}
                    disabled={x.qty <= 0}
                    onClick={() => stepDraftQty(entry.group.category, x.saved, -1)}
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${drawerRow?.provider ?? ""}${x.rule.name}计划数量`}
                    aria-invalid={x.invalid}
                    value={x.cell.text}
                    onChange={(e) =>
                      changeDraftQty(entry.group.category, x.saved, e.target.value)
                    }
                    onBlur={() => blurDraftQty(entry.group.category, x.saved)}
                  />
                  <button
                    type="button"
                    aria-label={`增加${x.rule.name}数量`}
                    onClick={() => stepDraftQty(entry.group.category, x.saved, 1)}
                  >
                    ＋
                  </button>
                  <span className="unit">{x.rule.unit}</span>
                </span>
                {x.invalid && (
                  <span className="bct-adj-sub warn">
                    请输入非负整数数量
                  </span>
                )}
              </td>
              <td>
                <b>{formatCNY(draftAmountOf(x.cell, x.saved))}</b>
              </td>
            </tr>
          ))}
          <tr className="sum">
            <td>{sumLabel}</td>
            <td>—</td>
            <td>—</td>
            <td>{formatCNY(entry.catTotal)}</td>
          </tr>
        </tbody>
      </table>
    )
  }
  /** 是否存在有效分配基准（任一类别基准 > 0）：恢复初始分配的可用条件 */
  const drawerHasBaseline = drawerCats.some((c) => {
    const cat = drawerRow
      ? plans[drawerRow.provider]?.categories[c.group.category]
      : undefined
    return (cat?.baseline ?? 0) > 0
  })
  /** 草稿是否偏离初始分配（数量或金额任一）：未偏离时恢复按钮禁用 */
  const drawerDeviates = drawerCats.some((c) =>
    c.rows.some(
      (x) =>
        x.qty !== x.saved.initialQty ||
        !sameAmount(draftAmountOf(x.cell, x.saved), x.saved.initialAmount),
    ),
  )
  const drawerBudget = drawerRow?.budget ?? {
    amount: 0,
    configured: false,
  }

  return (
    <>
      {/* 样式表挂组件根级：粘贴/比例抽屉弹窗打开时主弹窗会隐藏卸载，挂主弹窗内会丢样式 */}
      <style>{bctCss}</style>
      {/* 应用内整页：随应用壳布局（侧边栏/顶栏保留），页头带返回、内容区滚动、底部操作条常驻 */}
      <div className="bct-shell">
        <div className="bct-head">
          <button
            type="button"
            className="bct-back"
            aria-label="返回任务列表"
            onClick={requestClose}
          >
            <ArrowLeft size={17} aria-hidden />
          </button>
          <div style={{ minWidth: 0 }}>
            <h3>创建任务 · 多服务商批量发包</h3>
            {step < 2 && (
              <div className="bct-head-note">
                {restoredAt ? (
                  <>
                    已恢复 {restoredAt} 自动保存的草稿，可直接继续填写
                    <button
                      className="bct-link"
                      style={{ marginLeft: 8 }}
                      onClick={() => setConfirmClear(true)}
                    >
                      清空重填
                    </button>
                  </>
                ) : (
                  "离开时自动保存已填内容，下次进入自动恢复"
                )}
                {legacySurveyNote && (
                  <span style={{ color: "#B45309", marginLeft: 8 }}>
                    检测到旧版「按品种选问卷」配置：本版已改为按价目计价，请复核服务类别与工作量后继续。
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="bct-body">
          {stepBar}
          {step === 0 && stepScope}
          {step === 1 && stepAmount}
          {step === 2 && stepResult}
        </div>
        <div className="bct-footbar">
          <span style={{ marginRight: "auto", fontSize: 12, color: "#7C8798" }}>
            {step < 2
              ? `已选 ${selectedRows.length} 家服务商 · 各家独立生成任务`
              : `成功 ${okOutcomes.length} 家 · 失败 ${badOutcomes.length} 家`}
          </span>
          {step === 0 && (
            <>
              <Button variant="secondary" onClick={requestClose}>
                返回列表
              </Button>
              <Button variant="primary" onClick={goStep1}>
                下一步：配置金额
              </Button>
            </>
          )}
          {step === 1 && (
            <>
              <Button variant="secondary" onClick={() => setStep(0)}>
                上一步
              </Button>
              <Button variant="primary" onClick={submit}>
                {pendingCount ? `确认发包 ${pendingCount} 家` : "查看结果"}
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              {badOutcomes.length > 0 && (
                <Button variant="secondary" onClick={() => setStep(1)}>
                  返回修改失败行
                </Button>
              )}
              <Button variant="primary" onClick={requestClose}>
                完成并返回列表
              </Button>
            </>
          )}
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          open={confirmClear}
          title="清空重填？"
          description="将删除已自动保存的草稿，并清空当前已填的全部内容（品种、地区、比例、金额），回到默认填写状态。"
          impact="此操作不可撤销"
          confirmLabel="清空并重填"
          cancelLabel="取消"
          variant="danger"
          onConfirm={() => {
            setConfirmClear(false)
            clearDraftAndReset()
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {pasteOpen && (
        <Modal
          open={pasteOpen}
          title="从 Excel 粘贴任务金额"
          onClose={() => setPasteOpen(false)}
          width={760}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPasteOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={pasteAmounts}>
                匹配并更新金额
              </Button>
            </>
          }
        >
          <p
            style={{
              margin: "0 0 4px",
              color: "#68768A",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            复制两列：服务商名称和金额。粘贴后按完整名称匹配已选服务商，总金额将计入首个已选服务类别。
          </p>
          <textarea
            className="bct-paste-area"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={
              "安和医药服务有限公司\t100000\n诚远医药咨询有限公司\t200000"
            }
          />
        </Modal>
      )}

      {workDrawerFor && drawerRow && (
        <Modal
          open={!!workDrawerFor}
          title={`调整工作量 · ${drawerRow.provider}`}
          onClose={() => setWorkDrawerFor(null)}
          width={760}
          footer={
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={!drawerHasBaseline || !drawerDeviates}
                onClick={() => setConfirmRestore(true)}
              >
                恢复初始分配
              </Button>
              <Button
                variant="secondary"
                onClick={() => setWorkDrawerFor(null)}
              >
                取消
              </Button>
              {/* 保存可点击：存在非法数量时定位到首个错误页签（§3.2），而不是禁用 */}
              <Button variant="primary" onClick={saveWorkDrawer}>
                保存调整
              </Button>
            </>
          }
        >
          <div className="bct-adj-top">
            <span title={varietySummary().full}>
              品种：<b>{varietySummary().text}</b>
            </span>
            <span>
              执行地区：<b>{drawerRow.regions.join("、")}</b>
            </span>
            <span>
              价目表：
              <b>
                {lockedBook
                  ? `${lockedBook.name}（${lockedBook.version}）`
                  : "—"}
              </b>
            </span>
          </div>

          {/* 市场推广服务区：明细底部含「调查问卷」行（价目表顺序在末位），小计行 = 推广小计 */}
          {drawerPromo && (
            <section className="bct-adj-cat">
              <div className="bct-adj-cat-head">
                <b>{serviceCategoryLabel(drawerPromo.group.category)}</b>
              </div>
              {renderDrawerTable(drawerPromo, "推广小计")}
            </section>
          )}

          {/* 调研与报告一体化服务区：组头带报告小计，三个已选子服务页签共享同一弹窗草稿 */}
          {drawerReports.length > 0 && activeReport && (
            <section className="bct-adj-cat">
              <div className="bct-adj-report-head">
                <b>
                  {REPORT_GROUP_TITLE}
                  {drawerReports.length === 1 &&
                    ` · ${serviceCategoryLabel(activeReport.group.category)}`}
                </b>
                <span className="sum">
                  报告小计 <b>{formatCNY(drawerReportTotal)}</b>
                </span>
              </div>
              {drawerReports.length > 1 && (
                <div
                  role="tablist"
                  aria-label={`${REPORT_GROUP_TITLE}子服务页签`}
                  className="bct-adj-tabs"
                >
                  {drawerReports.map((c) => {
                    const cat = c.group.category
                    const selected = activeReport.group.category === cat
                    const invalidN = drawerInvalidByCat[cat] ?? 0
                    return (
                      <button
                        key={cat}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls="bct-report-panel"
                        id={`bct-tab-${cat}`}
                        data-cat={cat}
                        tabIndex={selected ? 0 : -1}
                        className="bct-adj-tab"
                        onClick={() => setWorkTab(cat)}
                        onKeyDown={(e) => moveReportTab(e, cat)}
                      >
                        {serviceCategoryLabel(cat)}
                        {invalidN > 0 && (
                          <span
                            className="err-badge"
                            title={`${invalidN} 处数量需修正`}
                          >
                            {invalidN}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              <div
                role="tabpanel"
                id="bct-report-panel"
                aria-labelledby={`bct-tab-${activeReport.group.category}`}
              >
                {renderDrawerTable(activeReport, "本类小计")}
              </div>
            </section>
          )}

          <div className="bct-adj-budget">
            <span>
              本次预算{" "}
              <b>
                {drawerBudget.configured
                  ? formatCNY(drawerBudget.amount)
                  : "未配置"}
              </b>
            </span>
            <span>
              计划合计 <b>{formatCNY(drawerDraftTotal)}</b>
            </span>
            <span>{renderDiff(drawerBudget, drawerDraftTotal)}</span>
          </div>
        </Modal>
      )}

      {confirmRestore && (
        <ConfirmDialog
          open={confirmRestore}
          title="恢复初始分配？"
          description="将把该服务商各项目的数量与计划金额一并恢复到初始分配，已做的调整会被覆盖。"
          confirmLabel="恢复初始分配"
          cancelLabel="取消"
          onConfirm={restoreInitialAllocation}
          onCancel={() => setConfirmRestore(false)}
        />
      )}

      {pendingCatEdit && (
        <ConfirmDialog
          open={!!pendingCatEdit}
          title="覆盖已调整的工作量？"
          description={`「${
            serviceCategoryLabel(pendingCatEdit.category)
          }」改为 ${formatCNY(
            pendingCatEdit.value,
          )} 后，将按统一比例重新生成该类别的项目金额与整数数量，已手动调整的数量会被替换。`}
          confirmLabel="覆盖并重新分配"
          cancelLabel="取消"
          onConfirm={() => {
            applyCatAmount(
              pendingCatEdit.provider,
              pendingCatEdit.category,
              pendingCatEdit.value,
            )
            setPendingCatEdit(null)
          }}
          onCancel={() => setPendingCatEdit(null)}
        />
      )}

      {pendingCatOff && (
        <ConfirmDialog
          open={!!pendingCatOff}
          title={`取消「${serviceCategoryLabel(pendingCatOff)}」？`}
          description={`该类别的计划（含已调整的项目金额与数量）将从本批次移除；其他类别和其他服务商的调整按各自记录保留。`}
          confirmLabel="移出该类别计划"
          cancelLabel="保留该类别"
          onConfirm={confirmCatOff}
          onCancel={() => setPendingCatOff(null)}
        />
      )}
    </>
  )
}
