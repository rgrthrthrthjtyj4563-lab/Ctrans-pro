# AI 能力板块融合 · 设计方案

> 日期：2026-08-26
> 依据：《AI能力板块融合-AI执行提示词.md》已确认三决策。本文是主原型落地说明书，不是独立产品 PRD。

---

## 1. 一句话目标

把 `Start Execution` 的 Agent 工作台收进药合作系统主壳层，成为侧栏独立「AI 能力」分组；品牌统一为药合作系统 + 新 SVG；三条演示剧本可从空状态走到人工发布。

已确认决策：

| 决策 | 口径 |
|---|---|
| D1 独立分组 | 一级「AI 能力」：AI 工作台 / 页面构建 / 规则中心 / 版本记录 |
| D2 主项目品牌 | 废弃「华 / Pharma / 酸绿」。LOGO、favicon、工作台内品牌全部走 `#176B5B` SVG |
| D3 完整版三场景 | ①服务商计划总金额字段 ②金额审批规则 ③任务详情加「剩余可结算金额」 |

原则：**AI 辅助不裁决。** 只出方案、Diff、预览、校验，发布只写演示版本记录，不改任务或权限真实数据。

---

## 2. 信息架构与边界

```
工作台
AI 能力
  ├ AI 工作台      三栏 Agent（主路径）
  ├ 页面构建      可构建页面列表 → 打开工作台
  ├ 规则中心      规则卡片列表 → 打开工作台
  └ 版本记录      已发布演示版本（不可真回滚）
业务管理 / 合规管理 / …
系统管理
  └ 角色管理      真实权限矩阵（AI 不替代）
```

- AI 工作台演示「改配置」，**不替代** `RoleManage` / `permissions.ts` 运行时求值。
- 全局侧栏、顶栏、角色切换保留。Start Execution 的 Workspace 侧栏缩成工作台**内左轨**。
- 服务提供商看不到本分组。

---

## 3. 壳层策略

- 保留 `#111827` 全局侧栏（240/60）+ 顶栏 52。
- AI 四个页面让 `main` `overflow:hidden`、子页 `height:100%`。
- 工作台内三栏：`200px` 上下文轨 + `1fr` Agent Stream + `minmax(340px, 0.9fr)` Inspector。
- 列表页（页面构建 / 规则中心 / 版本记录）用常规页头 + 表/卡片，点「在工作台打开」切到 `ai-workbench` 并载入场景。

---

## 4. 品牌

- `BrandMark`：32×32 圆角 8，底 `#176B5B`；白色横竖胶囊交叉成「十」，中心品牌色实心圆。
- `BrandLogo`：Mark + 「药合作系统」+ 「AI 运营控制台 V3」。
- 替换：全局侧栏 LOGO、`public/favicon.svg`、工作台空状态、Agent 头像、预览窗品牌条。
- 禁止：字「华」、酸绿 `#d8ff78`、Manrope / DM Mono。

---

## 5. 三场景剧本

| key | 快捷入口 | Prompt | 预览 |
|---|---|---|---|
| `perm-vendor-budget` | 调整角色权限 | 服务提供商只能看到自己承接的任务，同时不能看到计划总金额。 | 任务详情 TK-2026-0001，计划总金额模糊 |
| `rule-amount-approval` | 配置企业业务规则 | 市场推广服务且计划金额大于 ￥10,000 时，必须增加药厂合规部门审批。 | RuleCard |
| `page-add-field` | 修改一个页面 | 在任务详情页增加「剩余可结算金额」字段，并对服务提供商角色可见。 | 详情新增剩余可结算金额 ￥84,000 |

状态机：`empty → chat(650ms) → planning →（构建模式人工确认）→ executing(1250ms) → complete → PublishModal`。

询问 / 规划模式停在 planning，不出现「确认并开始执行」。

---

## 6. 权限矩阵

| 角色 | AI 工作台 | 页面构建 | 规则中心 | 版本记录 |
|---|---|---|---|---|
| 平台运营 | ALL_PAGES | ALL_PAGES | ALL_PAGES | ALL_PAGES |
| 系统管理员 | view | view | view | view |
| 药厂销售管理员 / 药厂销售部门 | view+submit | view | view | view |
| 药厂合规管理员 / 药厂合规部门 | view+submit | view | view+edit | view |
| 服务商管理员 / 服务提供商及以下 | 无 | 无 | 无 | 无 |

---

## 7. 文件清单

修改：`App.tsx` `types.ts` `permissions.ts` `index.css` `index.html` `.figma/make/site.json`

新增：`AI能力板块融合-设计方案.md`（本文）、`src/components/Brand.tsx`、`public/favicon.svg`、`src/pages/ai/` 下 8 文件。

不改：`Start Execution/`、`PermissionContext.tsx`、现有业务页内部逻辑。不新增 npm 依赖。

---

## 8. 不做什么

- 不接真实 LLM / 后端 / 路由库。
- 不把 AI 入口挂到系统管理或规则配置下。
- 不满屏 Toast、不蓝紫光效、不替换全局侧栏。
- 发布不修改 `TaskDataContext` 与权限运行时矩阵。
- `src/pages/ai/` 不超过 8 个文件。
