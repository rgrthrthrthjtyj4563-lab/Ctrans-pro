import { useState, useMemo } from 'react';
import { Eye, AlertTriangle, CheckCircle, XCircle, FileText } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button, IconButton } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Timeline } from '../components/Timeline';
import { settlementRecords, providers, workGroups } from '../data/mockData';
import type { SettlementRecord, AuditStatus } from '../types';
import type { ToastMessage } from '../components/Toast';

const PAGE_SIZE = 15;

interface SettlementProps {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const settlementTimeline = [
  { id: 's1', type: '创建' as const, operator: '系统', time: '2026-08-01 00:00', detail: '系统自动生成 2026-08 结算周期单据' },
  { id: 's2', type: '提交' as const, operator: '张伟', role: '服务专员', time: '2026-08-15 16:00', detail: '提交本月结算单据' },
  { id: 's3', type: '审核驳回' as const, operator: '李强', role: '平台运营', time: '2026-08-17 10:30', comment: '工作量数据与拜访记录不符，请核查。' },
];

export function Settlement({ addToast }: SettlementProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawerRecord, setDrawerRecord] = useState<SettlementRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve' | 'reject' | 'finalize'; record: SettlementRecord } | null>(null);

  const filtered = useMemo(() => {
    return settlementRecords.filter(r => {
      if (filters.provider && !r.provider.includes(filters.provider)) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.period && !r.period.includes(filters.period)) return false;
      return true;
    });
  }, [filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
  const pendingAmount = filtered.filter(r => r.status === '待审核').reduce((sum, r) => sum + r.amount, 0);
  const settledAmount = filtered.filter(r => r.status === '已结算').reduce((sum, r) => sum + r.amount, 0);

  const filterFields = [
    { id: 'provider', label: '服务提供商', type: 'select' as const, options: providers.map(p => ({ value: p, label: p })) },
    { id: 'workGroup', label: '工作组', type: 'select' as const, options: workGroups.map(w => ({ value: w, label: w })) },
    { id: 'status', label: '结算状态', type: 'select' as const, options: [
      { value: '待审核', label: '待审核' },
      { value: '已通过', label: '已通过' },
      { value: '已驳回', label: '已驳回' },
      { value: '已结算', label: '已结算' },
    ]},
    { id: 'period', label: '结算周期', type: 'text' as const, placeholder: '如 2026-08' },
    { id: 'startDate', label: '创建日期起', type: 'date' as const },
    { id: 'endDate', label: '创建日期止', type: 'date' as const },
  ];

  const th = (label: string, w?: string | number) => (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 12,
      fontWeight: 600,
      color: '#9CA3AF',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: '#F9FAFB',
      borderBottom: '1px solid #E5E7EB',
      whiteSpace: 'nowrap',
      width: w,
    }}>{label}</th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="结算与对账"
        description="核对服务专员结算单据，确认金额并管理对账状态"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Amount summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 16,
        }}>
          {[
            { label: '全部金额', amount: totalAmount, color: '#1F2937', bg: '#FFFFFF', border: '#E5E7EB', note: `共 ${filtered.length} 单` },
            { label: '待审核金额', amount: pendingAmount, color: '#C77A16', bg: '#FEF3E2', border: '#FDE68A', note: `${filtered.filter(r => r.status === '待审核').length} 单待处理` },
            { label: '已结算金额', amount: settledAmount, color: '#248A5A', bg: '#E6F5ED', border: '#A7F3D0', note: `${filtered.filter(r => r.status === '已结算').length} 单已完成` },
          ].map(s => (
            <div key={s.label} style={{
              padding: '16px 20px',
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, marginBottom: 4 }}>
                ¥{s.amount.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>{s.note}</div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '10px 14px',
          background: '#EBF2FE',
          border: '1px solid #BFDBFE',
          borderRadius: '6px',
          marginBottom: 16,
          fontSize: 13,
          color: '#2F6BCE',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}>
          <AlertTriangle size={14} />
          <span>
            <strong>结算原则：</strong>所有金额修改必须有人工确认，AI 不得直接更改金额。
            高风险操作（结算完结）需二次确认并写入操作日志。
          </span>
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => setPage(1)}
          onReset={() => { setFilters({}); setPage(1); }}
          stats={
            <span style={{ fontSize: 13, color: '#667085' }}>
              共 <strong style={{ color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 单，合计 <strong style={{ color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>¥{totalAmount.toLocaleString()}</strong>
            </span>
          }
          collapsedCount={4}
        />

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {th('单据编号', 180)}
                  {th('服务专员')}
                  {th('服务提供商')}
                  {th('工作组')}
                  {th('结算周期', 90)}
                  {th('品种')}
                  {th('金额', 110)}
                  {th('结算状态', 90)}
                  {th('审核意见')}
                  {th('创建时间', 110)}
                  {th('操作', 90)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 0 }}>
                      <EmptyState title="没有符合条件的结算单据" description="调整筛选条件后重试" />
                    </td>
                  </tr>
                ) : pageData.map((record, idx) => (
                  <tr
                    key={record.id}
                    style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#2F6BCE', cursor: 'pointer' }} onClick={() => setDrawerRecord(record)}>
                        {record.statementNo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{record.specialist}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', maxWidth: 120 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.provider}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{record.workGroup}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#374151', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{record.period}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', maxWidth: 130 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.variety}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#1F2937',
                        fontFamily: "'JetBrains Mono', monospace",
                        whiteSpace: 'nowrap',
                      }}>
                        ¥{record.amount.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusTag status={record.status} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#C73A3A', maxWidth: 140 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.auditComment}>
                        {record.auditComment || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#667085', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{record.createdAt}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <IconButton icon={<Eye size={13} />} title="查看" size="sm" onClick={() => setDrawerRecord(record)} />
                        {record.status === '待审核' && (
                          <>
                            <IconButton icon={<CheckCircle size={13} />} title="审核通过" size="sm" style={{ color: '#248A5A' }}
                              onClick={() => setConfirmAction({ type: 'approve', record })} />
                            <IconButton icon={<XCircle size={13} />} title="驳回" size="sm" style={{ color: '#C73A3A' }}
                              onClick={() => setConfirmAction({ type: 'reject', record })} />
                          </>
                        )}
                        {record.status === '已通过' && (
                          <IconButton icon={<FileText size={13} />} title="结算完结" size="sm" style={{ color: '#176B5B' }}
                            onClick={() => setConfirmAction({ type: 'finalize', record })} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 16px', borderTop: pageData.length > 0 ? '1px solid #F3F4F6' : 'none' }}>
            {pageData.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        open={!!drawerRecord}
        title={drawerRecord ? `结算单 · ${drawerRecord.statementNo}` : ''}
        subtitle={drawerRecord ? `${drawerRecord.specialist} · ${drawerRecord.period}` : ''}
        onClose={() => setDrawerRecord(null)}
        footer={
          drawerRecord ? (
            <>
              <Button variant="outline" size="md" onClick={() => setDrawerRecord(null)}>关闭</Button>
              {drawerRecord.status === '待审核' && (
                <>
                  <Button variant="primary" size="md" icon={<CheckCircle size={14} />}
                    onClick={() => { setConfirmAction({ type: 'approve', record: drawerRecord }); setDrawerRecord(null); }}>
                    审核通过
                  </Button>
                  <Button variant="danger" size="md" icon={<XCircle size={14} />}
                    onClick={() => { setConfirmAction({ type: 'reject', record: drawerRecord }); setDrawerRecord(null); }}>
                    驳回
                  </Button>
                </>
              )}
              {drawerRecord.status === '已通过' && (
                <Button variant="primary" size="md" icon={<FileText size={14} />}
                  onClick={() => { setConfirmAction({ type: 'finalize', record: drawerRecord }); setDrawerRecord(null); }}>
                  结算完结
                </Button>
              )}
            </>
          ) : null
        }
      >
        {drawerRecord && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: '#F9FAFB',
              borderRadius: '8px',
              marginBottom: 20,
              border: '1px solid #E5E7EB',
            }}>
              <StatusTag status={drawerRecord.status} />
              <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>{drawerRecord.period}</span>
            </div>

            {drawerRecord.auditComment && (
              <div style={{
                padding: '10px 14px',
                background: '#FEECEC',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                marginBottom: 16,
                fontSize: 13,
                color: '#C73A3A',
                display: 'flex',
                gap: 8,
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <div><strong>驳回原因：</strong>{drawerRecord.auditComment}</div>
              </div>
            )}

            <div style={{
              padding: '16px 20px',
              background: '#F9FAFB',
              borderRadius: '8px',
              marginBottom: 20,
              border: '1px solid #E5E7EB',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                结算金额（人民币）
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                color: '#1F2937',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '-1px',
              }}>
                ¥{drawerRecord.amount.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                数据来源：系统工作量自动计算 · 人工确认后生效
              </div>
            </div>

            <FieldGroup title="单据信息">
              <FieldItem label="单据编号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#2F6BCE', fontSize: 12 }}>{drawerRecord.statementNo}</span>} span />
              <FieldItem label="服务专员" value={drawerRecord.specialist} />
              <FieldItem label="服务提供商" value={drawerRecord.provider} />
              <FieldItem label="工作组" value={drawerRecord.workGroup} />
              <FieldItem label="结算周期" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.period}</span>} />
              <FieldItem label="品种" value={drawerRecord.variety} />
              <FieldItem label="创建时间" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.createdAt}</span>} />
              {drawerRecord.settledAt && (
                <FieldItem label="结算时间" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.settledAt}</span>} />
              )}
            </FieldGroup>

            <FieldGroup title="结算时间线">
              <div style={{ gridColumn: '1 / -1' }}>
                <Timeline events={settlementTimeline} />
              </div>
            </FieldGroup>
          </div>
        )}
      </DetailDrawer>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.type === 'approve' ? '审核通过结算单据' :
          confirmAction?.type === 'reject' ? '驳回结算单据' :
          '结算完结确认'
        }
        description={
          confirmAction?.type === 'approve'
            ? `确认对 ${confirmAction?.record.statementNo} 的金额 ¥${confirmAction?.record.amount.toLocaleString()} 审核通过？`
            : confirmAction?.type === 'reject'
            ? `确认驳回 ${confirmAction?.record.statementNo}？驳回后服务专员将收到通知并需修改。`
            : `确认将 ${confirmAction?.record.statementNo} 标记为结算完结？此操作不可撤销。`
        }
        impact={
          confirmAction?.type === 'finalize'
            ? '结算完结后，关联拜访记录状态将更新为已结算，无法再修改金额。操作日志将记录操作人和时间。'
            : '操作日志将记录此次审核操作及操作人信息。'
        }
        confirmLabel={
          confirmAction?.type === 'approve' ? '确认通过' :
          confirmAction?.type === 'reject' ? '确认驳回' :
          '确认结算完结'
        }
        variant={confirmAction?.type === 'finalize' ? 'danger' : 'warning'}
        onConfirm={() => {
          addToast({
            type: confirmAction?.type === 'approve' ? 'success' : confirmAction?.type === 'reject' ? 'warning' : 'success',
            title: confirmAction?.type === 'approve' ? '审核通过' : confirmAction?.type === 'reject' ? '已驳回' : '结算完结',
            description: '操作已写入操作日志',
          });
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
