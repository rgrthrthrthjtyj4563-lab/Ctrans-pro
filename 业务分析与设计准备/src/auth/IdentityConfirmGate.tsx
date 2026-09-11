/**
 * 登录三步流 · 第二步：身份确认页。
 * 三种登录方式（密码/短信/扫码）认证通过后统一停留在此页：
 * 账号验证的是「人」，所属企业与角色由系统授权确定，用户确认后再进入下一步
 * （服务专员 → 选择服务药厂；其余角色 → 直接进入工作台）。
 * 确认就地更新会话标记（identityConfirmed），不换发会话、不重置数据。
 */
import { Building2, CheckCircle, Info, Smartphone } from "lucide-react";
import { BrandMark } from "../components/Brand";
import { PLATFORM_ROLE_IDS } from "./authProfiles";
import type { AuthSession } from "./authTypes";
import "./authGates.css";

const METHOD_LABEL: Record<AuthSession["method"], string> = {
  password: "账号密码",
  sms: "短信验证码",
  qr: "扫码",
};

interface IdentityConfirmGateProps {
  session: AuthSession;
  onConfirm: () => void;
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
  const isSpecialist = p.roleName === "服务专员";
  const isProviderAdmin = p.roleName === "服务商管理员";
  const isPlatform = PLATFORM_ROLE_IDS.has(p.roleId);
  const methodLabel =
    session.method === "qr" && session.qrSource
      ? `${METHOD_LABEL[session.method]}（${session.qrSource === "wecom" ? "企业微信" : "微信开放平台"}）`
      : METHOD_LABEL[session.method];

  const note = isSpecialist
    ? `你的人员身份属于${p.enterpriseName}。继续后请选择本次需要处理业务的服务药厂。`
    : isProviderAdmin
      ? `${methodLabel}用于验证本人身份，所属企业和角色由系统授权确定。服务商管理员登录后可查看本服务商整体范围，无需先选择药厂。`
      : `${methodLabel}验证本人身份，所属企业和角色由系统授权确定，确认后进入对应工作台。`;

  const primaryLabel = isSpecialist ? "继续选择服务药厂" : isPlatform ? "进入平台管理工作台" : `进入${p.enterpriseName}工作空间`;

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
            <span className="auth-gate-eyebrow">
              <CheckCircle size={13} aria-hidden />
              {methodLabel}验证通过 · 身份确认
            </span>

            <div className="auth-gate-idblock">
              <div className="auth-gate-avatar" aria-hidden>
                {p.name.slice(0, 1)}
              </div>
              <div>
                <div className="auth-gate-idname">{p.name}</div>
                <div className="auth-gate-idmeta">
                  <span>
                    <Building2 size={14} aria-hidden />
                    {p.enterpriseName}
                  </span>
                  <span className="auth-gate-tag auth-gate-tag--brand">{p.roleName}</span>
                </div>
                <div className="auth-gate-idmeta">
                  <span>
                    <Smartphone size={14} aria-hidden />
                    <span className="font-mono-nums">{formatPhoneGrouped(p.phone)}</span>
                    已验证
                  </span>
                </div>
              </div>
            </div>

            <div className="auth-gate-note auth-gate-note--info">
              <Info size={14} aria-hidden />
              <span>{note}</span>
            </div>

            <div className="auth-gate-actions">
              <button type="button" className="auth-gate-btn auth-gate-btn--primary auth-gate-btn--block" onClick={onConfirm}>
                {primaryLabel}
              </button>
              <button type="button" className="auth-gate-linkbtn" onClick={onChangeAccount}>
                更换账号
              </button>
            </div>
          </div>
        </section>

        <p className="auth-gate-foot">原型演示 · 身份确认只更新会话标记，不重新认证</p>
      </div>
    </div>
  );
}
