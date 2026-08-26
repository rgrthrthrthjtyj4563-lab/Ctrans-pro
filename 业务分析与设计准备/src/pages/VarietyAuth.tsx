import { useState } from 'react';
import { Plus, PencilLine, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { RegionPicker } from '../components/RegionPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { useTaskData } from '../context/TaskDataContext';
import { providers } from '../data/mockData';
import { REGION_NATIONWIDE } from '../constants';
import type { Role, VarietyProviderAuth } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  fontSize: 13,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
};

export function VarietyAuth({ addToast, currentRole }: Props) {
  const { auths, varieties, createAuth, updateAuth, deleteAuth } = useTaskData();
  const canWrite = currentRole === '药厂销售部门';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VarietyProviderAuth | null>(null);
  const [provider, setProvider] = useState('');
  const [varietyId, setVarietyId] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VarietyProviderAuth | null>(null);

  function openCreate() {
    setEditing(null);
    setProvider('');
    setVarietyId('');
    setRegions([]);
    setError('');
    setOpen(true);
  }

  function openEdit(row: VarietyProviderAuth) {
    setEditing(row);
    setProvider(row.provider);
    setVarietyId(row.varietyId);
    setRegions([...row.regions]);
    setError('');
    setOpen(true);
  }

  function submit() {
    const input = { provider, varietyId, regions };
    const result = editing ? updateAuth(editing.id, input) : createAuth(input);
    if (!result.ok) {
      setError(result.error || '保存失败');
      return;
    }
    addToast({ type: 'success', title: editing ? '授权已更新' : '授权已创建', description: `${provider} · ${result.data?.varietyName}` });
    setOpen(false);
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px', fontSize: 13, color: '#1F2937', borderBottom: '1px solid #F3F4F6',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="品种授权"
        description="针对某品种，在同一个管理区域内，仅能对应一家服务提供方。"
        actions={canWrite ? (
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>新建服务提供商品种授权</Button>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['序号', '服务提供方', '药品上市许可持有人', '品种', '区域', '操作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auths.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="暂无授权" description="请先完成品种管理，再把品种授权给服务提供方。" /></td></tr>
              ) : auths.map((a, i) => (
                <tr key={a.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{a.provider}</td>
                  <td style={td}>{a.holder}</td>
                  <td style={td}>{a.varietyName}</td>
                  <td style={td}>{a.regions.join('、')}</td>
                  <td style={td}>
                    {canWrite && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="ghost" size="sm" icon={<PencilLine size={13} />} onClick={() => openEdit(a)}>修改</Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(a)}>删除</Button>
                      </div>
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
        title={editing ? '修改服务提供商品种授权' : '新建服务提供商品种授权'}
        onClose={() => setOpen(false)}
        width={560}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submit}>保存</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ color: '#C73A3A', fontSize: 13 }}>{error}</div>}
          <Field label="服务提供方">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>
              <option value="">请选择服务提供方</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="品种">
            <select value={varietyId} onChange={(e) => setVarietyId(e.target.value)} style={inputStyle}>
              <option value="">请选择品种</option>
              {varieties.map((v) => <option key={v.id} value={v.id}>{v.tradeName}</option>)}
            </select>
          </Field>
          <Field label="管理区域">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setRegions([REGION_NATIONWIDE])}>全国区域</Button>
              <Button variant="outline" size="sm" onClick={() => setRegions([])}>清空</Button>
            </div>
            <RegionPicker value={regions} onChange={setRegions} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除授权"
        description={deleteTarget ? `删除后，${deleteTarget.provider} 将无法再承接「${deleteTarget.varietyName}」在 ${deleteTarget.regions.join('、')} 的任务。` : ''}
        confirmLabel="删除"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAuth(deleteTarget.id);
            addToast({ type: 'success', title: '授权已删除' });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}
