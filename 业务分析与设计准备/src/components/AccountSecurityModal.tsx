/**
 * 账号与安全弹窗（2026-09-18 第一期缺口批次）：顶栏用户菜单「账号与安全」入口。
 * 本期实现「修改密码」最小闭环：旧密码验证 → 新密码规则校验（8-20 位含字母和数字）
 * → 覆盖演示密码；成功写审计 PASSWORD_CHANGED，旧密码错误写 PASSWORD_OLD_WRONG。
 * 生产口径：改密后应吊销其他会话并要求重新登录（本原型单会话，改密后保持登录）。
 */
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Modal } from './Modal';
import { Field, InfoBanner, inputStyle } from '../pages/permUi';
import { changeLoginPassword, PASSWORD_RULE_TEXT } from '../auth/mockGateway';
import type { AuthPrincipal } from '../auth/authTypes';

interface Props {
  principal: AuthPrincipal;
  onClose: () => void;
  /** 改密成功回调（外壳层 toast） */
  onChanged: (message: string) => void;
}

type FieldKey = 'old' | 'new' | 'confirm';

export function AccountSecurityModal({ principal, onClose, onChanged }: Props) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setFieldError({});
    if (!oldPwd) return setFieldError({ old: '请输入当前密码' });
    if (!newPwd) return setFieldError({ new: '请输入新密码' });
    if (newPwd !== confirmPwd) return setFieldError({ confirm: '两次输入的新密码不一致' });
    setBusy(true);
    const result = await changeLoginPassword({ principal, oldPassword: oldPwd, newPassword: newPwd });
    setBusy(false);
    if (!result.ok) {
      if (result.field) setFieldError({ [result.field]: result.error });
      else setError(result.error);
      return;
    }
    onChanged(`密码已修改，下次登录请使用新密码（${principal.account}）`);
    onClose();
  }

  return (
    <Modal
      open
      title="账号与安全"
      onClose={onClose}
      width={480}
      footer={
        <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: '#fff', color: '#374151', fontSize: 'var(--fs-13)', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--color-brand, #176B5B)',
              color: '#fff', fontSize: 'var(--fs-13)', fontWeight: 600, fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <KeyRound size={14} aria-hidden />
            确认修改
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <InfoBanner>
          当前账号 <b>{principal.account}</b>（{principal.name}）· 初始演示密码统一 demo123，修改后以新密码为准。
        </InfoBanner>
        {(error || Object.values(fieldError).some(Boolean)) && (
          <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }} role="alert">
            {error ?? Object.values(fieldError).find(Boolean)}
          </div>
        )}
        <Field label="当前密码" required>
          <input
            type="password"
            autoComplete="current-password"
            value={oldPwd}
            onChange={(e) => { setOldPwd(e.target.value); setFieldError((p) => ({ ...p, old: undefined })); }}
            style={inputStyle}
            placeholder="请输入当前密码"
          />
        </Field>
        <Field label="新密码" required hint={PASSWORD_RULE_TEXT}>
          <input
            type="password"
            autoComplete="new-password"
            value={newPwd}
            onChange={(e) => { setNewPwd(e.target.value); setFieldError((p) => ({ ...p, new: undefined })); }}
            style={inputStyle}
            placeholder="请输入新密码"
          />
        </Field>
        <Field label="确认新密码" required>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPwd}
            onChange={(e) => { setConfirmPwd(e.target.value); setFieldError((p) => ({ ...p, confirm: undefined })); }}
            style={inputStyle}
            placeholder="再次输入新密码"
          />
        </Field>
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.7, marginTop: 2 }}>
          修改成功后本设备保持登录；生产环境将吊销其他已登录会话并要求重新登录（本原型为单会话演示）。
          忘记当前密码时，可在退出后通过登录页「忘记密码？」用短信验证码重置。
        </div>
      </div>
    </Modal>
  );
}
