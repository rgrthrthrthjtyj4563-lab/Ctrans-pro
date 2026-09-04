# 企业用户与组织架构重组 · AI 执行提示词

> 你是前端实施工程师，在仓库 `业务分析与设计准备/`（React 19 + Vite + TypeScript，纯内联样式，无 UI 框架）中完成「用户授权 + 机构部门」两页合并为「组织架构」一页的改造。**只允许改动本文第 2 节列出的文件**，完成后交人工审核，不要自行 commit。

## 0. 项目硬约束（先读）

1. 遵守 `UI_RULES.md`：优先复用 `src/components` 与 `src/pages/permUi.tsx` 已有组件（`OrgTree`、`Field`、`InfoBanner`、`Modal`、`Button`、`ConfirmDialog`、`StatusTag`、`inputStyle`、`tdStyle`、`thStyle`）；颜色、字号、圆角用 `src/index.css` 的 token；图标只用 `lucide-react`。
2. 验证方式：`npm run dev`（端口 8443）人工走查 + `npm run build` 通过（构建走 vite/esbuild）。
3. **禁止运行 `npm run format` / oxfmt**（会全库重排，无法 review）。
4. 仓库存在预存的 `tsc --noEmit` 语法报错（历史格式化残留），不要顺手修无关文件，以 `npm run build` 为准。
5. 代码风格跟随 `OrgManage.tsx` 现状（单引号 + 分号为主）。
6. **不引入任何新依赖**。
7. **不得改动** `PermissionContext.tsx` 的 Context 结构、Provider 挂载、`usePermission` 导出，以及除第 3.3 节明确列出之外的任何 store 方法；`PermissionProvider` 的 props 与各页面调用的其他 store 字段（`orgs/users/grants/roles/can/previewReadOnly`）签名不变。

## 1. 需求背景与已确认决策

现状问题：`用户授权` 与 `机构部门` 两个菜单共用同一棵组织树，但一个管「人挂在哪个部门（orgId）」，一个管「人有哪些角色（授权）」，职责没归拢，管理员看不懂。

拍板方案（**合二为一，轻量**）：

| 决策点 | 结论 |
| --- | --- |
| 页面结构 | 删除「用户授权」菜单及 `UserGrantManage.tsx`；「机构部门」更名「组织架构」，一棵树 + 一张人员表，挂靠与授权都在本页完成。**不新建「企业用户」页，不做页签 / 详情抽屉 / 授权记录中心 / 手工跨组织范围选择器。** |
| 授权交互 | 人员表新增「授权」按钮 → 小弹窗只选「角色 + 生效日期 + 可选到期日期」；**组织与数据范围均自动推导**，不提供人工选择器 |
| 授权组织锚点 | 不直接等于人员所属部门，按角色 `defaultScope` 推导（规则见 3.2） |
| 回收 | 授权弹窗内同列该用户现有有效角色，每条带「回收」 |
| 调岗提示 | 调整所属部门时明示「角色授权不随调岗迁移」+ 展示当前有效角色数 |
| 审计 | 新授权/回收的审计 `module` 改为「组织架构」、`resource` 改为 `departments.*`，不再写已删除的 `用户授权` / `user-grants.*`；历史审计记录**保留展示**，不删不改 |

## 2. 改动总览

| 文件 | 动作 |
| --- | --- |
| `src/pages/UserGrantManage.tsx` | **删除文件** |
| `src/pages/OrgManage.tsx` | **主改**：角色列 + 授权弹窗 + 回收 + 调岗提示 |
| `src/context/PermissionContext.tsx` | createGrant 改签名并集中做锚点推导；审计键改「组织架构」 |
| `src/data/permissions.ts` | 新增纯函数 `resolveGrantAnchor`；departments 更名 + 加 delete 动作；删 user-grants |
| `src/App.tsx` | 删 user-grants 菜单/路由/标签/import；departments 更名；删企业用户灰占位 |
| `src/types.ts` | `PageId` 删 `user-grants` 与 `enterprise-users` |

## 3. 逐文件规格

### 3.1 删除 `src/pages/UserGrantManage.tsx`

直接删除整文件。其功能（单人授权 / 批量授权 / 回收）由 3.3 的 `OrgManage` 授权弹窗承接，**批量授权本期不做**。

### 3.2 `src/data/permissions.ts`

#### 3.2.1 新增纯函数 `resolveGrantAnchor`（锚点推导唯一事实源）

```ts
export function resolveGrantAnchor(
  orgs: PermOrg[],
  userOrgId: string,
  role: SysRole,
): { orgId: string; orgName: string; scope: ScopeType }
```

推导规则（`scope` 一律取 `role.defaultScope`）：

| `role.defaultScope` | 锚点组织 |
| --- | --- |
| `ALL_PLATFORM` | 沿 `parentId` 向上找最近的 `platform` 节点 |
| `PHARMA` | 向上找最近的 `pharma` 节点 |
| `PROVIDER` | 向上找最近的 `provider` 节点 |
| `GROUP` / `SELF` | 向上找最近的 `group` 节点 |
| `DEPT` / `DEPT_AND_CHILD` / `CUSTOM` | 直接取用户当前所属节点（不向上） |
| 向上找不到对应祖先 | 回退到用户当前所属节点 |

实现提示：写一个内部 `nearestAncestorOfType(orgId, type)` 从当前节点沿 `parentId` 逐级向上、含自身，命中即返回；`orgName` 用命中节点的 `name`。此函数放在 `PERM_ORGS` 定义之后、`seedGrants` 之前。

**自检**：用 `resolveGrantAnchor` 对现有 `seedGrants` 的 12 条逐一推导，`orgId` 必须与 `seedGrants` 现存的 `orgId` 完全一致（例如 `u-lihang` + `role-pharma-sales` → `org-pharma`；`u-lihang` + `role-custom-region-sales` → `org-dept-northwest`；`u-sunli` + `role-specialist` → `org-provider-east`）。不一致说明规则写错。

#### 3.2.2 RESOURCE_PAGES

- 删除 `id: "user-grants"` 整个页面定义（现约 L301-307）。
- `departments` 定义改为：

```ts
{
  id: "departments",
  module: "系统管理",
  name: "组织架构",
  description: "维护组织树、人员挂靠与角色授权",
  actions: acts("departments", ["view", "create", "edit", "delete"]),
},
```

（原 `name: "机构部门"`，动作 `view/create/edit` → 加 `delete` 承载「回收」能力。）

#### 3.2.3 PRESET_ROLES 授权行

- `role-sys-admin`：删掉 `["user-grants", ["view", "create", "edit", "delete"]]` 行；把 `["departments", ["view", "create", "edit"]]` 改为 `["departments", ["view", "create", "edit", "delete"]]`。
- `role-pharma-sales`：删掉 `["user-grants", ["view", "create", "edit"]]` 行；`departments` 行**保持不变**（`view/create/edit`，无 delete，即药厂销售管理员能授权、不能回收）。

`seedPermAudit` 里的 `user-grants.create` / `user-grants.delete`（现约 L1073、L1180）是历史审计演示文案，**保留不改**。

### 3.3 `src/context/PermissionContext.tsx`

#### 3.3.1 改 `createGrant` 签名 + 集中锚点推导

`PermissionStore` 接口与实现里，`createGrant` 的入参从

```ts
Omit<UserGrant, 'id' | 'grantedAt' | 'grantedBy' | 'status'> & { status?: GrantStatus }
```

改为

```ts
{ userId: string; roleId: string; effectiveFrom: string; effectiveTo?: string }
```

实现逻辑（`createGrant` 函数体内，替换现有 body）：

1. `preview` 时返回 `{ ok: false, error: '预览模式禁止写操作' }`（照旧）。
2. 找 `user`、`role`，不存在则返回对应错误（照旧）。
3. 保留现有演示守卫：`user.account === 'lihang' && (roleId === 'role-sys-admin' || roleId === 'role-platform-ops')` → `'授权人不得授予超出自身管理边界的角色'`。
4. 调 `resolveGrantAnchor(orgs, user.orgId, role)` 得到 `{ orgId, orgName, scope }`。
5. 重复校验：`grants.some(g => g.userId === userId && g.roleId === roleId && g.orgId === orgId && g.status === 'active')` → `'该用户在此组织下已拥有相同角色'`。
6. 组装 `UserGrant`：`id: nextId('g')`、`orgId/orgName/scope` 取第 4 步结果、`effectiveFrom/effectiveTo` 取入参、`grantedBy: ACTOR`、`grantedAt: nowStamp()`、`status: 'active'`。
7. `logAudit` 改为：`module: '组织架构'`、`action: '用户授权'`、`target: `${user.name} × ${roleName}``、`resource: 'departments.create'`、`afterSummary: `${orgName} · ${scopeLabel?}``（若需展示范围文案，直接用 `role.defaultScope` 或 `scopeLabel(scope)`）。

> 注意：`createGrant` 现在**不再接收**调用方传入的 `orgId/orgName/scope`；`UserGrantManage.tsx` 是唯一旧调用方且本轮删除，改签名安全。函数依赖数组需补 `orgs`、`roles`、`users`、`grants`。

#### 3.3.2 改 `revokeGrant` 审计键

`revokeGrant` 函数体其余不变，仅 `logAudit` 改为：`module: '组织架构'`、`action: '回收授权'`、`resource: 'departments.delete'`（其余 `target/roleName/beforeSummary/afterSummary/reason` 照旧）。

### 3.4 `src/pages/OrgManage.tsx`（主改）

#### 3.4.1 store 解构与 imports

- `usePermission()` 解构补 `roles`、`createGrant`、`revokeGrant`。
- `data/permissions` import 增加 `resolveGrantAnchor`、`scopeLabel`（用于只读展示，不做选择器）。

#### 3.4.2 人员表「角色」列

- 表头 `['姓名', '账号', '所属部门', '账号状态', '有效授权数', '操作']` 中的 `'有效授权数'` 改为 `'角色'`。
- 对应单元格：由 `grantCount`（数字）改为该用户 `status === 'active'` 授权的角色名 chips——`grants.filter(g => g.userId === u.id && g.status === 'active')` 经 `roles.find` 映射为角色名，渲染为小圆角标签（参考原 `UserGrantManage` 里 `u.name · u.orgName` 那种 `padding: '2px 8px', borderRadius: 999, background: '#F3F4F6'` 样式，多个换行/空格分隔）；无则显示 `—`。
- 操作列保留「调整所属部门」，新增「授权」按钮：显示条件 `can('departments', 'create') && !previewReadOnly`，点击 `openGrant(user)`。

#### 3.4.3 授权弹窗（新增 Modal）

新增状态：`grantUserId: string | null`、`grantRoleId: string`、`grantFrom: string`（默认今天，`2026-09-03` 附近）、`grantTo: string`（可选）、`grantError: string`。

弹窗 `title: "授权"`、`width: 560`：

1. `InfoBanner`：说明「授权组织与数据范围按角色和该人所属部门自动推导，无需手工选择；全平台/药厂/服务商/工作组角色会锚定到对应层级组织。」
2. `Field label="用户"`：只读展示 `grantUser.name · grantUser.account`。
3. `Field label="角色" required`：`select` 选项 `roles.filter(r => r.status === 'enabled')`，显示 `r.name（r.kind === 'preset' ? '预置' : '定制'）`；选中后联动。
4. 选中角色后，展示一行**只读**提示（非选择器）：`授权组织：{anchor.orgName} · 数据范围：{scopeLabel(scope)}`——`const anchor = grantRole ? resolveGrantAnchor(orgs, grantUser.orgId, grantRole) : null`。
5. `Field label="生效日期" required` + `Field label="到期日期" hint="临时授权必须填写"`（两列并排，日期 `input type="date"`）。
6. 「已有有效角色」区：列出该用户 `status === 'active'` 的授权，每条右侧「回收」按钮（显示条件 `can('departments','delete') && !previewReadOnly`），点击 → `ConfirmDialog` 确认后 `revokeGrant(id, '管理员回收')` + `addToast({ type:'success', title:'授权已回收' })`。
7. footer：`取消` + `确认授权`；确认 → `createGrant({ userId, roleId: grantRoleId, effectiveFrom: grantFrom, effectiveTo: grantTo || undefined })`，`ok` 则 `addToast({ type:'success', title:'授权已生效' })` 并关弹窗，否则 `setGrantError(result.error)`。

`openGrant(user)` 里初始化 `grantRoleId=''`、`grantFrom`（今天）、`grantTo=''`、`grantError=''`。

#### 3.4.4 调整所属部门弹窗补强提示

现有「调整所属部门」Modal 的 `InfoBanner`（现约 L339-341）在「不迁移已有授权」基础上**追加该用户当前有效角色数**：`只改 {name} 的人员挂靠，不迁移已有授权；其 {n} 个有效角色保持原组织不变。`（`n = grants.filter(g => g.userId === reassignUserId && g.status === 'active').length`）。

#### 3.4.5 PageHeader 文案

- `title`：`"组织架构"`。
- `description`：`"维护药厂内部组织树：新建部门、改名称、换上级、调整人员挂靠；在同一页完成角色授权与回收。"`

### 3.5 `src/App.tsx`

1. 删除 `import { UserGrantManage } from "./pages/UserGrantManage"`（约 L38）。
2. `navGroups` 的 `admin-group` 子项：删除 `{ id: "user-grants", label: "用户授权" }`；`{ id: "departments", label: "机构部门" }` 的 label 改为 `"组织架构"`。
3. `navGroups` 的 `master-group` 子项：删除 `{ id: "enterprise-users", label: "企业用户", disabled: true }`（约 L105）。
4. `pageLabels`：删除 `"user-grants"` 与 `"enterprise-users"` 两个键；`departments` 的 label 由 `"机构部门"` 改为 `"组织架构"`。
5. `pageSections`：删除 `"user-grants"` 与 `"enterprise-users"` 两个键（`departments` 保持 `"系统管理"`）。
6. `renderPage`：删除 `case "user-grants": return <UserGrantManage addToast={addToast} />` 分支。

### 3.6 `src/types.ts`

`PageId` 联合类型删除 `"user-grants"` 与 `"enterprise-users"` 两个成员（约 L564）。

## 4. 验收清单（完成后逐项自检并在回复中列明结果）

1. 侧边栏「系统管理」组只剩：角色管理 / 组织架构 / 角色预览 / 操作日志 / 执行链路配置；无「用户授权」；「主数据管理」组无「企业用户」灰占位。
2. 进入「组织架构」：左树 + 右侧节点信息 + 人员表；人员表「角色」列显示角色标签，无「有效授权数」。
3. 点某人员「授权」→ 弹窗只含用户（只读）/角色/生效日期/到期日期 + 已有角色列表，**无**「组织」「数据范围」「权限覆盖组织」选择器。
4. 给西北大区的李航选「药厂销售管理员」：只读提示显示「授权组织：百益制药 · 数据范围：本药厂」，确认后新增授权，角色列出现「药厂销售管理员」标签。
5. 给工作组三的杨明选「服务专员」：只读提示显示「授权组织：工作组三」，确认后正确锚定。
6. 授权弹窗内对某有效角色点「回收」→ 确认 → toast「授权已回收」→ 该角色标签消失。
7. 调整所属部门：弹窗提示含「角色授权不随调岗迁移」+ 当前有效角色数；调岗后该用户角色标签仍保留。
8. 权限矩阵（角色管理 → 角色预览）中不再有「用户授权」页；系统管理员在组织架构可见「授权」与「回收」，药厂销售管理员可见「授权」但**无回收按钮**（无 delete）。
9. `createGrant`/`revokeGrant` 产生的审计记录（操作日志）module 为「组织架构」、resource 为 `departments.create`/`departments.delete`；历史审计里旧的 `用户授权` 记录仍可正常查看。
10. 收尾自检并回写结果：
    ```bash
    grep -rn "user-grants\|UserGrantManage\|enterprise-users" src/
    ```
    命中只允许出现在 `src/data/permissions.ts` 的 `seedPermAudit` 历史演示文案里（`user-grants.create` / `user-grants.delete` 两条）；不得残留任何 import、菜单、路由、类型引用。
11. `npm run build` 通过；三个登录角色走查 console 零报错。
12. `git status` 确认只改了第 2 节列出的文件（含删除的 `UserGrantManage.tsx`）；未运行 oxfmt；未 commit。
