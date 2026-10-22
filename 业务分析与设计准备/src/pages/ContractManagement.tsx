/**
 * 合同管理（药厂侧，2026-09-21）
 *
 * 服务商准入完成后的合同归档页：归档双方线下签署合同，上传即归档、删除恢复待上传。
 * 状态机只有两态：待上传 → 已归档。AI 价目整理是后台辅助能力——归档不依赖解析完成，
 * 页面不出现任何 AI 分析状态/进度/百分比；成果通过非阻塞通知与价目表草稿来源提示衔接
 * （价目侧人工调整在「价目表管理」完成，不回到本页）。
 * 列表行 = 本厂「已准入」服务商（VendorAccessContext 派生）；归档信息 = ContractContext。
 * 依据《服务商合同管理原型 UI 设计需求文档 V2.0》。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2, FileText, CheckCircle2, AlertTriangle, X, Info, Eye, Repeat2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StatusTag } from '../components/StatusTag';
import type { ToastMessage } from '../components/Toast';
import type { NavigateFn, NavFocus } from '../types';
import { usePermission } from '../context/PermissionContext';
import { useVendorAccess } from '../context/VendorAccessContext';
import { useContract } from '../context/ContractContext';
import { relationshipsOfPharma, subscribeCooperation, tenantNameOf } from '../data/cooperationModel';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate?: NavigateFn;
  navFocus?: NavFocus;
}

const ACCEPT_EXTS = ['pdf', 'jpg', 'jpeg', 'png'];

function fileExtOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

function sizeTextOf(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 上传时间展示：本会话刚归档（2 分钟内）显示「刚刚」 */
function uploadedAtText(uploadedAt: string | undefined): string {
  if (!uploadedAt) return '—';
  const ts = Date.parse(uploadedAt.replace(' ', 'T'));
  if (!Number.isNaN(ts) && Date.now() - ts < 2 * 60 * 1000) return '刚刚';
  return uploadedAt;
}

/** 低匹配率档：待完善远多于带入（如 5/35）——仍是 done，但通知强调人工补齐（不影响归档） */
function isLowMatch(job: { status: string; importedCount?: number; pendingCount?: number }): boolean {
  return job.status === 'done' && (job.pendingCount ?? 0) > (job.importedCount ?? 0) * 2;
}

interface ContractRow {
  providerTenantId: string;
  vendorName: string;
  vendorAccessRecordId?: string;
}

export function ContractManagement({ addToast, navigate, navFocus }: Props) {
  const { principal, can } = usePermission();
  const { records } = useVendorAccess();
  const { contractOf, aiJobs, uploadContract, deleteContract } = useContract();

  const pharmaTenantId = principal.realm === 'TENANT' ? principal.tenantId : '';
  const canManage = can('contract-management', 'create');

  // 列表行 = 已准入服务商（同一服务商多条已准入取最近一次）∪ 生效合作关系（线下准入导入、无准入记录）
  const [coopRev, bumpCoop] = useState(0);
  useEffect(() => subscribeCooperation(() => bumpCoop(x => x + 1)), []);
  const rows = useMemo<ContractRow[]>(() => {
    void coopRev;
    const byProvider = new Map<string, { row: ContractRow; approvedAt: string }>();
    for (const r of records) {
      if (r.status !== '已准入') continue;
      if (r.pharmaTenantId !== pharmaTenantId) continue;
      if (!r.providerTenantId) continue;
      const prev = byProvider.get(r.providerTenantId);
      if (!prev || (r.approvedAt ?? '') > prev.approvedAt) {
        byProvider.set(r.providerTenantId, {
          row: {
            providerTenantId: r.providerTenantId,
            vendorName: r.vendorName || r.providerTenantId,
            vendorAccessRecordId: r.id,
          },
          approvedAt: r.approvedAt ?? '',
        });
      }
    }
    for (const rel of relationshipsOfPharma(pharmaTenantId)) {
      if (rel.status !== 'active' || byProvider.has(rel.providerTenantId)) continue;
      byProvider.set(rel.providerTenantId, {
        row: { providerTenantId: rel.providerTenantId, vendorName: tenantNameOf(rel.providerTenantId) },
        approvedAt: rel.effectiveFrom,
      });
    }
    return [...byProvider.values()]
      .map(({ row }) => row)
      .sort((a, b) => {
        const ca = contractOf(a.providerTenantId);
        const cb = contractOf(b.providerTenantId);
        if (!ca !== !cb) return ca ? 1 : -1; // 待上传在前
        return (cb?.uploadedAt ?? '').localeCompare(ca?.uploadedAt ?? '');
      });
  }, [records, pharmaTenantId, contractOf, coopRev]);

  // ── 上传/替换合同弹窗（居中；对象带入不可改选）──────────────────────────────
  const [upload, setUpload] = useState<{
    mode: 'upload' | 'replace';
    providerTenantId: string;
    vendorName: string;
    vendorAccessRecordId?: string;
    fileName: string;
    sizeText: string;
    error: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openUpload(row: ContractRow, mode: 'upload' | 'replace' = 'upload') {
    setUpload({
      mode,
      providerTenantId: row.providerTenantId,
      vendorName: row.vendorName,
      vendorAccessRecordId: row.vendorAccessRecordId,
      fileName: '',
      sizeText: '',
      error: '',
    });
  }

  function pickFile(file: File | undefined | null) {
    if (!upload || !file) return;
    const ext = fileExtOf(file.name);
    if (!ACCEPT_EXTS.includes(ext)) {
      setUpload({ ...upload, fileName: '', sizeText: '', error: '文件格式不支持：仅支持 PDF、JPG、PNG 文件' });
      return;
    }
    setUpload({ ...upload, fileName: file.name, sizeText: sizeTextOf(file.size), error: '' });
  }

  function confirmUpload() {
    if (!upload) return;
    if (!upload.fileName) {
      setUpload({ ...upload, error: '请先选择已签署的合同文件' });
      return;
    }
    const res = uploadContract({
      providerTenantId: upload.providerTenantId,
      vendorAccessRecordId: upload.vendorAccessRecordId,
      fileName: upload.fileName,
      mode: upload.mode,
    });
    if (!res.ok) {
      setUpload({ ...upload, error: res.error ?? '上传失败，请重试' });
      return;
    }
    const isReplace = upload.mode === 'replace';
    setUpload(null);
    // 非阻塞即时提示：归档成功与后台整理解耦（§5.4）；替换时旧价目草稿保留、以新文件重新入队
    addToast({
      type: 'success',
      title: isReplace ? '合同已替换' : '合同已归档',
      description: isReplace
        ? '系统正在按新合同重新整理价目内容；已生成的价目表草稿会保留，完成后以新合同为来源。'
        : '系统正在后台整理合同中的价目内容。完成后会自动带入价目表草稿，不影响你继续处理其他工作。',
    });
  }

  // 准入通过承接引导（§5.1）：跳入本页直接打开该服务商的上传弹窗，对象不可改选
  const focusUpload = navFocus?.contractUploadProviderTenantId;
  const openedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusUpload || openedFocus.current === focusUpload || !canManage) return;
    const row = rows.find((r) => r.providerTenantId === focusUpload);
    if (!row || contractOf(focusUpload)) return;
    openedFocus.current = focusUpload;
    openUpload(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUpload, rows, canManage]);

  // ── 删除合同（危险操作：二次确认 + 影响说明）────────────────────────────────
  const [del, setDel] = useState<{ contractId: string; fileName: string; providerName: string; hasDraft: boolean } | null>(null);

  // ── 查看合同文件（眼睛：原型以示意版式模拟预览，不做真实文件解析）──────────
  const [viewing, setViewing] = useState<{ fileName: string; providerName: string } | null>(null);

  function confirmDelete() {
    if (!del) return;
    const res = deleteContract(del.contractId);
    if (!res.ok) {
      addToast({ type: 'error', title: '删除失败', description: res.error });
      return;
    }
    addToast({ type: 'success', title: '合同已删除', description: `「${del.providerName}」已恢复为待上传。` });
    setDel(null);
  }

  // ── 后台整理结果通知（非阻塞、可关闭；仅本页会话内完成的通知，历史完成不重弹）──
  const preExistingJobs = useRef<Set<string> | null>(null);
  if (preExistingJobs.current === null) {
    preExistingJobs.current = new Set(aiJobs.filter((j) => j.status !== 'processing').map((j) => j.contractId));
  }
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());
  const notices = aiJobs.filter(
    (j) =>
      (j.status === 'done' || j.status === 'failed') &&
      !preExistingJobs.current!.has(j.contractId) &&
      !dismissedNotices.has(j.contractId),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="合同管理"
        description="管理已准入服务商的线下签署合同与归档文件。"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 后台整理结果通知（轻量、可关闭、不阻塞） */}
        {notices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {notices.map((j) => {
              const low = isLowMatch(j);
              const ok = j.status === 'done' && !low;
              return (
              <div
                key={j.contractId}
                role="status"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderRadius: 8,
                  background: ok ? '#F2FAF5' : '#FFF9EF',
                  border: `1px solid ${ok ? '#C8E9D6' : '#F5D99A'}`,
                }}
              >
                {ok ? (
                  <CheckCircle2 size={15} style={{ color: '#248A5A', flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={15} style={{ color: '#C77A16', flexShrink: 0, marginTop: 2 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-13)', lineHeight: 1.7, color: ok ? '#1F7A4D' : '#92400E' }}>
                  <div style={{ fontWeight: 700 }}>
                    {ok ? '合同价目草稿已生成' : low ? '合同价目草稿已生成（部分匹配）' : '合同已归档，但未能自动整理价目内容'}
                  </div>
                  {ok ? (
                    <div>
                      《{j.contractFileName}》中的 {j.importedCount} 项可识别价目，已带入价目表草稿；其余内容可在价目表管理中按需完善。
                    </div>
                  ) : low ? (
                    <div>
                      《{j.contractFileName}》中仅识别出 {j.importedCount} 项可唯一匹配的价目，已带入价目表草稿；
                      其余 {j.pendingCount} 项未能自动匹配（计价单位或服务项对应关系不明确），请在价目表管理中人工补齐。
                      合同归档不受影响；如原件不清晰，也可删除后重新上传。
                    </div>
                  ) : (
                    <div>你可以在价目表管理手动配置；如文件不清晰，可删除后重新上传。</div>
                  )}
                  {j.status === 'done' && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDismissedNotices((prev) => new Set(prev).add(j.contractId));
                          if (navigate) navigate('price-config');
                          else addToast({ type: 'info', title: '请前往「基础数据 › 价目表配置」查看价目表草稿。' });
                        }}
                      >
                        去价目表管理
                      </Button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDismissedNotices((prev) => new Set(prev).add(j.contractId))}
                  aria-label="关闭通知"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, flexShrink: 0, display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>
              );
            })}
          </div>
        )}

        {/* 合同列表 */}
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <EmptyState
              title="暂无已合作服务商"
              description="服务商通过「服务商准入」审核或线下准入批量导入建立合作后进入本列表，即可上传并归档双方已签署的合同。"
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr>{['服务商', '合同文件名称', '上传人', '上传时间', '合同归档状态', '操作'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', borderBottom: '1px solid var(--color-border)', background: '#F9FAFB', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const contract = contractOf(row.providerTenantId);
                    return (
                      <tr key={row.providerTenantId} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--fs-13)' }}>{row.vendorName}</td>
                        <td style={{ padding: '12px 14px', fontSize: 'var(--fs-13)' }}>
                          {contract?.contractFileName ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <FileText size={13} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
                              {contract.contractFileName}
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Eye size={13} />}
                                title={`查看 ${contract.contractFileName}`}
                                aria-label={`查看 ${contract.contractFileName}`}
                                onClick={() => setViewing({ fileName: contract.contractFileName!, providerName: row.vendorName })}
                              />
                            </span>
                          ) : (
                            <span style={{ color: '#9CA3AF' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 'var(--fs-13)', color: contract ? undefined : '#9CA3AF' }}>{contract?.uploadedBy ?? '—'}</td>
                        <td style={{ padding: '12px 14px', fontSize: 'var(--fs-13)', fontFamily: "'JetBrains Mono', monospace", color: contract ? undefined : '#9CA3AF' }}>{uploadedAtText(contract?.uploadedAt)}</td>
                        <td style={{ padding: '12px 14px' }}><StatusTag status={contract ? '已归档' : '待上传'} size="sm" /></td>
                        <td style={{ padding: '12px 14px' }}>
                          {!canManage ? (
                            <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>只读</span>
                          ) : contract ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Button variant="ghost" size="sm" icon={<Repeat2 size={13} />} onClick={() => openUpload(row, 'replace')}>
                                替换合同
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Trash2 size={13} />}
                                onClick={() =>
                                  setDel({
                                    contractId: contract.id,
                                    fileName: contract.contractFileName ?? '',
                                    providerName: row.vendorName,
                                    hasDraft: aiJobs.some(
                                      (j) => j.providerTenantId === row.providerTenantId && j.status === 'done',
                                    ),
                                  })
                                }
                              >
                                删除
                              </Button>
                            </div>
                          ) : (
                            <Button variant="primary" size="sm" icon={<Upload size={13} />} onClick={() => openUpload(row)}>
                              上传合同
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={12} />
          上传后合同立即归档；价目内容在后台自动整理，完成后自动带入价目表草稿，人工调整在「价目表管理」完成。
        </div>
      </div>

      {/* 上传/替换合同（简易弹窗：选择文件 → 归档） */}
      <Modal
        open={!!upload}
        title={upload?.mode === 'replace' ? '替换合同' : '上传合同'}
        onClose={() => setUpload(null)}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setUpload(null)}>取消</Button>
            <Button variant="primary" icon={<Upload size={13} />} disabled={!upload?.fileName} onClick={confirmUpload}>
              {upload?.mode === 'replace' ? '替换并归档' : '上传并归档'}
            </Button>
          </>
        }
      >
        {upload && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
              <span style={{ color: '#6B7280' }}>服务商</span>
              <strong>{upload.vendorName}</strong>
              <span style={{ fontSize: 'var(--fs-12)', color: '#248A5A' }}>· 已完成准入</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {upload.fileName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 6, background: '#F9FAFB', border: '1px solid var(--color-border)' }}>
                <FileText size={14} style={{ color: '#248A5A', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--fs-13)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  已选择：{upload.fileName} · {upload.sizeText}
                </span>
                <button
                  onClick={() => setUpload({ ...upload, fileName: '', sizeText: '', error: '' })}
                  style={{ background: 'none', border: 'none', color: '#C73A3A', cursor: 'pointer', fontSize: 'var(--fs-12)', flexShrink: 0 }}
                >
                  移除
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '22px 16px', borderRadius: 8, cursor: 'pointer',
                  border: '1.5px dashed var(--color-border)', background: '#FAFBFC', color: '#667085',
                }}
              >
                <Upload size={20} style={{ color: 'var(--color-brand)' }} />
                <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>选择已签署的合同文件</span>
                <span style={{ fontSize: 'var(--fs-12)' }}>支持 PDF、JPG、PNG；可上传扫描件或合同文件。</span>
              </button>
            )}

            {upload.error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEECEC', border: '1px solid #F5C6C6', fontSize: 'var(--fs-12)', color: '#C73A3A' }}>
                {upload.error}
              </div>
            )}

            <div style={{ padding: '9px 12px', borderRadius: 6, background: 'var(--color-brand-subtle)', fontSize: 'var(--fs-12)', color: 'var(--color-brand)', lineHeight: 1.7 }}>
              上传后合同会立即归档。价目内容将在后台自动整理，不需要在此等待。
            </div>

            {upload.mode === 'replace' && (
              <div style={{ padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
                替换后，系统将按新合同重新整理价目内容；已生成的价目表草稿会保留，整理完成后以新合同为来源。
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 删除合同（二次确认 + 影响说明） */}
      <Modal
        open={!!del}
        title="删除合同"
        onClose={() => setDel(null)}
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setDel(null)}>取消</Button>
            <Button variant="danger" icon={<Trash2 size={13} />} onClick={confirmDelete}>删除合同</Button>
          </>
        }
      >
        {del && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 'var(--fs-14)', lineHeight: 1.7 }}>
              确认删除合同文件「<strong>{del.fileName}</strong>」吗？
              <br />
              删除后，该服务商会恢复为「待上传」。
            </div>
            {del.hasDraft && (
              <div style={{ padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', border: '1px solid #F5D99A', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
                该合同已生成价目表草稿：删除合同<b>不会自动删除</b>已生成的价目表草稿，如需调整请在价目表管理中处理。
              </div>
            )}
          </div>
        )}
      </Modal>
      {/* 查看合同文件（示意预览，不做真实文件解析） */}
      <Modal
        open={!!viewing}
        title={`查看合同 · ${viewing?.fileName ?? ''}`}
        onClose={() => setViewing(null)}
        width={640}
        footer={<Button variant="outline" onClick={() => setViewing(null)}>关闭</Button>}
      >
        {viewing && (
          <div>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '40px 32px 32px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ width: 64, height: 76, margin: '0 auto 16px', borderRadius: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={30} style={{ color: '#9CA3AF' }} />
              </div>
              <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)', wordBreak: 'break-all' }}>{viewing.fileName}</div>
              <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>文档内容示意 · 已归档合同（{viewing.providerName}）</div>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed #E5E7EB', fontSize: 'var(--fs-11)', color: '#D1D5DB', letterSpacing: '0.2em' }}>原型示意页面</div>
            </div>
            <div style={{ marginTop: 12, fontSize: 'var(--fs-12)', color: '#9CA3AF', textAlign: 'center' }}>
              原型以文件名模拟附件，不做真实文件解析；如需更换文件请使用「替换合同」。
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
