import { useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Ban,
  ClipboardCheck,
  Eye,
  FileText,
  Folder,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { FieldGroup, FieldItem } from '../components/DetailDrawer';
import type { ToastMessage } from '../components/Toast';
import type { Role, VendorAccessHistory, VendorAccessRecord } from '../types';
import {
  emptyVendorAccessInput,
  useVendorAccess,
  type VendorAccessInput,
} from '../context/VendorAccessContext';
import { Field, inputStyle, tdStyle, thStyle } from './complianceUi';

/**
 * 服务商准入 · 双角色最小闭环
 * 服务商：维护本企业资料 → 提交 → 被驳回后修改重提
 * 药厂合规：审核列表 → 通过 / 驳回（原因必填）
 * 药厂销售：不参与本模块（菜单与页面权限均已收敛）。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
  /** main=我的准入资料/审核列表；records=服务商提交记录 */
  view?: 'main' | 'records';
}

const mono = "'JetBrains Mono', monospace";

/** 准入材料清单：营业执照必传（落 businessLicenseFile），其余为选传附件 */
const ATTACHMENT_DEFS = [
  {
    key: 'license',
    name: '营业执照（副本）',
    required: true,
    requirement: '彩色扫描件，PDF / JPG / PNG，不超过 5MB，须清晰可辨统一社会信用代码',
  },
  {
    key: 'qualification',
    name: '资质或荣誉材料',
    required: false,
    requirement: 'PDF / JPG / PNG，如有可提供，有助于合规审核',
  },
  {
    key: 'supplement',
    name: '补充说明文件',
    required: false,
    requirement: '其他需要说明的材料，PDF / DOCX',
  },
] as const;

type AttachmentKey = (typeof ATTACHMENT_DEFS)[number]['key'];

function attachmentFileOf(
  source: { businessLicenseFile?: string; attachments?: { qualification?: string; supplement?: string } },
  key: AttachmentKey,
): string {
  if (key === 'license') return source.businessLicenseFile ?? '';
  return source.attachments?.[key] ?? '';
}

export function VendorAccessManage({ addToast, currentRole, view = 'main' }: Props) {
  const store = useVendorAccess();

  if (currentRole === '药厂销售部门') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={Ban}
          title="无权访问"
          description="服务商准入模块仅对服务商与药厂合规部门开放，当前角色未开通该页面权限。"
        />
      </div>
    );
  }

  if (currentRole === '药厂合规部门') {
    return <ComplianceReview addToast={addToast} records={store.records} approve={store.approve} reject={store.reject} />;
  }

  if (view === 'records') {
    return <VendorRecords myRecord={store.myRecord} />;
  }

  return (
    <VendorMyAccess
      addToast={addToast}
      myRecord={store.myRecord}
      saveDraft={store.saveDraft}
      submit={store.submit}
      deleteDraft={store.deleteDraft}
    />
  );
}

type DraftOp = (input: VendorAccessInput) => { ok: boolean; error?: string };

// ─── 服务商端：我的准入资料 ───────────────────────────────────────────────────

function VendorMyAccess({
  addToast,
  myRecord,
  saveDraft,
  submit,
  deleteDraft,
}: {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  myRecord?: VendorAccessRecord;
  saveDraft: DraftOp;
  submit: DraftOp;
  deleteDraft: () => { ok: boolean; error?: string };
}) {
  const status = myRecord?.status;
  const fromRejected = status === '已驳回';
  const [editing, setEditing] = useState(status === undefined || status === '草稿');
  const [form, setForm] = useState<VendorAccessInput>(() => recordToInput(myRecord));
  const [formError, setFormError] = useState('');

  function setF<K extends keyof VendorAccessInput>(key: K, value: VendorAccessInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setAttachment(key: AttachmentKey, fileName: string | undefined) {
    setForm((f) =>
      key === 'license'
        ? { ...f, businessLicenseFile: fileName ?? '' }
        : { ...f, attachments: { ...f.attachments, [key]: fileName } },
    );
  }

  function runOp(op: DraftOp, successTitle: string, successDesc?: string) {
    const res = op({ ...form });
    if (!res.ok) {
      setFormError(res.error ?? '操作失败');
      addToast({ type: 'error', title: res.error ?? '操作失败' });
      return;
    }
    setFormError('');
    addToast({ type: 'success', title: successTitle, description: successDesc });
    setEditing(false);
  }

  function startEdit() {
    setForm(recordToInput(myRecord));
    setFormError('');
    setEditing(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="服务商准入"
        description="请填写企业基本资料并提交药厂合规审核。"
        dataRange={myRecord?.vendorName ?? '本企业'}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {!myRecord && !editing && (
          <EmptyState
            icon={FileText}
            title="完成服务商准入后即可承接合作"
            description="请提交企业基本资料和营业执照，药厂合规部门审核通过后完成准入。"
            action={{ label: '填写并提交资料', onClick: () => { setForm(emptyVendorAccessInput()); setEditing(true); } }}
          />
        )}

        {!myRecord && editing && (
          <EditPanel
            form={form}
            formError={formError}
            onChange={setF}
            onSetAttachment={setAttachment}
            secondary={(
              <>
                <Button variant="secondary" onClick={() => runOp(saveDraft, '已保存草稿', '资料仅本企业可见，可继续补充后提交。')}>保存草稿</Button>
                <Button variant="primary" onClick={() => runOp(submit, '已提交审核', '请等待药厂合规部门审核。')}>提交审核</Button>
              </>
            )}
          />
        )}

        {myRecord && editing && (
          <EditPanel
            form={form}
            formError={formError}
            rejectionReason={fromRejected ? myRecord.rejectionReason : undefined}
            onChange={setF}
            onSetAttachment={setAttachment}
            secondary={fromRejected ? (
              <>
                <Button variant="outline" onClick={() => { setEditing(false); setFormError(''); }}>取消</Button>
                <Button variant="primary" onClick={() => runOp(submit, '资料已重新提交审核', '此前的驳回记录已保留在提交记录中。')}>提交审核</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" style={{ color: '#C73A3A' }} onClick={() => {
                  const res = deleteDraft();
                  if (res.ok) {
                    addToast({ type: 'info', title: '草稿已删除' });
                    setForm(emptyVendorAccessInput());
                    setFormError('');
                    setEditing(false);
                  } else {
                    addToast({ type: 'error', title: res.error ?? '操作失败' });
                  }
                }}>删除草稿</Button>
                <Button variant="secondary" onClick={() => runOp(saveDraft, '已保存草稿', '资料仅本企业可见，可继续补充后提交。')}>保存草稿</Button>
                <Button variant="primary" onClick={() => runOp(submit, '已提交审核', '请等待药厂合规部门审核。')}>提交审核</Button>
              </>
            )}
          />
        )}

        {myRecord && !editing && <ReadonlyAccessPanel record={myRecord} onResubmit={startEdit} />}
      </div>
    </div>
  );
}

function recordToInput(record?: VendorAccessRecord): VendorAccessInput {
  if (!record) return emptyVendorAccessInput();
  return {
    vendorName: record.vendorName,
    creditCode: record.creditCode,
    legalRep: record.legalRep,
    address: record.address,
    contactName: record.contactName,
    contactMobile: record.contactMobile,
    businessLicenseFile: record.businessLicenseFile,
    attachments: { ...record.attachments },
  };
}

function EditPanel({
  form,
  formError,
  rejectionReason,
  onChange,
  onSetAttachment,
  secondary,
}: {
  form: VendorAccessInput;
  formError: string;
  rejectionReason?: string;
  onChange: <K extends keyof VendorAccessInput>(key: K, value: VendorAccessInput[K]) => void;
  onSetAttachment: (key: AttachmentKey, fileName: string | undefined) => void;
  secondary: ReactNode;
}) {
  const [uploadFor, setUploadFor] = useState<AttachmentKey | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState('');

  function openUpload(key: AttachmentKey) {
    setUploadFor(key);
    setUploadName(attachmentFileOf(form, key));
    setUploadError('');
  }

  function confirmUpload() {
    const name = uploadName.trim();
    if (!name) {
      setUploadError('请填写附件文件名');
      return;
    }
    if (uploadFor) onSetAttachment(uploadFor, name);
    setUploadFor(null);
  }

  const uploadedCount = ATTACHMENT_DEFS.filter((d) => attachmentFileOf(form, d.key).trim()).length;
  const uploadTarget = ATTACHMENT_DEFS.find((d) => d.key === uploadFor);

  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24, maxWidth: 880 }}>
      {rejectionReason !== undefined && (
        <div style={{ marginBottom: 16 }}>
          <RejectionBanner text={rejectionReason} />
        </div>
      )}
      {formError && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6', color: '#C73A3A', fontSize: 'var(--fs-13)', fontWeight: 600 }}>
          {formError}
        </div>
      )}

      <FieldGroup title="基本资料">
        <Field label="公司名称" required>
          <input value={form.vendorName} onChange={(e) => onChange('vendorName', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="统一社会信用代码" required>
          <input value={form.creditCode} onChange={(e) => onChange('creditCode', e.target.value)} style={{ ...inputStyle, fontFamily: mono }} />
        </Field>
        <Field label="法定代表人" required>
          <input value={form.legalRep} onChange={(e) => onChange('legalRep', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="注册地址" required>
          <input value={form.address} onChange={(e) => onChange('address', e.target.value)} style={inputStyle} />
        </Field>
      </FieldGroup>

      <FieldGroup title="联系方式">
        <Field label="联系人姓名" required>
          <input value={form.contactName} onChange={(e) => onChange('contactName', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="联系电话" required>
          <input value={form.contactMobile} onChange={(e) => onChange('contactMobile', e.target.value)} style={{ ...inputStyle, fontFamily: mono }} />
        </Field>
      </FieldGroup>

      <FieldGroup title="证明材料">
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, background: '#FBFCFD', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F3F6FA', borderBottom: '1px solid var(--color-border)' }}>
              <Folder size={15} style={{ color: 'var(--color-brand)' }} />
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>准入材料清单</span>
              <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>按以下要求上传附件</span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-12)', color: uploadedCount ? '#248A5A' : '#C77A16', fontWeight: 600 }}>
                已传 {uploadedCount} / {ATTACHMENT_DEFS.length} 项（必传 1 项）
              </span>
            </div>
            {ATTACHMENT_DEFS.map((def, idx) => {
              const fileName = attachmentFileOf(form, def.key).trim();
              return (
                <div
                  key={def.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderBottom: idx < ATTACHMENT_DEFS.length - 1 ? '1px solid #F3F4F6' : 'none',
                  }}
                >
                  <FileText size={16} style={{ color: fileName ? '#248A5A' : '#C0C6CF', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>{def.name}</span>
                      <span style={{
                        fontSize: 'var(--fs-11)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: def.required ? '#FEECEC' : '#F3F4F6',
                        color: def.required ? '#C73A3A' : '#667085',
                        fontWeight: 600,
                      }}>
                        {def.required ? '必传' : '选传'}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 3 }}>{def.requirement}</div>
                    <div style={{ fontSize: 'var(--fs-12)', marginTop: 5, color: fileName ? '#248A5A' : '#C0C6CF' }}>
                      {fileName ? `已上传：${fileName}` : '未上传'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {fileName && (
                      <AttachmentPreviewButton
                        fileName={fileName}
                        kind={def.key === 'license' ? 'license' : 'generic'}
                        data={form}
                      />
                    )}
                    {fileName && !def.required && (
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} style={{ color: '#C73A3A' }} onClick={() => onSetAttachment(def.key, undefined)}>删除</Button>
                    )}
                    <Button variant={fileName ? 'ghost' : 'primary'} size="sm" icon={<Upload size={13} />} onClick={() => openUpload(def.key)}>
                      {fileName ? '重新上传' : '上传'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FieldGroup>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        {secondary}
      </div>

      <Modal
        open={!!uploadFor}
        title={uploadTarget ? `上传 · ${uploadTarget.name}` : ''}
        onClose={() => setUploadFor(null)}
        width={480}
        footer={(
          <>
            <Button variant="outline" onClick={() => setUploadFor(null)}>取消</Button>
            <Button variant="primary" icon={<Upload size={14} />} disabled={!uploadName.trim()} onClick={confirmUpload}>确认上传</Button>
          </>
        )}
      >
        {uploadTarget && (
          <>
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#F9FAFB', fontSize: 'var(--fs-12)', color: '#667085' }}>
              要求：{uploadTarget.requirement}
            </div>
            <Field label="附件文件名" required>
              <input
                value={uploadName}
                onChange={(e) => { setUploadName(e.target.value); if (uploadError) setUploadError(''); }}
                style={inputStyle}
                placeholder="例如：智联科技有限公司-营业执照.pdf"
              />
            </Field>
            {uploadError && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-12)', marginTop: 8 }}>{uploadError}</div>}
            <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>原型以文件名模拟上传，不做真实文件解析。</div>
          </>
        )}
      </Modal>
    </div>
  );
}

function RejectionBanner({ text }: { text: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Ban size={15} style={{ color: '#C73A3A' }} />
        <span style={{ fontSize: 'var(--fs-14)', fontWeight: 700, color: '#C73A3A' }}>已驳回</span>
      </div>
      <div style={{ fontSize: 'var(--fs-13)', color: '#C73A3A', lineHeight: 1.6 }}>
        驳回原因：<strong>{text || '—'}</strong>
      </div>
    </div>
  );
}

function ReadonlyAccessPanel({ record, onResubmit }: { record: VendorAccessRecord; onResubmit: () => void }) {
  const status = record.status;

  return (
    <div style={{ maxWidth: 880 }}>
      {status === '待提交' && (
        <StatusBanner tone="info" tag="待提交">
          <strong>待药厂合规审核</strong>：资料已于 {record.submittedAt} 提交，暂不可修改。下一步由药厂合规部门通过或驳回。
        </StatusBanner>
      )}
      {status === '已驳回' && (
        <div style={{ marginBottom: 16 }}>
          <RejectionBanner text={record.rejectionReason ?? ''} />
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={onResubmit}>修改并重新提交</Button>
          </div>
        </div>
      )}
      {status === '已通过' && (
        <StatusBanner tone="success" tag="已通过">
          <strong>准入已通过</strong>：已于 {record.reviewedAt} 由 {record.reviewedBy} 审核通过。资料与历史均为只读。
        </StatusBanner>
      )}

      {status !== '已驳回' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' }}>
          <MetricCard compact title="待提交" value={status === '待提交' ? 1 : 0} icon={ClipboardCheck} iconColor="#C77A16" iconBg="#FEF3E2" />
          <MetricCard compact title="已通过" value={status === '已通过' ? 1 : 0} icon={BadgeCheck} iconColor="#248A5A" iconBg="#E6F5ED" />
          <MetricCard compact title="已驳回" value={status === '已驳回' ? 1 : 0} icon={Ban} iconColor="#C73A3A" iconBg="#FEECEC" />
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24 }}>
        <FieldGroup title="基本资料">
          <FieldItem label="公司名称" value={record.vendorName} />
          <FieldItem label="统一社会信用代码" value={<span style={{ fontFamily: mono }}>{record.creditCode}</span>} />
          <FieldItem label="法定代表人" value={record.legalRep} />
          <FieldItem label="注册地址" value={record.address} span />
        </FieldGroup>
        <FieldGroup title="联系方式">
          <FieldItem label="联系人姓名" value={record.contactName} />
          <FieldItem label="联系电话" value={<span style={{ fontFamily: mono }}>{record.contactMobile}</span>} />
        </FieldGroup>
        <FieldGroup title="证明材料">
          <div style={{ gridColumn: '1 / -1' }}>
            <AttachmentReadonlyList record={record} />
          </div>
        </FieldGroup>
        {status === '已通过' && (
          <FieldGroup title="审核信息">
            <FieldItem label="审核人" value={record.reviewedBy} />
            <FieldItem label="审核时间" value={record.reviewedAt} />
          </FieldGroup>
        )}
        {status === '已驳回' && (
          <FieldGroup title="驳回信息">
            <FieldItem label="审核人" value={record.reviewedBy} />
            <FieldItem label="审核时间" value={record.reviewedAt} />
            <FieldItem label="驳回原因" value={record.rejectionReason} span />
          </FieldGroup>
        )}

        <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 12px' }}>提交记录</div>
        <HistoryTimeline history={record.history} />
      </div>
    </div>
  );
}

function StatusBanner({ tone, tag, children }: { tone: 'info' | 'success'; tag: string; children: ReactNode }) {
  const cfg = tone === 'success'
    ? { bg: '#E6F5ED', border: '#C8E9D6', color: '#248A5A' }
    : { bg: '#EBF2FE', border: '#C9DDF7', color: '#2F6BCE' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <StatusTag status={tag} />
      <span style={{ fontSize: 'var(--fs-13)', color: cfg.color, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

// ─── 服务商端：提交记录 ───────────────────────────────────────────────────────

interface SubmissionRow {
  submittedAt: string;
  outcome: '待审核' | '已通过' | '已驳回';
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
}

function submissionRowsOf(record: VendorAccessRecord): SubmissionRow[] {
  const rows: SubmissionRow[] = [];
  for (const e of [...record.history].reverse()) {
    if (e.action === '提交') {
      rows.push({ submittedAt: e.time, outcome: '待审核' });
    } else if (e.action === '通过' || e.action === '驳回') {
      const open = [...rows].reverse().find((r) => r.outcome === '待审核');
      if (open) {
        open.outcome = e.action === '通过' ? '已通过' : '已驳回';
        open.reviewedBy = e.operator;
        open.reviewedAt = e.time;
        open.reason = e.comment;
      }
    }
  }
  return rows.reverse();
}

function VendorRecords({ myRecord }: { myRecord?: VendorAccessRecord }) {
  const rows = myRecord ? submissionRowsOf(myRecord) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="提交记录"
        description="查看本企业准入资料的历次提交与审核结果。"
        dataRange={myRecord?.vendorName ?? '本企业'}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {!myRecord || rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="暂无提交记录"
            description="完成首次资料提交后，可在此查看每次提交的时间与审核结果。"
          />
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr>
                    {['提交时间', '审核结果', '审核人', '审核时间', '驳回原因'].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={`${r.submittedAt}-${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ ...tdStyle, fontFamily: mono, fontSize: 'var(--fs-12)' }}>{r.submittedAt}</td>
                      <td style={tdStyle}>
                        {r.outcome === '待审核' ? <StatusTag status="待提交" /> : <StatusTag status={r.outcome} />}
                      </td>
                      <td style={tdStyle}>{r.reviewedBy || '—'}</td>
                      <td style={{ ...tdStyle, fontFamily: mono, fontSize: 'var(--fs-12)' }}>{r.reviewedAt || '—'}</td>
                      <td style={{ ...tdStyle, color: r.reason ? '#C73A3A' : undefined }}>{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 药厂合规端：服务商准入审核 ───────────────────────────────────────────────

const ACCESS_STATUSES: { value: string; label: string }[] = [
  { value: '待提交', label: '待提交' },
  { value: '已通过', label: '已通过' },
  { value: '已驳回', label: '已驳回' },
];

function ComplianceReview({
  addToast,
  records,
  approve,
  reject,
}: {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  records: VendorAccessRecord[];
  approve: (recordId: string) => { ok: boolean; error?: string };
  reject: (recordId: string, reason: string) => { ok: boolean; error?: string };
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  // 草稿仅服务商本地可见，不进入合规列表与待办
  const visible = useMemo(() => records.filter((r) => r.status !== '草稿'), [records]);
  const pendingCount = visible.filter((r) => r.status === '待提交').length;

  const filtered = useMemo(() => visible
    .filter((r) => {
      const kw = applied.name?.trim();
      if (kw && !r.vendorName.includes(kw) && !r.creditCode.includes(kw)) return false;
      if (applied.status && r.status !== applied.status) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.status === '待提交' && b.status !== '待提交') return -1;
      if (b.status === '待提交' && a.status !== '待提交') return 1;
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
    }), [visible, applied]);

  const detail = detailId ? records.find((r) => r.id === detailId) : undefined;
  const approveTarget = approveConfirmId ? records.find((r) => r.id === approveConfirmId) : undefined;

  function confirmApprove() {
    if (!approveTarget) return;
    const res = approve(approveTarget.id);
    if (res.ok) {
      addToast({ type: 'success', title: `已通过「${approveTarget.vendorName}」的准入申请` });
      setApproveConfirmId(null);
      setDetailId(null);
    } else {
      addToast({ type: 'error', title: res.error ?? '操作失败' });
    }
  }

  function confirmReject() {
    if (!rejectId) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('驳回原因不能少于 5 个字符');
      return;
    }
    const res = reject(rejectId, rejectReason);
    if (res.ok) {
      addToast({ type: 'warning', title: '已驳回该服务商的准入申请', description: '服务商修改后可重新提交。' });
      setRejectId(null);
      setRejectReason('');
      setRejectError('');
      setDetailId(null);
    } else {
      setRejectError(res.error ?? '操作失败');
    }
  }

  const filterFields = [
    { id: 'name', label: '服务商 / 信用代码', type: 'text' as const, placeholder: '名称或统一社会信用代码' },
    { id: 'status', label: '状态', type: 'select' as const, options: ACCESS_STATUSES },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="服务商准入审核"
        description="审核服务商提交的准入资料。"
        dataRange="全部服务商"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ padding: '10px 16px', marginBottom: 12, borderRadius: 8, background: pendingCount ? '#FEF3E2' : '#F3F4F6', border: `1px solid ${pendingCount ? '#FDE68A' : 'var(--color-border)'}`, fontSize: 'var(--fs-13)', color: pendingCount ? '#C77A16' : '#667085' }}>
          待审核 <strong style={{ fontFamily: mono }}>{pendingCount}</strong> 家{pendingCount > 0 ? '，请及时处理' : ''}
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters((p) => ({ ...p, [id]: val }))}
          onSearch={() => setApplied(filters)}
          onReset={() => { setFilters({}); setApplied({}); }}
          stats={<span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: mono }}>{filtered.length}</strong> 条提交记录</span>}
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  {['服务商名称', '统一社会信用代码', '联系人', '提交时间', '状态', '操作'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="暂无提交记录" description="服务商提交准入资料后在此审核" /></td></tr>
                ) : filtered.map((r, idx) => (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.vendorName}</td>
                    <td style={{ ...tdStyle, fontFamily: mono, fontSize: 'var(--fs-12)' }}>{r.creditCode}</td>
                    <td style={tdStyle}>{r.contactName}</td>
                    <td style={{ ...tdStyle, fontFamily: mono, fontSize: 'var(--fs-12)' }}>{r.submittedAt || '—'}</td>
                    <td style={tdStyle}>
                      {r.status === '待提交' ? <StatusTag status="待提交" /> : <StatusTag status={r.status} />}
                    </td>
                    <td style={tdStyle}>
                      {r.status === '待提交' ? (
                        <Button variant="primary" size="sm" onClick={() => setDetailId(r.id)}>审核</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(r.id)}>查看</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 审核详情 */}
      <Modal
        open={!!detail}
        title={detail ? `准入资料 · ${detail.vendorName}` : ''}
        onClose={() => setDetailId(null)}
        width={720}
        footer={detail && (
          <>
            <Button variant="outline" onClick={() => setDetailId(null)}>关闭</Button>
            {detail.status === '待提交' && (
              <>
                <Button variant="danger" onClick={() => { setRejectId(detail.id); setRejectReason(''); setRejectError(''); }}>驳回</Button>
                <Button variant="primary" icon={<BadgeCheck size={14} />} onClick={() => setApproveConfirmId(detail.id)}>通过</Button>
              </>
            )}
          </>
        )}
      >
        {detail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {detail.status === '待提交' ? <StatusTag status="待提交" /> : <StatusTag status={detail.status} />}
              <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
                提交时间：<span style={{ fontFamily: mono }}>{detail.submittedAt || '—'}</span>
              </span>
            </div>

            {detail.status === '已驳回' && (
              <div style={{ marginBottom: 16 }}>
                <RejectionBanner text={detail.rejectionReason ?? ''} />
              </div>
            )}
            {detail.status === '已通过' && (
              <div style={{ marginBottom: 16 }}>
                <StatusBanner tone="success" tag="已通过">
                  已于 {detail.reviewedAt} 由 {detail.reviewedBy} 审核通过。
                </StatusBanner>
              </div>
            )}

            <FieldGroup title="企业基础资料">
              <FieldItem label="公司名称" value={detail.vendorName} />
              <FieldItem label="统一社会信用代码" value={<span style={{ fontFamily: mono }}>{detail.creditCode}</span>} />
              <FieldItem label="法定代表人" value={detail.legalRep} />
              <FieldItem label="注册地址" value={detail.address} span />
              <FieldItem label="联系人姓名" value={detail.contactName} />
              <FieldItem label="联系电话" value={<span style={{ fontFamily: mono }}>{detail.contactMobile}</span>} />
            </FieldGroup>

            <FieldGroup title="证明材料">
              <div style={{ gridColumn: '1 / -1' }}>
                <AttachmentReadonlyList record={detail} />
              </div>
            </FieldGroup>

            {detail.reviewedAt && (
              <FieldGroup title="审核信息">
                <FieldItem label="审核人" value={detail.reviewedBy} />
                <FieldItem label="审核时间" value={detail.reviewedAt} />
                {detail.rejectionReason && <FieldItem label="驳回原因" value={detail.rejectionReason} span />}
              </FieldGroup>
            )}

            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 12px' }}>提交历史</div>
            <HistoryTimeline history={detail.history} />
          </div>
        )}
      </Modal>

      {/* 通过确认 */}
      <Modal
        open={!!approveTarget}
        title="确认通过"
        onClose={() => setApproveConfirmId(null)}
        width={440}
        footer={(
          <>
            <Button variant="outline" onClick={() => setApproveConfirmId(null)}>取消</Button>
            <Button variant="primary" onClick={confirmApprove}>确认通过</Button>
          </>
        )}
      >
        <div style={{ fontSize: 'var(--fs-14)', color: 'var(--color-text-1)', lineHeight: 1.7 }}>
          确认通过「{approveTarget?.vendorName}」的准入申请？
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 8 }}>通过后该服务商完成准入，本页不再出现待审核记录。</div>
      </Modal>

      {/* 驳回原因 */}
      <Modal
        open={!!rejectId}
        title="驳回准入申请"
        onClose={() => { setRejectId(null); setRejectError(''); }}
        width={480}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectError(''); }}>取消</Button>
            <Button variant="danger" disabled={!rejectReason.trim()} onClick={confirmReject}>确认驳回</Button>
          </>
        )}
      >
        <Field label="驳回原因" required>
          <textarea
            value={rejectReason}
            onChange={(e) => { setRejectReason(e.target.value); if (rejectError) setRejectError(''); }}
            rows={4}
            placeholder="请说明需要补充或修改的内容（不少于 5 个字符）"
            style={{ ...inputStyle, height: 'auto', padding: 10 }}
          />
        </Field>
        {rejectError && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-12)', marginTop: 8 }}>{rejectError}</div>}
      </Modal>
    </div>
  );
}

// ─── 共享：历史时间线 ─────────────────────────────────────────────────────────

function HistoryTimeline({ history }: { history: VendorAccessHistory[] }) {
  return (
    <div>
      {history.map((e, idx) => (
        <div key={e.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
          {idx < history.length - 1 && (
            <div style={{ position: 'absolute', left: 7, top: 16, bottom: 0, width: 2, background: '#E5E7EB' }} />
          )}
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-brand-subtle)', border: '2px solid var(--color-brand)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>
              {e.action} · {e.operator}（{e.role}）
            </div>
            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: mono }}>{e.time}</div>
            {e.comment && (
              <div style={{ marginTop: 6, fontSize: 'var(--fs-13)', background: '#F9FAFB', padding: '8px 10px', borderRadius: 6 }}>{e.comment}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 共享：证明材料清单与附件预览（原型以文件名模拟上传，预览为示意版式） ───

interface LicenseDocData {
  vendorName: string;
  creditCode: string;
  legalRep: string;
  address: string;
}

type AttachmentPreviewKind = 'license' | 'generic';

function LicenseDocumentMock({ data }: { data: LicenseDocData }) {
  const row = (label: string, value: ReactNode, span?: boolean) => (
    <div style={{ gridColumn: span ? '1 / -1' : undefined, display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span style={{ width: 110, flexShrink: 0, fontSize: 'var(--fs-13)', color: '#8A6D1A', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-13)', color: '#374151', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
  return (
    <div style={{ position: 'relative', background: '#FFFCF2', border: '2px solid #D4B85A', borderRadius: 8, padding: '28px 32px 24px', boxShadow: 'inset 0 0 0 1px #F5E9C8' }}>
      <div style={{ textAlign: 'center', fontSize: 'var(--fs-22)', fontWeight: 700, color: '#B02A2A', letterSpacing: '0.3em', fontFamily: "'Songti SC','STSong',serif" }}>
        营业执照
      </div>
      <div style={{ textAlign: 'center', fontSize: 'var(--fs-12)', color: '#C9A227', margin: '4px 0 18px' }}>（副本）· 原型示意样式</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
        {row('统一社会信用代码', <span style={{ fontFamily: mono, letterSpacing: '0.05em' }}>{data.creditCode || '—'}</span>, true)}
        {row('名\u3000\u3000\u3000\u3000称', data.vendorName || '—', true)}
        {row('类\u3000\u3000\u3000\u3000型', '有限责任公司')}
        {row('法定代表人', data.legalRep || '—')}
        {row('住\u3000\u3000\u3000\u3000所', data.address || '—', true)}
      </div>

      <div style={{ position: 'absolute', right: 44, bottom: 36, width: 88, height: 88, borderRadius: '50%', border: '3px solid rgba(199,58,58,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-12deg)', opacity: 0.85 }}>
        <div style={{ textAlign: 'center', color: 'rgba(199,58,58,0.85)', fontSize: 11, fontWeight: 700, lineHeight: 1.5 }}>市场监督管理<br />备案示意章</div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ width: 180, height: 30, background: 'repeating-linear-gradient(90deg, #374151 0 2px, transparent 2px 4px, #374151 4px 5px, transparent 5px 9px)' }} />
        <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', fontFamily: mono }}>{(data.creditCode || '0000000000000000').slice(-8)}</div>
      </div>
    </div>
  );
}

/** 非执照附件的通用文档示意：纸张卡片 + 大图标 + 文件名 */
function GenericDocumentMock({ fileName }: { fileName: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '40px 32px 32px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ width: 64, height: 76, margin: '0 auto 16px', borderRadius: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FileText size={30} style={{ color: '#9CA3AF' }} />
      </div>
      <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)', wordBreak: 'break-all' }}>{fileName}</div>
      <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>文档内容示意 · 附件已随准入资料一并提交</div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed #E5E7EB', fontSize: 'var(--fs-11)', color: '#D1D5DB', letterSpacing: '0.2em' }}>原型示意页面</div>
    </div>
  );
}

function AttachmentPreviewModal({ open, fileName, kind, data, onClose }: { open: boolean; fileName: string; kind: AttachmentPreviewKind; data?: LicenseDocData; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title={`附件预览 · ${fileName}`}
      onClose={onClose}
      width={640}
      footer={<Button variant="outline" onClick={onClose}>关闭</Button>}
    >
      {kind === 'license' && data ? <LicenseDocumentMock data={data} /> : <GenericDocumentMock fileName={fileName} />}
      <div style={{ marginTop: 12, fontSize: 'var(--fs-12)', color: '#9CA3AF', textAlign: 'center' }}>
        原型以文件名模拟附件，本预览为示意版式，不做真实文件解析。
      </div>
    </Modal>
  );
}

/** 只读态：文件名渲染为可点击的附件 chip */
function AttachmentPreviewLink({ fileName, kind, data }: { fileName?: string; kind: AttachmentPreviewKind; data?: LicenseDocData }) {
  const [open, setOpen] = useState(false);
  if (!fileName?.trim()) return <span style={{ color: '#D1D5DB' }}>—</span>;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          background: 'var(--color-brand-subtle)',
          color: 'var(--color-brand)',
          border: '1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)',
          borderRadius: 6,
          fontSize: 'var(--fs-12)',
          cursor: 'pointer',
          maxWidth: '100%',
        }}
      >
        <FileText size={13} style={{ flexShrink: 0 }} />
        <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        <Eye size={13} style={{ flexShrink: 0 }} />
        预览
      </button>
      <AttachmentPreviewModal open={open} fileName={fileName} kind={kind} data={data} onClose={() => setOpen(false)} />
    </>
  );
}

/** 编辑态：清单行内的预览按钮 */
function AttachmentPreviewButton({ fileName, kind, data }: { fileName: string; kind: AttachmentPreviewKind; data?: LicenseDocData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" icon={<Eye size={13} />} disabled={!fileName.trim()} onClick={() => setOpen(true)}>
        预览
      </Button>
      <AttachmentPreviewModal open={open} fileName={fileName} kind={kind} data={data} onClose={() => setOpen(false)} />
    </>
  );
}

/** 只读态材料清单（服务商资料区 + 合规审核详情共用） */
function AttachmentReadonlyList({ record }: { record: VendorAccessRecord }) {
  const uploadedCount = ATTACHMENT_DEFS.filter((d) => attachmentFileOf(record, d.key).trim()).length;
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F3F6FA', borderBottom: '1px solid var(--color-border)' }}>
        <Folder size={15} style={{ color: 'var(--color-brand)' }} />
        <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>准入材料清单</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-12)', color: '#667085' }}>
          已传 <strong style={{ color: uploadedCount ? '#248A5A' : '#C77A16' }}>{uploadedCount}</strong> / {ATTACHMENT_DEFS.length} 项
        </span>
      </div>
      {ATTACHMENT_DEFS.map((def, idx) => {
        const fileName = attachmentFileOf(record, def.key).trim();
        return (
          <div
            key={def.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderBottom: idx < ATTACHMENT_DEFS.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}
          >
            <FileText size={15} style={{ color: fileName ? '#248A5A' : '#C0C6CF', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', fontWeight: fileName ? 600 : 400 }}>{def.name}</span>
              <span style={{
                fontSize: 'var(--fs-11)',
                padding: '1px 6px',
                borderRadius: 4,
                background: def.required ? '#FEECEC' : '#F3F4F6',
                color: def.required ? '#C73A3A' : '#667085',
                fontWeight: 600,
              }}>
                {def.required ? '必传' : '选传'}
              </span>
            </div>
            <div style={{ flexShrink: 0 }}>
              {fileName ? (
                <AttachmentPreviewLink fileName={fileName} kind={def.key === 'license' ? 'license' : 'generic'} data={record} />
              ) : (
                <span style={{ fontSize: 'var(--fs-12)', color: '#C0C6CF' }}>未上传</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
