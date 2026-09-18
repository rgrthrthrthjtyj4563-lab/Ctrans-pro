/**
 * 登录三步流 · 第三步（仅服务商业务身份）：选择本次服务药厂。
 * 所属企业不随选择变化；选择的是「当前业务数据范围」（一次会话只操作一家
 * 药厂数据），不创建新账号、不重新认证。
 * - first  登录后的全屏选择页（Root 渲染）
 * - switch 工作台内免重新认证切换（AppShell 以浮层渲染）
 * 进入判定（权限模拟统一口径）：员工被授予 ∧ 合作关系生效 ∧ 药厂业务授权有效；
 * 备案类警告（warningKind）只警告不阻断——可进入但提示「暂不可开展学术拜访」。
 * 直达规则：仅当名下记录总数 = 1 且可进入时单药厂直达；记录 > 1 一律展示
 * 完整门页（可进入 + 警告 + 禁用并列），不可用原因始终可见。
 */
import { useEffect, useRef, useState } from "react";
import { Ban, Building2, Check, Clock, Info, MapPin, TriangleAlert, Users, X } from "lucide-react";
import { BrandMark } from "../components/Brand";
import { LoginBackdrop } from "./LoginBackdrop";
import "./loginShell.css";
import { Modal } from "../components/Modal";
import { enterablePharma, type ServingPharma, type TenantPrincipal } from "./authTypes";
import { ActivationCelebration } from "./ActivationCelebration";
import "./authGates.css";

export type PharmaGateMode = "first" | "switch";

interface PharmaGateProps {
  principal: TenantPrincipal;
  pharmas: ServingPharma[];
  mode: PharmaGateMode;
  /** 首登激活一次性欢迎弹框（会话携带 activationNotice 时传入；5 秒自动消失、无按钮） */
  activationNotice?: string;
  /** 返回是否成功；成功后调用方换发会话（本组件整树随之卸载） */
  onEnter: (pharmaId: string) => Promise<boolean>;
  /** first 模式：回登录页 */
  onChangeAccount?: () => void;
  /** switch 模式：关闭浮层 */
  onClose?: () => void;
}

/** 卡片状态 → 标签与用户提示（文案表口径；blockedKind 优先于 warningKind） */
function pharmaStateMeta(p: ServingPharma): {
  tag: string;
  tone: "ok" | "warn" | "block";
  tip: string;
} {
  if (p.status === "paused" || p.blockedKind === "cooperation_paused") {
    return { tag: "合作暂停", tone: "block", tip: "合作关系已暂停，暂不可进入。恢复合作由药厂控制，请联系企业管理员。" };
  }
  if (p.blockedKind === "cooperation_terminated") {
    return { tag: "合作终止", tone: "block", tip: "本服务商与该药厂的合作已终止，无法进入其业务空间。" };
  }
  if (p.blockedKind === "no_valid_variety") {
    return { tag: "业务授权撤销", tone: "block", tip: "药厂已收回本服务商在该药厂的品种授权，暂无可操作业务。请联系药厂或服务商管理员。" };
  }
  if (p.blockedKind === "no_scope") {
    return { tag: "未分配范围", tone: "block", tip: "尚未分配该药厂的服务范围，请联系服务商管理员在「角色与数据范围」中配置。" };
  }
  if (p.warningKind === "filing_pending") {
    return { tag: "备案待审核", tone: "warn", tip: "备案正在审核中，可查看通知和补充材料，暂不可开展学术拜访。" };
  }
  if (p.warningKind === "filing_rejected") {
    return { tag: "备案需补正", tone: "warn", tip: "备案材料需要补正，请查看审核意见并重新提交；暂不可开展学术拜访。" };
  }
  if (p.warningKind === "filing_expired" || p.warningKind === "filing_suspended") {
    return { tag: "备案已失效", tone: "warn", tip: "当前备案已失效，重新生效前不可开展学术拜访。" };
  }
  return { tag: "服务中", tone: "ok", tip: "" };
}

/** 三步口径步数条：企业验证 → 短信验证 → 选择服务药厂（多角色自动合并，不再选角色） */
function PharmaGateSteps() {
  const steps = ["企业验证", "短信验证", "选择服务药厂"];
  const current = 2;
  return (
    <ol className="auth-gate-steps" aria-label="登录步骤">
      {steps.map((label, i) => (
        <li
          key={label}
          className={`auth-gate-stepitem${i < current ? " auth-gate-stepitem--done" : ""}${i === current ? " auth-gate-stepitem--active" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="auth-gate-stepnum" aria-hidden>{i < current ? "✓" : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function PharmaGate({
  principal,
  pharmas,
  mode,
  activationNotice,
  onEnter,
  onChangeAccount,
  onClose,
}: PharmaGateProps) {
  // 进入判定统一走 enterablePharma（备案警告不参与）；不可用记录保留展示原因
  const enterable = pharmas.filter((p) => enterablePharma(p));
  const blocked = pharmas.filter((p) => !enterablePharma(p));
  // 直达仅当「名下记录总数 = 1 且可进入」；多条记录一律完整门页
  const isSingleDirect = pharmas.length === 1 && enterable.length === 1;
  // first 模式单药厂直达：不渲染确认按钮页，挂载即自动进入（失败回退为手动按钮）
  const autoEnter = mode === "first" && isSingleDirect;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(autoEnter);
  const [blockedTip, setBlockedTip] = useState<string | null>(null);
  const tipTimer = useRef<number | null>(null);
  const autoTriedRef = useRef(false);
  // 首登庆祝弹框：挂载期间遮住门页，5 秒自动消失（单药厂直达时门页瞬时换发、不展示）
  const [celebrationOpen, setCelebrationOpen] = useState(Boolean(activationNotice));

  useEffect(() => {
    if (!autoEnter || autoTriedRef.current) return;
    autoTriedRef.current = true;
    void doEnter(enterable[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnter]);

  useEffect(() => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    return () => {
      if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    };
  }, []);

  const selected = enterable.find((p) => p.id === selectedId) ?? null;

  const handleBlockedClick = (pharma: ServingPharma) => {
    const { tip } = pharmaStateMeta(pharma);
    setBlockedTip(`${pharma.name}：${tip}`);
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setBlockedTip(null), 4000);
  };

  const doEnter = async (pharma: ServingPharma): Promise<boolean> => {
    setBusy(true);
    try {
      return await onEnter(pharma.id);
    } finally {
      setBusy(false);
    }
  };

  const tagClass = (tone: "ok" | "warn" | "block") =>
    tone === "ok" ? "auth-gate-tag auth-gate-tag--ok" : tone === "warn" ? "auth-gate-tag auth-gate-tag--warn" : "auth-gate-tag auth-gate-tag--block";

  return (
    <div className="pharma-gate login-shell">
      <LoginBackdrop />
      <div className="auth-gate-stage">
        {mode === "first" ? (
          <div className="auth-gate-brand">
            <BrandMark size={36} title="药合作" />
            <div>
              <div className="auth-gate-brand-name">药合作</div>
              <div className="auth-gate-brand-sub">营销协同管理系统</div>
            </div>
          </div>
        ) : (
          <div className="pharma-gate-switchhead">
            <span className="auth-gate-brand-sub">免重新认证 · 切换后业务数据按所选药厂重置</span>
            {onClose && (
              <button type="button" className="pharma-gate-close" onClick={onClose} aria-label="关闭切换服务药厂">
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        )}

        <section className="auth-gate-card" aria-label="选择服务药厂">
          <div className="auth-gate-step">
            {mode === "first" && <PharmaGateSteps />}
            <h1 className="auth-gate-title">
              {mode === "switch" ? "切换服务药厂" : "选择服务药厂"}
            </h1>
            <p className="auth-gate-subtitle">
              {enterable.length === 0
                ? "名下存在服务药厂记录，但当前全部不可进入。"
                : isSingleDirect
                  ? autoEnter
                    ? "你当前只有一个有效服务药厂，正在自动进入。"
                    : "你当前只有一个有效服务药厂，确认后即可进入。"
                  : mode === "switch"
                    ? "切换立即生效，无需重新验证手机号。"
                    : "你同时参与多家药厂的服务工作。请选择本次要进入的业务空间。"}
            </p>

            <div className="pharma-gate-idcard">
              <dl style={{ margin: 0 }}>
                <div className="pharma-gate-idrow">
                  <dt>所属企业</dt>
                  <dd>{principal.tenantName}</dd>
                </div>
                <div className="pharma-gate-idrow">
                  <dt>当前身份</dt>
                  <dd>
                    {principal.name} · {principal.roleNames.join(" + ")}
                  </dd>
                </div>
              </dl>
              <div className="auth-gate-note auth-gate-note--brand" style={{ marginTop: 10 }} role="note">
                <Info size={14} aria-hidden />
                <span>
                  你的账号和人员档案仍属于{principal.tenantName}。
                  这里选择的是本次处理业务的药厂，不会创建新的登录账号。
                </span>
              </div>
            </div>

            {enterable.length === 0 ? (
              <>
                {/* 空态：全部不可用仍完成认证进门页，不可用原因清单可见 */}
                <div className="pharma-gate-empty">
                  <div className="pharma-gate-empty-icon" aria-hidden>
                    <Ban size={20} />
                  </div>
                  <div className="pharma-gate-empty-title">当前没有可进入的服务药厂</div>
                  <p className="pharma-gate-empty-sub">
                    可查看通知和补充材料；恢复授权前暂时无法进入任何药厂业务空间。如有疑问请联系企业管理员。
                  </p>
                  <div className="pharma-gate-empty-list" aria-label="不可用药厂清单">
                    {blocked.map((p) => {
                      const meta = pharmaStateMeta(p);
                      return (
                        <div key={p.id} className="pharma-gate-empty-row">
                          <span className="pharma-gate-empty-name">{p.name}</span>
                          <span className={tagClass(meta.tone)}>{meta.tag}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="auth-gate-actions">
                  {mode === "first" && onChangeAccount && (
                    <button type="button" className="auth-gate-btn auth-gate-btn--secondary auth-gate-btn--block" onClick={onChangeAccount}>
                      更换账号
                    </button>
                  )}
                  {mode === "switch" && onClose && (
                    <button type="button" className="auth-gate-btn auth-gate-btn--secondary auth-gate-btn--block" onClick={onClose}>
                      返回工作台
                    </button>
                  )}
                </div>
              </>
            ) : isSingleDirect ? (
              <>
                <div className="pharma-gate-solo">
                  <p className="pharma-gate-solo-label">当前服务药厂</p>
                  <div className="pharma-gate-solo-value">
                    {enterable[0].name}
                    <span className="auth-gate-tag auth-gate-tag--ok">服务中</span>
                  </div>
                </div>
                <div className="auth-gate-actions">
                  {autoEnter && busy ? (
                    <div className="pharma-gate-auto" role="status" aria-live="polite">
                      <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                      正在进入{enterable[0].name}…
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="auth-gate-btn auth-gate-btn--primary auth-gate-btn--block"
                      disabled={busy}
                      onClick={() => void doEnter(enterable[0])}
                    >
                      {busy ? (
                        <>
                          <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                          正在进入{enterable[0].name}…
                        </>
                      ) : (
                        `进入${enterable[0].name}`
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="pharma-gate-list" role="radiogroup" aria-label="选择本次进入的服务药厂">
                  {enterable.map((pharma) => {
                    const isSelected = selectedId === pharma.id;
                    const isCurrent = principal.currentPharmaTenantId === pharma.id;
                    const meta = pharmaStateMeta(pharma);
                    return (
                      <button
                        key={pharma.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className="pharma-gate-card-item"
                        disabled={busy}
                        onClick={() => setSelectedId(pharma.id)}
                      >
                        <span className="pharma-gate-radio" aria-hidden>
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <span className="pharma-gate-card-body">
                          <span className="pharma-gate-card-head">
                            <span className="pharma-gate-card-name">{pharma.name}</span>
                            <span className={tagClass(meta.tone)}>
                              {meta.tone === "warn" && <TriangleAlert size={11} aria-hidden />}
                              {meta.tag}
                            </span>
                            {isCurrent && <span className="auth-gate-tag auth-gate-tag--brand">当前所在</span>}
                          </span>
                          <span className="pharma-gate-card-meta">
                            {pharma.workGroup && (
                              <span>
                                <Users size={13} aria-hidden />
                                工作组：{pharma.workGroup}
                              </span>
                            )}
                            {pharma.regions && (
                              <span>
                                <MapPin size={13} aria-hidden />
                                服务区域：{pharma.regions}
                              </span>
                            )}
                            {pharma.lastUsedAt && (
                              <span>
                                <Clock size={13} aria-hidden />
                                最近使用：<span className="font-mono-nums">{pharma.lastUsedAt}</span>
                              </span>
                            )}
                            {meta.tone === "warn" && (
                              <span className="pharma-gate-card-warn">
                                <TriangleAlert size={13} aria-hidden />
                                {meta.tip}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  {blocked.map((pharma) => {
                    const meta = pharmaStateMeta(pharma);
                    return (
                      <button
                        key={pharma.id}
                        type="button"
                        className="pharma-gate-card-item pharma-gate-card-item--paused"
                        aria-disabled="true"
                        onClick={() => handleBlockedClick(pharma)}
                      >
                        <span className="pharma-gate-pausedicon" aria-hidden>
                          <Ban size={12} />
                        </span>
                        <span className="pharma-gate-card-body">
                          <span className="pharma-gate-card-head">
                            <span className="pharma-gate-card-name">{pharma.name}</span>
                            <span className={tagClass(meta.tone)}>{meta.tag}</span>
                          </span>
                          <span className="pharma-gate-card-meta">
                            <span>{meta.tip}</span>
                            {pharma.pausedAt && (
                              <span>
                                暂停时间：<span className="font-mono-nums">{pharma.pausedAt}</span>
                              </span>
                            )}
                            {pharma.pausedReason && <span>说明：{pharma.pausedReason}</span>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {blockedTip && (
                  <div className="auth-gate-note auth-gate-note--warn" style={{ marginTop: 10 }} role="alert">
                    <Ban size={14} aria-hidden />
                    <span>{blockedTip}</span>
                  </div>
                )}

                <div className="auth-gate-actions">
                  <div className="auth-gate-note auth-gate-note--info" role="note">
                    <Info size={14} aria-hidden />
                    <span>进入后，任务和业务数据仅显示所选药厂范围。</span>
                  </div>
                  <button
                    type="button"
                    className="auth-gate-btn auth-gate-btn--primary auth-gate-btn--block"
                    disabled={!selected || busy}
                    onClick={() => selected && setConfirmOpen(true)}
                  >
                    {busy ? (
                      <>
                        <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                        正在进入{selected?.name}…
                      </>
                    ) : selected ? (
                      `进入${selected.name}`
                    ) : (
                      "请选择本次进入的服务药厂"
                    )}
                  </button>
                  {mode === "first" && onChangeAccount && (
                    <button type="button" className="auth-gate-linkbtn" onClick={onChangeAccount}>
                      更换账号
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <p className="auth-gate-foot">原型演示 · 选择药厂换发会话，所属企业与人员身份保持不变</p>
      </div>

      {/* 首登激活庆祝弹框：无按钮、不可关闭，5 秒自动淡出（activationNotice 随选厂换发丢弃，不重复弹） */}
      {mode === "first" && activationNotice && celebrationOpen && !autoEnter && (
        <ActivationCelebration
          name={principal.name}
          roleName={principal.roleNames.join(" + ")}
          orgName={principal.tenantName}
          pharmaCount={pharmas.length}
          onDone={() => setCelebrationOpen(false)}
        />
      )}

      {confirmOpen && selected && (
        <Modal open title={`确认进入${selected.name}？`} onClose={() => setConfirmOpen(false)} width={440}>
          <dl className="pharma-gate-dialog-grid">
            <dt>登录用户</dt>
            <dd>{principal.name}</dd>
            <dt>所属企业</dt>
            <dd>{principal.tenantName}</dd>
            <dt>当前身份</dt>
            <dd>{principal.roleNames.join(" + ")}</dd>
            <dt>服务药厂</dt>
            <dd>{selected.name}</dd>
            <dt>数据范围</dt>
            <dd>仅{selected.name}相关业务</dd>
          </dl>
          {pharmaStateMeta(selected).tone === "warn" && (
            <div className="auth-gate-note auth-gate-note--warn" style={{ marginTop: 14 }} role="note">
              <TriangleAlert size={14} aria-hidden />
              <span>{pharmaStateMeta(selected).tip}</span>
            </div>
          )}
          <div className="auth-gate-note auth-gate-note--info" style={{ marginTop: 14 }} role="note">
            <Info size={14} aria-hidden />
            <span>进入后可切换其他已授权药厂，无需重新验证身份。</span>
          </div>
          <div className="pharma-gate-dialog-footer">
            <button type="button" className="auth-gate-btn auth-gate-btn--secondary" onClick={() => setConfirmOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="auth-gate-btn auth-gate-btn--primary"
              onClick={() => {
                setConfirmOpen(false);
                void doEnter(selected);
              }}
            >
              确认进入
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
