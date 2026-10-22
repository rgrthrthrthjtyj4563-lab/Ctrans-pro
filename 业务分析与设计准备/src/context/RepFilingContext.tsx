import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Representative, TrainingRecord } from '../types';
import { seedRepresentatives, seedTrainingRecords } from '../data/complianceData';

/**
 * 医药代表备案共享 store：用户与组织（新建服务专员时创建未备案留底档案）
 * 与备案管理页（台账 / 同步 / 设置截止日期 / 考核培训留底）操作同一份数据。
 * 备案动作均由药厂在国家平台操作，本系统只留底并同步状态，无任何审核流。
 *
 * 状态放在模块级：切换登录角色会重建整个工作台（session key），
 * 演示链路需要跨会话保持数据。
 */
let moduleReps: Representative[] | null = null;
let moduleTrainingRecords: TrainingRecord[] | null = null;

function initialReps(): Representative[] {
  if (!moduleReps) moduleReps = seedRepresentatives.map((r) => ({ ...r }));
  return moduleReps;
}

function initialTrainingRecords(): TrainingRecord[] {
  if (!moduleTrainingRecords) moduleTrainingRecords = seedTrainingRecords.map((r) => ({ ...r }));
  return moduleTrainingRecords;
}

interface RepFilingStore {
  reps: Representative[];
  addRep: (rep: Representative) => void;
  updateRep: (id: string, updater: (r: Representative) => Representative) => void;
  trainingRecords: TrainingRecord[];
  addTrainingRecord: (record: TrainingRecord) => void;
  removeTrainingRecord: (id: string) => void;
}

const RepFilingContext = createContext<RepFilingStore | null>(null);

export function RepFilingProvider({ children }: { children: ReactNode }) {
  const [reps, setReps] = useState<Representative[]>(() => [...initialReps()]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>(() => [...initialTrainingRecords()]);

  const addRep = useCallback((rep: Representative) => {
    moduleReps = [rep, ...(moduleReps ?? [])];
    setReps([...moduleReps]);
  }, []);

  const updateRep = useCallback((id: string, updater: (r: Representative) => Representative) => {
    moduleReps = (moduleReps ?? []).map((r) => (r.id === id ? updater(r) : r));
    setReps([...moduleReps]);
  }, []);

  const addTrainingRecord = useCallback((record: TrainingRecord) => {
    moduleTrainingRecords = [record, ...(moduleTrainingRecords ?? [])];
    setTrainingRecords([...moduleTrainingRecords]);
  }, []);

  const removeTrainingRecord = useCallback((id: string) => {
    moduleTrainingRecords = (moduleTrainingRecords ?? []).filter((r) => r.id !== id);
    setTrainingRecords([...moduleTrainingRecords]);
  }, []);

  return (
    <RepFilingContext.Provider value={{ reps, addRep, updateRep, trainingRecords, addTrainingRecord, removeTrainingRecord }}>
      {children}
    </RepFilingContext.Provider>
  );
}

export function useRepFiling(): RepFilingStore {
  const ctx = useContext(RepFilingContext);
  if (!ctx) throw new Error('useRepFiling 必须在 RepFilingProvider 内使用');
  return ctx;
}
