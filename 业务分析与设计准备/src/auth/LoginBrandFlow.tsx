/**
 * 登录页协作主视觉。素材使用透明底，页面原有 LoginBackdrop 透过空白处持续流动。
 */
import collaborationFlow from "./assets/login-collaboration-flow.png"
import "./LoginBrandFlow.css"

/** 主视觉之外的低对比度流线，延伸到整个登录画布。 */
export function LoginFlowCanvas() {
  return (
    <svg
      className="lbf-canvas"
      viewBox="0 0 1440 800"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="lbf-page-wash" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A9CBFF" stopOpacity="0" />
          <stop offset="0.24" stopColor="#A9CBFF" stopOpacity="0.3" />
          <stop offset="0.54" stopColor="#A0D7F4" stopOpacity="0.38" />
          <stop offset="0.75" stopColor="#9DE5D4" stopOpacity="0.25" />
          <stop offset="1" stopColor="#9DE5D4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lbf-page-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#78AFF2" stopOpacity="0" />
          <stop offset="0.32" stopColor="#78AFF2" stopOpacity="0.27" />
          <stop offset="0.6" stopColor="#6FBDEE" stopOpacity="0.37" />
          <stop offset="0.82" stopColor="#6ECFC2" stopOpacity="0.26" />
          <stop offset="1" stopColor="#6ECFC2" stopOpacity="0" />
        </linearGradient>
        <filter id="lbf-page-blur" x="-30%" y="-120%" width="160%" height="340%">
          <feGaussianBlur stdDeviation="27" />
        </filter>
      </defs>
      <path
        d="M-200 631 C91 660 221 562 348 531 C479 500 554 599 688 489 C782 412 854 396 953 392 C1146 386 1324 257 1630 86"
        fill="none"
        stroke="url(#lbf-page-wash)"
        strokeWidth="150"
        filter="url(#lbf-page-blur)"
      />
      <path
        d="M-200 631 C91 660 221 562 348 531 C479 500 554 599 688 489 C782 412 854 396 953 392 C1146 386 1324 257 1630 86"
        fill="none"
        stroke="url(#lbf-page-line)"
        strokeWidth="1.5"
      />
      <path
        className="lbf-canvas-current"
        d="M-200 631 C91 660 221 562 348 531 C479 500 554 599 688 489 C782 412 854 396 953 392 C1146 386 1324 257 1630 86"
        fill="none"
        stroke="#A6E8DC"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LoginBrandFlow() {
  return (
    <div className="lbf-scene" aria-hidden="true">
      <img
        className="lbf-art"
        src={collaborationFlow}
        alt=""
        loading="eager"
        decoding="async"
      />
      <svg className="lbf-motion" viewBox="0 0 1513 1040" focusable="false">
        <defs>
          <linearGradient id="lbf-light" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#99C9FF" />
            <stop offset="0.55" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#8DE9D6" />
          </linearGradient>
          <filter id="lbf-glow">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <path
          className="lbf-flow-glow"
          d="M-70 637 C95 730 219 820 335 813 C513 806 651 699 779 576 C908 451 1050 479 1214 489 C1362 495 1464 310 1565 89"
          fill="none"
          stroke="url(#lbf-light)"
          strokeWidth="18"
          strokeLinecap="round"
          filter="url(#lbf-glow)"
        />
        <path
          className="lbf-flow-light"
          d="M-70 637 C95 730 219 820 335 813 C513 806 651 699 779 576 C908 451 1050 479 1214 489 C1362 495 1464 310 1565 89"
          fill="none"
          stroke="url(#lbf-light)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
