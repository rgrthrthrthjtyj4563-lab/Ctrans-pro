# 贝医项目 · 重构工作区

本仓库是贝医药合作系统重构的工作区，包含可运行的高保真原型应用与需求/设计文档。

## 仓库结构

| 目录 / 文件 | 说明 |
| --- | --- |
| `业务分析与设计准备/` | **原型应用**（Vite + React 19 + TypeScript + Tailwind 4），核心代码在 `src/` |
| `业务分析与设计准备/docs/` | 功能设计文档与验收截图 |
| `业务分析与设计准备/*.md` | 各专项需求描述、AI 执行提示词、整改方案 |
| `AI交接文档-*.md`、`分支收口记录-*.md` | 阶段性交接与分支收口记录 |
| `验收记录/` | 验收过程记录 |

> 根目录下的 `output/`、`outputs/`、`文档/` 等为本地工作材料，已在 `.gitignore` 中排除，不会进入仓库。

## 快速启动（面向开发者）

### 第 0 步：准备环境

需要安装三样东西：

1. **Git**（`git --version` 能出版本号即可）
2. **Node.js ≥ 20.19**（推荐 22.x，`node -v` 查看；没有就去 <https://nodejs.org> 下载 LTS 版）
3. **pnpm 10**（包管理器，项目锁定文件是 `pnpm-lock.yaml`）：

   ```bash
   npm install -g pnpm@10
   pnpm -v   # 能出版本号即可
   ```

### 第 1 步：克隆代码

```bash
git clone git@github.com:rgrthrthrthjtyj4563-lab/Ctrans-pro.git
cd Ctrans-pro/业务分析与设计准备
```

> 没配 GitHub SSH Key 的话，改用 HTTPS 方式克隆：
> `git clone https://github.com/rgrthrthrthjtyj4563-lab/Ctrans-pro.git`

### 第 2 步：安装依赖

```bash
pnpm install
```

### 第 3 步：启动

```bash
pnpm dev
```

启动成功后浏览器访问 **<http://localhost:8443>**。

### 常用命令

在 `业务分析与设计准备/` 目录下执行：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器（端口 8443） |
| `pnpm test` | 运行单元 / 回归测试（Vitest） |
| `pnpm build` | 生产构建，输出到 `dist/` |
| `pnpm preview` | 本地预览构建产物 |

## 常见问题

- **端口 8443 被占用**：配置了 `strictPort`，不会自动换端口，会直接报错退出。换个端口启动：
  - macOS / Linux：`PORT=3000 pnpm dev`
  - Windows PowerShell：`$env:PORT=3000; pnpm dev`
- **不要用 npm / yarn 安装依赖**：会生成另一套锁文件导致依赖漂移，统一用 pnpm。
- **Node 版本过低**：Vite 8 要求 Node ≥ 20.19，`node -v` 低于该版本请先升级。
- 使用 [mise](https://mise.jdx.dev/) 的开发者，在应用目录执行 `mise install` 即可自动装好 Node 22 与 pnpm 10。
- 原型为纯前端应用，数据来自 `src/data/` 下的内存 Mock，无需后端服务即可运行。
