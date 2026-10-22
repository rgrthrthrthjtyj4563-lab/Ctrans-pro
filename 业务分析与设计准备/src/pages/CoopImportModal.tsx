/**
 * 导入合作服务商（外部已准入）弹窗 · 药厂侧（2026-10-16 建 / 2026-10-20 服务商管理整合改造）
 * 客户已在本厂自有系统或线下完成准入审核 → 上传名单直接建立合作，不要求重复上传材料
 * 或在贝医重新审核；不创建虚假的「平台审核通过」任务。
 * 交互：下载 CSV 模板（真实文件）→ 上传 CSV → 逐行校验 → 有错全驳 → 勾选导入声明 → 确认导入。
 * 校验顺序：格式 → 文件内重复 → 已注册（registry 为权威 + 内置 org 映射兜底）→ 租户状态
 * → 已存在生效关系 / 暂停中关系 → 该方向在途准入任务。历史终止允许（导入即重建生效）；
 * 未绑定服务商的待领取准入码不阻挡无关服务商导入。
 * 提交走 cooperationModel.importRelationshipsBatch：确认时在同一份快照上先全量复验后
 * 一次性 commit（整批原子，杜绝半批写入），反馈与实际写入一致；逐家审计落日志。
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import type { ToastMessage } from '../components/Toast';
import { usePermission } from '../context/PermissionContext';
import { PROVIDER_USCC_OF_ORG, useVendorAccess } from '../context/VendorAccessContext';
import { getTenantRegistrySnapshot } from '../data/tenantRegistry';
import {
  importRelationshipsBatch,
  relationshipBetween,
  relationshipSourceLabel,
} from '../data/cooperationModel';
import { EXTERNAL_IMPORT_DECLARATION } from './vendor-management/parts';
import { InfoBanner } from './permUi';

const mono = "'JetBrains Mono', monospace";

const TENANT_STATUS_LABEL: Record<string, string> = {
  pending_activation: '待激活',
  active: '正常',
  suspended: '已暂停',
  terminated: '已终止',
};

/** 按统一社会信用代码定位服务商主体：注册中心为权威，内置 org 映射兜底（registry 未登记的演示服务商） */
function lookupProvider(uscc: string): { orgId: string; name: string; status: string } | null {
  const u = uscc.trim().toUpperCase();
  if (!u) return null;
  const tenant = getTenantRegistrySnapshot().tenants.find(
    (t) => t.type === 'provider' && t.uscc.trim().toUpperCase() === u,
  );
  if (tenant) return { orgId: tenant.enterpriseOrgId, name: tenant.legalName, status: tenant.status };
  for (const [orgId, v] of Object.entries(PROVIDER_USCC_OF_ORG)) {
    if (v.uscc.toUpperCase() === u) return { orgId, name: v.name, status: 'active' };
  }
  return null;
}

/** 真实下载 CSV 模板（需求方案 §4.1：提供真实可下载模板，界面准确说明支持格式） */
function downloadTemplate() {
  const csv = '\uFEFF服务商名称,统一社会信用代码\n（示例，请删除此行）某某医药科技有限公司,91330100MA27WXY000\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '服务商导入模板.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sizeTextOf(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

interface ImportRow {
  name: string;
  uscc: string;
}

interface ValidatedRow extends ImportRow {
  lineNo: number;
  error?: string;
}

export function CoopImportModal({
  pharmaTenantId,
  addToast,
  onClose,
  onImported,
}: {
  pharmaTenantId: string;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  onClose: () => void;
  /** 导入成功回调（新建立合作的服务商租户 id 列表；页面据此刷新定位） */
  onImported?: (providerTenantIds: string[]) => void;
}) {
  const { principal, logAudit } = usePermission();
  const { records } = useVendorAccess();
  const [file, setFile] = useState<{ name: string; sizeText: string } | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validated = useMemo<ValidatedRow[]>(() => {
    if (!rows) return [];
    return rows.map((r, idx) => {
      const errors: string[] = [];
      if (!r.name.trim()) errors.push('服务商名称为空');
      if (!/^[0-9A-Z]{18}$/.test(r.uscc.trim().toUpperCase())) {
        errors.push('统一社会信用代码须为 18 位');
      } else {
        const dup = rows.findIndex((x, j) => j < idx && x.uscc.trim().toUpperCase() === r.uscc.trim().toUpperCase());
        if (dup >= 0) {
          errors.push(`与第 ${dup + 2} 行重复（文件内重复）`);
        } else {
          const provider = lookupProvider(r.uscc);
          if (!provider) {
            errors.push('该服务商尚未注册本系统，请先由软件服务方完成企业开户');
          } else if (provider.status !== 'active') {
            errors.push(`该服务商租户状态为「${TENANT_STATUS_LABEL[provider.status] ?? provider.status}」，暂不能导入`);
          } else {
            const rel = relationshipBetween(pharmaTenantId, provider.orgId);
            if (rel?.status === 'active') {
              errors.push(`合作关系已生效（${relationshipSourceLabel(rel.source)}），无需重复导入`);
            } else if (rel?.status === 'paused') {
              errors.push('存在暂停中的合作，请恢复合作而非重复导入');
            } else {
              const inflight = records.find(
                (t) => t.pharmaTenantId === pharmaTenantId && t.providerTenantId === provider.orgId
                  && ['待服务商提交', '审核中'].includes(t.status),
              );
              if (inflight) errors.push(`该方向有在途准入任务（${inflight.status}），请先完成或撤回`);
            }
          }
        }
      }
      return { ...r, lineNo: idx + 2, error: errors.join('；') || undefined };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, records, pharmaTenantId]);

  const okCount = validated.filter((r) => !r.error).length;
  const errCount = validated.length - okCount;
  const canImport = rows !== null && validated.length > 0 && errCount === 0 && declared && !submitting;

  function pickFile(f: File | null) {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      addToast({
        type: 'info',
        title: '请使用 CSV 格式上传',
        description: 'Excel 文件请「另存为 CSV（逗号分隔）」后重新上传（当前仅解析 CSV 文本，不支持 Excel 解析）。',
      });
      return;
    }
    if (!lower.endsWith('.csv')) {
      addToast({ type: 'error', title: '仅支持 .csv 文件' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const out: ImportRow[] = [];
      lines.forEach((line, i) => {
        const cols = line.split(/[,，\t]/).map((s) => s.trim());
        if (i === 0 && /名称|信用代码/.test(cols.join(''))) return; // 首行表头跳过
        out.push({ name: cols[0] ?? '', uscc: cols[1] ?? '' });
      });
      setFile({ name: f.name, sizeText: sizeTextOf(f.size) });
      setRows(out);
      if (out.length === 0) addToast({ type: 'error', title: '未解析到数据行', description: '请确认文件内容：每行 = 服务商名称, 统一社会信用代码。' });
    };
    reader.readAsText(f);
  }

  function reset() {
    setFile(null);
    setRows(null);
    setDeclared(false);
  }

  function confirmImport() {
    const okRows = validated.filter((r) => !r.error);
    const providerRows = okRows
      .map((row) => lookupProvider(row.uscc))
      .filter((p): p is { orgId: string; name: string; status: string } => !!p);
    setSubmitting(true);
    // 确认提交前在同一份快照上整批复验 + 原子写入（预览后状态变化会在此暴露，整批不写入）
    const res = importRelationshipsBatch({
      pharmaTenantId,
      rows: providerRows.map((p) => ({ providerTenantId: p.orgId })),
      actor: principal.name,
      importBatchId: `imp-${Date.now().toString(36)}`,
      declaration: EXTERNAL_IMPORT_DECLARATION,
    });
    setSubmitting(false);
    if (!res.ok || !res.created) {
      addToast({
        type: 'error',
        title: '导入未执行（整批未写入）',
        description: `${res.error ?? '操作失败'}——名单状态可能已发生变化，请修正后重新上传。`,
      });
      return;
    }
    // 逐家审计 + 批次汇总审计（导入来源、时间、操作人、声明可追溯）
    for (const a of res.audits) {
      logAudit({
        module: '合作关系',
        action: '导入合作服务商（外部已准入）',
        target: a.target,
        resource: 'cooperation.import',
        reason: EXTERNAL_IMPORT_DECLARATION,
        afterSummary: a.detail,
      });
    }
    logAudit({
      module: '合作关系',
      action: '批量导入合作服务商（外部已准入）',
      target: `共 ${res.created.length} 家`,
      resource: 'cooperation.import',
      reason: EXTERNAL_IMPORT_DECLARATION,
      afterSummary: `校验通过 ${okCount} 行 · 成功导入 ${res.created.length} 家 · 驳回 0 行（整批原子提交）`,
    });
    addToast({
      type: 'success',
      title: `已导入 ${res.created.length} 家，合作即时生效（外部准入）`,
      description: '无需启用等额外步骤；承接业务还需品种授权，可在列表行「业务授权」或详情中配置；合同归档在「合同管理」继续。',
    });
    onImported?.(res.created.map((c) => c.providerTenantId));
    onClose();
  }

  const tdBase: CSSProperties = { padding: '9px 14px', fontSize: 'var(--fs-13)', borderBottom: '1px solid #F3F4F6' };

  return (
    <Modal
      open
      title="导入合作服务商（外部已准入）"
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取 消</Button>
          <Button variant="primary" disabled={!canImport} onClick={confirmImport}>
            {rows === null || validated.length === 0
              ? '请先上传名单文件'
              : errCount > 0
                ? '存在错误行，全部驳回'
                : declared
                  ? `确认导入 ${okCount} 家`
                  : `确认导入 ${okCount} 家（须勾选声明）`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <InfoBanner>
          适用于<strong>已在贵司内部系统或线下完成准入审核</strong>的服务商。导入后直接建立合作，无需在贝医重复提交材料和审核。
          模板列：<strong>服务商名称、统一社会信用代码</strong>（仅 CSV，Excel 请另存为 CSV 上传）。{' '}
          <a
            style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
            onClick={downloadTemplate}
          >下载 CSV 模板</a>
          <br />
          目标服务商须已在本系统开户且租户状态有效：开户是系统账户前提，不等于要求重新完成业务准入；未注册的企业请先联系软件服务方完成企业开户。
        </InfoBanner>

        {/* 上传区 */}
        <div>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>
            上传名单文件<span style={{ fontWeight: 400, color: 'var(--color-text-3)' }}>（支持 .csv，单次一份；Excel 请另存为 CSV）</span>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              border: '1.5px dashed var(--color-border-strong)', borderRadius: 8, background: '#FAFBFC', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '20px 16px', textAlign: 'center',
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={17} />
            </div>
            <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>点击选择文件，或拖拽到此处上传</div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>《服务商导入模板》· 填写服务商名称与统一社会信用代码</div>
          </div>
          {file && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: '#F9FAFB', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 'var(--fs-12)' }}>
              <FileText size={14} style={{ color: 'var(--color-brand)' }} />
              <span style={{ fontWeight: 600 }}>{file.name}</span>
              <span style={{ color: 'var(--color-text-3)' }}>{file.sizeText}</span>
              <span style={{ color: '#C73A3A', cursor: 'pointer', marginLeft: 'auto' }} onClick={reset}>移除</span>
            </div>
          )}
        </div>

        {/* 校验预览表 */}
        {rows !== null && validated.length > 0 && (
          <div>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>
              校验预览<span style={{ fontWeight: 400, color: 'var(--color-text-3)' }}>（上传后自动逐行校验；存在任何错误行时全部驳回，修正文件后重新上传）</span>
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['行', '服务商名称', '统一社会信用代码', '校验结果'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validated.map((r) => (
                      <tr key={r.lineNo} style={{ background: r.error ? '#FFF7F7' : undefined }}>
                        <td style={{ ...tdBase, fontFamily: mono, color: 'var(--color-text-3)' }}>{r.lineNo}</td>
                        <td style={tdBase}>{r.name || '—'}</td>
                        <td style={{ ...tdBase, fontFamily: mono }}>{r.uscc || '—'}</td>
                        <td style={tdBase}>
                          {r.error
                            ? <span style={{ fontSize: 'var(--fs-12)', color: '#C73A3A' }}>{r.error}</span>
                            : <span style={{ fontSize: 'var(--fs-12)', color: '#248A5A', fontWeight: 600 }}>✓ 通过</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, fontSize: 'var(--fs-12)', borderRadius: 6, padding: '8px 12px',
              background: errCount > 0 ? '#FEECEC' : '#E6F5ED',
              border: `1px solid ${errCount > 0 ? '#F5C6C6' : '#C8E9D6'}`,
              color: errCount > 0 ? '#C73A3A' : '#248A5A',
            }}>
              <span>校验通过 <b>{okCount}</b> 行 · 错误 <b>{errCount}</b> 行</span>
              <span style={{ opacity: 0.85 }}>— {errCount > 0 ? '存在任何错误行时全部驳回，请修正文件后重新上传（避免半批导入）' : `可导入 ${okCount} 家`}</span>
            </div>
          </div>
        )}

        {/* 导入声明（必勾） */}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', cursor: 'pointer' }}>
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--color-brand)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
            <b>导入声明（必勾）：</b>{EXTERNAL_IMPORT_DECLARATION}导入后将记入审计日志。
          </span>
        </label>
      </div>
    </Modal>
  );
}
