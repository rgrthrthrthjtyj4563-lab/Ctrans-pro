/**
 * 药厂业务开关（规则配置）数据层（前端原型）：
 * - 规则目录：14 个业务场景（医院拜访按分组明细，其余场景平铺）
 * - 配置模型：药厂统一 + 指定服务商差异；ownerKey = "unified" | 服务商租户稳定 ID
 * - 草稿/发布：live（生效）+ drafts（待发布）+ history（版本快照），发布后才更新生效值
 * - 持久化：localStorage 按药厂作用域分键（schema v2），切换药厂不串数据
 * 全部为演示数据，不接后端；差异/冲突计算只在当前合作生效的服务商上统计。
 */

export type SwitchRule = { name: string; value: string; result: string }
/** key: `${ownerKey}::${scene}::${ruleName}` */
export type SwitchConfig = Record<string, SwitchRule>
export interface SwitchSnapshot {
  version: number
  date: string
  config: SwitchConfig
  note: string
}
export interface SwitchState {
  live: SwitchConfig
  drafts: SwitchConfig
  history: SwitchSnapshot[]
}
export interface SwitchProviderRef {
  /** 服务商租户稳定 ID（不做显示名匹配） */
  id: string
  name: string
}

export const UNIFIED_OWNER = "unified"
export const UNIFIED_OWNER_LABEL = "药厂统一"
export const FEE_SCENE = "费用控制"
export const REVIEW_SCENE = "审核流程"
export const ACCEPTANCE_RULE = "成果验收流程"

export const PHARMA_SWITCH_SCENARIOS = [
  "通用要求",
  "医院拜访",
  "商业拜访",
  "药房拜访",
  "随访调研",
  "问卷",
  "会议",
  "医院信息调研",
  "科室信息调研",
  "商业信息调研",
  "药店信息调研",
  "库存信息",
  "流向信息",
  "医院竞品调研",
] as const

export type PharmaSwitchScenario = (typeof PHARMA_SWITCH_SCENARIOS)[number]

export const PHARMA_RULE_GROUPS: {
  title: string
  description: string
  open: boolean
  rules: SwitchRule[]
}[] = [
  {
    title: "业务方式",
    description: "配置可使用的拜访类型与对应检查",
    open: false,
    rules: [
      { name: "可用拜访方式", value: "上门、网络", result: "按所选方式校验" },
      { name: "网络拜访定位", value: "无需检查", result: "不执行定位规则" },
    ],
  },
  {
    title: "次数与时长",
    description: "控制业务频次和有效拜访时长",
    open: true,
    rules: [
      { name: "同一受访对象每月拜访次数", value: "最多8次", result: "超限禁止提交" },
      { name: "同一受访对象每日拜访次数", value: "最多1次", result: "超限禁止提交" },
      { name: "最短拜访时长", value: "15分钟", result: "不满足禁止提交" },
      { name: "最长拜访时长", value: "240分钟", result: "不满足禁止提交" },
    ],
  },
  {
    title: "材料要求",
    description: "配置现场证明与业务反馈材料",
    open: true,
    rules: [
      { name: "上门现场照片", value: "必填2张", result: "不满足禁止提交" },
      { name: "预约照片", value: "选填", result: "不影响提交" },
      { name: "拜访反馈", value: "必填 · 至少50字", result: "不满足禁止提交" },
    ],
  },
  {
    title: "定位与间隔",
    description: "上门位置与两次拜访间隔要求",
    open: false,
    rules: [
      { name: "现场位置偏差", value: "200米", result: "超出转人工复核" },
      { name: "两次拜访最短间隔", value: "30分钟", result: "不满足禁止提交" },
    ],
  },
  {
    title: "内容质量",
    description: "重复内容与数据完整性校验",
    open: false,
    rules: [{ name: "反馈内容查重", value: "开启", result: "重复内容禁止提交" }],
  },
  {
    title: "填报与修改要求",
    description: "控制补录窗口、冻结日期和记录修改",
    open: false,
    rules: [
      { name: "本月业务填报截止", value: "次月5日", result: "逾期可申请限时重开" },
      { name: "补录范围", value: "近30天", result: "按实际发生月归属" },
      { name: "已打绩效记录", value: "不可直接修改", result: "固定行为" },
    ],
  },
]

export const PHARMA_SCENARIO_RULE_MAP: Record<string, SwitchRule[]> = {
  通用要求: [
    { name: "业务反馈最少字数", value: "50字", result: "不足禁止提交" },
    { name: "上门业务总次数", value: "不限制", result: "不触发次数限制" },
    { name: "补录范围", value: "近30天", result: "按实际发生月归属" },
  ],
  商业拜访: [
    { name: "单专员每月拜访次数", value: "最多12次", result: "超限转人工审核" },
    { name: "最短拜访时长", value: "15分钟", result: "不满足禁止提交" },
    { name: "同公司拜访间隔", value: "30分钟", result: "不满足禁止提交" },
  ],
  药房拜访: [
    { name: "药房每月拜访次数", value: "最多8次", result: "超限禁止提交" },
    { name: "现场照片", value: "必填2张", result: "不满足禁止提交" },
    { name: "最短拜访时长", value: "10分钟", result: "不满足禁止提交" },
  ],
  随访调研: [
    { name: "单专员每日上限", value: "最多20份", result: "超限禁止提交" },
    { name: "诊断信息", value: "必填", result: "缺失禁止提交" },
    { name: "药物调整记录", value: "选填", result: "不影响提交" },
  ],
  问卷: [
    { name: "每日收集上限", value: "最多30份", result: "超限禁止提交" },
    { name: "同对象同问卷月次数", value: "最多1次", result: "重复禁止提交" },
    { name: "报告实名展示", value: "关闭", result: "报告中脱敏" },
  ],
  会议: [
    { name: "会议纪要", value: "必填", result: "缺失禁止提交" },
    { name: "三个自然月内容查重", value: "开启", result: "重复禁止提交" },
    { name: "效果评价", value: "必填", result: "缺失禁止提交" },
  ],
  医院信息调研: [
    { name: "重复检查窗口", value: "3个自然月", result: "重复禁止提交" },
    { name: "医生人数", value: "必填", result: "缺失禁止提交" },
    { name: "特色专科", value: "选填", result: "不影响提交" },
  ],
  科室信息调研: [
    { name: "机构＋科室查重", value: "3个自然月", result: "重复禁止提交" },
    { name: "门诊量", value: "必填", result: "缺失禁止提交" },
    { name: "专科建设情况", value: "选填", result: "不影响提交" },
  ],
  商业信息调研: [
    { name: "门头与内部照片", value: "必填各1张", result: "缺失禁止提交" },
    { name: "年度配送规模", value: "必填", result: "缺失禁止提交" },
    { name: "重复检查窗口", value: "6个月", result: "重复禁止提交" },
  ],
  药店信息调研: [
    { name: "门店数与供应商数", value: "必填", result: "缺失禁止提交" },
    { name: "线上业务", value: "选填", result: "不影响提交" },
    { name: "重复检查窗口", value: "6个月", result: "重复禁止提交" },
  ],
  库存信息: [
    { name: "业务重复检查", value: "开启", result: "重复禁止提交" },
    { name: "数据所属月份", value: "必须在任务期间", result: "不满足禁止提交" },
    { name: "计费方式", value: "按条计费", result: "前往费用控制维护" },
  ],
  流向信息: [
    { name: "业务重复检查", value: "开启", result: "重复禁止提交" },
    { name: "数量检查", value: "必须大于0", result: "不满足禁止提交" },
    { name: "计费方式", value: "月度公司合计", result: "前往费用控制维护" },
  ],
  医院竞品调研: [
    { name: "参考适应症", value: "必填", result: "缺失禁止提交" },
    { name: "销售模式与数据", value: "必填", result: "缺失禁止提交" },
    { name: "患者特征", value: "选填", result: "不影响提交" },
  ],
}

/** 费用控制 / 审核流程 两个伪场景的规则基线（配置入口在对应页签）。
 *  费用规则覆盖台账 13 项费用原项 + 库存/流向混合项拆出的计费部分；
 *  金额限额比例为待确认项，不进规则目录、不参与发布。 */
export const FEE_BASE_RULES: SwitchRule[] = [
  { name: "库存计费单位", value: "按条计费", result: "保留全部有效业务记录" },
  { name: "流向计费单位", value: "按条计费", result: "保留全部有效业务记录" },
  { name: "商业拜访计费形式", value: "按次计费", result: "每条有效拜访计一次" },
  { name: "药房拜访计费形式", value: "按次计费", result: "每条有效拜访计一次" },
  { name: "医院协议计费方式", value: "拜访与协议分别计费", result: "拜访与协议各自产生费用" },
  { name: "会议价格依据", value: "按医院等级", result: "费用公式待业务确认" },
  { name: "会议计费单位", value: "按场次计费", result: "费用公式待业务确认" },
  { name: "会议报告计费单位", value: "按场次计费", result: "费用公式待业务确认" },
  { name: "通用价格来源", value: "普通价", result: "按价目表统一价取价" },
  { name: "医院调研价格来源", value: "普通价", result: "按价目表统一价取价" },
  { name: "商业调研价格来源", value: "普通价", result: "按价目表统一价取价" },
  { name: "药店调研价格来源", value: "普通价", result: "按价目表统一价取价" },
  { name: "结算归集方式", value: "按品种归集", result: "结算单按品种组织，明细双维度" },
  { name: "结算申请截止", value: "次月第10日", result: "仅阻止新申请，已发起单继续审核" },
]
export const REVIEW_BASE_RULE: SwitchRule = {
  name: "服务商业务审核",
  value: "默认人工",
  result: "次数例外仍须人工审核",
}

// ─── 纯函数：目录与解析 ───────────────────────────────────────────────────────

export function switchKey(ownerKey: string, scene: string, ruleName: string) {
  return [ownerKey, scene, ruleName].join("::")
}

export function splitSwitchKey(key: string): { ownerKey: string; scene: string; ruleName: string } {
  const [ownerKey = "", scene = "", ruleName = ""] = key.split("::")
  return { ownerKey, scene, ruleName }
}

export function rulesForScene(scene: string): SwitchRule[] {
  if (scene === FEE_SCENE) return FEE_BASE_RULES
  return scene === "医院拜访"
    ? PHARMA_RULE_GROUPS.flatMap((g) => g.rules)
    : PHARMA_SCENARIO_RULE_MAP[scene] ?? []
}

export function allSceneRules(): { scene: string; rule: SwitchRule }[] {
  const rows: { scene: string; rule: SwitchRule }[] = PHARMA_SWITCH_SCENARIOS.flatMap(
    (scene) => rulesForScene(scene).map((rule) => ({ scene, rule })),
  )
  rows.push(...FEE_BASE_RULES.map((rule) => ({ scene: FEE_SCENE, rule })))
  rows.push({ scene: REVIEW_SCENE, rule: REVIEW_BASE_RULE })
  return rows
}

/** 按规则名取费用规则基线（UI 展示与跳转定位用） */
export function feeBaseOf(name: string): SwitchRule | undefined {
  return FEE_BASE_RULES.find((r) => r.name === name)
}

/** 解析当前范围下某条费用规则（服务商覆盖 → 药厂统一 → 基线） */
export function feeRuleOf(config: SwitchConfig, ownerKey: string, name: string): SwitchRule {
  const base = feeBaseOf(name)
  return base ? getRule(config, ownerKey, FEE_SCENE, base) : { name, value: "—", result: "—" }
}

/** 某条费用规则在当前范围是否有待发布草稿 */
export function hasFeeDraft(drafts: SwitchConfig, ownerKey: string, name: string): boolean {
  return !!drafts[switchKey(ownerKey, FEE_SCENE, name)]
}

export function sameRule(a: SwitchRule, b: SwitchRule) {
  return a.value === b.value && a.result === b.result
}

export function isCountRule(rule: SwitchRule) {
  return /次数|上限/.test(rule.name)
}

/** 系统固定行为，不给修改入口 */
export function isFixedRule(rule: SwitchRule) {
  return [
    "网络拜访定位",
    "已打绩效记录",
    "反馈内容查重",
    "三个自然月内容查重",
    "业务重复检查",
    "数据所属月份",
    "数量检查",
  ].includes(rule.name)
}

export function numberOf(value: string) {
  return value.includes("不限") ? Infinity : Number(value.match(/\d+/)?.[0])
}

/** 解析规则：服务商差异 → 药厂统一差异 → 目录默认 */
export function getRule(
  config: SwitchConfig,
  ownerKey: string,
  scene: string,
  base: SwitchRule,
): SwitchRule {
  return (
    config[switchKey(ownerKey, scene, base.name)] ??
    config[switchKey(UNIFIED_OWNER, scene, base.name)] ??
    base
  )
}

/** 指定服务商在某场景与药厂统一配置不同的规则（含待发布草稿） */
export function differencesOf(config: SwitchConfig, ownerKey: string, scene: string) {
  return rulesForScene(scene).filter(
    (rule) =>
      !sameRule(
        getRule(config, ownerKey, scene, rule),
        getRule(config, UNIFIED_OWNER, scene, rule),
      ),
  )
}

/** 解析「次月第N日／次月N日」为日号；其他取值（含不限制）返回 null */
function nextMonthDay(value: string): number | null {
  const match = value.match(/次月第?(\d+)日/)
  return match ? Number(match[1]) : null
}

/** 发布校验：服务商次数不得超过药厂统一上限；最短时长不得大于最长时长；
 *  结算申请截止不得早于业务填报截止（Figma §9 口径） */
export function conflictsOf(config: SwitchConfig, providers: SwitchProviderRef[]): string[] {
  const countErrors = providers.flatMap((provider) =>
    allSceneRules()
      .filter(({ rule }) => isCountRule(rule))
      .filter(
        ({ scene, rule }) =>
          numberOf(getRule(config, provider.id, scene, rule).value) >
          numberOf(getRule(config, UNIFIED_OWNER, scene, rule).value),
      )
      .map(
        ({ scene, rule }) =>
          `${provider.name} · ${scene} · ${rule.name}超过药厂统一上限`,
      ),
  )
  const minBase = rulesForScene("医院拜访").find((r) => r.name === "最短拜访时长")
  const maxBase = rulesForScene("医院拜访").find((r) => r.name === "最长拜访时长")
  const durationErrors =
    minBase && maxBase
      ? [UNIFIED_OWNER, ...providers.map((p) => p.id)]
          .filter(
            (ownerKey) =>
              numberOf(getRule(config, ownerKey, "医院拜访", minBase).value) >
              numberOf(getRule(config, ownerKey, "医院拜访", maxBase).value),
          )
          .map((ownerKey) => {
            const label =
              ownerKey === UNIFIED_OWNER
                ? UNIFIED_OWNER_LABEL
                : providers.find((p) => p.id === ownerKey)?.name ?? ownerKey
            return `${label} · 最短拜访时长不能大于最长拜访时长`
          })
      : []
  const filingBase = rulesForScene("医院拜访").find((r) => r.name === "本月业务填报截止")
  const deadlineBase = FEE_BASE_RULES.find((r) => r.name === "结算申请截止")
  const unifiedFiling =
    filingBase && deadlineBase
      ? nextMonthDay(getRule(config, UNIFIED_OWNER, "医院拜访", filingBase).value)
      : null
  const unifiedDeadline =
    filingBase && deadlineBase
      ? nextMonthDay(getRule(config, UNIFIED_OWNER, FEE_SCENE, deadlineBase).value)
      : null
  const deadlineErrors =
    filingBase && deadlineBase
      ? [UNIFIED_OWNER, ...providers.map((p) => p.id)].flatMap((ownerKey) => {
          const filing = nextMonthDay(getRule(config, ownerKey, "医院拜访", filingBase).value)
          const deadline = nextMonthDay(
            getRule(config, ownerKey, FEE_SCENE, deadlineBase).value,
          )
          if (filing == null || deadline == null || deadline >= filing) return []
          // 服务商两值均继承统一配置时属同一条冲突，只在统一处报一次
          if (
            ownerKey !== UNIFIED_OWNER &&
            filing === unifiedFiling &&
            deadline === unifiedDeadline
          ) {
            return []
          }
          const label =
            ownerKey === UNIFIED_OWNER
              ? UNIFIED_OWNER_LABEL
              : providers.find((p) => p.id === ownerKey)?.name ?? ownerKey
          return [
            `${label} · 结算申请截止（次月第${deadline}日）早于业务填报截止（次月第${filing}日），请调整后再发布`,
          ]
        })
      : []
  return [...countErrors, ...durationErrors, ...deadlineErrors]
}

/** 与统一配置相同的服务商差异项在发布时清除：恢复「沿用」语义，跟随药厂后续调整 */
export function normalizeSwitchConfig(config: SwitchConfig, providers: SwitchProviderRef[]) {
  const next = { ...config }
  for (const provider of providers) {
    for (const { scene, rule } of allSceneRules()) {
      const key = switchKey(provider.id, scene, rule.name)
      if (next[key] && sameRule(next[key], getRule(next, UNIFIED_OWNER, scene, rule))) {
        delete next[key]
      }
    }
  }
  return next
}

// ─── 成果验收流程伪规则（编码/解码，供统一草稿发布接入 AcceptanceContext） ──────

export function encodeAcceptanceRule(levels: number, departments: string[]): SwitchRule {
  const chain = Array.from({ length: levels }, (_, i) => departments[i] ?? "销售部").join(" → ")
  return {
    name: ACCEPTANCE_RULE,
    value: levels <= 1 ? "一级 · 成果验收" : `${levels}级 · ${chain}`,
    result: "全部通过后才可发起结算",
  }
}

export function parseAcceptanceRule(rule: SwitchRule | undefined): { levels: number; departments: string[] } | null {
  if (!rule) return null
  const match = rule.value.match(/^(一|两|三|\d)级(?: · (.+))?$/)
  if (!match) return null
  const levels = { 一: 1, 两: 2, 三: 3 }[match[1]] ?? Number(match[1])
  if (![1, 2, 3].includes(levels)) return null
  // 一级不区分部门（「成果验收」是节点名，不是部门）；多级才解析部门链
  const departments = levels <= 1 ? [] : (match[2] ?? "").split(" → ").filter(Boolean)
  return { levels, departments }
}

// ─── 持久化（药厂作用域 + schema 版本） ───────────────────────────────────────

const SCHEMA_VERSION = 2
const STORAGE_PREFIX = "beiye-pharma-switch-v2"

function switchStorageKey(pharmaId: string) {
  return `${STORAGE_PREFIX}:${pharmaId}`
}

export function nowSwitchStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isSwitchConfig(value: unknown): value is SwitchConfig {
  return typeof value === "object" && value !== null
}

/** 首次进入的演示种子：合作服务商前两家的差异示例（随真实合作关系生成，不写死名称） */
function seedSwitchState(providers: SwitchProviderRef[]): SwitchState {
  const live: SwitchConfig = {}
  if (providers[0]) {
    live[switchKey(providers[0].id, "医院拜访", "同一受访对象每月拜访次数")] = {
      name: "同一受访对象每月拜访次数",
      value: "最多6次",
      result: "超限禁止提交",
    }
  }
  if (providers[1]) {
    live[switchKey(providers[1].id, FEE_SCENE, "商业拜访计费形式")] = {
      name: "商业拜访计费形式",
      value: "按天计费",
      result: "同组多记录合计一天",
    }
  }
  if (providers[2]) {
    live[switchKey(providers[2].id, "药房拜访", "现场照片")] = {
      name: "现场照片",
      value: "必填3张",
      result: "不满足禁止提交",
    }
  }
  return {
    live,
    drafts: {},
    history: [
      {
        version: 1,
        date: "2026-10-13 10:00",
        config: live,
        note: "初始配置（演示种子：个别服务商差异）",
      },
    ],
  }
}

export function loadSwitchState(pharmaId: string, providers: SwitchProviderRef[]): SwitchState {
  if (!pharmaId) return seedSwitchState(providers)
  try {
    const raw = localStorage.getItem(switchStorageKey(pharmaId))
    if (raw) {
      const parsed = JSON.parse(raw) as {
        v?: number
        pharmaId?: string
        live?: unknown
        drafts?: unknown
        history?: unknown
      }
      if (
        parsed?.v === SCHEMA_VERSION &&
        parsed.pharmaId === pharmaId &&
        isSwitchConfig(parsed.live) &&
        isSwitchConfig(parsed.drafts) &&
        Array.isArray(parsed.history) &&
        parsed.history.length
      ) {
        return {
          live: parsed.live,
          drafts: parsed.drafts,
          history: parsed.history,
        }
      }
    }
  } catch {
    /* 本地数据损坏时回落演示种子 */
  }
  return seedSwitchState(providers)
}

export function persistSwitchState(pharmaId: string, state: SwitchState): { ok: boolean } {
  if (!pharmaId) return { ok: true }
  try {
    localStorage.setItem(
      switchStorageKey(pharmaId),
      JSON.stringify({ v: SCHEMA_VERSION, pharmaId, ...state }),
    )
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** 清掉本浏览器里当前药厂的演示数据（走查/演示复位用） */
export function resetSwitchState(pharmaId: string) {
  if (pharmaId) localStorage.removeItem(switchStorageKey(pharmaId))
}
