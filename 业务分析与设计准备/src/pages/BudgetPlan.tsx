import { useMemo, useState } from 'react';
import { Plus, PencilLine, BarChart2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { usePermission } from '../context/PermissionContext';
import { FilterBar } from '../components/FilterBar';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { formatCNY, MONTHS_1_12, PROVINCES, REGION_NATIONWIDE } from '../constants';
import {
  actualAmountOf,
  budgetDiffOf,
  formatCoverage,
  frozenMonthsOf,
  isBudgetYearLocked,
  useTaskData,
} from '../context/TaskDataContext';
import { providers } from '../data/mockData';
import type { BudgetPlan, NavigateFn, Role } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
  navigate: NavigateFn;
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
};

const th: React.CSSProperties = {
  padding: '10px 10px', textAlign: 'right', fontSize: 'var(--fs-12)', fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 10px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6',
  textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
};
const tdText: React.CSSProperties = { ...td, textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'normal' };

function evenSplit(yearAmount: number): number[] {
  const base = Math.floor(yearAmount / 12);
  const months = Array.from({ length: 12 }, () => base);
  months[11] += yearAmount - base * 12;
  return months;
}

function StatCard({ label, value, tone, hint }: { label: string; value: string; tone: 'brand' | 'warning' | 'neutral'; hint?: string }) {
  const color = tone === 'brand' ? 'var(--color-brand)' : tone === 'warning' ? '#C77A16' : '#1F2937';
  return (
    <div style={{ flex: 1, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px 20px', minWidth: 200 }}>
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-22)', fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {hint && <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ChipSelect({
  options, value, onChange, placeholder, disabled,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.length === 0 ? (
        <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{placeholder || '无可选项'}</span>
      ) : options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== opt) : [...value, opt])}
            style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 'var(--fs-12)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: on ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
              background: on ? 'var(--color-brand-subtle)' : '#fff',
              color: on ? 'var(--color-brand)' : '#344054',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function BudgetPlanPage({ addToast, currentRole, navigate }: Props) {
  const { budgetPlans, varieties, tasks, createBudgetPlan, updateBudgetPlan, varietiesOf, regionsOf } = useTaskData();
  // 按角色页面权限判定（不再用旧角色名称字符串）
  const { can } = usePermission();
  const canWrite = can('budget-plan', 'edit');

  const [filters, setFilters] = useState<Record<string, string>>({ year: '2026' });
  const [applied, setApplied] = useState<Record<string, string>>({ year: '2026' });
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<BudgetPlan | null>(null);

  const [fYear, setFYear] = useState(2026);
  const [fProvider, setFProvider] = useState('');
  const [fVarieties, setFVarieties] = useState<string[]>([]);
  const [fRegions, setFRegions] = useState<string[]>([]);
  const [fYearAmount, setFYearAmount] = useState('');
  const [fMonths, setFMonths] = useState<number[]>(Array(12).fill(0));
  const [formError, setFormError] = useState('');

  const [eYearAmount, setEYearAmount] = useState(0);
  const [eMonths, setEMonths] = useState<number[]>(Array(12).fill(0));

  const rows = useMemo(() => budgetPlans.filter((p) => {
    if (applied.year && String(p.year) !== applied.year) return false;
    if (applied.provider && p.provider !== applied.provider) return false;
    if (applied.variety && !p.varieties.includes(applied.variety)) return false;
    if (applied.region && !p.regions.includes(applied.region) && !p.regions.includes(REGION_NATIONWIDE)) return false;
    return true;
  }), [budgetPlans, applied]);

  const yearTotal = rows.reduce((s, p) => s + p.yearAmount, 0);
  const actualTotal = rows.reduce((s, p) => s + actualAmountOf(p, tasks), 0);
  const diff = yearTotal - actualTotal;

  const createVarietyOpts = fProvider ? varietiesOf(fProvider) : [];
  const authorizedRegions = fProvider ? regionsOf(fProvider, fVarieties.length ? fVarieties : undefined) : [];

  function openCreate() {
    setFYear(2026); setFProvider(''); setFVarieties([]); setFRegions([]);
    setFYearAmount(''); setFMonths(Array(12).fill(0)); setFormError('');
    setCreateOpen(true);
  }

  function onPickProvider(provider: string) {
    setFProvider(provider);
    const vs = varietiesOf(provider);
    const rs = regionsOf(provider, vs);
    setFVarieties(vs);
    setFRegions(rs);
  }

  function openEdit(row: BudgetPlan) {
    setEditRow(row);
    setEYearAmount(row.yearAmount);
    setEMonths([...row.months]);
    setFormError('');
  }

  function submitCreate() {
    const result = createBudgetPlan({
      year: fYear,
      provider: fProvider,
      varieties: fVarieties,
      regions: fRegions,
      yearAmount: Number(fYearAmount),
      months: fMonths.some((m) => m > 0) ? [...fMonths] : undefined,
    });
    if (!result.ok) { setFormError(result.error || '保存失败'); return; }
    addToast({ type: 'success', title: '预算行已创建', description: `${fYear} · ${fProvider}` });
    setCreateOpen(false);
  }

  function submitEdit() {
    if (!editRow) return;
    const result = updateBudgetPlan(editRow.id, { yearAmount: eYearAmount, months: [...eMonths] });
    if (!result.ok) { setFormError(result.error || '保存失败'); return; }
    addToast({
      type: result.warning ? 'warning' : 'success',
      title: '预算已更新',
      description: result.warning || `${editRow.year} · ${editRow.provider}`,
    });
    setEditRow(null);
  }

  const editFrozen = editRow ? frozenMonthsOf(editRow.provider, editRow.year, tasks) : [];
  const editYearLocked = editRow ? isBudgetYearLocked(editRow.year) : false;
  const regionOptions = [...PROVINCES, REGION_NATIONWIDE].map((r) => ({ value: r, label: r }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="预算计划"
        description="预算行 = 年度 + 服务商 + 品种集合 + 地区集合。差异 = 年度预算金额 − 实际结算金额。某月该服务商有任务进入「执行中」时，该月预算冻结。"
        actions={canWrite ? (
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>新建预算</Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <FilterBar
          fields={[
            { id: 'year', label: '年度', type: 'select', options: [{ value: '2026', label: '2026' }, { value: '2027', label: '2027' }] },
            { id: 'provider', label: '服务商', type: 'select', options: providers.map((p) => ({ value: p, label: p })) },
            { id: 'variety', label: '品种', type: 'select', options: varieties.map((v) => ({ value: v.tradeName, label: v.tradeName })) },
            { id: 'region', label: '地区', type: 'select', options: regionOptions },
          ]}
          values={filters}
          onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
          onSearch={() => setApplied({ ...filters })}
          onReset={() => { setFilters({ year: '2026' }); setApplied({ year: '2026' }); }}
        />

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <StatCard label="年度预算合计" value={formatCNY(yearTotal)} tone="brand" hint={`${rows.length} 行预算`} />
          <StatCard label="实际结算金额合计" value={formatCNY(actualTotal)} tone="brand" hint="已确认结算单，按服务商×品种×地区×服务月份落回" />
          <StatCard
            label="差异（年度预算 − 实际结算）"
            value={`${diff > 0 ? '+' : ''}${formatCNY(diff)}`}
            tone={diff === 0 ? 'neutral' : 'warning'}
            hint={diff === 0 ? '两者一致' : '正数=尚未花完，负数=超预算'}
          />
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {['年度', '品种', '地区', '服务商', '年度预算金额', '实际结算金额', '差异', '操作'].map((h) => (
                  <th key={h} style={['年度', '品种', '地区', '服务商', '操作'].includes(h) ? { ...th, textAlign: 'left' } : th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title="暂无预算行" description="点击右上角「新建预算」，按 年度+服务商+品种集合+地区集合 录入。" /></td></tr>
              ) : rows.map((p) => {
                const actual = actualAmountOf(p, tasks);
                const rowDiff = budgetDiffOf(p, tasks);
                return (
                  <tr key={p.id}>
                    <td style={tdText}>{p.year}</td>
                    <td style={tdText}>{formatCoverage(p.varieties)}</td>
                    <td style={tdText}>{formatCoverage(p.regions)}</td>
                    <td style={tdText}>{p.provider}</td>
                    <td style={td}>{formatCNY(p.yearAmount)}</td>
                    <td style={td}>{formatCNY(actual)}</td>
                    <td style={{ ...td, color: rowDiff === 0 ? '#9CA3AF' : rowDiff > 0 ? '#2F6BCE' : '#C73A3A' }}>
                      {rowDiff === 0 ? '—' : `${rowDiff > 0 ? '+' : ''}${formatCNY(rowDiff)}`}
                    </td>
                    <td style={tdText}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {canWrite && <Button variant="ghost" size="sm" icon={<PencilLine size={13} />} onClick={() => openEdit(p)}>编辑</Button>}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<BarChart2 size={13} />}
                          onClick={() => navigate('analytics', {
                            budgetAnalysis: { budgetPlanId: p.id, year: p.year, provider: p.provider },
                          })}
                        >
                          预算分析
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={createOpen}
        title="新建预算"
        onClose={() => setCreateOpen(false)}
        width={720}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submitCreate}>保存</Button>
          </>
        }
      >
        {formError && <div style={{ padding: '8px 12px', background: '#FEECEC', border: '1px solid #FECACA', borderRadius: 6, color: '#C73A3A', fontSize: 'var(--fs-13)', marginBottom: 10 }}>{formError}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>年度</div>
            <select value={fYear} onChange={(e) => setFYear(Number(e.target.value))} style={inputStyle}>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>服务商</div>
            <select value={fProvider} onChange={(e) => onPickProvider(e.target.value)} style={inputStyle}>
              <option value="">请选择服务商</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ display: 'block', gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>覆盖品种（多选，须在该服务商授权范围内）</div>
            <ChipSelect
              options={createVarietyOpts}
              value={fVarieties}
              onChange={setFVarieties}
              placeholder={fProvider ? '该服务商暂无授权品种' : '请先选择服务商'}
            />
          </label>
          <label style={{ display: 'block', gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>覆盖地区（多选，须在该服务商授权范围内）</div>
            <ChipSelect
              options={authorizedRegions.length ? authorizedRegions : []}
              value={fRegions}
              onChange={setFRegions}
              placeholder={fProvider ? '该服务商暂无授权地区' : '请先选择服务商'}
            />
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>年度预算（￥）</div>
            <input
              type="number"
              value={fYearAmount}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setFYearAmount(e.target.value);
                setFMonths(v > 0 ? evenSplit(v) : Array(12).fill(0));
              }}
              style={inputStyle}
              placeholder="如 400000"
            />
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 650, marginBottom: 8 }}>月度预算（默认按年度预算均摊，可逐月修改）</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {fMonths.map((m, i) => (
              <label key={i} style={{ display: 'block' }}>
                <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginBottom: 4 }}>{i + 1}月</div>
                <input
                  type="number"
                  value={m}
                  onChange={(e) => setFMonths(fMonths.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
                  style={{ ...inputStyle, height: 30 }}
                />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#667085' }}>
            月度合计 {formatCNY(fMonths.reduce((s, m) => s + m, 0))}；与年度预算的差异仅提示，不阻断保存。
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editRow}
        title={`编辑预算 · ${editRow?.year ?? ''} · ${editRow?.provider ?? ''}`}
        onClose={() => setEditRow(null)}
        width={720}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditRow(null)}>取消</Button>
            <Button variant="primary" onClick={submitEdit} disabled={editYearLocked}>保存</Button>
          </>
        }
      >
        {formError && <div style={{ padding: '8px 12px', background: '#FEECEC', border: '1px solid #FECACA', borderRadius: 6, color: '#C73A3A', fontSize: 'var(--fs-13)', marginBottom: 10 }}>{formError}</div>}
        {editYearLocked && (
          <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, color: '#667085', fontSize: 'var(--fs-13)', marginBottom: 10 }}>
            该年度已结束，整行锁定，不可修改。
          </div>
        )}
        {!editYearLocked && editFrozen.length > 0 && (
          <div style={{ padding: '8px 12px', background: '#FEF3E2', border: '1px solid #FDE68A', borderRadius: 6, color: '#C77A16', fontSize: 'var(--fs-13)', marginBottom: 10 }}>
            {editFrozen.map((m) => `${m}月`).join('、')} 该服务商有任务执行中，月度预算已冻结；年度预算与未执行月份可改。
          </div>
        )}
        <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 12 }}>
          覆盖品种：{formatCoverage(editRow?.varieties ?? [])}　覆盖地区：{formatCoverage(editRow?.regions ?? [])}
        </div>
        <label style={{ display: 'block', marginBottom: 14, maxWidth: 280 }}>
          <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6 }}>年度预算（￥）</div>
          <input
            type="number"
            value={eYearAmount}
            disabled={editYearLocked}
            onChange={(e) => setEYearAmount(Number(e.target.value) || 0)}
            style={{ ...inputStyle, background: editYearLocked ? '#F9FAFB' : undefined }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 650 }}>月度预算</div>
          <Button
            variant="outline"
            size="sm"
            disabled={editYearLocked}
            onClick={() => {
              const next = evenSplit(eYearAmount);
              setEMonths(eMonths.map((m, i) => (editFrozen.includes(i + 1) ? m : next[i])));
            }}
          >
            按年度预算均摊未冻结月
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {eMonths.map((m, i) => {
            const locked = editYearLocked || editFrozen.includes(i + 1);
            return (
              <label key={i} style={{ display: 'block' }}>
                <div style={{ fontSize: 'var(--fs-11)', color: locked ? '#C77A16' : '#9CA3AF', marginBottom: 4 }}>
                  {i + 1}月{locked && !editYearLocked ? ' · 冻结' : ''}
                </div>
                <input
                  type="number"
                  value={m}
                  disabled={locked}
                  onChange={(e) => setEMonths(eMonths.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
                  style={{ ...inputStyle, height: 30, background: locked ? '#F9FAFB' : undefined, color: locked ? '#9CA3AF' : undefined }}
                />
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#667085' }}>
          月度合计 {formatCNY(eMonths.reduce((s, m) => s + m, 0))}，年度预算 {formatCNY(eYearAmount)}；调整后以最新金额参与预算执行分析。
        </div>
      </Modal>
    </div>
  );
}
