/**
 * 认证会话上下文：登录态只存在于当前页面内存，
 * 刷新即重新登录；登出销毁整个会话（业务壳随之卸载）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { authGateway } from "./mockGateway"
import type { AuthSession } from "./authTypes"

interface AuthContextValue {
  session: AuthSession | null
  setSession: (session: AuthSession) => void
  /** 统一登出：通知网关记录登出审计并销毁内存会话 */
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)

  const signOut = useCallback(async () => {
    if (session) await authGateway.logout(session)
    setSession(null)
  }, [session])

  const value = useMemo(
    () => ({ session, setSession, signOut }),
    [session, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
