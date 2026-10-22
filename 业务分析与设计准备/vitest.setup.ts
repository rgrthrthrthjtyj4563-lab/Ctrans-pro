/**
 * vitest 环境垫片：数据层 store（cooperationModel / tenantRegistry / VendorAccessContext 数据形态）
 * 在模块加载时读取 window.localStorage——node 环境无 window 时提供最小内存实现，
 * 使纯数据逻辑可在无浏览器环境下测试。
 */
if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  const mem = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}
