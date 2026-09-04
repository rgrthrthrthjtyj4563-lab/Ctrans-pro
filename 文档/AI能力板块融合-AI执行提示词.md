# AI 能力板块融合 AI 执行提示词（原型落地）

> 用途：投喂给 AI 编码工具（Codex / Cursor / Claude 等），把 `Start Execution/` 里已实现的 Pharma AI Builder 工作台，按已确认方案融合进 `业务分析与设计准备/` 主原型。
> 提示词自包含，不依赖外部文档、不要求执行 AI 重新调研。设计依据：`Start Execution` 实现、`pharma-ai-builder-figma-prompt.md`（1141 行）、主项目壳层与权限单一事实源。
> **本文只是指令。执行 AI 按正文改代码；本文件本身不要改。禁止改动 `Start Execution/`。**

---

## 提示词正文（从此处开始复制）

你是一位资深前端架构师 + B 端产品工程师。本项目是 React 19 + Vite + TypeScript + Tailwind CSS v4 + lucide-react 的高保真原型。你的唯一目标：在 `业务分析与设计准备/` 内落地「AI 能力」板块，使默认登录角色的侧栏出现独立分组，并跑通完整版三场景 Agent 工作台。

**工作目录（所有相对路径以此为准）：**

```text
/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备
```

**仓库根目录（只读参考与本文档所在处）：**

```text
/Users/lee/Developer/CompanyProjects/贝医项目/重构
```

先写设计文档，再改代码，最后构建验证。不要边探索边改。

---

### 0. 角色与目标 · 三个已确认决策（不得再议）

把 `Start Execution` 的 Agent 工作台，作为主项目的一个业务板块融合进去，而不是另起一个独立站点，也不是替换现有壳层。

三个决策已经拍板，执行时按此落地，不要重新提问：

| # | 决策 | 落地口径 |
|---|---|---|
| D1 | **独立「AI 能力」分组** | 侧栏新增一级分组 `AI 能力`，与「业务管理 / 合规管理 / 主数据」同级。不要塞进「系统管理」或「规则配置」。分组下 4 个页面：`AI 工作台`、`页面构建`、`规则中心`、`版本记录`。 |
| D2 | **统一到主项目品牌 + 新 SVG LOGO** | 废弃 Start Execution 的「华 / Pharma / 酸绿 #d8ff78 / Manrope / DM Mono」。全站侧栏 LOGO、favicon、AI 工作台内品牌全部改为主项目「药合作系统」+ 新 SVG 徽标，令牌走 `@theme` 的 `#176B5B`。 |
| D3 | **完整版三场景** | AI 工作台必须可走通三条演示剧本：①调整服务商任务权限；②配置企业业务规则；③修改一个页面。每条都要经过 空状态 → 理解 → 读取 → 方案确认 → 执行 → 校验 → 人工发布。 |

产品原则（与首页一致，必须写进工作台页脚或发布弹窗）：

> **AI 辅助不裁决。** Agent 只提出方案、展示 Diff / 预览 / 校验，不自动改单据状态、不绕过人工确认、不直接写生产。页面上保留「AI 仅供参考，所有操作需人工确认」。

---

### 1. 明确引用的文件路径（全部真实绝对路径）

#### 1.1 必读参考（只读，禁止修改）

| 文件 | 说明 |
|---|---|
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/Start Execution/src/App.tsx` | 79 行。完整交互参考：`Phase` 状态机、三栏壳、`AgentProcess` / `Inspector` / `Composer` / `PublishModal` / `EmptyState` / `Conversation`。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/Start Execution/src/index.css` | 11 行（单行压缩）。动效、三栏网格、时间线、Inspector、Composer、发布弹窗的视觉参考。色值不要原样搬；只借结构与动效。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/Start Execution/src/imports/pasted_text/pharma-ai-builder-figma-prompt.md` | **1141 行**设计要求。必须落实：三栏 Workspace、Agent Timeline、Tool Call、Composer 三模式、Inspector 四 Tab、Rule Card、校验、发布审核、空状态快捷任务；红线「不要炫酷蓝紫 AI 光效 / 不要满屏 Toast」。 |

#### 1.2 必读现状（主项目，先读再改）

| 文件 | 读什么 |
|---|---|
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/App.tsx` | 917 行。`navGroups`（L48–117）、`pageLabels`（L119–146）、`pageSections`（L148–174）、`renderPage`（L447–472）、`visibleNavGroups`（L484–499）、侧栏 LOGO（L526–556）、顶栏面包屑与「百益健康科技」标签（L774–897）、`main` 内容区（L899–902）、默认角色 `药厂销售部门`（L377）、角色切换会回到 dashboard（L708–713）。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/types.ts` | `PageId` 联合类型在 L485–511。货币铁律：人民币、全角 `￥`（U+FFE5）。登录角色仅三项。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/data/permissions.ts` | `RESOURCE_PAGES`（L165–183）、`PRESET_ROLES`（L233–388）、`LOGIN_ROLE_MAP`（L485–489）、`ALL_PAGES` 由 `RESOURCE_PAGES` 派生故「平台运营」会自动拿到新页。`TENANT = '百益健康科技'`。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/index.css` | `@theme` 令牌 L6–65。品牌色 `#176B5B` / `#0f5044` / `#E8F4F1`；侧栏 `#111827`；画布 `#F5F7F8`。字体 Inter + Noto Sans SC + JetBrains Mono。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/data/mockData.ts` | `DEMO_HOLDER = '百益健康科技'`，`DEMO_PROVIDER = '智联科技有限公司'`。种子任务 `TK-2026-0001` 名称形如 `阿托伐他汀钙片(20mg)_百益健康科技`。 |
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/src/context/PermissionContext.tsx` | `visiblePages` 由 `effectiveRole.pagePerms` 派生（L124–130）。无 `view` 的页面会被 `App.tsx` 菜单过滤；越权 `navigate` 会 Toast + 写审计。**本文件不必改。** |

#### 1.3 需修改

| 文件 | 改什么 |
|---|---|
| `src/App.tsx` | 注册 4 个 PageId 的菜单、标签、面包屑、`renderPage`；侧栏 LOGO 换成 `BrandLogo`；AI 页让 `main` 撑满高度。 |
| `src/types.ts` | `PageId` 增加 4 个字面量。 |
| `src/data/permissions.ts` | `RESOURCE_PAGES` 增加 4 页；给指定预置角色授权；**不要**给服务商/组长/专员。 |
| `src/index.css` | `@theme` 增加一组 AI 工作台令牌（仍落在品牌绿，不新增紫/蓝光）。 |
| `index.html` | 标题与 favicon 槽位。 |
| `.figma/make/site.json` | Vite 插件会把 `<!-- figma:title -->` 替换成这里的 `title`（缺省为 `Figma Make App`）。必须写 `"title": "药合作系统"`、`"icons": { "icon": "/favicon.svg" }`，否则 tab 标题不会变。 |

#### 1.4 需新增（路径锁定，不要改名、不要多文件）

| 路径 | 职责 |
|---|---|
| `/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/AI能力板块融合-设计方案.md` | **第一步先写完**再动代码。 |
| `src/components/Brand.tsx` | `BrandMark` + `BrandLogo`。 |
| `public/favicon.svg` | 与 BrandMark 同源的 SVG 图标。当前仓库没有 `public/`，自行创建。 |
| `src/pages/ai/AIWorkbench.tsx` | 工作台主页面；并在**同一文件**导出 `AIPages` / `AIRules` / `AIVersions` 三个列表页（禁止再拆第 9 个 tsx）。 |
| `src/pages/ai/AgentStream.tsx` | 中间栏：空状态 / 用户请求 / Agent 时间线 / 推理摘要 / 工具调用 / 待确认卡片。 |
| `src/pages/ai/Inspector.tsx` | 右侧：预览 / 变更 / 配置 / 校验 四 Tab。 |
| `src/pages/ai/Composer.tsx` | 底栏：询问 / 规划 / 构建 三模式 + 发送。 |
| `src/pages/ai/RuleCard.tsx` | IF / AND / THEN 规则卡片（场景 ② 与规则中心复用）。 |
| `src/pages/ai/PublishModal.tsx` | 居中发布审核弹窗，复用或对齐现有 `src/components/Modal.tsx`。 |
| `src/pages/ai/scenarios.ts` | 三场景的全部文案、时间线、变更、预览、校验数据。 |
| `src/pages/ai/aiWorkbench.css` | 仅放动效（spin / timeline / composer 阴影），颜色走 CSS 变量。 |

`src/pages/ai/` 目录最终就是这 8 个文件，多一个都不允许。

---

### 2. 现状关键事实清单（不要再 grep 验证，按此编码）

#### 2.1 技术栈与惯例

- React 19 + Vite 8 + TypeScript 5.7（`strict: true`，`noEmit: true`）+ Tailwind v4（`@import 'tailwindcss'` + `@theme`）+ `lucide-react`。
- **无路由**（`useState<PageId>` 切页），**无 antd / 无 MUI / 无 Radix**。
- 页面几乎全是 **内联 `style={{}}`**，颜色允许写死令牌值或 `var(--color-brand)`；不要新开一套 className 设计体系去复刻 Start Execution 的 Manrope/DM Mono。
- 包管理是 **pnpm**。`package.json` 的 `build` 只是 `vite build`；类型检查要单独跑 `pnpm exec tsc --noEmit`。
- 开发服务器：`pnpm dev`，`vite.config.ts` 端口 **8443**（`strictPort: true`）。
- **禁止新增 npm 依赖。** 图标只用已有 `lucide-react`。
- 弹窗必须居中（现有 `Modal.tsx`，`z-index: 1000`，遮罩 `rgba(0,0,0,0.35)`）。Toast 是右上角卡片（`Toast.tsx`，4 秒自动关），不是满屏。
- 金额展示走全角 `￥`。AI 场景里凡是钱，一律 `￥36,000` 这种写法，禁止 `$` / `¥`。

#### 2.2 菜单与权限如何过滤

1. `navGroups` 是静态结构（含 `disabled` 占位页）。
2. `visibleNavGroups` 按 `visiblePages.has(id)` 过滤；一个分组过滤后 `items.length === 0` 则整组消失。
3. `visiblePages` = 当前生效角色 `pagePerms` 里「含 view，或 actions 非空」的页面 id。
4. 只有写进 `RESOURCE_PAGES` 的页面才受控。受控页无权访问时：`navigate` 被拦截、写权限审计、Toast「无权访问该页面」；若人还停在该页，`useEffect` 会打回 `dashboard`。
5. `dashboard` 是特例（受控但始终可进）。新 AI 页必须进 `RESOURCE_PAGES`，否则切换角色无法隐藏。
6. 登录三角色映射：

```ts
药厂销售部门 → role-pharma-sales      // 默认
药厂合规部门 → role-pharma-compliance
服务提供商   → role-provider-admin    // 不授 AI 权限
```

7. `role-platform-ops` 使用 `perms(ALL_PAGES)`，新页加入 `RESOURCE_PAGES` 后自动可见。其他预置角色必须**显式**写入 `pagePerms`。
8. `seedCustomRoles` 里「药厂区域销售经理」在模块加载时浅拷贝销售管理员的 `pagePerms`。销售管理员加上 AI 页后，该定制角色会一并带上——保留，不要再单独删。

#### 2.3 品牌令牌（主项目，必须沿用）

```
--color-brand:        #176B5B
--color-brand-hover:  #0f5044
--color-brand-subtle: #E8F4F1
--color-brand-on:     #ffffff
--color-success-fg:   #248A5A    --color-success-bg: #E6F5ED
--color-warning-fg:   #C77A16    --color-warning-bg: #FEF3E2
--color-danger-fg:    #C73A3A    --color-danger-bg:  #FEECEC
--color-canvas:       #F5F7F8
--color-surface:      #FFFFFF
--color-border:       #E5E7EB
--color-sidebar:      #111827
--color-sidebar-text: #D1D5DB
--color-text-1:       #1F2937
--color-text-2:       #667085
--font-sans: Inter, Noto Sans SC
--font-mono: JetBrains Mono
```

侧栏现状 LOGO（必须替换）：32×32 圆角方、`linear-gradient(135deg, #176B5B, #248A5A)` + lucide `Activity` 白图标；右侧文案「药合作系统」/ 副标「AI 运营控制台 V3」。顶栏企业名已经是「百益健康科技」。

Start Execution 品牌（禁止搬进主项目）：`brand-mark` 深底 `#172e2b` + 酸绿字 `#d8ff78`、字「华」、产品名 `Pharma` / `PHARMA AI BUILDER`、字体 Manrope + DM Mono。

本次要往 `@theme` 追加的 AI 令牌（名称锁定）：

```css
--color-ai-rail:       #F3F6F4;
--color-ai-stream:     #FFFFFF;
--color-ai-inspector:  #FAFBFA;
--color-ai-ink:        #1B322D;
--color-ai-muted:      #6D7972;
--color-ai-line:       #E4E9E2;
--color-ai-chip:       #E8F4F1;
--color-ai-warning:    #C77A16;
--color-ai-warning-bg: #FEF3E2;
```

禁止新增紫、电蓝、霓虹、大渐变光晕。

#### 2.4 现有 AI 原则文案（保持同一句话）

- 首页合规工作台：`AI 仅供参考，操作需人工确认`（`Dashboard.tsx`）。
- `AIInsightCard`：每条含结论 / 依据 / 数据范围 / 置信度 / 建议动作 / 「人工确认：…」。
- 首页提示词铁律：**AI 辅助不裁决**，不自动改单据。

AI 工作台必须沿用同一语义，不要另造「AI 已自动生效」「一键写入生产」之类文案。发布后只在本工作台内存里标记「已发布」，并往「版本记录」插入一条演示版本；**不得**真的修改 `TaskDataContext` 或 `permissions.ts` 运行时矩阵。

#### 2.5 壳层几何

- 全局：左侧栏 240 / 折叠 60，顶栏高 52，内容区 `flex:1; overflow:auto`。
- AI 工作台进入后，把对应 `main` 改成 `overflow:hidden`，子页 `height:100%`，内部自己滚。不要让时间线把整站撑出双滚动条。
- 工作台**内三栏**（在内容区里，不替换全局侧栏）：

```
200px 任务上下文轨 | 1fr Agent Stream | minmax(340px, 0.9fr) Inspector
```

参考设计稿 1440×1024、左 240 / 中 ~560 / 右其余——这里全局侧栏已经占了 240，所以内左轨收成 200。

#### 2.6 Start Execution 状态机（照搬语义，不要照搬 CSS）

```ts
type Phase = 'empty' | 'chat' | 'planning' | 'executing' | 'complete';
```

| Phase | 行为 |
|---|---|
| `empty` | 中央空状态 + 快捷任务；Composer 可输入。 |
| `chat` | 立刻展示用户气泡与 Agent 开场白；**650ms** 后进入 `planning`。 |
| `planning` | 时间线走到「生成变更方案」；出现「等待人工确认」卡片；Composer 锁定。 |
| `executing` | 点「确认并开始执行」后进入；时间线最后一步转圈；**1250ms** 后 `complete`，Inspector 切到「校验」。 |
| `complete` | 「发布」按钮亮起；点开 `PublishModal`；确认后 `published=true`，Toast 成功，版本记录多一条。 |

「停止」把 phase 打回 `empty`（或 `planning` 时取消执行）。「新建任务」重置全部。

Composer 三模式：`询问`（只出分析，不出现「确认并开始执行」）、`规划`（停在 planning）、`构建`（默认可执行）。空状态点快捷任务 = 填入该场景 prompt 并以构建模式启动。

---

### 3. 分步任务指令（按序，禁止跳步）

#### 任务 ① 先写设计方案文档

新建：

`/Users/lee/Developer/CompanyProjects/贝医项目/重构/业务分析与设计准备/AI能力板块融合-设计方案.md`

至少包含：

1. 一句话目标与三个已确认决策。
2. 信息架构：`AI 能力` 分组 4 页、与现有「系统管理 / 角色权限」的边界（AI 工作台演示改配置，不替代 `RoleManage`）。
3. 壳层策略：保留全局侧栏 + 顶栏；工作台用内三栏。
4. 品牌：SVG 结构说明、替换点（侧栏、favicon、工作台空状态、预览窗品牌条）。
5. 三场景剧本摘要（与 `scenarios.ts` 一致）。
6. 权限矩阵（见 3.3 表）。
7. 文件清单（与本文 1.3 / 1.4 一致）。
8. 不做什么。

写完再改代码。

#### 任务 ② 品牌统一

`src/components/Brand.tsx` 导出：

```ts
export function BrandMark(props: { size?: number; title?: string }): JSX.Element
export function BrandLogo(props: { collapsed?: boolean; subtitle?: string }): JSX.Element
```

徽标规范（不要写字「华」，不要酸绿）：

- 画布 32×32（`size` 可缩放），圆角 8。
- 底色 `#176B5B`。
- 白色几何：一枚横置胶囊（药）与一枚竖置小胶囊交叉成「十」，中心一个 4px 实心圆（节点）。线宽 3，圆角端。
- 在 16×16 favicon 下仍然可辨。

`BrandLogo`：左侧 `BrandMark` 32，右侧主标题「药合作系统」（13px / 700 / `#F9FAFB`），副标题默认「AI 运营控制台 V3」（10px / `#4ADE80`）。`collapsed` 时只显示 Mark。

替换点：

1. `App.tsx` 侧栏 LOGO 整块（L526–556）换成 `<BrandLogo collapsed={sidebarCollapsed} />`，删掉 `Activity` 图标。
2. `public/favicon.svg`：同一 Mark，`xmlns` 完整，32×32 viewBox。
3. `index.html`：`lang` 槽填 `zh-CN`；title 槽填 `药合作系统`。
4. `.figma/make/site.json` 增加 `"title": "药合作系统"` 与 `"icons": { "icon": "/favicon.svg" }`。

工作台空状态眉题改为「药合作系统 · AI 工作台」，Agent 头像用 `BrandMark size={25}`，不要写 `PHARMA AGENT`。

#### 任务 ③ 菜单入口 + 权限注册

`PageId` 追加（名称锁定）：

```ts
| 'ai-workbench'
| 'ai-pages'
| 'ai-rules'
| 'ai-versions'
```

`navGroups` 在「工作台」分组之后、「业务管理」之前插入：

```ts
{
  label: 'AI 能力',
  items: [
    { id: 'ai-workbench', label: 'AI 工作台', icon: Sparkles },
    { id: 'ai-pages',     label: '页面构建', icon: PanelsTopLeft },
    { id: 'ai-rules',     label: '规则中心', icon: Scale },
    { id: 'ai-versions',  label: '版本记录', icon: History },
  ],
}
```

`pageLabels` / `pageSections`：四个页面的 section 都是 `'AI 能力'`。

`renderPage`：

```ts
case 'ai-workbench': return <AIWorkbench addToast={addToast} />;
case 'ai-pages':     return <AIPages onOpen={id => {/* 切到工作台并载入对应场景 */}} />;
case 'ai-rules':     return <AIRules onOpen={...} />;
case 'ai-versions':  return <AIVersions />;
```

列表页点「在工作台打开」必须 `setCurrentPage('ai-workbench')` 并带上场景 key。可用模块级回调、props 提升到 `AppShell` 的 `useState<ScenarioId>`，或 `sessionStorage`——选一种，不要引入路由库。

`RESOURCE_PAGES` 追加：

```ts
{ id: 'ai-workbench', module: 'AI 能力', name: 'AI 工作台', description: '用自然语言让 Agent 读取系统并生成可审阅变更', actions: acts('ai-workbench', ['view', 'submit']) },
{ id: 'ai-pages',     module: 'AI 能力', name: '页面构建', description: '查看 Agent 可修改的页面并打开工作台', actions: acts('ai-pages', ['view']) },
{ id: 'ai-rules',     module: 'AI 能力', name: '规则中心', description: '查看业务规则草案并打开工作台', actions: acts('ai-rules', ['view', 'edit']) },
{ id: 'ai-versions',  module: 'AI 能力', name: '版本记录', description: '查看已发布的 Agent 变更版本', actions: acts('ai-versions', ['view']) },
```

授权（写入各角色 `pagePerms`）：

| 角色 id | 登录项 | ai-workbench | ai-pages | ai-rules | ai-versions |
|---|---|---|---|---|---|
| `role-platform-ops` | 无 | 随 ALL_PAGES | 随 ALL_PAGES | 随 ALL_PAGES | 随 ALL_PAGES |
| `role-sys-admin` | 无 | view | view | view | view |
| `role-pharma-sales` | 药厂销售部门（默认） | view, submit | view | view | view |
| `role-pharma-compliance` | 药厂合规部门 | view, submit | view | view, edit | view |
| `role-provider-admin` | **服务提供商** | **不授** | **不授** | **不授** | **不授** |
| `role-account-admin` / `role-group-lead` / `role-specialist` | 无 | 不授 | 不授 | 不授 | 不授 |

切到「服务提供商」后，「AI 能力」整组必须消失；若当时停在 AI 页，现有 `useEffect` 会送回工作台。不要为服务商做灰置入口。

#### 任务 ④ AI 工作台三栏页面（完整版三场景）

**文件分工**见 1.4。交互以 Start Execution `App.tsx` 为行为金标准，文案以本文第 4 节对照表替换。

必须实现的组件与行为：

1. **内左轨（写在 `AIWorkbench.tsx`）**
   - 「新建任务」按钮，重置 phase。
   - 四个导航项仅作当前页提示（工作台高亮），不要再做一套全局菜单。
   - 「最近任务」三条：对应三场景标题；当前场景高亮。
   - 底部企业：`百益健康科技` + 绿点「演示环境」（不要写 Development 英文，不要写「华东示例药企」）。

2. **AgentStream**
   - 空状态：BrandMark、眉题、主标题「想构建什么？」、五个快捷任务按钮（见场景表）。
   - 非空：用户行（头像字「李」，操作人李航）+ Agent 行（BrandMark）+ 时间线 + 推理摘要 + 工具调用列表 + planning 时的确认卡。
   - 时间线每步可展开；executing 当前步 spinner；complete 全部打勾。
   - 工具调用默认折叠，点击展开「作用对象 / 结果摘要」，不要甩 JSON。

3. **Inspector** Tabs：`预览` `变更` `配置` `校验`。变更 Tab 显示条数角标。预览是「缩小的药合作系统页面」而不是空白。校验有通过 / 等待 / 需关注三种行。complete 前「发布」禁用，complete 后主色可点。

4. **Composer**
   - 询问 / 规划 / 构建。
   - `⌘↵` 发送。`empty` 之外禁用输入（与参考实现一致）。
   - placeholder：`告诉 AI 你希望如何修改当前系统…`

5. **RuleCard**
   - IF / AND / THEN 芯片，底部「测试规则」「保存草稿」仅 Toast，不真写。
   - 场景 ② 的 Inspector 预览区必须用它。

6. **PublishModal**
   - 用现有 `Modal`（居中）。标题「发布变更」。三项统计 + 「演示环境 · 无严重风险」+ 取消 / 确认发布。
   - 确认后：关弹窗、`published=true`、`addToast({ type:'success', title:'已发布到演示环境', description:'版本已写入版本记录，可回看不可回滚生产。' })`。
   - 禁止满屏成功页替换整个 App。

7. **`scenarios.ts` 三场景（key 锁定）**

| key | 快捷任务按钮 | 用户 prompt（发送内容） | 预览页 |
|---|---|---|---|
| `perm-vendor-budget` | 调整角色权限 | 服务提供商只能看到自己承接的任务，同时不能看到计划总金额。 | 任务详情 · `TK-2026-0001` 阿托伐他汀钙片(20mg)_百益健康科技；服务商「智联科技有限公司」；「计划总金额」字段在预览中模糊。 |
| `rule-amount-approval` | 配置企业业务规则 | 市场推广服务且计划金额大于 ￥10,000 时，必须增加药厂合规部门审批。 | RuleCard：IF 服务类型 = 市场推广服务 AND 计划金额 > ￥10,000 THEN 增加审批 = 药厂合规部门。 |
| `page-add-field` | 修改一个页面 | 在任务详情页增加「剩余可结算金额」字段，并对服务提供商角色可见。 | 任务详情新增一行「剩余可结算金额 ￥84,000」。 |

另两个快捷按钮「创建新的页面」「检查当前配置」可以映射到 `page-add-field` / `perm-vendor-budget` 的只读询问模式，不要再发明第四套剧本。

每条场景必须自带：时间线 5 步、推理摘要、3 次工具调用、3 条变更、校验 5 行（4 通过 + 1 需关注）、发布统计（变更数 / 影响页面 / 影响角色）。

场景 ① 参考时间线（文案必须用药合作词汇）：

1. 理解需求 — 已识别：服务提供商、任务范围、计划总金额字段 — 完成
2. 读取系统配置 — 服务商角色、任务权限、字段权限、任务详情页 — 完成
3. 分析影响范围 — 发现现有授权用户将受访问影响 — 完成
4. 生成变更方案 — 2 项权限变更、1 个页面字段调整 — 进行中
5. 执行安全校验 — 等待变更完成后执行 — 等待中

推理摘要示例：`服务商已有 Task.dataScope = 本服务商，仅需限制计划总金额字段，无需修改任务数据范围。`

场景 ① 需关注校验：`现有服务商管理员将失去计划总金额的查看权限`。

8. **aiWorkbench.css**
   - `@keyframes ai-spin`、时间线节点、`ai-dot-pulse`。
   - Agent working 状态用边框旋转，不要发光粒子。
   - 在 `AIWorkbench.tsx` 顶部 `import './aiWorkbench.css'`。

9. **三张列表页（同文件导出）**
   - `AIPages`：可构建页面表（工作台 / 任务执行 / 结算明细 / 医生主数据 / 角色管理），列：页面、模块、最近 Agent 任务、操作「在工作台打开」。
   - `AIRules`：2–3 张 `RuleCard`（含场景 ② 那条），「在工作台打开」进入 `rule-amount-approval`。
   - `AIVersions`：表格版本号 / 场景名 / 操作人李航 / 时间 / 状态。初始给 2 条历史；工作台发布成功后前插一条 `v1.4.x`。回滚按钮只 Toast「演示环境不执行真实回滚」。

10. **工作台页头**
    - 面包屑由全局顶栏承担。页内自己再写一行「AI 工作台 / {场景名}」可以，但不要再套 `PageHeader`。
    - 右侧：停止、新建任务、发布。
    - 状态字：`等待确认` / `Agent 工作中` / `执行完成`。
    - 页脚或确认卡旁固定一句：`AI 仅供参考，所有操作需人工确认`。

#### 任务 ⑤ 验证

在 `业务分析与设计准备/` 下：

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm dev
```

浏览器打开 `http://127.0.0.1:8443`（或终端打印的 Local 地址），默认角色 `药厂销售部门`：

1. 侧栏在「工作台」下出现「AI 能力」分组，四个入口都在。
2. LOGO 已是新 SVG，不再是 Activity 图标。
3. 浏览器 tab 标题「药合作系统」，favicon 为新 SVG。
4. 进入 AI 工作台，分别走完三场景至「确认发布」，版本记录能看到新行。
5. 切到「服务提供商」：AI 能力分组消失；再切回销售，分组回来。
6. 切到「药厂合规部门」：分组仍在。
7. 页面上搜索（或目视）不得出现：`Pharma`、`PHARMA`、`华东示例药企`、`上海智合会务`、`厂家预算`、`华东医药`、产品名「华」。

截图至少 5 张，放到设计方案文档末尾或 `/tmp` 均可，终端说明路径。缺截图不算完成。

---

### 4. 内容整改对照表（全文替换，禁止残留）

| Start Execution / 设计稿原文 | 主项目必须写成 |
|---|---|
| Pharma / PHARMA / Pharma AI Builder | 药合作系统 或 药合作系统 · AI 工作台 |
| PHARMA AGENT | 药合作 Agent |
| 华（品牌字） | 删除。用 `BrandMark` SVG |
| 华东示例药企 | 百益健康科技 |
| 华东医药营销平台 | 药合作系统 |
| 上海智合会务 | 智联科技有限公司 |
| 厂家预算 / manufacturerBudget | 计划总金额 |
| 2026 华东学术会议筹备 | 阿托伐他汀钙片(20mg)_百益健康科技 |
| 任务中心 | 任务执行 |
| 专家管理 | 医生主数据 |
| 活动管理 | 删除或改为「会议活动」占位，不要新造模块 |
| 营销工作台 | 工作台 |
| 服务商（作为角色名） | 服务提供商（登录角色）/ 服务商管理员（权限角色名，仅权限模块内部） |
| 林（用户头像字） | 李（李航） |
| ¥ / $ | ￥ |
| Development（环境） | 演示环境 |
| Production（发布弹窗） | 演示环境（原型没有生产发布） |
| Configure service-provider access rules | 调整服务商任务权限 |
| Expert Management | 医生主数据 |
| What do you want to build? | 想构建什么？ |
| Describe what you want to change… | 告诉 AI 你希望如何修改当前系统… |

预览窗内部也要像缩小的药合作系统：深色迷你侧栏 + 白内容，品牌条用 `BrandMark` + 「药合作系统」，不要再画「华」。

---

### 5. 红线与约束

1. **禁止修改** `/Users/lee/Developer/CompanyProjects/贝医项目/重构/Start Execution/` 下任何文件。
2. **禁止新增 npm 依赖**，禁止引入 react-router、antd、framer-motion、styled-components。
3. 视觉：**内联样式 + `@theme` 令牌**；`aiWorkbench.css` 只推动效。不要把 Start Execution 的 11 行压缩 CSS 整段粘进主项目。
4. 设计稿红线：不要大渐变、不要炫酷蓝紫 AI 光效、不要 AI 星星图标堆积、不要大面积插画、不要传统 SaaS 蓝后台、**不要满屏 Toast**。Agent 完成一步用时间线加点，不用全屏通知。
5. **`服务提供商` 角色不授 AI 工作台（及同组三页）权限。** 不要做「可见但 disabled」。
6. 不要改 `PermissionContext.tsx` 的求值逻辑，只改 `permissions.ts` 数据。
7. 不要改首页、任务执行、结算、权限管理等现有业务页的内部逻辑。工作台预览是静态缩小 UI，不是 iframe 真页面。
8. 不要接真实 LLM / 网络请求。所有 Agent 输出写在 `scenarios.ts`，用 `setTimeout` 推进状态机。
9. 不要把 AI 工作台做成微信气泡聊天。必须是 Agent Timeline。
10. 不要替换全局侧栏。Start Execution 的左侧 Workspace 只能缩成工作台内左轨。
11. 货币、角色名、任务状态用词遵守 `types.ts` 文件头铁律。
12. `src/pages/ai/` 只能有列出的 8 个文件。

---

### 6. 验收标准（委托人将按此审核，不要自作主张缩范围）

执行完成后必须同时满足：

1. `pnpm exec tsc --noEmit` 退出码 0。
2. `pnpm build` 退出码 0。
3. 默认角色（药厂销售部门）侧栏出现独立分组 **「AI 能力」**，内含 AI 工作台 / 页面构建 / 规则中心 / 版本记录。
4. 三场景均可从空状态走到发布成功：权限字段隐藏、规则卡片、页面加字段；每条都有人工确认卡，发布前按钮禁用。
5. 侧栏 LOGO 与 tab favicon 均为新 SVG，标题为「药合作系统」。
6. 切换到「服务提供商」后「AI 能力」分组消失；切回销售后重新出现。合规部门可见该分组。
7. 文案全部对齐药合作系统词汇（第 4 节对照表零命中原文禁用词）。
8. 工作台页可见「AI 仅供参考，所有操作需人工确认」；发布不修改任务/权限真实数据。
9. 设计方案文档已写入 `业务分析与设计准备/AI能力板块融合-设计方案.md`。
10. 有浏览器截图：默认角色菜单、三场景各一、服务商角色下菜单、favicon/标题。

---

### 不要做

- 不要把 Start Execution 当成要合并的 git 子项目，不要复制它的 `package.json` / 字体 import。
- 不要把 AI 入口挂到「系统管理」或「规则配置」下面。
- 不要做移动端适配。
- 不要实现真实发布、回滚、鉴权、后端。
- 不要在业务页面里为 AI 再写一套硬编码 `if (role === …)`；菜单显隐只走 `pagePerms`。
- 不要输出「方案概述」代替代码。设计文档是第一步，不是全部交付。
- 不要修改本文档。
