# 拜访管理整改 · AI 执行提示词

> 你是前端实施工程师，在仓库 `业务分析与设计准备/`（React 19 + Vite + TypeScript，纯内联样式，无 UI 框架）中完成「拜访管理」页的整改。**只允许改动本文列出的 5 个文件**，完成后交人工审核，不要自行 commit。

## 0. 项目硬约束（先读）

1. 遵守 `UI_RULES.md`：优先复用 `src/components` 现有组件（`Button`/`IconButton`/`StatusTag`/`DetailDrawer`/`FieldGroup`/`FieldItem`/`Timeline`/`ConfirmDialog` 等）；颜色、字号、圆角用 `src/index.css` 的 token，不新造品牌色/状态色；图标只用 `lucide-react`。
2. 验证方式：`npm run dev`（端口 8443）人工走查 + `npm run build` 通过（构建走 vite/esbuild）。
3. **禁止运行 `npm run format` / oxfmt**（会全库重排，无法 review）。
4. 仓库存在预存的 `tsc --noEmit` 语法报错（历史格式化残留，与本次无关），不要顺手修无关文件，以 `npm run build` 为准。
5. 代码风格跟随各文件现状：`VisitManagement.tsx` 为单引号 + 分号；`App.tsx`、`mockData.ts` 为双引号。
6. 本次不引入任何新依赖，不接入外网地图 SDK / 网络图片，不改动 `permissions.ts` 与权限模型。

## 1. 需求清单（9 项）

| # | 需求 |
| --- | --- |
| 1 | 绩效状态只有两种：**待评定、已评定** |
| 2 | 审核状态只有三种：**待审核、已通过、已驳回** |
| 3 | 列表「服务专员」列在姓名后拼上**服务专员用户名** |
| 4 | 「查看详情」抽屉加宽，并增加详情字段（拜访科室、被拜访人、拜访方式、拜访类别、拜访日期、拜访位置、开始时间、结束时间、拜访内容、客户反馈） |
| 5 | 抽屉内「操作历史」改为页签，旁边新增「拜访位置」页签：示意地图 + 打卡位置标点 |
| 6 | 药厂登录角色（药厂销售部门、药厂合规部门）**没有编辑权限和删除权限** |
| 7 | 新增「通过」「删除」行内操作按钮（授权给服务提供商，见下方权限矩阵） |
| 8 | 列表「品种_规格」列鼠标悬停时显示**完整名称**（当前超宽截断后悬停无提示） |
| 9 | 「拜访时段」改为枚举值：**晨访、日访、夜访**（替换现有 "08:00-12:00" 类时间段） |

## 2. 角色权限矩阵（本次整改的业务设定）

登录角色来自 `App.tsx` 的 `currentRole`（`Role` 类型，三选一）。判断写法沿用 `Settlement.tsx` 的先例：`const isProvider = currentRole === '服务提供商'`。

| 能力 | 药厂销售部门 / 药厂合规部门 | 服务提供商 |
| --- | --- | --- |
| 查看列表 / 查看详情 / 导出 | ✅ | ✅ |
| 行内「修改」 | ❌ | ✅（保留现有 toast 占位行为） |
| 行内「删除」 | ❌ | ✅（走现有 ConfirmDialog 流程） |
| 行内「通过」 | ❌ | ✅（仅审核状态=待审核的行显示） |
| 批量审核通过 / 批量驳回 / 批量删除 | ❌（整组不渲染，含「已选 N 条」计数） | ✅（保持现有交互） |
| 抽屉底部「审核通过 / 驳回」按钮 | ❌ | ✅（仅待审核记录，保持现有交互） |

## 3. 逐文件改动

### 3.1 `src/types.ts`

1. 新增绩效状态类型：
   ```ts
   export type VisitPerformanceStatus = "待评定" | "已评定"
   ```
2. `VisitRecord` 调整：
   - `performanceStatus: AuditStatus` 改为 `performanceStatus: VisitPerformanceStatus`；
   - 新增字段（放在合适分组，全部必填）：
     ```ts
     specialistAccount: string  // 服务专员用户名，如 zhangwei
     visitMethod: string       // 拜访方式："上门" | "电话" | "线上"
     visitDate: string         // 拜访日期 yyyy-MM-dd
     startClock: string        // 开始时刻 HH:mm:ss
     endClock: string          // 结束时刻 HH:mm:ss
     visitLocation: string     // 拜访位置（打卡地址全文）
     visitContent: string      // 拜访内容（一句话描述）
     customerFeedback: string  // 客户反馈（一句话描述）
     ```
   - 原 `startTime` / `endTime` / `startOnTime` / `endOnTime` 保留不动（列表时间列与整点标记继续用）。

### 3.2 `src/data/mockData.ts`（只动 `visitRecords` 生成器与新增常量，其他数组不碰）

1. 新增专员用户名映射并导出：
   ```ts
   export const specialistAccounts: Record<string, string> = {
     张伟: "zhangwei", 李强: "liqiang", 王芳: "wangfang", 刘洋: "liuyang",
     陈静: "chenjing", 杨明: "yangming", 赵磊: "zhaolei", 孙丽: "sunli",
     黄峰: "huangfeng", 吴超: "wuchao",
   }
   ```
2. 审核状态池收敛为三种（保证三种都出现，待审核占比最高）：
   ```ts
   const auditStatusPool: AuditStatus[] = ["待审核","待审核","待审核","待审核","已通过","已通过","已通过","已驳回"]
   ```
3. 绩效状态派生规则：`auditStatus === "已通过" ? "已评定" : "待评定"`。
4. 拜访时段池替换（`visitPeriod` 字段含义从时间段改为拜访类型枚举）：
   ```ts
   const visitPeriods = ["晨访", "日访", "夜访"]
   ```
5. 新字段生成：
   - `specialistAccount: specialistAccounts[specialist]`；
   - `visitMethod`：池 `["上门","上门","上门","电话","线上"]`；
   - `visitDate` / `startClock` / `endClock`：从现有 `startTime` / `endTime` 拆出日期与时刻，秒位补 `:00` 即可（保持演示确定性）；
   - `visitLocation`：新增地址池，格式「省市区+路号+医院」，与该条 `hospital` 对应，例如：
     - `福建省龙岩市新罗区北城双洋西路8号龙岩市第二医院（新院区）`
     - `北京市东城区帅府园1号北京协和医院`
     - `上海市黄浦区瑞金二路197号上海瑞金医院`
     - `广州市越秀区中山二路58号广州中山医院`
     （其余医院照此格式补齐，一一对应即可）
   - `visitContent` / `customerFeedback`：各给 4~6 条演示文案池随机取，风格参考：
     - 拜访内容：「详细讲解学术论据，提升产品的学术价值与影响力」「跟进上轮临床试验反馈，解答用药疑问」等；
     - 客户反馈：「客户比较满意我方提供的学术证据，表示会找合适病例」「客户希望补充真实世界研究数据后再评估」等。
6. **固定示例记录**：`visitRecords` 生成完成后，将第 1 条（`VR10000`）整体覆盖为以下字面值（用于走查详情抽屉），其余字段从池中合理取值：
   - `specialist: "孙丽"`、`specialistAccount: "sunli"`
   - `department: "中医科"`、`visitee: "郑雪毅"`
   - `visitMethod: "上门"`、`visitCategory: "学术拜访"`、`visitPeriod: "晨访"`
   - `visitDate: "2026-01-21"`、`startClock: "09:06:00"`、`endClock: "09:28:00"`
   - `visitLocation: "福建省龙岩市新罗区北城双洋西路8号龙岩市第二医院（新院区）"`
   - `visitContent: "详细讲解学术论据，提升产品的学术价值与影响力"`
   - `customerFeedback: "客户比较满意我方提供的学术证据，表示会找合适病例"`
   - `hospital: "龙岩市第二医院（新院区）"`、`hospitalGrade: "三级甲等"`
   - `auditStatus: "已通过"`、`performanceStatus: "已评定"`、`auditComment: ""`

### 3.3 `src/components/StatusTag.tsx`

`statusConfig` 新增两枚（配色沿用现有语义色，勿新造色值）：
```ts
'待评定': { label: '待评定', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
'已评定': { label: '已评定', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
```
并把 `StatusTagStatus` 类型联合扩上 `'待评定' | '已评定'`。

### 3.4 `src/pages/VisitManagement.tsx`（主改动）

**Props 与角色**
- 新增 `currentRole: Role` prop（`import type { Role } from '../types'`）；`const isProvider = currentRole === '服务提供商'`。

**列表**
- 「服务专员」单元格改为两行（同「医院」列模式）：第一行姓名（现有样式），第二行 `record.specialistAccount`（`var(--fs-12)`、`#9CA3AF`、等宽字体）。
- 服务专员筛选同时匹配姓名或用户名。
- 「品种_规格」列的截断 span 增加 `title={record.variety}`，悬停显示完整名称（沿用「审核意见」列 `title={record.auditComment}` 的既有写法）。
- 「拜访时段」列数据源换为晨访/日访/夜访后渲染逻辑不用改，但需确认列宽仍合适（枚举值比时间段短）。
- 「审核状态」筛选下拉收敛为：待审核 / 已通过 / 已驳回。
- 顶部统计条数据源不变（`auditStatus` 计数），改完后自然只剩三种。
- 操作列按权限矩阵渲染：
  - 所有角色：「查看详情」（Eye）；
  - `isProvider` 时追加：「通过」（CheckCircle，`title="审核通过"`，仅 `auditStatus === '待审核'` 的行渲染；点击 `addToast({ type: 'success', title: '审核通过', description: \`${record.id} 已通过审核，操作已写入操作日志\` })`）、「修改」（现有占位 toast 不变）、「删除」（现有 `setDeleteTarget(record.id)` 流程不变）；
  - 药厂角色：仅「查看详情」。
- `extraActions` 中「批量审核通过 / 批量驳回 / 批量删除」及「已选 N 条」整组仅 `isProvider` 渲染；「导出」按钮所有角色保留。

**详情抽屉**
- `DetailDrawer` 传 `width={720}`（组件内部 clamp 上限即 720）。
- 抽屉体顶部新增一组小页签（本地 state，默认「记录详情」）：**记录详情 / 操作历史 / 拜访位置**。样式为文字页签：`var(--fs-13)`，激活项品牌色 + 2px 下边框，未激活 `#667085`，间距 20px，底部 1px 分隔线（`var(--color-border)`）。页脚按钮不随页签变化。
- **记录详情页签**内容自上而下：
  1. 现有状态条：审核状态 Tag + 绩效状态 Tag（现为新两态）+ 右侧开始时间；
  2. 已驳回红色提示条（现有逻辑不变）；
  3. `FieldGroup`「基础信息」：服务专员（`姓名 + 空格 + 弱色等宽用户名`）、服务提供商、工作组、医院、医院等级、**拜访科室**、**被拜访人**、**拜访方式**；
  4. `FieldGroup`「拜访信息」：品种_规格（span）、拜访类别、**拜访日期**（`visitDate`，mono）、**拜访位置**（`visitLocation`，span）、开始时间（`startClock`，mono，保留整点徽标逻辑）、结束时间（`endClock`，mono，同上）；
  5. `FieldGroup`「内容与反馈」：**拜访内容**（span）、**客户反馈**（span）；
  6. `FieldGroup`「金额」：本次金额（现有样式）、「结算状态」label 改为「审核状态」；
  7. 驳回意见面板（`showAuditPanel`）保留在详情页签内，交互不变。
- **操作历史页签**：现有 `mockTimeline` + `Timeline` 移入，外包 `FieldGroup title="操作历史"`。
- **拜访位置页签**：见第 4 节地图规格。
- 抽屉页脚：关闭按钮不变；「审核通过 / 驳回」按钮增加 `isProvider` 条件（待审核时才渲染的逻辑保留）。

### 3.5 `src/App.tsx`

`renderPage` 中 `hospital-visits` / `commercial-visits` / `pharmacy-visits` 三个 case 都改为传角色：
```tsx
<VisitManagement addToast={addToast} currentRole={currentRole} />
```

## 4. 「拜访位置」页签 · 示意地图规格

纯自绘 SVG，不依赖外网：

- 容器：占满抽屉内容宽度，`viewBox="0 0 640 360"`，圆角 8px，边框 `var(--color-border)`，背景 `#F6F8FA`。
- 底图元素（全部示意）：若干道路（`#FFFFFF` 粗线，1 条主路斜穿 + 次路网格）、街区块（`#E9EDF1` / `#EEF1F4` 圆角矩形）、1 块绿地（`#E6F5ED`）、1 块水系（`#EBF2FE`）；右下角小字「示意地图」`var(--fs-11)` `#9CA3AF`。
- **打卡标点**（地图视觉焦点，位于 viewBox 中心偏左上）：
  - 中心实心圆：`var(--color-brand)`，白描边 2px，直径约 14；
  - 外圈：同色 15% 透明度大圆（半径 28），可加缓慢脉冲 CSS 动画（尊重 `prefers-reduced-motion`，有则不动画）；
  - 上方 `MapPin`（lucide-react，18px，品牌色）。
- 标点旁信息卡（白底、边框、圆角 8、内边距 10~12、字号 12~13）：
  - 「打卡位置」小标题（`#9CA3AF`，12px）；
  - 地址全文（`visitLocation`，13px，可换行）；
  - 定位时间：`visitDate + startClock`（mono，12px，`#667085`）；
  - 示意经纬度：`N25.1032° E117.0297°`（mono，12px，`#9CA3AF`；每条记录可由 id 哈希出小数位，保证不同记录有差异）。
- 地图下方用 `FieldItem` 补一行完整地址（防止卡片遮挡时信息缺失）。

## 5. 验收清单（完成后逐项自检并在回复中列明结果）

1. 列表「绩效状态」列与抽屉状态条仅出现 待评定 / 已评定；顶部统计条仅出现 待审核 / 已通过 / 已驳回 三种计数。
2. 「审核状态」筛选项只有三项；旧状态（草稿/已打绩效/已结算）在页面任何位置不再出现。
3. 「服务专员」列显示 姓名 + 用户名两行；用 `sunli`、`zhangwei` 等用户名能搜到对应记录。
4. 抽屉宽度 720；三个页签可切换；「记录详情」含第 3.4 节全部字段；第 1 条记录（VR10000）展示第 3.2 节示例值。
5. 「拜访位置」页签显示示意地图，中心有品牌色打卡标点与地址信息卡，无外网请求（DevTools Network 无地图请求）。
6. 以「药厂销售部门」「药厂合规部门」登录：行内只有「查看详情」，勾选后不出现批量操作组，抽屉无审核按钮；「导出」仍在。
7. 以「服务提供商」登录：待审核行有「通过」按钮且点击出 toast；「修改」「删除」与批量操作正常。
8. `npm run build` 通过；8443 走查三个登录角色无 console 报错。
9. 鼠标悬停被截断的「品种_规格」单元格，浏览器原生 tooltip 显示完整名称；「拜访时段」在列表与抽屉中仅出现 晨访 / 日访 / 夜访，不再出现 "08:00-12:00" 类时间段。
10. `git status` 确认只改了上述 5 个文件；未运行 oxfmt；未 commit。
