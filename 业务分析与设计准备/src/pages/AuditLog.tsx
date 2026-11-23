import { useState, useMemo, useSyncExternalStore } from 'react';
import { CheckCircle, XCircle, Search, RotateCcw, Copy, Check, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { auditLogs } from '../data/mockData';
import { usePermission } from '../context/PermissionContext';
import { orgDescendantIds } from '../data/permissions';
import { PLATFORM_WORKSPACE_NAME } from '../auth/authTypes';
import {
  getTenantRegistrySnapshot,
  subscribeTenantRegistry,
  type TenantAuditLine,
} from '../data/tenantRegistry';

const PAGE_SIZE = 20;

const PLATFORM_ORG_LABEL = '贝医信息科技';

type PlatformTab = 'all' | 'system' | 'security';

interface AuditRow {
  id: string;
  time: string;
  org: string;
  operator: string;
  role: string;
  module: string;
  action: string;
  target: string;
  beforeState?: string;
  afterState?: string;
  reasonCode?: string;
  resource?: string;
  decision?: '允许' | '拒绝';
  requestId?: string;
  ip: string;
  result: '成功' | '失败';
}

/** 租户注册表原因码 → 操作类型中文文案 */
const TENANT_AUDIT_ACTION: Record<string, string> = {
  TENANT_CREATED: '正式租户创建',
  ENT_CODE_PRIMARY_GENERATED: '主企业码生成',
  ENT_CODE_COLLISION_RETRIED: '企业码冲突重试',
  ENT_CODE_COPIED: '企业码复制',
  INITIAL_ADMIN_CREATED: '首位管理员创建',
  INITIAL_ADMIN_CHANGED: '首位管理员变更',
  TENANT_ACTIVATED: '租户激活',
  TENANT_SUSPENDED: '租户暂停',
  TENANT_REACTIVATED: '租户恢复',
  TENANT_TERMINATED: '租户终止',
};

/** 标准英文原因码 → 中文可读说明 */
const REASON_LABEL: Record<string, string> = {
  TENANT_CREATED: '创建新企业租户并初始化主企业码',
  ENT_CODE_PRIMARY_GENERATED: '系统自动生成 8 位主企业码',
  ENT_CODE_COLLISION_RETRIED: '企业码碰撞自动重试生成',
  ENT_CODE_COPIED: '管理员复制主企业码',
  INITIAL_ADMIN_CREATED: '指定首位企业管理员（待首次激活）',
  INITIAL_ADMIN_CHANGED: '变更首位企业管理员人选',
  TENANT_ACTIVATED: '首位管理员完成首次登录并激活租户',
  TENANT_SUSPENDED: '暂停租户登录与业务访问',
  TENANT_REACTIVATED: '恢复租户正常服务状态',
  TENANT_TERMINATED: '终止租户服务并永久停用企业码',
  ACCOUNT_FROZEN: '账号已停用或冻结，拒绝登录',
  INVALID_CREDENTIALS: '账号或密码校验未通过',
  INVALID_CODE: '短信验证码错误或已失效',
  CODE_EXPIRED: '短信验证码已过期',
  SMS_SENT: '下发登录短信验证码',
  LOGIN_SUCCESS: '身份核验通过，建立登录会话',
  REAUTH_PASSED: '跨企业切换二次验证通过',
  ENTERPRISE_SWITCHED: '切换当前访问企业空间',
  DEFAULT_LOGIN_SET: '设置本设备默认登录企业',
  DEFAULT_LOGIN_USED: '命中本设备默认登录自动进入',
  DEFAULT_LOGIN_REVOKED: '撤销本设备默认登录凭证',
  USER_LOGOUT: '用户主动退出并清理默认登录',
  LOGOUT: '用户主动退出登录',
};

/** 动作语义配色（绿=创建/启用/通过，橙=变更/调整，红=停用/暂停/终止/越权，蓝=登录/授权，灰=常规/导出） */
const ACTION_COLOR: Record<string, string> = {
  // 绿色：正向创建 / 启用 / 激活 / 恢复 / 通过
  '正式租户创建': '#248A5A',
  '主企业码生成': '#248A5A',
  '首位管理员创建': '#248A5A',
  '租户激活': '#248A5A',
  '租户恢复': '#248A5A',
  '新建用户': '#248A5A',
  '启用账号': '#248A5A',
  '新建部门': '#248A5A',
  '新增目录': '#248A5A',
  '新增菜单': '#248A5A',
  '启用菜单': '#248A5A',
  '新建角色': '#248A5A',
  '复制角色': '#248A5A',
  '新建': '#248A5A',
  '审核通过': '#248A5A',
  '恢复合作': '#248A5A',
  '授予业务资格': '#248A5A',
  // 红色：高危暂停 / 终止 / 停用 / 回收 / 越权 / 驳回
  '租户暂停': '#C73A3A',
  '租户终止': '#C73A3A',
  '停用账号': '#C73A3A',
  '停用菜单': '#C73A3A',
  '回收角色': '#C73A3A',
  '回收授权': '#C73A3A',
  '撤销业务资格': '#C73A3A',
  '终止合作': '#C73A3A',
  '越权访问': '#C73A3A',
  '删除': '#C73A3A',
  '审核驳回': '#C73A3A',
  // 橙色：变更 / 调整 / 暂停合作
  '首位管理员变更': '#C77A16',
  '企业码冲突重试': '#C77A16',
  '用户调岗': '#C77A16',
  '重命名部门': '#C77A16',
  '调整汇报上级': '#C77A16',
  '编辑菜单': '#C77A16',
  '菜单排序': '#C77A16',
  '编辑角色': '#C77A16',
  '字段策略': '#C77A16',
  '重命名工作组': '#C77A16',
  '暂停合作': '#C77A16',
  '修改': '#C77A16',
  '批量修改': '#C77A16',
  // 蓝色：登录 / 授权 / 提交
  '授予角色': '#2F6BCE',
  '密码登录': '#2F6BCE',
  '短信验证码登录': '#2F6BCE',
  '扫码登录': '#2F6BCE',
  '切换企业重新认证': '#2F6BCE',
  '切换企业': '#2F6BCE',
  '提交': '#2F6BCE',
  // 灰色：低风险常规操作
  '退出登录': '#6B7280',
  '企业码复制': '#6B7280',
  '导出': '#6B7280',
};

function normalizeOrg(org: string | undefined): string {
  if (!org || org === '—') return '—';
  if (org === PLATFORM_WORKSPACE_NAME || org === PLATFORM_ORG_LABEL) {
    return PLATFORM_ORG_LABEL;
  }
  return org;
}

function formatReason(code?: string): string {
  if (!code) return '—';
  const mapped = REASON_LABEL[code];
  return mapped ? `${mapped}（${code}）` : code;
}

function actionColorOf(row: AuditRow): string {
  if (row.result === '失败' || row.decision === '拒绝') return '#C73A3A';
  if (ACTION_COLOR[row.action]) return ACTION_COLOR[row.action];
  if (row.action.includes('登录')) return '#2F6BCE';
  return '#374151';
}

function isSecurityRow(row: AuditRow): boolean {
  return row.module === '登录认证' || row.result === '失败' || row.decision === '拒绝';
}

function isSystemOpsRow(row: AuditRow): boolean {
  return (
    row.module === '租户管理' ||
    row.module === '菜单管理' ||
    (row.org === PLATFORM_ORG_LABEL && !isSecurityRow(row))
  );
}

function mapTenantAuditLine(line: TenantAuditLine): AuditRow {
  const isActivation = line.reasonCode === 'TENANT_ACTIVATED';
  return {
    id: `tr-${line.id}`,
    time: line.at,
    org: isActivation ? line.targetTenant : PLATFORM_ORG_LABEL,
    operator: line.actor,
    role: isActivation ? '首位企业管理员' : '贝医系统管理员',
    module: '租户管理',
    action: TENANT_AUDIT_ACTION[line.reasonCode] ?? '租户管理操作',
    target: line.code ? `${line.targetTenant} · ${line.code}` : line.targetTenant,
    afterState: line.detail,
    reasonCode: line.reasonCode,
    resource: 'tenant.management',
    decision: '允许',
    requestId: `req-${line.id}`,
    ip: '10.2.18.41',
    result: '成功',
  };
}

export function AuditLog() {
  const { auditEvents, principal, orgs, isPlatform } = usePermission();
  const registry = useSyncExternalStore(subscribeTenantRegistry, getTenantRegistrySnapshot);

  const [activeTab, setActiveTab] = useState<PlatformTab>('all');
  const [tenantFilter, setTenantFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [copiedReq, setCopiedReq] = useState(false);

  // 审计可见范围按权限域收敛：
  // - 系统审计日志：全量可见（含软件服务方操作、租户注册表流水与跨租户记录）；
  // - 企业审计日志：仅当前企业租户的记录，其他租户与软件服务方内部日志不可见。
  const tenantOrgNames = useMemo(() => {
    if (isPlatform || principal.realm !== 'TENANT') return null;
    const rootId = principal.tenantId;
    const ids = new Set(orgDescendantIds(orgs, rootId));
    return new Set(orgs.filter(o => ids.has(o.id)).map(o => o.name));
  }, [isPlatform, orgs, principal]);

  const allRows: AuditRow[] = useMemo(() => {
    const permRows: AuditRow[] = auditEvents
      .filter(e => {
        if (!tenantOrgNames) return true;
        return tenantOrgNames.has(e.org);
      })
      .map(e => ({
        id: e.id,
        time: e.time,
        org: normalizeOrg(e.org),
        operator: e.actor,
        role: e.actorRole,
        module: e.module,
        action: e.action,
        target: e.target,
        beforeState: e.beforeSummary,
        afterState: e.afterSummary,
        reasonCode: e.reason,
        resource: e.resource,
        decision: e.decision,
        requestId: e.requestId,
        ip: e.ip,
        result: e.result,
      }));

    // 平台侧并入租户注册表持久化流水（含种子历史记录及首登激活），并与实时 logAudit 去重
    const tenantRegistryRows: AuditRow[] = isPlatform
      ? registry.activityLog
          .map(mapTenantAuditLine)
          .filter(tr => {
            const trMinute = tr.time.slice(0, 16);
            return !permRows.some(
              p =>
                p.reasonCode === tr.reasonCode &&
                p.target === tr.target &&
                p.time.slice(0, 16) === trMinute,
            );
          })
      : [];

    // 业务静态演示日志为药厂租户口径：仅药厂租户的企业审计展示，软件服务方侧不混入
    const businessRows: AuditRow[] =
      !isPlatform && principal.realm === 'TENANT' && principal.tenantKind === 'pharma'
        ? auditLogs.map(b => ({
            ...b,
            org: principal.tenantName,
          }))
        : [];

    return [...permRows, ...tenantRegistryRows, ...businessRows].sort((a, b) =>
      a.time < b.time ? 1 : a.time > b.time ? -1 : 0,
    );
  }, [auditEvents, tenantOrgNames, isPlatform, registry.activityLog, principal]);

  // 平台侧 3 个轻量 Tab 计数
  const tabCounts = useMemo(() => {
    if (!isPlatform) return null;
    let system = 0;
    let security = 0;
    for (const r of allRows) {
      if (isSystemOpsRow(r)) system += 1;
      if (isSecurityRow(r)) security += 1;
    }
    return { all: allRows.length, system, security };
  }, [allRows, isPlatform]);

  // 所属租户/主体下拉选项（平台主体置顶，其余按名称排序）
  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.org && r.org !== '—') set.add(r.org);
    }
    const list = Array.from(set).filter(o => o !== PLATFORM_ORG_LABEL).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return set.has(PLATFORM_ORG_LABEL) ? [PLATFORM_ORG_LABEL, ...list] : list;
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return allRows.filter(log => {
      if (isPlatform) {
        if (activeTab === 'system' && !isSystemOpsRow(log)) return false;
        if (activeTab === 'security' && !isSecurityRow(log)) return false;
        if (tenantFilter && log.org !== tenantFilter) return false;
      }
      if (resultFilter && log.result !== resultFilter) return false;
      if (startDate && log.time.slice(0, 10) < startDate) return false;
      if (endDate && log.time.slice(0, 10) > endDate) return false;
      if (q) {
        const haystack = [
          log.operator,
          log.role,
          log.org,
          log.module,
          log.action,
          log.target,
          log.ip,
          log.requestId ?? '',
          log.reasonCode ?? '',
          formatReason(log.reasonCode),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, isPlatform, activeTab, tenantFilter, resultFilter, startDate, endDate, keyword]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilter = Boolean(tenantFilter || keyword.trim() || resultFilter || startDate || endDate);

  function resetFilters() {
    setTenantFilter('');
    setKeyword('');
    setResultFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  function handleCopyRequestId(reqId: string) {
    navigator.clipboard?.writeText(reqId).catch(() => {});
    setCopiedReq(true);
    window.setTimeout(() => setCopiedReq(false), 1500);
  }

  const inputStyle: React.CSSProperties = {
    height: 32,
    padding: '0 10px',
    fontSize: 'var(--fs-13)',
    color: 'var(--color-text-1)',
    background: '#FFFFFF',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    outline: 'none',
    fontFamily: 'inherit',
  };

  const th = (label: string, w?: string | number, align: 'left' | 'right' = 'left') => (
    <th
      style={{
        padding: '10px 14px',
        textAlign: align,
        fontSize: 'var(--fs-12)',
        fontWeight: 600,
        color: '#9CA3AF',
        background: '#F9FAFB',
        borderBottom: '1px solid var(--color-border)',
        whiteSpace: 'nowrap',
        width: w,
      }}
    >
      {label}
    </th>
  );

  const colCount = isPlatform ? 7 : 6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={isPlatform ? '系统审计日志' : '企业审计日志'}
        description={
          isPlatform
            ? '软件服务方操作、登录认证与跨租户关键审计留痕（只读，不可修改或删除）'
            : '本企业组织、用户、角色授权与业务关键操作留痕（只读，不可修改或删除）'
        }
        tabs={
          isPlatform && tabCounts
            ? [
                { id: 'all', label: '全部', count: tabCounts.all },
                { id: 'system', label: '系统操作', count: tabCounts.system },
                { id: 'security', label: '登录与异常', count: tabCounts.security },
              ]
            : undefined
        }
        activeTab={isPlatform ? activeTab : undefined}
        onTabChange={id => {
          setActiveTab(id as PlatformTab);
          setPage(1);
        }}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 一行极简筛选栏 */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {isPlatform && (
            <select
              aria-label="所属租户"
              value={tenantFilter}
              onChange={e => {
                setTenantFilter(e.target.value);
                setPage(1);
              }}
              style={{
                ...inputStyle,
                minWidth: 168,
                color: tenantFilter ? 'var(--color-text-1)' : '#6B7280',
                cursor: 'pointer',
              }}
            >
              <option value="">全部租户/主体</option>
              {orgOptions.map(org => (
                <option key={org} value={org}>
                  {org === PLATFORM_ORG_LABEL ? `${org}（软件服务方）` : org}
                </option>
              ))}
            </select>
          )}

          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9CA3AF',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={keyword}
              onChange={e => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="搜操作人 / 对象 / IP / 请求号"
              style={{ ...inputStyle, width: '100%', paddingLeft: 30 }}
            />
          </div>

          <select
            aria-label="操作结果"
            value={resultFilter}
            onChange={e => {
              setResultFilter(e.target.value);
              setPage(1);
            }}
            style={{
              ...inputStyle,
              width: 112,
              color: resultFilter ? 'var(--color-text-1)' : '#6B7280',
              cursor: 'pointer',
            }}
          >
            <option value="">全部结果</option>
            <option value="成功">仅成功</option>
            <option value="失败">仅失败</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              aria-label="开始日期"
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              style={{ ...inputStyle, width: 138, color: startDate ? 'var(--color-text-1)' : '#6B7280' }}
            />
            <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>至</span>
            <input
              aria-label="结束日期"
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              style={{ ...inputStyle, width: 138, color: endDate ? 'var(--color-text-1)' : '#6B7280' }}
            />
          </div>

          {hasFilter && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 32,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: '#FFFFFF',
                color: '#4B5563',
                fontSize: 'var(--fs-13)',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              重置
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-12)', color: '#667085', whiteSpace: 'nowrap' }}>
            共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条
          </span>
        </div>

        {/* 精简列表 */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  {th('时间', 152)}
                  {isPlatform && th('所属租户', 168)}
                  {th('操作人 / 角色', 150)}
                  {th('操作类型', 165)}
                  {th('操作对象')}
                  {th('结果', 82)}
                  {th('操作', 72, 'right')}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ padding: 0 }}>
                      <EmptyState title="没有符合条件的审计日志" description="调整筛选条件或日期范围后重试" />
                    </td>
                  </tr>
                ) : (
                  pageData.map((log, idx) => {
                    const color = actionColorOf(log);
                    const isPlatformOrg = log.org === PLATFORM_ORG_LABEL;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelected(log)}
                        style={{
                          background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                          borderBottom: '1px solid #F3F4F6',
                          cursor: 'pointer',
                          transition: 'background 120ms ease',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLTableRowElement).style.background = '#F3F7F6';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
                        }}
                      >
                        <td
                          style={{
                            padding: '10px 14px',
                            fontSize: 'var(--fs-12)',
                            color: '#374151',
                            fontFamily: "'JetBrains Mono', monospace",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {log.time}
                        </td>

                        {isPlatform && (
                          <td style={{ padding: '10px 14px', fontSize: 'var(--fs-13)' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'middle',
                                fontWeight: isPlatformOrg ? 500 : 400,
                                color: isPlatformOrg ? 'var(--color-brand)' : '#374151',
                              }}
                              title={log.org}
                            >
                              {log.org}
                            </span>
                          </td>
                        )}

                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>
                            {log.operator}
                          </div>
                          <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginTop: 1 }}>{log.role}</div>
                        </td>

                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: 'var(--fs-12)',
                              fontWeight: 600,
                              color,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: `${color}16`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {log.action}
                          </span>
                          <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginTop: 2 }}>{log.module}</div>
                        </td>

                        <td style={{ padding: '10px 14px', fontSize: 'var(--fs-13)', color: '#374151', maxWidth: 280 }}>
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={log.target}
                          >
                            {log.target}
                          </div>
                          {log.reasonCode && (
                            <div
                              style={{
                                fontSize: 'var(--fs-11)',
                                color: '#9CA3AF',
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={formatReason(log.reasonCode)}
                            >
                              {REASON_LABEL[log.reasonCode] ?? log.reasonCode}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 'var(--fs-12)',
                              fontWeight: 500,
                              color: log.result === '成功' ? '#248A5A' : '#C73A3A',
                            }}
                          >
                            {log.result === '成功' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                            {log.result}
                          </span>
                        </td>

                        <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setSelected(log);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              border: 'none',
                              background: 'none',
                              color: 'var(--color-brand)',
                              fontSize: 'var(--fs-12)',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            详情
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0 16px', borderTop: pageData.length > 0 ? '1px solid #F3F4F6' : 'none' }}>
            {pageData.length > 0 && (
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
            )}
          </div>
        </div>
      </div>

      {/* 极简只读详情弹窗 */}
      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `${selected.action} · 审计详情` : '审计详情'}
        subtitle={selected ? `${selected.time} · 只读记录不可修改` : undefined}
        width={560}
        onClose={() => {
          setSelected(null);
          setCopiedReq(false);
        }}
      >
        {selected && (
          <div>
            <FieldGroup title="基础信息">
              <FieldItem
                label="操作结果"
                value={
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontWeight: 600,
                      color: selected.result === '成功' ? '#248A5A' : '#C73A3A',
                    }}
                  >
                    {selected.result === '成功' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {selected.result}
                    {selected.decision ? `（鉴权：${selected.decision}）` : ''}
                  </span>
                }
              />
              <FieldItem label="操作时间" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selected.time}</span>} />
              <FieldItem label="所属租户/主体" value={selected.org} />
              <FieldItem label="功能模块" value={selected.module} />
              <FieldItem label="操作人" value={selected.operator} />
              <FieldItem label="操作角色" value={selected.role} />
              <FieldItem label="来源 IP" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selected.ip}</span>} />
              <FieldItem
                label="请求追踪号"
                value={
                  selected.requestId ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                      {selected.requestId}
                      <button
                        type="button"
                        onClick={() => handleCopyRequestId(selected.requestId!)}
                        title="复制请求号"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          border: 'none',
                          background: 'none',
                          color: copiedReq ? '#248A5A' : '#9CA3AF',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        {copiedReq ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </span>
                  ) : null
                }
              />
              {selected.resource && (
                <FieldItem
                  label="资源权限码"
                  value={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-13)' }}>{selected.resource}</span>}
                  span
                />
              )}
            </FieldGroup>

            <FieldGroup title="操作内容">
              <FieldItem label="操作对象" value={selected.target} span />
              <FieldItem label="原因说明" value={formatReason(selected.reasonCode)} span />
            </FieldGroup>

            {(selected.beforeState || selected.afterState) && (
              <FieldGroup title="变更明细">
                {selected.beforeState && (
                  <FieldItem
                    label="操作前"
                    span
                    value={
                      <div
                        style={{
                          padding: '8px 10px',
                          background: '#F9FAFB',
                          border: '1px solid #E5E7EB',
                          borderRadius: 6,
                          fontSize: 'var(--fs-13)',
                          color: '#4B5563',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {selected.beforeState}
                      </div>
                    }
                  />
                )}
                {selected.afterState && (
                  <FieldItem
                    label="操作后"
                    span
                    value={
                      <div
                        style={{
                          padding: '8px 10px',
                          background: '#F0FDF9',
                          border: '1px solid #CCFBF1',
                          borderRadius: 6,
                          fontSize: 'var(--fs-13)',
                          color: '#115E59',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {selected.afterState}
                      </div>
                    }
                  />
                )}
              </FieldGroup>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
