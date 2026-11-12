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

环境要求：**Node.js ≥ 20.19**（推荐 22.x），**pnpm 10.x**。

```bash
# 1. 克隆仓库
git clone git@github.com:rgrthrthrthjtyj4563-lab/Ctrans-pro.git
cd Ctrans-pro/业务分析与设计准备

# 2. 安装 pnpm（已装可跳过）
npm install -g pnpm@10
# 使用 mise 的开发者可直接在仓库根目录执行 mise install

# 3. 安装依赖并启动
pnpm install
pnpm dev
```

启动后访问终端输出的地址（默认 <http://localhost:5173>）。

## 常用命令

在 `业务分析与设计准备/` 目录下执行：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm test` | 运行单元 / 回归测试（Vitest） |
| `pnpm build` | 生产构建，输出到 `dist/` |
| `pnpm preview` | 本地预览构建产物 |

## 说明

- 依赖锁定文件为 `pnpm-lock.yaml`，请勿使用 npm / yarn 安装，以免锁文件冲突。
- 原型为纯前端应用，数据来自 `src/data/` 下的内存 Mock，无需后端服务即可运行。
