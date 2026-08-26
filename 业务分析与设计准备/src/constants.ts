/** 全角人民币符号 U+FFE5（禁止半角 U+00A5 YEN SIGN） */
export const CNY_SYMBOL = '\uFFE5';

/** 省级行政区 34 项 + 全国快捷项 */
export const PROVINCES = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门',
] as const;

export const REGION_NATIONWIDE = '全国';

export const REGION_OPTIONS: string[] = [...PROVINCES, REGION_NATIONWIDE];

export function formatCNY(n: number, masked = false): string {
  if (masked) return `${CNY_SYMBOL}${(n / 10000).toFixed(1)}万`;
  return `${CNY_SYMBOL}${n.toLocaleString('zh-CN')}`;
}

/** @deprecated 使用 formatCNY；保留别名避免漏改调用点 */
export const cny = formatCNY;

const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const CN_SMALL = ['', '拾', '佰', '仟'];
const CN_BIG = ['', '万', '亿', '兆'];

function sectionToChinese(n: number): string {
  if (n === 0) return '';
  let s = '';
  let zero = false;
  const digits = String(n).padStart(4, '0');
  for (let i = 0; i < 4; i++) {
    const d = Number(digits[i]);
    const unit = CN_SMALL[3 - i];
    if (d === 0) {
      zero = s.length > 0;
    } else {
      if (zero) s += '零';
      s += CN_DIGITS[d] + unit;
      zero = false;
    }
  }
  return s;
}

/** 人民币大写（结算单最终结算金额） */
export function formatCNYUpper(n: number): string {
  const amount = Math.round(Math.abs(n));
  if (amount === 0) return '零元整';
  const parts: string[] = [];
  let rest = amount;
  let big = 0;
  while (rest > 0 && big < CN_BIG.length) {
    const sec = rest % 10000;
    if (sec !== 0) {
      const body = sectionToChinese(sec);
      parts.unshift(body + CN_BIG[big]);
    } else if (parts.length > 0 && !parts[0].startsWith('零')) {
      parts.unshift('零');
    }
    rest = Math.floor(rest / 10000);
    big += 1;
  }
  let text = parts.join('').replace(/零+/g, '零').replace(/零$/, '');
  if (text.startsWith('壹拾')) text = text.slice(1);
  return `${n < 0 ? '负' : ''}${text}元整`;
}

/** 价目类别 = 服务类型（预算计划 / 创建任务 / 结算明细行共用） */
export const SERVICE_CATEGORIES = ['市场推广服务', '分析报告服务', '问卷调研与分析服务'] as const;
export type ServiceCategoryValue = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_OPTIONS: { value: string; label: string }[] =
  SERVICE_CATEGORIES.map((c) => ({ value: c, label: c }));

/** 报告组两类归入「调研与报告一体化服务」展示 */
export const REPORT_SERVICE_CATEGORIES: ServiceCategoryValue[] = ['分析报告服务', '问卷调研与分析服务'];

export function serviceCategoryGroup(category: string): '推广' | '报告' {
  return category === '市场推广服务' ? '推广' : '报告';
}

export const MONTHS_1_12 = Array.from({ length: 12 }, (_, i) => i + 1);

/** 服务月份（YYYY-MM）→ 月份数字（1-12） */
export function monthOfServiceMonth(serviceMonth: string): number {
  return Number(serviceMonth.slice(5, 7)) || 0;
}

/** 日期（YYYY-MM-DD）→ 服务月份（YYYY-MM） */
export function serviceMonthOfDate(date: string): string {
  return date.slice(0, 7);
}

export const TASK_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '待确认', label: '待确认' },
  { value: '执行中', label: '执行中' },
  { value: '已结算', label: '已结算' },
  { value: '已撤销', label: '已撤销' },
];

export const RECON_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '未发起', label: '未发起' },
  { value: '对账中', label: '对账中' },
  { value: '已结算', label: '已结算' },
];
