import { Building2, Briefcase, User, Info } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { usePermission } from "../context/PermissionContext"
import { Tag } from "../components/StatusTag"
import { EmptyState } from "../components/EmptyState"
import { useTaskData } from "../context/TaskDataContext"
import { chainLevelOf, chainPathLabel } from "../domain/taskV4"
import type { Role } from "../types"
import type { ToastMessage } from "../components/Toast"

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  currentRole?: Role
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  药厂: <Building2 size={18} />,
  服务提供商: <Briefcase size={18} />,
  工作组: <Briefcase size={18} />,
  服务专员: <User size={18} />,
}

/** 节点间连接线文案：发包任务 / 分配工作量 */
const CONN_LABELS = ["发包任务", "分配工作量"]

/**
 * 执行链路配置（2026-11 工作组体系下线版）：
 * 「可切回四级」的设置已移除——执行链固定为三级直达（药厂 → 服务提供商 → 服务专员），
 * 本页仅展示当前生效链路与历史变更记录；已创建任务按创建时的链路快照继续执行，
 * 在途旧四级单在任务执行页按原链路读取并支持接手/改派。
 */
export function ExecutionChainConfig({ currentRole: _currentRole }: Props) {
  const { chain } = useTaskData()
  // 按角色页面权限判定（不再用旧角色名称字符串）；本页已无编辑动作，仅保留权限口径
  const { can: canPerm } = usePermission()
  const _canEdit = canPerm("execution-chain", "edit")
  const fourLevel = chainLevelOf(chain) === "四级链"
  const enabledNodes = chain.nodes.filter((n) => n.enabled)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="执行链路配置"
        description="2026-11 起工作组体系下线：新任务统一走三级直达链路（服务商直接分配服务专员），不可切回四级；已创建任务按创建时链路执行。"
        actions={<Tag label="三级直达（固定）" color="brand" />}
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

        {/* 链路图卡片（只读） */}
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
            执行链固定为三级直达，不再提供链路层级开关；层级与分派规则调整由版本发布统一管理。
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              overflowX: "auto",
              paddingTop: 8,
              paddingBottom: 4,
            }}
          >
            {enabledNodes.map((node, i) => (
              <div
                key={node.id}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  flex: i === enabledNodes.length - 1 ? 1 : "0 0 auto",
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
                    <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
                      {CONN_LABELS[i - 1]}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        borderTop: "1.5px solid var(--color-border-strong, #D0D5DD)",
                      }}
                    />
                  </div>
                )}
                <div
                  style={{
                    width: 196,
                    flexShrink: 0,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    background: "#fff",
                  }}
                >
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
                        background: "var(--color-brand-subtle)",
                        color: "var(--color-brand)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {NODE_ICONS[node.id]}
                    </span>
                    <span style={{ marginLeft: "auto" }}>
                      <Tag label="生效中" color="success" />
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "var(--fs-14)",
                      fontWeight: 600,
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
                    }}
                  >
                    {node.summary}
                  </div>
                </div>
              </div>
            ))}
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
                承接环节已停用：由服务提供商直接分配工作量给服务专员；该链路不经过部门承接层
              </span>
            )}
          </div>
        </div>

        {/* 历史口径说明 */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: "var(--fs-16)", fontWeight: 650 }}>
            新旧任务口径
          </div>
          <div style={{ fontSize: "var(--fs-13)", color: "#667085", lineHeight: 1.7 }}>
            新推广任务：药厂发包 → 服务商承接 → 有分派权限的服务商成员分配工作量 → 专员提交 → 服务商初审，全程无需选择工作组。
            <br />
            在途旧四级任务：按创建时的链路快照继续办理；原经办人失效时，服务商管理员可在该单待办或详情上接手或改派给合资格人员。
            <br />
            已结束旧任务：历史列表、详情与导出按原记录展示（允许显示「工作组」），已确认的绩效与结算金额不按今天的组织重算。
          </div>
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
              description="链路变化将在此处留痕展示。"
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
                    {record.time} · {record.operator}
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
            新任务统一使用直达链路；任务链路快照一经生成不可修改，在途旧四级单按原链路办理、支持接手改派。
          </span>
        </div>
      </div>
    </div>
  )
}
