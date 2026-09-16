import { useState } from 'react';
import { Plus, PencilLine } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { usePermission } from '../context/PermissionContext';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { DEMO_HOLDER, useTaskData } from '../context/TaskDataContext';
import type { Role, Variety } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
};

const emptyForm: Omit<Variety, 'id'> = {
  genericName: '',
  tradeName: '',
  approvalNo: '',
  applicableDept: '',
  dosageForm: '',
  spec: '',
  package: '',
  unit: '',
  holder: DEMO_HOLDER,
  manufacturer: '',
  validUntil: '',
  activePriceBookId: '',
};

export function VarietyManage({ addToast, currentRole }: Props) {
  const { varieties, createVariety, updateVariety } = useTaskData();
  // 按角色页面权限判定（不再用旧角色名称字符串）
  const { can } = usePermission();
  const canWrite = can('varieties', 'edit');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Variety | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError('');
    setOpen(true);
  }

  function openEdit(v: Variety) {
    setEditing(v);
    const { id: _id, ...rest } = v;
    setForm(rest);
    setError('');
    setOpen(true);
  }

  function submit() {
    const result = editing ? updateVariety(editing.id, form) : createVariety(form);
    if (!result.ok) {
      setError(result.error || '保存失败');
      return;
    }
    addToast({ type: 'success', title: editing ? '品种已更新' : '品种已创建', description: form.tradeName });
    setOpen(false);
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600,
    color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px', fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', borderBottom: '1px solid #F3F4F6',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="品种信息"
        description="未创建的品种不会出现在授权和任务的下拉里。"
        actions={canWrite ? <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>新建品种</Button> : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['通用名', '商品名', '批准文号', '适用科室', '剂型', '规格', '包装', '单位', '持有人(MAH)', '生产厂家', '有效期', '操作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {varieties.length === 0 ? (
                <tr><td colSpan={12}><EmptyState title="暂无品种" description="请先新建品种，再做授权和价目配置。" /></td></tr>
              ) : varieties.map((v) => (
                <tr key={v.id}>
                  <td style={td}>{v.genericName}</td>
                  <td style={td}>{v.tradeName}</td>
                  <td style={td}>{v.approvalNo}</td>
                  <td style={td}>{v.applicableDept || '—'}</td>
                  <td style={td}>{v.dosageForm}</td>
                  <td style={td}>{v.spec}</td>
                  <td style={td}>{v.package}</td>
                  <td style={td}>{v.unit}</td>
                  <td style={td}>{v.holder}</td>
                  <td style={td}>{v.manufacturer}</td>
                  <td style={td}>{v.validUntil}</td>
                  <td style={td}>
                    {canWrite && (
                      <Button variant="ghost" size="sm" icon={<PencilLine size={13} />} onClick={() => openEdit(v)}>编辑</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        title={editing ? '编辑品种' : '新建品种'}
        onClose={() => setOpen(false)}
        width={640}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submit}>保存</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {error && <div style={{ gridColumn: '1 / -1', color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{error}</div>}
          <Field label="通用名"><input value={form.genericName} onChange={(e) => set('genericName', e.target.value)} style={inputStyle} /></Field>
          <Field label="商品名"><input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} style={inputStyle} /></Field>
          <Field label="批准文号"><input value={form.approvalNo} onChange={(e) => set('approvalNo', e.target.value)} style={inputStyle} /></Field>
          <Field label="适用科室"><input value={form.applicableDept} onChange={(e) => set('applicableDept', e.target.value)} style={inputStyle} placeholder="例如：心血管内科" /></Field>
          <Field label="剂型"><input value={form.dosageForm} onChange={(e) => set('dosageForm', e.target.value)} style={inputStyle} /></Field>
          <Field label="规格"><input value={form.spec} onChange={(e) => set('spec', e.target.value)} style={inputStyle} /></Field>
          <Field label="包装"><input value={form.package} onChange={(e) => set('package', e.target.value)} style={inputStyle} /></Field>
          <Field label="单位"><input value={form.unit} onChange={(e) => set('unit', e.target.value)} style={inputStyle} /></Field>
          <Field label="药品上市许可持有人"><input value={form.holder} onChange={(e) => set('holder', e.target.value)} style={inputStyle} /></Field>
          <Field label="生产厂家"><input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} style={inputStyle} /></Field>
          <Field label="有效期"><input type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} style={inputStyle} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}
