/**
 * 服务商准入 · 复用件（2026-10-20 自统一页拆回两页版后保留的共享组件）
 * 发起/审核交互件与主体解析器，供药厂侧「服务商准入」任务页（PharmaAccessTasks）使用：
 * - VerdictControl：审核逐项结论标记（通过/驳回二选一，驳回原因必填）
 * - ComposeTaskModal：发起准入任务（只选模板 → 确认 → 一次性准入码）
 * - 主体解析器：服务商租户 → 企业名 / 统一社会信用代码（registry 为权威 + 内置映射兜底）
 * 服务商端页面（ApplicationTab/RecordsTab）不受影响，仍在 vendor-access/ 目录。
 */
import { useState, type CSSProperties } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Field } from '../complianceUi';
import type { ToastMessage } from '../../components/Toast';
import type { PharmaAccessTemplate } from '../../types';
import { PROVIDER_USCC_OF_ORG, templateVersionLabel, useVendorAccess, type VendorAccessOpResult } from '../../context/VendorAccessContext';
import { usePermission } from '../../context/PermissionContext';
import { tenantNameOf } from '../../data/cooperationModel';
import { getTenantRegistrySnapshot } from '../../data/tenantRegistry';
import { mono } from '../vendor-access/shared';

export { mono };

/** 外部导入声明文案（需求方案 §4.1 固定文案） */
export const EXTERNAL_IMPORT_DECLARATION =
  '本批次服务商均已由本厂完成准入审核，相关材料在本厂自有系统或线下渠道留存备查，审核责任由本厂承担。';

/** 服务商租户 → 企业名（registry 组织树优先，内置映射兜底；再兜底返回 undefined 由任务 vendorName 顶上） */
export function providerNameOf(providerTenantId: string): string | undefined {
  const name = tenantNameOf(providerTenantId);
  if (name && name !== providerTenantId) return name;
  return PROVIDER_USCC_OF_ORG[providerTenantId]?.name;
}

/** 服务商租户 → 统一社会信用代码（registry 为权威，内置 org 映射兜底） */
export function usccOfProvider(providerTenantId: string): string | undefined {
  const tenant = getTenantRegistrySnapshot().tenants.find(
    (t) => t.type === 'provider' && t.enterpriseOrgId === providerTenantId,
  );
  return tenant?.uscc ?? PROVIDER_USCC_OF_ORG[providerTenantId]?.uscc;
}

export const modalInputStyle = {
  width: '100%', border: '1px solid var(--color-border-strong)', borderRadius: 6,
  padding: '8px 10px', fontSize: 'var(--fs-13)', outline: 'none', background: '#fff',
} as const;

// ─── 审核逐项结论标记（审核中任务：通过/驳回显式二选一，驳回展开原因必填）──────────

export function VerdictControl({ value, onChange }: {
  value?: { verdict: 'pass' | 'reject'; reason: string };
  onChange: (v: { verdict: 'pass' | 'reject'; reason: string } | undefined) => void;
}) {
  const pass = value?.verdict === 'pass';
  const reject = value?.verdict === 'reject';
  const toggle = (active: boolean, tone: 'pass' | 'reject'): CSSProperties => ({
    padding: '3px 12px', borderRadius: 999, fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? (tone === 'pass' ? '#248A5A' : '#C73A3A') : 'var(--color-border-strong)'}`,
    background: active ? (tone === 'pass' ? '#E6F5ED' : '#FEECEC') : '#fff',
    color: active ? (tone === 'pass' ? '#248A5A' : '#C73A3A') : 'var(--color-text-2)',
  });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)', flexShrink: 0 }}>审核结论</span>
        <button type="button" style={toggle(pass, 'pass')} onClick={() => onChange(pass ? undefined : { verdict: 'pass', reason: '' })}>
          ✓ 通过
        </button>
        <button type="button" style={toggle(reject, 'reject')} onClick={() => onChange(reject ? undefined : { verdict: 'reject', reason: '' })}>
          ✗ 驳回
        </button>
        {!value && <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>未标记</span>}
      </div>
      {reject && (
        <input
          value={value.reason}
          onChange={(e) => onChange({ verdict: 'reject', reason: e.target.value })}
          placeholder="驳回原因（必填，说明该材料哪里需要修改）"
          style={{ marginTop: 8, width: '100%', maxWidth: 560, border: '1px solid #F5C6C6', borderRadius: 6, padding: '7px 10px', fontSize: 'var(--fs-12)', outline: 'none', color: '#C73A3A', background: '#FFF' }}
        />
      )}
    </div>
  );
}

// ─── 发起准入审核（准入码制：只选模板 → 确认 → 大字一次性准入码）──────────────────

export function ComposeTaskModal({
  pharmaName,
  addToast,
  onClose,
  onCreated,
}: {
  pharmaName: string;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  onClose: () => void;
  /** 创建成功后回调（携带新任务 id，供调用方定位/刷新） */
  onCreated?: (taskId?: string) => void;
}) {
  const { templatesOf, createTask } = useVendorAccess();
  const { principal } = usePermission();
  const pharmaTenantId = principal.realm === 'TENANT' && principal.tenantKind === 'pharma' ? principal.tenantId : '';
  const templates: PharmaAccessTemplate[] = templatesOf(pharmaTenantId);
  const enabledTemplate = templates.find((t) => t.enabled);

  const [templateId, setTemplateId] = useState(enabledTemplate?.id ?? '');
  const [error, setError] = useState('');
  /** 0=选择段 1=确认段 2=成功段（大字准入码） */
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [createdCode, setCreatedCode] = useState('');

  const selectedTemplate = templates.find((t) => t.id === templateId);

  function handleCreate() {
    if (!templateId) { setError('请选择材料模板'); return; }
    const res = createTask({ templateId });
    if (!res.ok) {
      setError(res.error ?? '创建失败');
      addToast({ type: 'error', title: res.error ?? '创建失败' });
      return;
    }
    setCreatedCode(res.admissionCode ?? '');
    setStage(2);
    onCreated?.(res.taskId);
  }

  // 成功段：大字准入码 + 线下告知提示
  if (stage === 2) {
    return (
      <Modal
        open
        title="准入任务已创建"
        onClose={onClose}
        width={480}
        footer={<Button variant="primary" onClick={onClose}>完成</Button>}
      >
        <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-2)' }}>一次性准入码</div>
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--color-brand)', margin: '10px 0 6px' }}>
            {createdCode}
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<KeyRound size={13} />}
            onClick={() => addToast({ type: 'info', title: '（演示）准入码已复制', description: '原型不访问剪贴板，请手动记录。' })}
          >
            复制准入码
          </Button>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.8 }}>
          请通过<strong>线下渠道</strong>（电话/微信/邮件）将准入码告知意向服务商；服务商在「准入任务」输入码后，任务即绑定其主体并开始提交材料。
          <br />系统不发送任何邀请、不提供服务商检索——把码给谁由贵司线下决定；该码只能使用一次。
        </div>
      </Modal>
    );
  }

  // 确认段
  if (stage === 1) {
    return (
      <Modal
        open
        title="确认创建准入任务"
        onClose={() => setStage(0)}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setStage(0)}>返回修改</Button>
            <Button variant="primary" onClick={handleCreate}>确认创建</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-13)' }}>
          {[
            ['药厂名称', pharmaName],
            ['材料模板', selectedTemplate ? `${selectedTemplate.name} ${templateVersionLabel(selectedTemplate)}` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12 }}>
              <span style={{ width: 84, flexShrink: 0, color: 'var(--color-text-3)' }}>{k}</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
          创建后生成一次性准入码，请通过线下渠道提供给意向服务商。
        </div>
      </Modal>
    );
  }

  // 选择段
  return (
    <Modal
      open
      title="发起准入审核"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!templateId} onClick={() => { if (!templateId) { setError('请选择材料模板'); return; } setStage(1); }}>下一步</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="材料模板" required>
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); if (error) setError(''); }} style={modalInputStyle}>
            <option value="">请选择模板…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{templateVersionLabel(t)} · {t.items.length} 项{t.enabled ? ' · 启用中' : ''}）
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 'var(--fs-11)', color: 'var(--color-text-3)' }}>
            按任务创建时点的模板版本执行；模板维护在本页「准入模板」入口。
          </div>
        </Field>

        {selectedTemplate && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-brand-subtle)', fontSize: 'var(--fs-12)', color: 'var(--color-brand)' }}>
            「{selectedTemplate.name} {templateVersionLabel(selectedTemplate)}」共 {selectedTemplate.items.length} 项（必传 {selectedTemplate.items.filter((i) => i.required).length} 项）。
          </div>
        )}

        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.8 }}>
          创建后系统生成<strong>一次性准入码</strong>：不指定、不检索服务商，由贵司线下把码告知意向服务商；服务商输入码后任务即绑定其主体。
        </div>

        {error && <div style={{ fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{error}</div>}
      </div>
    </Modal>
  );
}
