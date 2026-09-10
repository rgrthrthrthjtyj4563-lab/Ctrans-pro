import { useEffect, useRef, useState } from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"

/**
 * 演示场景：完整移动端
 * 以 iframe 加载 public/mobile-app 下的移动端原型构建产物
 * （执行提示词/ 目录 `pnpm build:embed` 生成），与「医药代表移动端」
 * 场景同层级、同交互（顶条 + 返回后台）。
 */
export function FullMobileDemo({ onExit }: { onExit: () => void }) {
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // 探测演示包是否已生成，未生成时给出可操作的引导而不是白屏
  useEffect(() => {
    let cancelled = false
    fetch("/mobile-app/index.html", { method: "GET", cache: "no-store" })
      .then((res) => {
        if (!cancelled) setMissing(!res.ok)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#E8EEEC",
      }}
    >
      <header
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#176B5B",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: "#667085" }}>演示场景：</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>
            完整移动端
          </span>
          <span
            style={{
              fontSize: "var(--fs-11)",
              color: "#9CA3AF",
              marginLeft: 10,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title="移动端原型改动后，在 执行提示词/ 目录执行 pnpm build:embed 即可更新本演示"
          >
            药厂 · 服务商 · 服务专员三身份任务链 · 内容源 public/mobile-app（执行提示词 pnpm build:embed 更新）
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="重新加载演示"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              color: "#4B5563",
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 36,
              padding: "0 12px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
              color: "#176B5B",
              background: "#E8F4F1",
              border: "1px solid #B7E0D4",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} /> 返回后台
          </button>
        </div>
      </header>

      {missing ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "28px 28px 24px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1F2937", marginBottom: 8 }}>
              移动端演示包尚未生成
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#4B5563", marginBottom: 16 }}>
              完整移动端演示由 <b>执行提示词/</b> 项目构建而来，请先执行一次构建：
            </p>
            <code
              style={{
                display: "block",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                color: "#0E4A3E",
                background: "#E8F4F1",
                border: "1px solid #B7E0D4",
                borderRadius: 6,
                padding: "10px 12px",
                marginBottom: 16,
                wordBreak: "break-all",
              }}
            >
              cd 执行提示词 && pnpm build:embed
            </code>
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#6B7280" }}>
              构建产物会输出到本后台 <b>public/mobile-app/</b>，之后从后台即可随时打开。
              移动端原型有改动时，重新执行同一条命令即可更新。
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                marginTop: 18,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 36,
                padding: "0 14px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
                color: "#176B5B",
                background: "#E8F4F1",
                border: "1px solid #B7E0D4",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} /> 构建完成后重试
            </button>
          </div>
        </div>
      ) : (
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src="/mobile-app/index.html"
          title="完整移动端演示"
          onLoad={() => setReady(true)}
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "#0E1512",
            opacity: ready ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        />
      )}
    </div>
  )
}
