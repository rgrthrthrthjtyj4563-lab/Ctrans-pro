import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { AIBilling, PendingScriptTask } from '../types';

/**
 * baiyee-AI 积分共享 store：付费 AI 能力统一计费中心。
 * 顶栏积分胶囊、积分确认卡、账单面板三处消费同一份数据。
 *
 * 状态放在模块级（跨登录会话保持），与 TalkScriptContext 同理：
 * 「话术页看到余额/待办 → baiyee-AI 生成扣减 → 回话术页」全程同源。
 */

/** 生成模式与积分价目（单一事实源，两页共用） */
export const AI_MODES = [
  { key: 'single', label: '单条生成', cost: 10, desc: '按品种+场景生成一条话术与配套客户反馈' },
  { key: 'package', label: '品种话术包', cost: 100, desc: '一次生成某类别下 5 条组合话术（开场/学术要点/异议应对/跟进/收尾）' },
  { key: 'checkup', label: '既有话术合规体检', cost: 2, perUnit: '条', desc: '扫描该品种既有话术，逐条输出合规风险与改写建议' },
] as const;

export type AIModeKey = (typeof AI_MODES)[number]['key'];

/** 微调价目 */
export const TUNE_COST = 5;

/** 判定「余额不足」的最低价目（微调 5 积分） */
export const MIN_COST = 5;

const SEED_BILLING: AIBilling[] = [
  { time: '2026-09-01 09:00', type: '获赠', scene: '注册赠送', variety: '—', change: 500, balance: 500, operator: '系统' },
  { time: '2026-09-02 09:00', type: '充值', scene: '体验档充值', variety: '—', change: 5000, balance: 5500, operator: '李航' },
  { time: '2026-09-03 10:00', type: '消耗', scene: 'AI品种话术包 ×8', variety: '全部品种', change: -800, balance: 4700, operator: '李航' },
  { time: '2026-09-03 14:00', type: '消耗', scene: 'AI单条生成 ×2', variety: '氨氯地平片(5mg)', change: -20, balance: 4680, operator: '李航' },
  { time: '2026-09-03 15:00', type: '消耗', scene: 'AI微调', variety: '二甲双胍缓释片(500mg)', change: -5, balance: 4675, operator: '李航' },
  { time: '2026-09-04 10:00', type: '消耗', scene: '话术合规体检（120条）', variety: '全部品种', change: -240, balance: 4435, operator: '李航' },
  { time: '2026-09-05 09:00', type: '消耗', scene: 'AI品种话术包 ×4', variety: '二甲双胍缓释片(500mg)', change: -400, balance: 4035, operator: '李航' },
  { time: '2026-09-08 15:30', type: '消耗', scene: '话术合规体检（20条）', variety: '辛伐他汀片(20mg)', change: -40, balance: 3995, operator: '李航' },
  { time: '2026-09-09 10:12', type: '返还', scene: '生成失败自动返还', variety: '瑞舒伐他汀钙片(10mg)', change: 10, balance: 4005, operator: '系统' },
  { time: '2026-09-09 16:48', type: '消耗', scene: 'AI品种话术包', variety: '二甲双胍缓释片(500mg)', change: -100, balance: 3905, operator: '李航' },
  { time: '2026-09-10 10:02', type: '消耗', scene: 'AI单条生成 ×3', variety: '氨氯地平片(5mg)', change: -30, balance: 3875, operator: '李航' },
  { time: '2026-09-10 11:05', type: '消耗', scene: 'AI微调', variety: '阿托伐他汀钙片(20mg)', change: -5, balance: 3870, operator: '李航' },
  { time: '2026-09-10 14:32', type: '消耗', scene: 'AI单条生成', variety: '阿托伐他汀钙片(20mg)', change: -10, balance: 3860, operator: '李航' },
];

const SEED_CREDITS = 3860;

/** 充值套餐（演示：对公转账口径，不产生真实订单） */
export const CREDIT_PACKAGES = [
  { key: 'starter', name: '体验档', price: 500, priceLabel: '￥500', credits: 5000, bonus: 0 },
  { key: 'standard', name: '标准档', price: 2000, priceLabel: '￥2,000', credits: 22000, bonus: 2000, popular: true },
  { key: 'enterprise', name: '企业档', price: 5000, priceLabel: '￥5,000', credits: 60000, bonus: 10000 },
] as const;

let moduleCredits = SEED_CREDITS;
let moduleBilling: AIBilling[] | null = null;

function initialBilling(): AIBilling[] {
  if (!moduleBilling) moduleBilling = SEED_BILLING.map((b) => ({ ...b }));
  return moduleBilling;
}

// ---- pendingScriptTask：话术页 → baiyee-AI 带参跳转（模块级暂存，消费即清） ----

let pendingTask: PendingScriptTask | null = null;

export function setPendingScriptTask(task: PendingScriptTask | null) {
  pendingTask = task;
}

export function consumePendingScriptTask(): PendingScriptTask | null {
  const task = pendingTask;
  pendingTask = null;
  return task;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface AICreditStore {
  credits: number;
  billing: AIBilling[];
  /** 记一笔消耗并扣减余额（演示：不产生真实扣费） */
  spend: (scene: string, variety: string, cost: number, operator?: string) => void;
  /** 记一笔返还并入账 */
  refund: (scene: string, variety: string, amount: number) => void;
  /** 演示充值入账 */
  recharge: (pkgKey: string, operator?: string) => void;
}

const AICreditContext = createContext<AICreditStore | null>(null);

export function AICreditProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<number>(moduleCredits);
  const [billing, setBilling] = useState<AIBilling[]>(() => [...initialBilling()]);

  const sync = useCallback((nextCredits: number, entry: Omit<AIBilling, 'time'>) => {
    moduleCredits = nextCredits;
    moduleBilling = [{ ...entry, time: nowStamp() }, ...(moduleBilling ?? [])];
    setCredits(moduleCredits);
    setBilling([...moduleBilling]);
  }, []);

  const spend = useCallback(
    (scene: string, variety: string, cost: number, operator = '李航') => {
      sync(moduleCredits - cost, { type: '消耗', scene, variety, change: -cost, balance: moduleCredits - cost, operator });
    },
    [sync],
  );

  const refund = useCallback(
    (scene: string, variety: string, amount: number) => {
      sync(moduleCredits + amount, { type: '返还', scene, variety, change: amount, balance: moduleCredits + amount, operator: '系统' });
    },
    [sync],
  );

  const recharge = useCallback(
    (pkgKey: string, operator = '商务·王敏') => {
      const pkg = CREDIT_PACKAGES.find((p) => p.key === pkgKey);
      if (!pkg) return;
      sync(moduleCredits + pkg.credits, {
        type: '充值',
        scene: `${pkg.name}充值${pkg.bonus > 0 ? `（赠 ${pkg.bonus.toLocaleString()}）` : ''}`,
        variety: '—',
        change: pkg.credits,
        balance: moduleCredits + pkg.credits,
        operator,
      });
    },
    [sync],
  );

  return <AICreditContext.Provider value={{ credits, billing, spend, refund, recharge }}>{children}</AICreditContext.Provider>;
}

export function useAICredit(): AICreditStore {
  const ctx = useContext(AICreditContext);
  if (!ctx) throw new Error('useAICredit 必须在 AICreditProvider 内使用');
  return ctx;
}
