# 贝医·药合作 — Code Wiki

> 生成日期：2026-10-26
> 仓库：`重构/`（贝医项目重构工作区）
> 主应用：`业务分析与设计准备/` —— 「贝医·药合作」医药营销协同管理系统 PC 管理后台高保真原型

---

## 目录

1. [项目概览](#1-项目概览)
2. [仓库结构](#2-仓库结构)
3. [整体架构](#3-整体架构)
4. [运行方式](#4-运行方式)
5. [认证与登录模块（src/auth）](#5-认证与登录模块-srcauth)
6. [状态管理层（src/context + src/hooks）](#6-状态管理层-srccontext--srchooks)
7. [数据与领域层（src/data + src/domain）](#7-数据与领域层-srcdata--srcdomain)
8. [页面层（src/pages）](#8-页面层-srcpages)
9. [共享组件库（src/components）](#9-共享组件库-srccomponents)
10. [权限模型详解](#10-权限模型详解)
11. [持久化策略](#11-持久化策略)
12. [模块依赖关系](#12-模块依赖关系)
13. [演示账号与企业](#13-演示账号与企业)
14. [子项目与附属资产](#14-子项目与附属资产)
15. [关键设计约定与决策](#15-关键设计约定与决策)

---

## 1. 项目概览

「贝医·药合作」是一套**医药营销协同 SaaS** 的高保真交互原型，覆盖三方角色：

| 角色域 | 说明 |
| --- | --- |
| **平台域（PLATFORM）** | 软件服务方「贝医信息科技」的系统管理后台：租户开户、套餐、菜单、合作监管、系统审计 |
| **药厂租户（pharma）** | MAH 持有人（主演示：百益制药）：预算、任务发包、拜访、结算、品种/价目、服务商准入与合作授权、备案、合同 |
| **服务商租户（provider）** | 推广服务商（东方恒业、智联科技等）：准入领取、任务承接与拆解、工作组/专员管理、绩效、合作药厂视图 |

业务主线：**药厂发包 → 服务商承接（四级/三级执行链：药厂→服务商→工作组→专员）→ 工作量填报 → 成果验收 → 对账结算 → 绩效评价**，配套准入、授权、备案、合同、审计等合规体系。

**技术形态**：纯前端演示原型，无后端。数据以「React state + localStorage（带 schema 版本）+ 模块级变量」模拟；所有写操作走内存状态机，接口契约（如 `AuthGateway`）与实现（`mockGateway`）严格分离，便于未来整体替换为真实后端。

---

## 2. 仓库结构

```
重构/
├── 业务分析与设计准备/            # ★ 主应用（React 19 + Vite + Tailwind 4 + TS）
│   ├── index.html                 # Vite 入口，挂载 #root
│   ├── package.json               # figma-make-app
│   ├── UI_RULES.md                # UI 实施规则（组件复用/token/无障碍底线）
│   ├── docs/                      # 登录方案设计文档 + 24 张业务场景截图
│   ├── public/                    # 静态资源：移动端构建产物、项目介绍站、操作手册 PDF
│   └── src/
│       ├── main.tsx               # React 入口（StrictMode）
│       ├── App.tsx                # 根组件：登录三步流路由 + Workbench 业务壳 + 页面 switch
│       ├── constants.ts           # 全局常量：￥格式化、区域、服务类别、状态显示口径
│       ├── types.ts               # 全局类型（PageId/任务链/验收/价目/准入…，头部含 6 条铁律）
│       ├── index.css              # 设计 token（颜色/字号/圆角/阴影）
│       ├── auth/                  # 认证与登录三步流
│       ├── context/               # 9 个全局状态 Context
│       ├── hooks/                 # 4 个业务 hook
│       ├── data/                  # 种子数据与领域模型（权限/菜单/合作/租户…）
│       ├── domain/                # 纯函数领域库（任务执行 taskV4、移动预约 demo）
│       ├── pages/                 # ~40 个业务页面（含 vendor-access、pharma-config-switch 子目录）
│       ├── components/            # 共享组件库（Button/Modal/StatusTag/FilterBar…）
│       └── utils/                 # 附件工具、工作台网格布局引擎
├── 会议申请与审批功能/             # 独立子项目：会议事前申请审批 PC 原型（Figma Make 导出）
├── 美罗需求设计稿.html             # 独立单文件设计稿（服务商准入主题）
├── .github/prompts/ui-ux-pro-max/ # UI/UX 提示词库（设计检索工具，与运行无关）
└── .continue/skills/ui-ux-pro-max/# 同上（Continue 配置副本）
```

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  index.html → main.tsx → App.tsx                                 │
│                                                                  │
│  AuthProvider (会话)                                              │
│   └── Root  ── 按会话状态路由：                                    │
│        restoring → RestoreSplash                                  │
│        无会话    → LoginPage（企业码解析 + 短信/密码认证）           │
│        有待选药厂 → PharmaGateFirst（服务商选本次服务药厂）          │
│        就绪      → Workbench（key=session.id，换会话整树重建）      │
│                                                                  │
│  Workbench = Provider 嵌套栈：                                    │
│   DisplayPreference → TaskData → Acceptance → Permission →       │
│   VendorAccess → Contract → RepFiling → TalkScript → AICredit    │
│     └── AppShell（侧栏导航 / 顶栏 / 面包屑 / renderPage switch）    │
│                                                                  │
│  数据底座（模块级 store + localStorage + 跨 tab 同步）：            │
│   cooperationModel（合作/授权/成员/平台绑定，唯一事实源）            │
│   tenantRegistry / tenantPackages（租户与套餐）                     │
└─────────────────────────────────────────────────────────────────┘
```

**分层职责**：

| 层 | 目录 | 职责 |
| --- | --- | --- |
| 壳层 | `App.tsx` | 登录流路由、Provider 组装、导航与页面分发、权限拦截与越权审计 |
| 认证层 | `src/auth/` | 认证契约（接口/类型）+ mock 网关 + 登录 UI 三步流 |
| 状态层 | `src/context/` | 业务全局状态与写操作编排（每个 = `XxxProvider` + `useXxx()`） |
| 领域层 | `src/domain/` `src/data/` | 纯函数业务规则（状态机/校验/计算）与种子数据，无 React 依赖 |
| 页面层 | `src/pages/` | 按业务域组织的页面，消费 Context，不写领域规则 |
| 组件层 | `src/components/` | 设计系统组件，唯一图标库 lucide-react |

**关键机制**：
- **会话即隔离**：`Workbench key={session.id}`，登出/换账号/切药厂都通过换发新 session 使业务树整树重建，数据回到种子态（localStorage 持久项除外）。
- **Toast 会话级上浮**：`SessionToastContext` 挂在 Root，业务树重建时提示不丢失。
- **响应式壳层**：≥1200px 完整侧栏 / 768–1199px 图标窄栏（悬停浮层）/ <768px 抽屉侧栏（`useViewport`）。
- **越权拦截**：`navigate()` 校验 `visiblePages`，拒绝时写审计 + Toast 提示；`visiblePages` 变化后兜底回各域首页（平台→租户管理，租户→工作台）。

---

## 4. 运行方式

主应用（`业务分析与设计准备/`）：

```bash
cd 业务分析与设计准备
pnpm install        # 或 npm install
pnpm dev            # vite --host 0.0.0.0，默认 http://localhost:5173
pnpm build          # 产物输出 dist/
pnpm test           # vitest run（当前覆盖 cooperationModel）
pnpm format         # oxfmt
```

- **登录**：打开后进入登录页 → 输入企业码（如 `E9K4P7X2` 百益制药）→ 短信验证码 `123456`（或密码 `demo123`）。演示账号见 [§13](#13-演示账号与企业)。
- **移动端演示**：登录后个人中心菜单提供两个入口——内嵌预约演示（`RepAppointmentMobileDemo`）与完整移动端（iframe 加载 `public/mobile-app` 预构建产物）。
- **项目介绍站**：顶栏「项目介绍」按钮打开 `public/project-intro/index.html`。

子项目（`会议申请与审批功能/`）：同样 `pnpm install && pnpm dev`（Figma Make 模板，dev 端口 8443）。

**技术栈**：React 19、TypeScript 5.7、Vite 8、Tailwind CSS 4（`@tailwindcss/vite`，但业务样式以 `index.css` 设计 token + inline style 为主）、lucide-react、vitest、oxfmt。无路由库、无状态管理库（自建 Context）。

---

## 5. 认证与登录模块（src/auth）

### 5.1 登录三步流

1. **认证（LoginPage）**：第 1 段输入 8 位企业编码 → `resolveEnterprise` 解析工作空间与权限域（后台码→PLATFORM，企业码→TENANT）；第 2 段在企业命名空间内用**短信验证码**（默认）或**账号密码**认证。扫码登录代码保留但入口关闭（`LOGIN_METHODS_EXPOSED.qr = false`）。
2. **身份确认**：2026-09-18 起不再手选角色——同企业多角色自动合并进同一会话（权限并集、数据范围并集、脱敏从严）。旧身份确认页组件已删除。
3. **选服务药厂（PharmaGate，仅服务商业务身份）**：会话携带 `pendingPharmas` 时进门页选择本次服务药厂 → `chooseServingPharma` 免重新认证换发会话。名下仅 1 家可进入时自动直达。

另支持：**启动恢复默认登录**（`restoreDefaultLogin`，30 天 TTL 设备记录，恢复期间渲染 `RestoreSplash` 防闪登录页）、工作台内浮层切药厂（`PharmaGate mode="switch"`）、切企业组件沉睡可回滚（`EnterpriseSwitchGate`，入口已在 App.tsx 注释移除）。

### 5.2 文件职责

| 文件 | 职责 |
| --- | --- |
| `authTypes.ts` | 认证契约层：全部类型 + `AuthGateway` 接口 + 纯函数工具 |
| `authProfiles.ts` | 演示密码、企业编码表、演示账号速查（`DEMO_ACCOUNT_HINTS`）、扫码身份池 |
| `mockGateway.ts` | `AuthGateway` 内存实现（`authGateway` 单例）+ 账号安全/找回密码独立函数 |
| `AuthProvider.tsx` | React 会话上下文：`useAuth()` → `{ session, setSession, signOut, restoreState, restoreNotice, dismissRestoreNotice }` |
| `LoginPage.tsx` | 登录页主组件（两段式卡片 + 演示账号速查 + 找回密码，~93KB） |
| `PharmaGate.tsx` | 选择/切换服务药厂门页（first 全屏 / switch 浮层） |
| `EnterpriseSwitchGate.tsx` | 切企业门页（沉睡保留；敏感企业切前短信重认证） |
| `ActivationCelebration.tsx` | 首登激活庆祝弹框（5 秒自动淡出 + canvas 烟花） |
| `ForgotPasswordModal.tsx` | 找回密码弹窗（定位 → 短信验证 → 重置） |
| `LoginBackdrop.tsx` / `LoginBrandFlow.tsx` | 登录页视觉层（流体光斑背景 / 协作流线主视觉） |

### 5.3 核心数据模型

```ts
AuthPrincipal = PlatformPrincipal | TenantPrincipal   // realm 判别联合

PlatformPrincipal {                                   // realm: "PLATFORM"
  userId, name, account, phone, orgId, orgName,       // 基座 PrincipalPerson
  workspaceId, workspaceName, platformRoleId,
  platformRoleName, dutyScope                         // 职责范围摘要
}

TenantPrincipal {                                     // realm: "TENANT"
  ...PrincipalPerson,
  tenantId, tenantName, tenantKind,                   // tenantKind: "pharma" | "provider"
  membershipId, roleIds[], roleNames[],               // 多角色并集
  effectiveAssignmentIds[], dataScopes[], dataScopeSummary,
  currentPharmaTenantId?, currentPharmaName?, pharmaWarning?  // 服务商当前药厂
}

AuthSession {
  id,                    // "sess-…"，换发即重建业务树
  principal, method,     // "password" | "sms" | "qr"
  loginAt,
  pendingPharmas?,       // 待选服务药厂
  activationNotice?,     // 首登激活一次性提示
  restoredFrom?          // "default-login"
}

ServingPharma {          // 服务专员名下一家药厂
  id, name, status,      // "active" | "paused"
  blockedKind?,          // 硬阻断：合作暂停/终止/无品种授权/无数据范围
  warningKind?,          // 备案类警告（可进入，仅拦学术拜访）
  workGroup?, regions?, lastUsedAt? ...
}
```

### 5.4 mockGateway 方法清单

| 方法 | 说明 |
| --- | --- |
| `loginPassword({account, password, workspaceId?})` | 密码登录；5 次连错锁 15 分钟；冻结/待激活状态凭据通过后才披露（防枚举） |
| `resolveEnterprise({code})` | 企业码解析；套餐过期返回 `tenant-expired` |
| `requestSms / verifySms` | 短信票据（5 分钟有效、3 次机会）；**本企业成员固定码 `123456`，非成员发永不通过的假码（防枚举）** |
| `createQr / refreshQr / simulateScan / pollQr` | 扫码登录（沉睡保留） |
| `listServingPharmas(userId, providerTenantId)` | 经 cooperationModel 实时派生名下药厂（含不可用原因） |
| `chooseServingPharma(...)` | 选药厂后叠加 currentPharma 字段**换发新 session** |
| `restoreDefaultLogin()` | 校验链（有效期→账号→租户→成员→角色）任一失败即撤销记录；一次加载只恢复一次 |
| `listSwitchableEnterprises / switchEnterprise / verifyReauthCode` | 切企业（沉睡）；`role-pharma-admin`/`role-provider-admin` 属敏感角色需短信重认证 |
| `logout(session)` | 写登出审计 + 撤销本设备默认登录 |

**模拟方式**：票据/会话纯内存（刷新即失）；localStorage 持久 `lg-default-login-v1`（30 天）、`lg-device-id`、`baiyee-account-secrets-v1`（改密覆盖）、`baiyee-login-guard-v1`（锁定）；每个方法 60–220ms 假延迟；登录审计经 `drainLoginAuditEvents()` 灌入 PermissionContext。

### 5.5 关键常量

- `DEMO_PASSWORD = "demo123"`；演示短信码 `123456`
- 密码规则：`/^(?=.*[A-Za-z])(?=.*\d)\S{8,20}$/`；连错 5 次锁 15 分钟
- 企业码：8 位大写字母数字（排除 0/O/1/I），一企一码：`M8QT3ZRN` 平台 / `E9K4P7X2` 百益 / `W6HK2T9V` 东方恒业 / `F3JN7QX4` 智联

---

## 6. 状态管理层（src/context + src/hooks）

### 6.1 Context 一览

| Context | 职责 | 持久化 |
| --- | --- | --- |
| **PermissionContext** | 身份/角色/授权/组织/用户/工作组/审计核心；`visiblePages` 计算、预览模式、`logAudit` | 纯内存 + 模块级审计缓冲（跨会话累积） |
| **TaskDataContext** | 任务/预算/品种/四级价目/执行链/下层授权（~2400 行最大 store）；`auths` 经 `useSyncExternalStore` 订阅 cooperationModel 实时派生 | 纯内存 |
| **VendorAccessContext** | 服务商准入（准入码制）：任务状态机 + 药厂模板 | localStorage `baiyee-vendor-access-v9` |
| **ContractContext** | 合同归档（待上传→已归档）+ AI 价目整理任务（文件名分档模拟，6s 落定） | localStorage `baiyee-provider-contract-v2` |
| **AcceptanceContext** | 成果验收链配置（1–3 级）+ 材料包（任务×月份）批量验收 | 配置 localStorage `beiye-acceptance-chain-v1`；材料包内存 |
| **RepFilingContext** | 服务人员备案档案 + 培训记录（留底+同步，无审核流） | 模块级变量（跨会话不跨刷新） |
| **TalkScriptContext** | 品种话术库 CRUD、科室规则、AI 采纳留痕 | 模块级变量 |
| **AICreditContext** | baiyee-AI 积分计费（`AI_MODES` 单条10/话术包100/体检2；`TUNE_COST=5`） | 模块级变量 |
| **DisplayPreferenceContext** | 字号三档 + 主题三选；写 `<html>` data 属性驱动 CSS token | localStorage `beiyi.displayPreference` |

共同约定：写操作返回结果对象（`{ ok, error? }` / `MutationResult`）而非抛异常；预览模式下 PermissionContext 所有写方法统一拒绝（`预览模式禁止写操作`）。

### 6.2 TaskDataContext 关键方法

- **任务生命周期**：`createTask` / `createTaskBatch` / `confirmTask` / `unconfirmProvider` / `revokeTask`
- **工作量拆解**：`splitToWorkgroup` / `splitToSpecialists` / `assignWorkload`
- **报告**：`uploadReport` / `reuploadReport` / `reviewReport`
- **结算三段状态机**：`startSettlement` → `confirmSettlement` → `completeSettlement`，各有对应 `rollbackXxx` 受控回退；`uploadPaymentVoucher`
- **价目体系**：`savePriceItems` / `savePriceRatios` / `saveReportPrices` / `copyPriceList` / `saveUnitPriceAdjustRule`；`bindVarietyPriceBook`
- **执行链/下层授权**：`updateChain`；`createSubAuth` / `updateSubAuth` / `deleteSubAuth`
- 纯函数导出：`ensurePendingReports` / `remainingOfTask` / `settleableMonths` / `actualAmountOf` 等；常量 `DEMO_NOW = "2026-08-24 12:00"`

### 6.3 hooks

| Hook | 职责 |
| --- | --- |
| `useStartupGuide(principal)` | 新手引导四步（准入→合同→品种→价目）完成态现查现算；返回 `{ completedSteps, completedCount, total, bannerVisible, drawerOpen, openDrawer, closeDrawer, dismissBanner }` |
| `usePharmaSwitchConfig(pharmaId, providers)` | 药厂业务开关 live/drafts/history 草稿-发布模型；`saveRule` 只写草稿，`publish()` 先冲突校验再合并发版 |
| `useServingScope()` / `useCooperationRevision()` | 服务商业务页**默认拒绝**统一过滤口径：`{ denied, scope, matchesProviderRow, matchesPharmaRow }`；revision 驱动跨 tab 即时重算 |
| `useDashboardLayout(boardKey, sectionIds, ...)` | 工作台板块顺序/隐藏/尺寸，按 `pharma\|provider\|platform` 分键持久化 |

---

## 7. 数据与领域层（src/data + src/domain）

### 7.1 types.ts（全局类型）

头部注释定义 6 条铁律（全角 ￥、居中 Modal、区域=省级/全国、身份以 SysRole+授权为准、状态只用 7 词、金额口径统一）。核心类型：

- `PageId`（~40 页面联合）、`NavFocus`（跨页聚焦参数）、`NavigateFn`、`MenuItem`
- 身份两套禁止混用：`Role`（旧三类页面视角兼容值）与 `BizRole`（业务链四类）
- 状态词（数据层仅有这些）：`TaskStatus = 待确认|执行中|已结算|已撤销`；`ReconStatus = 未发起|对账中|已结算`；`ReportStatus = 待上传|待审核|通过|驳回`
- 任务一条链：`ServiceItem` → `WorkgroupSplit` → `WorkloadAssign`（支持部分结算）→ `ReportFile` → `SettlementLine` → `SettlementBill`（含确认/作废/财务锁/版本快照）→ `Task`（价目表快照 + 链快照 + 双状态）
- 其他：验收（`AcceptanceChainConfig`/`AcceptancePackage`）、预算（`BudgetPlan` 年度+服务商唯一键）、价目（`PriceBook`/`PriceItem`/`PriceRatio`/`ReportPrice`/`UnitPriceAdjustRule` ±30%）、准入（`VendorAccessRecord` 8 态状态机）、合同、备案

### 7.2 data 文件职责

| 文件 | 职责 |
| --- | --- |
| `permissions.ts` | **权限单一事实源**：`RESOURCE_PAGES`（~33 页，含 realms/tenantTypes 域限定）、`SysRole`/`RoleAssignment`/`TenantMembership` 模型、预置角色、`mergeRolePerms`（多角色并集/脱敏从严）、`pageHasAction`、`identityLabel`、组织树工具 |
| `menus.ts` | **菜单事实源**：`SEED_MENU_ITEMS` 按 platform / pharma / provider / any 四工作空间；`seedMenuItems()`、`buildNavGroups()`、`workspaceOfPrincipal()` |
| `cooperationModel.ts` | **合作关系领域模型**（详见 7.3） |
| `mockData.ts` | 全站业务种子中心：品种/授权/价目/预算/任务/拜访/医生/审计；`getRoleDashboardData(role)` 工作台数据唯一入口 |
| `tenantRegistry.ts` | 租户注册中心：`createTenant` 原子开户、四态生命周期（正常/暂停/恢复/终止）、`resolveEnterpriseByCode`、套餐换绑与限额、账号唯一校验 |
| `tenantPackages.ts` | 租户套餐=pageId 集合；`visiblePages = 角色权限 ∩ 套餐菜单`；换绑即时生效 |
| `nmpaDrugRegistry.ts` | NMPA 药品主数据 mock 网关（700ms 延迟，演示 0/1/多结果态） |
| `performanceData.ts` | 绩效数据层：批次/专员记录/四维评定/系数规则（实时读取非快照） |
| `pharmaSwitchRules.ts` | 药厂业务开关：14 个场景目录 + live/drafts/history，按药厂分键持久化 |
| `scenarioData.ts` | 业务搭建中心场景台账 mock |
| `complianceData.ts` | 备案+准入合规种子（ACTORS、承诺书模板、工具函数） |
| `acceptanceData.ts` | 验收链持久化 + 材料包状态纯派生函数 |

### 7.3 cooperationModel.ts — 合作关系唯一事实源

**权限分层**：① `ProviderPharmaRelationship`（合作关系，`active|paused|terminated`）→ ② `BusinessAuthorization`（品种/项目/区域授权，含行级区域与生效窗口）→ ③ `RoleAssignment.pharmaTenantIds/varietyNames`（员工收窄）→ ④ `FilingRecord`（备案：不拦进入，只拦学术拜访）。

**存储**：localStorage `baiyee-cooperation-v1` + `commit()`/`revision` 自增 + `subscribeCooperation()` 订阅 + **跨 tab storage 事件同步**（全站唯一）。

**关键函数**：
- 只读派生：`relationshipBetween` / `hasActiveAuthorization` / `effectiveProviderAuthRows()`（业务授权统一读取适配层）/ `grantedPharmasForUser`（四重校验）/ `visiblePharmasForUser`（门页卡片 blockedKind/warningKind 派生）
- 状态机操作（返回 `{ ok, error, audits }`，审计带 reasonCode）：`pauseRelationship` / `resumeRelationship` / `terminateRelationship`（联动撤销全部授权）/ `grantBusinessAuth` / `revokeBusinessAuth`
- 建关系两入口：`ensureRelationshipFromAccess`（准入通过联动，幂等）与 `importRelationshipsBatch`（外部已准入 CSV **整批原子导入**，任一行失败整批不落库）
- 收窄链校验：`grantablePharmasForProvider` / `derivedRegionCodesOfScope`（区域只读派生）/ `servingScopeOfPrincipal`
- 头部还聚合：平台角色绑定（`grantPlatformBinding`/`drainBindingAuditEvents`）与租户/成员聚合（`allTenants`/`upsertMembership` 等）

**测试**：`cooperationModel.test.ts`（vitest + localStorage 垫片）覆盖来源标签口径与批量导入的原子性/拦截/重复/混合批回滚。

### 7.4 domain 纯函数库

**`taskV4.ts`**（任务执行领域规则，无状态）：
- 执行链：`defaultChainNodes()`（四级，工作组可开关）/ `chainLevelOf`（三/四级）/ `chainPathLabel`
- 结算周期：`validateSettlementPeriods`（全覆盖/不重叠/无空档）
- 价目：`assertSamePriceBook`（同任务多品种同价目表）/ `snapshotPriceBook` / `nearestTier`（金额÷单价向下取整）
- 结算守卫：`canCompleteSettlement` / `canRollbackStart` / `canRollbackConfirm` / `canRollbackComplete` / `canUnconfirmProvider` / `latestValidBill` / `confirmedSettledAmount`

**`repAppointmentDemo.ts`**：移动预约演示状态机（草稿→待医院确认→已同意→已同步/已撤销）。

### 7.5 utils

- `attachment.ts`：附件类型识别/在线预览判定/`downloadAttachment`（种子数据生成占位 Blob）
- `dashboardGrid.ts`：工作台 12 列网格布局引擎（`packLayout` 行优先 first-fit 紧凑排布）

---

## 8. 页面层（src/pages）

### 8.1 业务管理

| 页面 | 职责 | 消费 Context |
| --- | --- | --- |
| `Dashboard` | 工作台：药厂/服务商双变体（指标卡、AI 洞察、待办、拖拽布局、新手引导） | Permission |
| `BudgetPlanPage` | 预算计划：品种×区域×月份编制 | TaskData、Permission |
| `BudgetAnalysis` | 预算执行分析与下钻 | TaskData、Permission |
| `TaskExecution` | 任务执行全链路（发包/拆解/分配/填报/验收，内嵌批量建任务） | TaskData、Permission、Acceptance |
| `VisitManagement` | 医院/商业/药房拜访（三路由复用）+ 就地验收 | Permission、Acceptance |
| `Settlement` | 结算明细（任务×服务月份） | TaskData |
| `BizDetailExport` | 业务明细导出 | TaskData、Permission |
| `TalkScriptVariety` | 品种话术维护 + 跳 AI 生成 | TalkScript、AICredit |
| `BaiyeeAI` | baiyee-AI 助手（问答/执行/话术生成/扣积分，独立沉浸布局） | TalkScript、AICredit |
| `PerformanceTeamQuality` / `PerformanceSpecialist` / `PerformanceSettings` | 绩效三件套（团队质量系数 / 专员一对一 / 规则设置） | performanceData 本地 |

### 8.2 基础数据

| 页面 | 职责 |
| --- | --- |
| `VarietyManage` | 品种建档（对接 NMPA mock）与价目绑定 |
| `DoctorMaster` | 医生主数据查询与详情 |
| `PriceTableConfig` | 价目表配置 |
| `ExecutionChainConfig` | 四级/三级执行链切换与职责对比 |
| `PharmaConfigSwitch` | 药厂配置开关（业务规则/费用控制/审核流程/版本记录四页签 + 规则编辑器 + 发布弹窗 + AI 助手，草稿-发布制） |

### 8.3 合作与授权

| 页面 | 职责 |
| --- | --- |
| `PharmaAccessTasks` | 药厂侧准入：准入码任务创建/撤回/逐项审核 + 模板页签（演示固定码 `12345678`） |
| `VendorAccessManage` + `vendor-access/{ApplicationTab, RecordsTab, TemplateTab}` | 服务商侧准入：领取任务、提交材料、驳回重提、提交记录 |
| `PharmaCooperation` | 合作关系台账（生效/暂停/恢复/终止）+ 外部已准入 CSV 导入（`CoopImportModal`） |
| `BusinessAuthorization` | 业务授权：药厂向服务商授予品种/项目/区域（合作生效才可授） |
| `RepFilingManage` | 服务人员备案、平台核验、培训记录 |
| `ContractManagement` | 合同上传归档 + AI 价目整理任务 |
| `ProviderPartners` | 服务商侧合作药厂与已获授权（只读） |

### 8.4 企业管理

`OrgStructure`（组织/部门/工作组树）、`UserManage`（成员建档/启停/调岗）、`WorkGroupManage`（组长指定，仅服务商）、`RoleManage`（角色/功能权限/数据范围唯一编辑入口）、`RolePreview`（以指定角色视角预览可见页面与字段）、`AuditLog`（企业/系统审计两路由复用）。

### 8.5 系统服务（平台域）

`TenantManagement`（三步开户向导 + 四态生命周期）、`TenantPackageManagement`（套餐=菜单集合，功能开通总开关）、`MenuManage`（菜单树维护）、`CooperationSupervision`（跨租户合作监管，只读）。

### 8.6 扩展能力与移动端演示

`ScenarioCenter`（低代码业务搭建中心）、`RepAppointmentMobileDemo`（代表预约全流程）、`FullMobileDemo`（iframe 加载 `public/mobile-app` 预构建产物）。

---

## 9. 共享组件库（src/components）

| 组件 | 职责与要点 |
| --- | --- |
| `Button` / `IconButton` | 统一按钮：variant/size 固定三档（sm 28/md 32/lg 38）；IconButton 强制 `title` |
| `Modal` | 基础弹窗；模块级 `openStack` 实现 **Esc 只关最上层** |
| `ConfirmDialog` | 危险操作二次确认（danger/warning + 影响说明） |
| `StatusTag` / `RiskTag` | 状态→文案/配色集中映射（颜色不单独承载信息） |
| `PageHeader` | 页头（标题/描述/数据范围/动作区/内置 tabs） |
| `FilterBar` | 声明式筛选条（text/select/date/daterange，默认 4 项折叠） |
| `Pagination` / `EmptyState` / `LoadingState` / `TableSkeleton` | 列表三件套 |
| `MetricCard` | 指标卡（趋势箭头/urgency 描边/可点击） |
| `DetailDrawer` | 右侧详情抽屉（560px 可调） |
| `Toast` | 全局通知（success/error/info/warning） |
| `Timeline` | 16 种业务事件时间线 |
| `RegionPicker` | 省级多选（「全国」互斥） |
| `UserMenu` | 顶栏个人中心（身份/切药厂/切演示账号/移动端演示/账号安全） |
| `DisplaySettingsMenu` | 字号/主题设置浮层 |
| `StartupGuide` | 新手引导 banner + 抽屉（四步启动步骤） |
| `AIInsightCard` | AI 洞察卡（结论/依据/建议/置信度/反馈） |
| `AcceptanceTab` / `BatchReviewModal` | 成果验收页签 + 批量验收弹窗 |
| `BatchCreateTaskPage` | 批量建任务两步向导（记忆草稿 + AI 配额演示） |
| `Brand` / `AccountSecurityModal` | 品牌标识 / 修改密码弹窗 |

---

## 10. 权限模型详解

### 10.1 两级过滤

```
visiblePages = 角色 pagePerms 并集（含 view 或任意动作）
             ∩ 租户套餐菜单集（tenantPackages；预览模式不裁剪）
             ∩ ResourcePage.realms/tenantTypes（页面权限域兜底）
```

- `SysRole.pagePerms: Record<pageId, PageAction[]>`；`PageAction = view|create|edit|delete|submit|approve|export`，view 是一切动作前提
- 多角色合并 `mergeRolePerms`：页面动作取**并集**，敏感字段策略**从严**（hidden > mask > visible）
- 敏感字段 7 类（医生姓名/手机/证件/银行卡/结算金额/联系人/证据 PII），`FieldPolicyKind = visible|mask|hidden`
- 预置角色：平台 `role-sys-admin`；租户 `role-pharma-admin`（企业管理员）、`role-provider-admin`、`role-group-lead`（组长）、`role-specialist`（专员，PII 全 hidden）+ 自定义角色种子

### 10.2 数据范围（只收窄不扩大）

药厂对服务商授权（cooperationModel）→ 服务商对员工 `createAssignment` 的 `pharmaTenantIds`/`varietyNames` 必须 ≤ 药厂授权上限（`grantablePharmasForProvider` 校验），区域由品种授权自动派生只读（`derivedRegionCodesOfScope`）。授权锚点取**成员身份所在部门**（`resolveGrantAnchor`，TenantMembership 而非 User.orgId）。

### 10.3 预览模式与审计

- `startPreview({roleId, orgId, userId?})`：切换 `effectiveRole` 为被预览角色，`previewReadOnly` 全禁写，进出均写审计；顶栏 `PreviewBanner` 可退出
- `logAudit(partial)`：自动补齐 id/时间/操作人/角色/组织/IP/结果，双写模块级缓冲（跨会话）+ state；登录审计、平台绑定审计、准入/合同审计均汇入同一审计流
- 高危角色授权落 `pending_review`；`deleteRole` 有在办授权守卫

---

## 11. 持久化策略

| 档位 | 数据 | 键/机制 |
| --- | --- | --- |
| localStorage（schema 版本） | 合作关系 `baiyee-cooperation-v1`（**唯一跨 tab 同步**）、准入 `baiyee-vendor-access-v9`、合同 `baiyee-provider-contract-v2`、租户 `baiyee-tenant-registry-v3`、套餐 `baiyee-tenant-packages-v1` | 版本不符回退种子 |
| localStorage 分键 | 药厂开关 `beiye-pharma-switch-v2:{pharmaId}`、工作台布局 `beiyi.dashboardLayout.{boardKey}` | — |
| localStorage 其他 | 验收链 `beiye-acceptance-chain-v1`、显示偏好 `beiyi.displayPreference`、默认登录 `lg-default-login-v1`、密码覆盖 `baiyee-account-secrets-v1`、登录锁 `baiyee-login-guard-v1`、记住企业 `lg-remembered-enterprises` | — |
| 模块级变量 | 备案、话术、AI 积分、审计缓冲、AI 带参跳转暂存 | 跨会话保持、刷新即失 |
| 纯内存 | 会话、任务/预算/价目（TaskData）、验收材料包、短信/扫码票据 | 刷新回种子 |

所有 localStorage 读写均有 try/catch 容错（隐私模式降级为会话内存）。

---

## 12. 模块依赖关系

```
App.tsx
 ├── auth/AuthProvider → auth/mockGateway → auth/authTypes + authProfiles
 │                                  └── data/cooperationModel（visiblePharmasForUser）
 ├── context/PermissionContext ── data/permissions + menus + cooperationModel
 │    ↑                              + tenantRegistry + tenantPackages
 │    ├── context/VendorAccessContext（principal 校验 / can / logAudit）
 │    ├── context/ContractContext（principal / logAudit）
 │    └── hooks/useServingBizScope（principal + assignments + cooperationRevision）
 ├── context/TaskDataContext ── domain/taskV4 + data/mockData
 │    └── useSyncExternalStore(subscribeCooperation) → 派生 auths
 ├── context/AcceptanceContext ── data/acceptanceData
 ├── context/{RepFiling, TalkScript, AICredit, DisplayPreference}（独立）
 ├── hooks/useStartupGuide → VendorAccess + Contract + TaskData
 └── pages/* → context/* + components/* + data/mockData
```

要点：PermissionContext 是中心辐射点（审计/身份被最多方复用）；cooperationModel 是底层数据枢纽（auth、TaskData、Permission、useServingScope 均订阅/读取）；TaskDataContext 不依赖 Permission（隔离 holder 维度自行校验）。

---

## 13. 演示账号与企业

统一密码 `demo123`，本企业短信码 `123456`。

| 账号 | 姓名 | 企业码 | 域/角色 | 演示场景 |
| --- | --- | --- | --- | --- |
| `wangmin` | 王敏 | `M8QT3ZRN` | 平台·贝医系统管理员 | 直入租户管理（平台无工作台） |
| `shenyue` | 沈悦 | `E9K4P7X2` | 百益·企业管理员 | 组织/用户/角色授权主线 |
| `lihang` | 李航 | `E9K4P7X2` | 百益·企业管理员+区域销售经理 | 多角色自动合并 |
| `zhaoning` | 赵宁 | `E9K4P7X2` | 百益·合规部 | 备案留底/准入审核 |
| `chenwei` | 陈伟 | `W6HK2T9V` | 东方恒业·服务商管理员 | 双企业身份（百益码登录=合规部） |
| `liuyang` | 刘洋 | `F3JN7QX4` | 智联·工作组组长 | 任务分派与初审 |
| `yangming` | 杨明 | `W6HK2T9V` | 东方恒业·服务专员 | 四卡门页（可进/备案警告/合作暂停/授权撤销） |
| `hejing` | 何静 | `W6HK2T9V` | 待激活成员 | 首登自动激活 + 庆祝弹框 |
| `hanlei` | 韩磊 | `W6HK2T9V` | 东方恒业·冻结成员 | 冻结拒登（百益身份不受影响对照） |

演示企业：平台（贝医信息科技）、药厂（百益制药主演示；华康/康宁/泽康仅合作数据）、服务商（东方恒业、智联科技主演示；康晟云服/永泰汇通/远山康达合作数据）、运行时租户（朗盛生物/云杏生物/泰合/启辰/泽江，覆盖正常/待激活/暂停/终止四态）。

---

## 14. 子项目与附属资产

| 资产 | 说明 |
| --- | --- |
| `会议申请与审批功能/` | 独立 Figma Make 原型：会议事前申请与审批 PC 审批端（React 19 + Vite 8 + Tailwind 4，单文件 App.tsx + localStorage）。状态机 `待药厂审批→已批准待执行/已驳回→已完成/已取消`。与主项目无代码共享，种子沿用同一产品族主体 |
| `美罗需求设计稿.html` | 独立单文件设计稿：「美罗」客户服务商准入需求（合规检查/材料上传/状态追踪） |
| `业务分析与设计准备/docs/` | 《企业注册认证与多租户登录方案 V2.0》（现行：先认证人再定工作空间，替代 V1.0《企业码先行登录方案》）+ 24 张多角色场景截图 |
| `业务分析与设计准备/public/` | 移动端构建产物（mobile-app）、项目介绍站（project-intro）、《药合作操作手册-药企.pdf》 |
| `.github/prompts/ui-ux-pro-max/` | UI/UX 设计提示词库（67 风格/96 色板/57 字体/UX 准则检索工具，`scripts/search.py` 驱动），与运行时无关 |
| `业务分析与设计准备/UI_RULES.md` | UI 实施规则：组件复用优先、token 化、lucide 唯一图标库、危险操作确认、自检清单 |

---

## 15. 关键设计约定与决策

1. **契约/实现分离**：`AuthGateway` 接口 + `mockGateway` 实现，生产接入整体替换网关即可。
2. **多角色自动合并**（2026-09-18 拍板）：登录不选角色，权限并集/脱敏从严；旧身份确认页已删除，切企业入口已砍（组件沉睡可回滚）。
3. **会话即隔离**：session.id 为 Workbench key，切账号/切药厂整树重建回种子态。
4. **唯一事实源**：权限看 `permissions.ts`、菜单看 `menus.ts`、合作授权看 `cooperationModel.ts`（`effectiveProviderAuthRows()` 统一适配层）、金额格式看 `constants.ts`（全角 ￥ `formatCNY`/大写 `formatCNYUpper`）。
5. **状态词封闭集**：任务/对账/报告状态只用 types.ts 定义的词，展示口径统一走 `taskStatusDisplay`/`reconStatusDisplay`。
6. **演示诚实原则**（UI_RULES）：不以假成功提示掩盖未实现的真实写入/上传/付款/审批；危险操作必须确认 + 影响说明；颜色不作唯一信息载体。
7. **防枚举设计**：登录失败统一文案、非成员发假短信码、成员状态凭据通过后才披露。
8. **审计全覆盖**：越权访问、角色预览、授权变更、登录事件均落审计流（模块级缓冲防业务树重建丢失）。
