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
import type { ProviderContractRecord } from '../types';
import {
  loadContractArchives,
  persistContractArchives,
  seedContractArchives,
} from '../data/contractArchiveStore';
import { usePermission } from './PermissionContext';
import { useMessageCenter, providerAdminOf } from './MessageCenterContext';

/**
 * 服务商合同管理共享 store（2026-09-21）
 *
 * 合同是「准入完成后，药厂归档双方线下签署合同」的载体：
 * - 状态机只有两态：待上传 ──(药厂上传合同)──→ 已归档；删除已归档合同 = 恢复待上传；
 * - 归属 = 药厂租户 × 服务商租户（不按服务商名称关联）；仅「已准入」服务商进入合同列表
 *   （列表行由 VendorAccessContext 的已准入记录派生，本 store 只承载归档信息）；
 * - 合同只做合作留档与审计查阅（2026-11-26 与品种/价目解耦）：不解析合同内容，
 *   上传、替换、删除均不生成、变更或删除价目表草稿，也不影响已发布价目与任务取价；
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
  /** 某服务商当前归档记录（无 = 待上传） */
  contractOf: (providerTenantId: string) => ProviderContractRecord | undefined;
  /** 上传并归档：立即归档；mode=replace 为替换（幂等覆盖同一药厂×服务商的旧归档） */
  uploadContract: (input: {
    providerTenantId: string;
    /** 来源准入任务 id；线下准入导入的服务商无准入任务，允许为空 */
    vendorAccessRecordId?: string;
    fileName: string;
    mode?: 'upload' | 'replace';
  }) => ContractOpResult;
  /** 删除已归档合同：恢复待上传 */
  deleteContract: (contractId: string) => ContractOpResult;
}

const ContractContext = createContext<ContractStore | null>(null);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ContractProvider({ children }: { children: ReactNode }) {
  const { principal, logAudit } = usePermission();
  // 消息中心：归档结果投影给服务商侧（通知，不需要服务商操作）
  const { push: mcPush } = useMessageCenter();
  const initial = useRef<ProviderContractRecord[] | null>(null);
  if (initial.current === null) initial.current = loadContractArchives();

  const [contracts, setContracts] = useState<ProviderContractRecord[]>(
    () => initial.current ?? seedContractArchives(),
  );
  const seeded = useRef(!initial.current);

  useEffect(() => {
    void seeded;
    persistContractArchives(contracts);
  }, [contracts]);

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
      // 幂等：同一药厂×服务商仅一条当前归档（重复上传视为替换）
      setContracts((prev) => [
        created,
        ...prev.filter(
          (c) => !(c.pharmaTenantId === myPharmaTenantId && c.providerTenantId === input.providerTenantId),
        ),
      ]);
      logAudit({
        module: '合同管理',
        action: isReplace ? '替换合同' : '上传并归档合同',
        target: name,
        resource: isReplace ? 'contract-management.replace' : 'contract-management.upload',
        reason: isReplace ? '替换已归档合同' : '准入完成后归档双方线下签署合同',
        afterSummary: isReplace
          ? `归档状态：已归档（替换） · ${now}`
          : `归档状态：待上传 → 已归档 · ${now}`,
      });
      // 消息投影：归档完成 → 服务商侧通知（合同页在药厂工作空间，服务商仅获知结果）
      const contractNotifyId = providerAdminOf(input.providerTenantId);
      if (contractNotifyId) {
        mcPush({
          id: `mc-ct-archive-${created.id}`,
          recipientUserId: contractNotifyId,
          workspaceKey: input.providerTenantId,
          tab: '通知',
          type: '合同',
          title: isReplace ? '合同已重新归档' : '合同已归档',
          desc: `${principal.realm === 'TENANT' ? principal.tenantName : '药厂'}已完成《${name}》归档`,
          jump: false,
          body: '药厂已完成合同归档，可线下留存扫描件。',
        });
      }
      return { ok: true, contractId: created.id };
    },
    [logAudit, myPharmaTenantId, principal.name, mcPush, principal],
  );

  const deleteContract = useCallback(
    (contractId: string): ContractOpResult => {
      const target = contracts.find((c) => c.id === contractId);
      if (!target) return { ok: false, error: '合同记录不存在' };
      if (target.pharmaTenantId !== myPharmaTenantId) return { ok: false, error: '仅可操作本厂的合同归档记录' };
      setContracts((prev) => prev.filter((c) => c.id !== contractId));
      logAudit({
        module: '合同管理',
        action: '删除合同',
        target: target.contractFileName ?? contractId,
        resource: 'contract-management.delete',
        reason: '删除已归档合同，该服务商恢复为待上传',
        beforeSummary: `归档状态：已归档 · ${target.uploadedAt ?? ''}`,
        afterSummary: '已恢复待上传',
      });
      return { ok: true };
    },
    [contracts, logAudit, myPharmaTenantId],
  );

  const value = useMemo<ContractStore>(
    () => ({ contracts, contractOf, uploadContract, deleteContract }),
    [contracts, contractOf, uploadContract, deleteContract],
  );

  return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>;
}

export function useContract(): ContractStore {
  const ctx = useContext(ContractContext);
  if (!ctx) throw new Error('useContract must be used within ContractProvider');
  return ctx;
}
