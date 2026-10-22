/**
 * 成果与验收页签（任务详情弹框内；前端原型）· V2.2 集合化改版：
 * - 状态行（徽章/完整度/汇总/操作，单行）+ 推广记录分区表（按业务类型一行、五列计数、一个跳转目标）+ 报告记录小表
 * - 推广记录的验收动作在医院拜访页完成（跳转带 月份+服务提供商）；报告就地批量验收
 * - 验收进度上生命周期条（X 部门确认节点）；验收记录时间线已移入「操作记录」页签混排；任务按月发包无月份切换
 */
import { Fragment, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronRight, ClipboardCheck, Download, Eye, FileText, RefreshCw, Upload } from "lucide-react"
import { Button } from "./Button"
import { Modal } from "./Modal"
import { Tag } from "./StatusTag"
import { useAcceptance, type BatchReviewInput } from "../context/AcceptanceContext"
import { itemAcceptanceLabel, packageCompleteness, packageMonths, promoBusinessType } from "../data/acceptanceData"
import { visitRecords } from "../data/mockData"
import type { ReportFile, Task, VisitRecord } from "../types"
import type { NavigateFn } from "../types"

const th: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "var(--fs-12)",
  fontWeight: 600,
  color: "#9CA3AF",
  background: "#F9FAFB",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
}
const td: React.CSSProperties = {
  padding: "12px",
  fontSize: "var(--fs-13)",
  color: "var(--color-text-1)",
  borderBottom: "1px solid #F3F4F6",
  verticalAlign: "top",
}
const box: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 14,
  marginBottom: 14,
}

export interface AcceptanceTabProps {
  task: Task
  isSales: boolean
  isProvider: boolean
  reviewerName: string
  navigate?: NavigateFn
  onPreviewReport?: (report: ReportFile) => void
  onUploadReport?: () => void
  onGoSettle: () => void
  addToast: (msg: { type: "success" | "error" | "info" | "warning"; title: string; description?: string }) => void
}

export function AcceptanceTab({
  task,
  isSales,
  isProvider,
  reviewerName,
  navigate,
  onPreviewReport,
  onUploadReport,
  onGoSettle,
  addToast,
}: AcceptanceTabProps) {
  const { config, packageOf, resubmitItem } = useAcceptance()
  const levels = config.levels

  const allPromos = useMemo(
    () => visitRecords.filter((r) => r.taskId === task.id),
    [task.id],
  )
  const months = useMemo(
    () => packageMonths(allPromos, task.reports),
    [allPromos, task.reports],
  )
  // 任务按月份发包：不提供月份切换，直接取最新月份的材料包
  const activeMonth = months[0] ?? ""

  const promos = useMemo(
    () => allPromos.filter((r) => r.visitDate.slice(0, 7) === activeMonth),
    [allPromos, activeMonth],
  )
  const reports = useMemo(
    () => task.reports.filter((r) => (r.serviceMonth ?? "") === activeMonth),
    [task.reports, activeMonth],
  )
  const pkg = packageOf(task.id, activeMonth)

  // 包级汇总（状态卡）
  const summary = useMemo(() => {
    const states = [
      ...promos.map((r) => pkg.items[r.id]),
      ...reports.map((r) => pkg.items[r.id]),
    ]
    const total = promos.length + reports.length
    const passed = states.filter((s) => s && s.passedLevels >= levels && !s.rectifying).length
    const rectifying = states.filter((s) => s?.rectifying).length
    const awaitingLevel =
      states.reduce<number | null>((acc, s) => {
        if (!s || s.rectifying || s.passedLevels >= levels) return acc
        const need = s.passedLevels + 1
        return acc === null || need < acc ? need : acc
      }, null) ?? 0
    return { total, passed, rectifying, awaitingLevel, allPassed: total > 0 && passed === total }
  }, [promos, reports, pkg, levels])
  const completeness = packageCompleteness(promos, reports)

  // 材料分区表：按业务类型一行，三计数列（待验收/已通过/驳回）
  const typeRows = useMemo(() => {
    const map = new Map<string, { pending: number; passed: number; rejected: number }>()
    promos.forEach((r) => {
      const t = promoBusinessType(r.visitCategory)
      const st = pkg.items[r.id]
      const row = map.get(t) ?? { pending: 0, passed: 0, rejected: 0 }
      if (st?.rectifying) row.rejected += 1
      else if (st && st.passedLevels >= levels) row.passed += 1
      else row.pending += 1
      map.set(t, row)
    })
    return Array.from(map.entries())
      .map(([type, c]) => ({ type, ...c }))
      .sort((a, b) => b.pending + b.passed + b.rejected - (a.pending + a.passed + a.rejected))
  }, [promos, pkg, levels])

  if (!months.length) {
    return (
      <div style={{ ...box, textAlign: "center", padding: "36px 14px", color: "#98A2B3" }}>
        <div style={{ fontSize: "var(--fs-13)", marginBottom: 12 }}>
          本任务暂无成果材料（当月无已归属的推广记录与报告），材料齐备后按月生成验收包。
        </div>
        {isProvider && onUploadReport && (
          <Button variant="primary" size="sm" icon={<Upload size={13} />} onClick={onUploadReport}>
            上传报告
          </Button>
        )}
      </div>
    )
  }

  const resubmit = (itemId: string, name: string) => {
    resubmitItem(task.id, activeMonth, itemId)
    addToast({
      type: "success",
      title: "已重新提交",
      description: `${name} 回到第 1 级重新验收`,
    })
  }

  return (
    <div>

      {/* 全部通过后：发起结算入口（无卡片，仅一行按钮） */}
      {summary.allPassed && completeness.complete && isSales && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <Button variant="primary" size="sm" onClick={onGoSettle}>
            发起结算
          </Button>
        </div>
      )}


      {/* 材料分区表：按业务类型一行，一行一个跳转目标 */}
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <ClipboardCheck size={16} color="var(--color-brand)" />
          <strong style={{ fontSize: "var(--fs-14)" }}>推广记录</strong>
          <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
            按业务类型汇总；验收在医院拜访页按月份、服务提供商过滤后进行
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>业务类型</th>
              <th style={{ ...th, textAlign: "right", width: 110 }}>待验收</th>
              <th style={{ ...th, textAlign: "right", width: 110 }}>已通过</th>
              <th style={{ ...th, textAlign: "right", width: 110 }}>驳回</th>
              <th style={{ ...th, textAlign: "right", width: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {typeRows.map(({ type, pending, passed, rejected }) => (
              <tr key={type}>
                <td style={{ ...td, fontWeight: 500 }}>{type}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: pending ? "#1F2937" : "#C7CDD6", fontWeight: 600 }}>
                  {pending}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: passed ? "#248A5A" : "#C7CDD6", fontWeight: 600 }}>
                  {passed}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: rejected ? "#C73A3A" : "#C7CDD6", fontWeight: 600 }}>
                  {rejected}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {isSales && navigate ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate("hospital-visits", {
                          serviceMonth: activeMonth,
                          provider: task.provider,
                        })
                      }
                      style={{
                        border: "none",
                        background: "none",
                        padding: 0,
                        color: "#2F6BCE",
                        cursor: "pointer",
                        fontSize: "var(--fs-13)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      去审核
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <span style={{ color: "#C7CDD6" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {!typeRows.length && (
              <tr>
                <td style={{ ...td, textAlign: "center", color: "#98A2B3" }} colSpan={5}>
                  本月无此类材料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 报告小表 */}
      <ReportTable
        reports={reports}
        pkg={pkg}
        levels={levels}
        isProvider={isProvider}
        onPreview={onPreviewReport}
        onResubmit={resubmit}
        onUpload={onUploadReport}
      />

    </div>
  )
}

// ===== 报告小表（行展开验收历史；就地批量验收） =====

function ReportTable({
  reports,
  pkg,
  levels,
  isProvider,
  onPreview,
  onResubmit,
  onUpload,
}: {
  reports: ReportFile[]
  pkg: ReturnType<typeof useAcceptance>["packages"][string]
  levels: number
  isProvider: boolean
  onPreview?: (report: ReportFile) => void
  onResubmit: (itemId: string, name: string) => void
  onUpload?: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <FileText size={16} color="var(--color-brand)" />
        <strong style={{ fontSize: "var(--fs-14)" }}>报告记录</strong>
        <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>{reports.length} 份</span>
        {isProvider && onUpload && (
          <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={onUpload} style={{ marginLeft: "auto" }}>
            上传报告
          </Button>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 36 }} />
            {["报告名称", "上传人", "版本", "服务商状态", "验收状态", "操作"].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const st = pkg.items[r.id]
            const acc = itemAcceptanceLabel(st, levels)
            const logs = pkg.logs.filter((l) => l.itemId === r.id)
            const open = expanded === r.id
            return (
              <Fragment key={r.id}>
                <tr style={{ background: open ? "#FAFBFC" : "transparent" }}>
                  <td style={td}>
                    <button
                      type="button"
                      aria-label={open ? "收起" : "展开"}
                      onClick={() => setExpanded(open ? null : r.id)}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 2, color: "#98A2B3" }}
                    >
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  <td style={td}>
                    <strong>{r.name}</strong>
                  </td>
                  <td style={td}>{r.uploadedBy}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>v{r.version ?? 1}</td>
                  <td style={td}>
                    <Tag label={r.status === "待上传" ? "待上传" : "已上传"} color={r.status === "待上传" ? "default" : "success"} />
                  </td>
                  <td style={td}>
                    <Tag label={acc.label} color={acc.tone} />
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {r.fileName && (
                        <button
                          type="button"
                          onClick={() => onPreview?.(r)}
                          style={{ border: "none", background: "none", padding: 0, color: "#2F6BCE", cursor: "pointer", fontSize: "var(--fs-12)", display: "inline-flex", gap: 3, alignItems: "center" }}
                        >
                          <Eye size={13} /> 预览
                        </button>
                      )}
                      {r.fileName && (
                        <button
                          type="button"
                          onClick={() => alert(`原型演示：下载 ${r.fileName}（不产生真实文件）`)}
                          style={{ border: "none", background: "none", padding: 0, color: "#2F6BCE", cursor: "pointer", fontSize: "var(--fs-12)", display: "inline-flex", gap: 3, alignItems: "center" }}
                        >
                          <Download size={13} /> 下载
                        </button>
                      )}
                      {isProvider && st?.rectifying && (
                        <button
                          type="button"
                          onClick={() => onResubmit(r.id, r.name)}
                          style={{ border: "none", background: "none", padding: 0, color: "#C77A16", cursor: "pointer", fontSize: "var(--fs-12)", display: "inline-flex", gap: 3, alignItems: "center" }}
                        >
                          <RefreshCw size={13} /> 重新提交
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td style={{ ...td, background: "#FAFBFC" }} />
                    <td style={{ ...td, background: "#FAFBFC" }} colSpan={6}>
                      {logs.length ? (
                        <div>
                          <div style={{ fontSize: "var(--fs-12)", color: "#98A2B3", marginBottom: 6 }}>本报告验收历史</div>
                          {logs.slice().reverse().map((l) => (
                            <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--fs-12)", padding: "3px 0", flexWrap: "wrap" }}>
                              <Tag label={l.decision} color={l.decision === "通过" ? "success" : "danger"} />
                              <span>第 {l.level} 级 · {l.department} · {l.reviewer}</span>
                              <span style={{ color: "#98A2B3" }}>{l.time}</span>
                              {l.comment && <span style={{ color: "#667085" }}>意见：{l.comment}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>尚无验收记录</span>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {!reports.length && (
            <tr>
              <td style={{ ...td, textAlign: "center", color: "#98A2B3" }} colSpan={7}>
                本月无报告记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ===== 批量验收弹窗（本页签验收报告；医院拜访页验收模式复用） =====

export function BatchReviewModal({
  taskId,
  month,
  level,
  department,
  reviewer,
  items,
  preRejectIds,
  onClose,
  onSubmit,
}: {
  taskId: string
  month: string
  level: number
  department: string
  reviewer: string
  items: { itemId: string; itemType: "推广记录" | "报告"; itemName: string }[]
  /** 预置为驳回的条目（行内单条驳回入口用） */
  preRejectIds?: string[]
  onClose: () => void
  onSubmit: (input: BatchReviewInput) => boolean
}) {
  const [results, setResults] = useState<Record<string, "通过" | "驳回">>(() =>
    Object.fromEntries(
      items.map((it) => [it.itemId, preRejectIds?.includes(it.itemId) ? ("驳回" as const) : ("通过" as const)]),
    ),
  )
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [batchComment, setBatchComment] = useState("")
  const [error, setError] = useState("")

  const rejected = items.filter((it) => results[it.itemId] === "驳回")
  const missing = rejected.some((it) => !(reasons[it.itemId] ?? "").trim())

  const submit = () => {
    if (missing) {
      setError("驳回条目必须填写原因")
      return
    }
    const ok = onSubmit({
      taskId,
      serviceMonth: month,
      level,
      department,
      reviewer,
      batchComment,
      items: items.map((it) => ({
        itemId: it.itemId,
        itemType: it.itemType,
        itemName: it.itemName,
        decision: results[it.itemId],
        comment: results[it.itemId] === "驳回" ? (reasons[it.itemId] ?? "") : "",
      })),
    })
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title={department === "成果验收" ? "批量验收 · 成果验收" : `第 ${level} 级批量验收 · ${department}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: "var(--fs-12)", color: "#667085" }}>
            通过 {items.length - rejected.length} 条 · 驳回 {rejected.length} 条 · 仅驳回条目退回服务商
          </span>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={missing} onClick={submit}>
            提交验收结果
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
          {month} 材料包 · 待审 {items.length} 条 · 默认全部通过，选择驳回后必须填写原因
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Check size={13} />}
          onClick={() => {
            setResults(Object.fromEntries(items.map((it) => [it.itemId, "通过" as const])))
            setReasons({})
            setError("")
          }}
        >
          全部通过
        </Button>
      </div>
      <div style={{ maxHeight: 380, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
        {items.map((it, i) => {
          const isReject = results[it.itemId] === "驳回"
          return (
            <div
              key={it.itemId}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderBottom: i === items.length - 1 ? "none" : "1px solid #F3F4F6",
                background: isReject ? "#FFFBFA" : "transparent",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#F3F4F6",
                  color: "#667085",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  flex: "none",
                  marginTop: 2,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-11)", color: "#98A2B3" }}>
                  {it.itemType} · {it.itemId}
                </div>
                <div style={{ fontSize: "var(--fs-13)", fontWeight: 500, marginTop: 1 }}>{it.itemName}</div>
                {isReject && (
                  <input
                    value={reasons[it.itemId] ?? ""}
                    onChange={(e) => {
                      setReasons((prev) => ({ ...prev, [it.itemId]: e.target.value }))
                      setError("")
                    }}
                    placeholder="请填写驳回原因（必填），将退回服务商补充"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      height: 32,
                      padding: "0 10px",
                      fontSize: "var(--fs-13)",
                      border: "1px solid #F1C7C7",
                      borderRadius: 6,
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none", marginTop: 2 }}>
                {(["通过", "驳回"] as const).map((dec) => {
                  const active = results[it.itemId] === dec
                  return (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => {
                        setResults((prev) => ({ ...prev, [it.itemId]: dec }))
                        setError("")
                      }}
                      style={{
                        height: 28,
                        padding: "0 12px",
                        fontSize: "var(--fs-12)",
                        fontWeight: active ? 600 : 400,
                        borderRadius: 6,
                        cursor: "pointer",
                        color: active ? "#fff" : "#667085",
                        background: active
                          ? dec === "通过"
                            ? "#248A5A"
                            : "#C73A3A"
                          : "#F3F4F6",
                        border: "1px solid transparent",
                      }}
                    >
                      {dec}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          value={batchComment}
          onChange={(e) => setBatchComment(e.target.value)}
          placeholder="批次意见（选填，如：其余材料齐全，同意）"
          style={{
            width: "100%",
            height: 34,
            padding: "0 10px",
            fontSize: "var(--fs-13)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            outline: "none",
          }}
        />
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: "var(--fs-12)", color: "#C73A3A" }}>{error}</div>
      )}
    </Modal>
  )
}
