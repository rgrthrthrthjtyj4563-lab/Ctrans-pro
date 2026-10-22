import { DEMO_HOLDER } from './mockData';

/**
 * 药监局药品主数据 mock 网关（品种管理「联查药监局信息」演示用）。
 *
 * 演示口径：
 * - 查询条件 = 批准文号 或 通用名（任一非空即可查询）；命中的记录须同时满足全部已填条件
 *   （都填=交集更精确）。字段按包含匹配，与真实药监局「按批准文号唯一定位」不同——保留
 *   多条命中是为了演示 0/1/多三种结果态以及编辑场景的「批准文号不同 → 另一实际品种」保护分支。
 * - 全部记录持有人固定为演示药厂（当前登录药厂），与页面「当前药厂」只读条一致。
 * - 固定 700ms 延迟模拟网络；除延迟外无随机性，走查结果可复现。
 */
export interface NmpaDrugRecord {
  id: string;
  /** 商品名 */
  tradeName: string;
  /** 通用名 */
  genericName: string;
  /** 批准文号 */
  approvalNo: string;
  /** 剂型 */
  dosageForm: string;
  /** 规格 */
  spec: string;
  /** 包装 */
  package: string;
  /** 药品上市许可持有人（展示用，表单不填写，保存时取当前登录药厂） */
  holder: string;
  /** 生产企业 */
  manufacturer: string;
}

const NMPA_DRUG_RECORDS: NmpaDrugRecord[] = [
  // 阿托伐他汀钙片 → 2 条（与存量品种 V-001 同名，用于演示多条选择与差异采用/批准文号保护）
  { id: 'NMPA-ATV-20', tradeName: '力普妥', genericName: '阿托伐他汀钙片', approvalNo: '国药准字H20051408', dosageForm: '片剂', spec: '20mg', package: '7片×2板/盒', holder: DEMO_HOLDER, manufacturer: '百益制药' },
  { id: 'NMPA-ATV-10', tradeName: '力普妥', genericName: '阿托伐他汀钙片', approvalNo: '国药准字H20103482', dosageForm: '片剂', spec: '10mg', package: '7片/盒', holder: DEMO_HOLDER, manufacturer: '百益制药' },
  // 依折麦布片 → 1 条（演示单条结果直接确认带入）
  { id: 'NMPA-EZE-10', tradeName: '益适纯', genericName: '依折麦布片', approvalNo: '国药准字H20040012', dosageForm: '片剂', spec: '10mg', package: '7片/盒', holder: DEMO_HOLDER, manufacturer: '百益制药' },
  // 盐酸二甲双胍片 → 2 条（同一批准文号不同包装，演示多条选择）
  { id: 'NMPA-MET-20', tradeName: '格华止', genericName: '盐酸二甲双胍片', approvalNo: '国药准字H20023330', dosageForm: '片剂', spec: '0.5g', package: '20片/盒', holder: DEMO_HOLDER, manufacturer: '百益制药' },
  { id: 'NMPA-MET-30', tradeName: '格华止', genericName: '盐酸二甲双胍片', approvalNo: '国药准字H20023330', dosageForm: '片剂', spec: '0.5g', package: '30片/盒', holder: DEMO_HOLDER, manufacturer: '百益制药' },
];

export function queryNmpaDrugs(input: { approvalNo: string; genericName: string }): Promise<NmpaDrugRecord[]> {
  const approval = input.approvalNo.trim();
  const generic = input.genericName.trim();
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!approval && !generic) { resolve([]); return; }
      resolve(NMPA_DRUG_RECORDS.filter((record) =>
        (!approval || record.approvalNo.includes(approval)) && (!generic || record.genericName.includes(generic)),
      ));
    }, 700);
  });
}
