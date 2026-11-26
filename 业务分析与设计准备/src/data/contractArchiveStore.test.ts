/**
 * 合同归档持久化 · 旧数据兼容测试（2026-11-26 合同管理与品种/价目解耦）
 * 针对真实存储（localStorage 垫片见 vitest.setup.ts）：旧版同一存储键下并存
 * aiJobs（合同 AI 价目整理任务），解耦后只读 contracts——历史归档不丢、旧任务不恢复。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProviderContractRecord } from '../types';
import {
  CONTRACT_ARCHIVE_STORAGE_KEY,
  loadContractArchives,
  persistContractArchives,
  seedContractArchives,
} from './contractArchiveStore';
import { applyDraft, getDb, surveyPriceOf, activeSet, today } from './priceTableStore';

const PHARMA = 'org-pharma';

function archived(
  id: string,
  pharmaTenantId: string,
  providerTenantId: string,
  fileName: string,
): ProviderContractRecord {
  return {
    id, pharmaTenantId, providerTenantId,
    archiveStatus: '已归档',
    contractFileName: fileName,
    contractFileRef: `mock://contract/${id.toLowerCase()}`,
    uploadedBy: '王敏',
    uploadedAt: '2026-09-21 11:42',
  };
}

/** 旧版落盘形态：contracts 与 aiJobs 并存（processing / done / failed 三态齐全） */
function legacyState() {
  const contracts = [
    archived('PC-001', PHARMA, 'org-provider-east', '2026年度市场推广服务协议-东方恒业.pdf'),
    archived('PC-OLD-7', PHARMA, 'org-taihe', '2025年度合作协议-历史归档.pdf'),
    archived('PC-OTHER', 'org-pharma-2', 'org-provider-east', '另一药厂的同名服务商合同.pdf'),
  ];
  return {
    v: 2,
    contracts,
    aiJobs: [
      { contractId: 'PC-001', pharmaTenantId: PHARMA, providerTenantId: 'org-provider-east', contractFileName: contracts[0].contractFileName, status: 'done', importedCount: 28, pendingCount: 16, finishedAt: '2026-09-21 11:47' },
      { contractId: 'PC-OLD-7', pharmaTenantId: PHARMA, providerTenantId: 'org-taihe', contractFileName: contracts[1].contractFileName, status: 'processing' },
      { contractId: 'PC-GONE', pharmaTenantId: PHARMA, providerTenantId: 'org-taihe', contractFileName: '失败件.pdf', status: 'failed' },
    ],
  };
}

function stored(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(CONTRACT_ARCHIVE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => {
  window.localStorage.removeItem(CONTRACT_ARCHIVE_STORAGE_KEY);
});

describe('loadContractArchives · 旧数据升级', () => {
  it('含 aiJobs 的存量数据：只读出 contracts，历史归档逐条保留（不同药厂 × 服务商归属原样）', () => {
    const legacy = legacyState();
    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = loadContractArchives();
    expect(loaded).toEqual(legacy.contracts);
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.map((c) => c.id)).toEqual(['PC-001', 'PC-OLD-7', 'PC-OTHER']);
  });

  it('读取不写存储：旧任务原文仍在，未被读取动作改写', () => {
    const legacy = legacyState();
    const raw = JSON.stringify(legacy);
    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, raw);

    loadContractArchives();

    expect(window.localStorage.getItem(CONTRACT_ARCHIVE_STORAGE_KEY)).toBe(raw);
  });

  it('首次写入即迁移：落盘只含 v + contracts；刷新重读一致、旧任务不恢复', () => {
    const legacy = legacyState();
    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, JSON.stringify(legacy));

    const firstBoot = loadContractArchives()!;
    persistContractArchives(firstBoot); // Provider 挂载后的落盘

    expect(Object.keys(stored()!).sort()).toEqual(['contracts', 'v']);
    expect(stored()!.v).toBe(2);

    // 刷新：从迁移后的存储重读
    const afterReload = loadContractArchives();
    expect(afterReload).toEqual(legacy.contracts);
    expect('aiJobs' in (stored() ?? {})).toBe(false);
  });

  it('存量数据不会被演示种子顶替：有存储时不返回 null', () => {
    window.localStorage.setItem(
      CONTRACT_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ v: 2, contracts: [archived('PC-ONLY', PHARMA, 'org-taihe', '仅此一条.pdf')] }),
    );
    expect(loadContractArchives()).toHaveLength(1);
  });
});

describe('loadContractArchives · 无效存储', () => {
  it('无存储 / 版本不符 / contracts 非数组 / 非法 JSON → null', () => {
    expect(loadContractArchives()).toBeNull();

    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, JSON.stringify({ v: 1, contracts: [] }));
    expect(loadContractArchives()).toBeNull();

    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, JSON.stringify({ v: 2, contracts: 'oops' }));
    expect(loadContractArchives()).toBeNull();

    window.localStorage.setItem(CONTRACT_ARCHIVE_STORAGE_KEY, '{not json');
    expect(loadContractArchives()).toBeNull();
  });
});

describe('persistContractArchives · 写入边界', () => {
  it('只写合同归档键，不触碰其他存储键', () => {
    window.localStorage.setItem('some-other-key', 'keep-me');
    persistContractArchives([archived('PC-NEW', PHARMA, 'org-taihe', '新归档.pdf')]);

    expect(window.localStorage.getItem('some-other-key')).toBe('keep-me');
    expect(loadContractArchives()!.map((c) => c.id)).toEqual(['PC-NEW']);
  });

  it('空列表照常落盘（删除最后一条归档后刷新不应回到演示种子）', () => {
    persistContractArchives([]);
    expect(loadContractArchives()).toEqual([]);
  });
});

describe('seedContractArchives · 演示种子', () => {
  it('与解耦前一致：2 条已归档演示记录，不含任何 AI 任务', () => {
    const seed = seedContractArchives();
    expect(seed.map((c) => c.id)).toEqual(['PC-001', 'PC-002']);
    expect(seed.map((c) => c.contractFileName)).toEqual([
      '2026年度市场推广服务协议-东方恒业.pdf',
      '2026年市场综合服务协议.pdf',
    ]);
    expect(seed.every((c) => c.pharmaTenantId === PHARMA && c.archiveStatus === '已归档')).toBe(true);
  });
});

describe('合同归档读写 × 价目 store（解耦边界）', () => {
  it('归档写入 / 读取 / 清空全过程中，价目草稿、已发布快照与取价结果保持不变', () => {
    // 先造一份价目草稿，使草稿与已发布同时存在
    applyDraft('A', 0, (draft) => {
      const set = activeSet(draft, today());
      draft.pricesByProduct[0][set].academic['三级甲等'] = { pub: 777, priv: 111, limit: null, overPub: null, overPriv: null };
    });
    const dbBefore = getDb();
    const snapshotBefore = JSON.stringify(dbBefore);
    const probe = () => {
      const db = getDb();
      const set = activeSet(db.A.published, today());
      return {
        survey: surveyPriceOf('希刻劳', 'surveyStd', '医生'),
        publishedVisit: db.A.published.pricesByProduct[0][set].academic['三级甲等'],
        draftVisit: db.A.draft?.pricesByProduct[0][set].academic['三级甲等'] ?? null,
      };
    };
    const priceBefore = probe();
    expect(priceBefore.draftVisit).not.toBeNull();

    persistContractArchives([archived('PC-NEW', PHARMA, 'org-taihe', '2027年度合作协议.pdf')]);      // 上传
    persistContractArchives([archived('PC-NEW-2', PHARMA, 'org-taihe', '2027年度合作协议-替换件.pdf')]); // 替换
    loadContractArchives();
    persistContractArchives([]);                                                                     // 删除

    expect(getDb()).toBe(dbBefore);
    expect(JSON.stringify(getDb())).toBe(snapshotBefore);
    expect(probe()).toEqual(priceBefore);
  });
});
