/**
 * 打绩效 · 共享弹窗与表单（对应预览 V1.6）
 * 阶段一表单 / 一对一专员表单（阶段二+直达）/ 批次详情 / 专员详情 / 结算对账单预览
 */
import { useEffect, useState } from "react"
import { Modal } from "../components/Modal"
import { Button } from "../components/Button"
import { Tag } from "../components/StatusTag"
import { formatCNY, formatCNYUpper } from "../constants"
import {
  type Evaluation,
  type PerfBatch,
  type SpecialistRecord,
  type PerformanceRuleConfig,
  evalTotal,
  getEvalDimensions,
  itemsDefault,
  itemsWorkload,
  recordsOfBatch,
  useRule,
  usePerfSettings,
  validateCap,
  validateCoef,
  validateEval,
} from "../data/performanceData"

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: "var(--fs-12)",
  fontWeight: 600,
  color: "#9CA3AF",
  background: "#F9FAFB",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
}
const td: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: "var(--fs-13)",
  color: "var(--color-text-1)",
  borderBottom: "1px solid #F3F4F6",
  whiteSpace: "nowrap",
}
const fieldRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "10px 0",
  borderBottom: "1px dashed #EEF0F2",
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--color-text-1)" }
const labelSub: React.CSSProperties = {
  display: "block",
  color: "#667085",
  fontSize: 11.5,
  marginTop: 2,
}
const amountStyle: React.CSSProperties = { ...mono, fontSize: 15, fontWeight: 600 }

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div
      style={{
        fontSize: 12.5,
        color: "#C73A3A",
        background: "#FEECEC",
        borderRadius: 6,
        padding: "8px 12px",
        marginTop: 12,
      }}
    >
      {msg}
    </div>
  )
}

function CoefBadge({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 13,
        minWidth: 40,
        textAlign: "center",
        borderRadius: 6,
        padding: "3px 8px",
        color: ok ? "#248A5A" : "#C73A3A",
        background: ok ? "#E6F5ED" : "#FEECEC",
      }}
    >
      {ok ? "✓" : "✕"}
    </span>
  )
}

// ── 阶段一：绩效考核表单（服务商给工作组，质量系数区间校验） ─────────────────

export function Stage1FormModal({
  open,
  batch,
  onClose,
  onSubmit,
}: {
  open: boolean
  batch: PerfBatch | null
  onClose: () => void
  onSubmit: (actual: number) => void
}) {
  const rule = useRule()
  const [actual, setActual] = useState(0)
  useEffect(() => {
    if (open && batch) setActual(batch.actualAmount ?? batch.defaultAmount)
  }, [open, batch])
  if (!batch) return null
  const def = batch.defaultAmount
  const err = validateCoef(actual, def, rule)
  const coef = actual / def
  return (
    <Modal
      open={open}
      title="绩效考核"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={!!err} onClick={() => onSubmit(actual)}>
            提交
          </Button>
        </>
      }
    >
      <div
        style={{
          background: "var(--color-brand-subtle)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "var(--color-brand)",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {batch.provider} → {batch.group} · {batch.variety} · {batch.month.replace("-", "年")}月 ·{" "}
        {batch.chain}
        <Tag label="阶段一" color="brand" />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={fieldRow}>
          <span style={labelStyle}>
            医院拜访
            <small style={labelSub}>
              已完成 {batch.workload} 次 × ￥100（对私单价）· 只计已完成工作量
            </small>
          </span>
          <span style={{ ...amountStyle, flexShrink: 0 }}>{formatCNY(def)}</span>
        </div>
        <div style={fieldRow}>
          <span style={labelStyle}>
            默认金额（系统计算，只读）
            <small style={labelSub}>按已完成工作量 × 对私单价得出，创建时固化</small>
          </span>
          <span style={{ ...amountStyle, flexShrink: 0 }}>{formatCNY(def)}</span>
        </div>
        <div style={{ ...fieldRow, borderBottom: "none" }}>
          <span style={labelStyle}>
            实发金额
            <small style={labelSub}>可人工调整；修改后质量系数实时计算</small>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#667085" }}>￥</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={actual}
              onChange={(e) => setActual(parseFloat(e.target.value) || 0)}
              style={{
                height: 34,
                width: 158,
                border: "1px solid #D0D5DD",
                borderRadius: 6,
                padding: "0 14px 0 10px",
                ...mono,
                fontSize: 14,
                textAlign: "right",
              }}
            />
            <span
              style={{
                ...mono,
                fontSize: 13,
                minWidth: 56,
                textAlign: "center",
                borderRadius: 6,
                padding: "3px 8px",
                color: err ? "#C73A3A" : "#248A5A",
                background: err ? "#FEECEC" : "#E6F5ED",
              }}
            >
              {coef.toFixed(2)}
            </span>
          </span>
        </div>
      </div>
      <ErrorBox msg={err} />
      <div style={{ fontSize: 11.5, color: "#667085", marginTop: 10 }}>
        质量系数 = 实发金额 ÷ 默认金额，须在 {rule.coefMin.toFixed(2)} –{" "}
        {rule.coefMax.toFixed(2)} 之间（含边界）。默认或实发金额 ≤ 0 时不能提交。质量系数校验仅用于阶段一（服务商给工作组打绩效）。
      </div>
    </Modal>
  )
}

// ── 一对一专员表单（阶段二/直达共用；实发 ≤ 工作量金额 × X% + 四维评定） ─────

export function SpecialistFormModal({
  open,
  record,
  operator,
  onClose,
  onSubmit,
}: {
  open: boolean
  record: SpecialistRecord | null
  operator: "工作组" | "服务商"
  onClose: () => void
  onSubmit: (actual: number, evaluation: Evaluation) => void
}) {
  const rule = useRule()
  const settings = usePerfSettings()
  const dimensions = getEvalDimensions(settings)
  const [actual, setActual] = useState(0)
  const [evaluation, setEvaluation] = useState<Evaluation>({ p1: 0.85, p2: 0.85, p3: 0.85, p4: 0.85 })
  useEffect(() => {
    if (open && record) {
      setActual(record.actualAmount ?? itemsDefault(record.items))
      setEvaluation(
        record.evaluation ??
          (operator === "工作组" ? { p1: 0.85, p2: 0.85, p3: 0.85, p4: 0.85 } : { p1: 0.9, p2: 0.9, p3: 0.9, p4: 0.9 }),
      )
    }
  }, [open, record, operator])
  if (!record) return null
  const def = itemsDefault(record.items)
  const workload = itemsWorkload(record.items)
  const cap = def * rule.capRatio
  const capPct = Math.round(rule.capRatio * 100)
  const err = validateCap(actual, def, rule) ?? validateEval(evaluation)
  const total = evalTotal(evaluation, settings)
  const isStage2 = operator === "工作组"
  return (
    <Modal
      open={open}
      title={isStage2 ? "给服务专员打绩效" : "直达打绩效"}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!!err}
            onClick={() => onSubmit(actual, evaluation)}
          >
            提交
          </Button>
        </>
      }
    >
      <div
        style={{
          background: "var(--color-brand-subtle)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "var(--color-brand)",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {isStage2
          ? `${record.group} → ${record.specialist}`
          : `${record.provider} → ${record.specialist}`}{" "}
        · {record.variety} · {record.month.replace("-", "年")}月 · 批次 {record.batchNo}
        <Tag label={isStage2 ? "阶段二 · 一对一" : "三级直达链 · 一对一"} color="brand" />
        {!isStage2 && <Tag label="不产生工作组记录" color="info" />}
      </div>

      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>
        业务明细（{record.specialist}本批完成的业务，只计已完成）
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>业务分项</th>
            <th style={{ ...th, textAlign: "right" }}>完成工作量</th>
            <th style={{ ...th, textAlign: "right" }}>对私单价</th>
            <th style={{ ...th, textAlign: "right" }}>小计</th>
          </tr>
        </thead>
        <tbody>
          {record.items.map((it) => (
            <tr key={it.name}>
              <td style={td}>{it.name}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {it.count} {it.unit}
              </td>
              <td style={{ ...td, textAlign: "right", ...mono }}>{formatCNY(it.unitPrice)}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {formatCNY(it.count * it.unitPrice)}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 600 }}>合计</td>
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {workload} 次
            </td>
            <td style={td} />
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {formatCNY(def)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 4 }}>
        <div style={fieldRow}>
          <span style={labelStyle}>
            默认金额（系统计算，只读）
            <small style={labelSub}>= 业务明细合计（已完成工作量 × 对私单价）</small>
          </span>
          <span style={{ ...amountStyle, flexShrink: 0 }}>{formatCNY(def)}</span>
        </div>
        <div style={fieldRow}>
          <span style={labelStyle}>
            上限金额（只读）
            <small style={labelSub}>完成工作量金额 × X%，系统管理·绩效系数配置实时读取</small>
          </span>
          <span style={{ ...amountStyle, flexShrink: 0 }}>{formatCNY(cap)}</span>
        </div>
        <div style={{ ...fieldRow, borderBottom: "none" }}>
          <span style={labelStyle}>
            实发金额
            <small style={labelSub}>
              可人工调整；须大于 0 且不超上限；{isStage2 ? "与阶段一金额互不约束" : "每条独立提交"}
            </small>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#667085" }}>￥</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={actual}
              onChange={(e) => setActual(parseFloat(e.target.value) || 0)}
              style={{
                height: 34,
                width: 158,
                border: "1px solid #D0D5DD",
                borderRadius: 6,
                padding: "0 14px 0 10px",
                ...mono,
                fontSize: 14,
                textAlign: "right",
              }}
            />
            <CoefBadge ok={!validateCap(actual, def, rule)} />
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>
        服务评定（四维打分，随结算单留档）
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>评定维度</th>
            <th style={{ ...th, textAlign: "right" }}>权重</th>
            <th style={{ ...th, textAlign: "right" }}>评分（0–1）</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dim) => (
            <tr key={dim.key}>
              <td style={td}>{dim.label}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {Math.round(dim.weight * 100)}%
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={evaluation[dim.key]}
                  onChange={(e) =>
                    setEvaluation((prev) => ({
                      ...prev,
                      [dim.key]: parseFloat(e.target.value),
                    }))
                  }
                  style={{
                    height: 30,
                    width: 110,
                    border:
                      Number.isNaN(evaluation[dim.key]) ||
                      evaluation[dim.key] < 0 ||
                      evaluation[dim.key] > 1
                        ? "1px solid #C73A3A"
                        : "1px solid #D0D5DD",
                    borderRadius: 6,
                    padding: "0 10px",
                    ...mono,
                    fontSize: 13,
                    textAlign: "right",
                  }}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 600 }}>评价结果合计（加权）</td>
            <td style={{ ...td, textAlign: "right", ...mono }}>100%</td>
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {total === null ? "—" : total.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>

      <ErrorBox msg={err} />
      <div style={{ fontSize: 11.5, color: "#667085", marginTop: 10 }}>
        实发金额不大于上限 {formatCNY(cap)}（完成工作量金额 × {capPct}%）即可提交；与阶段一金额互不约束。
      </div>
    </Modal>
  )
}

// ── 批次详情（第一层汇总；专员花名册每行可下钻单专员详情） ────────────────────

function KVGrid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div
      style={{
        background: "#F9FAFB",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12.5,
        marginTop: 10,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto 1fr",
        gap: "4px 14px",
      }}
    >
      {rows.map(([k, v], i) => (
        <span key={i} style={{ display: "contents" }}>
          <b style={{ color: "#667085", fontWeight: 500 }}>{k}</b>
          <span>{v}</span>
        </span>
      ))}
    </div>
  )
}

export function BatchDetailModal({
  open,
  batch,
  onClose,
  onViewSpecialist,
}: {
  open: boolean
  batch: PerfBatch | null
  onClose: () => void
  onViewSpecialist: (record: SpecialistRecord) => void
}) {
  if (!batch) return null
  const records = recordsOfBatch(batch.batchNo)
  const isDirect = batch.chain === "三级直达"
  const coef =
    batch.actualAmount && batch.actualAmount > 0 && !isDirect
      ? batch.actualAmount / batch.defaultAmount
      : null
  return (
    <Modal
      open={open}
      title="批次详情"
      onClose={onClose}
      width={760}
      footer={
        <Button variant="primary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ ...mono, fontWeight: 600 }}>{batch.batchNo}</span>
        <Tag label={batch.chain} color={isDirect ? "info" : "brand"} />
      </div>
      <KVGrid
        rows={[
          ["考核月份", `${batch.month.replace("-", "年")}月`],
          ["品种", batch.variety],
          ["服务商", batch.provider],
          [
            "被评价对象",
            isDirect ? `直达专员 ×${batch.directCount ?? records.length}` : batch.group,
          ],
        ]}
      />
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>金额</div>
      <KVGrid
        rows={[
          ["完成工作量", `${batch.workload} 次`],
          ["默认金额", formatCNY(batch.defaultAmount)],
          [
            "实发金额",
            batch.actualAmount != null ? formatCNY(batch.actualAmount) : "—",
          ],
          [
            isDirect ? "上限校验" : "质量系数",
            isDirect
              ? batch.actualAmount != null
                ? "✓ 上限内"
                : "—"
              : coef != null
                ? coef.toFixed(2)
                : "—",
          ],
        ]}
      />
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>
        {isDirect ? "专员明细（直达 · 逐条一对一）" : "专员明细（阶段二 · 逐条一对一）"}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>服务专员</th>
            <th style={{ ...th, textAlign: "right" }}>完成工作量</th>
            <th style={{ ...th, textAlign: "right" }}>默认金额</th>
            <th style={{ ...th, textAlign: "right" }}>实发金额</th>
            <th style={th}>上限校验</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                {r.specialist}
                <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>
                  {r.username}
                </span>
              </td>
              <td style={{ ...td, textAlign: "right", ...mono }}>{itemsWorkload(r.items)} 次</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {formatCNY(itemsDefault(r.items))}
              </td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {r.actualAmount != null ? formatCNY(r.actualAmount) : <span style={{ color: "#9CA3AF" }}>待确认</span>}
              </td>
              <td style={td}>
                {r.actualAmount != null ? (
                  <span style={{ color: "#248A5A", fontWeight: 500 }}>✓</span>
                ) : (
                  <span style={{ color: "#9CA3AF" }}>—</span>
                )}
              </td>
              <td style={td}>
                <button
                  onClick={() => onViewSpecialist(r)}
                  style={{ border: "none", background: "none", padding: 0, fontSize: 13, color: "var(--color-brand)", cursor: "pointer" }}
                >
                  查看
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>操作记录</div>
      <KVGrid
        rows={
          batch.ops.length
            ? batch.ops.flatMap((op) => [
                ["操作人", op.actor],
                ["操作时间", op.time],
                ["动作", op.action],
                ["备注", "—"],
              ])
            : ([
                ["操作人", "—"],
                ["操作时间", "—"],
                ["动作", "—"],
                ["备注", "—"],
              ] as [string, React.ReactNode][])
        }
      />
    </Modal>
  )
}

// ── 专员绩效详情（被评价方=该专员；分项明细 + 评定 + 下载结算单入口） ──────────

export function SpecialistDetailModal({
  open,
  record,
  rule,
  onClose,
  onDownload,
  onRevoke,
  canRevoke = true,
}: {
  open: boolean
  record: SpecialistRecord | null
  rule: PerformanceRuleConfig
  onClose: () => void
  onDownload: (record: SpecialistRecord) => void
  onRevoke: (record: SpecialistRecord) => void
  canRevoke?: boolean
}) {
  const settings = usePerfSettings()
  const dimensions = getEvalDimensions(settings)
  if (!record) return null
  const def = itemsDefault(record.items)
  const cap = def * rule.capRatio
  const total = evalTotal(record.evaluation, settings)
  return (
    <Modal
      open={open}
      title="专员绩效详情"
      onClose={onClose}
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          {record.status === "已生效" && (
            <>
              <Button variant="outline" disabled={!canRevoke} onClick={() => onRevoke(record)}>
                撤销
              </Button>
              <Button variant="primary" onClick={() => onDownload(record)}>
                下载结算单
              </Button>
            </>
          )}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ ...mono, fontWeight: 600 }}>{record.id}</span>
        <Tag label={record.chain} color={record.chain === "三级直达" ? "info" : "brand"} />
      </div>
      <KVGrid
        rows={[
          ["考核月份", `${record.month.replace("-", "年")}月`],
          ["品种", record.variety],
          ["服务提供商", record.provider],
          ["被评价方", `${record.specialist}（${record.group ?? "直达"}）`],
        ]}
      />
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>
        业务明细（该专员本批完成的业务，只计已完成）
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>业务分项</th>
            <th style={{ ...th, textAlign: "right" }}>完成工作量</th>
            <th style={{ ...th, textAlign: "right" }}>对私单价</th>
            <th style={{ ...th, textAlign: "right" }}>小计</th>
          </tr>
        </thead>
        <tbody>
          {record.items.map((it) => (
            <tr key={it.name}>
              <td style={td}>{it.name}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {it.count} {it.unit}
              </td>
              <td style={{ ...td, textAlign: "right", ...mono }}>{formatCNY(it.unitPrice)}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {formatCNY(it.count * it.unitPrice)}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 600 }}>合计</td>
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {itemsWorkload(record.items)} 次
            </td>
            <td style={td} />
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {formatCNY(def)}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>金额</div>
      <KVGrid
        rows={[
          ["默认金额", `${formatCNY(def)}（= 业务明细合计）`],
          ["上限金额", formatCNY(cap)],
          ["实发金额", record.actualAmount != null ? formatCNY(record.actualAmount) : "—"],
          [
            "上限校验",
            record.actualAmount != null ? (
              <span style={{ color: "#248A5A", fontWeight: 500 }}>✓ 未超上限</span>
            ) : (
              "—"
            ),
          ],
        ]}
      />
      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>
        服务评定（打绩效时录入，随结算单留档）
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>评定维度</th>
            <th style={{ ...th, textAlign: "right" }}>权重</th>
            <th style={{ ...th, textAlign: "right" }}>评分</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dim) => (
            <tr key={dim.key}>
              <td style={td}>{dim.label}</td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {Math.round(dim.weight * 100)}%
              </td>
              <td style={{ ...td, textAlign: "right", ...mono }}>
                {record.evaluation ? record.evaluation[dim.key].toFixed(2) : "—"}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 600 }}>评价结果合计（加权）</td>
            <td style={{ ...td, textAlign: "right", ...mono }}>100%</td>
            <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 600 }}>
              {total === null ? "—" : total.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>操作记录</div>
      <KVGrid
        rows={[
          ["操作人", record.operator],
          ["操作时间", record.operatedAt],
          ["动作", record.status === "未打绩效" ? "—" : `${record.status}（${record.chain === "三级直达" ? "直达" : "阶段二"}）`],
          ["备注", "—"],
        ]}
      />
    </Modal>
  )
}

// ── 结算对账单（下载预览，样式复刻现网模板） ─────────────────────────────────

const STMT_CSS = `
.perf-stmt-title { text-align:center; font-size:20px; font-weight:600; letter-spacing:.45em; text-indent:.45em; margin:2px 0 16px; color:#111827; }
.perf-stmt-info { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; font-size:12px; margin-bottom:6px; color:#111827; }
.perf-stmt-info .red { color:#C73A3A; font-weight:600; }
table.perf-stmt-t { width:100%; border-collapse:collapse; margin-top:10px; }
table.perf-stmt-t th { background:#1F2937; color:#fff; font-weight:500; font-size:11.5px; padding:6px 8px; border:1px solid #374151; text-align:center; line-height:1.4; }
table.perf-stmt-t td { border:1px solid #374151; padding:6px 8px; font-size:11.5px; color:#111827; }
table.perf-stmt-t .r { text-align:right; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
table.perf-stmt-t .c { text-align:center; }
.perf-stmt-amount { display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:13px; color:#111827; }
.perf-stmt-amount .num { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-weight:600; font-size:15px; }
.perf-stmt-decl { background:#F2F4F7; border-radius:6px; padding:10px 14px; font-size:10.5px; color:#475467; line-height:1.7; margin-top:14px; }
.perf-stmt-decl b { display:block; margin-bottom:2px; }
.perf-stmt-qr { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:12px; font-size:11px; color:#667085; }
.perf-stmt-qr .qrbox { width:64px; height:64px; border:1px solid #D0D5DD; background:repeating-conic-gradient(#E5E7EB 0 25%, #fff 0 50%) 0 0/12px 12px; }
`

export function StatementModal({
  open,
  record,
  onClose,
  onDownload,
}: {
  open: boolean
  record: SpecialistRecord | null
  onClose: () => void
  onDownload: (record: SpecialistRecord) => void
}) {
  const settings = usePerfSettings()
  const dimensions = getEvalDimensions(settings)
  if (!record) return null
  const def = itemsDefault(record.items)
  const actual = record.actualAmount ?? 0
  const monthLabel = `${record.month.replace("-", "年")}月`
  const [y, m] = record.month.split("-").map(Number)
  const days = new Date(y, m, 0).getDate()
  const total = evalTotal(record.evaluation, settings)
  return (
    <Modal
      open={open}
      title="结算对账单 · 下载预览"
      onClose={onClose}
      width={780}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={() => onDownload(record)}>
            下载 PDF
          </Button>
        </>
      }
    >
      <style>{STMT_CSS}</style>
      <div style={{ background: "#fff", padding: "22px 6px 4px" }}>
        <div className="perf-stmt-title">结算对账单</div>
        <div className="perf-stmt-info">
          <span>结 算 时 段：{record.month.replace("-", "年")}月01日 - {record.month.replace("-", "年")}月{days}日</span>
          <span>制 单 时 间：{record.operatedAt}</span>
          <span>总 包 方：{record.provider}（签章）</span>
          <span>
            服务提供方：<span className="red">{record.specialist}</span>（服务专员 {record.username}）
          </span>
          <span>服 务 品 种：{record.variety}</span>
          <span>对 账 单 编 号：{record.id}</span>
        </div>

        <table className="perf-stmt-t">
          <thead>
            <tr>
              <th style={{ width: 44 }}>序号</th>
              <th>服务项目</th>
              <th>服务金额小计</th>
              <th>服务成果验收</th>
              <th>结算金额</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {record.items.map((it, i) => (
              <tr key={it.name}>
                <td className="c">{i + 1}</td>
                <td>{it.name}</td>
                <td className="r">{(it.count * it.unitPrice).toFixed(2)}</td>
                <td className="c">合格</td>
                <td className="r">—</td>
                <td></td>
              </tr>
            ))}
            <tr>
              <td className="c">合计</td>
              <td></td>
              <td className="r">{def.toFixed(2)}</td>
              <td></td>
              <td className="r">{actual.toFixed(2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <table className="perf-stmt-t">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 76 }}>
                服务评定
              </th>
              <th>服务程序/制度/
                <br />
                职业道德遵循</th>
              <th>服务态度及
                <br />
                专业水平反馈</th>
              <th>服务记录准确性/
                <br />
                相关性/完整性</th>
              <th>服务预算
                <br />
                匹配度</th>
              <th>评价结果
                <br />
                合计</th>
            </tr>
            <tr>
              {dimensions.map((dim) => <th key={dim.key}>{Math.round(dim.weight * 100)}%</th>)}
              <th>100%</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="c">评分</td>
              {dimensions.map((dim) => (
                <td className="c" key={dim.key}>
                  {record.evaluation ? record.evaluation[dim.key].toFixed(2) : "—"}
                </td>
              ))}
              <td className="c">
                <b>{total === null ? "—" : total.toFixed(2)}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="perf-stmt-amount">
          <span>
            最终结算金额（大写）：<b>{formatCNYUpper(actual)}</b>
          </span>
          <span>
            最终结算金额：<span className="num">{formatCNY(actual)}</span>
          </span>
        </div>

        <div className="perf-stmt-decl">
          <b>特别声明</b>
          1. 本人/本单位自愿接受并同意采用本系统合作之总包方发布的服务任务，认可总包方对服务过程的记录与服务成果的验收结果。
          <br />
          2. 本人/本单位已知悉并确认服务费结算金额以本对账单所载数额为准，服务费将在对账单确认后 3 个工作日内结算支付。
          <br />
          3. 若对上述服务内容、服务时段及结算金额等存有异议，应于本单送达后 3 个工作日内向总包方提出，逾期视为无异议。
          <br />
          4. 本对账单所涉业务属实，提供的开票信息及收款账户信息真实、合法、有效，否则本人/本单位承担由此引发的一切责任。
          <br />
          5. 本对账单一经生成不得涂改，涂改无效；如需变更须由双方另行确认。
          <br />
          6. 本对账单一式两份，总包方与本人/本单位各执一份，具有同等法律效力。
        </div>

        <div className="perf-stmt-qr">
          <span>扫码验证 · {monthLabel}绩效</span>
          <div className="qrbox" />
        </div>
      </div>
    </Modal>
  )
}
