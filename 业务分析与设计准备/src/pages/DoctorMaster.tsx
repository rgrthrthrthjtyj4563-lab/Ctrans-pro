import { useState, useMemo } from 'react';
import { Eye, AlertCircle, Users, Tag as TagIcon } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Tag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { IconButton } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { EmptyState } from '../components/EmptyState';
import { doctors, hospitals, departments } from '../data/mockData';
import type { Doctor } from '../types';

const PAGE_SIZE = 15;

export function DoctorMaster() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawerDoctor, setDrawerDoctor] = useState<Doctor | null>(null);

  const filtered = useMemo(() => {
    return doctors.filter(d => {
      if (filters.name && !d.name.includes(filters.name)) return false;
      if (filters.hospital && !d.hospital.includes(filters.hospital)) return false;
      if (filters.department && d.department !== filters.department) return false;
      if (filters.tier && d.tier !== filters.tier) return false;
      if (filters.status && d.cooperationStatus !== filters.status) return false;
      return true;
    });
  }, [filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusColor: Record<Doctor['cooperationStatus'], { fg: string; bg: string }> = {
    '合作中':   { fg: '#248A5A', bg: '#E6F5ED' },
    '暂停合作': { fg: '#C77A16', bg: '#FEF3E2' },
    '未合作':   { fg: '#6B7280', bg: '#F3F4F6' },
  };

  const filterFields = [
    { id: 'name', label: '医生姓名', type: 'text' as const, placeholder: '搜索医生姓名' },
    { id: 'hospital', label: '医院', type: 'text' as const, placeholder: '搜索医院' },
    { id: 'department', label: '科室', type: 'select' as const, options: departments.map(d => ({ value: d, label: d })) },
    { id: 'tier', label: '分层', type: 'select' as const, options: ['KOL A类', 'KOL B类', '普通医生', '潜力医生'].map(v => ({ value: v, label: v })) },
    { id: 'status', label: '合作状态', type: 'select' as const, options: ['合作中', '暂停合作', '未合作'].map(v => ({ value: v, label: v })) },
  ];

  const th = (label: string, w?: string | number) => (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 'var(--fs-12)',
      fontWeight: 600,
      color: '#9CA3AF',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: '#F9FAFB',
      borderBottom: '1px solid var(--color-border)',
      whiteSpace: 'nowrap',
      width: w,
    }}>{label}</th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="医生主数据"
        description="管理医生基础信息、分层标签及合作状态"
        actions={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#FEF3E2',
            border: '1px solid #FDE68A',
            borderRadius: '6px',
            fontSize: 'var(--fs-12)',
            color: '#C77A16',
          }}>
            <AlertCircle size={13} />
            部分字段（医生分层、标签体系）待业务确认，当前展示为示意数据
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Notice */}
        <div style={{
          padding: '12px 16px',
          background: '#EBF2FE',
          border: '1px solid #BFDBFE',
          borderRadius: '8px',
          marginBottom: 16,
          fontSize: 'var(--fs-13)',
          color: '#2F6BCE',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}>
          <Users size={15} />
          <span>
            <strong>待确认：</strong>
            医生主数据管理（医生分层、标签体系、去重规则）在字段采集账号权限范围内未发现对应页面，
            当前展示字段为基于业务需求的示意设计，上线前需与管理员账号核实实际字段。
          </span>
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => setPage(1)}
          onReset={() => { setFilters({}); setPage(1); }}
          stats={
            <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 位医生
            </span>
          }
          collapsedCount={4}
        />

        <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {th('医生姓名 / 职称')}
                  {th('所属医院')}
                  {th('科室')}
                  {th('分层', 100)}
                  {th('标签')}
                  {th('合作状态', 90)}
                  {th('最近拜访', 110)}
                  {th('拜访次数', 80)}
                  {th('操作', 60)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <EmptyState title="未找到匹配的医生" description="调整筛选条件后重试" />
                    </td>
                  </tr>
                ) : pageData.map((doc, idx) => (
                  <tr
                    key={doc.id}
                    style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>{doc.name}</div>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{doc.title}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.hospital}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', whiteSpace: 'nowrap' }}>{doc.department}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Tag label={doc.tier} color={doc.tier.includes('KOL A') ? 'brand' : doc.tier.includes('KOL B') ? 'info' : 'default'} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {doc.tags.map((tag, ti) => (
                          <span key={ti} style={{
                            fontSize: 'var(--fs-11)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: '#F3F4F6',
                            color: '#6B7280',
                          }}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontSize: 'var(--fs-12)',
                        fontWeight: 500,
                        background: statusColor[doc.cooperationStatus].bg,
                        color: statusColor[doc.cooperationStatus].fg,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[doc.cooperationStatus].fg }} />
                        {doc.cooperationStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#667085', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {doc.lastVisit}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', fontWeight: 600, color: '#374151', fontFamily: "'JetBrains Mono', monospace" }}>
                      {doc.visitCount}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <IconButton icon={<Eye size={13} />} title="查看详情" size="sm" onClick={() => setDrawerDoctor(doc)} />
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

      <DetailDrawer
        open={!!drawerDoctor}
        title={drawerDoctor ? `医生详情 · ${drawerDoctor.name}` : ''}
        subtitle={drawerDoctor ? `${drawerDoctor.hospital} · ${drawerDoctor.department}` : ''}
        onClose={() => setDrawerDoctor(null)}
      >
        {drawerDoctor && (
          <div>
            <div style={{
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              padding: '14px',
              background: '#F9FAFB',
              borderRadius: '8px',
              marginBottom: 20,
              border: '1px solid var(--color-border)',
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                background: 'var(--color-brand-subtle)',
                color: 'var(--color-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--fs-20)',
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {drawerDoctor.name.slice(0, 1)}
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-16)', fontWeight: 700, color: 'var(--color-text-1)' }}>{drawerDoctor.name}</div>
                <div style={{ fontSize: 'var(--fs-13)', color: '#667085', marginTop: 2 }}>
                  {drawerDoctor.title} · {drawerDoctor.department}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <Tag label={drawerDoctor.tier} color={drawerDoctor.tier.includes('KOL A') ? 'brand' : 'info'} />
                  {drawerDoctor.tags.slice(0, 2).map((t, i) => <Tag key={i} label={t} />)}
                </div>
              </div>
            </div>

            <div style={{
              padding: '10px 14px',
              background: '#FEF3E2',
              border: '1px solid #FDE68A',
              borderRadius: '6px',
              marginBottom: 16,
              fontSize: 'var(--fs-12)',
              color: '#C77A16',
              display: 'flex',
              gap: 8,
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              部分字段（分层规则、联系方式）为示意数据，待业务确认后更新。
            </div>

            <FieldGroup title="基础信息">
              <FieldItem label="医院" value={drawerDoctor.hospital} span />
              <FieldItem label="科室" value={drawerDoctor.department} />
              <FieldItem label="职称" value={drawerDoctor.title} />
              <FieldItem label="合作状态" value={
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px', borderRadius: '9999px', fontSize: 'var(--fs-12)', fontWeight: 500,
                  background: statusColor[drawerDoctor.cooperationStatus].bg,
                  color: statusColor[drawerDoctor.cooperationStatus].fg,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[drawerDoctor.cooperationStatus].fg }} />
                  {drawerDoctor.cooperationStatus}
                </span>
              } />
              <FieldItem label="医生 ID" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#9CA3AF', fontSize: 'var(--fs-12)' }}>{drawerDoctor.id}</span>} />
            </FieldGroup>

            <FieldGroup title="业务数据">
              <FieldItem label="最近拜访" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerDoctor.lastVisit}</span>} />
              <FieldItem label="历史拜访次数" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 'var(--fs-16)' }}>{drawerDoctor.visitCount}</span>} />
            </FieldGroup>

            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 'var(--fs-12)',
                fontWeight: 600,
                color: '#9CA3AF',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <TagIcon size={11} /> 业务标签
                <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {drawerDoctor.tags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: 'var(--fs-13)',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: '#F3F4F6',
                    color: '#374151',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
