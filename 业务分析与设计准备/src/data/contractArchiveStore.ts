// ===== 合同归档持久化（2026-11-26 合同管理与品种/价目解耦，自 ContractContext 抽出）=====
// 合同只做合作留档：localStorage 里仅保存归档记录 contracts。旧版同一存储键下还并存过
// aiJobs（合同 AI 价目整理任务），读取时忽略——存量归档原样保留，下一次写入即把旧任务
// 自然清掉；键名与版本号沿用，存量归档不做键迁移。
import type { ProviderContractRecord } from '../types';

export const CONTRACT_ARCHIVE_STORAGE_KEY = 'baiyee-provider-contract-v2';

/** 持久化形态：v2 = 演示种子对齐 v6 准入数据 */
interface ContractArchivePersisted {
  v: 2;
  contracts: ProviderContractRecord[];
}

export function persistContractArchives(contracts: ProviderContractRecord[]): void {
  try {
    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, JSON.stringify({ v: 2, contracts }));
  } catch {
    /* 忽略配额异常（原型数据量小） */
  }
}

/** 读取归档记录：无存储 / 版本不符 / 结构损坏返回 null（由调用方落演示种子） */
export function loadContractArchives(): ProviderContractRecord[] | null {
  try {
    const raw = window.localStorage.getItem(CONTRACT_ARCHIVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContractArchivePersisted>;
    if (parsed.v !== 2 || !Array.isArray(parsed.contracts)) return null;
    return parsed.contracts;
  } catch {
    return null;
  }
}

// ─── 种子（百益制药视角：2 条已归档演示记录）──────────────────────────────────
// 待上传行由准入已准入记录派生（泰合 VA-008 / 康晟云服 VA-010 / 永泰汇通 VA-011，
// 见 VendorAccessContext v6 种子）；这里只落两条已归档记录。

export function seedContractArchives(): ProviderContractRecord[] {
  return [
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
  ];
}
