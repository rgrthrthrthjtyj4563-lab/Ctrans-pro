/**
 * 费用控制页签：左侧费用场景导航（库存/流向/拜访计费/协议/会议/价格来源/结算）。
 * - 每条费用规则走统一草稿制：此处修改先入草稿，发布后生效
 * - 价格不在本模块维护——各场景只读引用价目表，提供跳转入口
 * - 未确认口径（会议公式、金额限额、跨场景按天合并）只展示待确认状态，不显示金额
 */
import { useEffect, useState, type ReactNode } from "react"
import { Activity, Package, WalletCards } from "lucide-react"
import { Button } from "../../components/Button"
import { Tag } from "../../components/StatusTag"
import {
  FEE_SCENE,
  feeBaseOf,
  getRule,
  hasFeeDraft,
  type SwitchConfig,
  type SwitchRule,
} from "../../data/pharmaSwitchRules"

type NavId =
  | "库存信息"
  | "流向信息"
  | "商业/药房拜访"
  | "医院拜访·协议"
  | "会议"
  | "价格来源"
  | "结算归集与截止"

interface FeeOption {
  value: string
  hint: string
  result: string
}

const NAV_ITEMS: { id: NavId; label: string; desc: string; rules: string[] }[] = [
  { id: "库存信息", label: "库存信息", desc: "计费单位与分组", rules: ["库存计费单位"] },
  { id: "流向信息", label: "流向信息", desc: "计费单位与分组", rules: ["流向计费单位"] },
  { id: "商业/药房拜访", label: "商业/药房拜访", desc: "按次／按天计费", rules: ["商业拜访计费形式", "药房拜访计费形式"] },
  { id: "医院拜访·协议", label: "医院拜访·协议", desc: "协议计费方式", rules: ["医院协议计费方式"] },
  { id: "会议", label: "会议", desc: "价格依据 × 计费单位", rules: ["会议价格依据", "会议计费单位", "会议报告计费单位"] },
  { id: "价格来源", label: "价格来源", desc: "通用＋三调研独立", rules: ["通用价格来源", "医院调研价格来源", "商业调研价格来源", "药店调研价格来源"] },
  { id: "结算归集与截止", label: "结算归集与截止", desc: "归集 · 截止 · 待确认", rules: ["结算归集方式", "结算申请截止"] },
]

const HEADING_DESC: Record<NavId, string> = {
  库存信息: "按条或按组合计一次计费；分组收费不减少已保存的业务记录。",
  流向信息: "按条或按月度商业公司合计一次计费；分组收费不减少已保存的业务记录。",
  "商业/药房拜访": "同一场景内按次或按天计费；按天时组内多条记录合计一天。",
  "医院拜访·协议": "配置拜访费用与协议费用的关系；金额与防重复费用键待业务对接。",
  会议: "价格依据与计费单位组合决定取数方式；费用公式待业务确认，不显示金额。",
  价格来源: "通用来源适用商业与药房拜访；三类调研各自独立配置，互不影响。",
  结算归集与截止: "结算单组织方式与结算申请时间窗；金额限额比例为待确认项。",
}

const VISIT_OPTIONS: FeeOption[] = [
  { value: "按次计费", hint: "每条有效拜访计一次费用", result: "每条有效拜访计一次" },
  { value: "按天计费", hint: "同专员、同场景、同一天的多条记录合计一天", result: "同组多记录合计一天" },
]

const PRICE_SOURCE_OPTIONS: FeeOption[] = [
  { value: "普通价", hint: "按价目表统一价格取价", result: "按价目表统一价取价" },
  { value: "区域价", hint: "按客户所在地区的区域档位取价；缺档位时费用待计算", result: "按区域档位取价；缺档位费用待计算" },
]

/** 规则名 → 可选项（含各选项的触发结果文案） */
const FEE_OPTIONS: Record<string, FeeOption[]> = {
  库存计费单位: [
    { value: "按条计费", hint: "每条有效记录分别计算费用", result: "保留全部有效业务记录" },
    { value: "同专员、同品种、同月、同客户合计一次", hint: "符合相同条件的有效记录合并为一个计费组", result: "保留全部有效业务记录" },
    { value: "同专员、同省份、同月、同品种合计一次", hint: "符合相同条件的有效记录合并为一个计费组", result: "保留全部有效业务记录" },
  ],
  流向计费单位: [
    { value: "按条计费", hint: "每条有效流向记录分别计算费用", result: "保留全部有效业务记录" },
    { value: "同专员、同品种、同月、同商业公司合计一次", hint: "符合相同条件的有效记录合并为一个计费组", result: "保留全部有效业务记录" },
  ],
  商业拜访计费形式: VISIT_OPTIONS,
  药房拜访计费形式: VISIT_OPTIONS,
  医院协议计费方式: [
    { value: "拜访与协议分别计费", hint: "拜访费用与协议费用各自计算", result: "拜访与协议各自产生费用" },
    { value: "只针对协议计费", hint: "仅协议产生费用，关联拜访不再单独计费", result: "仅协议产生费用" },
  ],
  会议价格依据: [
    { value: "按医院等级", hint: "按会议所属医疗机构的等级档位取价", result: "费用公式待业务确认" },
    { value: "按区域等级", hint: "按会议举办地区的等级档位取价", result: "费用公式待业务确认" },
  ],
  会议计费单位: [
    { value: "按场次计费", hint: "每场会议计一次费用", result: "费用公式待业务确认" },
    { value: "按人数计费", hint: "按参会去重人数计算费用", result: "费用公式待业务确认" },
  ],
  会议报告计费单位: [
    { value: "按场次计费", hint: "每场会议的报告计一次费用", result: "费用公式待业务确认" },
    { value: "按人数计费", hint: "报告按参会去重人数计算费用", result: "费用公式待业务确认" },
  ],
  通用价格来源: PRICE_SOURCE_OPTIONS,
  医院调研价格来源: PRICE_SOURCE_OPTIONS,
  商业调研价格来源: PRICE_SOURCE_OPTIONS,
  药店调研价格来源: PRICE_SOURCE_OPTIONS,
  结算归集方式: [
    { value: "按品种归集", hint: "结算单按品种组织", result: "结算单按品种组织，明细双维度" },
    { value: "按服务归集", hint: "结算单按服务项目组织", result: "结算单按服务组织，明细双维度" },
  ],
  结算申请截止: [
    { value: "不限制", hint: "不限制结算申请时间", result: "不限制结算申请时间" },
    { value: "次月第10日", hint: "业务月次月的指定日前可发起结算申请", result: "仅阻止新申请，已发起单继续审核" },
  ],
}

interface Props {
  ownerKey: string
  ownerLabel: string
  live: SwitchConfig
  merged: SwitchConfig
  drafts: SwitchConfig
  /** 从业务规则页跳转带入的目标费用场景（库存信息 / 流向信息） */
  focus: string
  onChange: (base: SwitchRule, option: FeeOption) => void
  onOpenPriceTable: () => void
  readOnly: boolean
}

/** 单条费用规则的配置卡：标题 + 选项单选 + 生效/草稿并列 + 说明 */
function RuleCard({
  title,
  sub,
  base,
  current,
  active,
  hasDraft,
  readOnly,
  onChange,
  extra,
  note,
}: {
  title: string
  sub?: string
  base: SwitchRule
  current: SwitchRule
  active: SwitchRule
  hasDraft: boolean
  readOnly: boolean
  onChange: (base: SwitchRule, option: FeeOption) => void
  extra?: ReactNode
  note?: string
}) {
  const changed = current.value !== active.value || current.result !== active.result
  return (
    <div className="pcs-config-card">
      <div className="pcs-card-title">
        <span>{title}</span>
        {readOnly ? (
          <Tag label="只读" />
        ) : hasDraft ? (
          <Tag color="warning" label="待发布" />
        ) : (
          <Tag color="info" label="修改后需发布" />
        )}
      </div>
      {sub && <p className="pcs-card-sub">{sub}</p>}
      {(FEE_OPTIONS[base.name] ?? []).map((option) => (
        <label className={`pcs-radio-card ${current.value === option.value ? "selected" : ""}`} key={option.value}>
          <input
            type="radio"
            disabled={readOnly}
            checked={current.value === option.value}
            onChange={() => onChange(base, option)}
          />
          <span>
            <strong>{option.value}</strong>
            <small>{option.hint}</small>
          </span>
        </label>
      ))}
      {extra}
      {changed && <span className="pcs-draft-inline">当前生效：{active.value}；发布后更新</span>}
      {note && <div className="pcs-info-note">{note}</div>}
    </div>
  )
}

/** 结算申请截止的「次月第N日」日号输入（本地缓冲，失焦/回车提交草稿） */
function DeadlineInput({
  current,
  readOnly,
  onCommit,
}: {
  current: string
  readOnly: boolean
  onCommit: (day: number) => void
}) {
  const [text, setText] = useState(() => current.match(/次月第(\d+)日/)?.[1] ?? "10")
  useEffect(() => {
    const parsed = current.match(/次月第(\d+)日/)?.[1]
    if (parsed != null && parsed !== text) setText(parsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])
  const commit = () => {
    const day = Math.max(1, Math.min(28, Number(text) || 10))
    if (`次月第${day}日` !== current) onCommit(day)
    setText(String(day))
  }
  return (
    <div className="pcs-deadline-row">
      <span>业务月的次月第</span>
      <span className="pcs-number-input" style={{ width: 78 }}>
        <input
          aria-label="结算申请截止日（次月第几日）"
          type="number"
          min={1}
          max={28}
          disabled={readOnly}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
          }}
        />
      </span>
      <span>日 · 建议 1–28，避免不同月份天数差异</span>
    </div>
  )
}

function LinkedPrice({ onOpenPriceTable }: { onOpenPriceTable: () => void }) {
  return (
    <div className="pcs-linked-price">
      <Package size={17} style={{ color: "var(--color-text-2)", flexShrink: 0 }} />
      <div>
        <strong style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>计费价格</strong>
        <span>由「基础数据 › 价目表配置」统一维护，本页不维护具体价格</span>
      </div>
      <Button variant="outline" size="sm" onClick={onOpenPriceTable}>前往价目表配置</Button>
    </div>
  )
}

export function FeeControl({
  ownerKey,
  ownerLabel,
  live,
  merged,
  drafts,
  focus,
  onChange,
  onOpenPriceTable,
  readOnly,
}: Props) {
  const [nav, setNav] = useState<NavId>(() => (NAV_ITEMS.find((x) => x.id === focus)?.id ?? "库存信息"))
  useEffect(() => {
    const next = NAV_ITEMS.find((x) => x.id === focus)?.id
    if (next) setNav(next)
  }, [focus])

  /** 解析某条费用规则：基线 + 含草稿值 + 生效值 + 草稿标记（基线来自数据层目录，回退语义正确） */
  const rule = (name: string) => {
    const base = feeBaseOf(name) ?? { name, value: "—", result: "—" }
    const current = getRule(merged, ownerKey, FEE_SCENE, base)
    const active = getRule(live, ownerKey, FEE_SCENE, base)
    return { base, current, active, hasDraft: hasFeeDraft(drafts, ownerKey, name) }
  }
  const draftCountOf = (names: string[]) =>
    names.reduce((n, name) => n + (hasFeeDraft(drafts, ownerKey, name) ? 1 : 0), 0)

  const item = NAV_ITEMS.find((x) => x.id === nav) ?? NAV_ITEMS[0]
  const card = (name: string, title: string, sub?: string, note?: string, extra?: ReactNode) => {
    const r = rule(name)
    return (
      <RuleCard
        key={name}
        title={title}
        sub={sub}
        base={r.base}
        current={r.current}
        active={r.active}
        hasDraft={r.hasDraft}
        readOnly={readOnly}
        onChange={onChange}
        note={note}
        extra={extra}
      />
    )
  }

  // ── 各导航的配置区与示例区 ─────────────────────────────────────────────
  const inv = rule("库存计费单位")
  const flow = rule("流向计费单位")
  const commVisit = rule("商业拜访计费形式")
  const agreement = rule("医院协议计费方式")
  const meetingBasis = rule("会议价格依据")
  const meetingUnit = rule("会议计费单位")
  const meetingReport = rule("会议报告计费单位")
  const settleGroup = rule("结算归集方式")
  const settleDeadline = rule("结算申请截止")

  const groupPreview = (mode: string) => (
    <>
      <div className="pcs-big-result">
        <strong>{mode.includes("按条") ? 10 : 1}</strong>
        <span>{mode.includes("按条") ? "计费单位" : "计费组"}</span>
      </div>
      <div className="pcs-metric-row"><span>原始记录</span><strong>10条</strong></div>
      <div className="pcs-metric-row"><span>有效记录</span><strong>10条</strong></div>
      <div className="pcs-metric-row"><span>保存记录</span><strong style={{ color: "var(--color-success-fg)" }}>仍为10条</strong></div>
    </>
  )

  let configColumn: ReactNode
  let previewColumn: ReactNode

  if (nav === "库存信息") {
    configColumn = (
      <>
        {card("库存计费单位", "计费单位")}
        <LinkedPrice onOpenPriceTable={onOpenPriceTable} />
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />10条记录会怎样（示例）</div>
        {groupPreview(inv.current.value)}
        <div className="pcs-info-note">
          相同专员、品种、月份和客户。按组收费一次不代表只能保存一条业务记录；示例费用以价目表配置的实价为准（演示原型不计算真实金额）。
        </div>
      </div>
    )
  } else if (nav === "流向信息") {
    configColumn = (
      <>
        {card("流向计费单位", "计费单位")}
        <LinkedPrice onOpenPriceTable={onOpenPriceTable} />
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />10条流向记录会怎样（示例）</div>
        {groupPreview(flow.current.value)}
        <div className="pcs-info-note">
          相同专员、品种、月份和商业公司。同一计费键只产生一笔费用，并关联组内全部有效流向记录；示例费用以价目表配置的实价为准（演示原型不计算真实金额）。
        </div>
      </div>
    )
  } else if (nav === "商业/药房拜访") {
    configColumn = (
      <>
        {card("商业拜访计费形式", "商业拜访 · 计费形式")}
        {card(
          "药房拜访计费形式",
          "药房拜访 · 计费形式",
          undefined,
          "跨业务场景是否合并为一天、一天内多单价如何取值：口径待确认，不推定一整天所有业务共享一笔费用。",
        )}
        <LinkedPrice onOpenPriceTable={onOpenPriceTable} />
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />同一专员 · 同天 · 同场景 · 3条有效拜访（示例）</div>
        <div className="pcs-big-result">
          <strong>{commVisit.current.value === "按天计费" ? 1 : 3}</strong>
          <span>{commVisit.current.value === "按天计费" ? "天" : "计费单位"}</span>
        </div>
        <div className="pcs-metric-row"><span>原始记录</span><strong>3条</strong></div>
        <div className="pcs-metric-row"><span>有效记录</span><strong>3条</strong></div>
        <div className="pcs-metric-row"><span>保存记录</span><strong style={{ color: "var(--color-success-fg)" }}>仍为3条</strong></div>
        <div className="pcs-info-note">
          按天计费时组内多记录合计一天（示例按商业拜访当前选择展示，药房拜访同理）。跨场景合并与多单价取值口径待确认。
        </div>
      </div>
    )
  } else if (nav === "医院拜访·协议") {
    configColumn = card(
      "医院协议计费方式",
      "医院协议 · 计费方式",
      undefined,
      "协议与拜访的关联标识、防重复费用键待业务对接；本页不显示金额，费用以价目表实价为准。",
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />当前选择</div>
        <div className="pcs-fee-choice">{agreement.current.value}</div>
        <div className="pcs-info-note">
          {agreement.current.value.includes("分别")
            ? "完成拜访产生拜访费用，达成协议产生协议费用，两类费用各自计算。"
            : "仅协议达成产生费用，关联的拜访记录不再单独计费，避免重复付费。"}
          防重复费用键待业务对接，当前不做金额演示。
        </div>
      </div>
    )
  } else if (nav === "会议") {
    configColumn = (
      <>
        {card("会议价格依据", "价格依据", "传统模式已删除；医院等级＋按人数为允许组合。")}
        {card("会议计费单位", "会议计费单位")}
        {card(
          "会议报告计费单位",
          "会议报告计费单位",
          "报告计费独立于会议服务计费，单独选择计量方式。",
        )}
        <LinkedPrice onOpenPriceTable={onOpenPriceTable} />
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />当前组合</div>
        <div className="pcs-fee-combo">{meetingBasis.current.value} ＋ {meetingUnit.current.value}</div>
        <div className="pcs-pending-badge">费用公式待业务确认</div>
        <div className="pcs-metric-row"><span>会议报告</span><strong>{meetingReport.current.value}（独立设置）</strong></div>
        <div className="pcs-info-note">
          会议费用公式（按场、按人、超员、报告金额）尚待业务确认，本页不显示任何金额；组合确认后，公式对接按此组合取数。
        </div>
      </div>
    )
  } else if (nav === "价格来源") {
    configColumn = (
      <>
        {card(
          "通用价格来源",
          "通用价格来源",
          "适用商业拜访与药房拜访。",
          "医院、商业、药店三类调研各自独立配置价格来源，此处调整不影响调研场景。",
        )}
        <div className="pcs-fee-duo">
          {card("医院调研价格来源", "医院信息调研")}
          {card("商业调研价格来源", "商业信息调研")}
          {card("药店调研价格来源", "药店信息调研")}
        </div>
        <LinkedPrice onOpenPriceTable={onOpenPriceTable} />
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />取价规则说明</div>
        <div className="pcs-metric-row"><span>通用（商业/药房拜访）</span><strong>{rule("通用价格来源").current.value}</strong></div>
        <div className="pcs-metric-row"><span>医院信息调研</span><strong>{rule("医院调研价格来源").current.value}</strong></div>
        <div className="pcs-metric-row"><span>商业信息调研</span><strong>{rule("商业调研价格来源").current.value}</strong></div>
        <div className="pcs-metric-row"><span>药店信息调研</span><strong>{rule("药店调研价格来源").current.value}</strong></div>
        <div className="pcs-info-note">
          选择区域价后，缺少对应地区档位价格时显示「缺少对应价格，费用待计算」，不回退为 0 元；价格档位在价目表配置维护。
        </div>
      </div>
    )
  } else {
    // 结算归集与截止
    const deadlineDay = Number(settleDeadline.current.value.match(/次月第(\d+)日/)?.[1] ?? 10)
    configColumn = (
      <>
        {card("结算归集方式", "结算归集方式", undefined, "结算明细始终保留品种与服务双维度，可追溯。")}
        {card(
          "结算申请截止",
          "结算申请截止",
          undefined,
          "仅阻止新发起结算申请；已发起的结算单在截止后继续审核。",
          /^次月第\d+日$/.test(settleDeadline.current.value) ? (
            <DeadlineInput
              current={settleDeadline.current.value}
              readOnly={readOnly}
              onCommit={(day) =>
                onChange(settleDeadline.base, {
                  value: `次月第${day}日`,
                  hint: "",
                  result: "仅阻止新申请，已发起单继续审核",
                })
              }
            />
          ) : undefined,
        )}
        <details className="pcs-pending-details">
          <summary>待确认配置：工作量金额限额比例</summary>
          <p>原系统记录为「工作量金额限额比例(%) = -1」。以下问题确认前，本项不提供数值配置：</p>
          <p>· -1 与 0 的真实语义；· 比例的分母口径；· 针对个人绩效还是任务结算；· 超限后的处理动作。</p>
          <p>确认前不作为金额拦截开关、不参与可发布金额计算；业务对接后再转为可配置规则。</p>
        </details>
      </>
    )
    previewColumn = (
      <div className="pcs-preview-card">
        <div className="pcs-preview-label"><Activity size={17} />结算申请截止（以 2026年10月 业务为例）</div>
        <div className="pcs-fee-combo">
          {/^次月第\d+日$/.test(settleDeadline.current.value)
            ? `2026-11-${String(deadlineDay).padStart(2, "0")}（北京时间当天结束）`
            : "不限制申请时间"}
        </div>
        <div className="pcs-metric-row"><span>结算归集</span><strong>{settleGroup.current.value}</strong></div>
        <div className="pcs-info-note">
          截止只阻止新申请，已发起的结算单继续走审核；结算申请截止早于业务填报截止时，发布校验会拦截。
        </div>
      </div>
    )
  }

  return (
    <div className="pcs-tab-page">
      <div className="pcs-section-intro">
        <div className="pcs-intro-icon"><WalletCards size={21} /></div>
        <div>
          <h2>费用控制</h2>
          <p>业务是否通过与费用是否成立分别判断，计费合并不减少已保存的业务记录。当前范围：{ownerLabel}。</p>
        </div>
      </div>
      <div className="pcs-fee-workspace">
        <aside className="pcs-fee-nav" aria-label="费用场景导航">
          {NAV_ITEMS.map((x) => {
            const draftCount = draftCountOf(x.rules)
            return (
              <button
                type="button"
                className={`pcs-fee-nav-item ${nav === x.id ? "active" : ""}`}
                key={x.id}
                onClick={() => setNav(x.id)}
              >
                <strong>{x.label}</strong>
                <small>{x.desc}</small>
                {draftCount > 0 && <span className="pcs-fee-nav-draft" title={`${draftCount}项待发布`}>{draftCount}</span>}
              </button>
            )
          })}
        </aside>
        <section className="pcs-fee-content">
          <div className="pcs-content-heading">
            <div>
              <h2>{item.label}</h2>
              <p>{HEADING_DESC[item.id]}</p>
            </div>
          </div>
          <div className="pcs-fee-layout">
            <div className="pcs-fee-config-col">{configColumn}</div>
            <div className="pcs-fee-preview-col">{previewColumn}</div>
          </div>
        </section>
      </div>
    </div>
  )
}
