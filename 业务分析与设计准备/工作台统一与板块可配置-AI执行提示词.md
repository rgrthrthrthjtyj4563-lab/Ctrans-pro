# 工作台统一与板块可配置 · AI 执行提示词

> 你是前端实施工程师，在仓库 `业务分析与设计准备/`（React 19 + Vite + TypeScript，纯内联样式，无 UI 框架）中完成「工作台首页统一与板块可配置」改造。**只允许改动本文第 3 节列出的文件**，完成后交人工审核，不要自行 commit。

## 0. 项目硬约束（先读）

1. 遵守 `UI_RULES.md`：优先复用 `src/components` 与 `src/pages/Dashboard.tsx` 内已有组件（`SectionCard`、`WorkbenchAIPanel`、`WorkbenchTodoPanel`、`WorkbenchTaskOverviewPanel`、`ComplianceQueuePanel`、`RepFilingAnalysisPanel`、`MetricCard`、`QueueTable`、`TrendPanel`、`RecentOperationsPanel`、`QuickActionsPanel`、`AIInsightCard` 等）；颜色、字号、圆角用 `src/index.css` 的 token；图标只用 `lucide-react`。
2. 验证方式：`npm run dev`（端口 8443）人工走查 + `npm run build` 通过（构建走 vite/esbuild）。
3. **禁止运行 `npm run format` / oxfmt**（会全库重排，无法 review）。
4. 仓库存在预存的 `tsc --noEmit` 语法报错（历史格式化残留），不要顺手修无关文件，以 `npm run build` 为准。
5. 代码风格跟随 `Dashboard.tsx` 现状（单引号 + 分号为主）。
6. **不引入任何新依赖**：拖拽用原生 HTML5 Drag and Drop（`draggable` / `onDragStart` / `onDragOver` / `onDrop`）实现，不装 dnd 库。
7. 本轮允许改动 `src/App.tsx` 与 `src/data/permissions.ts`，但**仅限第 3.5 节「砍掉两个页面」列出的改动点**（菜单分组、路由分支、标签映射、RESOURCE_PAGES 与合规角色授权行）；除此之外的一切（`src/context/` 下任何文件、其他页面、`Dashboard` 组件 props 签名 `({ navigate, role, addToast })`）不动。

## 1. 需求背景与已确认决策

领导反馈：药厂不应按部门拆分展示；工作台首页要做成可配置（勾选控制板块显隐 + 拖拽调整顺序）。

与需求方确认过的四项决策（不要偏离）：

| 决策点 | 结论 |
| --- | --- |
| 药厂合并程度 | **仅首页统一**：登录角色仍保留 药厂销售部门 / 药厂合规部门，菜单与页面权限、备案/准入的「销售经办、合规审批」分离全部不动；两个角色渲染**同一个药厂工作台** |
| 配置适用范围 | 药厂统一工作台 + 服务商「交付驾驶舱」都支持勾选 + 拖拽 |
| 配置交互形态 | **页内编辑模式**：右上「自定义板块」按钮进入编辑态，直接在页面上勾选和拖拽 |
| AI 分析板块 | 可被勾掉，**默认显示** |
| 砍掉两个页面 | **随检工作台（inspection）与证据链复审（evidence-chain）整体砍掉**：菜单、路由、页面文件、权限注册全部移除（详见 3.5 节） |

持久化与范围默认（已定，不必再问）：配置写入 localStorage，药厂两个登录角色共享一份（首页是同一个）；页面标题、页头（headline/subtitle/数据截至时间）、全局筛选条（周期/品种/区域/服务提供方多选）**不参与配置**。

## 2. 改动总览

| 文件 | 动作 |
| --- | --- |
| `src/hooks/useDashboardLayout.ts` | **新建**：板块布局读写 hook（localStorage + 校验 + 恢复默认） |
| `src/pages/Dashboard.tsx` | **主改**：板块注册表、统一药厂工作台、服务商网格化、页内编辑模式、拖拽 |
| `src/data/mockData.ts` | headline/subtitle 文案 + 合规数据块清理（KPI 卡替换、砍页引用清理、删 inspectionWorkbench 子块，见 3.3） |
| `src/types.ts` | `PageId` 联合类型删两页、`DashboardRoleData` 删 `inspectionWorkbench` 字段、`salesWorkbench` 注释同步 |
| `src/App.tsx` | **仅限砍页改动点**：navGroups「合规管理」分组、renderPage 两个 case 与 import、pageLabels/pageSections 对应键 |
| `src/data/permissions.ts` | **仅限砍页改动点**：RESOURCE_PAGES 删两页定义、role-pharma-compliance 的 pagePerms 删两行 |
| `src/pages/InspectionWorkbench.tsx`、`src/pages/EvidenceChainReview.tsx` | **删除文件** |

## 3. 逐文件规格

### 3.1 新建 `src/hooks/useDashboardLayout.ts`

```ts
export interface DashboardLayoutState {
  order: string[]   // 全量板块 id 的显示顺序（含隐藏板块）
  hidden: string[]  // 隐藏的板块 id
}

export function useDashboardLayout(
  boardKey: 'pharma' | 'provider',
  sectionIds: string[],                                  // 该工作台的全量板块 id（注册表顺序即默认顺序）
  defaultHidden: string[],                              // 默认隐藏的板块 id
): {
  order: string[]
  hidden: string[]
  toggleVisible: (id: string) => void                   // 显示/隐藏切换
  moveSection: (fromId: string, toId: string) => void   // 把 fromId 移到 toId 的位置（拖拽落点）
  resetLayout: () => void                               // 恢复默认（removeItem + 重置 state）
}
```

- localStorage key：`beiyi.dashboardLayout.${boardKey}`（pharma 一份、provider 一份；药厂销售/合规两个登录角色共用 pharma 这份）。
- 读取时做防御：JSON 解析失败/非对象 → 用默认；`order` 中未知 id 剔除、注册表新增而 `order` 缺失的 id 追加到尾部；`hidden` 只保留已知 id。
- 写入：每次 `toggleVisible` / `moveSection` / `resetLayout` 后同步写 localStorage（`try-catch` 包裹，隐私模式忽略异常，参照 `DisplayPreferenceContext.tsx` 的写法）。
- 板块 id 一经定义不可改名（localStorage 依赖其稳定性）。

### 3.2 `src/pages/Dashboard.tsx`（主改）

#### 3.2.1 板块注册表

在文件内定义（不导出）：

```ts
interface DashboardSectionDef {
  id: string
  title: string                     // 编辑态占位卡与提示用
  category: '销售' | '合规' | '通用'  // 编辑态卡片右上角小标签
  span: 1 | 2                       // 2 = 整行，1 = 单列
  defaultVisible: boolean
  render: () => ReactNode           // 渲染现有板块组件
}
```

渲染结构：筛选条之下用一个两列网格，`gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)'`，`gap` 沿用现有区块间距；按 `order` 顺序渲染 `visible` 的板块，`span=2` 的设 `gridColumn: '1 / -1'`，其余自动流动。每个板块外层包一个统一的容器 div（编辑态加边框/把手，见 3.2.4）。

#### 3.2.2 统一药厂工作台 `PharmaWorkbenchDashboard`

- 以现有 `SalesWorkbenchDashboard`（L1074 起）为骨架改造，**两个药厂登录角色都走此分支**：`Dashboard` 组件的三分支（L1696-1730）改为两分支——`role === '服务提供商'` 走服务商，其余（销售/合规）走统一工作台。
- 页头：headline 改为「药厂运营工作台」，subtitle 表达兼顾销售运营与合规风险双视角（如「覆盖销售运营与合规风险的一体化看板」）；数据截至时间、周期/品种/区域/服务提供方全局筛选条照旧保留，不参与配置。
- 数据获取：直接取 `getRoleDashboardData('药厂销售部门')`（salesWorkbench 等）与 `getRoleDashboardData('药厂合规部门')`（metrics/queue/repFilingAnalysis/distribution/spotlight）两份现有数据，不合并结构；合规数据块中 `inspectionWorkbench` 子对象随页面砍掉一并删除（见 3.3、3.5）。
- 原 `ComplianceAdminDashboard`（L1544）与 `SalesWorkbenchDashboard` 的"壳"删除，其内部板块组件（`ComplianceQueuePanel`、`RepFilingAnalysisPanel`、MetricCard 组等）迁入注册表复用，不要重写。

**药厂板块池（10 个，注册顺序即默认顺序）**：

| id | 板块 | 复用组件/数据 | category | span | 默认 |
| --- | --- | --- | --- | --- | --- |
| `summary` | 运营摘要 | WorkbenchSummaryChip 三枚（执行中/异常/待处理，salesWorkbench） | 销售 | 2 | 显示 |
| `ai` | AI 分析 | WorkbenchAIPanel 五段式（salesWorkbench.ai） | 销售 | 1 | 显示 |
| `quick-actions` | 常用入口 | 现有「常用入口」区块（salesWorkbench.quickActions） | 销售 | 1 | 显示 |
| `todos` | 我的待办 | WorkbenchTodoPanel（salesWorkbench.todos） | 销售 | 2 | 显示 |
| `task-overview` | 任务交付概览 | WorkbenchTaskOverviewPanel（salesWorkbench.tasks） | 销售 | 2 | 显示 |
| `compliance-kpi` | 合规对象监测 | MetricCard ×4（合规 metrics 调整后：备案异常 / 准入待审 / 拜访待审核 / 拜访已驳回，见 3.3） | 合规 | 2 | 显示 |
| `compliance-queue` | 优先处理队列 | ComplianceQueuePanel（合规 queue） | 合规 | 1 | 显示 |
| `filing-analysis` | 备案异常分析 | RepFilingAnalysisPanel（repFilingAnalysis） | 合规 | 2 | 隐藏 |
| `distribution` | 对象维度分布 | 现有 distribution 面板（合规 distribution） | 合规 | 2 | 隐藏 |
| `spotlight` | 重点对象 | 现有 spotlight 面板（合规 spotlight） | 合规 | 2 | 隐藏 |

注意：运营摘要 chip 的锚点滚动（点击滚动到对应板块）保留；目标板块处于隐藏状态时点击不滚动也不报错（做存在性判断）。

#### 3.2.3 服务商工作台网格化

- 现通用布局（L1732-1864）改为同一套注册表 + 网格机制；hero 页头（角色 Tag + headline「服务商交付驾驶舱」 + subtitle + AI 呈现规范卡）保留不参与配置。

**服务商板块池（9 个）**：

| id | 板块 | 复用组件/数据 | category | span | 默认 |
| --- | --- | --- | --- | --- | --- |
| `metrics` | 承接指标 | metrics 指标卡组 | 通用 | 2 | 显示 |
| `queue` | 优先处理队列 | QueueTable | 通用 | 1 | 显示 |
| `ai` | AI 洞察 | AIInsightCard 列表（insights） | 通用 | 1 | 显示 |
| `trend` | 任务/工作量趋势 | TrendPanel（trend） | 通用 | 1 | 显示 |
| `ranking` | 工作组排名 | ranking 面板 | 通用 | 1 | 显示 |
| `quick-actions` | 快捷入口 | QuickActionsPanel | 通用 | 1 | 显示 |
| `spotlight` | 初审视角 | spotlight 面板 | 通用 | 2 | 显示 |
| `recent-operations` | 最近操作 | RecentOperationsPanel | 通用 | 1 | 隐藏 |
| `audit-tip` | 审计提示 | 现有静态提示卡（L1852 附近） | 通用 | 1 | 隐藏 |

#### 3.2.4 页内编辑模式

- **入口**：工作台页头右侧加「自定义板块」按钮（`LayoutGrid` 图标 + outline/sm，与顶栏按钮视觉一致）。进入编辑态后该按钮变为 primary「完成」。
- **编辑态全局**：页面顶部出现一条浅色提示条「拖拽调整板块顺序 · 勾选控制板块显示」，右侧放「恢复默认」（outline/sm）。
- **板块卡片编辑态**：每个板块（含隐藏占位）容器加虚线边框（`var(--color-border)`）+ 左上角 `GripVertical` 拖拽把手 + 勾选框（label「显示」）+ 右上角分类小标签（销售/合规/通用，`var(--fs-11)` 弱色底）。
- **隐藏板块**：编辑态渲染为半透明（opacity 0.45）虚线占位卡，仅显示标题 + 分类标签 + 勾选框，不渲染内容；非编辑态完全不渲染。这样取消勾选后仍能在编辑态找到并勾回。
- 退出：点「完成」或按 Esc（编辑态监听 keydown）；勾选与拖拽**实时保存** localStorage，无需再点保存。
- 编辑态内板块内容交互应禁用（容器 `pointerEvents` 处理勾选框/把手以外的点击即可，简单实现）。

#### 3.2.5 拖拽实现

- 编辑态下每个板块容器 `draggable`，`onDragStart` 记录源板块 id（`e.dataTransfer.setData('text/plain', id)` + `effectAllowed: 'move'`）。
- `onDragOver`（容器上）：`e.preventDefault()`，按指针位于容器上/下半区决定插入位置，在对应边缘显示 2px 品牌色指示线（用 state 控制一个临时 class/样式）。
- `onDrop`：调用 `moveSection(fromId, toId)`（移动到目标板块之前；若指针在下半区则移到其后）。
- `onDragEnd` 清除指示线 state。
- `prefers-reduced-motion: reduce` 时去掉指示线过渡动画（`transition: none`），功能保留。
- 拖拽把手与整卡均可发起拖拽；非编辑态不设 `draggable`。

### 3.3 `src/data/mockData.ts`

- `salesWorkbench.headline`（约 L2853）「销售运营工作台」改为「药厂运营工作台」，subtitle 相应改为双视角表述。
- 合规数据块（`roleDashboardData['药厂合规部门']`，约 L3212 起）清理：
  1. `metrics` 中「待随检任务」「证据链 AI 存疑」两张卡**替换**为「拜访待审核」「拜访已驳回」（数值为静态 mock，与拜访页演示量级相当；原「备案异常」「准入待审」两卡不动）；
  2. `queue` 数组与 `quickActions` 中引用 `inspection` / `evidence-chain` 的条目删除或替换为 备案 / 准入 / 拜访 类条目；
  3. 删除 `inspectionWorkbench` 子数据块（页面已砍）。
- `salesWorkbench` 的 `todos` / `quickActions` / `tasks` 中如有引用 `inspection` / `evidence-chain` 的条目，一并清理。
- 除上述外不新增、不改其他数据。

### 3.4 `src/types.ts`

- `PageId` 联合类型删除 `"inspection"` 与 `"evidence-chain"` 两个成员。
- `DashboardRoleData` 删除 `inspectionWorkbench?: DashboardInspectionWorkbench` 字段（及其类型别名的定义，若无他处引用）。
- `salesWorkbench` 字段注释「药厂销售部门 P1 工作台数据」改为「药厂统一工作台数据（销售/合规两登录角色共用）」。

### 3.5 砍掉「随检工作台」与「证据链复审」两个页面

1. `src/App.tsx`：
   - `navGroups` 中「合规管理」分组（仅含 inspection / evidence-chain 两项）**整组删除**——砍掉后该分组自然消失；
   - `renderPage` 删除 `case "inspection"` 与 `case "evidence-chain"` 分支及对应 import；
   - `pageLabels` / `pageSections` 删除这两个键。
2. `src/data/permissions.ts`：
   - `RESOURCE_PAGES` 删除 `inspection` 与 `evidence-chain` 两个页面定义；
   - `role-pharma-compliance` 的 `pagePerms` 删除这两行授权；
   - `seedPermAudit` / `seedChangeLogs` 等历史演示数据中的相关**文案**可保留（历史审计记录语义），不强制清理。
3. 删除文件：`src/pages/InspectionWorkbench.tsx`、`src/pages/EvidenceChainReview.tsx`。
4. 收尾自检（必须执行并把结果写进回复）：
   ```bash
   grep -rn "inspection\|evidence-chain\|InspectionWorkbench\|EvidenceChainReview" src/
   ```
   命中只允许出现在 permissions.ts 的历史审计演示文案里；不得残留任何 import、路由、菜单、类型或数据引用。

## 4. 验收清单（完成后逐项自检并在回复中列明结果）

1. 药厂销售部门、药厂合规部门登录：首页均为「药厂运营工作台」，板块完全一致；在销售登录下调整的配置，切到合规登录后同样生效（共享 pharma 布局）。
2. 两个药厂登录角色的**侧边栏菜单保持原有差异**（销售有预算/任务/价目等，合规有备案/准入等）——证明只动了首页、没动权限。
3. 服务商登录：「服务商交付驾驶舱」以可配置网格呈现，默认显示的 7 个板块内容与原布局等价，页头 hero 保留。
4. 点「自定义板块」进入编辑态：提示条、勾选框、拖拽把手、分类标签、半透明隐藏占位卡齐全；「完成」「恢复默认」可用；Esc 可退出。
5. 取消勾选任一板块 → 完成 → 板块消失；再次进入编辑态可从占位卡勾选恢复。
6. 拖拽重排顺序 → 刷新页面 → 顺序保持（localStorage 生效）。
7. AI 分析板块默认显示、可被勾掉；勾掉后刷新仍为隐藏。
8. 「恢复默认」后，板块回到注册表默认顺序与默认显隐。
9. 全局筛选条功能正常（周期/品种/区域/服务提供方切换仍驱动任务交付概览等板块）；运营摘要 chip 锚点在目标板块隐藏时不报错不滚动。
10. 三个登录角色的侧边栏均**不再出现**「合规管理」分组及随检工作台/证据链复审入口；角色管理的权限矩阵中无这两页；3.5 节的 grep 自检无残留引用。
11. 「合规对象监测」板块显示 4 张卡：备案异常 / 准入待审 / 拜访待审核 / 拜访已驳回。
12. `npm run build` 通过；三个登录角色走查 console 零报错。
13. `git status` 确认只改了第 2 节列出的文件（含删除的两个页面文件）；未运行 oxfmt；未 commit。
