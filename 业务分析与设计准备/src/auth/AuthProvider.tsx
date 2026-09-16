/**
 * 认证会话上下文：会话主体仍在内存；「记住默认登录」启用时，挂载阶段尝试
 * 从本设备受保护记录免验证码恢复（校验失败即撤销并回退标准登录，FR-03/08）。
 * 登出销毁整个会话并撤销默认登录（业务壳随之卸载）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { authGateway } from "./mockGateway"
import type { AuthSession } from "./authTypes"

/** restoring=启动恢复中（渲染启动态，避免闪登录页）；done=无记录/成功/失败 */
export type RestoreState = "restoring" | "done"

interface AuthContextValue {
  session: AuthSession | null
  setSession: (session: AuthSession) => void
  /** 统一登出：通知网关记录登出审计并销毁内存会话（同时撤销本设备默认登录） */
  signOut: () => Promise<void>
  /** 默认登录恢复状态（仅启动阶段有意义） */
  restoreState: RestoreState
  /** 恢复失败回退标准登录的一次性提示（登录页展示，可关闭） */
  restoreNotice: string | null
  dismissRestoreNotice: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [restoreState, setRestoreState] = useState<RestoreState>("restoring")
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)

  // 启动恢复：网关按页面加载缓存一次结果，StrictMode 双挂载不会重复恢复/审计
  useEffect(() => {
    let alive = true
    void (async () => {
      const result = await authGateway.restoreDefaultLogin()
      if (!alive) return
      if (result.ok) setSession(result.session)
      else if (result.notice) setRestoreNotice(result.notice)
      setRestoreState("done")
    })()
    return () => {
      alive = false
    }
  }, [])

  const signOut = useCallback(async () => {
    if (session) await authGateway.logout(session)
    setSession(null)
  }, [session])

  const dismissRestoreNotice = useCallback(() => setRestoreNotice(null), [])

  const value = useMemo(
    () => ({ session, setSession, signOut, restoreState, restoreNotice, dismissRestoreNotice }),
    [session, signOut, restoreState, restoreNotice, dismissRestoreNotice],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
