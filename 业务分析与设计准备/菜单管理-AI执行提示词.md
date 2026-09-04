# 菜单管理 · AI 执行提示词

> 你是前端实施工程师，在仓库 `业务分析与设计准备/`（React 19 + Vite + TypeScript，纯内联样式，无 UI 框架）中完成「系统管理 · 菜单管理」页面。需求依据：`../文档/菜单管理-设计方案.md`（V1.0）。**只允许改动本文第 3 节列出的文件**，完成后交人工审核，不要自行 commit。
>
> 工作区当前已有其他模块的未提交改动（任务执行、绩效等）。禁止执行 `git checkout` / `git restore` / `git stash` 等全局操作，只在自己负责的文件上做增量修改。

## 0. 项目硬约束（先读）

1. 遵守 `UI_RULES.md`：颜色、字号、圆角、间距用 `src/index.css` 的 token；图标只用 `lucide-react`；优先复用 `src/components/`（`PageHeader`、`EmptyState`、`StatusTag`、`Button`）与 `src/pages/permUi.tsx`（`Field`、`RadioCard`、`InfoBanner`、`inputStyle` 等，参照 `RoleManage.tsx` / `UserOrgManage.tsx` 的用法）。
2. 验证方式：`npm run dev`（端口 8443）人工走查 + `npm run build` 通过（构建走 vite/esbuild）。
3. **禁止运行 `npm run format` / oxfmt**（会全库重排，无法 review）。
4. 仓库存在预存的 `tsc --noEmit` 语法报错（历史格式化残留），不要顺手修无关文件，以 `npm run build` 为准。
5. 代码风格跟随 `UserOrgManage.tsx` 现状（单引号 + 分号为主）。
6. **不引入任何新依赖**。
7. `src/App.tsx` 与 `src/data/permissions.ts` 的改动**仅限第 3.4、3.5 节列出的改动点**；`src/context/` 下任何文件不动。

## 1. 需求背景与已确认决策

「菜单管理」让管理员维护左侧导航：一级目录 + 二级页面菜单（最多两层）、绑定已有页面、同级上移/下移、启用/停用。菜单只管「怎么展示」，页面可不可见仍由角色权限（`visiblePages`）决定，两者不合并。

与设计方案的对齐结论（已拍板，不要偏离）：

| 决策点 | 结论 |
| --- | --- |
| 层级模型 | 一级 = 目录（group）或**一级独立页面**（page，parentId=null）；二级 = 页面菜单（page，parentId=目录 id）。一级独立页面是对设计文档 §4 规则 1 的必要放宽：现有侧栏的 工作台 / baiyee-AI / 业务管理三页 / 绩效三页 都是一级直挂页面，种子必须 1:1 还原现状 |
| 分区标签 | 现有侧栏的分区标题（业务管理 / 绩效管理 / 主数据 / 配置 & 分析）通过一级项的 `section?: string` 字段保留在种子里，**V1 表单不编辑该字段**；渲染时把一级项按 sort 排序、连续相同 section 归为一组 |
| 编辑形态 | 采用设计方案 §5 的**左侧菜单树 + 右侧编辑表单**（§7 写的「编辑弹窗」以 §5 为准）；未选中时右侧显示 `EmptyState` |
| 持久化 | React state（AppShell 持有），**刷新页面恢复默认菜单**，不用 localStorage；菜单配置是应用级数据，切换登录角色不重置 |
| 删除 | 本期**没有删除操作**（只有新增/编辑/上移/下移/启停），与设计方案范围一致 |
| 操作日志 | 所有写操作经 `usePermission().logAudit()` 写入，`module: "菜单管理"`，操作日志页自动呈现（它已合并 context 的 `auditEvents`） |

**与设计方案 §3 的一处原型偏差（已确认）**：方案要求仅 平台运营 / 系统管理员 可见，但原型登录切换器只有 药厂销售部门 / 药厂合规部门 / 服务提供商 三个登录角色，「平台运营 / 系统管理员」只能通过角色预览只读进入。为保证页面可演示、可写，授权如下（与 execution-chain、roles、departments 等系统管理页面挂在药厂销售管理员下的既有做法一致）：

- `role-platform-ops` 平台运营：`ALL_PAGES` 自动获得，无需改；
- `role-sys-admin` 系统管理员：显式加 `["menus", ["view", "create", "edit"]]`；
- `role-pharma-sales` 药厂销售管理员（登录角色「药厂销售部门」映射）：显式加 `["menus", ["view", "create", "edit"]]`，代码注释标注「原型演示授权，真实后端收敛到平台运营/系统管理员」；
- 其余角色不授权（药厂合规部门、服务商登录下无入口）。

角色预览态（`previewReadOnly`）下按 `RoleManage` / `UserOrgManage` 惯例禁用所有写按钮。

## 2. 改动总览

| 文件 | 动作 |
| --- | --- |
| `src/types.ts` | `PageId` 增加 `"menus"`；新增 `MenuItem` 类型 |
| `src/data/menus.ts` | **新建**：图标注册表、菜单种子数据、`buildNavGroups` 派生函数 |
| `src/data/permissions.ts` | `RESOURCE_PAGES` 增加菜单管理页；`role-sys-admin`、`role-pharma-sales` 各加一行授权 |
| `src/pages/MenuManage.tsx` | **新建**：左树右表单的菜单管理页 |
| `src/App.tsx` | 删除硬编码 `navGroups`，改为菜单数据派生；`renderPage` 加 `menus` 分支；`pageLabels` / `pageSections` 加键 |
| `src/pages/AuditLog.tsx` | `PERM_ACTION_COLOR` 增加菜单操作配色（小改） |

## 3. 逐文件规格

### 3.1 `src/types.ts`

1. `PageId` 联合类型增加 `"menus"`（放在 `"execution-chain"` 附近）。
2. 新增并导出：

```ts
export type MenuType = "group" | "page";

export interface MenuItem {
  id: string;                // 目录用语义 id（如 "group-admin"）；页面菜单用 "menu-<pageId>"
  name: string;
  type: MenuType;            // group=目录，page=页面菜单
  parentId: string | null;   // null=一级（目录或一级独立页面）
  pageId?: PageId;           // type=page 时必填，关联已有页面
  iconKey?: string;          // 一级项图标，MENU_ICONS 的 key
  section?: string;          // 一级项所属分区标签（""=无标签分区），仅种子使用，V1 不编辑
  sort: number;              // 同级排序，父级内/一级各自连续编号
  enabled: boolean;
  badge?: number;            // 种子展示属性（工作台 badge 8）
  displayDisabled?: boolean; // 种子展示属性（药厂业务开关置灰但保留展示）
  updatedAt: string;
  updatedBy: string;
}
```

### 3.2 新建 `src/data/menus.ts`

**图标注册表**（key → lucide 组件），至少包含现有侧栏用到的全部图标，另加 `folder`（`Folder`）作为新目录默认图标：

```ts
import { LayoutDashboard, Sparkles, CircleDollarSign, ClipboardList, FileText,
  Award, Users, Receipt, UserCheck, Database, Settings, Table2, Shield, Folder,
  type LucideIcon } from "lucide-react";

export const MENU_ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, sparkles: Sparkles,
  "circle-dollar-sign": CircleDollarSign, "clipboard-list": ClipboardList,
  "file-text": FileText, award: Award, users: Users, receipt: Receipt,
  "user-check": UserCheck, database: Database, settings: Settings,
  "table-2": Table2, shield: Shield, folder: Folder,
};
```

**种子数据 `seedMenuItems: MenuItem[]`**——必须 1:1 还原现有侧栏（对照 `App.tsx` 原 `navGroups`）。`enabled` 全部为 `true`；`updatedAt` 取近期时间、`updatedBy: "李航"`：

| sort | id | name | type | parentId | pageId | section | iconKey | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | menu-dashboard | 工作台 | page | null | dashboard | "" | layout-dashboard | badge: 8 |
| 2 | menu-baiyee-ai | baiyee-AI | page | null | baiyee-ai | "" | sparkles | |
| 3 | menu-budget-plan | 预算计划 | page | null | budget-plan | 业务管理 | circle-dollar-sign | |
| 4 | menu-task-dispatch | 任务执行 | page | null | task-dispatch | 业务管理 | clipboard-list | |
| 5 | menu-hospital-visits | 医院拜访 | page | null | hospital-visits | 业务管理 | file-text | |
| 6 | menu-performance-team | 团队工作质量评价 | page | null | performance-team | 绩效管理 | award | |
| 7 | menu-performance-specialist | 服务专员绩效 | page | null | performance-specialist | 绩效管理 | users | |
| 8 | menu-settlement | 结算明细 | page | null | settlement | 绩效管理 | receipt | |
| 9 | group-enterprise | 企业用户管理 | group | null | — | "" | user-check | |
| 10 | group-master | 主数据管理 | group | null | — | 主数据 | database | |
| 11 | group-config | 规则配置 | group | null | — | 配置 & 分析 | settings | |
| 12 | group-price | 价目管理 | group | null | — | 配置 & 分析 | table-2 | |
| 13 | group-admin | 系统管理 | group | null | — | 配置 & 分析 | shield | |

二级（parentId 指向上表目录，各自从 sort=1 连续编号）：

| 目录 | 子菜单（按序，name / pageId） | 备注 |
| --- | --- | --- |
| group-enterprise | menu-rep-filing 医药代表备案管理 / rep-filing；menu-vendor-access 服务商准入管理 / vendor-access | |
| group-master | menu-doctors 医生主数据 / doctors；menu-varieties 品种管理 / varieties；menu-variety-auth 品种授权 / variety-auth | |
| group-config | menu-business-switch 药厂业务开关 / business-switch | `displayDisabled: true`（置灰展示） |
| group-price | menu-price-config 价目表配置 / price-config | |
| group-admin | menu-roles 角色管理 / roles；**menu-menus 菜单管理 / menus（新增）**；menu-departments 用户与组织 / departments；menu-role-preview 角色预览 / role-preview；menu-audit-log 操作日志 / audit-log；menu-execution-chain 执行链路配置 / execution-chain；menu-performance-coefficient 绩效系数配置 / performance-coefficient | 菜单管理排第二位（设计方案 §3）；绩效系数配置设计方案未列，保留在末位 |

**派生函数**（导出，供 App.tsx 使用）：

```ts
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  disabled?: boolean;
  children?: { id: string; label: string; badge?: number; disabled?: boolean }[];
}

export function buildNavGroups(items: MenuItem[]): { label?: string; items: NavItem[] }[] {
  // 1. 一级项按 sort 升序；连续 section 相同（含 ""）的归为一个组，"" 组不带 label。
  // 2. type=page 的一级项 → 叶子 NavItem（badge 透传）；
  //    type=group 的一级项 → children = 其子菜单按 sort 升序映射（不传 icon）。
  // 3. icon = MENU_ICONS[iconKey] ?? Folder。
  // 4. 注意：此函数不做权限过滤、不过滤 enabled——保持纯数据派生，
  //    权限与启停过滤沿用 App.tsx 现有 visibleNavGroups 逻辑（见 3.5）。
}
```

实现提示：App.tsx 现有渲染对目录的折叠/展开（`expandedGroups`）与 `navigate()` 里的分组查找都基于「目录项有 `children` 字段」这一形态，`buildNavGroups` 输出保持该形态即可，**这些逻辑一行都不用改**。目录项一级仍要带 `icon`；二级 children 沿现状不带 icon。

### 3.3 `src/data/permissions.ts`

1. `RESOURCE_PAGES` 在 `departments`（用户与组织）之前插入（使角色管理矩阵列序与侧栏一致）：

```ts
{
  id: "menus",
  module: "系统管理",
  name: "菜单管理",
  description: "维护左侧导航的目录、页面绑定、排序与启停",
  actions: acts("menus", ["view", "create", "edit"]),
},
```

（动作沿用既有 key：查看=view、新增=create、编辑/启停/排序=edit，不新增 action key，避免波及角色矩阵语义。）

2. `role-sys-admin`（系统管理员）的 `pagePerms` 在 `["roles", ...]` 行后加：`["menus", ["view", "create", "edit"]]`。
3. `role-pharma-sales`（药厂销售管理员）的 `pagePerms` 在 `["roles", ...]` 行后加同样一行，行尾注释「原型演示授权：真实后端仅平台运营/系统管理员」。
4. `role-platform-ops` 用 `ALL_PAGES` 自动获得，无需改动。

### 3.4 新建 `src/pages/MenuManage.tsx`

**Props**：`{ menuItems: MenuItem[]; onChange: (next: MenuItem[]) => void; addToast: (t: ToastInput) => void }`（ToastInput 以 App.tsx 现有 addToast 签名为准）。内部 `const { can, previewReadOnly, logAudit } = usePermission();`。

**按钮可用性**（对齐 RoleManage 惯例）：

```ts
const canCreate = can("menus", "create") && !previewReadOnly;
const canEdit = can("menus", "edit") && !previewReadOnly;
```

不可用时按钮 disabled；整页无 view 权限不会到达（App.tsx 拦截）。

**布局**：`PageHeader`（title 菜单管理，description「维护左侧导航的目录、页面绑定、排序与启停；页面可见性仍由角色权限决定」）之下，左右两卡（左约 360px、右自适应，`alignItems: "flex-start"`）。

**左侧菜单树卡片**：

- 顶部两个按钮：`新增目录`（primary，Plus 图标）、`新增页面菜单`（outline）。「新增页面菜单」默认挂到第一个目录，仍可在表单里改上级目录（设计方案顶部只写了新增目录，这里补一个页面菜单入口便于演示二级新增，不改变数据模型）。
- 树按一级 sort 展开：目录行显示 图标 + 名称 + 状态；其下缩进显示子菜单行。目录默认全部展开（本地 state 控制折叠箭头可选）。
- 状态标签用 `StatusTag`：启用（绿）/ 已停用（灰）；`displayDisabled` 的项额外注记「置灰展示」。
- 行操作（图标按钮，`previewReadOnly || !canEdit` 时禁用写操作，`!canCreate` 时禁用新增）：
  - 目录行：新增子菜单（Plus）、编辑（PencilLine）、上移（ArrowUp）、下移（ArrowDown）、启用/停用（PowerOff / Power）；
  - 菜单行：编辑、上移、下移、启用/停用；
  - 同级第一个「上移」、最后一个「下移」置灰。
- 选中行高亮（品牌色浅底），选中即联动右侧表单。

**右侧编辑表单卡片**：三种态——

1. 未选中：`EmptyState`（「在左侧选择一个菜单项，或新增目录 / 页面菜单」）。
2. 新增目录 / 编辑目录：字段 = 菜单名称（必填）、图标（下拉选 `MENU_ICONS`，展示 icon + key，默认 folder）、启用状态（开关）。编辑时标题「编辑目录」。
3. 新增页面菜单 / 编辑页面菜单：字段 = 菜单名称（必填）、上级目录（必填，下拉列出全部目录，按一级 sort；若编辑的是种子中的一级独立页面，该字段只读显示「（一级独立入口）」）、关联页面（必填，下拉列出 `RESOURCE_PAGES` 全部条目，显示 `module / name`，当前绑定项标注「当前」；编辑已绑定页面时可换绑）、启用状态。表单底部「保存」按钮 + 变更摘要说明。

**保存校验**（失败 `addToast({ type: "error", ... })` 且不落库）：

1. 菜单名称必填；
2. 同一父级下名称不重复（不含自身）；
3. 一个页面只能绑定一个**启用**菜单：保存后目标 `pageId` 若被其他 enabled 菜单占用则拒绝，报「该页面已绑定启用菜单：<菜单名>，请先停用或换绑」；保存为停用状态时不校验占用；
4. 目录不允许设置 pageId（表单形态天然保证）。

**启停规则**：停用目录时其下子菜单保持自身状态（不级联改数据），侧栏整体不渲染该目录（见 3.5 渲染规则）；提示语说明这一点。

**排序**：上移/下移 = 同级内交换相邻两项的 `sort`（实现为：取出同级数组按 sort 排序后交换，再重写连续编号，避免 sort 值漂移）。

**审计日志**：每次写操作调用一次 `logAudit`：

| 操作 | action | beforeSummary / afterSummary 示例 |
| --- | --- | --- |
| 新增目录 | 新增目录 | — / 「目录 · 图标 folder」 |
| 新增页面菜单 | 新增菜单 | — / 「<目录名> / <页面名>」 |
| 编辑 | 编辑菜单 | 「原名称 / 原页面」/「新名称 / 新页面」 |
| 上移/下移 | 菜单排序 | 「与 <相邻项> 交换位置」 |
| 启用 | 启用菜单 | 停用 → 启用 |
| 停用 | 停用菜单 | 启用 → 停用 |

统一 `module: "菜单管理"`、`target: <菜单名>`、`resource: "menus.create"` 或 `"menus.edit"`。

**数据写回**：任何变更经 `onChange(next)` 一次性提交；同时更新该项 `updatedAt`（用 `nowStamp()`，从 `data/permissions` 导入）与 `updatedBy: "李航"`，并在表单/行上显示最近更新时间。

### 3.5 `src/App.tsx`

1. 删除模块级 `const navGroups = [...]` 硬编码（L70-153）与 `NavItem` interface（L61-68，类型移入 `menus.ts` 导出）；清理因此不再使用的 lucide 图标 import（仅删确认无他用的）。
2. `AppShell` 内新增：

```ts
const [menuItems, setMenuItems] = useState<MenuItem[]>(() => seedMenuItems());
const navGroups = useMemo(() => buildNavGroups(menuItems), [menuItems]);
```

（`MenuItem` / `seedMenuItems` / `buildNavGroups` / `NavItem` 从 `./data/menus` 导入。）
3. `visibleNavGroups` 的过滤逻辑**改造为同时吃启停**（这是唯一一处渲染规则改动）：

```text
叶子项显示 = (!enabled ? 隐藏 : (displayDisabled ? 显示但 disabled : visiblePages.has(id) ? 显示 : 隐藏))
目录项显示 = 目录 enabled 且过滤后的 children 中至少有一项「enabled 且（displayDisabled 或有 view 权限）」
```

即：`enabled=false` 的项直接不渲染（优先级最高）；`displayDisabled=true` 的项保持现状的置灰渲染（不校验权限）；其余沿用 `visiblePages` 过滤。原逻辑里 `item.disabled` / `c.disabled` 的分支由 `displayDisabled` 透传到 NavItem.disabled 承接。
4. `renderPage` 增加分支（放 `"audit-log"` 附近）：

```tsx
case "menus":
  return <MenuManage menuItems={menuItems} onChange={setMenuItems} addToast={addToast} />;
```

5. `pageLabels` 加 `"menus": "菜单管理"`；`pageSections` 加 `"menus"`，取值与 `roles` / `departments` / `audit-log` 现值一致。
6. `navigate()`、`expandedGroups`、`toggleGroup`、无权限拦截、角色切换重置工作台等逻辑一律不动（派生结构与其兼容）。

### 3.6 `src/pages/AuditLog.tsx`

`PERM_ACTION_COLOR` 增加菜单操作配色（未知动作当前回退灰色，这里补齐语义色）：

```ts
'新增目录': '#248A5A', '新增菜单': '#248A5A', '编辑菜单': '#C77A16',
'菜单排序': '#C77A16', '启用菜单': '#248A5A', '停用菜单': '#C73A3A',
```

## 4. 验收清单（完成后逐项自检并在回复中列明结果）

1. **侧栏还原**：三个登录角色（药厂销售部门 / 药厂合规部门 / 服务提供商）改造前后侧栏逐项一致——分区标题（业务管理 / 绩效管理 / 主数据 / 配置 & 分析）、工作台 badge、药厂业务开关置灰项全部保留。
2. 药厂销售部门登录：系统管理组内「角色管理」之后出现「菜单管理」，可进入；左侧树与侧栏结构一致。
3. 药厂合规部门、服务提供商登录：侧栏无「菜单管理」入口；角色预览 → 系统管理员（或平台运营）时可见该入口且页面只读（写按钮禁用）。
4. 新增目录（选图标）→ 树中出现；因暂无子菜单，侧栏不显示该目录（目录需有可显示子菜单才出现）。再新增页面菜单绑定「预算执行分析（analytics）」挂到该目录 → 药厂销售部门（analytics 有 view 权限）侧栏出现该入口；药厂合规部门（无权限）不出现——验证「菜单启用 ≠ 人人可见」。
5. 停用「医院拜访」菜单 → 销售与服务商登录侧栏该入口消失，启用后恢复；停用「系统管理」目录 → 整组消失，启用后子菜单按各自启停状态恢复。
6. 上移/下移：同级相邻交换、侧栏顺序即时更新；一级与二级不互相越级；首尾按钮置灰。
7. 校验拦截：同目录重名、页面被其他启用菜单占用（先给两个菜单绑同一页面再启用第二个）均 toast 报错且不落库。
8. 上述每个写操作后，操作日志页出现对应记录（模块=菜单管理，动作配色正确，before/after 摘要可读）。
9. 页面间跳转（工作台 → 各业务页 → 角色管理 → 返回）、无权限手输路由的拦截 toast + 审计、切换登录角色重置回工作台，全部不受影响。
10. `npm run build` 通过；8443 走查 console 零报错；`git status` 只含第 2 节列出的文件（新增 `menus.ts` / `MenuManage.tsx`，修改其余四个）；未运行 oxfmt；未 commit。
