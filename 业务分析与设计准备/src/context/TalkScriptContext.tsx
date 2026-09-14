import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { TalkScript } from '../types';

/**
 * 品种话术共享 store：品种话术维护页（增删改查/启停/导入导出）
 * 与 baiyee-AI 话术生成场景（采纳入库）操作同一份数据。
 *
 * 状态放在模块级：切换登录角色会重建整个工作台（session key），
 * 而「baiyee-AI 生成采纳 → 话术页启用」需要跨会话保持。
 */

export const VARIETIES = [
  '阿托伐他汀钙片(20mg)',
  '瑞舒伐他汀钙片(10mg)',
  '二甲双胍缓释片(500mg)',
  '氨氯地平片(5mg)',
  '奥美拉唑肠溶胶囊(20mg)',
  '辛伐他汀片(20mg)',
] as const;

export const ALL_VARIETIES = ['通用品种', ...VARIETIES];

export const FIRST_CATS = ['终端拜访', '商业拜访', '药房拜访', '第三终端拜访', '患者随访', '信息调研', '跟台服务'] as const;

/** 搜索区不提供「信息调研」筛选项（手册规则） */
export const SEARCH_FIRST_CATS = FIRST_CATS.filter((c) => c !== '信息调研');

export const SUB_CATS: Record<string, string[]> = {
  终端拜访: ['学术拜访', '日常拜访', '信息收集和调研', '跟踪巡访服务', '第三终端服务'],
  商业拜访: ['商业信息收集和调研', '商务服务', '商业库存信息收集'],
  药房拜访: ['药房拜访'],
  第三终端拜访: ['第三终端拜访', '信息收集和调研', '跟踪巡访服务'],
  患者随访: ['患者随访/问卷调研'],
  信息调研: ['潜在客户调研', '现实客户调研'],
  跟台服务: [],
};

export const DEPT_RULES = ['不限制', '心血管内科与内分泌科', '三医院重点科室白名单'];

/** 判重口径（手册）：同品种下一级+二级+话术内容+客户反馈完全相同视为重复 */
export function isDuplicateScript(list: TalkScript[], variety: string, firstCat: string, secondCat: string, content: string, feedback: string): boolean {
  return list.some(
    (s) => s.variety === variety && s.firstCat === firstCat && s.secondCat === secondCat && s.content === content && s.feedback === feedback,
  );
}

const SEED_SCRIPTS: TalkScript[] = [
  { id: 1, variety: '阿托伐他汀钙片(20mg)', firstCat: '终端拜访', secondCat: '学术拜访', content: '医生您好，阿托伐他汀钙片用于高胆固醇血症与混合型血脂异常，临床研究显示可有效降低LDL-C水平，是经临床验证的降脂治疗选择', feedback: '了解，我有几位患者LDL-C未达标，可以尝试方案调整', isDefault: '否', status: '启用', isCoop: '是', deptRule: '心血管内科与内分泌科' },
  { id: 2, variety: '阿托伐他汀钙片(20mg)', firstCat: '终端拜访', secondCat: '日常拜访', content: '本次来访想同步阿托伐他汀钙片的最新价格政策与库存情况，方便您制定采购计划', feedback: '价格政策收到，本月采购计划已确认', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 3, variety: '阿托伐他汀钙片(20mg)', firstCat: '患者随访', secondCat: '患者随访/问卷调研', content: '您好，回访用药情况：服药后有无肌肉酸痛等不适，请配合完成一份简短的用药感受问卷', feedback: '没有明显不适，血脂复查已预约', isDefault: '否', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 4, variety: '瑞舒伐他汀钙片(10mg)', firstCat: '终端拜访', secondCat: '学术拜访', content: '瑞舒伐他汀钙片适用于经饮食控制仍不达标的原发性高胆固醇血症，强效降脂同时安全性良好', feedback: '临床上中重度患者确实需要强效降脂方案', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 5, variety: '瑞舒伐他汀钙片(10mg)', firstCat: '终端拜访', secondCat: '信息收集和调研', content: '想了解贵院他汀类药品本月的处方结构与竞品动态，为后续学术支持做参考', feedback: '竞品近期有学术会议推广，处方略有分流', isDefault: '否', status: '禁用', isCoop: '是', deptRule: '不限制' },
  { id: 6, variety: '二甲双胍缓释片(500mg)', firstCat: '终端拜访', secondCat: '学术拜访', content: '二甲双胍缓释片是2型糖尿病一线用药，缓释剂型胃肠耐受更好，老年患者依从性显著改善', feedback: '认可，老年患者依从性确实是关注点', isDefault: '否', status: '启用', isCoop: '是', deptRule: '心血管内科与内分泌科' },
  { id: 7, variety: '二甲双胍缓释片(500mg)', firstCat: '终端拜访', secondCat: '跟踪巡访服务', content: '按上次沟通补充缓释片夜间服药依从性数据资料，重点说明与普通片的耐受性对比', feedback: '资料收到，会在科室例会上同步', isDefault: '否', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 8, variety: '二甲双胍缓释片(500mg)', firstCat: '患者随访', secondCat: '患者随访/问卷调研', content: '您好，回访血糖控制情况与胃肠道反应，缓释剂型服用体验是否优于之前的普通片', feedback: '饭后腹胀比之前普通片明显减轻', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 9, variety: '氨氯地平片(5mg)', firstCat: '终端拜访', secondCat: '日常拜访', content: '氨氯地平片适用于高血压，长效制剂一日一次平稳控压，方便老年患者坚持服药', feedback: '门诊老年高血压患者用量稳定', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 10, variety: '氨氯地平片(5mg)', firstCat: '终端拜访', secondCat: '第三终端服务', content: '基层医疗机构慢病目录执行情况与氨氯地平备货情况沟通，确保慢病患者持续用药', feedback: '基层备货正常，下季度按目录采购', isDefault: '否', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 11, variety: '氨氯地平片(5mg)', firstCat: '信息调研', secondCat: '潜在客户调研', content: '想了解贵院高血压用药的市场格局与入院流程，为产品进入贵院做提前准备', feedback: '入院需药事会审批，可先提交资料', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 12, variety: '奥美拉唑肠溶胶囊(20mg)', firstCat: '终端拜访', secondCat: '学术拜访', content: '奥美拉唑肠溶胶囊用于胃溃疡、十二指肠溃疡与反流性食管炎，质子泵抑制剂中安全性与疗效兼备', feedback: '消化科质子泵抑制剂用量稳定', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 13, variety: '奥美拉唑肠溶胶囊(20mg)', firstCat: '药房拜访', secondCat: '药房拜访', content: '想了解贵药房奥美拉唑肠溶胶囊的动销与陈列情况，配合季度学术推广活动', feedback: '动销平稳，周末有客流高峰', isDefault: '否', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 14, variety: '奥美拉唑肠溶胶囊(20mg)', firstCat: '信息调研', secondCat: '现实客户调研', content: '回访上月集中采购的使用反馈与不良反应上报情况，收集真实使用数据', feedback: '无不良反应上报，使用反馈良好', isDefault: '否', status: '禁用', isCoop: '是', deptRule: '不限制' },
  { id: 15, variety: '辛伐他汀片(20mg)', firstCat: '商业拜访', secondCat: '商务服务', content: '同步辛伐他汀片季度商业政策与回款节奏，确认合作条款执行情况', feedback: '政策清楚，按协议执行', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 16, variety: '辛伐他汀片(20mg)', firstCat: '商业拜访', secondCat: '商业库存信息收集', content: '想核对商业公司当前库存批次与效期情况，确保供应链安全', feedback: '当前库存2个批次，效期均到2028', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 17, variety: '辛伐他汀片(20mg)', firstCat: '第三终端拜访', secondCat: '第三终端拜访', content: '第三终端连锁门店辛伐他汀片铺货与店员教育沟通，提升终端销售能力', feedback: '铺货已完成，店员培训希望安排一次', isDefault: '否', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 18, variety: '辛伐他汀片(20mg)', firstCat: '商业拜访', secondCat: '商业信息收集和调研', content: '了解区域商业流向数据与窜货预警情况，维护市场秩序', feedback: '本季度流向正常，无异动', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 19, variety: '通用品种', firstCat: '终端拜访', secondCat: '学术拜访', content: '您好，本次来访想同步我司产品最新的临床研究进展与学术资料，欢迎定期交流', feedback: '欢迎定期来科室同步资料', isDefault: '是', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 20, variety: '通用品种', firstCat: '终端拜访', secondCat: '日常拜访', content: '您好，例行拜访，想了解近期用药反馈与需求，持续为您的诊疗工作提供支持', feedback: '反馈平稳，有需要会联系您', isDefault: '是', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 21, variety: '通用品种', firstCat: '患者随访', secondCat: '患者随访/问卷调研', content: '您好，按计划进行用药依从性回访，了解您的服药规律与健康状况', feedback: '服药规律，感谢回访', isDefault: '是', status: '启用', isCoop: '否', deptRule: '不限制' },
  { id: 22, variety: '阿托伐他汀钙片(20mg)', firstCat: '终端拜访', secondCat: '跟踪巡访服务', content: '按约定回访上次学术拜访遗留的疑问并补充资料，跟进治疗方案调整情况', feedback: '资料完整，疑问已解决', isDefault: '否', status: '禁用', isCoop: '是', deptRule: '三医院重点科室白名单' },
  { id: 23, variety: '二甲双胍缓释片(500mg)', firstCat: '第三终端拜访', secondCat: '信息收集和调研', content: '收集第三终端糖尿病用药目录与采购偏好，了解市场竞争格局', feedback: '目录内品种优先，月度集中采购', isDefault: '否', status: '启用', isCoop: '是', deptRule: '不限制' },
  { id: 24, variety: '氨氯地平片(5mg)', firstCat: '跟台服务', secondCat: '—', content: '跟台服务过程中同步产品信息与使用反馈，配合手术室规范化用药管理', feedback: '手术跟台安排以医院通知为准', isDefault: '否', status: '禁用', isCoop: '是', deptRule: '不限制' },
];

let moduleScripts: TalkScript[] | null = null;

function initialScripts(): TalkScript[] {
  if (!moduleScripts) moduleScripts = SEED_SCRIPTS.map((s) => ({ ...s }));
  return moduleScripts;
}

export type NewScriptInput = Pick<TalkScript, 'variety' | 'firstCat' | 'secondCat' | 'content' | 'feedback'>;

interface TalkScriptStore {
  scripts: TalkScript[];
  addScript: (data: NewScriptInput) => void;
  updateScript: (id: number, patch: { content: string; feedback: string }) => void;
  removeScript: (id: number) => void;
  removeScripts: (ids: number[]) => void;
  toggleStatus: (id: number) => void;
  toggleCoop: (id: number) => void;
  setDeptRule: (id: number, rule: string) => void;
  /** baiyee-AI 采纳：置 isAI + 待启用 + 合作性 + 确认人留痕 */
  adoptFromAI: (data: NewScriptInput & { confirmBy: string }) => void;
}

const TalkScriptContext = createContext<TalkScriptStore | null>(null);

export function TalkScriptProvider({ children }: { children: ReactNode }) {
  const [scripts, setScripts] = useState<TalkScript[]>(() => [...initialScripts()]);

  const sync = useCallback(() => {
    setScripts([...(moduleScripts ?? [])]);
  }, []);

  const addScript = useCallback(
    (data: NewScriptInput) => {
      moduleScripts = [
        { id: Date.now(), ...data, isDefault: data.variety === '通用品种' ? '是' : '否', status: '启用', isCoop: '是', deptRule: '不限制' },
        ...(moduleScripts ?? []),
      ];
      sync();
    },
    [sync],
  );

  const updateScript = useCallback(
    (id: number, patch: { content: string; feedback: string }) => {
      moduleScripts = (moduleScripts ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
      sync();
    },
    [sync],
  );

  const removeScript = useCallback(
    (id: number) => {
      moduleScripts = (moduleScripts ?? []).filter((s) => s.id !== id);
      sync();
    },
    [sync],
  );

  const removeScripts = useCallback(
    (ids: number[]) => {
      const set = new Set(ids);
      moduleScripts = (moduleScripts ?? []).filter((s) => !set.has(s.id));
      sync();
    },
    [sync],
  );

  const toggleStatus = useCallback(
    (id: number) => {
      // 启用→禁用；禁用/待启用（AI 入库初始态）→启用
      moduleScripts = (moduleScripts ?? []).map((s) =>
        s.id === id ? { ...s, status: s.status === '启用' ? '禁用' : '启用' } : s,
      );
      sync();
    },
    [sync],
  );

  const toggleCoop = useCallback(
    (id: number) => {
      moduleScripts = (moduleScripts ?? []).map((s) => (s.id === id ? { ...s, isCoop: s.isCoop === '是' ? '否' : '是' } : s));
      sync();
    },
    [sync],
  );

  const setDeptRule = useCallback(
    (id: number, rule: string) => {
      moduleScripts = (moduleScripts ?? []).map((s) => (s.id === id ? { ...s, deptRule: rule } : s));
      sync();
    },
    [sync],
  );

  const adoptFromAI = useCallback(
    (data: NewScriptInput & { confirmBy: string }) => {
      moduleScripts = [
        {
          id: Date.now(),
          ...data,
          isDefault: '否',
          status: '待启用',
          isCoop: '是',
          deptRule: '不限制',
          isAI: true,
          confirmBy: data.confirmBy,
        },
        ...(moduleScripts ?? []),
      ];
      sync();
    },
    [sync],
  );

  return (
    <TalkScriptContext.Provider
      value={{ scripts, addScript, updateScript, removeScript, removeScripts, toggleStatus, toggleCoop, setDeptRule, adoptFromAI }}
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
