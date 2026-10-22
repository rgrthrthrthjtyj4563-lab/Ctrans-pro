import { useCallback, useEffect, useMemo, useState } from "react"
import { STARTUP_GUIDE_STEPS, isPriceConfigStarted } from "../components/StartupGuide"
import { useVendorAccess } from "../context/VendorAccessContext"
import { useContract } from "../context/ContractContext"
import { useTaskData } from "../context/TaskDataContext"
import type { AuthPrincipal } from "../auth/authTypes"

/**
 * 新手引导「合作启动步骤」完成态（2026-10-14 口径重构）：
 * - 取消手动标记：完成 = 对应板块存在本厂初始数据（任意状态、不追数据结局，创建即完成）；
 * - 准入/合同读各自 Context，品种读 TaskDataContext（按持有人名称归属）；
 * - 价目表数据是页面组件私有 state，工作台层读不到，用「首次产生配置」的
 *   一次性本地标记代记录（isPriceConfigStarted），外加种子已带价目的演示药厂名单兜底；
 * - 按药厂（不按登录用户）判定，数据变化实时反映；
 * - 「稍后再说」仍只关本次会话的欢迎卡（内存态），顶栏胶囊入口随时可开抽屉。
 */

/** 价目表页种子已带配置数据的演示药厂（页面 shortName 口径） */
const PRICE_CONFIG_SEED_PHARMAS = ["百益制药"]

export interface StartupGuideState {
  completedSteps: string[]
  completedCount: number
  total: number
  allComplete: boolean
  /** 欢迎卡是否展示：未全部完成 且 本次会话内未点「稍后再说」 */
  bannerVisible: boolean
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  dismissBanner: () => void
}

export function useStartupGuide(principal: AuthPrincipal): StartupGuideState {
  const { records } = useVendorAccess()
  const { contracts } = useContract()
  const { varieties } = useTaskData()

  const [drawerOpen, setDrawerOpen] = useState(false)
  /** 会话级：本会话内点过「稍后再说」即不再展示欢迎卡，重登/切号后重置 */
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  const pharmaTenantId = principal.realm === "TENANT" ? principal.tenantId : ""
  const pharmaName = principal.realm === "TENANT" ? principal.tenantName : ""

  const completedSteps = useMemo(() => {
    const done: string[] = []
    if (records.some((r) => r.pharmaTenantId === pharmaTenantId)) done.push("vendor-admission")
    if (contracts.some((c) => c.pharmaTenantId === pharmaTenantId)) done.push("contract-upload")
    if (varieties.some((v) => v.holder === pharmaName)) done.push("variety-entry")
    if (isPriceConfigStarted() || PRICE_CONFIG_SEED_PHARMAS.includes(pharmaName)) done.push("price-config")
    return done.filter((id) => STARTUP_GUIDE_STEPS.some((step) => step.id === id))
  }, [records, contracts, varieties, pharmaTenantId, pharmaName])

  /* 切换账号 / 重新登录：重置会话级关闭标记并收起抽屉 */
  useEffect(() => {
    setDrawerOpen(false)
    setDismissedThisSession(false)
  }, [principal.userId])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const dismissBanner = useCallback(() => setDismissedThisSession(true), [])

  const completedCount = completedSteps.length
  const total = STARTUP_GUIDE_STEPS.length
  const allComplete = completedCount >= total

  return {
    completedSteps,
    completedCount,
    total,
    allComplete,
    bannerVisible: !dismissedThisSession && !allComplete,
    drawerOpen,
    openDrawer,
    closeDrawer,
    dismissBanner,
  }
}
