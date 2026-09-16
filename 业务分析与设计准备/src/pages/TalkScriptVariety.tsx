import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Copy, Download, History, Plus, Sparkles, Upload } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination } from '../components/Pagination';
import { StatusTag } from '../components/StatusTag';
import { EmptyState } from '../components/EmptyState';
import type { ToastMessage } from '../components/Toast';
import type { NavigateFn, Role, TalkScript } from '../types';
import {
  ALL_VARIETIES,
  DEPT_RULES,
  FIRST_CATS,
  SEARCH_FIRST_CATS,
  SUB_CATS,
  VARIETIES,
  useTalkScript,
} from '../context/TalkScriptContext';
import { MIN_COST, setPendingScriptTask, useAICredit } from '../context/AICreditContext';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
  navigate: NavigateFn;
}

/* ─── 局部样式 ─────────────────────────────────────────────────────── */

const CARD: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
};

const TH: CSSProperties = {
  textAlign: 'left',
  fontSize: 'var(--fs-12)',
  fontWeight: 500,
  color: '#6B7280',
  padding: '10px 12px',
  whiteSpace: 'nowrap',
};

const TD: CSSProperties = {
  fontSize: 'var(--fs-13)',
  color: '#374151',
  padding: '10px 12px',
  borderBottom: '1px solid #F3F4F6',
  whiteSpace: 'nowrap',
};

const LINK_BTN: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 'var(--fs-12)',
  color: 'var(--color-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const DANGER_BTN: CSSProperties = { ...LINK_BTN, color: '#C73A3A' };

const SEP: ReactNode = <span style={{ color: '#D1D5DB', fontSize: 12 }}>{' · '}</span>;

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-13)',
  fontWeight: 500,
  color: '#374151',
  marginBottom: 4,
};

const INPUT: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  fontSize: 'var(--fs-13)',
  color: '#1F2937',
  background: '#FFFFFF',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  outline: 'none',
  fontFamily: 'inherit',
};

const INPUT_RO: CSSProperties = { ...INPUT, background: '#F9FAFB', color: '#9CA3AF' };

const TEXTAREA: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 'var(--fs-13)',
  color: '#1F2937',
  background: '#FFFFFF',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  outline: 'none',
  resize: 'none',
  fontFamily: 'inherit',
  lineHeight: 1.6,
};

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={FIELD_LABEL}>
        {label}
        {required && <span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 'var(--fs-11)', color: '#C73A3A' }}>{error}</span>}
    </div>
  );
}

const NOTE_BOX: CSSProperties = {
  fontSize: 'var(--fs-12)',
  color: '#6B7280',
  background: '#F9FAFB',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: 12,
};

/* ─── 动态指引入口卡 ─────────────────────────────────────────────── */

function EntryCard({
  filters,
  pendingAiCount,
  credits,
  onGoGenerate,
  onGoRecords,
  onGoRecharge,
  onHandlePending,
}: {
  filters: Record<string, string>;
  pendingAiCount: number;
  credits: number;
  onGoGenerate: () => void;
  onGoRecords: () => void;
  onGoRecharge: () => void;
  onHandlePending: () => void;
}) {
  // 入口卡文案轮播（余额不足/有待启用时被状态态覆盖）
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setCycle((c) => c + 1), 4000);
    return () => window.clearInterval(timer);
  }, []);

  const lowBalance = credits < MIN_COST;
  const hasPending = pendingAiCount > 0;
  const headline =
    hasPending || lowBalance
      ? null
      : [
          'AI 已为本厂生成 12 条合规话术',
          '3 分钟生成一套学术拜访话术包 · 100 积分',
          `单条生成仅需 10 积分 · 当前余额 ${credits.toLocaleString()}`,
        ][cycle % 3];

  const badgeBg = hasPending ? '#C77A16' : 'var(--color-brand)';

  return (
    <div
      className="talk-script-entry-card"
      style={{
        ...CARD,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        marginBottom: 12,
        borderLeft: '3px solid var(--color-brand)',
      }}
    >
      <span
        className="talk-script-entry-badge"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: badgeBg,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Sparkles size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {headline ? (
          <p key={cycle} className="talk-script-cycle-text" style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 600, color: '#1F2937' }}>
            {headline}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 600, color: hasPending ? '#C77A16' : '#1F2937' }}>
            {hasPending
              ? `✦ ${pendingAiCount} 条 AI 话术待启用`
              : '积分余额不足，充值后可继续生成'}
          </p>
        )}
        <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-12)', color: '#6B7280' }}>
          {hasPending
            ? '在 baiyee-AI 采纳入库的话术，启用后才会下发移动端使用'
            : '基于本厂合规资产生成 · 生成即合规校验 · 采纳直达本列表'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {hasPending ? (
          <>
            <Button size="sm" onClick={onGoRecords}>
              查看 AI 生成记录
            </Button>
            <Button size="sm" variant="primary" onClick={onHandlePending}>
              去处理
            </Button>
          </>
        ) : lowBalance ? (
          <Button size="sm" variant="primary" onClick={onGoRecharge}>
            去充值
          </Button>
        ) : (
          <>
            <Button size="sm" icon={<History size={14} />} onClick={onGoRecords}>
              查看记录
            </Button>
            <Button size="sm" variant="primary" iconAfter={<ArrowRight size={14} />} onClick={onGoGenerate}>
              去 baiyee-AI 生成
            </Button>
          </>
        )}
      </div>
      <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', flexShrink: 0 }}>
        {filters.variety ? `带入品种：${filters.variety}` : '（演示）AI 生成与积分在 baiyee-AI'}
      </span>
    </div>
  );
}

/* ─── 弹窗体 ─────────────────────────────────────────────────────── */

interface FormState {
  variety: string;
  firstCat: string;
  secondCat: string;
  content: string;
  feedback: string;
}

const EMPTY_FORM: FormState = { variety: '', firstCat: '', secondCat: '', content: '', feedback: '' };

function NewScriptModal({ onClose, onSave }: { onClose: () => void; onSave: (data: FormState) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const subCats = form.firstCat ? SUB_CATS[form.firstCat] ?? [] : [];

  const save = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.variety) e.variety = '请选择品种';
    if (!form.firstCat) e.firstCat = '请选择一级类别';
    if (!form.content.trim()) e.content = '请输入话术内容';
    if (!form.feedback.trim()) e.feedback = '请输入客户反馈';
    setErrors(e);
    if (Object.keys(e).length === 0) onSave({ ...form, secondCat: form.secondCat || '—' });
  };

  return (
    <Modal
      open
      title="新建品种话术"
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="品种" required error={errors.variety}>
          <select
            value={form.variety}
            onChange={(e) => setForm((p) => ({ ...p, variety: e.target.value }))}
            style={{ ...INPUT, cursor: 'pointer' }}
          >
            <option value="">请选择品种</option>
            {ALL_VARIETIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="一级类别" required error={errors.firstCat}>
            <select
              value={form.firstCat}
              onChange={(e) => setForm((p) => ({ ...p, firstCat: e.target.value, secondCat: '' }))}
              style={{ ...INPUT, cursor: 'pointer' }}
            >
              <option value="">请选择</option>
              {FIRST_CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="二级类别">
            {form.firstCat === '跟台服务' ? (
              <input value="—" readOnly style={INPUT_RO} />
            ) : (
              <select
                value={form.secondCat}
                onChange={(e) => setForm((p) => ({ ...p, secondCat: e.target.value }))}
                disabled={!form.firstCat}
                style={{ ...INPUT, cursor: 'pointer', ...(form.firstCat ? {} : { background: '#F9FAFB' }) }}
              >
                <option value="">请选择</option>
                {subCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="话术内容" required error={errors.content}>
          <textarea
            rows={4}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="拜访时向客户传达的标准表述…"
            style={TEXTAREA}
          />
        </Field>
        <Field label="客户反馈" required error={errors.feedback}>
          <textarea
            rows={3}
            value={form.feedback}
            onChange={(e) => setForm((p) => ({ ...p, feedback: e.target.value }))}
            placeholder="预期的客户回应或应答口径…"
            style={TEXTAREA}
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditScriptModal({ script, onClose, onSave }: { script: TalkScript; onClose: () => void; onSave: (content: string, feedback: string) => void }) {
  const [content, setContent] = useState(script.content);
  const [feedback, setFeedback] = useState(script.feedback);
  return (
    <Modal
      open
      title="修改话术"
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(content, feedback)}>
            保存
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            fontSize: 'var(--fs-12)',
            color: '#176B5B',
            background: 'var(--color-brand-subtle)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          品种与类别不可变更；如需调整，请删除后新建，或使用复制功能。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
          <Field label="品种">
            <input value={script.variety} readOnly style={INPUT_RO} />
          </Field>
          <Field label="一级类别">
            <input value={script.firstCat} readOnly style={INPUT_RO} />
          </Field>
          <Field label="二级类别">
            <input value={script.secondCat} readOnly style={INPUT_RO} />
          </Field>
        </div>
        <Field label="话术内容" required>
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} style={TEXTAREA} />
        </Field>
        <Field label="客户反馈" required>
          <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} style={TEXTAREA} />
        </Field>
      </div>
    </Modal>
  );
}

function DeptModal({ script, onClose, onSave }: { script: TalkScript; onClose: () => void; onSave: (rule: string) => void }) {
  const [rule, setRule] = useState(script.deptRule);
  return (
    <Modal
      open
      title={`关联科室规则 · ${script.variety}`}
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(rule)}>
            保存
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            fontSize: 'var(--fs-12)',
            color: '#176B5B',
            background: 'var(--color-brand-subtle)',
            borderRadius: 8,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {[
            '该配置只在医院拜访（终端拜访）场景下生效，并且只适用于 SDGT（服务专员）',
            '科室规则为空时，本条话术的使用不受任何限制',
            '选择了科室规则后，本条话术只能被规则内包含的科室使用',
            '规则由平台侧统一配置',
          ].map((t) => (
            <p key={t} style={{ margin: 0 }}>
              · {t}
            </p>
          ))}
        </div>
        <Field label="科室规则">
          <select value={rule} onChange={(e) => setRule(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            {DEPT_RULES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function CopyModal({ onClose, onSave }: { onClose: () => void; onSave: (src: string, tgt: string) => void }) {
  const [src, setSrc] = useState('');
  const [tgt, setTgt] = useState('');
  const [errors, setErrors] = useState<{ src?: string; tgt?: string }>({});

  const confirm = () => {
    const e: { src?: string; tgt?: string } = {};
    if (!src) e.src = '请选择源品种';
    if (!tgt) e.tgt = '请选择目标品种';
    if (src && tgt && src === tgt) e.tgt = '源品种与目标品种不能相同';
    setErrors(e);
    if (Object.keys(e).length === 0) onSave(src, tgt);
  };

  const select = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
      <option value="">请选择</option>
      {ALL_VARIETIES.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      open
      title="复制品种话术"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={confirm}>
            复制
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="源品种" required error={errors.src}>
            {select(src, setSrc)}
          </Field>
          <Field label="目标品种" required error={errors.tgt}>
            {select(tgt, setTgt)}
          </Field>
        </div>
        <p style={{ ...NOTE_BOX, margin: 0 }}>
          按一级类别、二级类别、话术内容、客户反馈四项判重，目标品种已存在相同话术自动跳过。
        </p>
      </div>
    </Modal>
  );
}

function BatchCopyModal({ onClose, onSave }: { onClose: () => void; onSave: (src: string) => void }) {
  const [src, setSrc] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const candidates = VARIETIES.filter((v) => v !== src);

  useEffect(() => {
    setSelected([...candidates]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const run = () => {
    if (!src) return;
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      onSave(src);
    }, 1400);
  };

  return (
    <Modal
      open
      title="批量复制品种话术"
      width={640}
      onClose={loading ? () => undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button variant="primary" loading={loading} disabled={!src || selected.length === 0} onClick={run}>
            批量复制
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="源品种" required>
          <select value={src} onChange={(e) => setSrc(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            <option value="">请选择源品种</option>
            {ALL_VARIETIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {src && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: '#374151' }}>
                目标品种（同公司，{candidates.length} 个可选）
              </span>
              <span style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-12)' }}>
                <button style={LINK_BTN} onClick={() => setSelected([...candidates])}>
                  全选
                </button>
                <span style={{ color: '#E5E7EB' }}>|</span>
                <button style={LINK_BTN} onClick={() => setSelected([])}>
                  清空
                </button>
              </span>
            </div>
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {candidates.map((v) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--fs-13)', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(v)}
                    onChange={(e) => setSelected((p) => (e.target.checked ? [...p, v] : p.filter((x) => x !== v)))}
                    style={{ accentColor: 'var(--color-brand)' }}
                  />
                  {v}
                </label>
              ))}
            </div>
          </div>
        )}
        <p style={{ ...NOTE_BOX, margin: 0 }}>目标品种限定为源品种同公司品种；跨公司复制请使用单品种复制。</p>
      </div>
    </Modal>
  );
}

function ImportModal({ addToast, onClose }: { addToast: Props['addToast']; onClose: () => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const results = [
    { row: 1, ok: true, msg: '导入成功' },
    { row: 2, ok: true, msg: '导入成功' },
    { row: 3, ok: false, msg: '失败：品种不存在（商品名+规格+持有人三项组合未匹配到品种）' },
    { row: 4, ok: false, msg: '失败：话术重复（同品种下一级/二级/内容/反馈完全相同，已跳过）' },
    { row: 5, ok: true, msg: '导入成功（默认话术）' },
  ];

  return (
    <Modal
      open
      title="数据导入"
      width={720}
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!file} onClick={() => setDone(true)}>
              导入
            </Button>
          </>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            icon={<Download size={13} />}
            onClick={() =>
              addToast({
                type: 'info',
                title: '下载模板（演示）',
                description:
                  '原型未生成真实文件。药厂专用模板《话术导入模板_药厂.xlsx》共 9 列：序号/商品名/规格/药品上市许可持有人/一类级别/二类级别/话术内容/话术反馈/话术类别。',
              })
            }
          >
            下载模板
          </Button>
        </div>
        {!done ? (
          <label
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 10,
              padding: '30px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Upload size={20} color="#9CA3AF" />
            <span style={{ fontSize: 'var(--fs-13)', color: '#374151' }}>点击或拖拽文件到此区域</span>
            <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>支持 .xls / .xlsx 格式</span>
            <input
              type="file"
              accept=".xls,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
            />
            {file && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand)' }}>{file}</span>}
          </label>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r) => (
              <div
                key={r.row}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 'var(--fs-13)',
                  background: r.ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                  color: r.ok ? 'var(--color-success-fg)' : 'var(--color-danger-fg)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)' }}>第 {r.row} 条</span>
                <span>{r.msg}</span>
              </div>
            ))}
            <p style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', margin: '4px 0 0' }}>
              （演示）原型内置演示结果，不产生真实数据写入。品种话术行 8 列必填；默认话术行商品名必须为「通用品种」，规格与持有人可不填；导入成功统一为启用 + 合作性话术。
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── 页面主体 ───────────────────────────────────────────────────── */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export function TalkScriptVariety({ addToast, navigate }: Props) {
  const { scripts, addScript, updateScript, removeScript, removeScripts, toggleStatus, toggleCoop, setDeptRule } = useTalkScript();
  const { credits } = useAICredit();

  const [filters, setFilters] = useState<Record<string, string>>({
    variety: '',
    firstCat: '',
    secondCat: '',
    isCoop: '',
    content: '',
    feedback: '',
    isDefault: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [modal, setModal] = useState<{ type: string; data?: TalkScript } | null>(null);

  const tableRef = useRef<HTMLDivElement | null>(null);

  const setFilter = (id: string, value: string) => {
    setFilters((p) => ({
      ...p,
      [id]: value,
      // 一级类别变化时清空二级类别（联动）
      ...(id === 'firstCat' ? { secondCat: '' } : {}),
    }));
    setPage(1);
  };

  const filtered = useMemo(
    () =>
      scripts.filter((s) => {
        if (filters.variety && s.variety !== filters.variety) return false;
        if (filters.firstCat && s.firstCat !== filters.firstCat) return false;
        if (filters.secondCat && s.secondCat !== filters.secondCat) return false;
        if (filters.isCoop && s.isCoop !== filters.isCoop) return false;
        if (filters.content && !s.content.includes(filters.content)) return false;
        if (filters.feedback && !s.feedback.includes(filters.feedback)) return false;
        if (filters.isDefault && s.isDefault !== filters.isDefault) return false;
        if (filters.status && s.status !== filters.status) return false;
        return true;
      }),
    [scripts, filters],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const globalOffset = (safePage - 1) * pageSize;

  // 翻页或刷新后勾选自动清空（手册规则）
  useEffect(() => {
    setSelected([]);
  }, [page, pageSize, filters]);

  const pendingAiCount = scripts.filter((s) => s.isAI && s.status === '待启用').length;

  const filterFields = [
    { id: 'variety', label: '品种名称', type: 'select' as const, placeholder: '全部品种', options: ALL_VARIETIES.map((v) => ({ value: v, label: v })) },
    { id: 'firstCat', label: '一级类别', type: 'select' as const, placeholder: '全部类别', options: SEARCH_FIRST_CATS.map((c) => ({ value: c, label: c })) },
    {
      id: 'secondCat',
      label: '二级类别',
      type: 'select' as const,
      placeholder: '全部',
      options: (filters.firstCat ? SUB_CATS[filters.firstCat] ?? [] : []).map((c) => ({ value: c, label: c })),
    },
    { id: 'isCoop', label: '合作性话术', type: 'select' as const, placeholder: '全部', options: [{ value: '是', label: '是' }, { value: '否', label: '否' }] },
    { id: 'content', label: '话术内容', type: 'text' as const, placeholder: '关键词模糊匹配', width: 200 },
    { id: 'feedback', label: '客户反馈', type: 'text' as const, placeholder: '关键词模糊匹配', width: 200 },
    { id: 'isDefault', label: '是否默认', type: 'select' as const, placeholder: '全部', options: [{ value: '是', label: '是' }, { value: '否', label: '否' }] },
    {
      id: 'status',
      label: '状态',
      type: 'select' as const,
      placeholder: '全部',
      options: [
        { value: '启用', label: '启用' },
        { value: '禁用', label: '禁用' },
        { value: '待启用', label: '待启用（AI 入库）' },
      ],
    },
  ];

  const allOnPageSelected = paginated.length > 0 && paginated.every((s) => selected.includes(s.id));
  const toggleAll = () => {
    if (allOnPageSelected) setSelected((p) => p.filter((id) => !paginated.find((s) => s.id === id)));
    else setSelected((p) => [...new Set([...p, ...paginated.map((s) => s.id)])]);
  };

  const handlePending = () => {
    setFilters({ variety: '', firstCat: '', secondCat: '', isCoop: '', content: '', feedback: '', isDefault: '', status: '待启用' });
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="品种话术维护"
        description="按品种与拜访类别维护标准话术与客户反馈，供移动端拜访执行自动带出"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 动态指引入口卡 → baiyee-AI */}
        <EntryCard
          filters={filters}
          pendingAiCount={pendingAiCount}
          credits={credits}
          onGoGenerate={() => {
            setPendingScriptTask({ variety: filters.variety || undefined });
            navigate('baiyee-ai');
          }}
          onGoRecords={() => {
            setPendingScriptTask({ historyOnly: true });
            navigate('baiyee-ai');
          }}
          onGoRecharge={() => {
            setPendingScriptTask({ openBilling: true });
            navigate('baiyee-ai');
          }}
          onHandlePending={handlePending}
        />

        {/* 按钮区 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setModal({ type: 'new' })}>
              新建品种话术
            </Button>
            <Button icon={<Copy size={14} />} onClick={() => setModal({ type: 'copy' })}>
              复制品种话术
            </Button>
            <Button icon={<Copy size={14} />} onClick={() => setModal({ type: 'batchCopy' })}>
              批量复制品种话术
            </Button>
          </div>
        </div>

        {/* 搜索区 */}
        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={setFilter}
          onSearch={() => setPage(1)}
          onReset={() => {
            setFilters({ variety: '', firstCat: '', secondCat: '', isCoop: '', content: '', feedback: '', isDefault: '', status: '' });
            setPage(1);
          }}
          collapsedCount={8}
          extraActions={
            <>
              <Button
                size="sm"
                icon={<Download size={13} />}
                onClick={() =>
                  addToast({
                    type: 'info',
                    title: '导出（演示）',
                    description: '原型未生成真实文件。按当前搜索条件应下载《品种话术.xlsx》，共 9 列（序号/品种/一级类别/二级类别/话术内容/客户反馈/是否是默认值/状态/合作性话术）。',
                  })
                }
              >
                导出
              </Button>
              <Button
                size="sm"
                icon={<Upload size={13} />}
                onClick={() => {
                  if (selected.length === 0) {
                    addToast({ type: 'warning', title: '请选择要删除的话术' });
                    return;
                  }
                  setModal({ type: 'batchDelete' });
                }}
              >
                批量删除
              </Button>
              <Button size="sm" icon={<Upload size={13} />} onClick={() => setModal({ type: 'import' })}>
                导入
              </Button>
            </>
          }
        />

        {/* 表格 */}
        <div ref={tableRef} style={{ ...CARD, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1280 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ ...TH, width: 36 }}>
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} style={{ accentColor: 'var(--color-brand)' }} />
                  </th>
                  <th style={{ ...TH, width: 48 }}>序号</th>
                  <th style={TH}>品种</th>
                  <th style={TH}>一级类别</th>
                  <th style={TH}>二级类别</th>
                  <th style={{ ...TH, maxWidth: 230 }}>话术内容</th>
                  <th style={{ ...TH, maxWidth: 190 }}>客户反馈</th>
                  <th style={TH}>默认值</th>
                  <th style={TH}>状态</th>
                  <th style={TH}>合作性</th>
                  <th style={TH}>科室规则</th>
                  <th style={TH}>操作</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <EmptyState
                        title="未找到匹配的话术"
                        description="尝试调整筛选条件，或清除全部筛选后重试"
                        action={{ label: '清除筛选', onClick: () => setFilters({ variety: '', firstCat: '', secondCat: '', isCoop: '', content: '', feedback: '', isDefault: '', status: '' }) }}
                      />
                    </td>
                  </tr>
                ) : (
                  paginated.map((s, idx) => (
                    <tr
                      key={s.id}
                      style={{
                        background: idx % 2 === 1 ? '#FAFAFA' : 'transparent',
                        opacity: s.status === '禁用' ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? '#FAFAFA' : 'transparent')}
                    >
                      <td style={TD}>
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={(e) => setSelected((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                          style={{ accentColor: 'var(--color-brand)' }}
                        />
                      </td>
                      <td style={{ ...TD, color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>{globalOffset + idx + 1}</td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {s.variety}
                          {s.isDefault === '是' && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'var(--color-info-bg)',
                                color: 'var(--color-info-fg)',
                              }}
                            >
                              默认
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={TD}>{s.firstCat}</td>
                      <td style={TD}>{s.secondCat}</td>
                      <td style={{ ...TD, maxWidth: 230 }}>
                        <span
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}
                          title={s.content}
                        >
                          {s.isAI && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'var(--color-brand-subtle)',
                                color: 'var(--color-brand)',
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                              }}
                            >
                              ✦ AI
                            </span>
                          )}
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 180,
                              color: '#374151',
                            }}
                          >
                            {s.content}
                          </span>
                        </span>
                      </td>
                      <td style={{ ...TD, maxWidth: 190 }}>
                        <span
                          title={s.feedback}
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 160 }}
                        >
                          {s.feedback}
                        </span>
                      </td>
                      <td style={TD}>{s.isDefault}</td>
                      <td style={TD}>
                        <StatusTag status={s.status} size="sm" />
                      </td>
                      <td style={TD}>{s.isCoop}</td>
                      <td style={{ ...TD, color: s.deptRule === '不限制' ? '#9CA3AF' : '#374151', fontSize: 'var(--fs-12)' }}>
                        {s.deptRule}
                      </td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, whiteSpace: 'nowrap' }}>
                          {s.status === '待启用' && (
                            <>
                              <button style={LINK_BTN} onClick={() => toggleStatus(s.id)}>
                                启用
                              </button>
                              {SEP}
                            </>
                          )}
                          <button style={LINK_BTN} onClick={() => setModal({ type: 'edit', data: s })}>
                            修改
                          </button>
                          {SEP}
                          <button style={LINK_BTN} onClick={() => {
                            toggleStatus(s.id);
                            addToast(
                              s.status === '启用'
                                ? { type: 'info', title: '已禁用，不再下发移动端使用' }
                                : { type: 'success', title: '已启用，将下发移动端使用' },
                            );
                          }}>
                            {s.status === '启用' ? '禁用' : '启用'}
                          </button>
                          {SEP}
                          <button style={LINK_BTN} onClick={() => toggleCoop(s.id)}>
                            {s.isCoop === '是' ? '成为非合作性话术' : '成为合作性话术'}
                          </button>
                          {s.firstCat === '终端拜访' && (
                            <>
                              {SEP}
                              <button style={LINK_BTN} onClick={() => setModal({ type: 'dept', data: s })}>
                                关联科室
                              </button>
                            </>
                          )}
                          {SEP}
                          <button style={DANGER_BTN} onClick={() => setModal({ type: 'delete', data: s })}>
                            删除
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* 分页 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderTop: '1px solid #F3F4F6',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-12)', color: '#6B7280' }}>
              <span>每页</span>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ ...INPUT, width: 84, height: 28, cursor: 'pointer' }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} 条
                  </option>
                ))}
              </select>
              <span>
                共 {filtered.length} 条，第 {filtered.length === 0 ? 0 : globalOffset + 1}–{Math.min(safePage * pageSize, filtered.length)} 条
              </span>
            </div>
            <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onChange={setPage} />
          </div>
        </div>
      </div>

      {/* 弹窗组 */}
      {modal?.type === 'new' && (
        <NewScriptModal
          onClose={() => setModal(null)}
          onSave={(data) => {
            addScript(data);
            setModal(null);
            addToast({ type: 'success', title: '已新建', description: '初始状态：启用 · 合作性话术' });
          }}
        />
      )}
      {modal?.type === 'edit' && modal.data && (
        <EditScriptModal
          script={modal.data}
          onClose={() => setModal(null)}
          onSave={(content, feedback) => {
            updateScript(modal.data!.id, { content, feedback });
            setModal(null);
            addToast({ type: 'success', title: '已保存' });
          }}
        />
      )}
      {modal?.type === 'delete' && modal.data && (
        <ConfirmDialog
          open
          title="删除话术"
          description="删除后不可恢复。对暂时不使用的话术，建议优先禁用以保留历史数据。"
          impact={`${modal.data.variety} · ${modal.data.firstCat} / ${modal.data.secondCat}：${modal.data.content.slice(0, 40)}…`}
          confirmLabel="确认删除"
          onConfirm={() => {
            removeScript(modal.data!.id);
            setModal(null);
            addToast({ type: 'success', title: '已删除' });
          }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'batchDelete' && (
        <ConfirmDialog
          open
          title={`批量删除 ${selected.length} 条话术`}
          description="删除后不可恢复。对暂时不使用的话术，建议优先禁用以保留历史数据。"
          impact={scripts
            .filter((s) => selected.includes(s.id))
            .slice(0, 5)
            .map((s) => `${s.variety} · ${s.firstCat} / ${s.secondCat}`)
            .join('；')
            .concat(selected.length > 5 ? `；…等 ${selected.length} 条` : '')}
          confirmLabel="确认删除"
          onConfirm={() => {
            removeScripts(selected);
            setSelected([]);
            setModal(null);
            addToast({ type: 'success', title: `已删除 ${selected.length} 条话术` });
          }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'dept' && modal.data && (
        <DeptModal
          script={modal.data}
          onClose={() => setModal(null)}
          onSave={(rule) => {
            setDeptRule(modal.data!.id, rule);
            setModal(null);
            addToast({ type: 'success', title: '科室规则已更新' });
          }}
        />
      )}
      {modal?.type === 'copy' && (
        <CopyModal
          onClose={() => setModal(null)}
          onSave={(src, tgt) => {
            const count = scripts.filter((s) => s.variety === src).length;
            setModal(null);
            if (count === 0) {
              addToast({ type: 'warning', title: '源品种没有配置话术' });
              return;
            }
            addToast({ type: 'success', title: '复制完成', description: `新增 ${count} 条（目标品种 ${tgt}），重复话术自动跳过（演示）` });
          }}
        />
      )}
      {modal?.type === 'batchCopy' && (
        <BatchCopyModal
          onClose={() => setModal(null)}
          onSave={() => {
            setModal(null);
            addToast({ type: 'success', title: '批量复制完成', description: '共处理 6 个品种，重复话术自动跳过（演示）' });
          }}
        />
      )}
      {modal?.type === 'import' && <ImportModal addToast={addToast} onClose={() => setModal(null)} />}
    </div>
  );
}
