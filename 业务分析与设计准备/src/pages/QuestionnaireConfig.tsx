import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, Eye, FileText, Info, Search, Upload, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { usePermission } from '../context/PermissionContext';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Tag } from '../components/StatusTag';
import { EmptyState } from '../components/EmptyState';
import type { ToastMessage } from '../components/Toast';
import {
  useQuestionnaireStoreSync, listQuestionnaires, nextQuestionnaireCode,
  saveQuestionnaire, replaceQuestionnaireVersion, setQuestionnaireStatus, removeQuestionnaire,
  bindQuestionnaire, surveySchemes,
  type Questionnaire, type QuestionItem,
} from '../data/questionnaireStore';
import { allProductNames, surveyPriceOf, money, usePriceTableStoreSync } from '../data/priceTableStore';
import { downloadCsvTemplate, readQuestionnaireCsvFile } from '../data/questionnaireCsv';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

// ===== 业务常量 =====
// 问卷类型为演示子集：美罗原型共 24 类，完整选项见配套需求文档
const QUESTIONNAIRE_TYPES = ['通用', '满意度', '合理用药', '品牌知名度', '用药依从性', '市场认知度'] as const;
const AUDIENCES = ['医生', '患者', '商业公司'] as const;
const PAGE_SIZE = 15;

const SAMPLE_QUESTIONS: QuestionItem[] = [
  { title: '您获取该药品信息的主要渠道是？', kind: '单选', options: ['学术会议', '医药代表', '同事推荐', '文献期刊', '其他'] },
  { title: '您关注该药品的哪些治疗维度？', kind: '多选', options: ['有效性', '安全性', '使用便捷性', '经济性'] },
  { title: '您对该药品还有哪些补充意见？', kind: '填空' },
];

// ===== 视觉 =====
const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px', fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', background: '#fff',
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const labelSpan: React.CSSProperties = { fontSize: 'var(--fs-12)', color: '#657388', fontWeight: 600 };
const hintP: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-12)', color: '#98A2B3' };

// ===== 品种计价行状态（价格实时从价目 store 读取；空值为未配置，0 为有效价） =====
type BindingStatus = 'ok' | 'noScheme' | 'missingPrice';

function bindingStatus(variety: string, schemeId: string | null | undefined, audience: string): BindingStatus {
  if (!schemeId) return 'noScheme';
  const p = surveyPriceOf(variety, schemeId, audience);
  return p.pub === null || p.priv === null ? 'missingPrice' : 'ok';
}

// ===== 品种多选下拉（行为对齐交互原型：搜索只过滤候选、全选作用于全部品种、勾选即时同步计价行） =====
function ProductPicker({ products, picked, onChange }: {
  products: string[];
  picked: string[];
  /** onChange(next, removed)：removed = 本次离开选择的品种，调用方需丢弃其已选方案 */
  onChange: (next: string[], removed: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? products.filter((p) => p.toLowerCase().includes(q)) : products;
  const allSelected = picked.length === products.length && products.length > 0;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const openPicker = () => {
    setQuery('');
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const toggle = (v: string, on: boolean) => {
    if (on) onChange(picked.includes(v) ? picked : [...picked, v], []);
    else onChange(picked.filter((x) => x !== v), [v]);
  };

  // 组件外点击 / 焦点整体移出 → 收起
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const summary = picked.length
    ? picked.slice(0, 2).join('、') + (picked.length > 2 ? ` 等 ${picked.length} 个品种` : '')
    : '请选择适用品种，可多选';

  return (
    <div ref={rootRef} style={{ position: 'relative', margin: '8px 0 12px' }}
      onBlur={(e) => {
        // React 的 onBlur 由 focusout 委托实现：焦点移出整个组件时收起下拉
        const to = e.relatedTarget as Node | null;
        if (!rootRef.current?.contains(to)) setOpen(false);
      }}>
      <button ref={triggerRef} type="button" aria-expanded={open} aria-label="选择适用品种"
        onClick={() => (open ? close(false) : openPicker())}
        style={{
          width: '100%', minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          textAlign: 'left', padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', background: '#fff',
          border: `1px solid ${open ? 'var(--color-brand)' : 'var(--color-border)'}`, borderRadius: 6,
          boxShadow: open ? '0 0 0 2px var(--color-brand-subtle)' : undefined,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: picked.length ? 'inherit' : '#98A2B3' }}>{summary}</span>
        <span aria-hidden style={{ color: '#8A99AC', fontSize: 12 }}>⌄</span>
      </button>
      {open && (
        <div role="group" aria-label="适用品种多选"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '100%', maxWidth: 520, zIndex: 15,
            border: '1px solid var(--color-border)', borderRadius: 7, background: '#fff', boxShadow: '0 8px 28px rgba(33,58,73,.16)', overflow: 'hidden' }}>
          <div style={{ padding: 12 }}>
            <input ref={searchRef} type="text" placeholder="搜索品种名称" aria-label="搜索品种名称" autoComplete="off"
              value={query} onChange={(e) => { setQuery(e.target.value); if (listRef.current) listRef.current.scrollTop = 0; }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); close(true); }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  listRef.current?.querySelector<HTMLInputElement>('input')?.focus();
                }
              }}
              style={{ ...inputStyle, fontSize: 'var(--fs-13)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 12px 10px', borderBottom: '1px solid #EDF0F4', fontSize: 'var(--fs-12)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--color-text-1)' }}>
              <input type="checkbox" checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !allSelected; }}
                onChange={(e) => {
                  if (e.target.checked) onChange([...products], products.filter((p) => !picked.includes(p)));
                  else onChange([], [...picked]);
                }} />
              全选全部品种（{products.length}）
            </label>
            <button type="button" disabled={picked.length === 0}
              onClick={() => { onChange([], [...picked]); searchRef.current?.focus(); }}
              style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>清空已选</button>
          </div>
          <div ref={listRef} style={{ maxHeight: 204, overflow: 'auto', overscrollBehavior: 'contain', padding: '4px 0' }}>
            {filtered.length === 0 && <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8592A1', fontSize: 'var(--fs-12)' }}>未找到匹配品种，请更换关键词</div>}
            {filtered.map((p) => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, padding: '8px 13px', fontSize: 'var(--fs-13)', cursor: 'pointer', color: picked.includes(p) ? 'var(--color-brand)' : 'inherit', background: picked.includes(p) ? 'var(--color-brand-subtle)' : undefined }}>
                <input type="checkbox" checked={picked.includes(p)} onChange={(e) => toggle(p, e.target.checked)} />
                {p}
              </label>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-12)', color: '#667085' }}>
            <span aria-live="polite">{q ? `找到 ${filtered.length} 个 · 共已选 ${picked.length} 个` : `已选 ${picked.length} / ${products.length} 个品种`}</span>
            <Button variant="primary" size="sm" onClick={() => close(true)}>完成</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 按品种计价表（创建/维护共用：方案下拉 + 只读价格回显 + 配置状态） =====
function SchemeBindingTable({ varieties, links, audience, schemes, attempted, onSchemeChange }: {
  varieties: string[];
  links: Record<string, string | null>;
  audience: Questionnaire['audience'];
  schemes: { id: string; name: string }[];
  /** 惰性校验：首次提交前不标红 */
  attempted: boolean;
  onSchemeChange: (variety: string, schemeId: string) => void;
}) {
  const done = varieties.filter((v) => bindingStatus(v, links[v], audience) === 'ok').length;
  if (varieties.length === 0) {
    return (
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 7, padding: '26px 12px', textAlign: 'center', color: '#8592A1', fontSize: 'var(--fs-13)' }}>
        选择适用品种后，在这里分别配置计价方案
      </div>
    );
  }
  return (
    <div>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '18%' }}>适用品种</th>
              <th style={{ ...th, width: '34%' }}>计价方案 *</th>
              <th style={{ ...th, width: '16%', textAlign: 'right' }}>对公单价</th>
              <th style={{ ...th, width: '16%', textAlign: 'right' }}>对私单价</th>
              <th style={{ ...th, width: '16%' }}>配置状态</th>
            </tr>
          </thead>
          <tbody>
            {varieties.map((v) => {
              const sid = links[v] ?? null;
              const status = bindingStatus(v, sid, audience);
              const price = sid ? surveyPriceOf(v, sid, audience) : { pub: null, priv: null };
              const invalid = attempted && status !== 'ok';
              return (
                <tr key={v} style={status === 'missingPrice' ? { background: '#FFFAF7' } : undefined}>
                  <td style={td}><span style={{ fontWeight: 600 }}>{v}</span></td>
                  <td style={td}>
                    <select style={{ ...inputStyle, borderColor: invalid ? '#CB8274' : undefined }}
                      aria-label={`${v} 计价方案`} value={sid ?? ''} disabled={schemes.length === 0}
                      onChange={(e) => onSchemeChange(v, e.target.value)}>
                      <option value="" disabled>请选择计价方案</option>
                      {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {status === 'missingPrice' && (
                      <p style={{ margin: '5px 0 0', fontSize: 'var(--fs-11)', color: '#BA574B' }}>缺少{audience}档位价格，请先在价目表补齐</p>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sid ? (price.pub === null ? '—' : money(price.pub)) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sid ? (price.priv === null ? '—' : money(price.priv)) : '—'}</td>
                  <td style={td}>
                    {status === 'ok' && <span style={{ fontSize: 'var(--fs-12)', color: '#4F887B' }}>✓ 已配置</span>}
                    {status === 'noScheme' && <span style={{ fontSize: 'var(--fs-12)', color: attempted ? '#BA574B' : '#B7793B' }}>{attempted ? '请选择方案' : '待选择'}</span>}
                    {status === 'missingPrice' && <span style={{ fontSize: 'var(--fs-12)', color: '#BA574B' }}>价格缺失</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#667085', fontSize: 'var(--fs-12)', margin: '9px 0 0' }}>
        <span>价格按「<b>{audience}</b>」档位读取，单位：元 / 份有效问卷。</span>
        <span aria-live="polite" style={{ color: done === varieties.length && done > 0 ? '#4F887B' : '#B7793B' }}>{done} / {varieties.length} 个品种已完成配置</span>
      </div>
    </div>
  );
}

// ===== 题目导入区（新建 / 替换共用：示例题目 + CSV 导入 + 模板下载） =====
function QuestionImportSection({ questions, onChange, toast }: {
  questions: QuestionItem[];
  onChange: (qs: QuestionItem[]) => void;
  toast: (title: string, type: ToastMessage['type']) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const qs = await readQuestionnaireCsvFile(file);
      onChange(qs);
      toast(`已导入 ${qs.length} 道题目`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'CSV 导入失败', 'warning');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={labelSpan}>题目导入 *</span>
        <span style={{ flex: 1 }} />
        <Button variant="outline" size="sm" onClick={() => onChange([...SAMPLE_QUESTIONS])}>使用示例题目</Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>导入 CSV</Button>
        <Button variant="outline" size="sm" onClick={() => downloadCsvTemplate()}>下载模板</Button>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { void importCsv(e.target.files?.[0]); }} />
      </div>
      {questions.length === 0 ? (
        <div style={{ padding: '14px 12px', border: '1px dashed var(--color-border)', borderRadius: 8, color: '#8592A1', fontSize: 'var(--fs-12)' }}>
          尚未导入题目。支持单选、多选、填空；可下载 CSV 模板填写后导入，或使用示例题目。
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 44 }}>序号</th>
                <th style={th}>题目</th>
                <th style={{ ...th, width: 64 }}>题型</th>
                <th style={th}>选项</th>
                <th style={{ ...th, width: 56 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr key={i}>
                  <td style={td} className="font-mono-nums">{i + 1}</td>
                  <td style={td}>{q.title}</td>
                  <td style={td}><Tag label={q.kind} /></td>
                  <td style={{ ...td, color: '#667085' }}>{q.kind === '填空' ? '—' : (q.options ?? []).join('／')}</td>
                  <td style={td}>
                    <button type="button" style={{ ...linkBtnStyle, color: '#C73A3A' }} onClick={() => onChange(questions.filter((_, j) => j !== i))}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== 主页面 =====
export function QuestionnaireConfig({ addToast }: Props) {
  const { can } = usePermission();
  const canEdit = can('questionnaire-config', 'edit');
  const canCreate = can('questionnaire-config', 'create');
  const toast = (title: string, type: ToastMessage['type'] = 'info') => addToast({ type, title });

  useQuestionnaireStoreSync(); // 问卷库 + 计价归属共用 store（localStorage），变更联动重渲染
  usePriceTableStoreSync(); // 价格回显读价目 store，改价后摘要即时刷新
  const db = listQuestionnaires();
  const products = allProductNames();
  const schemes = surveySchemes();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [replaceCode, setReplaceCode] = useState<string | null>(null);
  const [replacePending, setReplacePending] = useState<QuestionItem[]>([]);
  const [priceCode, setPriceCode] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<{ kind: 'disable' | 'enable' | 'delete' | 'replace'; code: string } | null>(null);

  const filtered = useMemo(() => db.filter((q) => {
    if (filters.name && !q.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.type && q.type !== filters.type) return false;
    if (filters.audience && q.audience !== filters.audience) return false;
    if (filters.status && q.status !== filters.status) return false;
    return true;
  }), [db, filters]);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterFields = [
    { id: 'name', label: '问卷名称', type: 'text' as const, placeholder: '搜索问卷名称' },
    { id: 'type', label: '问卷类型', type: 'select' as const, options: QUESTIONNAIRE_TYPES.map((v) => ({ value: v, label: v })) },
    { id: 'audience', label: '填写对象', type: 'select' as const, options: AUDIENCES.map((v) => ({ value: v, label: v })) },
    { id: 'status', label: '状态', type: 'select' as const, options: ['启用', '停用'].map((v) => ({ value: v, label: v })) },
  ];

  const current = (code: string | null) => db.find((q) => q.code === code) ?? null;
  const currentVersion = (q: Questionnaire) => q.versions[q.versions.length - 1];

  // 创建
  const createQuestionnaire = (v: { name: string; type: Questionnaire['type']; audience: Questionnaire['audience']; pricing: Record<string, string>; questions: QuestionItem[] }) => {
    const code = nextQuestionnaireCode();
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
    saveQuestionnaire({
      code, name: v.name, type: v.type, audience: v.audience, pricing: v.pricing,
      status: '启用',
      versions: [{ version: 1, createdAt: stamp, note: '初始导入', questions: v.questions }],
    });
    setCreateOpen(false);
    toast(`问卷 ${code} 已创建并默认启用，绑定 ${Object.keys(v.pricing).length} 个品种的计价方案`, 'success');
  };

  // 替换题目入口：启用中须先停用
  const openReplace = (q: Questionnaire) => {
    if (q.status === '启用') { toast('问卷处于启用状态，请先停用后再替换题目', 'warning'); return; }
    setReplacePending([]);
    setReplaceCode(q.code);
  };

  const applyReplace = (code: string, questions: QuestionItem[]) => {
    const q = current(code);
    if (!q) return;
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
    replaceQuestionnaireVersion(code, questions, stamp);
    setReplaceCode(null);
    setConfirmKind(null);
    toast(`已生成第 ${currentVersion(q).version + 1} 版题目，问卷保持停用；重新启用后新任务方可选用`, 'success');
  };

  const setStatus = (code: string, status: Questionnaire['status']) => {
    setQuestionnaireStatus(code, status);
    setConfirmKind(null);
    toast(status === '启用'
      ? '问卷已启用，新任务可选用当前最新版本题目'
      : '问卷已停用，退出新任务可选范围；既有任务仍按原版本执行', 'success');
  };

  const doRemove = (code: string) => {
    removeQuestionnaire(code);
    setConfirmKind(null);
    toast('问卷已删除', 'success');
  };

  const tryDelete = (q: Questionnaire) => {
    if (q.taskRefs > 0) { toast('该问卷已被任务引用，不能删除；可停用以退出新任务可选范围', 'warning'); return; }
    setConfirmKind({ kind: 'delete', code: q.code });
  };

  const previewQ = current(previewCode);
  const priceQ = current(priceCode);
  const replaceQ = current(replaceCode);
  const confirmQ = confirmKind ? current(confirmKind.code) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="问卷配置"
        description="问卷库维护：一份问卷共用一套题目，按品种独立选择计价方案（金额由价目表维护，此处只选方案、回显价格）；题目按版本隔离，任务创建时锁定版本与单价。"
        actions={canCreate && <Button variant="primary" onClick={() => setCreateOpen(true)}>新建问卷</Button>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, value) => { setFilters((p) => ({ ...p, [id]: value })); setPage(1); }}
          onSearch={() => setPage(1)}
          onReset={() => { setFilters({}); setPage(1); }}
        />
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>问卷编码</th>
                <th style={th}>问卷名称</th>
                <th style={th}>适用品种</th>
                <th style={th}>问卷类型</th>
                <th style={th}>填写对象</th>
                <th style={th}>当前版本</th>
                <th style={th}>状态</th>
                <th style={{ ...th, textAlign: 'right' }}>引用任务</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((q) => {
                const varieties = Object.keys(q.pricing);
                return (
                  <tr key={q.code}>
                    <td style={td} className="font-mono-nums">{q.code}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{q.name}</td>
                    <td style={td}>{varieties.join('、')}</td>
                    <td style={td}>{q.type}</td>
                    <td style={td}>{q.audience}</td>
                    <td style={td}>
                      V{currentVersion(q).version}
                      {q.versions.length > 1 && <span style={{ color: '#98A2B3', marginLeft: 4 }}>（共 {q.versions.length} 版）</span>}
                    </td>
                    <td style={td}><Tag label={q.status} color={q.status === '启用' ? 'success' : 'default'} /></td>
                    <td style={{ ...td, textAlign: 'right' }} className="font-mono-nums">{q.taskRefs}</td>
                    <td style={td}>
                      <div style={{ display: 'inline-flex', gap: 12, whiteSpace: 'nowrap' }}>
                        <button type="button" style={linkBtnStyle} onClick={() => { setPreviewCode(q.code); setPreviewVersion(currentVersion(q).version); }}>预览</button>
                        {canEdit && <button type="button" style={linkBtnStyle} onClick={() => setPriceCode(q.code)}>计价归属</button>}
                        {canEdit && <button type="button" style={linkBtnStyle} onClick={() => openReplace(q)}>替换题目</button>}
                        {canEdit && (q.status === '启用'
                          ? <button type="button" style={linkBtnStyle} onClick={() => setConfirmKind({ kind: 'disable', code: q.code })}>停用</button>
                          : <button type="button" style={linkBtnStyle} onClick={() => setConfirmKind({ kind: 'enable', code: q.code })}>启用</button>)}
                        {canEdit && <button type="button" style={{ ...linkBtnStyle, color: '#C73A3A' }} onClick={() => tryDelete(q)}>删除</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState title="没有匹配的问卷" description="调整筛选条件，或新建一份问卷开始使用。" />
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
        <p style={hintP}>删除仅限未被任务引用的问卷；已被引用的问卷可停用，历史答卷与任务记录仍按其创建时锁定的题目版本与单价解释。</p>
      </div>

      {/* 新建问卷（创建时必须完成按品种计价配置） */}
      {createOpen && (
        <CreateModal products={products} schemes={schemes} toast={toast} onClose={() => setCreateOpen(false)} onCreate={createQuestionnaire} />
      )}

      {/* 预览（含版本切换） */}
      {previewQ && (
        <PreviewModal q={previewQ} version={previewVersion ?? currentVersion(previewQ).version}
          onVersionChange={setPreviewVersion} onClose={() => { setPreviewCode(null); setPreviewVersion(null); }} />
      )}

      {/* 计价归属维护（按品种选方案；归问卷配置权限） */}
      {priceQ && (
        <SchemeBindingModal q={priceQ} products={products} schemes={schemes} toast={toast}
          onClose={() => setPriceCode(null)}
          onSaved={(msg) => { setPriceCode(null); toast(msg, 'success'); }} />
      )}

      {/* 替换题目（仅停用状态可进入） */}
      {replaceQ && (
        <ReplaceModal q={replaceQ} toast={toast}
          onClose={() => setReplaceCode(null)}
          onConfirm={() => setConfirmKind({ kind: 'replace', code: replaceQ.code })}
          pendingQuestions={replacePending} onPendingChange={setReplacePending} />
      )}

      {/* 确认弹窗 */}
      {confirmKind?.kind === 'disable' && confirmQ && (
        <ConfirmDialog open title="停用问卷" variant="warning"
          description={`将停用「${confirmQ.name}」。`}
          impact="停用后退出新任务的可选范围；已引用它的既有任务仍按原有效期与原题目版本执行，历史答卷不受影响。"
          confirmLabel="确认停用" onCancel={() => setConfirmKind(null)} onConfirm={() => setStatus(confirmQ.code, '停用')} />
      )}
      {confirmKind?.kind === 'enable' && confirmQ && (
        <ConfirmDialog open title="启用问卷" variant="warning"
          description={`将启用「${confirmQ.name}」（当前第 ${currentVersion(confirmQ).version} 版题目）。`}
          impact="启用后新任务可选用该问卷；已下发的旧任务不受影响，仍按其下发时锁定的版本执行。"
          confirmLabel="确认启用" onCancel={() => setConfirmKind(null)} onConfirm={() => setStatus(confirmQ.code, '启用')} />
      )}
      {confirmKind?.kind === 'delete' && confirmQ && (
        <ConfirmDialog open title="删除问卷" variant="danger"
          description={`将删除「${confirmQ.name}」及其全部 ${confirmQ.versions.length} 个题目版本。`}
          impact="该问卷未被任务引用，删除后不可恢复。"
          confirmLabel="确认删除" onCancel={() => setConfirmKind(null)} onConfirm={() => doRemove(confirmQ.code)} />
      )}
      {confirmKind?.kind === 'replace' && confirmQ && replaceQ && (
        <ConfirmDialog open title="确认替换题目" variant="warning"
          description={`将为「${confirmQ.name}」生成第 ${currentVersion(confirmQ).version + 1} 版题目（共 ${replacePending.length} 题）。`}
          impact="保留问卷编码；替换后问卷保持停用，重新启用后新任务方可选用新版本。既有任务及其答卷仍按原版本解释和导出。"
          confirmLabel="确认替换" onCancel={() => setConfirmKind(null)} onConfirm={() => applyReplace(confirmQ.code, replacePending)} />
      )}
    </div>
  );
}

// ============================================================
// 新建问卷弹窗：组件与交互 1:1 复刻「药企问卷创建弹窗」原型；
// 数据接系统 store（品种 / 价目方案 / 问卷库）。qv-* 样式见 index.css。
// ============================================================

function QvRadio({ checked, children, onChange }: { checked: boolean; children: React.ReactNode; onChange: () => void }) {
  return (
    <button type="button" className="qv-radio" onClick={onChange}>
      <span className={`qv-radio-dot${checked ? ' checked' : ''}`}>{checked && <span />}</span>
      <span>{children}</span>
    </button>
  );
}

function QvSelect({ value, onChange, ariaLabel, invalid, children }: {
  value: string;
  onChange?: (v: string) => void;
  ariaLabel?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="qv-select-wrap">
      <select className={`qv-select${invalid ? ' qv-invalid' : ''}`} value={value} aria-label={ariaLabel}
        onChange={(e) => onChange?.(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden />
    </div>
  );
}

function QvField({ label, alignTop = false, children }: {
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`qv-field${alignTop ? ' qv-top' : ''}`}>
      <span className="qv-label"><i aria-hidden>*</i>{label}</span>
      <div className="qv-control">{children}</div>
    </div>
  );
}

// ---- 适用品种多选（原型：触发框 + 搜索 + 全选 + 勾选列表 + 底部完成） ----
function VarietyPicker({ products, picked, onChange }: {
  products: string[];
  picked: string[];
  /** onChange(next, removed)：removed = 本次离开选择的品种，调用方丢弃其已选方案 */
  onChange: (next: string[], removed: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = products.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase()));
  const allSelected = picked.length === products.length && products.length > 0;
  const summary = picked.length
    ? picked.slice(0, 2).join('、') + (picked.length > 2 ? ` 等 ${picked.length} 个品种` : '')
    : '请选择品种';

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const toggle = (v: string) =>
    onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v], picked.includes(v) ? [v] : []);

  return (
    <div ref={rootRef} className="qv-picker">
      <button type="button" className={`qv-picker-trigger${open ? ' open' : ''}`} aria-expanded={open} aria-label="选择适用品种"
        onClick={() => { setOpen(!open); setQuery(''); }}>
        <span className={picked.length ? undefined : 'qv-placeholder'}>{summary}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="qv-picker-menu" role="group" aria-label="适用品种多选">
          <div className="qv-picker-search">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索品种名称" aria-label="搜索品种名称" autoFocus />
          </div>
          <button type="button" className="qv-check-row"
            onClick={() => onChange(allSelected ? [] : [...products], allSelected ? [...picked] : products.filter((p) => !picked.includes(p)))}>
            <span className={`qv-checkbox${allSelected ? ' checked' : ''}`}>{allSelected && <Check size={12} aria-hidden />}</span>
            全选全部品种（{products.length}）
          </button>
          <div className="qv-picker-list">
            {filtered.length === 0 && (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' }}>未找到匹配品种</div>
            )}
            {filtered.map((p) => {
              const checked = picked.includes(p);
              return (
                <button type="button" key={p} onClick={() => toggle(p)}>
                  <span className={`qv-checkbox${checked ? ' checked' : ''}`}>{checked && <Check size={12} aria-hidden />}</span>
                  <span>{p}</span>
                </button>
              );
            })}
          </div>
          <div className="qv-picker-footer">
            <span aria-live="polite">已选 {picked.length} 个</span>
            <button type="button" onClick={() => setOpen(false)}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 统一计价面板（原型：计价方案下拉 + 对公/对私价格摘要） ----
// 系统价格按「品种 × 方案 × 档位」维护：同方案各品种同价时显示单价，不同价时显示区间。
function UniformPricingPanel({ varieties, schemeId, audience, schemes, onSchemeChange }: {
  varieties: string[];
  schemeId: string;
  audience: Questionnaire['audience'];
  schemes: { id: string; name: string }[];
  onSchemeChange: (sid: string) => void;
}) {
  const pubs: number[] = [];
  const privs: number[] = [];
  let missing = 0;
  varieties.forEach((v) => {
    const p = surveyPriceOf(v, schemeId, audience);
    if (p.pub !== null) pubs.push(p.pub);
    if (p.priv !== null) privs.push(p.priv);
    if (p.pub === null || p.priv === null) missing++;
  });
  const fmt = (arr: number[]) => {
    if (!arr.length) return '—';
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return min === max ? `¥${money(min)}` : `¥${money(min)} ~ ¥${money(max)}`;
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="qv-panel qv-uniform">
        <div className="qv-inline-field">
          <label>计价方案</label>
          <QvSelect value={schemeId} onChange={onSchemeChange} ariaLabel="统一计价方案">
            {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </QvSelect>
        </div>
        {varieties.length > 0 && (
          <div className="qv-price-summary">
            <span>对公 <b>{fmt(pubs)}</b> / 份</span>
            <i />
            <span>对私 <b>{fmt(privs)}</b> / 份</span>
          </div>
        )}
      </div>
      {varieties.length > 0 && missing > 0 && (
        <p className="qv-field-error" style={{ margin: 0 }}>
          {missing} 个品种缺少「{audience}」档位价格，请先在价目表补齐
        </p>
      )}
    </div>
  );
}

// ---- 分品种计价表（原型：搜索工具条 + 品种/方案/价格 行 + 分页） ----
function ByProductPricingTable({ varieties, links, audience, schemes, onSchemeChange }: {
  varieties: string[];
  links: Record<string, string>;
  audience: Questionnaire['audience'];
  schemes: { id: string; name: string }[];
  onSchemeChange: (v: string, sid: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const rows = varieties.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (varieties.length === 0) {
    return (
      <div className="qv-panel" style={{ padding: '26px 12px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 'var(--fs-13)' }}>
        选择适用品种后，在这里分别配置计价方案
      </div>
    );
  }
  return (
    <div className="qv-panel" style={{ overflow: 'hidden' }}>
      <div className="qv-tools">
        <div className="qv-search-sm">
          <Search size={14} aria-hidden />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜索品种" aria-label="搜索品种" />
        </div>
        <span>共 {varieties.length} 个品种</span>
      </div>
      <div className="qv-price-table">
        <div className="qv-row qv-head"><span>品种</span><span>计价方案</span><span>价格</span></div>
        {pageRows.map((v) => {
          const sid = links[v] ?? '';
          const status = bindingStatus(v, sid || null, audience);
          const price = sid ? surveyPriceOf(v, sid, audience) : { pub: null, priv: null };
          return (
            <div className="qv-row" key={v} style={status === 'missingPrice' ? { background: '#FFFAF7' } : undefined}>
              <span title={v}>{v}</span>
              <span style={{ display: 'grid', gap: 4 }}>
                <QvSelect value={sid} invalid={status === 'noScheme'} ariaLabel={`${v} 计价方案`}
                  onChange={(val) => onSchemeChange(v, val)}>
                  <option value="" disabled>请选择计价方案</option>
                  {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </QvSelect>
                {status === 'missingPrice' && <span className="qv-field-error">缺少{audience}档位价格，请先在价目表补齐</span>}
              </span>
              <span className="qv-row-price">
                {price.pub !== null && price.priv !== null
                  ? <><b>¥{money(price.pub)}</b> 对公&nbsp;&nbsp;<b>¥{money(price.priv)}</b> 对私</>
                  : '—'}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 'var(--fs-12)' }}>未找到匹配品种</div>
        )}
      </div>
      <div className="qv-pagebar">
        <span>第 {safePage} / {totalPages} 页</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="qv-pagebtn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>上一页</button>
          <button type="button" className="qv-pagebtn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>下一页</button>
        </span>
      </div>
    </div>
  );
}

// ---- 题目导入（原型：空态上传框 / 文件卡片 + 预览、重新导入；下方模板链接。通道：系统 CSV 导入与示例题目） ----
function CreateImportSection({ questions, onChange, onPreview, toast }: {
  questions: QuestionItem[];
  onChange: (qs: QuestionItem[]) => void;
  onPreview: () => void;
  toast: (title: string, type: ToastMessage['type']) => void;
}) {
  const [source, setSource] = useState('题目文件');
  const fileRef = useRef<HTMLInputElement>(null);

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const qs = await readQuestionnaireCsvFile(file);
      onChange(qs);
      setSource(file.name);
      toast(`已导入 ${qs.length} 道题目`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'CSV 导入失败', 'warning');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {questions.length === 0 ? (
        <button type="button" className="qv-upload" onClick={() => fileRef.current?.click()}>
          <Upload size={16} aria-hidden />
          <span>点击导入题目文件</span>
          <small>支持 .csv 格式</small>
        </button>
      ) : (
        <div className="qv-file-card">
          <div className="qv-file-icon"><FileText size={18} aria-hidden /></div>
          <div className="qv-file-meta">
            <strong>{source}</strong>
            <span>共 {questions.length} 题 · 所有适用品种共用</span>
          </div>
          <button type="button" className="qv-link" style={{ marginLeft: 'auto' }} onClick={onPreview}>
            <Eye size={14} aria-hidden />预览
          </button>
          <button type="button" className="qv-link" style={{ marginLeft: 20 }} onClick={() => fileRef.current?.click()}>
            <Upload size={14} aria-hidden />重新导入
          </button>
        </div>
      )}
      <div className="qv-template-row">
        <button type="button" className="qv-link" onClick={() => { onChange([...SAMPLE_QUESTIONS]); setSource('示例题目'); }}>
          <FileText size={14} aria-hidden />使用示例题目
        </button>
        <button type="button" className="qv-link" onClick={() => downloadCsvTemplate()}>
          <Download size={14} aria-hidden />下载 CSV 模板
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".csv" className="qv-hidden" onChange={(e) => { void importCsv(e.target.files?.[0]); }} />
    </div>
  );
}

// ---- 题目预览弹层（原型：编号圆点 + 题干 + 选项行 + 完成预览；捕获阶段拦 Esc，避免连带关闭外层弹窗） ----
function QuestionPreviewDialog({ questions, onClose }: { questions: QuestionItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="qv-layer" onClick={onClose}>
      <div className="qv-preview" role="dialog" aria-modal="true" aria-label="题目预览" onClick={(e) => e.stopPropagation()}>
        <div className="qv-preview-head">
          <div>
            <h3>题目预览</h3>
            <p>共 {questions.length} 题 · 所有适用品种共用</p>
          </div>
          <button type="button" className="qv-icon-btn" aria-label="关闭题目预览" onClick={onClose}><X size={18} aria-hidden /></button>
        </div>
        <div className="qv-preview-body">
          {questions.length === 0 && (
            <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 'var(--fs-13)' }}>暂无题目</p>
          )}
          {questions.map((q, i) => (
            <div className="qv-question" key={i}>
              <span className="qv-q-no">{i + 1}</span>
              <div className="qv-q-main">
                <strong>{q.title}</strong>
                <p className="qv-q-kind">{q.kind === '填空' ? '填空题' : `${q.kind}题 · ${q.options?.length ?? 0} 个选项`}</p>
                {q.kind === '填空'
                  ? <div className="qv-q-blank" />
                  : (
                    <div className="qv-q-opts">
                      {(q.options ?? []).map((o) => <div key={o}>{q.kind === '多选' ? '□' : '○'} {o}</div>)}
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>
        <div className="qv-preview-foot">
          <Button variant="primary" onClick={onClose}>完成预览</Button>
        </div>
      </div>
    </div>
  );
}

// ---- 切换计价方式确认弹层（原型） ----
function ModeSwitchDialog({ pending, onConfirm, onCancel }: {
  pending: 'uniform' | 'byProduct';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="qv-layer">
      <div className="qv-dialog-sm" role="dialog" aria-modal="true" aria-label="切换计价方式">
        <h3>切换计价方式？</h3>
        <p>切换后，当前{pending === 'uniform' ? '分品种计价配置' : '统一计价方案'}将被清除。</p>
        <div className="qv-dialog-actions">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button variant="primary" onClick={onConfirm}>确认切换</Button>
        </div>
      </div>
    </div>
  );
}

// ===== 弹窗：新建问卷（交互 1:1 原型：全品种/指定品种 + 统一/分品种计价 + 题目导入；数据接系统 store） =====
function CreateModal({ products, schemes, toast, onClose, onCreate }: {
  products: string[];
  schemes: { id: string; name: string }[];
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onCreate: (v: { name: string; type: Questionnaire['type']; audience: Questionnaire['audience']; pricing: Record<string, string>; questions: QuestionItem[] }) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Questionnaire['type']>('通用');
  const [audience, setAudience] = useState<Questionnaire['audience']>('医生');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [pricingMode, setPricingMode] = useState<'uniform' | 'byProduct'>('uniform');
  const [uniformScheme, setUniformScheme] = useState(schemes[0]?.id ?? '');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [pendingMode, setPendingMode] = useState<'uniform' | 'byProduct' | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const uniformSchemeEffective = schemes.some((s) => s.id === uniformScheme) ? uniformScheme : (schemes[0]?.id ?? '');
  const varieties = scope === 'all' ? products : picked;

  /** 勾选变化：removed 的品种丢弃其方案；分品种模式下新增品种默认选第一个方案（原型行为：行总有方案） */
  const applyPicked = (nextList: string[], removed: string[]) => {
    setPicked(nextList);
    setLinks((p) => {
      const copy = { ...p };
      removed.forEach((v) => delete copy[v]);
      if (pricingMode === 'byProduct' && schemes.length) {
        nextList.filter((v) => !picked.includes(v)).forEach((v) => { if (!copy[v]) copy[v] = schemes[0].id; });
      }
      return copy;
    });
  };

  // 原型：切换计价方式需确认；确认后进入新模式（分品种模式给未配置品种预置第一个方案）
  const requestMode = (next: 'uniform' | 'byProduct') => {
    if (next === pricingMode) return;
    setPendingMode(next);
  };
  const confirmMode = () => {
    if (!pendingMode) return;
    if (pendingMode === 'byProduct' && schemes.length) {
      setLinks((p) => {
        const copy = { ...p };
        varieties.forEach((v) => { if (!copy[v]) copy[v] = schemes[0].id; });
        return copy;
      });
    }
    setPricingMode(pendingMode);
    setPendingMode(null);
  };

  const schemeOf = (v: string) => (pricingMode === 'uniform' ? uniformSchemeEffective : links[v]);
  const issues = () => {
    const list: string[] = [];
    if (!name.trim()) list.push('请输入问卷名称');
    if (scope === 'selected' && picked.length === 0) list.push('请至少选择一个品种');
    if (schemes.length === 0) {
      list.push('尚无可用计价方案，请先在「价目表配置」创建');
    } else if (pricingMode === 'uniform' && !uniformSchemeEffective) {
      list.push('请选择计价方案');
    } else {
      varieties.forEach((v) => {
        const sid = schemeOf(v);
        if (!sid) { list.push(`${v}：请选择计价方案`); return; }
        const p = surveyPriceOf(v, sid, audience);
        if (p.pub === null || p.priv === null) list.push(`${v}：缺少${audience}档位价格`);
      });
    }
    if (questions.length === 0) list.push('请导入题目或使用示例题目');
    return list;
  };
  const errors = issues();

  const submit = () => {
    setAttempted(true);
    if (errors.length) return;
    const pricing = pricingMode === 'uniform'
      ? Object.fromEntries(varieties.map((v) => [v, uniformSchemeEffective]))
      : Object.fromEntries(picked.map((v) => [v, links[v]]));
    onCreate({ name: name.trim(), type, audience, pricing, questions });
  };

  return (
    <>
      <Modal open title="新建问卷" titleNote="填写基本信息并完成计价与题目配置" onClose={onClose} width={920}
        footer={<>
          <span className={`qv-foot-note${errors.length ? ' error' : ''}`}>
            <Info size={14} aria-hidden style={{ flex: 'none' }} />
            {errors.length ? errors[0] : '创建后将生成 1 份问卷'}
          </span>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={errors.length > 0} onClick={submit}>确认创建</Button>
        </>}>
        <div>
          <div className="qv-section-title">基本信息</div>
          <div className="qv-two-col">
            <QvField label="问卷名称">
              <input className={`qv-input${attempted && !name.trim() ? ' qv-invalid' : ''}`} value={name}
                onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例如：患者用药体验调研问卷" aria-label="问卷名称" />
              {attempted && !name.trim() && <div className="qv-field-error">请输入问卷名称</div>}
            </QvField>
            <QvField label="问卷类型">
              <QvSelect value={type} ariaLabel="问卷类型" onChange={(v) => setType(v as Questionnaire['type'])}>
                {QUESTIONNAIRE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </QvSelect>
            </QvField>
            <QvField label="填写对象">
              <QvSelect value={audience} ariaLabel="填写对象" onChange={(v) => {
                setAudience(v as Questionnaire['audience']);
                if (varieties.length) toast('已按新的填写对象重新读取各品种价格', 'info');
              }}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </QvSelect>
            </QvField>
          </div>

          <div className="qv-divider" />

          {/* 适用品种：全品种 / 指定品种（指定时展开原型多选下拉） */}
          <QvField label="适用品种" alignTop>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="qv-radio-group">
                <QvRadio checked={scope === 'all'} onChange={() => setScope('all')}>全品种</QvRadio>
                <QvRadio checked={scope === 'selected'} onChange={() => setScope('selected')}>指定品种</QvRadio>
              </div>
              {scope === 'selected' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <VarietyPicker products={products} picked={picked} onChange={applyPicked} />
                  {picked.length === 0 && <div className="qv-field-error">请至少选择一个品种</div>}
                </div>
              )}
            </div>
          </QvField>

          <div className="qv-divider" />

          {/* 计价方式：统一计价面板 / 分品种计价表，切换需确认（原型） */}
          <QvField label="计价方式" alignTop>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="qv-radio-group">
                <QvRadio checked={pricingMode === 'uniform'} onChange={() => requestMode('uniform')}>统一计价</QvRadio>
                <QvRadio checked={pricingMode === 'byProduct'} onChange={() => requestMode('byProduct')}>分品种计价</QvRadio>
              </div>
              {schemes.length === 0 ? (
                <div style={{ border: '1px dashed var(--color-border)', borderRadius: 6, padding: '14px 12px', color: '#8592A1', fontSize: 'var(--fs-12)' }}>
                  尚无可用计价方案。请先在「基础数据 › 价目表配置 › 问卷调查」创建价目类别（档位 = 医生／患者／商业公司）并填写价格。
                </div>
              ) : pricingMode === 'uniform' ? (
                <UniformPricingPanel varieties={varieties} schemeId={uniformSchemeEffective} audience={audience}
                  schemes={schemes} onSchemeChange={setUniformScheme} />
              ) : (
                <ByProductPricingTable varieties={varieties} links={links} audience={audience}
                  schemes={schemes} onSchemeChange={(v, sid) => setLinks((p) => ({ ...p, [v]: sid }))} />
              )}
            </div>
          </QvField>

          <div className="qv-divider" />

          {/* 题目导入：上传框 / 文件卡片 + 预览弹层 */}
          <QvField label="题目导入" alignTop>
            <CreateImportSection questions={questions} onChange={setQuestions}
              onPreview={() => setPreviewOpen(true)} toast={toast} />
          </QvField>
        </div>
      </Modal>

      {pendingMode && <ModeSwitchDialog pending={pendingMode} onConfirm={confirmMode} onCancel={() => setPendingMode(null)} />}
      {previewOpen && <QuestionPreviewDialog questions={questions} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}

// ===== 弹窗：计价归属维护（按品种整表保存；允许留待补齐） =====
function SchemeBindingModal({ q, products, schemes, toast, onClose, onSaved }: {
  q: Questionnaire;
  products: string[];
  schemes: { id: string; name: string }[];
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => Object.keys(q.pricing));
  /** links 值可为 null：显式「待补齐」（迁移无归属或方案已删） */
  const [links, setLinks] = useState<Record<string, string | null>>(() => ({ ...q.pricing }));

  const applyPicked = (next: string[], removed: string[]) => {
    setPicked(next);
    if (removed.length) setLinks((p) => {
      const copy = { ...p };
      removed.forEach((v) => delete copy[v]);
      return copy;
    });
  };

  const pending = picked.filter((v) => bindingStatus(v, links[v], q.audience) !== 'ok').length;

  const save = () => {
    if (picked.length === 0) { toast('请至少保留一个适用品种', 'warning'); return; }
    const pricing: Record<string, string | null> = {};
    picked.forEach((v) => { pricing[v] = links[v] ?? null; });
    bindQuestionnaire(q.code, pricing);
    onSaved(`已保存 ${q.code} 的计价归属：${picked.length - pending}/${picked.length} 个品种就绪${pending ? `，${pending} 个待补齐` : ''}`);
  };

  return (
    <Modal open title={`计价归属：${q.name}`} onClose={onClose} width={860}
      titleNote={`${q.code} · 填写对象 ${q.audience}（价格按该档位读取）`}
      footer={<>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={save}>保存</Button>
      </>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ background: '#F4F7FF', borderLeft: '3px solid #2458D3', padding: '10px 13px', fontSize: 'var(--fs-12)', color: '#47566D' }}>
          金额由价目表维护，此处只选方案并回显当前价格；修改归属或价格不影响已创建的任务（任务按创建时快照取价）。
          {q.taskRefs > 0 && <b>该问卷已被 {q.taskRefs} 个任务引用。</b>}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={labelSpan}>适用品种与计价 *</span>
            <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>{picked.length ? `已选 ${picked.length} 个` : ''}</span>
          </div>
          <ProductPicker products={products} picked={picked} onChange={applyPicked} />
          {schemes.length === 0 ? (
            <div style={{ border: '1px dashed var(--color-border)', borderRadius: 7, padding: '14px 12px', color: '#8592A1', fontSize: 'var(--fs-12)' }}>
              尚无可用计价方案。请先在「基础数据 › 价目表配置 › 问卷调查」创建价目类别并填写价格。
            </div>
          ) : (
            <SchemeBindingTable varieties={picked} links={links} audience={q.audience} schemes={schemes}
              attempted={false}
              onSchemeChange={(v, sid) => setLinks((p) => ({ ...p, [v]: sid }))} />
          )}
          <p style={{ ...hintP, marginTop: 9 }}>移除品种会同时丢弃其方案；再次添加需重新选择。保留品种的方案不会被重置。「待补齐」= 未选方案或所选方案缺{q.audience}档位价格。</p>
        </div>
      </div>
    </Modal>
  );
}

// ===== 弹窗：预览（只读，可切换版本） =====
function PreviewModal({ q, version, onVersionChange, onClose }: {
  q: Questionnaire;
  version: number;
  onVersionChange: (v: number) => void;
  onClose: () => void;
}) {
  const v = q.versions.find((x) => x.version === version) ?? q.versions[q.versions.length - 1];
  const varieties = Object.keys(q.pricing);
  return (
    <Modal open title={`预览：${q.name}`} onClose={onClose} width={640}
      titleNote={`${q.code} · ${q.type} · ${q.audience} · ${varieties.join('、')} · ${q.status}`}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={labelSpan}>题目版本</span>
          <select style={{ ...inputStyle, width: 220 }} value={version} onChange={(e) => onVersionChange(Number(e.target.value))}>
            {[...q.versions].reverse().map((x) => (
              <option key={x.version} value={x.version}>
                V{x.version}{x.version === q.versions[q.versions.length - 1].version ? '（当前）' : ''} · {x.createdAt} · {x.note}
              </option>
            ))}
          </select>
        </div>
        {v.questions.map((item, i) => (
          <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: 8, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="font-mono-nums" style={{ fontSize: 'var(--fs-12)', color: '#98A2B3' }}>{i + 1}.</span>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{item.title}</span>
              <Tag label={item.kind} />
            </div>
            {item.kind === '单选' && (item.options ?? []).map((opt) => (
              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-13)', color: '#4A596D' }}>
                <input type="radio" disabled name={`q-${version}-${i}`} />{opt}
              </label>
            ))}
            {item.kind === '多选' && (item.options ?? []).map((opt) => (
              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-13)', color: '#4A596D' }}>
                <input type="checkbox" disabled />{opt}
              </label>
            ))}
            {item.kind === '填空' && <input style={{ ...inputStyle, background: '#F7F9FC' }} disabled placeholder="填写内容（演示只读）" />}
          </div>
        ))}
        <p style={hintP}>任务创建时锁定所选版本与单价；同一问卷的不同任务可能使用不同版本，答卷按提交时的版本解释和导出。</p>
      </div>
    </Modal>
  );
}

// ===== 弹窗：替换题目（停用状态下） =====
function ReplaceModal({ q, toast: toastProp, onClose, onConfirm, pendingQuestions, onPendingChange }: {
  q: Questionnaire;
  toast: (title: string, type: ToastMessage['type']) => void;
  onClose: () => void;
  onConfirm: () => void;
  pendingQuestions: QuestionItem[];
  onPendingChange: (qs: QuestionItem[]) => void;
}) {
  const cur = q.versions[q.versions.length - 1];
  return (
    <Modal open title={`替换题目：${q.name}`} onClose={onClose} width={680}
      titleNote={`${q.code} · 当前 V${cur.version}（${cur.createdAt} · ${cur.note}） · ${q.status}`}
      footer={<>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={pendingQuestions.length === 0} onClick={onConfirm}>下一步：确认替换</Button>
      </>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ background: '#F4F7FF', borderLeft: '3px solid #2458D3', padding: '10px 13px', fontSize: 'var(--fs-12)', color: '#47566D' }}>
          替换将导入<b>整套新题目</b>（不是追加）：确认后生成 V{cur.version + 1}，问卷保留编码、保持停用；重新启用后新任务方可选用新版本。既有任务仍按 V{cur.version} 执行。
        </div>
        <QuestionImportSection questions={pendingQuestions} onChange={onPendingChange} toast={toastProp} />
        <p style={hintP}>可下载 CSV 模板填写后导入，或使用示例题目；可在预览表中移除不需要的题目。</p>
      </div>
    </Modal>
  );
}
