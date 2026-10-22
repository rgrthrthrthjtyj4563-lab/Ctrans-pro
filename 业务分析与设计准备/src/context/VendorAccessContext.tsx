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
import {
  tenantById,
  ensureRelationshipFromAccess,
} from '../data/cooperationModel';
import { getTenantRegistrySnapshot } from '../data/tenantRegistry';
import type {
  AccessItemKind,
  AccessItemVerdict,
  AccessRequirementSnapshot,
  AccessTemplateItem,
  PharmaAccessTemplate,
  VendorAccessHistory,
  VendorAccessRecord,
  VendorAccessStatus,
} from '../types';
import { usePermission } from './PermissionContext';

/**
 * 服务商准入共享 store（2026-09-21 准入码制）
 *
 * 药厂是准入流程的唯一发起方、审核方和准入决定方；准入是建立合作关系的前置流程（通过后合作才生效）：
 * - 药厂发起：只选材料模板创建任务 → 立即生成**一次性准入码**（8 位大写字母数字）
 *   ——不指定、不检索任何服务商（撮合完全线下：药厂自行把码告知意向服务商）
 * - 服务商发起：在「准入任务」输入准入码 → 任务立刻绑定本服务商主体（待服务商提交）；
 *   码一次性（发起即失效），药厂可对未发起任务重新生成码（旧码作废）
 * - 准入→合作联动：审核通过时创建并生效合作关系（ensureRelationshipFromAccess）
 * - 药厂模板：系统内置默认模板惰性初始化，一厂多套、同时仅一套启用、内容变更升版（药厂侧维护）
 * - 状态机（2026-10-16 审核改按项标记）：待领取 →(输码发起)→ 待服务商提交 →(提交)→ 审核中
 *   →(全部项通过)→ 已准入 / →(存在驳回项)→ 已驳回（非终态，退回修改）
 *   已驳回 →(服务商仅修改驳回项后重新提交)→ 审核中（通过项结论保留、锁定不重传）；
 *   待领取/待服务商提交/审核中 →(撤回任务)→ 已撤回；已准入 → 已失效 / 已撤销（UI 暂无入口）；
 *   彻底终止流程走撤回任务。
 * - 归属与状态校验：药厂操作要求 principal.tenantId === task.pharmaTenantId 且具备审核权限；
 *   服务商操作要求 principal.tenantId === task.providerTenantId 且状态窗口开放；
 *   任务 ID / 准入码仅用于定位（claim 时校验状态与一次性），不作为授权依据
 * - 持久化：localStorage baiyee-vendor-access-v9（原型口径，无后端；v9=按项驳回机制落地并重播种子）
 */

export interface VendorAccessOpResult {
  ok: boolean;
  error?: string;
  /** 创建/操作成功后的任务 id */
  taskId?: string;
  /** 审核通过时是否新建了合作关系（false=合作关系已存在，幂等生效） */
  coopCreated?: boolean;
  /** 创建任务时生成的一次性准入码（创建即返回供弹框展示） */
  admissionCode?: string;
}

/** 药厂发起任务的配置输入（准入码制：只选模板，不指定服务商） */
export interface VendorAccessTaskInput {
  /** 材料模板 id（本厂模板） */
  templateId: string;
}

/** 服务商提交材料的输入（企业基础资料 + 按任务快照作答） */
export interface VendorMaterialInput {
  vendorName: string;
  creditCode: string;
  legalRep: string;
  address: string;
  contactName: string;
  contactMobile: string;
  itemResponses: Record<string, string>;
  attachments: Record<string, string[]>;
}

/** 新建模板的初始化来源 */
export type TemplateInitSource =
  | { type: 'blank' }
  | { type: 'default' }
  | { type: 'copy'; sourceTemplateId: string };

interface VendorAccessStore {
  /** 本厂全部任务（药厂侧；待领取任务未绑定服务商）。权威过滤在操作函数内按 pharmaTenantId 复核 */
  records: VendorAccessRecord[];
  /** 当前登录服务商主体的任务（待领取未绑定不可见；归属过滤按 providerTenantId） */
  myTasks: VendorAccessRecord[];
  /** 药厂准入模板（无则惰性初始化默认模板；供 TemplateTab useEffect 调用） */
  ensureTemplatesFor: (pharmaTenantId: string) => PharmaAccessTemplate[];
  templatesOf: (pharmaTenantId: string) => PharmaAccessTemplate[];
  enabledTemplateOf: (pharmaTenantId: string) => PharmaAccessTemplate | undefined;
  createTemplate: (pharmaTenantId: string, name: string, init: TemplateInitSource) => VendorAccessOpResult;
  renameTemplate: (pharmaTenantId: string, templateId: string, name: string) => VendorAccessOpResult;
  deleteTemplate: (pharmaTenantId: string, templateId: string) => VendorAccessOpResult;
  enableTemplate: (pharmaTenantId: string, templateId: string) => VendorAccessOpResult;
  saveItem: (pharmaTenantId: string, templateId: string, item: AccessTemplateItem) => VendorAccessOpResult;
  removeItem: (pharmaTenantId: string, templateId: string, itemKey: string) => VendorAccessOpResult;
  /** 整组删除大项：组内全部准入项一并删除（含内置核查项的大项不可删）；组名保留在 knownGroups 供新建项重选 */
  removeGroup: (pharmaTenantId: string, templateId: string, group: string) => VendorAccessOpResult;
  moveItem: (pharmaTenantId: string, templateId: string, itemKey: string, dir: -1 | 1) => VendorAccessOpResult;
  /** 药厂：创建任务（只选模板；创建即生成一次性准入码，进入待领取） */
  createTask: (input: VendorAccessTaskInput) => VendorAccessOpResult;
  /** 药厂：重新生成准入码（仅待领取；旧码立即作废） */
  regenerateCode: (taskId: string) => VendorAccessOpResult;
  /** 药厂：撤回任务（原因选填；待领取/待服务商提交/审核中 → 已撤回，流程终止） */
  withdrawTask: (taskId: string, reason?: string) => VendorAccessOpResult;
  /** 药厂：按项驳回（审核中 → 已驳回退回修改；材料/填写项逐项显式 通过/驳回，驳回项原因必填，核查类不参与） */
  rejectTask: (taskId: string, verdicts: Array<{ key: string; verdict: 'pass' | 'reject'; reason?: string }>) => VendorAccessOpResult;
  /** 药厂：审核通过（审核中 → 已准入；合作关系幂等联动） */
  approveTask: (taskId: string, effectiveFrom: string, effectiveTo: string) => VendorAccessOpResult;
  /** 药厂：续期（已准入 → 更新 effectiveTo 留痕；需新材料时另建任务） */
  renewAdmission: (taskId: string, newEffectiveTo: string, reason: string) => VendorAccessOpResult;
  /** 药厂：失效管理（已准入 → 已失效，原因必填） */
  invalidateAdmission: (taskId: string, reason: string) => VendorAccessOpResult;
  /** 药厂：撤销准入（已准入 → 已撤销，原因必填） */
  revokeAdmission: (taskId: string, reason: string) => VendorAccessOpResult;
  /** 服务商：在任务授权范围内提交材料（待服务商提交 → 审核中；已驳回 → 修改驳回项后重新提交，通过项锁定） */
  submitTaskMaterial: (taskId: string, input: VendorMaterialInput) => VendorAccessOpResult;
  /** 服务商：输入准入码发起准入（待领取 → 待服务商提交，绑定本服务商主体；码一次性） */
  claimTask: (code: string) => VendorAccessOpResult;
}

const VendorAccessContext = createContext<VendorAccessStore | null>(null);

const STORAGE_KEY = 'baiyee-vendor-access-v9';

/** 生成一次性准入码：8 位大写字母数字（排除 0/O/1/I 易混淆字符）；发起或重新生成后旧码作废 */
function genAdmissionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** 演示环境固定准入码（对齐短信 123456 演示口径）：输入后发起最早的待领取任务 */
const DEMO_ADMISSION_CODE = '12345678';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── 系统内置默认准入模板（代码常量，不持久化、系统管理侧不可配置）──────────────

function builtinItem(item: Omit<AccessTemplateItem, 'builtin'>): AccessTemplateItem {
  return { ...item, builtin: true };
}

/** 结构化精简版：13 项 / 5 分组（编号沿用真实准入清单前缀体系）；
 *  上传类两类口径（2026-09-21 收敛）：文件类=仅一份（选择时可批量勾选，仅保留一份）；
 *  图片类=一至多张，数量由模板 minCount 设置。文件类型限制已砍（无意义）。 */
export const DEFAULT_ACCESS_TEMPLATE_ITEMS: AccessTemplateItem[] = [
  builtinItem({
    key: 'license', group: '证照资质', name: '营业执照（副本）', kind: 'file', required: true,
    checkPoints: '1.须为最新三证合一证照且在有效期内；2.经营范围需覆盖拟开展的服务内容；3.加盖公章清晰可辨。',
    purpose: '说明服务商企业资质与经营状态',
  }),
  builtinItem({
    key: 'open-account', group: '证照资质', name: '开户证明', kind: 'file', required: false,
    purpose: '核验企业对公账户信息',
  }),
  builtinItem({
    key: 'legal-id', group: '证照资质', name: '法定代表人身份证复印件', kind: 'file', required: true,
    checkPoints: '1.身份证在有效期内；2.证件信息清晰可辨。',
  }),
  builtinItem({
    key: 'social', group: '人员与社保', name: '社保缴纳证明（近三个月）', kind: 'file', required: true,
    checkPoints: '1.提供连续最近三个月的社保缴纳证明；2.社保缴纳人数须满足合作要求；3.须有官方印章或验真码；4.第三方代缴的需一并提供代缴协议。',
    purpose: '说明企业缴纳社保的员工数量与连续性',
  }),
  builtinItem({
    key: 'labor', group: '人员与社保', name: '参与项目员工劳动/劳务合同', kind: 'file', required: true,
    checkPoints: '1.合同需签字（或签字页）；2.参保人员信息需与社保证明保持一致。',
  }),
  builtinItem({
    key: 'lease', group: '经营场地', name: '房屋租赁证明/租金支付明细或产权证明', kind: 'file', required: true,
    checkPoints: '1.房屋地址须与注册地址一致；2.须为商用或办公用途；3.租期须在有效期内且经双方签署。',
    purpose: '说明企业办公地点情况',
  }),
  builtinItem({
    key: 'photos', group: '经营场地', name: '经营实地照片', kind: 'image', required: true, minCount: 3,
    checkPoints: '1.须覆盖办公场地门口与内部全貌；2.照片须为近期实拍。',
    purpose: '说明企业实际办公场地情况',
  }),
  builtinItem({
    key: 'system', group: '制度与承诺', name: '业务管理制度文档', kind: 'file', required: false,
    checkPoints: '必要制度包括：商务与市场活动管理、费用报销、人力资源管理、业务行为合规准则。',
  }),
  builtinItem({
    key: 'integrity', group: '制度与承诺', name: '廉洁合规承诺书', kind: 'file', required: true,
    templateRef: { fileName: '廉洁合规承诺书模版.docx', note: '请下载模板签署盖章后上传', enforced: true },
    checkPoints: '1.须按最新年度模版出具；2.须加盖企业鲜章。',
    purpose: '声明不存在利益冲突禁止情形',
  }),
  builtinItem({
    key: 'tax', group: '财务资料', name: '增值税缴税证明或申报证明', kind: 'file', required: true,
    checkPoints: '1.至少提供最近一期所属期证明；2.须体现税种与所属期；3.未达起征点的提供申报证明（线上申报可网站截图）。',
  }),
  builtinItem({
    key: 'finance-balance', group: '财务资料', name: '资产负债表', kind: 'file', required: true,
    checkPoints: '1.至少提供最新一期；2.须为盖章版。',
  }),
  builtinItem({
    key: 'finance-income', group: '财务资料', name: '利润表', kind: 'file', required: true,
    checkPoints: '1.至少提供最新一期；2.须为盖章版。',
  }),
  builtinItem({
    key: 'finance-cash', group: '财务资料', name: '现金流量表', kind: 'file', required: true,
    checkPoints: '1.至少提供最新一期；2.须为盖章版。',
  }),
  builtinItem({
    key: 'x-due-diligence', group: '外部核查', name: '外部合规核查', kind: 'checklist', required: true,
    checkPoints: '1.近三年未受过重大行政处罚（超 10 万元）或造成重大声誉影响；\n2.现任股东、董事、监事、法人或高管近三年无失信记录、无违规记录；\n3.企业股东、董监高或高管与药厂员工不存在利益冲突禁止情形。',
    purpose: '审核方线下/第三方核查，申请方不可见',
  }),
];

function defaultTemplateItems(): AccessTemplateItem[] {
  return DEFAULT_ACCESS_TEMPLATE_ITEMS.map((i) => ({ ...i }));
}

/** 朗盛生物「标准合作」：在默认模板基础上增改，覆盖两类上传+全部填写类型（走查演示用） */
function langsengStandardItems(): AccessTemplateItem[] {
  const items = defaultTemplateItems().map((i) => {
    if (i.key === 'integrity') {
      return { ...i, templateRef: { fileName: '廉洁合规承诺书模版-2026版.docx', note: '必须使用 2026 年版模板签署盖章后上传', enforced: true } };
    }
    if (i.key === 'photos') {
      return { ...i, checkPoints: '1.须覆盖办公场地门口、内部全貌与办公人员；2.照片须为近期实拍。' };
    }
    if (i.key === 'labor') {
      return { ...i, templateRef: { fileName: '劳动/劳务合同参考样例.docx', note: '可参考样例准备合同材料' } };
    }
    return i;
  });
  items.push(
    { key: 'directors', group: '制度与承诺', name: '董事、监事及高级管理层花名册', kind: 'image', required: true, minCount: 1, checkPoints: '1.截取企业信息查询平台「主要人员」板块，须含查询时间；2.关键岗位人员须无利益冲突情形。', purpose: '核验关键管理人员与药厂是否存在关联关系' },
    { key: 'f-social-count', group: '人员与社保', name: '当前社保缴纳人数', kind: 'form-number', required: true, checkPoints: '须与社保证明所载人数一致。' },
    { key: 'f-vendor-type', group: '证照资质', name: '申请服务商类型', kind: 'form-select', required: true, options: ['一类推广服务商（CSO）', '二类综合服务商'], checkPoints: '应结合经营范围选择，与经营范围无关的不可选择。' },
    { key: 'f-reg-date', group: '证照资质', name: '营业执照注册日期', kind: 'form-date', required: true, checkPoints: '须与营业执照登记信息一致，注册时间须满三个月。' },
  );
  return items;
}

/** 朗盛生物「重点合作」（停用演示）：在标准合作上追加财务制度项 */
function langsengPremiumItems(): AccessTemplateItem[] {
  return [
    ...langsengStandardItems().map((i) => ({ ...i, required: i.kind === 'checklist' ? i.required : false, templateRef: i.templateRef && i.templateRef.enforced ? i.templateRef : undefined })),
    { key: 'finance-policy', group: '财务资料', name: '财务管控制度文件', kind: 'file', required: true, checkPoints: '须包含财务组织与职责、预算、费用、资金、税务管理等章节。' },
  ];
}

function makeTemplate(t: PharmaAccessTemplate): PharmaAccessTemplate {
  return { ...t, items: t.items.map((i) => ({ ...i })) };
}

export function templateVersionLabel(t: PharmaAccessTemplate): string {
  return `V${t.version ?? 1}`;
}

/** 种子模板：百益=默认模板副本；朗盛=标准合作（启用，9 类演示）+ 重点合作（停用） */
function seedTemplates(): Record<string, PharmaAccessTemplate[]> {
  return {
    'org-pharma': [
      makeTemplate({ id: 'pt-baiyi-default', name: '默认模板', items: defaultTemplateItems(), enabled: true, version: 1, updatedAt: '2026-09-10 09:30', updatedBy: '王敏' }),
    ],
    'org-rt-langseng': [
      makeTemplate({ id: 'pt-langseng-standard', name: '标准合作', items: langsengStandardItems(), enabled: true, version: 2, updatedAt: '2026-09-15 16:20', updatedBy: '朗盛合规部' }),
      makeTemplate({ id: 'pt-langseng-premium', name: '重点合作', items: langsengPremiumItems(), enabled: false, version: 1, updatedAt: '2026-09-08 11:00', updatedBy: '朗盛合规部' }),
    ],
  };
}

// ─── 种子任务（药厂发起制：全状态覆盖演示；服务商=陈伟（东方恒业）视角含两厂任务）──

function snapOf(template: PharmaAccessTemplate): AccessRequirementSnapshot {
  return {
    templateName: template.name,
    templateVersion: templateVersionLabel(template),
    items: template.items.map((i) => ({ ...i })),
  };
}

const T = seedTemplates();

function baseTask(fields: {
  id: string;
  pharma: { tenantId: string; name: string; code?: string };
  /** 待领取任务无绑定服务商（null）；已发起任务携带企业资料（服务商提交时可覆盖） */
  provider: { tenantId: string; name: string; creditCode: string; legalRep: string; address: string; contactName: string; contactMobile: string } | null;
  template: PharmaAccessTemplate;
  history: VendorAccessHistory[];
}): VendorAccessRecord {
  return {
    id: fields.id,
    providerTenantId: fields.provider?.tenantId,
    vendorName: fields.provider?.name ?? '',
    creditCode: fields.provider?.creditCode ?? '',
    legalRep: fields.provider?.legalRep ?? '',
    address: fields.provider?.address ?? '',
    contactName: fields.provider?.contactName ?? '',
    contactMobile: fields.provider?.contactMobile ?? '',
    pharmaTenantId: fields.pharma.tenantId,
    pharmaName: fields.pharma.name,
    pharmaCode: fields.pharma.code,
    templateId: fields.template.id,
    templateVersion: templateVersionLabel(fields.template),
    itemResponses: {},
    attachments: {},
    status: '待领取',
    requirementSnapshot: snapOf(fields.template),
    createdBy: '王敏',
    history: fields.history,
  };
}

const PHARMA_BAIYI = { tenantId: 'org-pharma', name: '百益制药', code: 'E9K4P7X2' };
const PHARMA_LANGSENG = { tenantId: 'org-rt-langseng', name: '朗盛生物', code: 'N4PJ2XKM' };
const VENDOR_EAST = { tenantId: 'org-provider-east', name: '东方恒业医药科技有限公司', creditCode: '91330106MA02EFGH34', legalRep: '陈伟', address: '杭州市滨江区江南大道 588 号', contactName: '陈伟', contactMobile: '13800001234' };
const VENDOR_SMART = { tenantId: 'org-provider-smart', name: '智联科技有限公司', creditCode: '91110108MA01ABCD12', legalRep: '赵启明', address: '北京市海淀区中关村大街 1 号', contactName: '钱薇', contactMobile: '13800001111' };
const VENDOR_KANGSHENG = { tenantId: 'org-provider-kangsheng', name: '康晟云服科技有限公司', creditCode: '91370100MA03IJKL56', legalRep: '孙嘉', address: '济南市高新区舜华路 200 号', contactName: '孙嘉', contactMobile: '13700003333' };
const VENDOR_YONGTAI = { tenantId: 'org-provider-yongtai', name: '永泰汇通推广有限公司', creditCode: '91330000MA04MNOP78', legalRep: '郑伟', address: '杭州市西湖区文三路 90 号', contactName: '郑伟', contactMobile: '13600004444' };
const VENDOR_TAIHE = { tenantId: 'org-rt-taihe', name: '泰合医学推广有限公司', creditCode: '91330108MA6KJW3N5A', legalRep: '骆佳', address: '浙江省杭州市滨江区江南大道 100 号', contactName: '骆佳', contactMobile: '13809120119' };

/** 系统内服务商主体的信用代码内置映射（合作关系批量导入检索兜底：registry 未登记的演示服务商 org） */
export const PROVIDER_USCC_OF_ORG: Record<string, { name: string; uscc: string }> = {
  [VENDOR_EAST.tenantId]: { name: VENDOR_EAST.name, uscc: VENDOR_EAST.creditCode },
  [VENDOR_SMART.tenantId]: { name: VENDOR_SMART.name, uscc: VENDOR_SMART.creditCode },
  [VENDOR_KANGSHENG.tenantId]: { name: VENDOR_KANGSHENG.name, uscc: VENDOR_KANGSHENG.creditCode },
  [VENDOR_YONGTAI.tenantId]: { name: VENDOR_YONGTAI.name, uscc: VENDOR_YONGTAI.creditCode },
  [VENDOR_TAIHE.tenantId]: { name: VENDOR_TAIHE.name, uscc: VENDOR_TAIHE.creditCode },
};

const FULL_MATERIALS = {
  license: ['营业执照.pdf'],
  'legal-id': ['法人身份证.pdf'],
  social: ['社保证明.pdf'],
  labor: ['劳动合同.pdf'],
  lease: ['房屋租赁证明.pdf'],
  photos: ['实地照片-门口.jpg', '实地照片-内部.jpg', '实地照片-工位.jpg'],
  integrity: ['廉洁合规承诺书-盖章版.pdf'],
  tax: ['完税证明.pdf'],
  'finance-balance': ['资产负债表.pdf'],
  'finance-income': ['利润表.pdf'],
  'finance-cash': ['现金流量表.pdf'],
};

function seedRecords(): VendorAccessRecord[] {
  return [
    // VA-001 百益→东方恒业：待服务商提交（陈伟登录主演示路径）
    {
      ...baseTask({
        id: 'VA-001', pharma: PHARMA_BAIYI, provider: VENDOR_EAST, template: T['org-pharma'][0],
        history: [
          { id: 'VH-002', action: '发起', operator: '陈伟', role: '服务提供商', time: '2026-09-20 10:02', comment: '输入准入码发起准入。' },
          { id: 'VH-001', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-20 10:00' },
        ],
      }),
      status: '待服务商提交',
      createdAt: '2026-09-20 10:00',
      admissionCode: 'CW4TN8R2',
      claimedAt: '2026-09-20 10:02',
    },
    // VA-002 百益→康晟：审核中（药厂退回/驳回/通过演示）
    {
      ...baseTask({
        id: 'VA-002', pharma: PHARMA_BAIYI, provider: VENDOR_KANGSHENG, template: T['org-pharma'][0],
        history: [
          { id: 'VH-005', action: '提交', operator: '孙嘉', role: '服务提供商', time: '2026-09-19 15:20' },
          { id: 'VH-004', action: '发起', operator: '孙嘉', role: '服务提供商', time: '2026-09-17 09:00' },
          { id: 'VH-003', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-17 08:58' },
        ],
      }),
      status: '审核中',
      createdAt: '2026-09-17 08:58',
      admissionCode: 'KS7MP3XA',
      claimedAt: '2026-09-17 09:00',
      submittedAt: '2026-09-19 15:20',
      attachments: FULL_MATERIALS,
    },
    // VA-003 百益→智联：已准入（续期/失效/撤销演示）
    {
      ...baseTask({
        id: 'VA-003', pharma: PHARMA_BAIYI, provider: VENDOR_SMART, template: T['org-pharma'][0],
        history: [
          { id: 'VH-009', action: '通过', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-06-20 14:10', comment: '准入通过：有效期至 2027-06-19。' },
          { id: 'VH-008', action: '提交', operator: '钱薇', role: '服务提供商', time: '2026-06-18 11:00' },
          { id: 'VH-007', action: '发起', operator: '钱薇', role: '服务提供商', time: '2026-06-10 09:30' },
          { id: 'VH-006', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-06-10 09:28' },
        ],
      }),
      status: '已准入',
      createdAt: '2026-06-10 09:28',
      admissionCode: 'ZL2YB6KD',
      claimedAt: '2026-06-10 09:30',
      submittedAt: '2026-06-18 11:00',
      reviewedAt: '2026-06-20 14:10',
      reviewedBy: '王敏',
      approvedAt: '2026-06-20 14:10',
      effectiveFrom: '2026-06-20',
      effectiveTo: '2027-06-19',
      attachments: FULL_MATERIALS,
    },
    // VA-004 朗盛→东方恒业：审核中（差异化模板 9 类项演示；朗盛侧可审核）
    {
      ...baseTask({
        id: 'VA-004', pharma: PHARMA_LANGSENG, provider: VENDOR_EAST, template: T['org-rt-langseng'][0],
        history: [
          { id: 'VH-012', action: '提交', operator: '陈伟', role: '服务提供商', time: '2026-09-18 16:40' },
          { id: 'VH-011', action: '发起', operator: '陈伟', role: '服务提供商', time: '2026-09-17 11:00' },
          { id: 'VH-010', action: '创建任务', operator: '朗盛合规部', role: '企业管理员 · 合规部', time: '2026-09-17 10:58' },
        ],
      }),
      status: '审核中',
      createdAt: '2026-09-17 10:58',
      admissionCode: 'DF5HC9QM',
      claimedAt: '2026-09-17 11:00',
      submittedAt: '2026-09-18 16:40',
      itemResponses: { 'f-social-count': '12', 'f-vendor-type': '一类推广服务商（CSO）' },
      attachments: {
        license: ['东方恒业-营业执照.pdf'],
        'legal-id': ['东方恒业-法人身份证.pdf'],
        social: ['东方恒业-社保证明.pdf'],
        labor: ['东方恒业-劳动合同.pdf'],
        lease: ['东方恒业-房屋租赁证明.pdf'],
        photos: ['东方恒业-实地照片-门口.jpg', '东方恒业-实地照片-内部.jpg', '东方恒业-实地照片-工位.jpg'],
        integrity: ['东方恒业-廉洁合规承诺书.pdf'],
        tax: ['东方恒业-完税证明.pdf'],
        'finance-balance': ['东方恒业-资产负债表.pdf'],
        'finance-income': ['东方恒业-利润表.pdf'],
        'finance-cash': ['东方恒业-现金流量表.pdf'],
        directors: ['东方恒业-企查查主要人员截图.png'],
      },
      createdBy: '朗盛合规部',
    },
    // VA-005 百益→永泰：已驳回（终态演示）
    {
      ...baseTask({
        id: 'VA-005', pharma: PHARMA_BAIYI, provider: VENDOR_YONGTAI, template: T['org-pharma'][0],
        history: [
          { id: 'VH-017', action: '驳回', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-08 15:00', comment: '提交材料与既有合作主体信息不一致，本轮准入终止。' },
          { id: 'VH-016', action: '提交', operator: '郑伟', role: '服务提供商', time: '2026-09-05 10:00' },
          { id: 'VH-015', action: '发起', operator: '郑伟', role: '服务提供商', time: '2026-09-01 09:00' },
          { id: 'VH-014', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-01 08:58' },
        ],
      }),
      status: '已驳回',
      createdAt: '2026-09-01 08:58',
      admissionCode: 'YT8WJ4NE',
      claimedAt: '2026-09-01 09:00',
      submittedAt: '2026-09-05 10:00',
      reviewedAt: '2026-09-08 15:00',
      reviewedBy: '王敏',
      rejectionReason: '提交材料与既有合作主体信息不一致（营业执照与合作关系登记主体不符），本轮准入终止；如需继续合作请联系本厂合规部重新发起任务。',
      attachments: FULL_MATERIALS,
    },
    // VA-006 百益→智联：已撤回（撤回原因展示）
    {
      ...baseTask({
        id: 'VA-006', pharma: PHARMA_BAIYI, provider: VENDOR_SMART, template: T['org-pharma'][0],
        history: [
          { id: 'VH-020', action: '撤回', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-16 14:00', comment: '准入范围调整，撤回后重新发起。' },
          { id: 'VH-019', action: '发起', operator: '钱薇', role: '服务提供商', time: '2026-09-15 10:00' },
          { id: 'VH-018', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-15 09:58' },
        ],
      }),
      status: '已撤回',
      createdAt: '2026-09-15 09:58',
      admissionCode: 'ZL3R7TFS',
      claimedAt: '2026-09-15 10:00',
      withdrawalReason: '准入范围调整，本任务撤回；调整完成后将以新任务重新发起。',
    },
    // VA-007 百益：待领取（准入码制演示——药厂创建即得码，等服务商输入；固定演示码便于走查）
    {
      ...baseTask({
        id: 'VA-007', pharma: PHARMA_BAIYI, provider: null, template: T['org-pharma'][0],
        history: [
          { id: 'VH-021', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-09-20 16:30', comment: '已生成准入码，待服务商发起准入。' },
        ],
      }),
      status: '待领取',
      createdAt: '2026-09-20 16:30',
      admissionCode: 'BR9K4F2Q',
    },
    // VA-008 百益→泰合：已准入但尚无品种授权（演示「通过后待品种授权」衔接提示；
    // 对应 cooperationModel 种子 rel-baiyi-taihe：合作生效、无任何业务授权）
    {
      ...baseTask({
        id: 'VA-008', pharma: PHARMA_BAIYI, provider: VENDOR_TAIHE, template: T['org-pharma'][0],
        history: [
          { id: 'VH-025', action: '通过', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-08-05 11:20', comment: '准入通过：有效期 2026-08-05 至 2027-08-04；已同步创建合作关系。' },
          { id: 'VH-024', action: '提交', operator: '骆佳', role: '服务提供商', time: '2026-08-01 14:30' },
          { id: 'VH-023', action: '发起', operator: '骆佳', role: '服务提供商', time: '2026-07-28 09:10' },
          { id: 'VH-022', action: '创建任务', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-07-28 09:08' },
        ],
      }),
      status: '已准入',
      createdAt: '2026-07-28 09:08',
      admissionCode: 'TH6KA2VB',
      claimedAt: '2026-07-28 09:10',
      submittedAt: '2026-08-01 14:30',
      reviewedAt: '2026-08-05 11:20',
      reviewedBy: '赵宁',
      approvedAt: '2026-08-05 11:20',
      effectiveFrom: '2026-08-05',
      effectiveTo: '2027-08-04',
      attachments: FULL_MATERIALS,
      createdBy: '赵宁',
    },
    // VA-009 百益→东方恒业：已准入（2026 年度复检，品种授权已配置——闭环完成分支演示）
    {
      ...baseTask({
        id: 'VA-009', pharma: PHARMA_BAIYI, provider: VENDOR_EAST, template: T['org-pharma'][0],
        history: [
          { id: 'VH-029', action: '通过', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-03-10 15:40', comment: '年度复检通过：有效期 2026-03-10 至 2027-03-09。' },
          { id: 'VH-028', action: '提交', operator: '陈伟', role: '服务提供商', time: '2026-03-06 10:15' },
          { id: 'VH-027', action: '发起', operator: '陈伟', role: '服务提供商', time: '2026-02-25 09:00' },
          { id: 'VH-026', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-02-25 08:58' },
        ],
      }),
      status: '已准入',
      createdAt: '2026-02-25 08:58',
      admissionCode: 'DF9MU5WG',
      claimedAt: '2026-02-25 09:00',
      submittedAt: '2026-03-06 10:15',
      reviewedAt: '2026-03-10 15:40',
      reviewedBy: '王敏',
      approvedAt: '2026-03-10 15:40',
      effectiveFrom: '2026-03-10',
      effectiveTo: '2027-03-09',
      attachments: FULL_MATERIALS,
    },
    // VA-010 百益→康晟云服：已准入但合同未归档（合同管理「待上传」演示行之二；
    // 康晟与百益合作/品种授权已生效，见 cooperationModel rel-baiyi-kangsheng）
    {
      ...baseTask({
        id: 'VA-010', pharma: PHARMA_BAIYI, provider: VENDOR_KANGSHENG, template: T['org-pharma'][0],
        history: [
          { id: 'VH-033', action: '通过', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-05-12 14:20', comment: '准入通过：有效期 2026-05-12 至 2027-05-11。' },
          { id: 'VH-032', action: '提交', operator: '孙嘉', role: '服务提供商', time: '2026-05-10 16:40' },
          { id: 'VH-031', action: '发起', operator: '孙嘉', role: '服务提供商', time: '2026-05-06 09:15' },
          { id: 'VH-030', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-05-06 09:12' },
        ],
      }),
      status: '已准入',
      createdAt: '2026-05-06 09:12',
      admissionCode: 'KS5RM8TP',
      claimedAt: '2026-05-06 09:15',
      submittedAt: '2026-05-10 16:40',
      reviewedAt: '2026-05-12 14:20',
      reviewedBy: '王敏',
      approvedAt: '2026-05-12 14:20',
      effectiveFrom: '2026-05-12',
      effectiveTo: '2027-05-11',
      attachments: FULL_MATERIALS,
    },
    // VA-011 百益→永泰汇通：已准入但合同未归档（合同管理「待上传」演示行之三；
    // 早于 VA-005（2026-09 新任务因材料不一致被驳回）——已准入与新任务被驳回并存不冲突）
    {
      ...baseTask({
        id: 'VA-011', pharma: PHARMA_BAIYI, provider: VENDOR_YONGTAI, template: T['org-pharma'][0],
        history: [
          { id: 'VH-037', action: '通过', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-08-20 10:05', comment: '准入通过：有效期 2026-08-20 至 2027-08-19。' },
          { id: 'VH-036', action: '提交', operator: '郑伟', role: '服务提供商', time: '2026-08-18 11:30' },
          { id: 'VH-035', action: '发起', operator: '郑伟', role: '服务提供商', time: '2026-08-15 09:40' },
          { id: 'VH-034', action: '创建任务', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-08-15 09:38' },
        ],
      }),
      status: '已准入',
      createdAt: '2026-08-15 09:38',
      admissionCode: 'YT3KQ7WC',
      claimedAt: '2026-08-15 09:40',
      submittedAt: '2026-08-18 11:30',
      reviewedAt: '2026-08-20 10:05',
      reviewedBy: '赵宁',
      approvedAt: '2026-08-20 10:05',
      effectiveFrom: '2026-08-20',
      effectiveTo: '2027-08-19',
      attachments: FULL_MATERIALS,
      createdBy: '赵宁',
    },
    // VA-012 百益→永泰汇通：审核中（呼应 VA-005 驳回——按驳回意见修正材料后重新发起，演示驳回→重发→再审核闭环）
    {
      ...baseTask({
        id: 'VA-012', pharma: PHARMA_BAIYI, provider: VENDOR_YONGTAI, template: T['org-pharma'][0],
        history: [
          { id: 'VH-040', action: '提交', operator: '郑伟', role: '服务提供商', time: '2026-10-13 16:40', comment: '已按 9 月驳回意见更换为合作关系登记主体的营业执照，并同步更新社保与劳动合同材料。' },
          { id: 'VH-039', action: '发起', operator: '郑伟', role: '服务提供商', time: '2026-10-09 09:15' },
          { id: 'VH-038', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-10-09 09:12' },
        ],
      }),
      status: '审核中',
      createdAt: '2026-10-09 09:12',
      admissionCode: 'YT6HQ4MS',
      claimedAt: '2026-10-09 09:15',
      submittedAt: '2026-10-13 16:40',
      attachments: FULL_MATERIALS,
    },
    // VA-013 百益→智联科技：审核中（呼应 VA-006 撤回——准入范围调整完成后重新发起，演示撤回→重发→再审核闭环）
    {
      ...baseTask({
        id: 'VA-013', pharma: PHARMA_BAIYI, provider: VENDOR_SMART, template: T['org-pharma'][0],
        history: [
          { id: 'VH-043', action: '提交', operator: '钱薇', role: '服务提供商', time: '2026-10-14 11:20', comment: '按调整后的准入范围重新提交全部材料。' },
          { id: 'VH-042', action: '发起', operator: '钱薇', role: '服务提供商', time: '2026-10-10 10:02' },
          { id: 'VH-041', action: '创建任务', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-10-10 10:00' },
        ],
      }),
      status: '审核中',
      createdAt: '2026-10-10 10:00',
      admissionCode: 'ZL8NW5RC',
      claimedAt: '2026-10-10 10:02',
      submittedAt: '2026-10-14 11:20',
      attachments: {
        license: ['智联科技-营业执照.pdf'],
        'legal-id': ['智联科技-法人身份证.pdf'],
        social: ['智联科技-社保证明.pdf'],
        labor: ['智联科技-劳动合同.pdf'],
        lease: ['智联科技-房屋租赁证明.pdf'],
        photos: ['智联科技-实地照片-门口.jpg', '智联科技-实地照片-内部.jpg', '智联科技-实地照片-工位.jpg'],
        integrity: ['智联科技-廉洁合规承诺书-盖章版.pdf'],
        tax: ['智联科技-完税证明.pdf'],
        'finance-balance': ['智联科技-资产负债表.pdf'],
        'finance-income': ['智联科技-利润表.pdf'],
        'finance-cash': ['智联科技-现金流量表.pdf'],
      },
      createdBy: '赵宁',
    },
    // VA-014 百益→东方恒业：已驳回+按项结论（按项驳回机制主演示：2 项驳回带原因+其余通过，
    // 陈伟（东方恒业）登录可在原任务上修改驳回项后重新提交，通过项锁定无需重传）
    {
      ...baseTask({
        id: 'VA-014', pharma: PHARMA_BAIYI, provider: VENDOR_EAST, template: T['org-pharma'][0],
        history: [
          { id: 'VH-047', action: '驳回', operator: '赵宁', role: '企业管理员 · 合规部', time: '2026-10-15 16:20', comment: '退回修改：2 项被驳回（社保缴纳证明（近三个月）、经营实地照片），其余 11 项通过、无需重传。' },
          { id: 'VH-046', action: '提交', operator: '陈伟', role: '服务提供商', time: '2026-10-12 14:10' },
          { id: 'VH-045', action: '发起', operator: '陈伟', role: '服务提供商', time: '2026-10-11 09:33' },
          { id: 'VH-044', action: '创建任务', operator: '王敏', role: '企业管理员 · 合规部', time: '2026-10-11 09:30' },
        ],
      }),
      status: '已驳回',
      createdAt: '2026-10-11 09:30',
      admissionCode: 'DF3TW8XK',
      claimedAt: '2026-10-11 09:33',
      submittedAt: '2026-10-12 14:10',
      reviewedAt: '2026-10-15 16:20',
      reviewedBy: '赵宁',
      attachments: FULL_MATERIALS,
      itemVerdicts: {
        license: { verdict: 'pass' },
        'open-account': { verdict: 'pass' },
        'legal-id': { verdict: 'pass' },
        social: { verdict: 'reject', reason: '社保缴纳人数与劳动合同所列人员不一致，请补充人员对应说明或更新证明。' },
        labor: { verdict: 'pass' },
        lease: { verdict: 'pass' },
        photos: { verdict: 'reject', reason: '实地照片未体现办公人员在岗，请补拍含人员的办公区近照。' },
        system: { verdict: 'pass' },
        integrity: { verdict: 'pass' },
        tax: { verdict: 'pass' },
        'finance-balance': { verdict: 'pass' },
        'finance-income': { verdict: 'pass' },
        'finance-cash': { verdict: 'pass' },
      },
    },
  ];
}

// ─── 清单校验（提交前按任务快照项校验；供表单与 store 共用）────────────────────

export interface AccessValidation {
  /** 必传文件缺失项 */
  missingFiles: AccessTemplateItem[];
  /** 数量不足项（图片类最少张数） */
  insufficient: AccessTemplateItem[];
  /** 必填填写项缺失 */
  missingForms: AccessTemplateItem[];
  readonly all: number;
}

export function isUploadKind(kind: AccessItemKind): boolean {
  return kind === 'file' || kind === 'image';
}

export function validateApplication(
  items: AccessTemplateItem[],
  input: Pick<VendorMaterialInput, 'itemResponses' | 'attachments'>,
): AccessValidation {
  const missingFiles: AccessTemplateItem[] = [];
  const insufficient: AccessTemplateItem[] = [];
  const missingForms: AccessTemplateItem[] = [];
  for (const item of items) {
    if (item.kind === 'checklist') continue; // 审核方核查项，服务商不作答
    if (isUploadKind(item.kind)) {
      const files = (input.attachments[item.key] ?? []).filter((f) => f.trim());
      // 文件类固定一份（上传端仅保留一份）；图片类按模板设置的最少张数校验
      if (files.length === 0) {
        if (item.required) missingFiles.push(item);
      } else if (item.kind === 'image' && item.minCount && files.length < item.minCount) {
        insufficient.push(item);
      }
    } else {
      if (item.required && !String(input.itemResponses[item.key] ?? '').trim()) missingForms.push(item);
    }
  }
  return {
    missingFiles,
    insufficient,
    missingForms,
    get all() {
      return missingFiles.length + insufficient.length + missingForms.length;
    },
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface PersistState {
  v: 9;
  pharmaTemplates: Record<string, PharmaAccessTemplate[]>;
  records: VendorAccessRecord[];
}

function loadPersisted(): PersistState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistState;
    if (parsed.v !== 9 || !parsed.records || !parsed.pharmaTemplates) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function VendorAccessProvider({ children }: { children: ReactNode }) {
  const { principal, can, logAudit } = usePermission();
  const initial = useRef<PersistState | null>(null);
  if (initial.current === null) initial.current = loadPersisted();

  const [records, setRecords] = useState<VendorAccessRecord[]>(() => initial.current?.records ?? seedRecords());
  const [templates, setTemplates] = useState<Record<string, PharmaAccessTemplate[]>>(
    () => initial.current?.pharmaTemplates ?? seedTemplates(),
  );
  const seeded = useRef(!initial.current);

  // 持久化（原型口径：本地模拟）
  useEffect(() => {
    if (seeded.current) {
      // 首次挂载（种子态）即落盘，保证刷新后与首次一致
      seeded.current = false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 9, pharmaTemplates: templates, records }));
    } catch {
      /* 忽略配额异常（原型数据量小） */
    }
  }, [templates, records]);

  /** 当前登录租户 org id（PLATFORM 主体为空串；服务商侧归属过滤与操作校验使用） */
  const myTenantId = principal.realm === 'TENANT' ? principal.tenantId : '';
  /** 当前登录药厂租户 org id（非药厂租户为空串；药厂侧操作校验使用） */
  const myPharmaTenantId =
    principal.realm === 'TENANT' && principal.tenantKind === 'pharma' ? principal.tenantId : '';

  // 服务商可见任务：归属本服务商主体（待领取未绑定/他厂任务天然不可见——Mock 数据隔离）
  const myTasks = useMemo(
    () => (myTenantId ? records.filter((r) => r.providerTenantId === myTenantId) : []),
    [records, myTenantId],
  );

  // 准入全流程审计（操作人/时间/状态变化/原因 均落审计日志）
  const auditAccess = useCallback(
    (action: string, target: string, reason: string, afterSummary?: string, beforeSummary?: string) => {
      logAudit({
        module: '服务商准入',
        action,
        target,
        resource: 'vendor-access',
        reason,
        ...(afterSummary ? { afterSummary } : {}),
        ...(beforeSummary ? { beforeSummary } : {}),
      });
    },
    [logAudit],
  );

  const operator = { name: principal.name };
  const principalRoleLabel: VendorAccessHistory['role'] =
    principal.realm === 'TENANT' && principal.tenantKind === 'pharma'
      ? '企业管理员 · 合规部'
      : '服务提供商';
  const isVendorSide = can('vendor-access', 'submit');
  const isReviewer = can('vendor-access', 'approve');
  const canIssueTask = isReviewer && can('vendor-access', 'create');

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
      { id: nextHistoryId(), action, operator: operator.name, role: principalRoleLabel, time: stamp(), comment },
      ...record.history,
    ],
    [nextHistoryId, operator.name, principalRoleLabel],
  );

  // ── 归属与状态校验（任务 ID 绝不直接作为授权依据）────────────────────────────

  /** 药厂侧操作前置校验：任务存在 + 本厂归属 + 审核权限；返回错误文案或 undefined */
  const pharmaGuard = useCallback(
    (taskId: string, allowed: VendorAccessStatus[], actionLabel: string): { error?: string; task?: VendorAccessRecord } => {
      if (!isReviewer) return { error: '当前角色无准入审核权限' };
      const task = records.find((r) => r.id === taskId);
      if (!task) return { error: '任务不存在' };
      // 租户隔离：只能操作本厂发起的任务（以任务归属字段复核，不信任前端路由/参数）
      if (task.pharmaTenantId !== myPharmaTenantId) return { error: `仅可操作本厂发起的准入任务（${actionLabel}）` };
      if (allowed.length && !allowed.includes(task.status)) {
        return { error: `当前任务状态为「${task.status}」，不可${actionLabel}` };
      }
      return { task };
    },
    [isReviewer, myPharmaTenantId, records],
  );

  /** 服务商侧操作前置校验：任务存在 + 归属本服务商主体 + 状态窗口开放 */
  const vendorGuard = useCallback(
    (taskId: string, allowed: VendorAccessStatus[], actionLabel: string): { error?: string; task?: VendorAccessRecord } => {
      if (!isVendorSide) return { error: '当前角色无准入材料提交权限' };
      const task = records.find((r) => r.id === taskId);
      if (!task) return { error: '任务不存在' };
      if (task.providerTenantId !== myTenantId) return { error: '该任务未绑定本服务商主体，无权操作' };
      if (allowed.length && !allowed.includes(task.status)) {
        return { error: `当前任务状态为「${task.status}」，不可${actionLabel}` };
      }
      return { task };
    },
    [isVendorSide, myTenantId, records],
  );

  // ── 模板管理（药厂侧）──────────────────────────────────────────────────────

  const ensureTemplatesFor = useCallback(
    (pharmaTenantId: string): PharmaAccessTemplate[] => {
      const existing = templates[pharmaTenantId];
      if (existing && existing.length > 0) return existing;
      const init = [
        makeTemplate({ id: `pt-${pharmaTenantId}-default`, name: '默认模板', items: defaultTemplateItems(), enabled: true, version: 1, updatedAt: stamp(), updatedBy: operator.name }),
      ];
      setTemplates((prev) => (prev[pharmaTenantId] ? prev : { ...prev, [pharmaTenantId]: init }));
      return init;
    },
    [templates, operator.name],
  );

  const templatesOf = useCallback(
    (pharmaTenantId: string) => templates[pharmaTenantId] ?? [],
    [templates],
  );

  const enabledTemplateOf = useCallback(
    (pharmaTenantId: string) => (templates[pharmaTenantId] ?? []).find((t) => t.enabled),
    [templates],
  );

  const mutateTemplates = useCallback(
    (pharmaTenantId: string, fn: (list: PharmaAccessTemplate[]) => PharmaAccessTemplate[]) => {
      setTemplates((prev) => ({ ...prev, [pharmaTenantId]: fn(prev[pharmaTenantId] ?? []) }));
    },
    [],
  );

  const createTemplate = useCallback(
    (pharmaTenantId: string, name: string, init: TemplateInitSource): VendorAccessOpResult => {
      if (!isReviewer || !can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const trimmed = name.trim();
      if (trimmed.length < 2) return { ok: false, error: '模板名称不能少于 2 个字符' };
      const list = templates[pharmaTenantId] ?? [];
      if (list.some((t) => t.name === trimmed)) return { ok: false, error: '已存在同名模板' };
      let items: AccessTemplateItem[];
      if (init.type === 'blank') items = [];
      else if (init.type === 'default') items = defaultTemplateItems();
      else {
        const src = list.find((t) => t.id === init.sourceTemplateId);
        if (!src) return { ok: false, error: '来源模板不存在' };
        items = src.items.map((i) => ({ ...i }));
      }
      const created = makeTemplate({ id: `pt-${Date.now().toString(36)}`, name: trimmed, items, enabled: false, version: 1, updatedAt: stamp(), updatedBy: operator.name });
      mutateTemplates(pharmaTenantId, (l) => [...l, created]);
      auditAccess('新建准入模板', `${tenantById(pharmaTenantId)?.name ?? pharmaTenantId} · ${trimmed}`, `初始化方式：${init.type === 'blank' ? '空白' : init.type === 'default' ? '系统默认模板' : '复制现有模板'}`, `${items.length} 项`);
      return { ok: true };
    },
    [auditAccess, can, isReviewer, mutateTemplates, operator.name, templates],
  );

  const renameTemplate = useCallback(
    (pharmaTenantId: string, templateId: string, name: string): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const trimmed = name.trim();
      if (trimmed.length < 2) return { ok: false, error: '模板名称不能少于 2 个字符' };
      const list = templates[pharmaTenantId] ?? [];
      if (list.some((t) => t.id !== templateId && t.name === trimmed)) return { ok: false, error: '已存在同名模板' };
      mutateTemplates(pharmaTenantId, (l) => l.map((t) => (t.id === templateId ? { ...t, name: trimmed, updatedAt: stamp(), updatedBy: operator.name } : t)));
      auditAccess('重命名准入模板', trimmed, '模板重命名');
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, operator.name, templates],
  );

  const deleteTemplate = useCallback(
    (pharmaTenantId: string, templateId: string): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const list = templates[pharmaTenantId] ?? [];
      const target = list.find((t) => t.id === templateId);
      if (!target) return { ok: false, error: '模板不存在' };
      if (target.enabled) return { ok: false, error: '启用中的模板不可删除，请先切换其他模板' };
      mutateTemplates(pharmaTenantId, (l) => l.filter((t) => t.id !== templateId));
      auditAccess('删除准入模板', target.name, '模板删除', `${target.items.length} 项一并移除`);
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, templates],
  );

  const enableTemplate = useCallback(
    (pharmaTenantId: string, templateId: string): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const list = templates[pharmaTenantId] ?? [];
      const target = list.find((t) => t.id === templateId);
      if (!target) return { ok: false, error: '模板不存在' };
      if (target.enabled) return { ok: false, error: '该模板已是启用中' };
      if (target.items.length === 0) return { ok: false, error: '空模板不可启用，请先添加准入项' };
      const current = list.find((t) => t.enabled);
      mutateTemplates(pharmaTenantId, (l) =>
        l.map((t) => (t.id === templateId ? { ...t, enabled: true, updatedAt: stamp(), updatedBy: operator.name } : t.enabled ? { ...t, enabled: false } : t)),
      );
      auditAccess('切换启用准入模板', `${tenantById(pharmaTenantId)?.name ?? pharmaTenantId} · ${target.name}`, '模板启用切换', `启用「${target.name}」${current ? `，停用「${current.name}」` : ''}；在途任务按创建时点快照不受影响`);
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, operator.name, templates],
  );

  const saveItem = useCallback(
    (pharmaTenantId: string, templateId: string, item: AccessTemplateItem): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      if (!item.name.trim()) return { ok: false, error: '请填写项名称' };
      if (item.kind === 'checklist') return { ok: false, error: '核查项为系统内置内容，不可新增或修改' };
      if (item.kind === 'form-select' && (item.options?.length ?? 0) < 2) {
        return { ok: false, error: '单选项须配置至少 2 个选项' };
      }
      const list = templates[pharmaTenantId] ?? [];
      const template = list.find((t) => t.id === templateId);
      if (!template) return { ok: false, error: '模板不存在' };
      const exists = template.items.some((i) => i.key === item.key);
      mutateTemplates(pharmaTenantId, (l) =>
        l.map((t) =>
          t.id === templateId
            ? {
                ...t,
                items: exists ? t.items.map((i) => (i.key === item.key ? item : i)) : [...t.items, item],
                knownGroups: [...new Set([...(t.knownGroups ?? []), item.group])],
                version: (t.version ?? 1) + 1,
                updatedAt: stamp(),
                updatedBy: operator.name,
              }
            : t,
        ),
      );
      auditAccess(exists ? '修改准入项' : '新增准入项', `${template.name} · ${item.name}`, `${exists ? '修改' : '新增'}${kindLabel(item.kind)}（模板升版 V${(template.version ?? 1) + 1}）`, item.required ? '必传/必填' : '选传/选填');
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, operator.name, templates],
  );

  const removeItem = useCallback(
    (pharmaTenantId: string, templateId: string, itemKey: string): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const list = templates[pharmaTenantId] ?? [];
      const template = list.find((t) => t.id === templateId);
      if (!template) return { ok: false, error: '模板不存在' };
      const target = template.items.find((i) => i.key === itemKey);
      if (!target) return { ok: false, error: '准入项不存在' };
      if (target.kind === 'checklist') return { ok: false, error: '核查项为系统内置内容，不可删除' };
      mutateTemplates(pharmaTenantId, (l) =>
        l.map((t) => (t.id === templateId ? { ...t, items: t.items.filter((i) => i.key !== itemKey), version: (t.version ?? 1) + 1, updatedAt: stamp(), updatedBy: operator.name } : t)),
      );
      auditAccess('删除准入项', `${template.name} · ${target.name}`, `删除模板项（模板升版 V${(template.version ?? 1) + 1}）`);
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, operator.name, templates],
  );

  const removeGroup = useCallback(
    (pharmaTenantId: string, templateId: string, group: string): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const list = templates[pharmaTenantId] ?? [];
      const template = list.find((t) => t.id === templateId);
      if (!template) return { ok: false, error: '模板不存在' };
      const groupItems = template.items.filter((i) => i.group === group);
      if (groupItems.length === 0) return { ok: false, error: '该大项不存在' };
      if (groupItems.some((i) => i.kind === 'checklist')) return { ok: false, error: '该大项包含系统内置核查项，不可整组删除' };
      const requiredCount = groupItems.filter((i) => i.required).length;
      mutateTemplates(pharmaTenantId, (l) =>
        l.map((t) =>
          t.id === templateId
            ? {
                ...t,
                // 组名保留在 knownGroups：删除后新建项仍可重新选择该大项
                items: t.items.filter((i) => i.group !== group),
                knownGroups: [...new Set([...(t.knownGroups ?? []), group])],
                version: (t.version ?? 1) + 1,
                updatedAt: stamp(),
                updatedBy: operator.name,
              }
            : t,
        ),
      );
      auditAccess('删除准入大项', `${template.name} · ${group}`, `整组删除 ${groupItems.length} 项（必传 ${requiredCount} 项，模板升版 V${(template.version ?? 1) + 1}）`, '组名已保留，新建项时可重新选择');
      return { ok: true };
    },
    [auditAccess, can, mutateTemplates, operator.name, templates],
  );

  const moveItem = useCallback(
    (pharmaTenantId: string, templateId: string, itemKey: string, dir: -1 | 1): VendorAccessOpResult => {
      if (!can('vendor-access', 'edit')) return { ok: false, error: '当前角色无准入模板配置权限' };
      const list = templates[pharmaTenantId] ?? [];
      const template = list.find((t) => t.id === templateId);
      if (!template) return { ok: false, error: '模板不存在' };
      const idx = template.items.findIndex((i) => i.key === itemKey);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= template.items.length) return { ok: false, error: '已到边界' };
      const items = [...template.items];
      const [moved] = items.splice(idx, 1);
      items.splice(to, 0, moved);
      mutateTemplates(pharmaTenantId, (l) => l.map((t) => (t.id === templateId ? { ...t, items, updatedAt: stamp(), updatedBy: operator.name } : t)));
      return { ok: true };
    },
    [can, mutateTemplates, operator.name, templates],
  );

  // ── 药厂：任务发起（准入码制）与流转 ───────────────────────────────────────

  /** 创建任务：只选模板（不指定服务商）；创建即生成一次性准入码，进入待领取 */
  const createTask = useCallback(
    (input: VendorAccessTaskInput): VendorAccessOpResult => {
      if (!canIssueTask) return { ok: false, error: '当前角色无发起准入任务权限' };
      if (!myPharmaTenantId) return { ok: false, error: '仅药厂侧可发起准入任务' };
      if (!input.templateId) return { ok: false, error: '请选择材料模板' };
      const template = (templates[myPharmaTenantId] ?? []).find((t) => t.id === input.templateId);
      if (!template) return { ok: false, error: '所选模板不存在' };
      if (template.items.length === 0) return { ok: false, error: '所选模板为空模板，请先在「准入模板」中配置准入项' };
      const pharmaName = principal.realm === 'TENANT' ? principal.tenantName : myPharmaTenantId;
      const now = stamp();
      const code = genAdmissionCode();
      const created: VendorAccessRecord = {
        ...baseTaskShape({
          pharmaTenantId: myPharmaTenantId,
          pharmaName,
          pharmaCode: getTenantRegistrySnapshot().tenants.find((t) => t.enterpriseOrgId === myPharmaTenantId)?.primaryCode,
          template,
        }),
        id: nextRecordId(),
        status: '待领取',
        createdAt: now,
        createdBy: operator.name,
        admissionCode: code,
        history: [{ id: nextHistoryId(), action: '创建任务', operator: operator.name, role: principalRoleLabel, time: now, comment: `模板：${template.name} ${templateVersionLabel(template)}；准入码 ${code} 已生成（一次性，待服务商发起准入）` }],
      };
      setRecords((prev) => [created, ...prev]);
      auditAccess('创建准入任务', `${pharmaName} · 准入码 ${code}`, '药厂创建任务并生成一次性准入码（撮合线下进行）', `状态：— → 待领取 · ${now} · 模板 ${template.name} ${templateVersionLabel(template)}`);
      return { ok: true, taskId: created.id, admissionCode: code };
    },
    [auditAccess, canIssueTask, myPharmaTenantId, nextHistoryId, nextRecordId, operator.name, principal, principalRoleLabel, templates],
  );

  /** 重新生成准入码（仅待领取；旧码立即作废） */
  const regenerateCode = useCallback(
    (taskId: string): VendorAccessOpResult => {
      if (!canIssueTask) return { ok: false, error: '当前角色无管理准入码权限' };
      const g = pharmaGuard(taskId, ['待领取'], '重新生成码');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const task = g.task;
      const newCode = genAdmissionCode();
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) => (r.id === taskId ? { ...r, admissionCode: newCode, history: pushHistory(r, '重新生成码', `旧码 ${task.admissionCode ?? '—'} 作废，新码 ${newCode}`) } : r)),
      );
      auditAccess('重新生成准入码', `${task.pharmaName} · ${task.admissionCode ?? '—'} → ${newCode}`, '旧准入码作废，生成新码', `状态：待领取 · ${now}`);
      return { ok: true, admissionCode: newCode };
    },
    [auditAccess, canIssueTask, pharmaGuard, pushHistory],
  );

  /** 服务商输入准入码发起准入：码存在且待领取 → 绑定本服务商主体（码一次性；同方向在途拦截） */
  const claimTask = useCallback(
    (code: string): VendorAccessOpResult => {
      if (!isVendorSide) return { ok: false, error: '当前角色无发起准入权限' };
      if (!myTenantId) return { ok: false, error: '仅服务商侧可发起准入' };
      const key = code.trim().toUpperCase();
      if (key.length !== 8) return { ok: false, error: '请输入 8 位准入码' };
      // 演示固定码 12345678：命中任意待领取任务（按创建时间最早优先）
      const task = key === DEMO_ADMISSION_CODE
        ? records
            .filter((r) => r.status === '待领取')
            .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))[0]
        : records.find((r) => r.admissionCode === key);
      if (!task) return { ok: false, error: '准入码不存在，请与药厂核对' };
      if (task.status !== '待领取') return { ok: false, error: '该准入码已被使用或已失效' };
      // 同方向在途拦截：该药厂 × 本服务商已有待服务商提交/审核中任务时不允许重复发起
      const open = records.find(
        (r) =>
          r.pharmaTenantId === task.pharmaTenantId &&
          r.providerTenantId === myTenantId &&
          ['待服务商提交', '审核中'].includes(r.status),
      );
      if (open) {
        return { ok: false, error: `您与「${task.pharmaName}」已有在途准入任务（${open.status}），请在原任务上继续；该准入码未消耗，可由药厂重新安排` };
      }
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === task.id
            ? { ...r, providerTenantId: myTenantId, status: '待服务商提交', claimedAt: now, history: pushHistory(r, '发起', '输入准入码发起准入，绑定本服务商主体。') }
            : r,
        ),
      );
      auditAccess('发起准入', `${task.pharmaName} × ${principal.realm === 'TENANT' ? principal.tenantName : ''}`, `输入准入码 ${key} 发起准入${key === DEMO_ADMISSION_CODE ? '（演示固定码）' : '（一次性消费）'}`, `状态：待领取 → 待服务商提交 · ${now}`);
      return { ok: true, taskId: task.id };
    },
    [auditAccess, isVendorSide, myTenantId, principal, pushHistory, records],
  );

  const withdrawTask = useCallback(
    (taskId: string, reason?: string): VendorAccessOpResult => {
      if (!canIssueTask) return { ok: false, error: '当前角色无撤回任务权限' };
      const g = pharmaGuard(taskId, ['待领取', '待服务商提交', '审核中'], '撤回任务');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const trimmed = (reason ?? '').trim();
      const task = g.task;
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) => (r.id === taskId ? { ...r, status: '已撤回', ...(trimmed ? { withdrawalReason: trimmed } : {}), history: pushHistory(r, '撤回', trimmed || undefined) } : r)),
      );
      auditAccess('撤回准入任务', `${task.pharmaName} × ${task.vendorName}`, trimmed || '（未填写撤回原因）', `状态：${task.status} → 已撤回 · ${now}`);
      return { ok: true };
    },
    [auditAccess, canIssueTask, pharmaGuard, pushHistory],
  );

  const rejectTask = useCallback(
    (taskId: string, verdicts: Array<{ key: string; verdict: 'pass' | 'reject'; reason?: string }>): VendorAccessOpResult => {
      if (!isReviewer) return { ok: false, error: '当前角色无准入审核权限' };
      const g = pharmaGuard(taskId, ['审核中'], '驳回');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const task = g.task;
      // 按项结论：快照内材料/填写项（核查类除外）必须逐项显式标记；驳回项原因必填
      const reviewable = task.requirementSnapshot.items.filter((i) => i.kind !== 'checklist');
      const byKey = new Map(verdicts.map((v) => [v.key, v]));
      const unmarked = reviewable.filter((i) => !byKey.get(i.key));
      if (unmarked.length) return { ok: false, error: `还有 ${unmarked.length} 项未标记结论（${unmarked.map((i) => i.name).join('、')}）` };
      const rejects = reviewable.filter((i) => byKey.get(i.key)?.verdict === 'reject');
      if (!rejects.length) return { ok: false, error: '全部项均已标记通过，请直接「审核通过」' };
      const noReason = rejects.filter((i) => !(byKey.get(i.key)?.reason ?? '').trim());
      if (noReason.length) return { ok: false, error: `驳回项须填写原因（${noReason.map((i) => i.name).join('、')}）` };
      const verdictMap: Record<string, AccessItemVerdict> = {};
      for (const i of reviewable) {
        const v = byKey.get(i.key)!;
        verdictMap[i.key] = v.verdict === 'reject' ? { verdict: 'reject', reason: (v.reason ?? '').trim() } : { verdict: 'pass' };
      }
      const passes = reviewable.length - rejects.length;
      const now = stamp();
      const summary = `驳回 ${rejects.length} 项：${rejects.map((i) => `${i.name}（${verdictMap[i.key].reason}）`).join('；')}`;
      setRecords((prev) =>
        prev.map((r) =>
          r.id === taskId
            ? {
                ...r,
                status: '已驳回',
                reviewedAt: now,
                reviewedBy: operator.name,
                itemVerdicts: verdictMap,
                history: pushHistory(r, '驳回', `退回修改：${rejects.length} 项被驳回（${rejects.map((i) => i.name).join('、')}），其余 ${passes} 项通过、无需重传。`),
              }
            : r,
        ),
      );
      auditAccess('准入审核驳回', `${task.pharmaName} × ${task.vendorName}`, summary, `状态：审核中 → 已驳回（退回修改） · ${now} · ${rejects.length} 项驳回 / ${passes} 项通过`);
      return { ok: true };
    },
    [auditAccess, isReviewer, operator.name, pharmaGuard, pushHistory],
  );

  const approveTask = useCallback(
    (taskId: string, effectiveFrom: string, effectiveTo: string): VendorAccessOpResult => {
      if (!isReviewer) return { ok: false, error: '当前角色无准入审核权限' };
      const g = pharmaGuard(taskId, ['审核中'], '审核通过');
      if (g.error || !g.task) return { ok: false, error: g.error };
      if (!effectiveFrom || !effectiveTo) return { ok: false, error: '请设置准入有效期' };
      if (effectiveTo < effectiveFrom) return { ok: false, error: '有效期截止日期不能早于起始日期' };
      const task = g.task;
      // 审核中任务必已发起（providerTenantId 有值）；防御式校验
      if (!task.providerTenantId) return { ok: false, error: '任务未绑定服务商，无法审核（本地模拟数据异常）' };
      // 准入→合作联动：通过时创建/激活合作关系，关系已存在时幂等返回
      const providerTenant = tenantById(task.providerTenantId);
      if (!providerTenant) {
        return { ok: false, error: `未找到「${task.vendorName || task.providerTenantId}」的服务商租户登记，无法核对合作关系（本地模拟数据缺失）` };
      }
      const coop = ensureRelationshipFromAccess({
        pharmaTenantId: task.pharmaTenantId,
        providerTenantId: task.providerTenantId,
        actor: operator.name,
      });
      if (!coop.ok) return { ok: false, error: coop.error ?? '合作关系核对失败，审核未生效' };
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === taskId
            ? {
                ...r,
                status: '已准入',
                reviewedAt: now,
                reviewedBy: operator.name,
                approvedAt: now,
                effectiveFrom,
                effectiveTo,
                history: pushHistory(r, '通过', `准入通过：有效期 ${effectiveFrom} 至 ${effectiveTo}${coop.created ? '；已同步创建合作关系（本地模拟数据）' : ''}`),
              }
            : r,
        ),
      );
      auditAccess('准入审核通过', `${task.pharmaName} × ${task.vendorName}`, '审核通过', `状态：审核中 → 已准入 · ${now} · 有效期 ${effectiveFrom} ~ ${effectiveTo}`);
      if (coop.created) {
        auditAccess(
          '创建合作关系（准入联动）',
          `${task.pharmaName} × ${task.vendorName}`,
          'COOPERATION_CREATED_BY_ACCESS',
          `合作关系生效 · 生效起点 ${now}`,
        );
      }
      return { ok: true, coopCreated: !!coop.created };
    },
    [auditAccess, isReviewer, operator.name, pharmaGuard, pushHistory],
  );

  const renewAdmission = useCallback(
    (taskId: string, newEffectiveTo: string, reason: string): VendorAccessOpResult => {
      if (!isReviewer) return { ok: false, error: '当前角色无准入管理权限' };
      const g = pharmaGuard(taskId, ['已准入'], '续期');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const trimmed = reason.trim();
      if (trimmed.length < 5) return { ok: false, error: '续期原因不能少于 5 个字符' };
      if (!newEffectiveTo) return { ok: false, error: '请选择新的有效期截止日期' };
      const task = g.task;
      if (newEffectiveTo <= (task.effectiveTo ?? '')) return { ok: false, error: '新有效期截止日期须晚于当前截止日期' };
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) => (r.id === taskId ? { ...r, effectiveTo: newEffectiveTo, history: pushHistory(r, '续期', `有效期延至 ${newEffectiveTo}；${trimmed}`) } : r)),
      );
      auditAccess('准入续期', `${task.pharmaName} × ${task.vendorName}`, trimmed, `有效期：至 ${task.effectiveTo ?? '—'} → 至 ${newEffectiveTo} · ${now}`);
      return { ok: true };
    },
    [auditAccess, isReviewer, pharmaGuard, pushHistory],
  );

  const invalidateAdmission = useCallback(
    (taskId: string, reason: string): VendorAccessOpResult => {
      if (!isReviewer) return { ok: false, error: '当前角色无准入管理权限' };
      const g = pharmaGuard(taskId, ['已准入'], '失效管理');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const trimmed = reason.trim();
      if (trimmed.length < 5) return { ok: false, error: '失效原因不能少于 5 个字符' };
      const task = g.task;
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) => (r.id === taskId ? { ...r, status: '已失效', invalidationReason: trimmed, history: pushHistory(r, '失效', trimmed) } : r)),
      );
      auditAccess('准入失效管理', `${task.pharmaName} × ${task.vendorName}`, trimmed, `状态：已准入 → 已失效 · ${now}`);
      return { ok: true };
    },
    [auditAccess, isReviewer, pharmaGuard, pushHistory],
  );

  const revokeAdmission = useCallback(
    (taskId: string, reason: string): VendorAccessOpResult => {
      if (!isReviewer) return { ok: false, error: '当前角色无准入管理权限' };
      const g = pharmaGuard(taskId, ['已准入'], '撤销准入');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const trimmed = reason.trim();
      if (trimmed.length < 5) return { ok: false, error: '撤销原因不能少于 5 个字符' };
      const task = g.task;
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) => (r.id === taskId ? { ...r, status: '已撤销', revocationReason: trimmed, history: pushHistory(r, '撤销', trimmed) } : r)),
      );
      auditAccess('撤销准入', `${task.pharmaName} × ${task.vendorName}`, trimmed, `状态：已准入 → 已撤销 · ${now}`);
      return { ok: true };
    },
    [auditAccess, isReviewer, pharmaGuard, pushHistory],
  );

  // ── 服务商：任务内提交材料（不提供任何药厂搜索/自主发起能力）────────────────

  const submitTaskMaterial = useCallback(
    (taskId: string, input: VendorMaterialInput): VendorAccessOpResult => {
      if (!isVendorSide) return { ok: false, error: '当前角色无准入材料提交权限' };
      const g = vendorGuard(taskId, ['待服务商提交', '已驳回'], '提交材料');
      if (g.error || !g.task) return { ok: false, error: g.error };
      const task = g.task;
      // 重提场景：已驳回任务修改后重新提交（通过项材料已随表单带回、校验天然通过）
      const isResubmit = task.status === '已驳回';
      const prevRejects = Object.entries(task.itemVerdicts ?? {}).filter(([, v]) => v.verdict === 'reject');
      // 企业基础资料必填
      const base = ['vendorName', 'creditCode', 'legalRep', 'address', 'contactName', 'contactMobile'] as const;
      const missBase = base.filter((k) => !input[k].trim());
      if (missBase.length) {
        const labels: Record<string, string> = {
          vendorName: '公司名称', creditCode: '统一社会信用代码', legalRep: '法定代表人',
          address: '注册地址', contactName: '联系人姓名', contactMobile: '联系电话',
        };
        return { ok: false, error: `请补充：${missBase.map((k) => labels[k]).join('、')}` };
      }
      // 材料按任务快照校验（快照在任务创建时固化，与药厂模板后续调整无关）
      const v = validateApplication(task.requirementSnapshot.items, input);
      if (v.all > 0) {
        const parts: string[] = [];
        if (v.missingFiles.length) parts.push(`必传材料缺失（${v.missingFiles.map(itemLabel).join('、')}）`);
        if (v.insufficient.length) parts.push(`图片数量不足（${v.insufficient.map(itemLabel).join('、')}）`);
        if (v.missingForms.length) parts.push(`必填项未填（${v.missingForms.map(itemLabel).join('、')}）`);
        return { ok: false, error: `请补充后再提交：${parts.join('；')}` };
      }
      const now = stamp();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === taskId
            ? {
                ...r,
                vendorName: input.vendorName.trim(),
                creditCode: input.creditCode.trim(),
                legalRep: input.legalRep.trim(),
                address: input.address.trim(),
                contactName: input.contactName.trim(),
                contactMobile: input.contactMobile.trim(),
                itemResponses: { ...input.itemResponses },
                attachments: Object.fromEntries(
                  Object.entries(input.attachments).map(([k, val]) => [k, val.filter((f) => f.trim())]),
                ),
                status: '审核中',
                submittedAt: now,
                // 重提时仅保留通过项结论（锁定不重传）；驳回项结论清除、待复审重新判定
                ...(isResubmit
                  ? { itemVerdicts: Object.fromEntries(Object.entries(task.itemVerdicts ?? {}).filter(([, v]) => v.verdict === 'pass')) }
                  : {}),
                history: pushHistory(r, '提交', isResubmit ? `按驳回原因修改 ${prevRejects.length} 项后重新提交，通过项材料保留。` : undefined),
              }
            : r,
        ),
      );
      auditAccess('提交准入材料', `${task.pharmaName} × ${task.vendorName}`, '服务商在任务授权范围内提交材料', `状态：${task.status} → 审核中 · ${now}`);
      return { ok: true };
    },
    [auditAccess, isVendorSide, pushHistory, vendorGuard],
  );

  const value: VendorAccessStore = useMemo(
    () => ({
      records,
      myTasks,
      ensureTemplatesFor,
      templatesOf,
      enabledTemplateOf,
      createTemplate,
      renameTemplate,
      deleteTemplate,
      enableTemplate,
      saveItem,
      removeItem,
      removeGroup,
      moveItem,
      createTask,
      regenerateCode,
      withdrawTask,
      rejectTask,
      approveTask,
      renewAdmission,
      invalidateAdmission,
      revokeAdmission,
      submitTaskMaterial,
      claimTask,
    }),
    [records, myTasks, ensureTemplatesFor, templatesOf, enabledTemplateOf, createTemplate, renameTemplate, deleteTemplate, enableTemplate, saveItem, removeItem, removeGroup, moveItem, createTask, regenerateCode, withdrawTask, rejectTask, approveTask, renewAdmission, invalidateAdmission, revokeAdmission, submitTaskMaterial, claimTask],
  );

  return <VendorAccessContext.Provider value={value}>{children}</VendorAccessContext.Provider>;
}

/** 任务记录的公共形状（创建/种子共用；快照随模板固化） */
function baseTaskShape(fields: {
  pharmaTenantId: string;
  pharmaName: string;
  pharmaCode?: string;
  template: PharmaAccessTemplate;
}): Pick<
  VendorAccessRecord,
  'providerTenantId' | 'vendorName' | 'creditCode' | 'legalRep' | 'address' | 'contactName' | 'contactMobile' |
  'pharmaTenantId' | 'pharmaName' | 'pharmaCode' | 'templateId' | 'templateVersion' |
  'itemResponses' | 'attachments' | 'requirementSnapshot' | 'history'
> {
  return {
    providerTenantId: undefined,
    vendorName: '',
    creditCode: '',
    legalRep: '',
    address: '',
    contactName: '',
    contactMobile: '',
    pharmaTenantId: fields.pharmaTenantId,
    pharmaName: fields.pharmaName,
    pharmaCode: fields.pharmaCode,
    templateId: fields.template.id,
    templateVersion: templateVersionLabel(fields.template),
    itemResponses: {},
    attachments: {},
    requirementSnapshot: snapOf(fields.template),
    history: [],
  };
}

function itemLabel(item: AccessTemplateItem): string {
  return item.name;
}

export function kindLabel(kind: AccessItemKind): string {
  switch (kind) {
    case 'file': return '文件类';
    case 'image': return '图片类';
    case 'form-text': return '文本';
    case 'form-number': return '数值';
    case 'form-date': return '日期';
    case 'form-select': return '单选';
    case 'checklist': return '核查项';
    default: return kind;
  }
}

export function useVendorAccess(): VendorAccessStore {
  const ctx = useContext(VendorAccessContext);
  if (!ctx) throw new Error('useVendorAccess must be used within VendorAccessProvider');
  return ctx;
}
