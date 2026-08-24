import { useState } from 'react';
import { FileSearch, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Tag } from '../components/StatusTag';
import { evidenceChainRecords } from '../data/mockData';
import type { ToastMessage } from '../components/Toast';

const aiTagColor: Record<string, 'warning' | 'danger' | 'info'> = {
  '照片清晰度不足': 'warning',
  '证据缺失': 'danger',
  '任务关联断裂': 'info',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: '#9CA3AF',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: 13,
  color: '#374151',
  borderTop: '1px solid #F3F4F6',
  verticalAlign: 'middle',
};

export function EvidenceChainReview({ addToast }: { addToast: (msg: Omit<ToastMessage, 'id'>) => void }) {
  const [results, setResults] = useState<Record<string, 'passed' | 'returned'>>({});

  const pendingCount = evidenceChainRecords.filter(r => !results[r.id]).length;

  const handlePass = (id: string) => {
    const rec = evidenceChainRecords.find(r => r.id === id);
    if (!rec) return;
    setResults(prev => ({ ...prev, [id]: 'passed' }));
    addToast({
      type: 'success',
      title: '复审通过',
      description: `${rec.taskNo}（专员 ${rec.specialist}）证据链复审通过，已归档。`,
    });
  };

  const handleReturn = (id: string) => {
    const rec = evidenceChainRecords.find(r => r.id === id);
    if (!rec) return;
    setResults(prev => ({ ...prev, [id]: 'returned' }));
    addToast({
      type: 'warning',
      title: '已退回补件',
      description: `${rec.taskNo} 已退回 ${rec.provider}，需补充证据后重新提交审核。`,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="证据链复审"
        description="证据·事后审核：AI 一次自动审核存疑记录，复审通过或退回需人工裁定"
        dataRange="数据范围：近 7 日 · 证据链一次自动审核"
        updatedAt="更新于今日 09:00"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{
          padding: '10px 16px',
          background: '#FEF3E2',
          border: '1px solid #FDE68A',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 13,
          color: '#C77A16',
        }}>
          <FileSearch size={15} />
          <span>
            存疑记录 {evidenceChainRecords.length} 条，待复审 {pendingCount} 条；业务三组跟踪巡访存疑集中（3 条），建议优先复审。
          </span>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                <th style={thStyle}>任务编号</th>
                <th style={thStyle}>专员 / 服务商</th>
                <th style={thStyle}>工作组 · 任务类型</th>
                <th style={thStyle}>时间</th>
                <th style={thStyle}>AI 存疑标签</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {evidenceChainRecords.map(rec => {
                const result = results[rec.id];
                return (
                  <tr key={rec.id} style={{ background: result ? '#FAFBFC' : '#fff' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{rec.taskNo}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500, color: '#111827' }}>{rec.specialist}</div>
                      <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{rec.provider}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>{rec.workGroup}</div>
                      <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{rec.visitType}</div>
                    </td>
                    <td style={{ ...tdStyle, color: '#667085', fontSize: 12, whiteSpace: 'nowrap' }}>{rec.time}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {rec.aiTags.map(tag => (
                          <Tag key={tag} label={tag} color={aiTagColor[tag] || 'default'} />
                        ))}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {result === 'passed' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#248A5A' }}>
                          <CheckCircle size={14} /> 复审通过
                        </span>
                      )}
                      {result === 'returned' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#C77A16' }}>
                          <XCircle size={14} /> 已退回补件
                        </span>
                      )}
                      {!result && (
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <Button variant="primary" size="sm" onClick={() => handlePass(rec.id)}>
                            复审通过
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleReturn(rec.id)}>
                            退回
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
