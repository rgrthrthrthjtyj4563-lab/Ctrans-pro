import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ContractAiJob, ProviderContractRecord } from '../types';
import { usePermission } from './PermissionContext';

/**
 * 服务商合同管理共享 store（2026-09-21）
 *
 * 合同是「准入完成后，药厂归档双方线下签署合同」的载体：
 * - 状态机只有两态：待上传 ──(药厂上传合同)──→ 已归档；删除已归档合同 = 恢复待上传；
 * - 归属 = 药厂租户 × 服务商租户（不按服务商名称关联）；仅「已准入」服务商进入合同列表
 *   （列表行由 VendorAccessContext 的已准入记录派生，本 store 只承载归档信息）；
 * - AI 价目整理是后台辅助能力（ContractAiJob）：归档不依赖解析完成，页面上不出现任何
 *   AI 分析状态/进度；成功结果写入价目表草稿（价目表管理侧读 aiJobs 展示来源提示），
 *   失败时合同仍保持已归档、仅通知。
 * - 持久化：localStorage baiyee-provider-contract-v2（原型口径，无后端；v2=演示种子对齐 v6 准入数据）。
 */

export interface ContractOpResult {
  ok: boolean;
  error?: string;
  contractId?: string;
}

interface ContractStore {
  /** 本药厂全部合同归档记录（含已归档；待上传不落记录，行列表由准入已准入派生） */
  contracts: ProviderContractRecord[];
  /** AI 后台任务（含 processing/done/failed；跨页衔接价目表管理提示） */
  aiJobs: ContractAiJob[];
  /** 某服务商当前归档记录（无 = 待上传） */
  contractOf: (providerTenantId: string) => ProviderContractRecord | undefined;
  /** 上传并归档：立即归档 + 入队后台价目整理任务；mode=replace 为替换（幂等覆盖旧归档并重新入队） */
  uploadContract: (input: {
    providerTenantId: string;
    /** 来源准入任务 id；线下准入导入的服务商无准入任务，允许为空 */
    vendorAccessRecordId?: string;
    fileName: string;
    mode?: 'upload' | 'replace';
  }) => ContractOpResult;
  /** 删除已归档合同：恢复待上传；已生成的价目表草稿不自动删除 */
  deleteContract: (contractId: string) => ContractOpResult;
}

const ContractContext = createContext<ContractStore | null>(null);

const STORAGE_KEY = 'baiyee-provider-contract-v2';

interface PersistState {
  v: 2;
  contracts: ProviderContractRecord[];
  aiJobs: ContractAiJob[];
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function loadPersisted(): PersistState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistState;
    if (parsed.v !== 2 || !Array.isArray(parsed.contracts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── 种子（百益制药视角：2 已归档 + 3 待上传演示行）──────────────────────────
// 待上传行由准入已准入记录派生（泰合 VA-008 / 康晟云服 VA-010 / 永泰汇通 VA-011，
// 见 VendorAccessContext v6 种子）；本 store 只落两条已归档记录。

function seedState(): PersistState {
  return {
    v: 2,
    contracts: [
      {
        id: 'PC-001',
        pharmaTenantId: 'org-pharma',
        providerTenantId: 'org-provider-east',
        vendorAccessRecordId: 'VA-009',
        archiveStatus: '已归档',
        contractFileName: '2026年度市场推广服务协议-东方恒业.pdf',
        contractFileRef: 'mock://contract/pc-001',
        uploadedBy: '王敏',
        uploadedAt: '2026-03-15 10:26',
      },
      {
        id: 'PC-002',
        pharmaTenantId: 'org-pharma',
        providerTenantId: 'org-provider-smart',
        vendorAccessRecordId: 'VA-003',
        archiveStatus: '已归档',
        contractFileName: '2026年市场综合服务协议.pdf',
        contractFileRef: 'mock://contract/pc-002',
        uploadedBy: '王敏',
        uploadedAt: '2026-09-21 11:42',
      },
    ],
    aiJobs: [
      {
        contractId: 'PC-002',
        pharmaTenantId: 'org-pharma',
        providerTenantId: 'org-provider-smart',
        contractFileName: '2026年市场综合服务协议.pdf',
        status: 'done',
        importedCount: 28,
        pendingCount: 16,
        finishedAt: '2026-09-21 11:47',
      },
    ],
  };
}

// ─── 匹配结果分档（演示确定性：按上传文件名触发）──────────────────────────────
// 口径：匹配尽力而为，归档必定成功。三档——正常部分匹配（默认 28/16）、
// 低匹配率（扫描/模糊/照片 → 仅 5 项可唯一匹配、35 项待人工补齐）、
// 完全失败（失败/fail → 无草稿，通知引导手动配置）。合同归档状态三档下均为已归档。
function matchOutcomeOf(fileName: string): { status: 'done' | 'failed'; importedCount?: number; pendingCount?: number } {
  if (/失败|fail/i.test(fileName)) return { status: 'failed' };
  if (/扫描|模糊|照片/.test(fileName)) return { status: 'done', importedCount: 5, pendingCount: 35 };
  return { status: 'done', importedCount: 28, pendingCount: 16 };
}

export function ContractProvider({ children }: { children: ReactNode }) {
  const { principal, logAudit } = usePermission();
  const initial = useRef<PersistState | null>(null);
  if (initial.current === null) initial.current = loadPersisted();

  const [contracts, setContracts] = useState<ProviderContractRecord[]>(
    () => initial.current?.contracts ?? seedState().contracts,
  );
  const [aiJobs, setAiJobs] = useState<ContractAiJob[]>(
    () => initial.current?.aiJobs ?? seedState().aiJobs,
  );
  const seeded = useRef(!initial.current);

  useEffect(() => {
    void seeded;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, contracts, aiJobs }));
    } catch {
      /* 忽略配额异常（原型数据量小） */
    }
  }, [contracts, aiJobs]);

  /** 当前登录药厂租户 org id（非药厂租户为空串；写入侧归属复核） */
  const myPharmaTenantId =
    principal.realm === 'TENANT' && principal.tenantKind === 'pharma' ? principal.tenantId : '';

  const contractOf = useCallback(
    (providerTenantId: string) =>
      contracts.find(
        (c) => c.pharmaTenantId === myPharmaTenantId && c.providerTenantId === providerTenantId,
      ),
    [contracts, myPharmaTenantId],
  );

  const uploadContract = useCallback(
    (input: { providerTenantId: string; vendorAccessRecordId?: string; fileName: string; mode?: 'upload' | 'replace' }): ContractOpResult => {
      if (!myPharmaTenantId) return { ok: false, error: '仅药厂侧可归档合同' };
      const name = input.fileName.trim();
      if (!name) return { ok: false, error: '请选择已签署的合同文件' };
      const isReplace = input.mode === 'replace';
      const now = stamp();
      const created: ProviderContractRecord = {
        id: `PC-${Date.now().toString(36)}`,
        pharmaTenantId: myPharmaTenantId,
        providerTenantId: input.providerTenantId,
        vendorAccessRecordId: input.vendorAccessRecordId,
        archiveStatus: '已归档',
        contractFileName: name,
        contractFileRef: `mock://contract/${Date.now().toString(36)}`,
        uploadedBy: principal.name,
        uploadedAt: now,
      };
      // 幂等：同一药厂×服务商仅一条当前归档（重复上传视为替换并重新入队整理）
      setContracts((prev) => [
        created,
        ...prev.filter(
          (c) => !(c.pharmaTenantId === myPharmaTenantId && c.providerTenantId === input.providerTenantId),
        ),
      ]);
      // 替换语义：旧归档与旧后台任务一并让位（已生成的价目表草稿保留，新任务完成后来源切换为新文件）
      setAiJobs((prev) => [
        {
          contractId: created.id,
          pharmaTenantId: myPharmaTenantId,
          providerTenantId: input.providerTenantId,
          contractFileName: name,
          status: 'processing',
        },
        ...prev.filter((j) => j.providerTenantId !== input.providerTenantId || j.pharmaTenantId !== myPharmaTenantId),
      ]);
      logAudit({
        module: '合同管理',
        action: isReplace ? '替换合同' : '上传并归档合同',
        target: name,
        resource: isReplace ? 'contract-management.replace' : 'contract-management.upload',
        reason: isReplace ? '替换已归档合同，按新文件重新入队价目整理' : '准入完成后归档双方线下签署合同',
        afterSummary: isReplace
          ? `归档状态：已归档（替换） · ${now} · 后台价目整理已重新入队；已生成价目表草稿保留`
          : `归档状态：待上传 → 已归档 · ${now} · 后台价目整理已入队`,
      });
      return { ok: true, contractId: created.id };
    },
    [logAudit, myPharmaTenantId, principal.name],
  );

  const deleteContract = useCallback(
    (contractId: string): ContractOpResult => {
      const target = contracts.find((c) => c.id === contractId);
      if (!target) return { ok: false, error: '合同记录不存在' };
      if (target.pharmaTenantId !== myPharmaTenantId) return { ok: false, error: '仅可操作本厂的合同归档记录' };
      setContracts((prev) => prev.filter((c) => c.id !== contractId));
      // 后台未完成任务一并作废；已生成的价目表草稿不自动删除（删除确认弹窗中有说明）
      setAiJobs((prev) => prev.filter((j) => j.contractId !== contractId));
      logAudit({
        module: '合同管理',
        action: '删除合同',
        target: target.contractFileName ?? contractId,
        resource: 'contract-management.delete',
        reason: '删除已归档合同，该服务商恢复为待上传',
        beforeSummary: `归档状态：已归档 · ${target.uploadedAt ?? ''}`,
        afterSummary: '已恢复待上传；已生成的价目表草稿不受影响',
      });
      return { ok: true };
    },
    [contracts, logAudit, myPharmaTenantId],
  );

  /** 后台任务收敛：按该任务合同文件名的匹配档位落定结果（定时器与挂载收敛共用） */
  const settleAiJob = useCallback((contractId: string): void => {
    setAiJobs((prev) =>
      prev.map((j) => {
        if (j.contractId !== contractId || j.status !== 'processing') return j;
        const outcome = matchOutcomeOf(j.contractFileName);
        return {
          ...j,
          status: outcome.status,
          importedCount: outcome.importedCount,
          pendingCount: outcome.pendingCount,
          finishedAt: stamp(),
        };
      }),
    );
  }, []);

  /**
   * 后台整理模拟（原型）：归档即入队，数秒后按 matchOutcomeOf 档位落定——App 级常驻，
   * 用户离开合同页也不丢进度。匹配尽力而为、归档必定成功：三档结果均不改合同归档状态。
   * 上次会话遗留的 processing 任务（刷新丢失定时器）挂载后立即收敛，避免价目表侧
   * 出现永远「正在整理」。
   */
  const timers = useRef<Map<string, number>>(new Map());
  const hydrated = useRef(false);
  useEffect(() => {
    const processing = aiJobs.filter((j) => j.status === 'processing');
    if (hydrated.current) {
      for (const job of processing) {
        if (timers.current.has(job.contractId)) continue;
        const t = window.setTimeout(() => {
          timers.current.delete(job.contractId);
          settleAiJob(job.contractId);
        }, 6000);
        timers.current.set(job.contractId, t);
      }
    } else {
      hydrated.current = true;
      for (const job of processing) settleAiJob(job.contractId);
    }
  }, [aiJobs, settleAiJob]);
  useEffect(
    () => () => {
      for (const t of timers.current.values()) window.clearTimeout(t);
    },
    [],
  );

  const value = useMemo<ContractStore>(
    () => ({ contracts, aiJobs, contractOf, uploadContract, deleteContract }),
    [contracts, aiJobs, contractOf, uploadContract, deleteContract],
  );

  return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>;
}

export function useContract(): ContractStore {
  const ctx = useContext(ContractContext);
  if (!ctx) throw new Error('useContract must be used within ContractProvider');
  return ctx;
}
