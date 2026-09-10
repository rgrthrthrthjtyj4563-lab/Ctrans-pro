import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Representative } from '../types';
import { seedRepresentatives } from '../data/complianceData';

/**
 * 医药代表备案共享 store：用户与组织（新建服务专员时创建待审核档案）
 * 与备案管理页（审核 / 台账 / 编辑）操作同一份数据。
 * 身份源统一后，备案档案均挂 userId；备案页不再提供新建入口。
 *
 * 状态放在模块级：切换登录角色会重建整个工作台（session key），
 * 而演示链路需要「A 角色建档 → B 角色审核」跨会话保持数据。
 */
let moduleReps: Representative[] | null = null;

function initialReps(): Representative[] {
  if (!moduleReps) moduleReps = seedRepresentatives.map((r) => ({ ...r }));
  return moduleReps;
}

interface RepFilingStore {
  reps: Representative[];
  addRep: (rep: Representative) => void;
  updateRep: (id: string, updater: (r: Representative) => Representative) => void;
}

const RepFilingContext = createContext<RepFilingStore | null>(null);

export function RepFilingProvider({ children }: { children: ReactNode }) {
  const [reps, setReps] = useState<Representative[]>(() => [...initialReps()]);

  const addRep = useCallback((rep: Representative) => {
    moduleReps = [rep, ...(moduleReps ?? [])];
    setReps([...moduleReps]);
  }, []);

  const updateRep = useCallback((id: string, updater: (r: Representative) => Representative) => {
    moduleReps = (moduleReps ?? []).map((r) => (r.id === id ? updater(r) : r));
    setReps([...moduleReps]);
  }, []);

  return <RepFilingContext.Provider value={{ reps, addRep, updateRep }}>{children}</RepFilingContext.Provider>;
}

export function useRepFiling(): RepFilingStore {
  const ctx = useContext(RepFilingContext);
  if (!ctx) throw new Error('useRepFiling 必须在 RepFilingProvider 内使用');
  return ctx;
}
