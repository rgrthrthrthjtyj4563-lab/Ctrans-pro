/**
 * 在途任务待办接手/改派（2026-11 §2/A11，工作组下线后旧单交接）。
 *
 * 从 TaskDataContext 抽出的纯函数，便于独立回归（A11）：
 * - 仅转移「未完成」的未办工作量；待审核/已完成保留原经办人（已提交成果不转移）；
 * - 目标人员须为本服务商（任务承接方）的有效成员（active 成员身份）；
 * - 幂等：目标与当前经办人相同、已选入结算单时拒绝；刷新/重试不重复派发计量；
 * - 留痕：返回接手后任务量行与操作日志明细；旧组名、已提交成果、金额不变。
 */
import type { Task, WorkloadAssign } from "../types"
import { membershipActive, membershipsOfUser } from "./cooperationModel"
import { allUsers } from "./tenantRegistry"

export interface TakeoverInput {
  taskId: string
  assignId: string
  /** 接手目标专员姓名；「接手」传操作人本人姓名，「改派」传合资格专员 */
  targetSpecialist: string
  operator: string
  reason?: string
  /** 接手时间（演示环境由调用方注入 DEMO_NOW；测试可传固定值） */
  now?: string
}

export type TakeoverOutcome =
  | { ok: true; assign: WorkloadAssign; logDetail: string }
  | { ok: false; error: string }

export function takeoverWorkloadOnTask(
  task: Task,
  input: TakeoverInput,
): TakeoverOutcome {
  if (task.id !== input.taskId) return { ok: false, error: "任务不存在" }
  if (task.taskStatus !== "执行中")
    return { ok: false, error: "仅执行中任务可接手/改派待办" }
  const assign = task.workloadAssigns.find((a) => a.id === input.assignId)
  if (!assign) return { ok: false, error: "待办不存在，请刷新后重试" }
  if (assign.progress !== "未完成") {
    return {
      ok: false,
      error: `该工作量已由 ${assign.specialist} 提交（${assign.progress}），已提交成果保留原经办人，不可转移`,
    }
  }
  if (assign.settledBillNo)
    return { ok: false, error: "该工作量已选入结算单，不可接手/改派" }
  const target = input.targetSpecialist.trim()
  if (!target) return { ok: false, error: "请选择接手/改派对象" }
  if (target === assign.specialist) {
    return { ok: false, error: `该待办已在 ${target} 名下，无需重复转移` }
  }
  // 目标人员必须是本服务商（任务承接方）的有效成员
  const targetUser = allUsers().find((u) => u.name === target)
  if (!targetUser)
    return { ok: false, error: `「${target}」不是平台在册人员，无法接手` }
  const activeHere = membershipsOfUser(targetUser.id).some(
    (m) => m.tenantName === task.provider && membershipActive(m),
  )
  if (!activeHere) {
    return {
      ok: false,
      error: `「${target}」不是本服务商有效成员（可能已离职/冻结/归属其他企业），无法接手`,
    }
  }
  // 防重复计量：目标名下已有同项目待办时拒绝（追加工作量走正常分配入口）
  const dup = task.workloadAssigns.find(
    (a) =>
      a.id !== assign.id &&
      a.specialist === target &&
      a.variety === assign.variety &&
      a.region === assign.region &&
      a.itemName === assign.itemName &&
      a.serviceMonth === assign.serviceMonth,
  )
  if (dup) {
    return {
      ok: false,
      error: `「${target}」名下已有同项目待办，不可重复派发；请先处理原待办或改派其他合资格人员`,
    }
  }
  const now = input.now ?? new Date().toISOString().slice(0, 16).replace("T", " ")
  const nextAssign: WorkloadAssign = {
    ...assign,
    specialist: target,
    takenOverFrom: assign.takenOverFrom ?? assign.specialist,
    takenOverBy: input.operator,
    takenOverAt: now,
  }
  return {
    ok: true,
    assign: nextAssign,
    logDetail: `${input.operator} 将「${assign.takenOverFrom ?? assign.specialist}」的待办（${assign.variety} · ${assign.region} · ${assign.itemName} × ${assign.workload}）转移给「${target}」${input.reason ? `；原因：${input.reason}` : ""}；仅转移未办工作，已提交成果与历史组名不变`,
  }
}
