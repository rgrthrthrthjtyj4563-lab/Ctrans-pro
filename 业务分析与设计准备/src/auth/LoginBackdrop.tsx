/**
 * 登录链路共享背景装饰层：流体渐变光斑 + 噪点 + 右侧渐晕。
 * 样式定义在 loginShell.css（lg-blob / lg-noise / lg-vignette），
 * 根节点需挂 .login-shell 才能取到 lg- 变量。
 */
export function LoginBackdrop() {
  return (
    <>
      {/* 噪点滤镜定义（隐藏 SVG） */}
      <svg style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="lg-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      <div className="login-deco" aria-hidden="true">
        <div className="lg-blob lg-blob-a" />
        <div className="lg-blob lg-blob-b" />
        <div className="lg-blob lg-blob-c" />
        <div className="lg-blob lg-blob-d" />
        <div className="lg-noise" />
        <div className="lg-vignette" />
      </div>
    </>
  )
}
