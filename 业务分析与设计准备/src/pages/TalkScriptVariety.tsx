import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import type { ToastMessage } from '../components/Toast';
import type { GeneralScript, ProductScript, ScriptManageStatus } from '../types';
import {
  BIZ_CAT_MAP,
  GENERAL_CATS,
  SCENE_LIST,
  SCRIPT_PRODUCTS,
  SUB_CAT_MAP,
  dupKeyOf,
  useTalkScript,
} from '../context/TalkScriptContext';

/**
 * 话术管理页（《话术管理功能需求文档》V1.1 · 依据高保真原型 v1.1 重构）
 *
 * 结构（FR-01~04）：页头（导入/新增，仅品种话术 Tab）→ 一级 Tab（通用/品种，带计数）
 * → 子场景导航（仅品种话术）→ 说明条（仅通用话术）→ 筛选区 → 列表（工具栏/表头/空态/分页）
 * → 右侧抽屉（新增/编辑/查看）→ 导入弹窗 / 二次确认。
 *
 * 管理状态是 App 端展示的唯一开关（FR-12/13、7.1）；本期无删除、无品种话术批量启用（7.2）。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

/* ─── 局部样式 ─────────────────────────────────────────────────────── */

const CARD: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
};

const TH: CSSProperties = {
  textAlign: 'left',
  fontSize: 'var(--fs-12)',
  fontWeight: 500,
  color: '#6B7280',
  background: '#F9FAFB',
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};

const TD: CSSProperties = {
  fontSize: 'var(--fs-13)',
  color: '#374151',
  padding: '10px 12px',
  borderBottom: '1px solid #F1F2F4',
  verticalAlign: 'middle',
  lineHeight: 1.6,
};

const LINK_BTN: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '2px 4px',
  fontSize: 'var(--fs-12)',
  color: 'var(--color-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const DANGER_BTN: CSSProperties = { ...LINK_BTN, color: '#C73A3A' };

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: '#9CA3AF' };

const FIELD_LABEL: CSSProperties = {
  fontSize: 'var(--fs-13)',
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
};

const INPUT: CSSProperties = {
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 'var(--fs-13)',
  color: '#1F2937',
  background: '#FFFFFF',
  outline: 'none',
  fontFamily: 'inherit',
};

const INPUT_RO: CSSProperties = { ...INPUT, background: '#F3F4F6', color: '#6B7280' };

const TEXTAREA: CSSProperties = { ...INPUT, resize: 'vertical', lineHeight: 1.7 };

const RADIO: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--fs-13)', color: '#374151' };

const TIP: CSSProperties = { fontSize: 'var(--fs-11)', color: '#6B7280', marginTop: 5, lineHeight: 1.6 };

/* ─── CSV 工具（UTF-8 带 BOM，需求 9 安全：单元格统一转义） ─────────── */

const csvEsc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(name: string, content: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 与原型一致的 CSV 解析：支持引号包裹、双引号转义、\r\n 换行 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = '';
  let q = false;
  const src = text.replace(/^\ufeff/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          val += '"';
          i++;
        } else q = false;
      } else val += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      cur.push(val);
      val = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      cur.push(val);
      val = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else val += c;
  }
  cur.push(val);
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayStr(): string {
  return nowStr().slice(0, 10).replace(/-/g, '');
}

/* ─── 通用小组件 ──────────────────────────────────────────────────── */

/** 管理状态：圆点 + 文案（启用=绿 / 停用=灰 / 待启用=橙，AI 入库中间态） */
function StatusDot({ status }: { status: ScriptManageStatus }) {
  const on = status === '启用';
  const pending = status === '待启用';
  const color = on ? '#248A5A' : pending ? '#C77A16' : '#6B7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-12)', color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function Field({
  label,
  required,
  error,
  tip,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  tip?: ReactNode;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gridColumn: full ? '1 / -1' : undefined }}>
      <label style={FIELD_LABEL}>
        {required && <span style={{ color: '#C73A3A', marginRight: 2 }}>*</span>}
        {label}
      </label>
      {children}
      {error && <span style={{ fontSize: 'var(--fs-11)', color: '#C73A3A', marginTop: 4 }}>{error}</span>}
      {tip && !error && <div style={TIP}>{tip}</div>}
    </div>
  );
}

/** 只读元信息块（查看态展示编号与创建信息，FR-19） */
function MetaGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 20px',
        fontSize: 'var(--fs-12)',
        color: '#6B7280',
        background: '#FAFAFA',
      }}
    >
      {items.map(([k, v]) => (
        <span key={k}>
          {k}：<b style={{ color: '#374151', fontWeight: 500 }}>{v}</b></span>
      ))}
    </div>
  );
}

/* ─── 二次确认弹窗（FR-27：危险操作红色确认） ──────────────────────── */

interface ConfirmState {
  title: string;
  message: ReactNode;
  danger?: boolean;
  okText?: string;
  onOk: () => void;
}

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="ts-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} onClick={onCancel} />
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          borderRadius: 10,
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            fontSize: 'var(--fs-15)',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          <span>{state.title}</span>
          <button onClick={onCancel} style={{ border: 'none', background: '#F3F4F6', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', color: '#6B7280', fontSize: 15 }}>
            ×
          </button>
        </div>
        <div style={{ padding: '18px 20px', fontSize: 'var(--fs-13)', lineHeight: 1.9, color: state.danger ? '#991B1B' : '#374151', overflowY: 'auto' }}>
          {state.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: '#FAFAFA', borderRadius: '0 0 10px 10px' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button
            variant={state.danger ? 'danger' : 'primary'}
            onClick={() => {
              // 与原型一致：确认即执行回调并关闭弹窗
              state.onOk();
              onCancel();
            }}
          >
            {state.okText ?? '确定'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── 新增 / 编辑 / 查看 抽屉（FR-15~19） ──────────────────────────── */

type DrawerMode = 'create' | 'edit' | 'view';

interface DrawerForm {
  product: string;
  bizCat: string;
  subCat: string;
  feedback: string;
  content: string;
  status: '启用' | '停用';
  isCoop: '是' | '否';
}

const CONTENT_MAX = 500;

function ScriptDrawer({
  mode,
  kind,
  scene,
  rec,
  onClose,
  onSave,
  onError,
}: {
  mode: DrawerMode;
  /** general 仅查看（FR-08：通用话术禁止新增/编辑） */
  kind: 'general' | 'product';
  /** 品种话术：当前子场景（新增时由子场景带入，不可修改） */
  scene: string;
  rec: ProductScript | GeneralScript | null;
  onClose: () => void;
  onSave: (form: DrawerForm) => void;
  onError: () => void;
}) {
  const isView = mode === 'view';
  const prod = kind === 'product' ? (rec as ProductScript | null) : null;
  const gen = kind === 'general' ? (rec as GeneralScript | null) : null;
  const isCoopScene = scene === '商业拜访';
  const [form, setForm] = useState<DrawerForm>({
    product: prod?.product ?? '',
    bizCat: prod?.bizCat ?? '',
    subCat: prod?.subCat ?? '',
    feedback: (prod ?? gen)?.feedback ?? '',
    content: (prod ?? gen)?.content ?? '',
    status: (prod ?? gen)?.status === '停用' ? '停用' : '启用',
    isCoop: prod?.isCoop === '否' ? '否' : '是',
  });
  const [category] = useState(gen?.category ?? '');
  const [errors, setErrors] = useState<Partial<Record<'product' | 'bizCat' | 'content', string>>>({});
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const bizCats = BIZ_CAT_MAP[scene] ?? [];
  const subCats = form.bizCat ? SUB_CAT_MAP[form.bizCat] ?? [] : [];

  const clearErr = (k: 'product' | 'bizCat' | 'content') => setErrors((p) => ({ ...p, [k]: undefined }));

  const submit = () => {
    // FR-17：必填校验（品种/业务类别/话术内容），失败标红 + 滚动到第一个错误字段
    const e: Partial<Record<'product' | 'bizCat' | 'content', string>> = {};
    if (!form.product) e.product = '请填写 / 选择「品种」';
    if (!form.bizCat) e.bizCat = '请填写 / 选择「业务类别」';
    if (!form.content.trim()) e.content = '请填写 / 选择「话术内容」';
    setErrors(e);
    const firstKey = Object.keys(e)[0] as 'product' | 'bizCat' | 'content' | undefined;
    if (firstKey) {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onError();
      return;
    }
    // FR-18：保存过程防重复提交
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      onSave({ ...form, content: form.content.trim(), feedback: form.feedback.trim() });
    }, 200);
  };

  const drawerTitle = isView ? '查看话术' : mode === 'edit' && rec ? `编辑话术（${rec.id}）` : '新增话术';
  const sceneText = gen ? `通用话术 / ${gen.category}` : `品种话术 / ${prod ? `${prod.scene} / ${prod.bizCat}` : scene}`;

  return (
    <>
      <div className="ts-overlay" style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.35)' }} onClick={onClose} />
      <div
        className="ts-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 720,
          maxWidth: '96vw',
          background: '#FFFFFF',
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 头部：标题 + 使用场景（只读） */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 24px 14px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#111827' }}>{drawerTitle}</div>
            <div style={{ fontSize: 'var(--fs-12)', color: '#6B7280', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#F3F4F6', color: '#6B7280' }}>使用场景（系统生成 · 只读）</span>
              {sceneText}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', color: '#6B7280', fontSize: 15 }}>
            ×
          </button>
        </div>

        {/* 表单区：独立滚动 */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            {kind === 'general' ? (
              /* 通用话术查看态（FR-06）：全部字段只读 */
              <>
                <Field label="通用类别">
                  <input value={category} readOnly style={INPUT_RO} />
                </Field>
                <Field label="管理状态">
                  <input value={gen?.status ?? ''} readOnly style={INPUT_RO} />
                </Field>
                <Field label="客户反馈" full>
                  <textarea rows={2} value={form.feedback} readOnly style={{ ...TEXTAREA, ...INPUT_RO }} />
                </Field>
                <Field label="话术内容" full>
                  <textarea rows={5} value={form.content} readOnly style={{ ...TEXTAREA, ...INPUT_RO }} />
                  <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 3 }}>
                    {form.content.length}/{CONTENT_MAX}
                  </div>
                </Field>
                {gen && (
                  <MetaGrid
                    items={[
                      ['编号', gen.id],
                      ['创建人', gen.creator],
                      ['创建时间', gen.createdAt],
                      ['更新人', gen.updater],
                      ['更新时间', gen.updatedAt],
                    ]}
                  />
                )}
              </>
            ) : (
              /* 品种话术表单（FR-16）：拜访场景只读，字段与联动按需求文档 */
              <>
                <Field label="拜访场景（当前选项卡）" tip="拜访场景由所选选项卡决定，不可修改">
                  <div style={{ padding: '7px 0', fontSize: 'var(--fs-13)', color: '#374151' }}>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}>品种话术 · {scene}</span>
                  </div>
                </Field>
                <div data-field="product">
                  <Field label="品种" required error={errors.product}>
                    <select
                      value={form.product}
                      disabled={isView}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, product: e.target.value }));
                        clearErr('product');
                      }}
                      style={{ ...INPUT, ...(errors.product ? { borderColor: '#C73A3A' } : {}), ...(isView ? INPUT_RO : {}), cursor: isView ? 'default' : 'pointer' }}
                    >
                      <option value="">请选择</option>
                      {SCRIPT_PRODUCTS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div data-field="bizCat">
                  <Field label="业务类别" required error={errors.bizCat}>
                    <select
                      value={form.bizCat}
                      disabled={isView}
                      onChange={(e) => {
                        // FR-16：切换业务类别时，类别细分选项重建并清空已选值
                        setForm((p) => ({ ...p, bizCat: e.target.value, subCat: '' }));
                        clearErr('bizCat');
                      }}
                      style={{ ...INPUT, ...(errors.bizCat ? { borderColor: '#C73A3A' } : {}), ...(isView ? INPUT_RO : {}), cursor: isView ? 'default' : 'pointer' }}
                    >
                      <option value="">请选择</option>
                      {bizCats.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="类别细分" tip={form.bizCat && subCats.length === 0 ? '当前业务类别无细分选项，可不填' : undefined}>
                  <select
                    value={form.subCat}
                    disabled={isView || !form.bizCat}
                    onChange={(e) => setForm((p) => ({ ...p, subCat: e.target.value }))}
                    style={{ ...INPUT, ...(isView || !form.bizCat ? INPUT_RO : {}), cursor: isView || !form.bizCat ? 'default' : 'pointer' }}
                  >
                    <option value="">请选择</option>
                    {subCats.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="客户反馈" full tip="自由文本，由维护人自行填写">
                  <textarea rows={2} value={form.feedback} disabled={isView} onChange={(e) => setForm((p) => ({ ...p, feedback: e.target.value }))} style={{ ...TEXTAREA, ...(isView ? INPUT_RO : {}) }} />
                </Field>
                <div data-field="content">
                  <Field label="话术内容" required error={errors.content} full>
                    <textarea
                      rows={4}
                      maxLength={CONTENT_MAX}
                      value={form.content}
                      disabled={isView}
                      placeholder="建议包含：适用情境 + 核心信息 + 行动建议，不超过 500 字"
                      onChange={(e) => {
                        setForm((p) => ({ ...p, content: e.target.value }));
                        if (e.target.value.trim()) clearErr('content');
                      }}
                      style={{ ...TEXTAREA, ...(errors.content ? { borderColor: '#C73A3A' } : {}), ...(isView ? INPUT_RO : {}) }}
                    />
                    <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 3 }}>
                      {form.content.length}/{CONTENT_MAX}
                    </div>
                  </Field>
                </div>
                {/* FR-16：商业拜访时在管理状态上方展示"是否合作性话术"，新增默认"是" */}
                {isCoopScene && (
                  <Field label="是否合作性话术">
                    <div style={{ display: 'flex', gap: 18, padding: '7px 0' }}>
                      {(['是', '否'] as const).map((o) => (
                        <label key={o} style={RADIO}>
                          <input type="radio" name="ts-isCoop" checked={form.isCoop === o} disabled={isView} onChange={() => setForm((p) => ({ ...p, isCoop: o }))} style={{ accentColor: 'var(--color-brand)' }} />
                          <span>{o}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="管理状态" tip="App 端仅在「管理状态=启用」且命中拜访场景时展示该话术">
                  <div style={{ display: 'flex', gap: 18, padding: '7px 0' }}>
                    {(['启用', '停用'] as const).map((o) => (
                      <label key={o} style={RADIO}>
                        <input type="radio" name="ts-status" checked={form.status === o} disabled={isView} onChange={() => setForm((p) => ({ ...p, status: o }))} style={{ accentColor: 'var(--color-brand)' }} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                </Field>
                {/* FR-19：查看态下编号与创建信息完整可读 */}
                {isView && prod && (
                  <MetaGrid
                    items={[
                      ['编号', prod.id],
                      ['创建人', prod.creator],
                      ['创建时间', prod.createdAt],
                      ['更新人', prod.updater],
                      ['更新时间', prod.updatedAt],
                      ...(prod.isAI && prod.confirmBy ? [['AI 入库确认', prod.confirmBy] as [string, ReactNode]] : []),
                    ]}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* 底部：固定操作区（查看态仅保留关闭，FR-06/FR-19） */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid var(--color-border)', background: '#FAFAFA' }}>
          {isView ? (
            <Button onClick={onClose}>关 闭</Button>
          ) : (
            <>
              <Button onClick={onClose} disabled={saving}>
                取 消
              </Button>
              <Button variant="primary" loading={saving} onClick={submit}>
                保 存
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── 导入弹窗（FR-20~25） ─────────────────────────────────────────── */

const IMPORT_COLS = [
  { k: 'product', label: '品种' },
  { k: 'bizCat', label: '业务类别' },
  { k: 'subCat', label: '类别细分' },
  { k: 'feedback', label: '客户反馈' },
  { k: 'content', label: '话术内容' },
  { k: 'status', label: '管理状态' },
] as const;

interface ImportRow {
  lineNo: number;
  product: string;
  bizCat: string;
  subCat: string;
  feedback: string;
  content: string;
  status: string;
  /** 空 = 可导入；否则为重复 / 字典 / 超长等校验未通过原因 */
  err: string;
}

function ImportModal({
  scene,
  existingKeys,
  onClose,
  onImport,
  onToast,
}: {
  scene: string;
  /** 库中已有话术的判重键集合（重复判定键：场景+品种+业务类别+类别细分+话术内容） */
  existingKeys: Set<string>;
  onClose: () => void;
  onImport: (valid: ImportRow[], skipped: number) => void;
  onToast: Props['addToast'];
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [failMsg, setFailMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const validCount = rows?.filter((r) => !r.err).length ?? 0;
  const skipCount = rows ? rows.length - validCount : 0;

  // FR-21：模板为 CSV（UTF-8 带 BOM），列固定，含一行示例数据
  const downloadTemplate = () => {
    const head = IMPORT_COLS.map((c) => csvEsc(c.label)).join(',');
    const example = ['阿卡波糖片', '第三终端拜访', '跟踪巡访服务', '价格贵', '老师，阿卡波糖片是基药目录品种，社区慢病续方开药更方便，餐后血糖控制更平稳。', '启用']
      .map(csvEsc)
      .join(',');
    downloadCsv(`话术导入模板_品种话术-${scene}.csv`, `${head}\n${example}`);
    onToast({ type: 'info', title: `模板已下载（品种话术 · ${scene}）` });
  };

  const handleFile = (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fail = (msg: string) => {
        setRows(null);
        setFileName('');
        setFailMsg(msg);
      };
      const parsed = parseCsv(String(reader.result));
      // FR-22：空文件 / 表头缺列直接报错并终止
      if (!parsed.length || parsed.length <= 1) {
        fail('文件为空，请检查后重新上传');
        return;
      }
      const header = parsed[0].map((x) => String(x).trim());
      const missing = IMPORT_COLS.filter((c) => !header.includes(c.label));
      if (missing.length) {
        fail(`表头与模板不一致（缺少：${missing.map((m) => m.label).join('、')}），请下载最新模板后重试`);
        return;
      }
      setFileName(`${f.name}（${parsed.length - 1} 行数据）`);
      // FR-23：逐行校验 —— 重复判定 + 字典校验 + 超长校验
      const seenInFile = new Set<string>();
      const checked: ImportRow[] = parsed.slice(1).map((raw, idx) => {
        const obj: Record<string, string> = {};
        IMPORT_COLS.forEach((c) => {
          const i = header.indexOf(c.label);
          obj[c.k] = String(raw[i] ?? '').trim();
        });
        if (obj.status !== '启用' && obj.status !== '停用') obj.status = '启用';
        let err = '';
        if (!SCRIPT_PRODUCTS.includes(obj.product as (typeof SCRIPT_PRODUCTS)[number])) err = '品种不在字典内，请核对模板';
        else if (!(BIZ_CAT_MAP[scene] ?? []).includes(obj.bizCat)) err = '业务类别不在当前场景字典内';
        else if (obj.content.length > CONTENT_MAX) err = `话术内容超过 ${CONTENT_MAX} 字上限`;
        else if (!obj.content) err = '话术内容为空';
        const key = dupKeyOf(scene, obj.product, obj.bizCat, obj.subCat, obj.content);
        if (!err) {
          if (seenInFile.has(key)) err = '与文件内其他行重复';
          else if (existingKeys.has(key)) err = '与已有话术重复';
          seenInFile.add(key);
        }
        return { lineNo: idx + 2, product: obj.product, bizCat: obj.bizCat, subCat: obj.subCat, feedback: obj.feedback, content: obj.content, status: obj.status, err };
      });
      setRows(checked);
    };
    reader.readAsText(f, 'utf-8');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="ts-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          borderRadius: 10,
          width: '100%',
          maxWidth: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            fontSize: 'var(--fs-15)',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={15} /> 导入话术
            <span style={{ color: 'var(--color-brand)', fontWeight: 500, fontSize: 'var(--fs-13)' }}>品种话术 · {scene}</span>
          </span>
          <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', color: '#6B7280', fontSize: 15 }}>
            ×
          </button>
        </div>
        <div style={{ padding: '18px 20px', overflowY: 'auto', fontSize: 'var(--fs-13)', lineHeight: 1.8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button icon={<Download size={13} />} onClick={downloadTemplate}>
              下载模板
            </Button>
            <Button icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>
              选择文件上传
            </Button>
            <span style={{ fontSize: 'var(--fs-12)', color: '#6B7280' }}>{fileName}</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target && handleFile(e.target)} />
          </div>
          <div style={{ marginTop: 14 }}>
            {failMsg ? (
              <div style={{ fontSize: 'var(--fs-12)', color: '#C73A3A', textAlign: 'center', padding: '20px 0' }}>{failMsg}</div>
            ) : rows ? (
              <>
                <div style={{ margin: '2px 0 10px', fontSize: 'var(--fs-12)', color: '#6B7280' }}>
                  共 <b style={{ color: '#374151' }}>{rows.length}</b> 行 · 可导入 <b style={{ color: '#248A5A' }}>{validCount}</b> 条 · 重复/校验未通过{' '}
                  <b style={{ color: skipCount ? '#C73A3A' : '#6B7280' }}>{skipCount}</b> 条（这些行不导入）
                </div>
                <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 1, width: 56 }}>行号</th>
                        {IMPORT_COLS.map((c) => (
                          <th key={c.k} style={{ ...TH, position: 'sticky', top: 0, zIndex: 1 }}>
                            {c.label}
                          </th>
                        ))}
                        <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 1, width: 190 }}>校验结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.lineNo} style={{ background: r.err ? 'var(--color-danger-bg)' : 'transparent' }}>
                          <td style={MONO}>{r.lineNo}</td>
                          {IMPORT_COLS.map((c) => (
                            <td key={c.k} style={{ ...TD, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r[c.k] || undefined}>
                              {r[c.k] || <span style={{ color: '#9CA3AF' }}>—</span>}
                            </td>
                          ))}
                          <td style={TD}>
                            {r.err ? <span style={{ color: '#C73A3A', fontSize: 'var(--fs-12)' }}>{r.err}</span> : <span style={{ color: '#248A5A', fontSize: 'var(--fs-12)' }}>✓ 可导入</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 'var(--fs-12)', color: '#6B7280', padding: '30px 0', textAlign: 'center' }}>
                先下载模板填写，再选择文件上传；上传后自动校验是否重复并在此展示
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: '#FAFAFA', borderRadius: '0 0 10px 10px' }}>
          <Button onClick={onClose}>取消</Button>
          {/* FR-23：无任何可导入行时，确认导入保持禁用 */}
          <Button variant="primary" disabled={!rows || validCount === 0} onClick={() => rows && onImport(rows.filter((r) => !r.err), rows.length - validCount)}>
            确认导入
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── 页面主体 ────────────────────────────────────────────────────── */

const PAGE_SIZE = 8;

type TabKey = 'general' | 'product';

export function TalkScriptVariety({ addToast }: Props) {
  const {
    general,
    product,
    addProduct,
    updateProduct,
    setProductStatus,
    batchSetProductStatus,
    importProducts,
    setGeneralStatus,
    batchSetGeneralStatus,
    setAllGeneralStatus,
  } = useTalkScript();

  // FR-02：默认进入"品种话术"Tab，默认子场景"终端拜访"
  const [tab, setTab] = useState<TabKey>('product');
  const [subScene, setSubScene] = useState<string>('终端拜访');
  // 各 Tab 筛选条件与页码相互独立（FR-09）；文本项先存草稿，回车/查询才生效
  const [filters, setFilters] = useState<Record<TabKey, Record<string, string>>>({ general: {}, product: {} });
  const [drafts, setDrafts] = useState<Record<TabKey, Record<string, string>>>({ general: {}, product: {} });
  const [pages, setPages] = useState<Record<TabKey, number>>({ general: 1, product: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; kind: 'general' | 'product'; rec: ProductScript | GeneralScript | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  /* —— 列表数据 —— */

  const sceneCount = useMemo(() => {
    const m: Record<string, number> = {};
    SCENE_LIST.forEach((s) => {
      m[s] = product.filter((r) => r.scene === s).length;
    });
    return m;
  }, [product]);

  const filtered = useMemo(() => {
    const f = filters[tab];
    const kw = (f.kw ?? '').trim().toLowerCase();
    const fb = (f.feedback ?? '').trim().toLowerCase();
    if (tab === 'general') {
      return general.filter(
        (r) =>
          (!f.category || r.category === f.category) &&
          (!f.status || r.status === f.status) &&
          (!fb || r.feedback.toLowerCase().includes(fb)) &&
          (!kw || r.content.toLowerCase().includes(kw)),
      );
    }
    return product
      .filter((r) => r.scene === subScene)
      .filter(
        (r) =>
          (!f.product || r.product === f.product) &&
          (!f.bizCat || r.bizCat === f.bizCat) &&
          (!f.subCat || r.subCat === f.subCat) &&
          (!f.status || r.status === f.status) &&
          (!fb || r.feedback.toLowerCase().includes(fb)) &&
          (!kw || r.content.toLowerCase().includes(kw)),
      );
  }, [tab, filters, general, product, subScene]);

  const baseCount = tab === 'general' ? general.length : sceneCount[subScene] ?? 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // FR-11：筛选后页码超出范围时自动回退到最后一个有效页
  const page = Math.min(pages[tab] || 1, totalPages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allGeneralOn = general.length > 0 && general.every((r) => r.status === '启用');

  /* —— 筛选交互（FR-09）——下拉即时生效；文本回车/查询生效 —— */

  const setSelectFilter = (k: string, v: string) => {
    setFilters((p) => ({ ...p, [tab]: { ...p[tab], [k]: v, ...(k === 'bizCat' ? { subCat: '' } : {}) } }));
    setPages((p) => ({ ...p, [tab]: 1 }));
  };

  const setDraftFilter = (k: string, v: string) => {
    setDrafts((p) => ({ ...p, [tab]: { ...p[tab], [k]: v } }));
  };

  const applyTextFilters = () => {
    setFilters((p) => ({ ...p, [tab]: { ...p[tab], feedback: drafts[tab].feedback ?? '', kw: drafts[tab].kw ?? '' } }));
    setPages((p) => ({ ...p, [tab]: 1 }));
  };

  const resetFilters = () => {
    setFilters((p) => ({ ...p, [tab]: {} }));
    setDrafts((p) => ({ ...p, [tab]: {} }));
    setPages((p) => ({ ...p, [tab]: 1 }));
    setSelected([]);
  };

  /* —— Tab / 子场景切换（FR-02 / FR-04） —— */

  const switchTab = (k: TabKey) => {
    if (tab === k) return;
    setTab(k);
    setSelected([]); // 切换 Tab 清空勾选，保留各自筛选条件与页码
  };

  const switchSubScene = (s: string) => {
    if (subScene === s) return;
    setSubScene(s);
    setPages((p) => ({ ...p, product: 1 }));
    setFilters((p) => ({ ...p, product: {} }));
    setDrafts((p) => ({ ...p, product: {} }));
    setSelected([]);
  };

  /* —— 勾选（当前页全选 + 半选，跨页保留，FR-05/FR-10） —— */

  const rowIds = rows.map((r) => r.id);
  const pageAllChecked = rowIds.length > 0 && rowIds.every((id) => selected.includes(id));
  const pageSomeChecked = rowIds.some((id) => selected.includes(id)) && !pageAllChecked;

  const toggleRow = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const togglePageAll = (checked: boolean) => {
    setSelected((p) => (checked ? [...new Set([...p, ...rowIds])] : p.filter((id) => !rowIds.includes(id))));
  };

  /* —— 启停操作（FR-07 / FR-12 / FR-13） —— */

  const askStopProduct = (r: ProductScript) => {
    setConfirm({
      title: '停用话术',
      danger: true,
      okText: '确认停用',
      message: (
        <>
          确认停用该话术？停用后 App 端将不再展示（历史拜访记录不受影响）。
          <br />
          <span style={{ color: '#6B7280', fontSize: 'var(--fs-12)' }}>
            {r.id} · {r.product} · {r.bizCat}
            {r.subCat ? ` / ${r.subCat}` : ''}：{r.content.slice(0, 40)}…
          </span>
        </>
      ),
      onOk: () => {
        setProductStatus(r.id, '停用');
        addToast({ type: 'success', title: '已停用', description: `${r.id} · App 端不再展示` });
      },
    });
  };

  const enableProduct = (r: ProductScript) => {
    setProductStatus(r.id, '启用');
    addToast({ type: 'success', title: `已启用（${r.id}）` });
  };

  const askBatchStopProduct = () => {
    const n = selected.length;
    if (!n) return;
    setConfirm({
      title: '批量停用话术',
      danger: true,
      okText: '确认停用',
      message: (
        <>
          确认批量停用选中的 <b>{n}</b> 条话术？停用后 App 端将不再展示（历史拜访记录不受影响）。
        </>
      ),
      onOk: () => {
        batchSetProductStatus(selected, '停用');
        setSelected([]);
        addToast({ type: 'success', title: `已批量停用 ${n} 条话术` });
      },
    });
  };

  const askStopGeneral = (r: GeneralScript) => {
    setConfirm({
      title: '停用话术',
      danger: true,
      okText: '确认停用',
      message: (
        <>
          确认停用该通用话术？停用后 App 端将不再展示（历史拜访记录不受影响）。
          <br />
          <span style={{ color: '#6B7280', fontSize: 'var(--fs-12)' }}>
            {r.id} · {r.category}：{r.content.slice(0, 40)}…
          </span>
        </>
      ),
      onOk: () => {
        setGeneralStatus(r.id, '停用');
        addToast({ type: 'success', title: '已停用', description: `${r.id} · App 端不再展示` });
      },
    });
  };

  const enableGeneral = (r: GeneralScript) => {
    setGeneralStatus(r.id, '启用');
    addToast({ type: 'success', title: `已启用（${r.id}）` });
  };

  const batchGeneral = (status: '启用' | '停用') => {
    const n = selected.length;
    if (!n) return;
    const run = () => {
      batchSetGeneralStatus(selected, status);
      setSelected([]);
      addToast({ type: 'success', title: `已批量${status === '启用' ? '启用' : '停用'} ${n} 条话术` });
    };
    if (status === '启用') {
      run(); // 批量启用无需确认，立即生效（FR-07）
      return;
    }
    setConfirm({
      title: '批量停用话术',
      danger: true,
      okText: '确认停用',
      message: (
        <>
          确认批量停用选中的 <b>{n}</b> 条通用话术？停用后 App 端将不再展示（历史拜访记录不受影响）。
        </>
      ),
      onOk: run,
    });
  };

  const askGlobalToggleGeneral = () => {
    const stop = allGeneralOn;
    setConfirm({
      title: stop ? '全局停用通用话术' : '全局开启通用话术',
      danger: stop,
      okText: stop ? '确认停用' : '确认开启',
      message: stop ? (
        <>
          确认<b>全局停用</b>全部通用话术？停用后 App 端不再展示任何通用话术（历史拜访记录不受影响）。
        </>
      ) : (
        <>
          确认<b>全局开启</b>全部通用话术？开启后全部通用话术在 App 端恢复可见。
        </>
      ),
      onOk: () => {
        setAllGeneralStatus(stop ? '停用' : '启用');
        setSelected([]);
        addToast({ type: 'success', title: stop ? '已全局停用全部通用话术' : '已全局开启全部通用话术' });
      },
    });
  };

  /* —— 导出（FR-26，仅品种话术，导出当前筛选全部结果） —— */

  const exportCsv = () => {
    if (!filtered.length) {
      addToast({ type: 'error', title: '当前筛选结果为空，无可导出数据' });
      return;
    }
    // 导出入口仅在品种话术 Tab 存在（FR-26），此处收窄为品种话术行
    const list = filtered as ProductScript[];
    const head = ['编号', '拜访场景', '品种', '业务类别', '类别细分', '客户反馈', '话术内容', '是否合作性话术', '管理状态', '创建时间', '更新时间'];
    const body = list.map((r) =>
      [r.id, r.scene, r.product, r.bizCat, r.subCat, r.feedback, r.content, subScene === '商业拜访' ? r.isCoop ?? '' : '', r.status, r.createdAt, r.updatedAt]
        .map(csvEsc)
        .join(','),
    );
    downloadCsv(`话术导出_品种话术_${todayStr()}.csv`, [head.join(','), ...body].join('\n'));
    addToast({ type: 'success', title: `已导出 ${list.length} 条（按当前筛选结果）` });
  };

  /* —— 导入（FR-24）：可导入行写入当前子场景，跳过行不影响其他行 —— */

  const existingKeys = useMemo(() => new Set(product.map((r) => dupKeyOf(r.scene, r.product, r.bizCat, r.subCat, r.content))), [product]);

  const runImport = (validRows: ImportRow[], skipped: number) => {
    importProducts(
      subScene,
      validRows.map((r) => ({
        product: r.product,
        bizCat: r.bizCat,
        subCat: r.subCat,
        feedback: r.feedback,
        content: r.content,
        status: r.status === '停用' ? '停用' : '启用',
      })),
    );
    setImportOpen(false);
    setPages((p) => ({ ...p, product: 1 }));
    addToast({
      type: 'success',
      title: `成功导入 ${validRows.length} 条话术，跳过 ${skipped} 条`,
      description: `导入数据归属当前子场景：品种话术 · ${subScene}`,
    });
  };

  /* —— 抽屉保存（FR-18）：新增插入首位回第 1 页；编辑保留编号与场景 —— */

  const saveDrawer = (form: DrawerForm) => {
    if (drawer?.mode === 'edit' && drawer.rec) {
      const rec = drawer.rec as ProductScript;
      updateProduct(rec.id, {
        product: form.product,
        bizCat: form.bizCat,
        subCat: form.subCat,
        feedback: form.feedback,
        content: form.content,
        status: form.status,
        isCoop: rec.scene === '商业拜访' ? form.isCoop : undefined,
      });
      addToast({ type: 'success', title: `话术已更新（${rec.id}）` });
    } else {
      const rec = addProduct({
        scene: subScene,
        product: form.product,
        bizCat: form.bizCat,
        subCat: form.subCat,
        feedback: form.feedback,
        content: form.content,
        status: form.status,
        isCoop: subScene === '商业拜访' ? form.isCoop : undefined,
      });
      setPages((p) => ({ ...p, product: 1 }));
      addToast({ type: 'success', title: `已新增话术（${rec.id}）` });
    }
    setDrawer(null);
  };

  /* —— Esc 逐层关闭（FR-28：确认 > 导入 > 抽屉） —— */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else if (importOpen) setImportOpen(false);
      else if (drawer) setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, importOpen, drawer]);

  /* —— 筛选区配置（按当前 Tab 动态渲染，FR-09） —— */

  const filterDefs: { k: string; label: string; type: 'select' | 'input'; options?: string[]; ph?: string }[] =
    tab === 'general'
      ? [
          { k: 'category', label: '通用类别', type: 'select', options: [...GENERAL_CATS] },
          { k: 'feedback', label: '客户反馈', type: 'input', ph: '客户反馈关键词' },
          { k: 'status', label: '管理状态', type: 'select', options: ['启用', '停用'] },
          { k: 'kw', label: '话术内容', type: 'input', ph: '搜索话术内容' },
        ]
      : [
          { k: 'product', label: '品种', type: 'select', options: [...SCRIPT_PRODUCTS] },
          { k: 'bizCat', label: '业务类别', type: 'select', options: [...(BIZ_CAT_MAP[subScene] ?? [])] },
          { k: 'subCat', label: '类别细分', type: 'select', options: [...(filters.product.bizCat ? SUB_CAT_MAP[filters.product.bizCat] ?? [] : [])] },
          { k: 'feedback', label: '客户反馈', type: 'input', ph: '客户反馈关键词' },
          { k: 'status', label: '管理状态', type: 'select', options: ['启用', '停用'] },
          { k: 'kw', label: '话术内容', type: 'input', ph: '搜索话术内容' },
        ];

  const hasActiveFilter = Object.values(filters[tab] ?? {}).some(Boolean);
  const isCoopCol = tab === 'product' && subScene === '商业拜访';

  /* —— 表格单元格 —— */

  const contentCell = (r: { content: string; isAI?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
      {r.isAI && (
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 999,
            background: 'var(--color-brand-subtle)',
            color: 'var(--color-brand)',
            flexShrink: 0,
            marginTop: 2,
          }}
          title="baiyee-AI 采纳入库"
        >
          ✦ AI
        </span>
      )}
      <span className="ts-clamp2" title={r.content} style={{ color: '#374151' }}>
        {r.content}
      </span>
    </div>
  );

  const dimOrDash = (v: string) => (v ? <span>{v}</span> : <span style={{ color: '#9CA3AF' }}>—</span>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* FR-01：页头与全局操作（导入/新增仅品种话术 Tab 可见） */}
      <PageHeader
        title="话术管理"
        description="按「拜访场景 → 业务类别 → 类别细分」维护品种话术；通用话术为系统内置。管理状态是 App 端展示的主开关，停用不影响历史拜访记录。"
        actions={
          tab === 'product' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                导入话术
              </Button>
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDrawer({ mode: 'create', kind: 'product', rec: null })}>
                新增话术
              </Button>
            </div>
          ) : undefined
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 32px' }}>
        {/* Tab + 子场景 + 说明条（一个面板，FR-02/03/04） */}
        <div style={{ ...CARD, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4, padding: '0 8px', borderBottom: tab === 'general' ? 'none' : '1px solid var(--color-border)' }}>
            {(
              [
                ['general', '通用话术', general.length],
                ['product', '品种话术', product.length],
              ] as const
            ).map(([k, label, cnt]) => (
              <div
                key={k}
                onClick={() => switchTab(k)}
                style={{
                  padding: '12px 18px',
                  cursor: 'pointer',
                  fontSize: 'var(--fs-14)',
                  color: tab === k ? 'var(--color-brand)' : '#6B7280',
                  fontWeight: tab === k ? 600 : 400,
                  borderBottom: `2px solid ${tab === k ? 'var(--color-brand)' : 'transparent'}`,
                  marginBottom: -1,
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {label}
                <span
                  style={{
                    fontSize: 11,
                    background: tab === k ? 'var(--color-brand-subtle)' : '#F3F4F6',
                    color: tab === k ? 'var(--color-brand)' : '#6B7280',
                    borderRadius: 8,
                    padding: '1px 7px',
                  }}
                >
                  {cnt}
                </span>
              </div>
            ))}
          </div>

          {/* 子场景导航（FR-04，仅品种话术） */}
          {tab === 'product' && (
            <div style={{ padding: '12px 16px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SCENE_LIST.map((s) => (
                <div
                  key={s}
                  onClick={() => switchSubScene(s)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 16,
                    border: `1px solid ${subScene === s ? 'var(--color-brand)' : 'var(--color-border)'}`,
                    cursor: 'pointer',
                    fontSize: 'var(--fs-13)',
                    color: subScene === s ? '#fff' : '#6B7280',
                    background: subScene === s ? 'var(--color-brand)' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {s}
                  <span style={{ fontSize: '10.5px', opacity: 0.75 }}>{sceneCount[s] ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          {/* 说明条（FR-03，仅通用话术） */}
          {tab === 'general' && (
            <div style={{ padding: '10px 16px 12px', fontSize: 'var(--fs-12)', color: '#6B7280', lineHeight: 1.8, borderTop: '1px dashed var(--color-border)' }}>
              通用话术为系统内置内容，仅支持<b style={{ color: '#374151' }}>查看</b>与<b style={{ color: '#374151' }}>启停</b>（单条 / 批量 / 全局）；App
              端可见性由管理状态控制，历史拜访记录不受影响。
            </div>
          )}
        </div>

        {/* 筛选区（FR-09） */}
        <div style={{ ...CARD, padding: '14px 16px 6px', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: '10px 14px' }}>
            {filterDefs.map((f) =>
              f.type === 'select' ? (
                <div key={f.k} style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: 'var(--fs-12)', color: '#6B7280', marginBottom: 5 }}>{f.label}</label>
                  <select value={filters[tab][f.k] ?? ''} onChange={(e) => setSelectFilter(f.k, e.target.value)} style={{ ...INPUT, padding: '6px 9px', cursor: 'pointer' }}>
                    <option value="">全部</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div key={f.k} style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: 'var(--fs-12)', color: '#6B7280', marginBottom: 5 }}>{f.label}</label>
                  <input
                    value={drafts[tab][f.k] ?? ''}
                    placeholder={f.ph}
                    onChange={(e) => setDraftFilter(f.k, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyTextFilters()}
                    style={{ ...INPUT, padding: '6px 9px' }}
                  />
                </div>
              ),
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: 'var(--fs-12)', color: '#6B7280', marginBottom: 5 }}>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="primary" onClick={applyTextFilters}>
                  查 询
                </Button>
                <Button size="sm" onClick={resetFilters}>
                  重 置
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表区（FR-05 / FR-10） */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {/* 工具栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: '#111827' }}>
              {tab === 'product' ? `品种话术 · ${subScene}` : '通用话术'}
              <span style={{ fontSize: 'var(--fs-12)', fontWeight: 400, color: '#6B7280', marginLeft: 8 }}>
                共 {baseCount} 条，筛选后 {filtered.length} 条
              </span>
            </span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {tab === 'general' ? (
                <>
                  <Button size="sm" variant={allGeneralOn ? 'danger' : 'primary'} onClick={askGlobalToggleGeneral}>
                    {allGeneralOn ? '全局停用' : '全局开启'}
                  </Button>
                  <Button size="sm" disabled={selected.length === 0} onClick={() => batchGeneral('停用')}>
                    批量停用（{selected.length}）
                  </Button>
                  <Button size="sm" disabled={selected.length === 0} onClick={() => batchGeneral('启用')}>
                    批量启用（{selected.length}）
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant={selected.length ? 'danger' : 'secondary'} disabled={selected.length === 0} onClick={askBatchStopProduct}>
                    批量停用（{selected.length}）
                  </Button>
                  <Button size="sm" icon={<Download size={13} />} onClick={exportCsv}>
                    导出当前结果
                  </Button>
                </>
              )}
            </span>
          </div>

          {/* 表格 */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: tab === 'product' ? 1080 : 900 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 40 }}>
                    <input
                      type="checkbox"
                      checked={pageAllChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = pageSomeChecked;
                      }}
                      onChange={(e) => togglePageAll(e.target.checked)}
                      style={{ accentColor: 'var(--color-brand)' }}
                    />
                  </th>
                  <th style={{ ...TH, width: 90 }}>编号</th>
                  {tab === 'general' ? (
                    <>
                      <th style={{ ...TH, width: 100 }}>通用类别</th>
                      <th style={{ ...TH, width: 130 }}>客户反馈</th>
                    </>
                  ) : (
                    <>
                      <th style={{ ...TH, width: 170 }}>品种</th>
                      <th style={{ ...TH, width: 120 }}>业务类别</th>
                      <th style={{ ...TH, width: 120 }}>类别细分</th>
                      {isCoopCol && <th style={{ ...TH, width: 120 }}>是否合作性话术</th>}
                      <th style={{ ...TH, width: 130 }}>客户反馈</th>
                    </>
                  )}
                  <th style={TH}>话术内容</th>
                  <th style={{ ...TH, width: 90 }}>管理状态</th>
                  <th style={{ ...TH, width: 150 }}>更新时间</th>
                  <th style={{ ...TH, width: tab === 'general' ? 120 : 150 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = r as GeneralScript;
                  const p = r as ProductScript;
                  const isOn = r.status === '启用';
                  return (
                    <tr
                      key={r.id}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFBFD')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={TD}>
                        <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleRow(r.id)} style={{ accentColor: 'var(--color-brand)' }} />
                      </td>
                      <td style={MONO}>{r.id}</td>
                      {tab === 'general' ? (
                        <>
                          <td style={TD}>{g.category}</td>
                          <td style={{ ...TD, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.feedback || undefined}>
                            {dimOrDash(g.feedback)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...TD, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.product}>
                            {p.product}
                          </td>
                          <td style={TD}>{p.bizCat}</td>
                          <td style={TD}>{dimOrDash(p.subCat)}</td>
                          {isCoopCol && <td style={TD}>{dimOrDash(p.isCoop ?? '')}</td>}
                          <td style={{ ...TD, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.feedback || undefined}>
                            {dimOrDash(p.feedback)}
                          </td>
                        </>
                      )}
                      <td style={{ ...TD, maxWidth: 380 }}>{contentCell(r)}</td>
                      <td style={TD}>
                        <StatusDot status={r.status} />
                      </td>
                      <td style={{ ...TD, fontSize: 'var(--fs-12)', color: '#6B7280' }}>{r.updatedAt}</td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <button style={LINK_BTN} onClick={() => setDrawer({ mode: 'view', kind: tab, rec: r })}>
                            查看
                          </button>
                          {tab === 'product' && (
                            <button style={LINK_BTN} onClick={() => setDrawer({ mode: 'edit', kind: 'product', rec: p })}>
                              编辑
                            </button>
                          )}
                          {/* FR-12/FR-07：启用→停用需红色二次确认；停用/待启用→启用立即生效 */}
                          {isOn ? (
                            <button style={DANGER_BTN} onClick={() => (tab === 'general' ? askStopGeneral(g) : askStopProduct(p))}>
                              停用
                            </button>
                          ) : (
                            <button style={LINK_BTN} onClick={() => (tab === 'general' ? enableGeneral(g) : enableProduct(p))}>
                              启用
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 空态（FR-14） */}
          {rows.length === 0 && (
            <EmptyState
              title="没有匹配的话术"
              description="尝试调整筛选条件，或新增一条话术"
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  {tab === 'product' && (
                    <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setDrawer({ mode: 'create', kind: 'product', rec: null })}>
                      新增话术
                    </Button>
                  )}
                  {hasActiveFilter && (
                    <Button size="sm" onClick={resetFilters}>
                      清空筛选
                    </Button>
                  )}
                </div>
              }
            />
          )}

          {/* 分页（FR-11：单页固定 8 条，超过 7 页折叠页码） */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', fontSize: 'var(--fs-12)', color: '#6B7280', flexWrap: 'wrap', gap: 8 }}>
            <span>
              共 {filtered.length} 条 · 第 {page} / {totalPages} 页
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setPages((p) => ({ ...p, [tab]: page - 1 }))} disabled={page <= 1} style={pgBtn(false, page <= 1)}>
                ‹
              </button>
              {pageList(page, totalPages).map((it, idx) =>
                it === '...' ? (
                  <span key={`e${idx}`} style={{ padding: '0 2px', color: '#9CA3AF' }}>
                    …
                  </span>
                ) : (
                  <button key={it} onClick={() => setPages((p) => ({ ...p, [tab]: it }))} style={pgBtn(it === page)}>
                    {it}
                  </button>
                ),
              )}
              <button onClick={() => setPages((p) => ({ ...p, [tab]: page + 1 }))} disabled={page >= totalPages} style={pgBtn(false, page >= totalPages)}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 抽屉 / 导入弹窗 / 二次确认 */}
      {drawer && (
        <ScriptDrawer
          mode={drawer.mode}
          kind={drawer.kind}
          scene={drawer.mode === 'create' ? subScene : (drawer.rec as ProductScript).scene}
          rec={drawer.rec}
          onClose={() => setDrawer(null)}
          onSave={saveDrawer}
          onError={() => addToast({ type: 'error', title: '请完善表单中标红的必填项' })}
        />
      )}
      {importOpen && <ImportModal scene={subScene} existingKeys={existingKeys} onClose={() => setImportOpen(false)} onImport={runImport} onToast={addToast} />}
      {confirm && <ConfirmModal state={confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

/** 页码折叠：超过 7 页保留首尾页与当前页附近页码，省略号占位（FR-11） */
function pageList(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | '...')[] = [1];
  const from = Math.max(2, page - 2);
  const to = Math.min(totalPages - 1, page + 2);
  if (from > 2) out.push('...');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < totalPages - 1) out.push('...');
  out.push(totalPages);
  return out;
}

/* 分页按钮样式 */
function pgBtn(active: boolean, disabled?: boolean): CSSProperties {
  return {
    minWidth: 28,
    height: 28,
    border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-brand)' : '#fff',
    color: active ? '#fff' : disabled ? '#D1D5DB' : '#374151',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 'var(--fs-12)',
    fontFamily: 'var(--font-mono)',
    padding: '0 6px',
  };
}
