/**
 * 合作模型 · 外部准入整批导入（importRelationshipsBatch）测试
 * 针对真实 store（localStorage 垫片见 vitest.setup.ts）：验证拦截规则、
 * 整批原子性（任一行失败不写入任何行）与终止重建的历史保留。
 */
import { beforeEach, describe, expect, it } from "vitest"
import {
  getCooperationSnapshot,
  importRelationshipsBatch,
  pauseRelationship,
  relationshipSourceLabel,
  resetCooperationModel,
  terminateRelationship,
} from "./cooperationModel"

const PHARMA = "org-pharma"
const EAST = "org-provider-east" // 种子：与百益 active
const TAIHE = "org-rt-taihe" // 种子：与百益 active（用于终止→重建场景）

beforeEach(() => {
  resetCooperationModel()
})

describe("relationshipSourceLabel · 来源展示口径", () => {
  it("manual=外部准入 / access（含缺省）=平台准入", () => {
    expect(relationshipSourceLabel("manual")).toBe("外部准入")
    expect(relationshipSourceLabel("access")).toBe("平台准入")
    expect(relationshipSourceLabel(undefined)).toBe("平台准入")
  })
})

describe("importRelationshipsBatch · 整批原子导入", () => {
  it("无历史关系方向：建立生效合作，写入 source=manual 与可追溯 importMeta", () => {
    terminateRelationship(
      getCooperationSnapshot().relationships.find((r) => r.id === "rel-baiyi-taihe")!.id,
      "测试腾出方向",
      "tester",
    )
    const before = getCooperationSnapshot().relationships.length
    const res = importRelationshipsBatch({
      pharmaTenantId: PHARMA,
      rows: [{ providerTenantId: TAIHE }],
      actor: "李航",
      importBatchId: "imp-test-1",
      declaration: "本批次服务商均已由本厂完成准入审核，相关材料在本厂自有系统或线下渠道留存备查，审核责任由本厂承担。",
    })
    expect(res.ok).toBe(true)
    const after = getCooperationSnapshot().relationships
    expect(after.length).toBe(before + 1)
    const created = res.created![0]!
    expect(created.source).toBe("manual")
    expect(created.status).toBe("active")
    expect(created.importMeta?.importBatchId).toBe("imp-test-1")
    expect(created.importMeta?.importedBy).toBe("李航")
    expect(created.importMeta?.declaration).toContain("审核责任由本厂承担")
    // 历史终止记录保留（同一方向两条）
    const ofPair = after.filter((r) => r.providerTenantId === TAIHE && r.pharmaTenantId === PHARMA)
    expect(ofPair).toHaveLength(2)
    expect(ofPair[0]!.status).toBe("terminated")
    // 审计：重建场景 reasonCode
    expect(res.audits[0]!.reasonCode).toBe("COOPERATION_RECREATED_BY_MANUAL_IMPORT")
  })

  it("已生效方向被拦截：整批不写入", () => {
    const before = getCooperationSnapshot().relationships.length
    const res = importRelationshipsBatch({
      pharmaTenantId: PHARMA,
      rows: [{ providerTenantId: EAST }],
      actor: "李航",
      importBatchId: "imp-test-2",
      declaration: "声明",
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("无需重复导入")
    expect(getCooperationSnapshot().relationships.length).toBe(before)
  })

  it("暂停方向被拦截并引导恢复合作", () => {
    pauseRelationship("rel-baiyi-east", "测试暂停", "tester")
    const res = importRelationshipsBatch({
      pharmaTenantId: PHARMA,
      rows: [{ providerTenantId: EAST }],
      actor: "李航",
      importBatchId: "imp-test-3",
      declaration: "声明",
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("请恢复合作而非重复导入")
  })

  it("名单内重复 → 整批拒绝，不产生任何写入", () => {
    const before = getCooperationSnapshot().relationships.length
    terminateRelationship("rel-baiyi-taihe", "测试腾出方向", "tester")
    const res = importRelationshipsBatch({
      pharmaTenantId: PHARMA,
      rows: [{ providerTenantId: TAIHE }, { providerTenantId: TAIHE }],
      actor: "李航",
      importBatchId: "imp-test-4",
      declaration: "声明",
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("名单内重复")
    expect(getCooperationSnapshot().relationships.length).toBe(before)
  })

  it("混合批任一行失败（后行已生效）→ 整批原子不写入（先行不落库）", () => {
    terminateRelationship("rel-baiyi-taihe", "测试腾出方向", "tester")
    const before = getCooperationSnapshot().relationships.length
    const res = importRelationshipsBatch({
      pharmaTenantId: PHARMA,
      // 泰合（已终止可重建）+ 东方恒业（active 必拦截）
      rows: [{ providerTenantId: TAIHE }, { providerTenantId: EAST }],
      actor: "李航",
      importBatchId: "imp-test-5",
      declaration: "声明",
    })
    expect(res.ok).toBe(false)
    expect(getCooperationSnapshot().relationships.length).toBe(before)
  })

  it("空名单 / 空声明拒绝", () => {
    expect(importRelationshipsBatch({ pharmaTenantId: PHARMA, rows: [], actor: "a", importBatchId: "x", declaration: "d" }).ok).toBe(false)
    expect(
      importRelationshipsBatch({ pharmaTenantId: PHARMA, rows: [{ providerTenantId: TAIHE }], actor: "a", importBatchId: "x", declaration: " " }).ok,
    ).toBe(false)
  })
})
