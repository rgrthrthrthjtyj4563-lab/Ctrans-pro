/**
 * 拜访管理审核工作台（业务数据管理）。
 *
 * 自「拜访管理审核工作台」独立设计稿（明澈管理平台）整体移植：列表筛选、状态页签、
 * 批量审核、详情抽屉（拜访详情 / 审核日志 / 预约凭证时间线 / 地图定位 / 照片附件）、
 * 审核弹窗与批量结果弹窗、加载骨架与空态。
 * 样式收在 VisitAuditWorkbench.css 的 .visit-audit 命名空间内，自成配色体系，
 * 不改写宿主原型的全局样式；侧栏与顶栏由宿主壳层提供，设计稿的页面内容原样保留。
 */
import { useMemo, useState, type ReactNode } from "react";
import "./VisitAuditWorkbench.css";

export type VisitAuditPageKey = "hospital" | "business" | "pharmacy";
type AuditState = "待审核" | "已通过" | "已驳回";
type ModalState = null | { type: "approve" | "reject" | "batch-approve" | "batch-reject"; count?: number };

type Visit = {
  id: number;
  specialist: string;
  provider: string;
  group: string;
  target: string;
  targetMeta: string;
  visitor: string;
  product: string;
  category: string;
  content: string;
  date: string;
  time: string;
  location: string;
  performance: "未打绩效" | "已打绩效";
  status: AuditState;
  opinion: string;
  amount?: string;
};

export const VISIT_AUDIT_PAGE_CONFIG: Record<
  VisitAuditPageKey,
  { title: string; subtitle: string; target: string; date: string }
> = {
  hospital: { title: "医院拜访管理", subtitle: "查看医院拜访记录并处理审核", target: "拜访医院", date: "拜访时间" },
  business: { title: "商业拜访管理", subtitle: "查看商业拜访记录并处理审核", target: "拜访公司", date: "拜访日期" },
  pharmacy: { title: "药房拜访管理", subtitle: "查看药房拜访记录并处理审核", target: "拜访药房", date: "拜访日期" },
};

const visits: Record<VisitAuditPageKey, Visit[]> = {
  hospital: [
    { id: 1, specialist: "陈思远", provider: "华东医药服务有限公司", group: "上海一组", target: "上海市第一人民医院", targetMeta: "三级甲等 · 心内科", visitor: "王主任", product: "瑞舒伐他汀钙片 10mg×7片", category: "学术拜访", content: "介绍最新临床研究进展，与科室沟通患者用药反馈。", date: "2025-06-18", time: "09:00 — 10:15", location: "门诊楼 4F 心内科", performance: "未打绩效", status: "待审核", opinion: "—" },
    { id: 2, specialist: "周亦航", provider: "华东医药服务有限公司", group: "上海二组", target: "复旦大学附属中山医院", targetMeta: "三级甲等 · 呼吸科", visitor: "李医生", product: "吸入用布地奈德混悬液 2ml", category: "跟踪巡访服务", content: "跟进科室产品使用情况，收集医护人员反馈。", date: "2025-06-18", time: "14:20 — 15:00", location: "2号楼呼吸科", performance: "已打绩效", status: "已通过", opinion: "信息完整，审核通过。" },
    { id: 3, specialist: "林若安", provider: "苏南健康服务中心", group: "江苏三组", target: "苏州市立医院", targetMeta: "三级乙等 · 消化科", visitor: "张主任", product: "奥美拉唑肠溶胶囊 20mg", category: "信息收集和调研", content: "收集院内相关品种覆盖及临床使用情况。", date: "2025-06-17", time: "11:00 — 11:35", location: "本部门诊 3F", performance: "未打绩效", status: "已驳回", opinion: "拜访内容描述不完整，请补充核实。" },
    { id: 4, specialist: "许知行", provider: "浙江康桥咨询有限公司", group: "浙江一组", target: "浙江大学医学院附属第二医院", targetMeta: "三级甲等 · 神经内科", visitor: "赵医生", product: "银杏叶片 24片", category: "日常拜访", content: "日常回访，了解患者用药反馈。", date: "2025-06-17", time: "15:10 — 16:00", location: "解放路院区", performance: "未打绩效", status: "待审核", opinion: "—" },
    { id: 5, specialist: "沈星河", provider: "华东医药服务有限公司", group: "上海一组", target: "上海市第六人民医院", targetMeta: "三级甲等 · 骨科", visitor: "顾主任", product: "塞来昔布胶囊 0.2g", category: "学术拜访", content: "沟通骨关节炎疼痛管理临床路径。", date: "2025-06-16", time: "10:30 — 11:20", location: "宜山路院区", performance: "已打绩效", status: "待审核", opinion: "—" },
  ],
  business: [
    { id: 1, specialist: "陈思远", provider: "华东医药服务有限公司", group: "上海一组", target: "国药控股上海有限公司", targetMeta: "商业公司", visitor: "刘经理", product: "瑞舒伐他汀钙片 10mg×7片", category: "商务服务", content: "沟通本月产品配送计划及重点区域库存安排。", date: "2025-06-18", time: "09:30 — 10:30", location: "上海市黄浦区龙华东路385号", performance: "未打绩效", status: "待审核", opinion: "—" },
    { id: 2, specialist: "周亦航", provider: "苏南健康服务中心", group: "江苏二组", target: "上药控股江苏股份有限公司", targetMeta: "商业公司", visitor: "孙主管", product: "吸入用布地奈德混悬液 2ml", category: "商业库存信息收集", content: "核对商业库存及近三个月流向数据。", date: "2025-06-17", time: "14:00 — 14:45", location: "南京市雨花台区软件大道", performance: "已打绩效", status: "已通过", opinion: "已核对拜访信息，审核通过。" },
    { id: 3, specialist: "许知行", provider: "浙江康桥咨询有限公司", group: "浙江一组", target: "浙江英特药业有限责任公司", targetMeta: "商业公司", visitor: "郑经理", product: "银杏叶片 24片", category: "商业信息收集和调研", content: "调研区域终端覆盖及配送效率。", date: "2025-06-16", time: "11:15 — 12:00", location: "杭州市拱墅区康桥路", performance: "未打绩效", status: "已驳回", opinion: "拜访位置与公司注册地址不一致，请核对。" },
  ],
  pharmacy: [
    { id: 1, specialist: "陈思远", provider: "华东医药服务有限公司", group: "上海一组", target: "益丰大药房（静安店）", targetMeta: "连锁药房", visitor: "朱店长", product: "瑞舒伐他汀钙片", category: "日常拜访", content: "了解产品陈列、库存及消费者反馈。", date: "2025-06-18", time: "10:00 — 10:40", location: "上海市静安区", performance: "未打绩效", status: "待审核", opinion: "—", amount: "¥ 2,860.00" },
    { id: 2, specialist: "周亦航", provider: "苏南健康服务中心", group: "江苏二组", target: "海王星辰（新街口店）", targetMeta: "连锁药房", visitor: "陈药师", product: "吸入用布地奈德混悬液", category: "跟踪巡访", content: "跟进动销情况，收集患者咨询重点。", date: "2025-06-17", time: "15:20 — 16:05", location: "南京市秦淮区", performance: "已打绩效", status: "已通过", opinion: "信息核验无误。", amount: "¥ 1,540.00" },
    { id: 3, specialist: "林若安", provider: "浙江康桥咨询有限公司", group: "浙江一组", target: "老百姓大药房（西湖店）", targetMeta: "连锁药房", visitor: "王店长", product: "银杏叶片", category: "信息收集", content: "收集竞品陈列与门店库存信息。", date: "2025-06-16", time: "13:00 — 13:30", location: "杭州市西湖区", performance: "未打绩效", status: "已驳回", opinion: "拜访内容缺少有效信息。", amount: "—" },
  ],
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    visit: <><path d="M8 21h8M12 17v4M6 3h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 9h6M12 6v6"/></>,
    hospital: <><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M2 21h20M9 7h3M10.5 5.5v3M8 12h2M14 12h1M8 16h2M14 16h1"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/></>,
    shop: <><path d="m3 9 2-5h14l2 5M5 13v8h14v-8M9 21v-5h6v5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9A7 7 0 0 1 18.5 6L20 11M4 13l1.5 5A7 7 0 0 0 17.9 15"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
    columns: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></>,
    filter: <><path d="M4 5h16M7 12h10M10 19h4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1.2.9-1.2 1.7M12 17h.01"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    mobile: <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 18h2"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function Button({ children, variant = "default", onClick, disabled, icon }: { children: ReactNode; variant?: "default" | "primary" | "danger" | "text"; onClick?: () => void; disabled?: boolean; icon?: string }) {
  return <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={16} />}<span>{children}</span></button>;
}

function StatusBadge({ value }: { value: AuditState }) {
  return <span className={`status status-${value}`}>{value === "待审核" && <i />}{value}</span>;
}

export function VisitAuditWorkbench({ page }: { page: VisitAuditPageKey }) {
  const [status, setStatus] = useState<"全部" | AuditState>("全部");
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<Visit | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<"success" | "partial" | null>(null);
  const config = VISIT_AUDIT_PAGE_CONFIG[page];

  const rows = useMemo(
    () =>
      visits[page].filter(
        (row) =>
          (status === "全部" || row.status === status) &&
          (!appliedKeyword || row.target.includes(appliedKeyword)),
      ),
    [page, status, appliedKeyword],
  );

  const runSearch = () => {
    setLoading(true);
    window.setTimeout(() => {
      setAppliedKeyword(keyword);
      setLoading(false);
    }, 450);
  };
  const reset = () => {
    setKeyword("");
    setAppliedKeyword("");
    setStatus("全部");
    setMore(false);
  };
  const submitAudit = () => {
    const isBatch = modal?.type.startsWith("batch");
    const isReject = modal?.type.includes("reject");
    setModal(null);
    setDetail(null);
    if (isBatch) {
      setNotice(selected.length > 2 ? "partial" : "success");
      setSelected([]);
    }
    setToast(isReject ? "已驳回该条拜访记录" : "审核已通过");
    window.setTimeout(() => setToast(""), 2600);
  };
  const counts = {
    全部: visits[page].length,
    待审核: visits[page].filter((x) => x.status === "待审核").length,
    已通过: visits[page].filter((x) => x.status === "已通过").length,
    已驳回: visits[page].filter((x) => x.status === "已驳回").length,
  };

  return (
    <div className="visit-audit">
      <div className="page-wrap">
        <section className="page-heading">
          <div>
            <h1>{config.title}</h1>
            <p>{config.subtitle}</p>
          </div>
          <span className="updated">数据更新于 10:24</span>
        </section>

        <section className="status-tabs">
          {(Object.keys(counts) as Array<keyof typeof counts>).map((item) => (
            <button
              key={item}
              className={status === item ? "active" : ""}
              onClick={() => {
                setStatus(item);
                setSelected([]);
              }}
            >
              {item}
              <span>{counts[item]}</span>
            </button>
          ))}
        </section>

        <section className="filter-panel">
          <div className="filter-grid">
            <Field label="服务提供方"><SelectLike placeholder="请选择服务提供方" /></Field>
            <Field label="工作组"><SelectLike placeholder="请选择工作组" /></Field>
            <Field label={config.target}>
              <div className="input-wrap">
                <Icon name="search" size={15} />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={page === "pharmacy" ? "请输入药房名称" : `请输入${config.target}`}
                />
              </div>
            </Field>
            <Field label={config.date}>
              <div className="date-range"><span>开始日期</span><b>—</b><span>结束日期</span><Icon name="calendar" size={15} /></div>
            </Field>
            <Field label="审核状态"><SelectLike placeholder="全部状态" /></Field>
          </div>
          {more && (
            <div className="filter-grid more-grid">
              <Field label="品种名称"><SelectLike placeholder="请选择品种" /></Field>
              <Field label="绩效状态"><SelectLike placeholder="全部绩效状态" /></Field>
              {page !== "pharmacy" && <Field label="拜访类别"><SelectLike placeholder="请选择拜访类别" /></Field>}
              {page === "hospital" && <Field label="医院等级"><SelectLike placeholder="请选择医院等级" /></Field>}
              <Field label="开始时间是否为整点"><SelectLike placeholder="全部" /></Field>
              <Field label="结束时间是否为整点"><SelectLike placeholder="全部" /></Field>
            </div>
          )}
          <div className="filter-actions">
            <button className="more-toggle" onClick={() => setMore(!more)}>
              <Icon name="filter" size={16} />{more ? "收起筛选" : "更多筛选"}<span className={more ? "up" : ""}>⌄</span>
            </button>
            <div>
              <Button icon="refresh" onClick={reset}>重置</Button>
              <Button variant="primary" icon="search" onClick={runSearch}>搜索</Button>
            </div>
          </div>
        </section>

        {appliedKeyword && (
          <div className="active-filters">
            <span>已生效条件</span>
            <button>
              {config.target}：{appliedKeyword}
              <span
                onClick={() => {
                  setAppliedKeyword("");
                  setKeyword("");
                }}
              >
                ×
              </span>
            </button>
            <button className="clear-filter" onClick={reset}>清除全部</button>
          </div>
        )}

        <section className="table-card">
          {selected.length > 0 && page !== "pharmacy" ? (
            <div className="batch-bar">
              <div>
                <span className="batch-check"><Icon name="check" size={14} /></span>
                已选择 <strong>{selected.length}</strong> 条记录 <em>仅选择本页</em>
              </div>
              <div>
                <Button variant="primary" icon="check" onClick={() => setModal({ type: "batch-approve", count: selected.length })}>批量审核通过</Button>
                <Button variant="danger" onClick={() => setModal({ type: "batch-reject", count: selected.length })}>批量审核驳回</Button>
                <button className="text-action" onClick={() => setSelected([])}>清空选择</button>
              </div>
            </div>
          ) : (
            <div className="table-toolbar">
              <div>共 <strong>{rows.length}</strong> 条记录 <span>数据范围：当前权限</span></div>
              <div>
                {page !== "pharmacy" && <Button icon="download">导出</Button>}
                <Button icon="columns">列设置</Button>
              </div>
            </div>
          )}

          <div className="table-scroll">
            {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState onReset={reset} /> : (
              <table>
                <thead>
                  <tr>
                    {page !== "pharmacy" && (
                      <th className="check-col">
                        <input
                          type="checkbox"
                          checked={selected.length === rows.length && rows.length > 0}
                          onChange={(e) => setSelected(e.target.checked ? rows.map((x) => x.id) : [])}
                        />
                      </th>
                    )}
                    <th>序号</th>
                    <th>服务专员</th>
                    <th>服务提供方 / 工作组</th>
                    <th>{page === "hospital" ? "医院 / 科室" : page === "business" ? "被拜访商业公司" : "被拜访药房"}</th>
                    <th>被拜访人</th>
                    <th>拜访品种及规格</th>
                    <th>拜访日期 / 时段</th>
                    {page === "pharmacy" && <th>金额</th>}
                    <th>绩效状态</th>
                    <th>审核状态</th>
                    <th>审核意见</th>
                    <th className="action-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {page !== "pharmacy" && (
                        <td className="check-col">
                          <input
                            type="checkbox"
                            checked={selected.includes(row.id)}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((x) => x !== row.id))}
                          />
                        </td>
                      )}
                      <td className="sequence">{String(row.id).padStart(2, "0")}</td>
                      <td><strong className="cell-title">{row.specialist}</strong><span className="cell-sub">u{202500 + row.id}</span></td>
                      <td><span className="cell-main max-provider">{row.provider}</span><span className="cell-sub">{row.group}</span></td>
                      <td><strong className="cell-title max-target">{row.target}</strong><span className="cell-sub">{row.targetMeta}</span></td>
                      <td>{row.visitor}</td>
                      <td><span className="cell-main max-product">{row.product}</span><span className="cell-sub">{row.category}</span></td>
                      <td><span className="cell-main">{row.date}</span><span className="cell-sub">{row.time}</span></td>
                      {page === "pharmacy" && <td>{row.amount}</td>}
                      <td><span className={`performance ${row.performance === "已打绩效" ? "done" : ""}`}>{row.performance}</span></td>
                      <td><StatusBadge value={row.status} /></td>
                      <td><span className="opinion" title={row.opinion}>{row.opinion}</span></td>
                      <td className="action-col">
                        <div className="row-actions">
                          <button onClick={() => setDetail(row)}>{page === "pharmacy" ? "查看详情" : "查看"}</button>
                          {row.status === "待审核" && (
                            <>
                              <button className="approve" onClick={() => setModal({ type: "approve" })}>通过</button>
                              <button className="reject" onClick={() => setModal({ type: "reject" })}>驳回</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!loading && rows.length > 0 && (
            <div className="pagination">
              <span>共 {rows.length} 条</span>
              <button disabled>‹</button>
              <button className="current">1</button>
              <button disabled>›</button>
              <span>20 条/页</span>
            </div>
          )}
        </section>
        <p className="scope-note">审核状态与可操作权限以实际业务规则为准；“整点”仅为记录信息，不代表异常。</p>
      </div>

      {detail && (
        <DetailDrawer
          visit={detail}
          page={page}
          onClose={() => setDetail(null)}
          onApprove={() => setModal({ type: "approve" })}
          onReject={() => setModal({ type: "reject" })}
        />
      )}
      {modal && <AuditModal state={modal} onClose={() => setModal(null)} onSubmit={submitAudit} />}
      {notice && <ResultModal type={notice} onClose={() => setNotice(null)} />}
      {toast && (
        <div className="toast">
          <span><Icon name="check" size={15} /></span>{toast}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SelectLike({ placeholder }: { placeholder: string }) {
  return <button className="select-like"><span>{placeholder}</span><span>⌄</span></button>;
}

function LoadingState() {
  return (
    <div className="loading-state">
      {[1, 2, 3, 4, 5].map((i) => (
        <div className="skeleton-row" key={i}><i /><i /><i /><i /><i /></div>
      ))}
      <p><span className="spinner" />正在加载拜访记录...</p>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration"><Icon name="search" size={30} /></div>
      <strong>没有找到符合条件的记录</strong>
      <p>请尝试调整筛选条件或清除当前筛选</p>
      <Button onClick={onReset}>重置筛选条件</Button>
    </div>
  );
}

function DetailDrawer({
  visit,
  page,
  onClose,
  onApprove,
  onReject,
}: {
  visit: Visit;
  page: VisitAuditPageKey;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [tab, setTab] = useState<"detail" | "log">("detail");
  const [showAppointment, setShowAppointment] = useState(false);
  const isAcademicVisit = visit.category === "学术拜访";
  const photos = [
    { src: "https://images.unsplash.com/photo-1759045313316-0ed8915057fe?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600", label: "拜访场所外景" },
    { src: "https://images.unsplash.com/photo-1689048494522-d61159872e51?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600", label: "现场定位环境" },
    { src: "https://images.unsplash.com/photo-1631462199549-becc852f4b64?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=600", label: "拜访凭证照片" },
  ];
  const sections = [
    {
      title: "拜访对象信息",
      items: [
        ["服务专员", visit.specialist],
        ["服务提供方", visit.provider],
        ["工作组", visit.group],
        [page === "hospital" ? "拜访医院" : page === "business" ? "拜访公司" : "拜访药房", visit.target],
        [page === "hospital" ? "医院等级 / 科室" : "对象类型", visit.targetMeta],
        ["被拜访人", visit.visitor],
      ],
    },
    {
      title: "拜访内容",
      items: [
        ["拜访类别", visit.category],
        ["品种及规格", visit.product],
        ["拜访内容", visit.content],
        ...(page === "business" ? [["拜访位置", visit.location]] : []),
        ...(page === "pharmacy" ? [["金额", visit.amount || "—"]] : []),
      ],
    },
    {
      title: "时间信息",
      items: [
        ["拜访日期", visit.date],
        ["拜访时段", visit.time],
        ["开始时间是否为整点", visit.time.includes(":00") ? "是" : "否"],
        ["结束时间是否为整点", visit.time.endsWith(":00") ? "是" : "否"],
      ],
    },
    {
      title: "审核信息",
      items: [
        ["审核状态", visit.status],
        ["审核意见", visit.opinion],
        ["绩效状态", visit.performance],
      ],
    },
  ];
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span className="drawer-eyebrow">拜访记录详情</span>
            <h2>{visit.target}</h2>
            <p>记录编号：VIS-202506-{String(visit.id).padStart(4, "0")}</p>
          </div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="drawer-status">
          <div>
            <StatusBadge value={visit.status} />
            {visit.status === "待审核" && <span className="review-level">当前：二级审核</span>}
          </div>
          <span>提交于 {visit.date} 17:24</span>
        </div>
        <div className="drawer-tabs">
          <button className={tab === "detail" ? "active" : ""} onClick={() => setTab("detail")}>拜访详情</button>
          <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>审核日志 <span>3</span></button>
        </div>
        <div className="drawer-body">
          {tab === "detail" ? (
            <>
              {sections.slice(0, 3).map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <div className="detail-grid">
                    {section.items.map(([key, value]) => (
                      <div className={key === "拜访内容" || key === "品种及规格" ? "wide" : ""} key={key}>
                        <span>{key}</span>
                        <p>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {isAcademicVisit && (
                <section>
                  <h3>预约凭证 <span className="academic-only">学术拜访必需</span></h3>
                  <div className="appointment-proof">
                    <div className="appointment-proof-head">
                      <span className="appointment-app-icon"><Icon name="mobile" size={19} /></span>
                      <div><strong>APP 预约凭证</strong><p>凭证编号：APT-20250618-0086</p></div>
                      <button className="appointment-badge" onClick={() => setShowAppointment(true)}>
                        <span><Icon name="check" size={12} /></span>已确认 · 查看时间线 <b>›</b>
                      </button>
                    </div>
                    <div className="appointment-fields">
                      <div><span>预约对象</span><strong>{visit.visitor}</strong></div>
                      <div><span>预约时间</span><strong>{visit.date} 09:00</strong></div>
                      <div><span>计划拜访时段</span><strong>{visit.time}</strong></div>
                      <div><span>预约来源</span><strong>服务专员 APP</strong></div>
                    </div>
                    <div className="appointment-hint">
                      <Icon name="alert" size={14} />
                      <span>PC 端仅展示预约信息，预约与确认动作均在服务专员 APP 内完成。</span>
                    </div>
                  </div>
                </section>
              )}
              <section>
                <h3>地图定位</h3>
                <div className="location-card">
                  <div className="map-canvas">
                    <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" />
                    <span className="map-block block-a" /><span className="map-block block-b" /><span className="map-block block-c" /><span className="map-block block-d" />
                    <div className="map-pin"><Icon name="pin" size={25} /><i /></div>
                    <span className="map-label">拜访签到点</span><span className="map-water">河滨绿地</span>
                    <div className="map-zoom"><button>＋</button><button>−</button></div>
                  </div>
                  <div className="location-meta">
                    <span className="location-icon"><Icon name="map" size={17} /></span>
                    <div><strong>{visit.location}</strong><p>定位精度 18 米 · 签到位置与拜访对象相距 86 米</p></div>
                    <span className="distance-ok">范围内</span>
                  </div>
                </div>
              </section>
              <section>
                <h3>照片附件 <span className="section-count">3 张</span></h3>
                <div className="photo-grid">
                  {photos.map((photo, index) => (
                    <button className="photo-item" key={photo.src}>
                      <img src={photo.src} alt={photo.label} />
                      <span><Icon name="image" size={13} />{photo.label}</span>
                      <i>{index + 1} / 3</i>
                    </button>
                  ))}
                </div>
                <p className="photo-note">照片仅用于审核核验，拍摄时间与原始文件信息均已保留</p>
              </section>
              {sections.slice(3).map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <div className="detail-grid">
                    {section.items.map(([key, value]) => (
                      <div className={key === "审核意见" ? "wide" : ""} key={key}>
                        <span>{key}</span>
                        <p>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <AuditLog visit={visit} />
          )}
        </div>
        <div className="drawer-foot">
          <div>
            <button className="previous">‹ 上一条</button>
            <button className="next">下一条 ›</button>
          </div>
          {visit.status === "待审核" && (
            <div>
              <Button variant="danger" onClick={onReject}>驳回</Button>
              <Button variant="primary" onClick={onApprove}>通过</Button>
            </div>
          )}
        </div>
      </aside>
      {showAppointment && <AppointmentTimeline visit={visit} onClose={() => setShowAppointment(false)} />}
    </div>
  );
}

function AppointmentTimeline({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  return (
    <div className="appointment-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="appointment-modal">
        <div className="appointment-modal-head">
          <div><span>APP 预约凭证</span><h2>预约时间线</h2><p>APT-20250618-0086 · {visit.target}</p></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="appointment-state">
          <span className="appointment-app-icon"><Icon name="mobile" size={19} /></span>
          <div><strong>预约已确认</strong><p>预约时间与本次拜访记录匹配</p></div>
          <span className="proof-verified"><Icon name="check" size={12} />凭证有效</span>
        </div>
        <div className="appointment-timeline">
          <div className="appointment-event complete">
            <span className="event-dot"><Icon name="check" size={13} /></span>
            <div>
              <header><strong>预约已创建</strong><time>2025-06-16 14:32</time></header>
              <p>服务专员 {visit.specialist} 在 APP 发起学术拜访预约</p>
              <small>预约时段：{visit.date} {visit.time}</small>
            </div>
          </div>
          <div className="appointment-event complete">
            <span className="event-dot"><Icon name="check" size={13} /></span>
            <div>
              <header><strong>预约对象已确认</strong><time>2025-06-16 16:08</time></header>
              <p>{visit.visitor} 已确认本次拜访预约</p>
              <small>确认渠道：APP 预约确认</small>
            </div>
          </div>
          <div className="appointment-event complete">
            <span className="event-dot"><Icon name="pin" size={13} /></span>
            <div>
              <header><strong>按预约到访并签到</strong><time>{visit.date} 08:56</time></header>
              <p>已在预约地点附近完成签到，距离目标位置 86 米</p>
              <small>签到地点：{visit.location}</small>
            </div>
          </div>
          <div className="appointment-event current">
            <span className="event-dot"><Icon name="visit" size={13} /></span>
            <div>
              <header><strong>拜访记录已提交</strong><time>{visit.date} 17:24</time></header>
              <p>预约凭证已自动关联到本次学术拜访记录</p>
              <small>当前进入企业审核流程</small>
            </div>
          </div>
        </div>
        <div className="appointment-readonly">
          <Icon name="alert" size={15} />
          <p><strong>只读凭证</strong><br />此页面用于审核核验，预约信息不可在 PC 端修改。若信息有误，请联系服务专员在 APP 端处理。</p>
        </div>
        <div className="appointment-modal-foot"><Button variant="primary" onClick={onClose}>关闭</Button></div>
      </div>
    </div>
  );
}

function AuditLog({ visit }: { visit: Visit }) {
  const finished = visit.status !== "待审核";
  return (
    <div className="audit-log">
      <div className="audit-summary">
        <div><span>审核流程</span><strong>两级审核</strong></div>
        <div><span>当前节点</span><strong className={finished ? "complete-text" : "current-text"}>{finished ? "流程已结束" : "二级审核"}</strong></div>
        <div><span>整体状态</span><StatusBadge value={visit.status} /></div>
      </div>
      <div className="audit-route">
        <div className="route-node complete"><span><Icon name="check" size={14} /></span><div><strong>一级审核</strong><small>区域审核员</small></div></div>
        <i className="route-line complete" />
        <div className={`route-node ${finished ? "complete" : "current"}`}>
          <span>{finished ? <Icon name="check" size={14} /> : "2"}</span>
          <div><strong>二级审核</strong><small>企业审核管理员</small></div>
        </div>
        <i className={`route-line ${finished ? "complete" : ""}`} />
        <div className={`route-node ${finished ? "complete" : "pending"}`}>
          <span>{finished ? <Icon name="check" size={14} /> : "✓"}</span>
          <div><strong>审核完成</strong><small>结果生效</small></div>
        </div>
      </div>
      {!finished && (
        <div className="current-node-callout">
          <span><Icon name="clock" size={17} /></span>
          <div><strong>等待二级审核</strong><p>一级审核已通过，当前记录需要由企业审核管理员完成最终审核。</p></div>
        </div>
      )}
      <section className="log-section">
        <h3>审核记录</h3>
        <div className="timeline">
          {finished && (
            <div className={`timeline-item ${visit.status === "已驳回" ? "rejected" : "approved"}`}>
              <span className="timeline-dot">{visit.status === "已驳回" ? "×" : <Icon name="check" size={13} />}</span>
              <div className="timeline-card">
                <div><strong>二级审核 · {visit.status}</strong><time>{visit.date} 18:06</time></div>
                <p>操作人：企业审核管理员 · 赵明</p>
                <blockquote>{visit.opinion}</blockquote>
              </div>
            </div>
          )}
          <div className="timeline-item approved">
            <span className="timeline-dot"><Icon name="check" size={13} /></span>
            <div className="timeline-card">
              <div><strong>一级审核 · 已通过</strong><time>{visit.date} 17:48</time></div>
              <p>操作人：区域审核员 · 李雯</p>
              <blockquote>拜访对象、时间及现场信息核验一致，同意提交二级审核。</blockquote>
            </div>
          </div>
          <div className="timeline-item submitted">
            <span className="timeline-dot"><Icon name="clock" size={13} /></span>
            <div className="timeline-card">
              <div><strong>提交审核</strong><time>{visit.date} 17:24</time></div>
              <p>提交人：服务专员 · {visit.specialist}</p>
              <blockquote>记录已提交，进入一级审核。</blockquote>
            </div>
          </div>
        </div>
      </section>
      <div className="audit-rule-note">
        <Icon name="alert" size={16} />
        <p><strong>审核规则说明</strong><br />一级审核通过后进入二级审核；二级审核通过后记录最终生效。任一节点驳回，流程结束并通知提交人。</p>
      </div>
    </div>
  );
}

function AuditModal({
  state,
  onClose,
  onSubmit,
}: {
  state: NonNullable<ModalState>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const reject = state.type.includes("reject");
  const batch = state.type.startsWith("batch");
  return (
    <div className="overlay modal-overlay">
      <div className="modal">
        <div className={`modal-icon ${reject ? "warning" : ""}`}><Icon name={reject ? "alert" : "check"} size={24} /></div>
        <div className="modal-copy">
          <h2>{batch ? `批量二级审核${reject ? "驳回" : "通过"}` : reject ? "二级审核驳回" : "确认二级审核通过？"}</h2>
          <p>
            {batch ? (
              <>本次将在二级审核节点处理已选择的 <strong>{state.count}</strong> 条记录，范围为当前页。提交前系统将校验一级审核状态与操作权限。</>
            ) : reject ? (
              "该记录已通过一级审核。请填写二级审核意见，驳回后审核流程将结束。"
            ) : (
              "该记录已通过一级审核。请确认已完成最终核对，通过后二级审核完成且结果正式生效。"
            )}
          </p>
        </div>
        {(reject || batch) && reject && (
          <label className="opinion-input">
            <span>审核意见 <em>是否必填以业务规则为准</em></span>
            <textarea placeholder={batch ? "请输入统一审核意见，该意见将应用于全部选中记录" : "请输入审核意见"} />
            <small>0 / 200</small>
          </label>
        )}
        {batch && (
          <div className="batch-scope">
            <span><Icon name="alert" size={16} /></span>
            <div><strong>选择范围：仅当前页</strong><p>不包含其他分页中符合筛选条件的记录</p></div>
          </div>
        )}
        <div className="modal-actions">
          <Button onClick={onClose}>取消</Button>
          <Button variant={reject ? "danger" : "primary"} onClick={onSubmit}>{reject ? "确认驳回" : "确认通过"}</Button>
        </div>
      </div>
    </div>
  );
}

function ResultModal({ type, onClose }: { type: "success" | "partial"; onClose: () => void }) {
  const partial = type === "partial";
  return (
    <div className="overlay modal-overlay">
      <div className="modal result-modal">
        <div className={`result-mark ${partial ? "partial" : ""}`}><Icon name={partial ? "alert" : "check"} size={30} /></div>
        <h2>{partial ? "批量审核已完成，部分记录处理失败" : "批量审核完成"}</h2>
        <p>{partial ? "记录状态可能已发生变化，请查看失败原因后刷新或重新选择。" : "所选拜访记录已全部审核通过。"}</p>
        <div className="result-stats">
          <div><strong>{partial ? "2" : "3"}</strong><span>成功</span></div>
          <i />
          <div className={partial ? "failed" : ""}><strong>{partial ? "1" : "0"}</strong><span>失败</span></div>
        </div>
        {partial && (
          <div className="failure-detail"><span>VIS-202506-0004</span><p>记录状态已更新，当前不可审核</p></div>
        )}
        <div className="modal-actions"><Button variant="primary" onClick={onClose}>我知道了</Button></div>
      </div>
    </div>
  );
}
