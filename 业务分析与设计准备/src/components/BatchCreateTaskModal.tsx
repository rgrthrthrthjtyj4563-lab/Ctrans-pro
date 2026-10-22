import { useEffect, useMemo, useRef, useState } from "react"
import { Modal } from "./Modal"
import { ConfirmDialog } from "./ConfirmDialog"
import { Button } from "./Button"
import { Tag } from "./StatusTag"
import {
  DEMO_NOW,
  useTaskData,
  type MutationResult,
} from "../context/TaskDataContext"
import {
  defaultSettlementPeriods,
  isPriceBookActive,
  nearestTier,
  varietyPriceBook,
} from "../domain/taskV4"
import { formatCNY } from "../constants"
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
 * 多服务商批量发包（两步）：
 * ① 多选品种（限同一张价目表）→ 带出授权地区与可承接服务商（可移除/重加）→ 勾服务类别 → 调整统一业务比例
 * ② 逐家填任务总金额与各类拆分金额（可单家覆盖比例）→ 一次提交
 * 提交后每家服务商生成一条独立任务（含全部所选品种），走原有确认 / 拆解 / 审核 / 结算链路。
 * 不设批次概念：结果反馈为弹窗内会话态。
 * 关闭弹窗时自动保存未完成草稿（localStorage），下次打开恢复；提交全部成功后草稿清除。
 */

const MEMORY_KEY = "by-create-task-memory"
const DRAFT_KEY = "by-create-task-draft-v1"

const STEP_LABELS = ["品种、地区、比例与服务商", "逐家金额与提交"]

/** AI 统筹建议：分析步骤文案与每次打开的免费额度（会话态，不落草稿） */
const AI_STEPS = ["梳理本企业往期任务", "检查本次业务比例", "归纳同类任务配置特征"]
const AI_QUOTA_TOTAL = 10

/** 本期不提供的价目类别：价目表内若含其规则，本弹窗一律不露出 */
const EXCLUDED_CATEGORY: ServiceCategory = "问卷调研与分析服务"

const DEFAULT_CAT_ON: Record<string, boolean> = {
  市场推广服务: true,
  分析报告服务: false,
}

/** 价目类别 → 步骤②金额列的短名（对齐已验证演示原型的列头） */
const CATEGORY_COLUMN: Record<string, string> = {
  市场推广服务: "市场推广金额",
  分析报告服务: "分析报告金额",
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
  removed: string[]
  amounts: Record<string, AmountEntry>
  customRatiosMap: Record<string, Record<string, number>>
  vendorSearch: string
  invalidOnly: boolean
  pasteText: string
}

/** 价目表按类别分组（保持价目表内顺序，过滤本期不提供的类别） */
function visibleGroups(
  book: PriceBook | undefined,
): { category: ServiceCategory; rules: PriceBookRule[] }[] {
  if (!book) return []
  const order: ServiceCategory[] = []
  const map = new Map<ServiceCategory, PriceBookRule[]>()
  book.rules
    .filter((r) => r.category !== EXCLUDED_CATEGORY)
    .forEach((r) => {
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

interface AmountEntry {
  total: number
  catAmounts: Partial<Record<ServiceCategory, number>>
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
  open: boolean
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
.bct-category-checks{display:flex;gap:24px;align-items:center;color:#44536C;font-size:13px}
.bct-category-checks label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;white-space:nowrap}
.bct-category-checks input{accent-color:var(--color-brand)}
.bct-ratio-list{display:flex;flex-direction:column;gap:12px;max-height:340px;overflow-y:auto;padding-right:4px}
.bct-ratio-group{border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
.bct-ratio-group-head{display:flex;align-items:center;justify-content:space-between;background:#F7FAF9;padding:10px 14px}
.bct-ratio-group-head b{font-size:13px}
.bct-ratio-group-head small{display:block;color:#8090A4;font-size:11px;margin-top:2px}
.bct-ratio-grid{display:grid;grid-template-columns:minmax(170px,2fr) minmax(120px,1fr) 120px;gap:12px;align-items:center;padding:8px 14px;border-top:1px solid #F0F2F5;font-size:12px}
.bct-ratio-grid.head{color:#758398;background:#FAFBFD;font-weight:600}
.bct-ratio-grid label{display:flex;align-items:center;gap:4px;justify-content:flex-end}
.bct-ratio-grid input{height:30px;width:78px;border:1px solid #D7DEE9;border-radius:5px;text-align:right;padding:0 8px;font:inherit}
.bct-money-input{height:32px;width:120px;border:1px solid var(--color-border);border-radius:5px;text-align:right;padding:0 9px;font:inherit;font-variant-numeric:tabular-nums}
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
.bct-validation{min-width:190px}
.bct-validation small{display:block;color:#BD4545;line-height:1.4;margin-top:4px}
.bct-result-hero{display:flex;align-items:center;gap:14px;border:1px solid var(--color-border);border-radius:10px;padding:18px;margin-bottom:4px}
.bct-result-mark{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;font-size:22px;font-weight:800;flex-shrink:0}
.bct-tabs{display:flex;gap:22px;border-bottom:1px solid #E4E8EE;height:36px;align-items:flex-start;margin:14px 0 0}
.bct-tabs button{border:0;background:transparent;color:#6D778A;padding:0 0 10px;cursor:pointer;font-weight:600;font-size:13px;font-family:inherit}
.bct-tabs button.on{color:var(--color-brand);border-bottom:2px solid var(--color-brand)}
.bct-footnote{color:#778396;font-size:11px;padding-top:10px}
.bct-link{border:0;background:transparent;color:var(--color-brand);cursor:pointer;font-weight:600;padding:2px 0;font-size:12px;font-family:inherit;text-align:left}
.bct-link:hover{text-decoration:underline}
.bct-paste-area{width:100%;min-height:220px;border:1px solid var(--color-border);border-radius:6px;padding:12px;resize:vertical;font:inherit;margin-top:10px;box-sizing:border-box}
.bct-drawer-meta{display:grid;grid-template-columns:1fr 1fr;background:#F5F7FA;padding:10px 12px;border-radius:6px;gap:8px;margin:14px 0 18px;color:#657185;font-size:12px}
.bct-drawer-row{display:grid;grid-template-columns:1fr 100px 120px 120px;align-items:center;border-bottom:1px solid #E9ECF0;padding:10px 0;gap:12px;font-size:12px}
.bct-drawer-row small{display:block;color:#8590A1;margin-top:3px}
.bct-drawer-row label{display:flex;border:1px solid #D9DFE7;border-radius:5px;align-items:center;padding-right:6px;justify-self:end}
.bct-drawer-row input{border:0;width:64px;height:30px;text-align:right;font:inherit}
.bct-drawer-row>b{text-align:right}
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
`

export function BatchCreateTaskModal({
  open,
  onClose,
  addToast,
  holderPharma,
}: Props) {
  const { varieties, priceBooks, auths, createTaskBatch } = useTaskData()

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
  const [amounts, setAmounts] = useState<Record<string, AmountEntry>>({})
  const [customRatiosMap, setCustomRatiosMap] = useState<
    Record<string, Record<string, number>>
  >({})
  const [vendorSearch, setVendorSearch] = useState("")
  const [invalidOnly, setInvalidOnly] = useState(false)
  const [ratioDrawerFor, setRatioDrawerFor] = useState<string | null>(null)
  const [drawerDraft, setDrawerDraft] = useState<Record<string, string>>({})
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
  const openedWithRef = useRef({ startDate: "2026-09-01", endDate: "2026-09-30" })

  /** 品种下拉面板：触发框 + 搜索下拉 + 多选摘要行 */
  const [varietyOpen, setVarietyOpen] = useState(false)
  const [varietySearch, setVarietySearch] = useState("")
  const varietyRef = useRef<HTMLDivElement>(null)

  /** AI 统筹建议（会话态）：额度 / 加载步骤 / 结果快照，随弹窗关闭重置 */
  const [aiState, setAiState] = useState<
    "idle" | "loading" | "done" | "adopted" | "rejected"
  >("idle")
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
    if (
      rowsByVar.every((rows) => rows.some((a) => a.regions.includes("全国")))
    )
      return ["全国"]
    const picked = pickedRegions.filter((r) => r !== "全国")
    return picked.filter((r) =>
      rowsByVar.every((rows) => rows.some((a) => a.regions.includes(r))),
    )
  }

  /** 候选服务商名单（对全部所选品种在所选地区均有授权） */
  const candidateRows = useMemo(() => {
    const providers = [...new Set(
      auths.filter((a) => varietySel.includes(a.varietyName)).map((a) => a.provider),
    )]
    return providers
      .map((provider) => ({ provider, regions: effectiveRegions(provider) }))
      .filter((r) => r.regions.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auths, varietySel, pickedRegions])

  interface RowView {
    provider: string
    regions: string[]
    included: boolean
    total: number
    catAmounts: Partial<Record<ServiceCategory, number>>
    customRatios: Record<string, number> | null
  }

  const rows: RowView[] = candidateRows.map((c) => ({
    ...c,
    included: !removed.includes(c.provider),
    total: amounts[c.provider]?.total ?? 0,
    catAmounts: amounts[c.provider]?.catAmounts ?? {},
    customRatios: customRatiosMap[c.provider] ?? null,
  }))
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

  function ratiosOf(row: RowView): Record<string, number> {
    return row.customRatios ?? globalRatios ?? defaultRatioMap()
  }
  function defaultRatioMap(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(defaultRatiosFor(lockedBook)).map(([k, v]) => [
        k,
        Number(v),
      ]),
    )
  }

  /** 行内金额与比例校验（UX 级；提交时 context 侧还有强校验兜底） */
  function rowError(row: RowView): string {
    if (outcomeOf(row.provider)) return ""
    if (!Number.isFinite(row.total) || row.total <= 0)
      return "请填写大于 0 的任务金额"
    const pickedCats = catGroups.filter((g) => catOn[g.category])
    const values = pickedCats.map((g) => row.catAmounts[g.category] ?? 0)
    if (values.some((v) => !Number.isFinite(v) || v < 0))
      return "各类服务金额不能为负数"
    if (
      catGroups.some(
        (g) => !catOn[g.category] && (row.catAmounts[g.category] ?? 0) > 0,
      )
    )
      return "金额与已选服务类别不一致，请重新填写"
    if (Math.abs(cents(values.reduce((s, v) => s + v, 0)) - row.total) > 0.001)
      return "任务总金额须等于各类服务金额之和"
    const ratios = ratiosOf(row)
    for (const g of pickedCats) {
      if ((row.catAmounts[g.category] ?? 0) <= 0) continue
      const sum = g.rules.reduce((s, r) => s + (ratios[r.name] ?? 0), 0)
      if (
        Math.abs(sum - 100) > 0.001 ||
        g.rules.some(
          (r) =>
            !Number.isFinite(ratios[r.name] ?? NaN) ||
            (ratios[r.name] ?? 0) < 0 ||
            (ratios[r.name] ?? 0) > 100,
        )
      )
        return `${g.category}比例合计须为 100%`
    }
    if (buildItems(row).items.length === 0)
      return "金额按比例摊算后没有有效服务项目明细，请调大金额"
    return ""
  }

  /**
   * 按行金额与比例摊算服务项目明细（提交将生成的 serviceItems）：
   * 类别金额先按品种均摊、再按执行地区均摊，项目金额 × 项目比例 → nearestTier 反推参考数量（计划提示，非承诺次数）
   */
  function buildItems(row: RowView): {
    items: ServiceItem[]
    roundingLogs: RoundingLog[]
  } {
    if (!lockedBook) return { items: [], roundingLogs: [] }
    const ratios = ratiosOf(row)
    const items: ServiceItem[] = []
    const roundingLogs: RoundingLog[] = []
    const varietyCount = Math.max(1, varietySel.length)
    varietySel.forEach((varietyName) => {
      row.regions.forEach((region) => {
        catGroups
          .filter((g) => catOn[g.category])
          .forEach((g) => {
            const sectionAmount =
              (row.catAmounts[g.category] ?? 0) / varietyCount
            const weightSum =
              g.rules.reduce((s, r) => s + (ratios[r.name] ?? 0), 0) || 1
            g.rules.forEach((r) => {
              const requested =
                (sectionAmount * (ratios[r.name] ?? 0)) / weightSum /
                row.regions.length
              if (requested <= 0) return
              const tier = nearestTier(requested, r.amount)
              if (tier.rounded) {
                roundingLogs.push({
                  id: `RL-${row.provider}-${varietyName}-${region}-${r.id}`,
                  time: DEMO_NOW,
                  variety: varietyName,
                  region,
                  itemName: r.name,
                  beforeAmount: cents(requested),
                  beforeQty: tier.rawQty,
                  unitPrice: r.amount,
                  afterAmount: tier.amount,
                  afterQty: tier.qty,
                  reason: tier.reason,
                })
              }
              if (tier.amount > 0)
                items.push({
                  id: `new-${items.length}`,
                  variety: varietyName,
                  region,
                  category: r.category,
                  name: r.name,
                  unitPrice: r.amount,
                  unit: r.unit,
                  qty: tier.qty,
                  amount: tier.amount,
                  suggestedUnitPrice: r.amount,
                  suggestedAmount: tier.amount,
                  adjustReason: "",
                })
            })
          })
      })
    })
    return { items, roundingLogs }
  }

  const errorCount = selectedRows.filter((r) => rowError(r)).length
  const planTotal = cents(
    selectedRows.reduce((s, r) => s + r.total, 0),
  )

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

  /**
   * 打开初始化：优先恢复上次关闭自动保存的草稿（品种仍可选才恢复），否则全新默认。
   * 品种就绪后默认全选其授权地区并预填价目表比例（多选切换同此重置）。
   */
  useEffect(() => {
    if (!open) return
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
    setRatioDrawerFor(null)
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
      setRemoved(draft.removed ?? [])
      setAmounts(draft.amounts ?? {})
      setCustomRatiosMap(draft.customRatiosMap ?? {})
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
    setAmounts({})
    setCustomRatiosMap({})
    setVendorSearch("")
    setInvalidOnly(false)
    setPasteText("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** 应用新品种集合：地区重置为全选新授权池、比例重预填、已填金额与结果清空 */
  function applyVarietySel(next: string[]) {
    setVarietySel(next)
    setPickedRegions(poolForVarieties(next))
    setRatioDraft(defaultRatiosFor(bookFor(next)))
    setRemoved([])
    setAmounts({})
    setCustomRatiosMap({})
    setOutcomes([])
    setVendorSearch("")
    setInvalidOnly(false)
    setRestoredAt(null)
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

  /** 勾选变化：未选类别金额清零、差额补进首个已选类别 */
  function changeCategory(category: ServiceCategory, on: boolean) {
    setCatOn((prev) => ({ ...prev, [category]: on }))
    const nextOn = { ...catOn, [category]: on }
    const primary = catGroups.find((g) => nextOn[g.category])?.category
    setAmounts((prev) => {
      const next: Record<string, AmountEntry> = {}
      Object.entries(prev).forEach(([provider, entry]) => {
        const catAmounts: Partial<Record<ServiceCategory, number>> = {}
        catGroups.forEach((g) => {
          if (nextOn[g.category])
            catAmounts[g.category] = entry.catAmounts[g.category] ?? 0
        })
        if (primary) {
          const kept = Object.values(catAmounts).reduce((s, v) => s + (v ?? 0), 0)
          catAmounts[primary] = cents(
            (catAmounts[primary] ?? 0) + entry.total - kept,
          )
        }
        next[provider] = { total: entry.total, catAmounts }
      })
      return next
    })
  }

  function setRowAmount(
    provider: string,
    patchAmount: (entry: AmountEntry) => AmountEntry,
  ) {
    setAmounts((prev) => {
      const cur = prev[provider] ?? { total: 0, catAmounts: {} }
      return { ...prev, [provider]: patchAmount(cur) }
    })
  }

  /** 改总金额：差额自动补进首个已选类别（各拆分金额仍可单独编辑） */
  function patchTotal(provider: string, total: number) {
    const primary = catGroups.find((g) => catOn[g.category])?.category
    setRowAmount(provider, (entry) => {
      const catAmounts = { ...entry.catAmounts }
      if (primary) {
        const others = catGroups
          .filter((g) => catOn[g.category] && g.category !== primary)
          .reduce((s, g) => s + (catAmounts[g.category] ?? 0), 0)
        const rest = catGroups
          .filter((g) => !catOn[g.category])
          .reduce((s, g) => s + (catAmounts[g.category] ?? 0), 0)
        catAmounts[primary] = cents(total - others - rest)
      }
      return { total, catAmounts }
    })
  }

  function patchCatAmount(
    provider: string,
    category: ServiceCategory,
    value: number,
  ) {
    setRowAmount(provider, (entry) => ({
      total: entry.total,
      catAmounts: { ...entry.catAmounts, [category]: value },
    }))
  }

  function pasteAmounts() {
    const lines = pasteText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    let matched = 0
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
    updates.forEach((amount, provider) => patchTotal(provider, amount))
    setPasteOpen(false)
    addToast({ type: "info", title: `已匹配并更新 ${matched} 家；未匹配 ${lines.length - matched} 行`,
    })
  }

  function openRatioDrawer(provider: string) {
    const row = rows.find((r) => r.provider === provider)
    if (!row) return
    setDrawerDraft(
      Object.fromEntries(
        Object.entries(ratiosOf(row)).map(([k, v]) => [k, String(v)]),
      ),
    )
    setRatioDrawerFor(provider)
  }

  function saveRatioDrawer() {
    if (!ratioDrawerFor) return
    const ratios = readRatios(drawerDraft)
    if (!ratios) {
      addToast({ type: "error", title: "每类已选服务的业务比例须分别合计 100%" })
      return
    }
    setCustomRatiosMap((prev) => ({ ...prev, [ratioDrawerFor]: ratios }))
    setRatioDrawerFor(null)
    addToast({ type: "success", title: `${ratioDrawerFor} 的业务比例已单独保存` })
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
      JSON.stringify([varietySel, startDate, endDate, pickedRegions, catOn, next]),
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
    if (!catGroups.some((g) => catOn[g.category]))
      return addToast({ type: "error", title: "请至少选择一种服务类别" })
    if (!selectedRows.length)
      return addToast({ type: "error", title: "请至少选择一家服务商" })
    if (!globalRatios)
      return addToast({ type: "error", title: "请将各服务类别的业务比例分别调整为 100%",
      })
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
      return addToast({ type: "error", title: `有 ${pending.filter((r) => rowError(r)).length} 家尚未通过校验：${rowError(invalid)}`,
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
      JSON.stringify(ratioDraft) === JSON.stringify(defaultRatiosFor(lockedBook)) &&
      !removed.length &&
      !Object.keys(amounts).length &&
      !Object.keys(customRatiosMap).length &&
      !vendorSearch.trim() &&
      !invalidOnly &&
      !pasteText.trim()
    )
  }

  /**
   * 关闭时收集草稿：
   * - 第 0/1 步且有实际改动 → 存当前全部内容；
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
      customRatiosMap,
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
        amounts,
      }
    }
    return isPristine() ? null : { ...base, step, removed, amounts }
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
        localStorage.setItem(
          MEMORY_KEY,
          JSON.stringify({ startDate, endDate }),
        )
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
    setAmounts({})
    setCustomRatiosMap({})
    setVendorSearch("")
    setInvalidOnly(false)
    setPasteText("")
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
    addToast({ type: "info", title: "已清空草稿，从默认开始" })
  }

  if (!open) return null

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
    <div style={{ display: "flex", gap: 0, alignItems: "center", margin: "2px 0 4px" }}>
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
              background: i <= step && step < 2 ? "var(--color-brand)" : "#E9EDF2",
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
          {i === 0 && <b style={{ width: 90, height: 1, background: "#DCE1E8" }} />}
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
            推广品种（可多选）· 已选 {varietySel.length} 个，同一任务内共用下方价目表快照
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
              <span className={`bct-combo-value${varietySel.length ? "" : " ph"}`}>
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
                  <button className="bct-link" onClick={() => setVarietyOpen(false)}>
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
        <div className="bct-form" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
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
            标准价目表：{lockedBook.name}（{lockedBook.version}）· 创建时锁定快照
          </p>
        )}
        <div className="bct-subhead">
          <div>
            <h5>推广地区</h5>
            <p>已按所选 {varietySel.length} 个品种的合作授权取并集；勾选地区后，服务商名单立即更新。</p>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <button className="bct-link" onClick={() => setPickedRegions(regionPool)}>
              全选地区
            </button>
            <button className="bct-link" onClick={() => setPickedRegions([])}>
              清空
            </button>
          </div>
        </div>
        <div className="bct-region-picker">
          {regionPool.map((region) => (
            <label key={region} className={pickedRegions.includes(region) ? "checked" : ""}>
              <input
                type="checkbox"
                checked={pickedRegions.includes(region)}
                onChange={(e) => changeRegion(region, e.target.checked)}
              />
              {region}
            </label>
          ))}
          {!regionPool.length && (
            <span style={{ color: "#8A94A5", fontSize: 12 }}>所选品种暂无授权地区</span>
          )}
        </div>
        <div className="bct-subhead">
          <div>
            <h5>本次服务类别</h5>
            <p>勾选后才显示对应的业务比例和第二步的金额输入列。</p>
          </div>
        </div>
        <div className="bct-category-checks">
          {catGroups.map((g) => (
            <label key={g.category}>
              <input
                type="checkbox"
                checked={!!catOn[g.category]}
                onChange={(e) => changeCategory(g.category, e.target.checked)}
              />
              {g.category}
            </label>
          ))}
        </div>
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
            <span style={{ color: "#8A94A5", fontSize: 12 }}>请先勾选服务类别</span>
          )}
        </div>

        {aiState === "loading" && (
          <div className="bct-ai-panel">
            <div className="bct-ai-bar">
              <span className="bct-ai-title">✦ AI 统筹建议 · 分析中</span>
              <span className="bct-ai-meta">约需几秒，结果生成后才计入次数</span>
            </div>
            <div style={{ padding: "12px 14px 14px" }}>
              <div className="bct-ai-progress">
                <i style={{ width: `${((aiStep + 1) / 3) * 92}%` }} />
              </div>
              <ol className="bct-ai-steps">
                {AI_STEPS.map((s, i) => (
                  <li key={s} className={i <= aiStep ? "on" : ""}>
                    <span
                      className={`bct-ai-stepdot${i < aiStep ? " done" : i === aiStep ? " cur" : ""}`}
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
                        const cur =
                          Number((aiBefore ?? ratioDraft)[name]) || 0
                        const sug = aiSuggested?.[name] ?? 0
                        const d = cents(sug - cur)
                        return (
                          <tr key={name}>
                            <td>{name}</td>
                            <td className="cur">{cur}%</td>
                            <td className="sug">{sug}%</td>
                            <td className={d > 0 ? "up" : d < 0 ? "down" : "flat"}>
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
                    <button type="button" className="bct-ai-ghost" onClick={aiReject}>
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
          <table className="bct-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>服务商</th>
                <th>服务地区</th>
                <th>本次状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {shownCandidates.map((c) => {
                const included = !removed.includes(c.provider)
                return (
                  <tr key={c.provider} style={{ opacity: included ? 1 : 0.6 }}>
                    <td>
                      <b>{c.provider}</b>
                    </td>
                    <td>{c.regions.join("、")}</td>
                    <td>
                      <Tag color={included ? "success" : "default"} label={included ? "已加入" : "已移除"} />
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
                  <td colSpan={4} style={{ textAlign: "center", padding: 30, color: "#8A94A5" }}>
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
          <span>已填写金额</span>
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
            <h4 style={{ margin: 0 }}>逐家填写任务金额</h4>
            <p className="bct-desc" style={{ margin: "4px 0 0" }}>
              任务总金额及已选服务类别金额均可直接输入；每家总金额须等于各类金额之和。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" onClick={() => { setPasteText(""); setPasteOpen(true) }}>
              从 Excel 粘贴总金额
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setInvalidOnly(!invalidOnly)}>
              {invalidOnly ? "显示全部" : "仅看异常"}
            </Button>
          </div>
        </div>
        <div className="bct-table-wrap">
          <table className="bct-table">
            <thead>
              <tr>
                <th className="sticky-col">服务商</th>
                <th>任务总金额</th>
                {catGroups
                  .filter((g) => catOn[g.category])
                  .map((g) => (
                    <th key={g.category}>{CATEGORY_COLUMN[g.category] ?? g.category}</th>
                  ))}
                <th>金额校验</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleStep2Rows.map((row) => {
                const err = rowError(row)
                const done = outcomeOf(row.provider)
                const balance = cents(
                  row.total -
                    catGroups
                      .filter((g) => catOn[g.category])
                      .reduce((s, g) => s + (row.catAmounts[g.category] ?? 0), 0),
                )
                return (
                  <tr key={row.provider} className={err ? "bct-row-error" : ""}>
                    <td className="sticky-col">
                      <b>{row.provider}</b>
                      {(row.customRatios || done) && (
                        <small className="sub">
                          {row.customRatios ? "已单独调整比例" : ""}
                          {row.customRatios && done ? " · " : ""}
                          {done ? `已创建 ${done.taskNo}` : ""}
                        </small>
                      )}
                    </td>
                    <td>
                      <input
                        className="bct-money-input"
                        type="number"
                        min={0}
                        step={0.01}
                        aria-label={`${row.provider}任务总金额`}
                        value={row.total}
                        disabled={!!done}
                        onChange={(e) =>
                          patchTotal(row.provider, Number(e.target.value) || 0)
                        }
                      />
                    </td>
                    {catGroups
                      .filter((g) => catOn[g.category])
                      .map((g) => (
                        <td key={g.category}>
                          <input
                            className="bct-money-input"
                            type="number"
                            min={0}
                            step={0.01}
                            aria-label={`${row.provider}${CATEGORY_COLUMN[g.category]}`}
                            value={row.catAmounts[g.category] ?? 0}
                            disabled={!!done}
                            onChange={(e) =>
                              patchCatAmount(
                                row.provider,
                                g.category,
                                Number(e.target.value) || 0,
                              )
                            }
                          />
                        </td>
                      ))}
                    <td className="bct-validation">
                      {done ? (
                        <Tag color="success" label={`已创建 ${done.taskNo}`} />
                      ) : err ? (
                        <>
                          <Tag color="danger" label="待调整" />
                          <small>
                            {err}
                            {balance > 0.001
                              ? ` · 尚未分配 ${formatCNY(balance)}`
                              : balance < -0.001
                                ? ` · 拆分超出 ${formatCNY(-balance)}`
                                : ""}
                          </small>
                        </>
                      ) : (
                        <Tag color="success" label="金额与范围已通过" />
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="bct-link"
                        onClick={() => openRatioDrawer(row.provider)}
                        disabled={!!done}
                        style={{ opacity: done ? 0.4 : 1 }}
                      >
                        单独调整比例
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!visibleStep2Rows.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#8A94A5" }}>
                    {invalidOnly ? "没有异常服务商" : "请先在第一步选择服务商"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bct-footnote">
          仅显示第一步选中的服务类别。修改总金额时，差额先计入首个已选类别；各拆分金额仍可单独编辑。
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
          <h4 style={{ margin: 0 }}>{badOutcomes.length ? "提交完成（部分失败）" : "提交完成"}</h4>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A94A5" }}>
            每家成功服务商已生成独立任务，进入「待确认」；失败行可返回修改后重新提交。
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 26 }}>
          <span style={{ color: "#548066", fontSize: 12 }}>
            <b style={{ fontSize: 24 }}>{okOutcomes.length}</b> 成功
          </span>
          <span style={{ color: badOutcomes.length ? "#C73A3A" : "#8A94A5", fontSize: 12 }}>
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
                      <Tag color="success" label="创建成功" />
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
                  <td>{o.ok ? <Tag color="warning" label="待确认" /> : "未创建"}</td>
                </tr>
              )
            })}
            {!resultRows.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#8A94A5" }}>
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const drawerRow = ratioDrawerFor
    ? rows.find((r) => r.provider === ratioDrawerFor)
    : undefined
  const drawerRatios = drawerRow ? readRatios(drawerDraft) : null

  return (
    <>
      {/* 样式表挂组件根级：粘贴/比例抽屉弹窗打开时主弹窗会隐藏卸载，挂主弹窗内会丢样式 */}
      <style>{bctCss}</style>
      <Modal
        open={open && !ratioDrawerFor && !pasteOpen && !confirmClear}
        title="创建任务 · 多服务商批量发包"
        onClose={requestClose}
        width={1080}
        titleNote={
          step < 2 ? (
            restoredAt ? (
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
              "关闭时自动保存已填内容，下次打开自动恢复"
            )
          ) : undefined
        }
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
            <span style={{ marginRight: "auto", fontSize: 12, color: "#7C8798" }}>
              {step < 2
                ? `已选 ${selectedRows.length} 家服务商 · 各家独立生成任务`
                : `成功 ${okOutcomes.length} 家 · 失败 ${badOutcomes.length} 家`}
            </span>
            {step === 0 && (
              <>
                <Button variant="secondary" onClick={requestClose}>
                  取消
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
                  完成并关闭
                </Button>
              </>
            )}
          </div>
        }
      >
        {stepBar}
        {step === 0 && stepScope}
        {step === 1 && stepAmount}
        {step === 2 && stepResult}
      </Modal>

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
          <p style={{ margin: "0 0 4px", color: "#68768A", fontSize: 13, lineHeight: 1.6 }}>
            复制两列：服务商名称和金额。粘贴后按完整名称匹配已选服务商。
          </p>
          <textarea
            className="bct-paste-area"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"安和医药服务有限公司\t100000\n诚远医药咨询有限公司\t200000"}
          />
        </Modal>
      )}

      {ratioDrawerFor && drawerRow && (
        <Modal
          open={!!ratioDrawerFor}
          title={`单独调整比例 · ${drawerRow.provider}`}
          onClose={() => setRatioDrawerFor(null)}
          width={680}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRatioDrawerFor(null)}>
                取消
              </Button>
              <Button variant="primary" disabled={!drawerRatios} onClick={saveRatioDrawer}>
                保存调整
              </Button>
            </>
          }
        >
          <div className="bct-drawer-meta">
            <span title={varietySummary().full}>
              品种：
              {varietySel.length > 1
                ? `共 ${varietySel.length} 个`
                : varietySummary().text}
            </span>
            <span>地区：{drawerRow.regions.join("、")}</span>
            <span>
              任务金额：<b>{formatCNY(drawerRow.total)}</b>
            </span>
            <span>价目表：{lockedBook?.name}</span>
          </div>
          {catGroups
            .filter((g) => catOn[g.category])
            .map((g) => {
              const sum = g.rules.reduce(
                (s, r) => s + (Number(drawerDraft[r.name]) || 0),
                0,
              )
              return (
                <section key={g.category} style={{ marginBottom: 18 }}>
                  <div className="bct-ratio-group-head" style={{ borderRadius: "6px 6px 0 0" }}>
                    <b>{g.category}</b>
                    <Tag
                      color={Math.abs(sum - 100) < 0.001 ? "success" : "danger"}
                      label={`合计 ${Math.round(sum * 100) / 100}%`}
                    />
                  </div>
                  <div style={{ border: "1px solid #E2E8F0", borderTop: 0, borderRadius: "0 0 6px 6px", padding: "0 12px" }}>
                    {g.rules.map((r) => {
                      const amount = drawerRatios
                        ? cents(
                            ((drawerRow.catAmounts[g.category] ?? 0) *
                              (drawerRatios[r.name] ?? 0)) /
                              100,
                          )
                        : null
                      return (
                        <div className="bct-drawer-row" key={r.id}>
                          <div>
                            <b>{r.name}</b>
                            <small>
                              {formatCNY(r.amount)} / {r.unit}
                            </small>
                          </div>
                          <span style={{ fontSize: 12, color: "#657185" }}>
                            {drawerRow.catAmounts[g.category] ? formatCNY(drawerRow.catAmounts[g.category]!) : "—"}
                          </span>
                          <label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              aria-label={`${drawerRow.provider}${r.name}比例`}
                              value={drawerDraft[r.name] ?? ""}
                              onChange={(e) =>
                                setDrawerDraft((prev) => ({
                                  ...prev,
                                  [r.name]: e.target.value,
                                }))
                              }
                            />
                            %
                          </label>
                          <b>{amount === null ? "—" : formatCNY(amount)}</b>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          <p style={{ margin: 0, fontSize: 12, color: "#A46A05", background: "#FFF8E7", padding: 10, borderRadius: 6 }}>
            保存后标记为「已单独调整」，后续应用默认比例不会覆盖。
          </p>
        </Modal>
      )}
    </>
  )
}
