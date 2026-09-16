/**
 * 登录三步流 · 第二步：角色确认（权限域分离版）。
 * 工作空间编码在第 1 步确定认证域：平台编码 → 平台工作空间（显示「当前工作空间：
 * 药合作平台」，不显示「认证企业」）；企业编码 → 租户工作空间（显示当前企业，
 * 卡片仅展示角色身份与授权状态两字段，极简口径 2026-09-16）。
 * 同一角色存在多条有效授权时只显示一条并合并展示可管理范围。
 * 单角色由网关直签 identityConfirmed，不经过本页；双企业身份回登录页换编码。
 * 确认只换发登录身份（免重新认证），不换业务会话数据。
 */
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { BrandMark } from "../components/Brand";
import { LoginBackdrop } from "./LoginBackdrop";
import "./loginShell.css";
import type { AuthPrincipal, AuthSession, LoginIdentityOption } from "./authTypes";
import { PLATFORM_WORKSPACE_NAME } from "./authTypes";
import "./authGates.css";

const METHOD_LABEL: Record<AuthSession["method"], string> = {
  password: "账号密码",
  sms: "短信验证码",
  qr: "扫码",
}

/** 身份信息脱敏（已认证手机号只显示脱敏号码） */
function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

interface IdentityConfirmGateProps {
  session: AuthSession;
  /** 按角色选定本次身份（同角色多授权合并生效）；返回是否成功 */
  onConfirm: (roleId: string) => Promise<boolean>;
  onChangeAccount: () => void;
}

/** 步数条：第 1 步按域显示「工作空间验证」（平台）或「企业验证」（租户） */
function GateSteps({ principal }: { principal: AuthPrincipal }) {
  const isProviderMember = principal.realm === "TENANT" && principal.tenantKind === "provider";
  const firstStep = principal.realm === "PLATFORM" ? "工作空间验证" : "企业验证";
  const steps = [firstStep, "短信验证", "角色确认", ...(isProviderMember ? ["选择服务药厂"] : [])];
  const current = 2; // 角色确认
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

export function IdentityConfirmGate({ session, onConfirm, onChangeAccount }: IdentityConfirmGateProps) {
  const p = session.principal;
  const isPlatform = p.realm === "PLATFORM";
  const options: LoginIdentityOption[] =
    session.identityOptions && session.identityOptions.length > 0
      ? session.identityOptions
      : [
          // 兜底单选项（会话未携带列表时按当前主体构造）
          {
            realm: p.realm,
            key: p.realm === "PLATFORM" ? p.platformRoleId : `${p.activeRoleId}@${p.tenantId}`,
            assignmentIds: p.realm === "PLATFORM" ? [] : p.effectiveAssignmentIds,
            roleId: p.realm === "PLATFORM" ? p.platformRoleId : p.activeRoleId,
            roleName: p.realm === "PLATFORM" ? p.platformRoleName : p.activeRoleName,
            permSummary: "",
            scopeSummary: p.realm === "PLATFORM" ? p.dutyScope : p.dataScopeSummary,
            grantedBy: "—",
            grantedAt: "",
            effectiveFrom: "",
            tenantId: p.realm === "TENANT" ? p.tenantId : undefined,
            tenantName: p.realm === "TENANT" ? p.tenantName : undefined,
            orgName: p.orgName,
          },
        ];
  const [selectedKey, setSelectedKey] = useState(options.some((o) => o.roleId === (p.realm === "PLATFORM" ? p.platformRoleId : p.activeRoleId))
    ? options.find((o) => o.roleId === (p.realm === "PLATFORM" ? p.platformRoleId : p.activeRoleId))!.key
    : options[0].key);
  const [busy, setBusy] = useState(false);

  const selected = options.find((o) => o.key === selectedKey) ?? options[0];

  const methodLabel =
    session.method === "qr" && session.qrSource
      ? `${METHOD_LABEL[session.method]}（${session.qrSource === "wecom" ? "企业微信" : "微信开放平台"}）`
      : METHOD_LABEL[session.method];

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(selected.roleId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="identity-gate login-shell">
      <LoginBackdrop />
      <div className="auth-gate-stage">
        <div className="auth-gate-brand">
          <BrandMark size={36} title="药合作" />
          <div>
            <div className="auth-gate-brand-name">药合作</div>
            <div className="auth-gate-brand-sub">营销协同管理系统</div>
          </div>
        </div>

        <section className="auth-gate-card">
          <div className="auth-gate-step">
            <GateSteps principal={p} />
            <h1 className="auth-gate-title">
              {isPlatform ? "选择本次使用的平台角色" : "选择本次使用的角色"}
            </h1>
            <p className="auth-gate-subtitle">
              {options.length > 1
                ? isPlatform
                  ? "该平台账号关联了多个平台角色，请选择本次使用的平台角色。"
                  : "你在本企业内关联了多个有效角色，请选择本次使用的角色。"
                : "确认本次使用的角色后进入。"}
            </p>
            <div className="identity-gate-idhead">
              <span className="identity-gate-avatar" aria-hidden>{p.name.slice(0, 1)}</span>
              <span className="identity-gate-idname">{p.name}</span>
              <span className="auth-gate-tag auth-gate-tag--ok">{methodLabel}验证通过</span>
            </div>
            <dl className="pharma-gate-idcard" style={{ margin: "0 0 16px" }}>
              <div className="pharma-gate-idrow">
                <dt>已验证手机号</dt>
                <dd className="font-mono-nums" style={{ letterSpacing: "0.06em" }}>{maskPhone(p.phone)}</dd>
              </div>
              <div className="pharma-gate-idrow">
                <dt>{isPlatform ? "当前工作空间" : "当前企业"}</dt>
                <dd>
                  {isPlatform ? (
                    <>
                      {PLATFORM_WORKSPACE_NAME}
                      <span className="auth-gate-tag auth-gate-tag--brand" style={{ marginLeft: 8 }}>平台工作空间 · 非企业租户</span>
                    </>
                  ) : (
                    p.tenantName
                  )}
                </dd>
              </div>
            </dl>

            <div className="auth-gate-boundary" style={{ marginBottom: 14 }}>
              <span>
                {isPlatform ? "平台工作空间：只管理租户与企业码，不进入企业内部配置。" : "本企业内选择角色；换企业可在进入工作台后通过用户菜单「切换企业」。"}
              </span>
              <button
                type="button"
                className="auth-gate-q"
                aria-label="平台与企业边界说明"
                data-tip={isPlatform
                  ? "平台系统管理员只管理租户开通与企业码、菜单管理、合作关系监管和平台审计；平台不属于任何企业租户，不进入企业内部的组织、用户与权限配置。"
                  : "角色选择只在本次认证的企业内进行；同一手机号在其他企业的成员身份不受影响。进入工作台后可在用户菜单「切换企业」免验证码切换到其他已激活企业。"}
              >
                ?
              </button>
            </div>

            <div className="identity-gate-rows" role="radiogroup" aria-label="选择本次使用的角色">
              <div className="identity-gate-rowhead" aria-hidden>
                <span>角色身份</span>
                <span>授权状态</span>
              </div>
              {options.map((opt) => {
                const isSelected = selectedKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`identity-gate-row${isSelected ? " identity-gate-row--selected" : ""}`}
                    disabled={busy}
                    onClick={() => setSelectedKey(opt.key)}
                  >
                    <span className="identity-gate-cell--role">
                      <span className="identity-gate-role">{opt.roleName}</span>
                      {opt.assignmentIds.length > 1 && (
                        <span className="identity-gate-merged">{opt.assignmentIds.length} 条有效授权已合并</span>
                      )}
                    </span>
                    <span className="identity-gate-cell--status">
                      <span className="auth-gate-tag auth-gate-tag--ok">授权生效</span>
                      {isSelected && (
                        <span className="identity-gate-row-check" aria-hidden>
                          <Check size={14} strokeWidth={2.5} />
                        </span>
                      )}
                    </span>
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
                  更换账号
                </button>
                <button
                  type="button"
                  className="auth-gate-btn auth-gate-btn--primary identity-gate-btn-confirm"
                  disabled={busy || !selected}
                  onClick={() => void handleConfirm()}
                >
                  {busy ? (
                    <>
                      <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                      正在进入工作空间…
                    </>
                  ) : (
                    <>
                      确认登录
                      <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        <p className="auth-gate-foot">原型演示 · 选择角色免重新认证，工作空间与人员身份保持不变</p>
      </div>
    </div>
  );
}
