import { useState, type ReactNode } from 'react';
import {
  Calendar,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Hash,
  Image as ImageIcon,
  Layers,
  ListFilter,
  ShieldCheck,
  Type as TypeIcon,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { StatusTag } from '../../components/StatusTag';
import type { AccessItemKind, AccessRequirementSnapshot, AccessTemplateItem, VendorAccessHistory } from '../../types';
import { isUploadKind, kindLabel } from '../../context/VendorAccessContext';

export const mono = "'JetBrains Mono', monospace";

// ─── 类型徽章（文件类/图片类 + 填写类 + 核查项：上传=信息蓝 / 填写=青 / 核查=琥珀）──

const KIND_META: Partial<Record<AccessItemKind, { label: string; fg: string; bg: string; Icon: typeof FileText }>> = {
  'file': { label: '文件类', fg: '#2F6BCE', bg: '#EBF2FE', Icon: FileText },
  'image': { label: '图片类', fg: '#2F6BCE', bg: '#EBF2FE', Icon: ImageIcon },
  'form-text': { label: '文本', fg: '#0E7490', bg: '#E0F5F6', Icon: TypeIcon },
  'form-number': { label: '数值', fg: '#0E7490', bg: '#E0F5F6', Icon: Hash },
  'form-date': { label: '日期', fg: '#0E7490', bg: '#E0F5F6', Icon: Calendar },
  'form-select': { label: '单选', fg: '#0E7490', bg: '#E0F5F6', Icon: ListFilter },
  'checklist': { label: '核查项', fg: '#C77A16', bg: '#FEF3E2', Icon: ShieldCheck },
};

export function KindBadge({ kind }: { kind: AccessItemKind }) {
  const meta = KIND_META[kind] ?? { label: kindLabel(kind), fg: '#667085', bg: '#F3F4F6', Icon: FileText };
  const { Icon } = meta;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 8px', borderRadius: 999, background: meta.bg, color: meta.fg,
        fontSize: 'var(--fs-11)', fontWeight: 600, flexShrink: 0,
      }}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

/** 新增/编辑准入项可选类型（上传类 2 / 填写类 4；核查类为系统内置内容写死，不开放配置） */
export const ACCESS_KIND_GROUPS: Array<{ title: string; kinds: AccessItemKind[] }> = [
  { title: '上传类', kinds: ['file', 'image'] },
  { title: '填写类', kinds: ['form-text', 'form-number', 'form-date', 'form-select'] },
];

// ─── 项头：编号 + 名称 + 必传星 + 类型徽章 + 来源角标 ──────────────────────────

export function ItemMetaRow({ item, source }: { item: AccessTemplateItem; source?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)' }}>{item.name}</span>
      {item.required && <span style={{ color: '#C73A3A', fontSize: 'var(--fs-14)', fontWeight: 700, lineHeight: 1 }}>*</span>}
      <KindBadge kind={item.kind} />
      {source && (
        <span
          style={{
            fontSize: 'var(--fs-11)', padding: '1px 6px', borderRadius: 4,
            background: item.builtin ? '#F3F4F6' : 'var(--color-brand-subtle)',
            color: item.builtin ? '#98A2B3' : 'var(--color-brand)', fontWeight: 600,
          }}
        >
          {item.builtin ? '默认模板项' : '药厂自建'}
        </span>
      )}
      {item.kind === 'image' && item.minCount ? (
        <span style={{ fontSize: 'var(--fs-11)', color: '#98A2B3' }}>至少 {item.minCount} 张</span>
      ) : null}
    </div>
  );
}

export function CountHint({ current, min, unit = '份' }: { current: number; min: number; unit?: string }) {
  const ok = current >= min;
  return (
    <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: ok ? '#248A5A' : '#C77A16' }}>
      已传 {current} / 至少 {min} {unit}{ok ? '' : '（数量不足）'}
    </span>
  );
}

// ─── 参考材料（两档：普通参考=描边 / 必须使用模板=主色实底横条）────────────────
// review=true（审核视角）：只读一行说明、不带下载动作——审核人无需再次下载模板。

export function RefMaterialTag({
  refMat,
  review,
  onToast,
}: {
  refMat: NonNullable<AccessTemplateItem['templateRef']>;
  /** 审核视角：仅展示要求，不提供下载 */
  review?: boolean;
  onToast?: (msg: { type: 'info'; title: string; description?: string }) => void;
}) {
  if (review) {
    return (
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 6, background: '#F9FAFB',
          border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)',
        }}
      >
        {refMat.enforced ? (
          <>
            <ShieldCheck size={12} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
            <span>要求使用指定模板：<strong style={{ color: 'var(--color-text-1)' }}>{refMat.fileName}</strong>（核对是否按模板出具）</span>
          </>
        ) : (
          <span>该项附有参考材料：{refMat.fileName}</span>
        )}
      </div>
    );
  }
  if (refMat.enforced) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '7px 12px', borderRadius: 6, background: 'var(--color-brand)', color: '#fff',
          fontSize: 'var(--fs-12)', fontWeight: 600,
        }}
      >
        <ShieldCheck size={13} style={{ flexShrink: 0 }} />
        <span>必须使用该模板：{refMat.fileName}</span>
        <button
          onClick={() => onToast?.({ type: 'info', title: '（演示）模板文件下载', description: '原型不产生真实文件，请以文件名模拟上传。' })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 'var(--fs-11)', cursor: 'pointer', fontWeight: 600 }}
        >
          <Download size={11} /> 下载模板
        </button>
        {refMat.note && <span style={{ fontWeight: 400, opacity: 0.85 }}>{refMat.note}</span>}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '4px 10px', borderRadius: 6, background: '#EBF2FE', border: '1px solid #C9DDF7',
        color: '#2F6BCE', fontSize: 'var(--fs-12)',
      }}
    >
      <FileText size={12} />
      <span>参考材料：{refMat.fileName}</span>
      <button
        onClick={() => onToast?.({ type: 'info', title: '（演示）参考材料下载', description: '原型不产生真实文件。' })}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', color: '#2F6BCE', border: 'none', padding: 0, fontSize: 'var(--fs-12)', cursor: 'pointer', textDecoration: 'underline' }}
      >
        <Download size={11} /> 下载
      </button>
      {refMat.note && <span style={{ color: '#667085' }}>{refMat.note}</span>}
    </div>
  );
}

// ─── 分组区块头（左 3px 主色竖条）─────────────────────────────────────────────

export function GroupHeader({ name, count, right }: { name: string; count?: number; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 10, borderLeft: '3px solid var(--color-brand)' }}>
      <span style={{ fontSize: 'var(--fs-14)', fontWeight: 700, color: 'var(--color-text-1)' }}>{name}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontWeight: 600 }}>
          {count} 项
        </span>
      )}
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  );
}

// ─── 审核点对照（可折叠琥珀块；服务商提交前可见，审核员逐条对照）────────────────

export function AuditPointsBox({ item, defaultOpen = false }: { item: AccessTemplateItem; defaultOpen?: boolean }) {
  const points = (item.checkPoints ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (points.length === 0) return null;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--fs-12)', color: open ? 'var(--color-brand)' : 'var(--color-text-3)', fontWeight: 500 }}
      >
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
        {open ? '收起' : '查看'}审核点对照（{points.length} 条）
      </button>
      {open && (
        <div className="va-fade-in" style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#FEF8EE', border: '1px solid #F5D99A' }}>
          {points.map((pt, i) => (
            <p key={i} style={{ margin: i > 0 ? '3px 0 0' : 0, fontSize: 'var(--fs-12)', lineHeight: 1.6, color: '#92400E' }}>
              {pt}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 附件预览（原型示意版式：营业执照仿真 / 通用文档示意）──────────────────────

interface LicenseDocData {
  vendorName: string;
  creditCode: string;
  legalRep: string;
  address: string;
}

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

/** 附件预览 + （演示）下载动作，营业执照文件名命中时用仿真版式 */
export function FileAccessButtons({
  fileName,
  licenseData,
  onToast,
}: {
  fileName: string;
  licenseData?: LicenseDocData;
  onToast?: (msg: { type: 'info'; title: string; description?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const isLicense = /营业执照/.test(fileName);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<Eye size={13} />} title="预览" aria-label={`预览 ${fileName}`} onClick={() => setOpen(true)} />
      <Button
        variant="ghost"
        size="sm"
        icon={<Download size={13} />}
        title="下载（演示）"
        aria-label={`下载 ${fileName}`}
        onClick={() => onToast?.({ type: 'info', title: '（演示）附件下载', description: '原型不产生真实文件。' })}
      />
      <Modal open={open} title={`附件预览 · ${fileName}`} onClose={() => setOpen(false)} width={640} footer={<Button variant="outline" onClick={() => setOpen(false)}>关闭</Button>}>
        {isLicense && licenseData ? <LicenseDocumentMock data={licenseData} /> : <GenericDocumentMock fileName={fileName} />}
        <div style={{ marginTop: 12, fontSize: 'var(--fs-12)', color: '#9CA3AF', textAlign: 'center' }}>
          原型以文件名模拟附件，本预览为示意版式，不做真实文件解析。
        </div>
      </Modal>
    </>
  );
}

export type { LicenseDocData };

/** 文件名 chip（含扩展名图标与移除按钮） */
export function FileChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
        padding: '4px 10px', borderRadius: 6, background: '#F9FAFB', border: '1px solid var(--color-border)',
        fontSize: 'var(--fs-12)', color: 'var(--color-text-1)',
      }}
    >
      <FileText size={12} style={{ color: '#248A5A', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          title="移除"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C73A3A', padding: '0 2px', fontSize: 'var(--fs-12)', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ─── 驳回横幅 / 状态横幅 / 历史时间线 ─────────────────────────────────────────

export function RejectionBanner({ text, extra }: { text: string; extra?: ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 8, background: '#FEECEC', border: '1px solid #F5C6C6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <StatusTag status="已驳回" />
        <span style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#C73A3A' }}>审核驳回</span>
      </div>
      <div style={{ fontSize: 'var(--fs-13)', color: '#C73A3A', lineHeight: 1.6 }}>
        驳回原因：<strong>{text || '—'}</strong>
      </div>
      {extra && <div style={{ marginTop: 10 }}>{extra}</div>}
    </div>
  );
}

export function HistoryTimeline({ history }: { history: VendorAccessHistory[] }) {
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
              {e.action} · {e.operator}
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

// ─── 只读快照清单（审核抽屉材料区 / 服务商提交记录快照共用）────────────────────

export function SnapshotItemsView({
  snapshot,
  attachments,
  responses,
  onToast,
  filterChecklist,
  licenseData,
  section,
  review,
  itemExtra,
}: {
  snapshot: AccessRequirementSnapshot;
  attachments: Record<string, string[]>;
  responses: Record<string, string>;
  onToast: (msg: { type: 'info'; title: string; description?: string }) => void;
  /** 服务商侧=true：过滤核查项（申请方不可见） */
  filterChecklist?: boolean;
  licenseData?: LicenseDocData;
  /** 按页签过滤：upload=上传类 / form=填写类 / 缺省=全部（不含核查项由 filterChecklist 控制） */
  section?: 'upload' | 'form';
  /** 审核视角=true：参考材料只读展示（无下载），整体按审核降噪渲染 */
  review?: boolean;
  /** 每项卡片尾部插槽（审核逐项标记控件 / 已驳回结论徽章；仅对非核查项调用） */
  itemExtra?: (item: AccessTemplateItem) => ReactNode;
}) {
  const items = snapshot.items.filter((i) => {
    if (filterChecklist && i.kind === 'checklist') return false;
    if (section === 'upload') return isUploadKind(i.kind);
    if (section === 'form') return i.kind.startsWith('form-');
    return true;
  });
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        const done = groupItems.every((i) => {
          if (i.kind === 'checklist') return true;
          if (i.kind.startsWith('form-')) return String(responses[i.key] ?? '').trim() !== '';
          return (attachments[i.key] ?? []).filter((f) => f.trim()).length > 0;
        });
        return (
          <div key={group}>
            <GroupHeader
              name={group}
              count={groupItems.length}
              right={done ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-11)', fontWeight: 600, color: '#248A5A' }}>
                  ✓ 已完成上传
                </span>
              ) : undefined}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groupItems.map((item) => {
                // 同名附件去重：存量存储可能带重复项，展示层收敛
                const files = [...new Set((attachments[item.key] ?? []).map((f) => f.trim()).filter(Boolean))];
                const response = String(responses[item.key] ?? '').trim();
                return (
                  <div key={item.key} style={{ padding: '12px 14px', borderRadius: 8, background: '#FAFBFC', border: '1px solid var(--color-border)' }}>
                    <ItemMetaRow item={item} source={!review} />
                    {item.templateRef && (
                      <div style={{ margin: '8px 0 0 38px' }}>
                        <RefMaterialTag refMat={item.templateRef} review={review} onToast={onToast} />
                      </div>
                    )}
                    {item.kind.startsWith('form-') ? (
                      <div style={{ margin: '8px 0 0 38px', fontSize: 'var(--fs-13)' }}>
                        <span style={{ color: 'var(--color-text-3)' }}>填写值：</span>
                        <span style={{ fontWeight: 600, fontFamily: item.kind === 'form-number' ? mono : undefined }}>{response || '—'}</span>
                      </div>
                    ) : files.length > 0 ? (
                      <div style={{ margin: '8px 0 0 38px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {files.map((f) => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileChip name={f} />
                            <FileAccessButtons fileName={f} licenseData={licenseData} onToast={onToast} />
                          </div>
                        ))}
                        {item.minCount && files.length < item.minCount && (
                          <CountHint current={files.length} min={item.minCount} unit={item.kind === 'image' ? '张' : '份'} />
                        )}
                      </div>
                    ) : item.required ? (
                      <div style={{ margin: '8px 0 0 38px', fontSize: 'var(--fs-12)', padding: '4px 10px', borderRadius: 4, background: '#FEF3E2', color: '#C77A16', width: 'fit-content' }}>
                        未上传文件
                      </div>
                    ) : null}
                    <div style={{ margin: '8px 0 0 38px' }}>
                      <AuditPointsBox item={item} />
                    </div>
                    {itemExtra && item.kind !== 'checklist' && (
                      <div style={{ margin: '10px 0 0 38px' }}>{itemExtra(item)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 项级审核结论徽章（药厂已驳回详情 / 服务商重提锁定态共用；通过=绿徽章、驳回=红块带原因） */
export function VerdictBadge({ verdict, reason }: { verdict: 'pass' | 'reject'; reason?: string }) {
  if (verdict === 'pass') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#E6F5ED', border: '1px solid #C8E9D6', color: '#248A5A', fontSize: 'var(--fs-12)', fontWeight: 600, width: 'fit-content' }}>
        ✓ 审核通过
      </span>
    );
  }
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEECEC', border: '1px solid #F5C6C6', fontSize: 'var(--fs-12)', color: '#C73A3A', lineHeight: 1.7, width: 'fit-content' }}>
      <strong>已驳回：</strong>{reason?.trim() || '—'}
    </div>
  );
}

/** 页签行（抽屉详情页签 / 任务内子页签 / 页面级页签通用） */
export function DrawerTabs<T extends string>({
  tabs,
  active,
  onChange,
  badges,
  right,
}: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
  badges?: Partial<Record<T, ReactNode>>;
  /** 行尾右对齐插槽（如审核进度计数） */
  right?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 0',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 'var(--fs-13)', fontWeight: 600,
            color: active === t.key ? 'var(--color-brand)' : 'var(--color-text-2)',
            borderBottom: `2px solid ${active === t.key ? 'var(--color-brand)' : 'transparent'}`,
          }}
        >
          {t.label}
          {badges?.[t.key]}
        </button>
      ))}
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

export function buttonVariantOfStatus(status: string): 'primary' | 'ghost' {
  return status === '待提交' ? 'primary' : 'ghost';
}
