import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { GeneralScript, ProductScript, ScriptManageStatus } from '../types';

/**
 * 话术管理共享 store（《话术管理功能需求文档》V1.1 口径）：
 * 通用话术（系统内置，GS 编号）与品种话术（PN 编号，按子场景组织）两个数据集。
 * 话术管理页（列表/筛选/启停/导入导出/抽屉维护）与 baiyee-AI 采纳入库操作同一份数据。
 *
 * 状态放在模块级：切换登录角色会重建整个工作台（session key），
 * 而「baiyee-AI 生成采纳 → 话术页启用」需要跨会话保持。
 */

/* ─── 基础字典（需求文档 6.4 场景与类别字典） ─────────────────────── */

/** 品种主数据字典（原型内置 8 个品种） */
export const SCRIPT_PRODUCTS = [
  '阿卡波糖片',
  '苯磺酸氨氯地平片',
  '阿托伐他汀钙片',
  '盐酸二甲双胍缓释片',
  '硫酸氢氯吡格雷片',
  '缬沙坦胶囊',
  '恩替卡韦分散片',
  '甘精胰岛素注射液',
] as const;

/** 通用话术类别 */
export const GENERAL_CATS = ['开场白', '产品介绍', '异议处理', '促成成交', '客情维护'] as const;

/** 拜访场景（一级） */
export const SCENE_LIST = ['终端拜访', '药房拜访', '商业拜访', '其他场景拜访'] as const;

/** 拜访场景 → 业务类别（二级） */
export const BIZ_CAT_MAP: Record<string, readonly string[]> = {
  终端拜访: ['第三终端拜访', '患者随访', '跟台服务'],
  药房拜访: ['连锁药房拜访', '单体药房拜访', '店员教育'],
  商业拜访: ['商业公司首访', '订单与回款对账', '供应保障沟通'],
  // 需求文档说明：其他场景拜访当前复用终端拜访字典（待业务确认，见 Q12）
  其他场景拜访: ['第三终端拜访', '患者随访', '跟台服务'],
};

/** 业务类别 → 类别细分（三级，跟台服务无细分） */
export const SUB_CAT_MAP: Record<string, readonly string[]> = {
  第三终端拜访: ['第三终端拜访', '信息收集和调研', '跟踪巡访服务'],
  患者随访: ['患者随访', '问卷'],
  跟台服务: [],
  连锁药房拜访: ['首推品种沟通', '陈列与动销', '会员活动'],
  单体药房拜访: ['采购计划', '店员推荐'],
  店员教育: ['培训安排', '物料支持'],
  商业公司首访: ['合作模式介绍', '品种目录推介'],
  订单与回款对账: ['订单计划', '账期与返利'],
  供应保障沟通: ['冷链与配送', '库存与预警'],
};

export const ALL_BIZ_CATS = [...new Set(Object.values(BIZ_CAT_MAP).flat())];
export const ALL_SUB_CATS = [...new Set(Object.values(SUB_CAT_MAP).flat())];

/** 编号规则：类型前缀 + "-" + 4 位流水（需求文档 6.3） */
const PREFIX = { general: 'GS', product: 'PN' } as const;

/** 判重口径（需求文档 7.3）：拜访场景 + 品种 + 业务类别 + 类别细分 + 话术内容 */
export function dupKeyOf(scene: string, product: string, bizCat: string, subCat: string, content: string): string {
  return [scene, product, bizCat, subCat, content].join('|');
}

/* ─── 兼容别名：baiyee-AI 生成场景沿用旧变量名（一级=拜访场景、二级=业务类别） ─── */

export const VARIETIES = SCRIPT_PRODUCTS;
export const FIRST_CATS = SCENE_LIST;
export const SUB_CATS: Record<string, readonly string[]> = BIZ_CAT_MAP;

/* ─── 种子数据（与新原型 v1.1 一致） ─────────────────────────────── */

const SEED_GENERAL: GeneralScript[] = [
  { id: 'GS-0001', category: '开场白', feedback: '', content: '王老师您好，我是京卫医药学术部的小林。今天想占用您两分钟，同步一下我们重点品种最新的临床使用反馈和文献，您看方便吗？', status: '启用', creator: '张药学', createdAt: '2026-09-12 10:22', updatedAt: '2026-10-08 16:40', updater: '王药学' },
  { id: 'GS-0002', category: '异议处理', feedback: '安全担忧', content: '非常理解您对患者耐受性的顾虑。这个品种在老年患者中的不良反应发生率与对照相当，我可以把这项真实世界研究的数据发到您邮箱。', status: '启用', creator: '张药学', createdAt: '2026-09-15 14:03', updatedAt: '2026-09-15 14:03', updater: '张药学' },
  { id: 'GS-0003', category: '促成成交', feedback: '价格贵', content: '王老师，要不这样，我们先安排 5 例患者规范试用两周，之后我来门诊跟您回访一次使用感受，您看可以吗？', status: '启用', creator: '李学术', createdAt: '2026-09-20 09:31', updatedAt: '2026-10-11 11:26', updater: '张药学' },
  { id: 'GS-0004', category: '客情维护', feedback: '', content: '王老师，最近换季感冒高发，您出门诊辛苦了。用药方面有任何需要随时微信我。', status: '启用', creator: '张药学', createdAt: '2026-08-30 16:12', updatedAt: '2026-10-15 10:05', updater: '张药学' },
  { id: 'GS-0005', category: '产品介绍', feedback: '竞品比较', content: '我们这个产品是原研工艺，杂质谱控制更严格，适合长期用药的患者，疗效一致性也有生物等效性数据支持。', status: '启用', creator: '王药学', createdAt: '2026-10-06 15:44', updatedAt: '2026-10-06 15:44', updater: '王药学' },
];

const SEED_PRODUCT: ProductScript[] = [
  { id: 'PN-0001', scene: '终端拜访', product: '阿卡波糖片', bizCat: '第三终端拜访', subCat: '第三终端拜访', feedback: '疗效疑虑', content: '老师，阿卡波糖片是国家基药目录品种，社区慢病续方开药更方便；配合餐时服用方案，餐后血糖控制更平稳，多数患者两周内就能看到餐后 2 小时血糖的下降。', status: '启用', creator: '张药学', createdAt: '2026-09-10 09:15', updatedAt: '2026-10-12 14:20', updater: '张药学' },
  { id: 'PN-0002', scene: '终端拜访', product: '苯磺酸氨氯地平片', bizCat: '第三终端拜访', subCat: '信息收集和调研', feedback: '', content: '社区高血压患者取药频次高，氨氯地平一天一次服用依从性好，社区药房备货后患者就近续方更方便。', status: '启用', creator: '李学术', createdAt: '2026-09-18 13:27', updatedAt: '2026-09-18 13:27', updater: '李学术' },
  { id: 'PN-0003', scene: '终端拜访', product: '阿托伐他汀钙片', bizCat: '患者随访', subCat: '患者随访', feedback: '价格贵', content: '算下来每天不到一块钱，长期坚持降脂治疗负担小；随访时可以帮患者把服药时间固定在晚饭后，漏服率会明显下降。', status: '启用', creator: '张药学', createdAt: '2026-09-11 10:40', updatedAt: '2026-10-09 09:55', updater: '王药学' },
  { id: 'PN-0004', scene: '终端拜访', product: '盐酸二甲双胍缓释片', bizCat: '患者随访', subCat: '患者随访', feedback: '安全担忧', content: '缓释剂型晚餐后一次服用，胃肠道刺激明显小于普通片；随访时提醒患者随餐服用，不适感会更轻。', status: '停用', creator: '张药学', createdAt: '2026-10-09 10:12', updatedAt: '2026-10-16 09:47', updater: '张药学' },
  { id: 'PN-0005', scene: '终端拜访', product: '硫酸氢氯吡格雷片', bizCat: '跟台服务', subCat: '', feedback: '竞品比较', content: '支架术后抗血小板方案按指南执行，随访时提醒患者不可自行停药，复查周期按医嘱安排。', status: '启用', creator: '张药学', createdAt: '2026-09-25 15:02', updatedAt: '2026-10-14 16:31', updater: '张药学' },
  { id: 'PN-0006', scene: '药房拜访', product: '缬沙坦胶囊', bizCat: '连锁药房拜访', subCat: '首推品种沟通', feedback: '不愿首推', content: '店员首推时可以强调一天一次胶囊剂型，老年患者吞服方便，回头客复购率高。', status: '启用', creator: '王药学', createdAt: '2026-09-28 11:18', updatedAt: '2026-10-13 15:28', updater: '张药学' },
  { id: 'PN-0007', scene: '药房拜访', product: '恩替卡韦分散片', bizCat: '店员教育', subCat: '培训安排', feedback: '', content: '店员培训重点讲分散剂型服用方便、耐药屏障高，慢病顾客长期用药稳定，适合作为肝病品类首推。', status: '停用', creator: '李学术', createdAt: '2026-10-08 09:51', updatedAt: '2026-10-17 11:02', updater: '张药学' },
  { id: 'PN-0008', scene: '商业拜访', product: '甘精胰岛素注射液', bizCat: '供应保障沟通', subCat: '冷链与配送', feedback: '供货与配送', content: '冷链配送全程温控可追溯，月度对账和库存预警都有专人对接，商业公司备货没有后顾之忧。', status: '启用', creator: '张药学', createdAt: '2026-09-14 09:20', updatedAt: '2026-10-10 10:10', updater: '张药学', isCoop: '是' },
  { id: 'PN-0009', scene: '商业拜访', product: '阿卡波糖片', bizCat: '订单与回款对账', subCat: '账期与返利', feedback: '', content: '季度订单量到位可申请阶梯返利，折算采购成本更有优势；账期按协议执行，月底统一对账。', status: '启用', creator: '张药学', createdAt: '2026-09-16 10:05', updatedAt: '2026-10-18 14:52', updater: '张药学', isCoop: '否' },
  { id: 'PN-0010', scene: '其他场景拜访', product: '阿托伐他汀钙片', bizCat: '第三终端拜访', subCat: '信息收集和调研', feedback: '', content: '这期科室会主题是血脂管理新进展，面向心内科和内分泌科，会后有病例讨论环节，欢迎老师带病例参加。', status: '启用', creator: '王药学', createdAt: '2026-10-11 16:22', updatedAt: '2026-10-11 16:22', updater: '王药学' },
];

/* ─── 模块级持久化（跨角色切换保留 AI 采纳入库数据） ─────────────── */

interface ScriptStoreData {
  general: GeneralScript[];
  product: ProductScript[];
}

let moduleData: ScriptStoreData | null = null;

function initialData(): ScriptStoreData {
  if (!moduleData) {
    moduleData = {
      general: SEED_GENERAL.map((s) => ({ ...s })),
      product: SEED_PRODUCT.map((s) => ({ ...s })),
    };
  }
  return moduleData;
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 演示环境默认操作人 */
export const CURRENT_USER = '张药学';

function nextId(kind: 'general' | 'product'): string {
  const prefix = PREFIX[kind];
  let max = 0;
  (moduleData?.[kind] ?? []).forEach((r) => {
    const n = parseInt(String(r.id).split('-')[1], 10) || 0;
    if (n > max) max = n;
  });
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/* ─── Store 定义 ─────────────────────────────────────────────────── */

/** 新增/编辑品种话术的可写字段（编号、场景、审计字段由 store 维护；status 缺省按启用） */
export type ProductScriptInput = Pick<ProductScript, 'product' | 'bizCat' | 'subCat' | 'feedback' | 'content'> & {
  scene: string;
  status?: ProductScript['status'];
  isCoop?: '是' | '否';
};

export interface ImportRowInput {
  product: string;
  bizCat: string;
  subCat: string;
  feedback: string;
  content: string;
  status: '启用' | '停用';
}

interface TalkScriptStore {
  general: GeneralScript[];
  product: ProductScript[];
  /** 新增品种话术：生成 PN 编号、插入列表首位（FR-18） */
  addProduct: (data: ProductScriptInput) => ProductScript;
  /** 编辑品种话术：保留编号与拜访场景，更新业务字段与更新人/时间（FR-18） */
  updateProduct: (id: string, patch: Omit<ProductScriptInput, 'scene'>) => void;
  /** 单条启停（FR-12） */
  setProductStatus: (id: string, status: ScriptManageStatus) => void;
  /** 批量启停（FR-13，本期仅停用；能力通用） */
  batchSetProductStatus: (ids: string[], status: ScriptManageStatus) => void;
  /** CSV 导入：按模板顺序写入，创建人固定"批量导入"（FR-24） */
  importProducts: (scene: string, rows: ImportRowInput[]) => void;
  /** AI 撤销采纳专用删除（页面无删除入口，需求 7.2 不提供物理删除） */
  removeProduct: (id: string) => void;
  /** 通用话术单条启停（FR-07） */
  setGeneralStatus: (id: string, status: '启用' | '停用') => void;
  /** 通用话术批量启停（FR-07） */
  batchSetGeneralStatus: (ids: string[], status: '启用' | '停用') => void;
  /** 通用话术全局启停（FR-07） */
  setAllGeneralStatus: (status: '启用' | '停用') => void;
  /** baiyee-AI 采纳：置 isAI + 待启用 + 确认人留痕 */
  adoptFromAI: (data: ProductScriptInput & { confirmBy: string }) => void;
}

const TalkScriptContext = createContext<TalkScriptStore | null>(null);

export function TalkScriptProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ScriptStoreData>(() => ({
    general: [...initialData().general],
    product: [...initialData().product],
  }));

  const sync = useCallback(() => {
    if (moduleData) setData({ general: [...moduleData.general], product: [...moduleData.product] });
  }, []);

  const addProduct = useCallback(
    (input: ProductScriptInput): ProductScript => {
      const rec: ProductScript = {
        id: nextId('product'),
        scene: input.scene,
        product: input.product,
        bizCat: input.bizCat,
        subCat: input.subCat,
        feedback: input.feedback,
        content: input.content,
        status: input.status ?? '启用',
        isCoop: input.isCoop,
        creator: CURRENT_USER,
        createdAt: nowStr(),
        updatedAt: nowStr(),
        updater: CURRENT_USER,
      };
      moduleData = { ...(moduleData ?? initialData()), product: [rec, ...(moduleData?.product ?? [])] };
      sync();
      return rec;
    },
    [sync],
  );

  const updateProduct = useCallback(
    (id: string, patch: Omit<ProductScriptInput, 'scene'>) => {
      moduleData = {
        ...(moduleData ?? initialData()),
        product: (moduleData?.product ?? []).map((s) =>
          s.id === id
            ? {
                ...s,
                product: patch.product,
                bizCat: patch.bizCat,
                subCat: patch.subCat,
                feedback: patch.feedback,
                content: patch.content,
                status: patch.status ?? s.status,
                isCoop: patch.isCoop,
                updatedAt: nowStr(),
                updater: CURRENT_USER,
              }
            : s,
        ),
      };
      sync();
    },
    [sync],
  );

  const setProductStatus = useCallback(
    (id: string, status: ScriptManageStatus) => {
      moduleData = {
        ...(moduleData ?? initialData()),
        product: (moduleData?.product ?? []).map((s) => (s.id === id ? { ...s, status, updatedAt: nowStr(), updater: CURRENT_USER } : s)),
      };
      sync();
    },
    [sync],
  );

  const batchSetProductStatus = useCallback(
    (ids: string[], status: ScriptManageStatus) => {
      const set = new Set(ids);
      moduleData = {
        ...(moduleData ?? initialData()),
        product: (moduleData?.product ?? []).map((s) =>
          set.has(s.id) ? { ...s, status, updatedAt: nowStr(), updater: CURRENT_USER } : s,
        ),
      };
      sync();
    },
    [sync],
  );

  const importProducts = useCallback(
    (scene: string, rows: ImportRowInput[]) => {
      const stamp = nowStr();
      const recs: ProductScript[] = rows.map((r) => ({
        id: nextId('product'),
        scene,
        product: r.product,
        bizCat: r.bizCat,
        subCat: r.subCat,
        feedback: r.feedback,
        content: r.content,
        status: r.status,
        isCoop: scene === '商业拜访' ? '是' : undefined,
        creator: '批量导入',
        createdAt: stamp,
        updatedAt: stamp,
        updater: '批量导入',
      }));
      moduleData = { ...(moduleData ?? initialData()), product: [...recs, ...(moduleData?.product ?? [])] };
      sync();
    },
    [sync],
  );

  const removeProduct = useCallback(
    (id: string) => {
      moduleData = { ...(moduleData ?? initialData()), product: (moduleData?.product ?? []).filter((s) => s.id !== id) };
      sync();
    },
    [sync],
  );

  const setGeneralStatus = useCallback(
    (id: string, status: '启用' | '停用') => {
      moduleData = {
        ...(moduleData ?? initialData()),
        general: (moduleData?.general ?? []).map((s) => (s.id === id ? { ...s, status, updatedAt: nowStr(), updater: CURRENT_USER } : s)),
      };
      sync();
    },
    [sync],
  );

  const batchSetGeneralStatus = useCallback(
    (ids: string[], status: '启用' | '停用') => {
      const set = new Set(ids);
      moduleData = {
        ...(moduleData ?? initialData()),
        general: (moduleData?.general ?? []).map((s) =>
          set.has(s.id) ? { ...s, status, updatedAt: nowStr(), updater: CURRENT_USER } : s,
        ),
      };
      sync();
    },
    [sync],
  );

  const setAllGeneralStatus = useCallback(
    (status: '启用' | '停用') => {
      moduleData = {
        ...(moduleData ?? initialData()),
        general: (moduleData?.general ?? []).map((s) => ({ ...s, status, updatedAt: nowStr(), updater: CURRENT_USER })),
      };
      sync();
    },
    [sync],
  );

  const adoptFromAI = useCallback(
    (input: ProductScriptInput & { confirmBy: string }) => {
      const { confirmBy, ...rest } = input;
      const rec: ProductScript = {
        id: nextId('product'),
        ...rest,
        isCoop: rest.scene === '商业拜访' ? (rest.isCoop ?? '是') : rest.isCoop,
        status: '待启用',
        creator: CURRENT_USER,
        createdAt: nowStr(),
        updatedAt: nowStr(),
        updater: CURRENT_USER,
        isAI: true,
        confirmBy,
      };
      moduleData = { ...(moduleData ?? initialData()), product: [rec, ...(moduleData?.product ?? [])] };
      sync();
    },
    [sync],
  );

  return (
    <TalkScriptContext.Provider
      value={{
        general: data.general,
        product: data.product,
        addProduct,
        updateProduct,
        setProductStatus,
        batchSetProductStatus,
        importProducts,
        removeProduct,
        setGeneralStatus,
        batchSetGeneralStatus,
        setAllGeneralStatus,
        adoptFromAI,
      }}
    >
      {children}
    </TalkScriptContext.Provider>
  );
}

export function useTalkScript(): TalkScriptStore {
  const ctx = useContext(TalkScriptContext);
  if (!ctx) throw new Error('useTalkScript 必须在 TalkScriptProvider 内使用');
  return ctx;
}
