import { useState } from "react"
import { Building2, Briefcase, Users, User, Info } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { Tag } from "../components/StatusTag"
import { EmptyState } from "../components/EmptyState"
import { useTaskData } from "../context/TaskDataContext"
import { chainLevelOf, chainPathLabel, chainNodesOf } from "../domain/taskV4"
import type { ChainNode, Role } from "../types"
import type { ToastMessage } from "../components/Toast"

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  currentRole: Role
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  药厂: <Building2 size={18} />,
  服务提供商: <Briefcase size={18} />,
  工作组: <Users size={18} />,
  服务专员: <User size={18} />,
}

/** 节点间连接线文案：发包任务 / 拆解到工作组 / 分配工作量；停用后显示「已停用」 */
const CONN_LABELS = ["发包任务", "拆解到工作组", "分配工作量"]

/** 停用工作组后的跳线几何：与节点卡(196px)/连线列(84px)宽度同源，坐标为链路行内容区固定像素 */
const JUMP_HEADROOM = 56
const JUMP_X1 = 196 + 84 + 98 // 服务提供商卡片中心 x
const JUMP_X2 = 3 * (196 + 84) + 98 // 服务专员卡片中心 x
const JUMP_MID = (JUMP_X1 + JUMP_X2) / 2

/** 职责对比表：当前生效列用主色浅底标记，颜色不做唯一载体（附「当前生效」文字标签） */
const COMPARE_ROWS: { aspect: string four: string three: string }[] = [
  {
    aspect: "任务拆解方",
    four: "服务提供商拆解到工作组",
    three: "无拆解环节，任务直达分配",
  },
  {
    aspect: "工作量分配方",
    four: "工作组分配给服务专员",
    three: "服务提供商直接分配给服务专员",
  },
  {
    aspect: "组长审核角色",
    four: "工作组长参与填报初审",
    three: "无组长角色，由服务提供商直接审核",
  },
  {
    aspect: "发起结算维度",
    four: "服务月份 + 服务专员（两种形态一致）",
    three: "服务月份 + 服务专员（两种形态一致）",
  },
]

export function ExecutionChainConfig({ addToast, currentRole }: Props) {
  const { chain, updateChain } = useTaskData()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const fourLevel = chainLevelOf(chain) === "四级链"
  const canEdit = currentRole === "药厂销售部门"
  const latest = chain.changeRecords[0]

  function applyWorkgroup(enabled: boolean) {
    const next = { ...chain, nodes: chainNodesOf(enabled) }
    const r = updateChain(next, "李航")
    if (!r.ok) {
      addToast({ type: "error", title: "调整失败", description: r.error })
      return
    }
    addToast({
      type: "success",
      title: enabled ? "已启用工作组" : "已停用工作组",
      description: "仅对新建任务生效，已创建任务按原链路执行",
    })
  }

  function onSwitchClick() {
    if (fourLevel) {
      setConfirmOpen(true)
    } else {
      applyWorkgroup(true)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="执行链路配置"
        description="决定推广任务的执行链路是否经过「工作组」。配置仅对调整后新建的任务生效，已创建任务按原链路执行。"
        actions={
          fourLevel ? (
            <Tag label="四级链生效中" color="brand" />
          ) : (
            <Tag label="三级链生效中" color="brand" />
          )
        }
      />
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: "var(--fs-12)",
            color: "#667085",
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 8,
          }}
        >
          更新于 {chain.updatedAt} · {chain.updatedBy}
        </div>

        {/* 链路图卡片 */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: "var(--fs-16)", fontWeight: 650 }}>
            任务执行链
          </div>
          <div
            style={{
              fontSize: "var(--fs-12)",
              color: "#667085",
              margin: "4px 0 18px",
            }}
          >
            链路层级固定为四级，仅「工作组」层可停用；停用后服务商把工作量直接分配给服务专员。
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              overflowX: "auto",
              paddingTop: fourLevel ? 8 : JUMP_HEADROOM,
              paddingBottom: 4,
              position: "relative",
            }}
          >
            {chain.nodes.map((node: ChainNode, i) => {
              const disabled = !node.enabled
              return (
                <div
                  key={node.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    flex: i === chain.nodes.length - 1 ? 1 : "0 0 auto",
                  }}
                >
                  {i > 0 && (
                    <div
                      style={{
                        flex: "0 0 84px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingTop: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: "var(--fs-12)",
                          color:
                            disabled || !chain.nodes[i - 1].enabled
                              ? "#B7BEC9"
                              : "#667085",
                        }}
                      >
                        {disabled ? "已停用" : CONN_LABELS[i - 1]}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          borderTop: `1.5px ${
                            disabled
                              ? "dashed #DAE0E6"
                              : "solid var(--color-border-strong, #D0D5DD)"
                          }`,
                        }}
                      />
                    </div>
                  )}
                  <div
                    style={{
                      width: 196,
                      flexShrink: 0,
                      position: "relative",
                      border: `1px ${
                        disabled
                          ? "dashed #D0D5DD"
                          : "solid var(--color-border)"
                      }`,
                      borderRadius: 8,
                      padding: "14px 16px",
                      background: disabled ? "#FBFCFC" : "#fff",
                    }}
                  >
                    {node.toggleable && (
                      <span
                        style={{ position: "absolute", right: 8, top: -10 }}
                      >
                        <Tag label="可配置层" color="default" />
                      </span>
                    )}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          flex: "none",
                          background: "#F2F4F7",
                          color: "#667085",
                          fontSize: "var(--fs-12)",
                          fontWeight: 600,
                          display: "grid",
                          placeItems: "center",
                          fontFamily: "'JetBrains Mono', monospace",
                          opacity: disabled ? 0.5 : 1,
                        }}
                      >
                        {node.level}
                      </span>
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          flex: "none",
                          background: disabled
                            ? "#F2F4F7"
                            : "var(--color-brand-subtle)",
                          color: disabled ? "#98A2B3" : "var(--color-brand)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {NODE_ICONS[node.id]}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        {disabled ? (
                          <Tag label="已停用" color="default" />
                        ) : (
                          <Tag label="生效中" color="success" />
                        )}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-14)",
                        fontWeight: 600,
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      {node.label}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-12)",
                        color: "#667085",
                        marginTop: 4,
                        lineHeight: 1.5,
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      {node.summary}
                    </div>
                    {node.toggleable && (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px dashed var(--color-border)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "var(--fs-12)",
                          color: "#667085",
                        }}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={node.enabled}
                          aria-label="工作组层启用开关"
                          disabled={!canEdit}
                          onClick={onSwitchClick}
                          style={{
                            width: 36,
                            height: 20,
                            borderRadius: 999,
                            border: "none",
                            flex: "none",
                            background: node.enabled
                              ? "var(--color-brand)"
                              : "#CBD5E1",
                            position: "relative",
                            cursor: canEdit ? "pointer" : "not-allowed",
                            padding: 0,
                            transition: "background 160ms ease",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: 2,
                              left: 2,
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              background: "#fff",
                              boxShadow: "0 1px 2px rgba(0,0,0,.25)",
                              transform: node.enabled
                                ? "translateX(16px)"
                                : "none",
                              transition: "transform 160ms ease",
                            }}
                          />
                        </button>
                        <span>
                          {node.enabled ? "工作组层已启用" : "工作组层已停用"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {!fourLevel && (
              <>
                {/* 停用工作组后的跳线：服务商越过工作组直接落到专员，随链路行横向滚动 */}
                <svg
                  width={JUMP_X2 + 98}
                  height={JUMP_HEADROOM + 4}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    pointerEvents: "none",
                    overflow: "visible",
                  }}
                >
                  <defs>
                    <marker
                      id="jump-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" fill="#C77A16" />
                    </marker>
                  </defs>
                  <path
                    d={`M ${JUMP_X1} ${JUMP_HEADROOM} Q ${JUMP_MID} -28 ${JUMP_X2} ${JUMP_HEADROOM}`}
                    fill="none"
                    stroke="#C77A16"
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    markerEnd="url(#jump-arrow)"
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    left: JUMP_MID,
                    top: 2,
                    transform: "translateX(-50%)",
                    background: "#fff",
                    border: "1px solid #F2D9AC",
                    color: "#C77A16",
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontSize: "var(--fs-12)",
                    whiteSpace: "nowrap",
                  }}
                >
                  直接分配工作量
                </div>
              </>
            )}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: "var(--fs-14)",
              color: "#667085",
            }}
          >
            当前生效：
            <strong style={{ color: "var(--color-text-1)" }}>
              {chainLevelOf(chain)}
            </strong>
            （{chainPathLabel(chain)}）
            {!fourLevel && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginLeft: 12,
                  color: "#C77A16",
                  fontSize: "var(--fs-13)",
                }}
              >
                <Info size={14} />{" "}
                工作组环节已停用：由服务提供商直接分配工作量给服务专员
              </span>
            )}
          </div>
          {!canEdit && (
            <div
              style={{
                marginTop: 10,
                fontSize: "var(--fs-12)",
                color: "#98A2B3",
              }}
            >
              当前角色仅可查看，链路调整由药厂销售管理员操作。
            </div>
          )}
        </div>

        {/* 职责对比表 */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: "var(--fs-16)", fontWeight: 650 }}>
            两种链路职责对比
          </div>
          <div
            style={{
              fontSize: "var(--fs-12)",
              color: "#667085",
              margin: "4px 0 16px",
            }}
          >
            当前生效模式已标注，切换上方开关后自动更新。
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--fs-13)",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr>
                <th style={{ ...cmpTh, width: 150 }}>环节</th>
                <th
                  style={{
                    ...cmpTh,
                    background: fourLevel
                      ? "var(--color-brand-subtle)"
                      : "#F9FAFB",
                    color: fourLevel ? "var(--color-brand)" : "#9CA3AF",
                  }}
                >
                  四级链（含工作组）{fourLevel && " "}
                  {fourLevel && <Tag label="当前生效" color="brand" />}
                </th>
                <th
                  style={{
                    ...cmpTh,
                    background: !fourLevel
                      ? "var(--color-brand-subtle)"
                      : "#F9FAFB",
                    color: !fourLevel ? "var(--color-brand)" : "#9CA3AF",
                  }}
                >
                  三级链（停用工作组）{!fourLevel && " "}
                  {!fourLevel && <Tag label="当前生效" color="brand" />}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.aspect}>
                  <td style={{ ...cmpTd, color: "#667085" }}>{row.aspect}</td>
                  <td
                    style={{
                      ...cmpTd,
                      background: fourLevel
                        ? "var(--color-brand-subtle)"
                        : undefined,
                    }}
                  >
                    {row.four}
                  </td>
                  <td
                    style={{
                      ...cmpTd,
                      background: !fourLevel
                        ? "var(--color-brand-subtle)"
                        : undefined,
                    }}
                  >
                    {row.three}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 变更记录 */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: "var(--fs-16)", fontWeight: 650 }}>
            变更记录
          </div>
          <div
            style={{
              fontSize: "var(--fs-12)",
              color: "#667085",
              margin: "4px 0 16px",
            }}
          >
            链路调整全程留痕，按时间倒序展示。
          </div>
          {chain.changeRecords.length === 0 ? (
            <EmptyState
              title="暂无变更记录"
              description="调整工作组层开关后，此处会记录每一次链路变化。"
            />
          ) : (
            <div>
              {chain.changeRecords.map((record, i) => (
                <div
                  key={record.id}
                  style={{
                    position: "relative",
                    padding: `0 0 ${
                      i === chain.changeRecords.length - 1 ? 0 : 16
                    }px 22px`,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 6,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: i === 0 ? "var(--color-brand)" : "#D0D5DD",
                    }}
                  />
                  {i !== chain.changeRecords.length - 1 && (
                    <span
                      style={{
                        position: "absolute",
                        left: 7.5,
                        top: 16,
                        bottom: 0,
                        width: 1,
                        background: "var(--color-border)",
                      }}
                    />
                  )}
                  <div style={{ fontWeight: 600 }}>{record.action}</div>
                  <div
                    style={{
                      fontSize: "var(--fs-12)",
                      color: "#667085",
                      fontFamily: "'JetBrains Mono', monospace",
                      marginTop: 2,
                    }}
                  >
                    {record.time} · {record.operator} · 仅新建任务生效
                  </div>
                  <div
                    style={{
                      fontSize: "var(--fs-12)",
                      color: "#667085",
                      marginTop: 2,
                    }}
                  >
                    {record.impact}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示条 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: "var(--color-brand-subtle)",
            borderRadius: 8,
            padding: "12px 16px",
            color: "var(--color-brand)",
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: "var(--fs-13)" }}>
            链路调整只影响调整后新建的任务，已创建任务按创建时的链路继续执行；任务链路快照一经生成不可修改。
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="停用「工作组」层？"
        description="停用后，链路将变为「药厂 → 服务提供商 → 服务专员」，请确认以下影响："
        impact={
          "新建任务将由服务提供商直接把工作量分配给服务专员，不再拆解到工作组；\n任务进度与结算不再按工作组归集，组长不再参与填报审核；\n已创建任务不受影响，仍按创建时的链路执行。"
        }
        confirmLabel="停用工作组"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false)
          applyWorkgroup(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

const cmpTh: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "var(--fs-12)",
  fontWeight: 600,
  color: "#9CA3AF",
  background: "#F9FAFB",
  border: "1px solid var(--color-border)",
}

const cmpTd: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--fs-13)",
  color: "var(--color-text-1)",
  border: "1px solid var(--color-border)",
  verticalAlign: "top",
}
