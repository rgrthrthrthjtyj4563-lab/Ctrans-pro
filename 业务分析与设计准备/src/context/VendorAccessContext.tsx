import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ACTORS, DEMO_VENDOR_ID } from '../data/complianceData';
import type { Role, VendorAccessAttachments, VendorAccessHistory, VendorAccessRecord } from '../types';

/**
 * 服务商准入共享 store：服务商提交 / 药厂合规审核的最小闭环。
 * 状态机：草稿 →(提交)→ 待提交 →(通过)→ 已通过（终态）
 *                            ↘(驳回，原因必填)→ 已驳回 →(服务商修改重提)→ 待提交
 * 同一会话内切换登录角色后，双方看到的是同一份记录。
 */

export interface VendorAccessInput {
  vendorName: string;
  creditCode: string;
  legalRep: string;
  address: string;
  contactName: string;
  contactMobile: string;
  businessLicenseFile: string;
  attachments: VendorAccessAttachments;
}

export interface VendorAccessOpResult {
  ok: boolean;
  error?: string;
}

interface VendorAccessStore {
  records: VendorAccessRecord[];
  /** 演示服务商（智联科技）自己的唯一主体记录 */
  myRecord: VendorAccessRecord | undefined;
  saveDraft: (input: VendorAccessInput) => VendorAccessOpResult;
  submit: (input: VendorAccessInput) => VendorAccessOpResult;
  approve: (recordId: string) => VendorAccessOpResult;
  reject: (recordId: string, reason: string) => VendorAccessOpResult;
  deleteDraft: () => VendorAccessOpResult;
}

const VendorAccessContext = createContext<VendorAccessStore | null>(null);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const EMPTY_INPUT: VendorAccessInput = {
  vendorName: '',
  creditCode: '',
  legalRep: '',
  address: '',
  contactName: '',
  contactMobile: '',
  businessLicenseFile: '',
  attachments: {},
};

/** 种子：演示服务商的草稿（缺营业执照，用于补件演示）+ 三个不同状态的他商记录 */
const SEED_RECORDS: VendorAccessRecord[] = [
  {
    id: 'VA-001',
    vendorId: DEMO_VENDOR_ID,
    vendorName: '智联科技有限公司',
    creditCode: '91110108MA01ABCD12',
    legalRep: '赵启明',
    address: '北京市海淀区中关村大街 1 号',
    contactName: '钱薇',
    contactMobile: '13800001111',
    businessLicenseFile: '',
    status: '草稿',
    history: [
      { id: 'VH-001', action: '保存草稿', operator: '钱薇', role: '服务提供商', time: '2026-09-02 09:40' },
    ],
  },
  {
    id: 'VA-002',
    vendorId: 'VND-002',
    vendorName: '东方恒业推广有限公司',
    creditCode: '91440101MA02EFGH34',
    legalRep: '刘国栋',
    address: '广州市天河区体育西路 55 号',
    contactName: '刘国栋',
    contactMobile: '13900002222',
    businessLicenseFile: '东方恒业-营业执照.pdf',
    attachments: { qualification: '东方恒业-会议服务资质.pdf' },
    status: '待提交',
    submittedAt: '2026-09-03 15:20',
    history: [
      { id: 'VH-002', action: '提交', operator: '刘国栋', role: '服务提供商', time: '2026-09-03 15:20' },
    ],
  },
  {
    id: 'VA-003',
    vendorId: 'VND-003',
    vendorName: '康晟云服科技有限公司',
    creditCode: '91370100MA03IJKL56',
    legalRep: '孙嘉',
    address: '济南市高新区舜华路 200 号',
    contactName: '孙嘉',
    contactMobile: '13700003333',
    businessLicenseFile: '康晟云服-营业执照.jpg',
    status: '已驳回',
    submittedAt: '2026-08-30 11:05',
    reviewedAt: '2026-09-01 09:30',
    reviewedBy: '周敏',
    rejectionReason: '营业执照文件模糊无法核验，请重新上传清晰扫描件后再次提交。',
    history: [
      {
        id: 'VH-004',
        action: '驳回',
        operator: '周敏',
        role: '药厂合规部门',
        time: '2026-09-01 09:30',
        comment: '营业执照文件模糊无法核验，请重新上传清晰扫描件后再次提交。',
      },
      { id: 'VH-003', action: '提交', operator: '孙嘉', role: '服务提供商', time: '2026-08-30 11:05' },
    ],
  },
  {
    id: 'VA-004',
    vendorId: 'VND-004',
    vendorName: '永泰汇通推广有限公司',
    creditCode: '91330000MA04MNOP78',
    legalRep: '郑伟',
    address: '杭州市西湖区文三路 90 号',
    contactName: '郑伟',
    contactMobile: '13600004444',
    businessLicenseFile: '永泰汇通-营业执照.pdf',
    attachments: { qualification: '永泰汇通-企业信用报告.pdf', supplement: '永泰汇通-情况补充说明.pdf' },
    status: '已通过',
    submittedAt: '2026-08-28 10:00',
    reviewedAt: '2026-08-29 14:10',
    reviewedBy: '周敏',
    history: [
      { id: 'VH-006', action: '通过', operator: '周敏', role: '药厂合规部门', time: '2026-08-29 14:10' },
      { id: 'VH-005', action: '提交', operator: '郑伟', role: '服务提供商', time: '2026-08-28 10:00' },
    ],
  },
];

function missingFieldsOf(input: VendorAccessInput): string[] {
  const miss: string[] = [];
  if (!input.vendorName.trim()) miss.push('公司名称');
  if (!input.creditCode.trim()) miss.push('统一社会信用代码');
  if (!input.legalRep.trim()) miss.push('法定代表人');
  if (!input.address.trim()) miss.push('注册地址');
  if (!input.contactName.trim()) miss.push('联系人姓名');
  if (!input.contactMobile.trim()) miss.push('联系电话');
  if (!input.businessLicenseFile.trim()) miss.push('营业执照文件');
  return miss;
}

export function VendorAccessProvider({ loginRole, children }: { loginRole: Role; children: ReactNode }) {
  const [records, setRecords] = useState<VendorAccessRecord[]>(() => SEED_RECORDS.map((r) => ({ ...r })));

  const myRecord = useMemo(
    () => records.find((r) => r.vendorId === DEMO_VENDOR_ID),
    [records],
  );

  const operator = loginRole === '药厂合规部门' ? ACTORS.compliance : ACTORS.vendor;

  const nextRecordId = useCallback(() => {
    const max = records.reduce((m, r) => Math.max(m, Number(r.id.replace(/[^0-9]/g, '')) || 0), 0);
    return `VA-${String(max + 1).padStart(3, '0')}`;
  }, [records]);

  const nextHistoryId = useCallback(() => {
    const max = records.reduce(
      (m, r) => Math.max(m, ...r.history.map((h) => Number(h.id.replace(/[^0-9]/g, '')) || 0)),
      0,
    );
    return `VH-${String(max + 1).padStart(3, '0')}`;
  }, [records]);

  const pushHistory = useCallback(
    (record: VendorAccessRecord, action: VendorAccessHistory['action'], comment?: string): VendorAccessHistory[] => [
      {
        id: nextHistoryId(),
        action,
        operator: operator.name,
        role: loginRole === '药厂合规部门' ? '药厂合规部门' : '服务提供商',
        time: stamp(),
        comment,
      },
      ...record.history,
    ],
    [loginRole, nextHistoryId, operator.name],
  );

  /** 同一统一社会信用代码只允许一条有效主体档案 */
  const creditCodeTaken = useCallback(
    (creditCode: string, excludeRecordId?: string) =>
      records.some((r) => r.id !== excludeRecordId && r.creditCode === creditCode),
    [records],
  );

  const saveDraft = useCallback(
    (input: VendorAccessInput): VendorAccessOpResult => {
      if (loginRole !== '服务提供商') return { ok: false, error: '仅服务商可维护本企业准入资料' };
      if (myRecord && myRecord.status !== '草稿') return { ok: false, error: '当前状态不可保存草稿' };
      const creditCode = input.creditCode.trim();
      if (creditCode && creditCodeTaken(creditCode, myRecord?.id)) {
        return { ok: false, error: '该统一社会信用代码已存在' };
      }
      const now = stamp();
      if (myRecord) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === myRecord.id
              ? { ...r, ...input, creditCode, history: pushHistory(r, '保存草稿') }
              : r,
          ),
        );
      } else {
        const created: VendorAccessRecord = {
          id: nextRecordId(),
          vendorId: DEMO_VENDOR_ID,
          ...input,
          creditCode,
          status: '草稿',
          history: [
            { id: nextHistoryId(), action: '保存草稿', operator: operator.name, role: loginRole, time: now },
          ],
        };
        setRecords((prev) => [created, ...prev]);
      }
      return { ok: true };
    },
    [creditCodeTaken, loginRole, myRecord, nextHistoryId, nextRecordId, operator.name, pushHistory],
  );

  const submit = useCallback(
    (input: VendorAccessInput): VendorAccessOpResult => {
      if (loginRole !== '服务提供商') return { ok: false, error: '仅服务商可提交准入资料' };
      if (myRecord && !['草稿', '已驳回'].includes(myRecord.status)) {
        return { ok: false, error: '当前状态不可重复提交' };
      }
      const miss = missingFieldsOf(input);
      if (miss.length) return { ok: false, error: `请补充：${miss.join('、')}` };
      const creditCode = input.creditCode.trim();
      if (creditCodeTaken(creditCode, myRecord?.id)) {
        return { ok: false, error: '该统一社会信用代码已存在' };
      }
      const now = stamp();
      if (myRecord) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === myRecord.id
              ? {
                  ...r,
                  ...input,
                  creditCode,
                  status: '待提交',
                  submittedAt: now,
                  reviewedAt: undefined,
                  reviewedBy: undefined,
                  rejectionReason: undefined,
                  history: pushHistory(r, '提交'),
                }
              : r,
          ),
        );
      } else {
        const created: VendorAccessRecord = {
          id: nextRecordId(),
          vendorId: DEMO_VENDOR_ID,
          ...input,
          creditCode,
          status: '待提交',
          submittedAt: now,
          history: [
            { id: nextHistoryId(), action: '提交', operator: operator.name, role: loginRole, time: now },
          ],
        };
        setRecords((prev) => [created, ...prev]);
      }
      return { ok: true };
    },
    [creditCodeTaken, loginRole, myRecord, nextHistoryId, nextRecordId, operator.name, pushHistory],
  );

  const approve = useCallback(
    (recordId: string): VendorAccessOpResult => {
      if (loginRole !== '药厂合规部门') return { ok: false, error: '仅药厂合规部门可审核' };
      const target = records.find((r) => r.id === recordId);
      if (!target) return { ok: false, error: '记录不存在' };
      if (target.status !== '待提交') return { ok: false, error: '仅待提交状态可审核' };
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? {
                ...r,
                status: '已通过',
                reviewedAt: now,
                reviewedBy: operator.name,
                rejectionReason: undefined,
                history: pushHistory(r, '通过'),
              }
            : r,
        ),
      );
      return { ok: true };
    },
    [loginRole, operator.name, pushHistory, records],
  );

  const reject = useCallback(
    (recordId: string, reason: string): VendorAccessOpResult => {
      if (loginRole !== '药厂合规部门') return { ok: false, error: '仅药厂合规部门可审核' };
      const target = records.find((r) => r.id === recordId);
      if (!target) return { ok: false, error: '记录不存在' };
      if (target.status !== '待提交') return { ok: false, error: '仅待提交状态可审核' };
      const trimmed = reason.trim();
      if (trimmed.length < 5) return { ok: false, error: '驳回原因不能少于 5 个字符' };
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? {
                ...r,
                status: '已驳回',
                reviewedAt: now,
                reviewedBy: operator.name,
                rejectionReason: trimmed,
                history: pushHistory(r, '驳回', trimmed),
              }
            : r,
        ),
      );
      return { ok: true };
    },
    [loginRole, operator.name, pushHistory, records],
  );

  const deleteDraft = useCallback((): VendorAccessOpResult => {
    if (loginRole !== '服务提供商') return { ok: false, error: '仅服务商可删除草稿' };
    if (!myRecord || myRecord.status !== '草稿') return { ok: false, error: '仅草稿可删除' };
    setRecords((prev) => prev.filter((r) => r.id !== myRecord.id));
    return { ok: true };
  }, [loginRole, myRecord]);

  const value: VendorAccessStore = {
    records,
    myRecord,
    saveDraft,
    submit,
    approve,
    reject,
    deleteDraft,
  };

  return <VendorAccessContext.Provider value={value}>{children}</VendorAccessContext.Provider>;
}

export function useVendorAccess(): VendorAccessStore {
  const ctx = useContext(VendorAccessContext);
  if (!ctx) throw new Error('useVendorAccess must be used within VendorAccessProvider');
  return ctx;
}

export function emptyVendorAccessInput(): VendorAccessInput {
  return { ...EMPTY_INPUT };
}
