import { describe, expect, it } from "vitest"
import { takeoverWorkloadOnTask } from "./taskTakeover"
import { membershipActive, membershipsOfTenant } from "./cooperationModel"
import { allUsers } from "./tenantRegistry"
import { seedTasks } from "./mockData"

// 2026-11 §2/A11：在途旧四级单（TR-003）按原链路读取；原经办人失效时
// 服务商管理员可接手或改派；交接仅动未办事项，重复接手不重复派发计量。

const task = seedTasks.find((t) => t.id === "TR-003")!
const eastUsers = () => {
  const active = membershipsOfTenant("org-provider-east").filter(membershipActive)
  const names = new Set(active.map((m) => m.userId))
  return allUsers().filter((u) => names.has(u.id))
}

describe("takeoverWorkloadOnTask · 在途旧单接手/改派", () => {
  it("TR-003 是工作组下线前的旧四级单，含未完成待办（样本自检）", () => {
    expect(task).toBeTruthy()
    expect(task.chainSnapshot.nodes.find((n) => n.id === "工作组")?.enabled).toBe(true)
    expect(task.workgroupSplits.length).toBeGreaterThan(0)
    expect(task.workgroupSplits[0].workGroup).toContain("工作组")
    const pending = task.workloadAssigns.filter((a) => a.progress === "未完成")
    expect(pending.length).toBeGreaterThan(0)
  })

  it("改派未办待办给本服务商有效成员：换经办人、留接手痕迹，金额与组名不变", () => {
    const pending = task.workloadAssigns.find((a) => a.progress === "未完成")!
    const candidate = eastUsers().find((u) => u.name !== pending.specialist)
    expect(candidate).toBeTruthy()
    const r = takeoverWorkloadOnTask(task, {
      taskId: "TR-003",
      assignId: pending.id,
      targetSpecialist: candidate!.name,
      operator: "陈伟",
      reason: "原经办人已冻结",
      now: "2026-11-24 10:00",
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.assign.specialist).toBe(candidate!.name)
    expect(r.assign.takenOverFrom).toBe(pending.specialist)
    expect(r.assign.takenOverBy).toBe("陈伟")
    expect(r.assign.takenOverAt).toBe("2026-11-24 10:00")
    expect(r.assign.amount).toBe(pending.amount)
    expect(r.assign.workGroup).toBe(pending.workGroup)
    expect(r.logDetail).toContain("仅转移未办工作")
  })

  it("已提交（已完成/待审核）的工作量不可转移：成果保留原经办人", () => {
    const done = task.workloadAssigns.find((a) => a.progress !== "未完成")!
    const candidate = eastUsers().find((u) => u.name !== done.specialist)
    const r = takeoverWorkloadOnTask(task, {
      taskId: "TR-003",
      assignId: done.id,
      targetSpecialist: candidate!.name,
      operator: "陈伟",
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("已提交成果保留原经办人")
  })

  it("幂等：目标与当前经办人相同或待办已在其名下时拒绝（刷新/重试不重复派发）", () => {
    const pending = task.workloadAssigns.find((a) => a.progress === "未完成")!
    const r = takeoverWorkloadOnTask(task, {
      taskId: "TR-003",
      assignId: pending.id,
      targetSpecialist: pending.specialist,
      operator: "陈伟",
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("无需重复转移")
  })

  it("非本服务商有效成员不可接手（药厂成员/平台人员被拒）", () => {
    const pending = task.workloadAssigns.find((a) => a.progress === "未完成")!
    const eastNames = new Set(eastUsers().map((u) => u.name))
    const outsider = allUsers().find((u) => !eastNames.has(u.name))
    expect(outsider).toBeTruthy()
    const r = takeoverWorkloadOnTask(task, {
      taskId: "TR-003",
      assignId: pending.id,
      targetSpecialist: outsider!.name,
      operator: "陈伟",
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("不是本服务商有效成员")
  })
})
