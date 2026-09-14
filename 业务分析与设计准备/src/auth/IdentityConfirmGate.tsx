/**
 * 登录三步流 · 第二步：选择所属企业（原「身份确认」按参考稿重设计）。
 * 手机号/账号只验证「人」；验证通过后列出该账号名下全部有效企业身份
 * （生效授权 → 企业根 + 角色），由用户选定本次登录身份。
 * 单身份账号也走同一页（一张默认选中的卡），保持流程一致。
 * 确认只换发登录身份（免重新认证），不换业务会话数据。
 */
import { useState } from "react";
import { Check, Info, Smartphone } from "lucide-react";
import { BrandMark } from "../components/Brand";
import type { AuthSession, LoginIdentityOption } from "./authTypes";
import "./authGates.css";

const METHOD_LABEL: Record<AuthSession["method"], string> = {
  password: "账号密码",
  sms: "短信验证码",
  qr: "扫码",
};

interface IdentityConfirmGateProps {
  session: AuthSession;
  /** 返回是否成功；成功后调用方换发会话进入下一步 */
  onConfirm: (assignmentId: string) => Promise<boolean>;
  onChangeAccount: () => void;
}

function formatPhoneGrouped(digits: string): string {
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 7);
  const c = digits.slice(7, 11);
  return [a, b, c].filter(Boolean).join(" ");
}

export function IdentityConfirmGate({ session, onConfirm, onChangeAccount }: IdentityConfirmGateProps) {
  const p = session.principal;
  const options: LoginIdentityOption[] =
    session.identityOptions && session.identityOptions.length > 0
      ? session.identityOptions
      : [
          {
            assignmentId: p.assignmentId,
            enterpriseId: p.enterpriseId,
            enterpriseName: p.enterpriseName,
            enterpriseType: p.scope === "PHARMA" ? "药厂" : p.scope === "PROVIDER" ? "服务提供商" : "平台",
            roleId: p.roleId,
            roleName: p.roleName,
            scope: p.scope,
            scopeOrgId: p.scopeOrgId,
            scopeOrgName: p.scopeOrgName,
          },
        ];
  const [selectedId, setSelectedId] = useState(p.assignmentId);
  const [busy, setBusy] = useState(false);

  const methodLabel =
    session.method === "qr" && session.qrSource
      ? `${METHOD_LABEL[session.method]}（${session.qrSource === "wecom" ? "企业微信" : "微信开放平台"}）`
      : METHOD_LABEL[session.method];

  // 同一企业多条授权（如药厂销售 + 区域定制角色）时，卡面标题追加角色消歧
  const enterpriseCounts = new Map<string, number>();
  for (const o of options) {
    enterpriseCounts.set(o.enterpriseName, (enterpriseCounts.get(o.enterpriseName) ?? 0) + 1);
  }
  const cardTitle = (o: LoginIdentityOption) =>
    (enterpriseCounts.get(o.enterpriseName) ?? 0) > 1 ? `${o.enterpriseName} · ${o.roleName}` : o.enterpriseName;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(selectedId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="identity-gate">
      <div className="auth-gate-stage">
        <div className="auth-gate-brand">
          <BrandMark size={34} title="药合作系统" />
          <div>
            <div className="auth-gate-brand-name">药合作系统</div>
            <div className="auth-gate-brand-sub">登录身份确认</div>
          </div>
        </div>

        <section className="auth-gate-card">
          <div className="auth-gate-step">
            <h1 className="auth-gate-title">选择所属企业</h1>
            <p className="auth-gate-subtitle">
              {options.length > 1
                ? "该手机号关联了多个有效企业身份，请选择本次登录身份。"
                : "该账号当前有一个有效企业身份，确认后即以此身份进入。"}
            </p>
            <p className="identity-gate-verified">
              <Smartphone size={13} aria-hidden />
              {methodLabel}已验证：{p.name} · <span className="font-mono-nums">{formatPhoneGrouped(p.phone)}</span>
            </p>

            <div className="auth-gate-note auth-gate-note--brand" style={{ marginBottom: 16 }} role="note">
              <Info size={14} aria-hidden />
              <span>企业选择发生在手机号验证之后，因此登录页不需要公开展示租户名单。</span>
            </div>

            <div className="identity-gate-orglist" role="radiogroup" aria-label="选择本次登录的企业身份">
              {options.map((opt) => {
                const isSelected = selectedId === opt.assignmentId;
                return (
                  <button
                    key={opt.assignmentId}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="identity-gate-orgcard"
                    disabled={busy}
                    onClick={() => setSelectedId(opt.assignmentId)}
                  >
                    <span className="identity-gate-orgcard-head">
                      <span className="identity-gate-orgcard-name">{cardTitle(opt)}</span>
                      <span className="auth-gate-tag auth-gate-tag--ok">账号正常</span>
                    </span>
                    <span className="identity-gate-orgcard-meta">
                      企业类型：{opt.enterpriseType}
                      <br />
                      角色：{opt.roleName}
                    </span>
                    {isSelected && (
                      <span className="identity-gate-orgcard-check" aria-hidden>
                        <Check size={18} strokeWidth={2.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="auth-gate-actions">
              <div className="identity-gate-btnrow">
                <button
                  type="button"
                  className="auth-gate-btn auth-gate-btn--secondary identity-gate-btn-half"
                  disabled={busy}
                  onClick={onChangeAccount}
                >
                  使用其他手机号
                </button>
                <button
                  type="button"
                  className="auth-gate-btn auth-gate-btn--primary identity-gate-btn-confirm"
                  disabled={busy || !selectedId}
                  onClick={() => void handleConfirm()}
                >
                  {busy ? (
                    <>
                      <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                      正在进入…
                    </>
                  ) : (
                    "确认登录"
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        <p className="auth-gate-foot">原型演示 · 选择身份免重新认证，所属企业决定本次登录身份</p>
      </div>
    </div>
  );
}
