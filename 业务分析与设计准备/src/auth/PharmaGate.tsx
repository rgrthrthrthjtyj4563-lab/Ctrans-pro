/**
 * 登录三步流 · 第三步（仅服务专员）：选择本次服务药厂。
 * 所属企业不随选择变化；选择的是「当前业务数据范围」，不创建新账号、不重新认证。
 * - first  登录后的全屏选择页（Root 渲染）
 * - switch 工作台内免重新认证切换（AppShell 以浮层渲染）
 * 多药厂：卡片单选 + 进入确认弹窗；单药厂：只读卡直达（不制造无意义的选择动作）；
 * 暂停药厂：禁用态卡片 + 明确文案，点击给出内联提示。
 */
import { useEffect, useRef, useState } from "react";
import { Ban, Building2, Check, Clock, Info, MapPin, Users, X } from "lucide-react";
import { BrandMark } from "../components/Brand";
import { Modal } from "../components/Modal";
import type { AuthPrincipal, ServingPharma } from "./authTypes";
import "./authGates.css";

export type PharmaGateMode = "first" | "switch";

interface PharmaGateProps {
  principal: AuthPrincipal;
  pharmas: ServingPharma[];
  mode: PharmaGateMode;
  /** 返回是否成功；成功后调用方换发会话（本组件整树随之卸载） */
  onEnter: (pharmaId: string) => Promise<boolean>;
  /** first 模式：回登录页 */
  onChangeAccount?: () => void;
  /** switch 模式：关闭浮层 */
  onClose?: () => void;
}

export function PharmaGate({
  principal,
  pharmas,
  mode,
  onEnter,
  onChangeAccount,
  onClose,
}: PharmaGateProps) {
  const available = pharmas.filter((p) => p.status === "active");
  const paused = pharmas.filter((p) => p.status === "paused");
  const isSingle = available.length === 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pausedTip, setPausedTip] = useState<string | null>(null);
  const tipTimer = useRef<number | null>(null);

  useEffect(() => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    return () => {
      if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    };
  }, []);

  const selected = available.find((p) => p.id === selectedId) ?? null;

  const handlePausedClick = (pharma: ServingPharma) => {
    const tip = `${pharma.name}的合作授权已暂停，请联系${principal.enterpriseName}管理员。`;
    setPausedTip(tip);
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setPausedTip(null), 4000);
  };

  const doEnter = async (pharma: ServingPharma) => {
    setBusy(true);
    try {
      await onEnter(pharma.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pharma-gate">
      <div className="auth-gate-stage">
        {mode === "first" ? (
          <div className="auth-gate-brand">
            <BrandMark size={34} title="药合作系统" />
            <div>
              <div className="auth-gate-brand-name">药合作系统</div>
              <div className="auth-gate-brand-sub">选择服务药厂</div>
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
            <h1 className="auth-gate-title">
              {mode === "switch" ? "切换服务药厂" : "选择服务药厂"}
            </h1>
            <p className="auth-gate-subtitle">
              {isSingle
                ? "你当前只有一个有效服务药厂，确认后即可进入。"
                : mode === "switch"
                  ? "切换立即生效，无需重新验证手机号或密码。"
                  : "你同时参与多家药厂的服务工作。请选择本次要进入的业务空间。"}
            </p>

            <div className="pharma-gate-idcard">
              <dl style={{ margin: 0 }}>
                <div className="pharma-gate-idrow">
                  <dt>所属企业</dt>
                  <dd>{principal.enterpriseName}</dd>
                </div>
                <div className="pharma-gate-idrow">
                  <dt>当前身份</dt>
                  <dd>
                    {principal.name} · {principal.roleName}
                  </dd>
                </div>
              </dl>
              <div className="auth-gate-note auth-gate-note--brand" style={{ marginTop: 10 }} role="note">
                <Info size={14} aria-hidden />
                <span>
                  你的账号和人员档案仍属于{principal.enterpriseName}。
                  这里选择的是本次处理业务的药厂，不会创建新的登录账号。
                </span>
              </div>
            </div>

            {isSingle ? (
              <>
                <div className="pharma-gate-solo">
                  <p className="pharma-gate-solo-label">当前服务药厂</p>
                  <div className="pharma-gate-solo-value">
                    {available[0].name}
                    <span className="auth-gate-tag auth-gate-tag--ok">服务中</span>
                  </div>
                </div>
                <div className="auth-gate-actions">
                  <button
                    type="button"
                    className="auth-gate-btn auth-gate-btn--primary auth-gate-btn--block"
                    disabled={busy}
                    onClick={() => void doEnter(available[0])}
                  >
                    {busy ? (
                      <>
                        <span className="auth-gate-spin auth-gate-spin--onbrand" aria-hidden />
                        正在进入{available[0].name}…
                      </>
                    ) : (
                      `进入${available[0].name}`
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="pharma-gate-list" role="radiogroup" aria-label="选择本次进入的服务药厂">
                  {available.map((pharma) => {
                    const isSelected = selectedId === pharma.id;
                    const isCurrent = principal.servingPharmaId === pharma.id;
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
                            <span className="auth-gate-tag auth-gate-tag--ok">服务中</span>
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
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  {paused.map((pharma) => (
                    <button
                      key={pharma.id}
                      type="button"
                      className="pharma-gate-card-item pharma-gate-card-item--paused"
                      aria-disabled="true"
                      onClick={() => handlePausedClick(pharma)}
                    >
                      <span className="pharma-gate-pausedicon" aria-hidden>
                        <Ban size={12} />
                      </span>
                      <span className="pharma-gate-card-body">
                        <span className="pharma-gate-card-head">
                          <span className="pharma-gate-card-name">{pharma.name}</span>
                          <span className="auth-gate-tag auth-gate-tag--warn">合作暂停</span>
                        </span>
                        <span className="pharma-gate-card-meta">
                          <span>当前授权已暂停，暂时无法进入</span>
                          {pharma.pausedAt && (
                            <span>
                              暂停时间：<span className="font-mono-nums">{pharma.pausedAt}</span>
                            </span>
                          )}
                          {pharma.pausedReason && <span>暂停原因：{pharma.pausedReason}</span>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {pausedTip && (
                  <div className="auth-gate-note auth-gate-note--warn" style={{ marginTop: 10 }} role="alert">
                    <Ban size={14} aria-hidden />
                    <span>{pausedTip}</span>
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
                      "请选择服务药厂"
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

      {confirmOpen && selected && (
        <Modal open title={`确认进入${selected.name}？`} onClose={() => setConfirmOpen(false)} width={440}>
          <dl className="pharma-gate-dialog-grid">
            <dt>登录用户</dt>
            <dd>{principal.name}</dd>
            <dt>所属企业</dt>
            <dd>{principal.enterpriseName}</dd>
            <dt>当前身份</dt>
            <dd>{principal.roleName}</dd>
            <dt>服务药厂</dt>
            <dd>{selected.name}</dd>
            <dt>数据范围</dt>
            <dd>仅{selected.name}相关业务</dd>
          </dl>
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
