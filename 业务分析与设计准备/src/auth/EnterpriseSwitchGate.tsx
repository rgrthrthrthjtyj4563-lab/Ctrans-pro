/**
 * 切换企业门页（工作台内以全屏浮层渲染）：免重新验证码切换到另一家已激活
 * 且有效的企业工作空间（需求 §3.3 / FR-04~07）。仅列出 listSwitchableEnterprises
 * 给出的有效企业；当前企业标记但不可选。成功后由调用方换发会话——session.id
 * 变化使业务树整树重建，菜单、角色与数据范围按目标企业重载（FR-06）；
 * 目标企业多角色自动合并进同一会话、服务商业务身份附带选药厂门页（Root 衔接）。
 * 演示口径（AC-08，需求 §9 待业务确认最终清单）：目标企业内含企业管理员/
 * 服务商管理员等敏感身份时，切换前须短信重新认证（演示码与登录一致 123456）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Building2, Check, Info, ShieldAlert, X } from "lucide-react";
import { LoginBackdrop } from "./LoginBackdrop";
import { Modal } from "../components/Modal";
import { authGateway } from "./mockGateway";
import type { AuthPrincipal, SwitchableEnterprise } from "./authTypes";
import "./loginShell.css";
import "./authGates.css";

const REAUTH_RESEND_SECONDS = 60;

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
}

function tenantKindLabel(kind: SwitchableEnterprise["tenantKind"]): string {
  return kind === "provider" ? "服务商企业" : "药厂企业";
}

interface EnterpriseSwitchGateProps {
  enterprises: SwitchableEnterprise[];
  principal: AuthPrincipal;
  /** 返回是否成功；成功后调用方换发会话（本组件随业务树卸载） */
  onSelect: (targetWorkspaceId: string) => Promise<boolean>;
  /** 关闭浮层（取消切换，留在当前企业） */
  onClose: () => void;
}

export function EnterpriseSwitchGate({
  enterprises,
  principal,
  onSelect,
  onClose,
}: EnterpriseSwitchGateProps) {
  const current = enterprises.find((e) => e.isCurrent) ?? null;
  const others = enterprises.filter((e) => !e.isCurrent);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = others.find((e) => e.workspaceId === selectedId) ?? null;

  // ── 敏感目标：切换前短信重新认证（AC-08 演示口径） ──
  const [reauthTarget, setReauthTarget] = useState<SwitchableEnterprise | null>(null);
  const [reauthCode, setReauthCode] = useState("");
  const [reauthDevCode, setReauthDevCode] = useState<string | null>(null);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthSending, setReauthSending] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const reauthSeq = useRef(0);
  const sentForRef = useRef<string | null>(null);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = window.setInterval(() => setResendLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendLeft]);

  const sendReauthCode = useCallback(async (target: SwitchableEnterprise) => {
    const seq = ++reauthSeq.current;
    setReauthSending(true);
    setReauthError(null);
    const result = await authGateway.requestSms({
      enterpriseId: target.workspaceId,
      phone: principal.phone,
    });
    if (seq !== reauthSeq.current) return;
    setReauthSending(false);
    if (!result.ok) {
      setReauthError(result.failure.message);
      return;
    }
    setReauthDevCode(result.devCode);
    setResendLeft(REAUTH_RESEND_SECONDS);
    setReauthCode("");
  }, [principal.phone]);

  // 打开重认证弹窗即发送验证码（同一目标只自动发送一次，重发走按钮）
  useEffect(() => {
    if (!reauthTarget || sentForRef.current === reauthTarget.workspaceId) return;
    sentForRef.current = reauthTarget.workspaceId;
    void sendReauthCode(reauthTarget);
  }, [reauthTarget, sendReauthCode]);

  const closeReauth = () => {
    reauthSeq.current += 1;
    setReauthTarget(null);
    setReauthCode("");
    setReauthDevCode(null);
    setReauthError(null);
    setResendLeft(0);
  };

  const doSwitch = async (target: SwitchableEnterprise): Promise<boolean> => {
    setBusy(true);
    try {
      return await onSelect(target.workspaceId);
    } finally {
      setBusy(false);
    }
  };

  const handleEnter = () => {
    if (!selected) return;
    if (selected.requiresReauth) {
      setReauthTarget(selected);
      return;
    }
    void doSwitch(selected);
  };

  const submitReauth = async () => {
    if (!reauthTarget || reauthBusy) return;
    if (!reauthDevCode) {
      setReauthError("请先获取短信验证码");
      return;
    }
    if (reauthCode.length < 6) {
      setReauthError("请输入完整的 6 位验证码");
      return;
    }
    setReauthBusy(true);
    setReauthError(null);
    const result = await authGateway.verifyReauthCode({
      enterpriseId: reauthTarget.workspaceId,
      phone: principal.phone,
      code: reauthCode,
    });
    setReauthBusy(false);
    if (!result.ok) {
      setReauthError(result.failure.message);
      return;
    }
    const target = reauthTarget;
    closeReauth();
    await doSwitch(target);
  };

  return (
    <div className="pharma-gate login-shell">
      <LoginBackdrop />
      <div className="auth-gate-stage">
        <div className="pharma-gate-switchhead">
          <span className="auth-gate-brand-sub">免重新认证 · 切换后按目标企业重新加载菜单、角色与数据范围</span>
          <button type="button" className="pharma-gate-close" onClick={onClose} aria-label="关闭切换企业">
            <X size={16} aria-hidden />
          </button>
        </div>

        <section className="auth-gate-card" aria-label="切换企业">
          <div className="auth-gate-step">
            <h1 className="auth-gate-title">切换企业</h1>
            <p className="auth-gate-subtitle">
              选择要进入的企业工作空间，无需重新输入验证码；{current ? `当前在 ${current.tenantName}。` : ""}
            </p>

            <div className="pharma-gate-idcard">
              <dl style={{ margin: 0 }}>
                <div className="pharma-gate-idrow">
                  <dt>登录用户</dt>
                  <dd>
                    {principal.name} · <span className="font-mono-nums">{maskPhone(principal.phone)}</span>
                  </dd>
                </div>
                <div className="pharma-gate-idrow">
                  <dt>当前身份</dt>
                  <dd>
                    {principal.realm === "PLATFORM"
                      ? principal.platformRoleName
                      : `${principal.roleNames.join(" + ")} · ${principal.tenantName}`}
                  </dd>
                </div>
              </dl>
              <div className="auth-gate-note auth-gate-note--brand" style={{ marginTop: 10 }} role="note">
                <Info size={14} aria-hidden />
                <span>
                  账号与人员档案保持不变，切换的是企业工作空间；只有你已激活且当前有效的企业会出现在列表中。
                </span>
              </div>
            </div>

            {others.length === 0 ? (
              <div className="pharma-gate-empty">
                <div className="pharma-gate-empty-icon" aria-hidden>
                  <Building2 size={20} />
                </div>
                <div className="pharma-gate-empty-title">暂无其他可切换的企业</div>
                <p className="pharma-gate-empty-sub">
                  如需加入新企业，请联系该企业管理员为你开通成员身份。
                </p>
              </div>
            ) : (
              <div className="pharma-gate-list" role="radiogroup" aria-label="选择要进入的企业">
                {current && (
                  <div className="pharma-gate-card-item pharma-gate-card-item--paused" aria-disabled="true">
                    <span className="pharma-gate-pausedicon" aria-hidden>
                      <Check size={12} />
                    </span>
                    <span className="pharma-gate-card-body">
                      <span className="pharma-gate-card-head">
                        <span className="pharma-gate-card-name">{current.tenantName}</span>
                        <span className="auth-gate-tag auth-gate-tag--brand">当前企业</span>
                      </span>
                      <span className="pharma-gate-card-meta">
                        <span>{current.roleSummary}</span>
                        <span>{tenantKindLabel(current.tenantKind)}</span>
                      </span>
                    </span>
                  </div>
                )}
                {others.map((ent) => {
                  const isSelected = selectedId === ent.workspaceId;
                  return (
                    <button
                      key={ent.workspaceId}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className="pharma-gate-card-item"
                      disabled={busy}
                      onClick={() => setSelectedId(ent.workspaceId)}
                    >
                      <span className="pharma-gate-radio" aria-hidden>
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span className="pharma-gate-card-body">
                        <span className="pharma-gate-card-head">
                          <span className="pharma-gate-card-name">{ent.tenantName}</span>
                          {ent.requiresReauth && (
                            <span className="auth-gate-tag auth-gate-tag--warn">
                              <ShieldAlert size={11} aria-hidden />
                              需重新认证
                            </span>
                          )}
                          {ent.identityCount > 1 && (
                            <span className="auth-gate-tag auth-gate-tag--ok">{ent.identityCount} 个角色自动合并</span>
                          )}
                        </span>
                        <span className="pharma-gate-card-meta">
                          <span>
                            <Building2 size={13} aria-hidden />
                            {ent.roleSummary}
                          </span>
                          <span>{tenantKindLabel(ent.tenantKind)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="auth-gate-actions">
              <div className="auth-gate-note auth-gate-note--info" role="note">
                <Info size={14} aria-hidden />
                <span>进入后菜单、角色、数据范围与服务药企范围按目标企业重新加载；成功切换将更新默认企业（如已启用默认登录）。</span>
              </div>
              <button
                type="button"
                className="auth-gate-btn auth-gate-btn--primary auth-gate-btn--block"
                disabled={!selected || busy}
                onClick={handleEnter}
              >
                {busy ? (
                  <>
                    <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                    正在切换至{selected?.tenantName}…
                  </>
                ) : selected ? (
                  <>
                    进入{selected.tenantName}
                    <ArrowLeftRight size={15} strokeWidth={2.5} aria-hidden />
                  </>
                ) : (
                  "请选择要进入的企业"
                )}
              </button>
              <button type="button" className="auth-gate-linkbtn" onClick={onClose}>
                返回工作台
              </button>
            </div>
          </div>
        </section>

        <p className="auth-gate-foot">原型演示 · 切换企业换发会话，账号与人员档案保持不变</p>
      </div>

      {reauthTarget && (
        <Modal open title="切换企业 · 短信重新认证" onClose={closeReauth} width={440}>
          <div className="auth-gate-note auth-gate-note--warn" style={{ marginTop: 0 }} role="note">
            <ShieldAlert size={14} aria-hidden />
            <span>
              进入「{reauthTarget.tenantName}」涉及企业管理员等敏感权限，按安全策略须重新验证本机手机号后完成切换（演示口径，敏感清单待业务确认）。
            </span>
          </div>
          <dl className="pharma-gate-dialog-grid">
            <dt>登录用户</dt>
            <dd>{principal.name}（{maskPhone(principal.phone)}）</dd>
            <dt>目标企业</dt>
            <dd>{reauthTarget.tenantName}</dd>
            <dt>进入身份</dt>
            <dd>{reauthTarget.roleSummary}</dd>
          </dl>
          <div style={{ marginTop: 14 }}>
            <span className="lg-label" style={{ display: "block", marginBottom: 7 }}>
              短信验证码
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                className="lg-field font-mono-nums"
                inputMode="numeric"
                maxLength={6}
                value={reauthCode}
                disabled={!reauthDevCode}
                onChange={(e) => setReauthCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitReauth();
                }}
                placeholder="6 位验证码"
                aria-label="重新认证验证码"
                style={{ flex: 1, minWidth: 0, letterSpacing: "0.14em", fontWeight: 700 }}
              />
              <button
                type="button"
                onClick={() => void sendReauthCode(reauthTarget)}
                disabled={reauthSending || resendLeft > 0}
                style={{
                  flexShrink: 0,
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(25,197,154,0.3)",
                  background: "rgba(25,197,154,0.06)",
                  color: resendLeft > 0 ? "rgba(26,43,66,0.3)" : "#0D9B7A",
                  fontSize: "var(--fs-13)",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: reauthSending || resendLeft > 0 ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {resendLeft > 0 ? `重新发送 ${resendLeft}s` : reauthSending ? "发送中…" : reauthDevCode ? "重新发送" : "发送验证码"}
              </button>
            </div>
            {reauthDevCode && (
              <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.38)", marginTop: 7 }}>
                演示环境不发送真实短信，本企业成员验证码固定为 <span className="font-mono-nums" style={{ fontWeight: 800, color: "#0D9B7A" }}>123456</span>
              </div>
            )}
            {reauthError && (
              <div className="lg-error-pill" style={{ marginTop: 8, fontSize: "var(--fs-13)" }}>
                <ShieldAlert size={14} aria-hidden />
                {reauthError}
              </div>
            )}
          </div>
          <div className="pharma-gate-dialog-footer">
            <button type="button" className="auth-gate-btn auth-gate-btn--secondary" onClick={closeReauth}>
              取消
            </button>
            <button
              type="button"
              className="auth-gate-btn auth-gate-btn--primary"
              disabled={reauthBusy || reauthCode.length < 6}
              onClick={() => void submitReauth()}
            >
              {reauthBusy ? "正在切换…" : "验证并切换"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
