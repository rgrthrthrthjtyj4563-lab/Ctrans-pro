import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clipboard, Coins, Ellipsis, File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Menu, MessageSquarePlus, Paperclip, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { NavigateFn } from '../types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { usePermissionOptional } from '../context/PermissionContext';
import { useTalkScript, VARIETIES, FIRST_CATS, SUB_CATS } from '../context/TalkScriptContext';
import { AI_MODES, CREDIT_PACKAGES, TUNE_COST, consumePendingScriptTask, useAICredit } from '../context/AICreditContext';

type Intent = 'timed' | 'budget' | 'approval' | 'provider' | 'script' | 'unknown';
type Phase = 'running' | 'awaiting' | 'done' | 'cancelled';
type Fields = { k: string; v: string }[];
interface Step { title: string; summary: string; sandbox?: boolean; rows: Fields; notes?: string[]; }
interface Query { title: string; conclusion: string; fields: Fields; anomalies?: string[]; range: string; period: string; action?: string; page?: 'analytics' | 'task-dispatch'; }
interface Result { tone: 'success' | 'neutral'; title: string; fields: Fields; canUndo?: boolean; }
interface Attachment { id: string; name: string; size: number; mime: string; url: string; }

/** 品种话术生成：剧本参数与产出（消息载荷） */
type ScriptModeKey = 'single' | 'package' | 'checkup';
interface ScriptParams { variety: string; firstCat: string; secondCat: string; mode: ScriptModeKey; notes: string; }
interface ScriptItem { label: string; content: string; feedback: string; }
interface ScriptPayload extends ScriptParams { items: ScriptItem[]; }

/** 批量结果面板（Result Canvas）：条目与批次载荷 */
type BatchRisk = 'none' | 'warn' | 'high';
type BatchStatus = 'pending' | 'accepted' | 'ignored';
interface ScriptBatchItem {
  id: number; code: string; product: string; role: string;
  confidence: number;
  riskLevel: BatchRisk; riskTitle?: string; riskDesc?: string; rewriteText?: string;
  status: BatchStatus; content: string;
}
interface BatchPayload extends ScriptParams { items: ScriptBatchItem[]; cost: number; generatedAt: string; }

interface Message { id: string; role: 'user' | 'ai'; kind: 'text' | 'process' | 'query' | 'result' | 'scriptParam' | 'scriptCredit' | 'scriptProcess' | 'scriptResult' | 'scriptAdopt' | 'scriptDone' | 'scriptSummary'; text?: string; query?: Query; result?: Result; attachments?: Attachment[]; script?: ScriptParams | ScriptPayload | BatchPayload; /** script 流的确认类卡已被处理后锁定为快照（防重复扣费/重复入库） */ confirmedScript?: boolean; }

const PHARMA = '百益健康科技有限公司';
const PERIOD = '统计周期 2026-08-01 至 2026-08-26';
const RANGE = `数据范围：${PHARMA}（含下属服务商 / 工作组 / 服务专员）`;
const SHORTCUTS = [
  ['查询本月预算异常', '本月百益健康预算执行情况如何？'],
  ['分析审批积压原因', '为什么本周合规审批积压？'],
  ['查看服务商逾期任务', '华东区逾期任务最多的服务商是谁？'],
  ['配置限时拜访', '为百益健康开启限时拜访，每日 09:00 至 18:00 有效。'],
  ['生成品种话术', '为阿托伐他汀钙片(20mg)生成一条学术拜访话术'],
] as const;
const STEPS: Step[] = [
  { title: '已识别需求', summary: '启用限时拜访，每日 09:00–18:00，覆盖三类拜访。', rows: [{ k: '当前药厂', v: PHARMA }, { k: '操作类型', v: '启用业务开关' }, { k: '规则', v: '每日 09:00–18:00 限时拜访' }, { k: '覆盖业务', v: '医院拜访、商业拜访、药房拜访' }] },
  { title: '已读取当前配置', summary: '当前未启用，拜访可全天提交。', rows: [{ k: '当前状态', v: '限时拜访未启用' }, { k: '当前拜访记录', v: '1,286 条（演示库存）' }, { k: '当前可提交时段', v: '全天' }, { k: '规则作用范围', v: '百益健康下属全部服务商、工作组与服务专员' }] },
  { title: '沙箱模拟完成', summary: '非工作时段将阻止三类拜访的新建、编辑和提交。', sandbox: true, rows: [{ k: '模拟规则', v: '18:00–次日 09:00 阻止医院 / 商业 / 药房拜访的新建、编辑、提交' }, { k: '今日待提交记录', v: '37 条' }, { k: '近 7 日非工作时段提交', v: '64 条' }, { k: '涉及服务商', v: '4 家（智联科技、东方恒业、康晟云服、永泰汇通）' }], notes: ['沙箱模拟不会写入生产数据，不改变真实拜访记录。'] },
  { title: '风险检查完成', summary: '范围与时间规则有效，无跨药厂影响。', rows: [{ k: '范围校验', v: '有效 · 仅当前药厂' }, { k: '时间规则', v: '有效 · 每日 09:00–18:00' }, { k: '跨药厂影响', v: '无' }], notes: ['当前有 12 条待提交拜访记录；若启用时不在允许时段，这些记录将无法提交。', '该规则影响当前药厂下全部三类拜访业务，不影响其他药厂。'] },
  { title: '等待人工确认', summary: '校验已通过，确认后才会启用。', rows: [{ k: '待确认动作', v: '启用限时拜访' }, { k: '生效方式', v: '仅切换本页演示状态，不写真实业务库' }] },
];
// ===== 品种话术生成：演示剧本常量（AI 建议，人工确认后采纳） =====

interface AiStage { title: string; summary: string; chips: string[]; text: string; warning?: boolean; /** 演示动效时长（ms）；缺省按 0 立即进入下一阶段 */ duration?: number; }

const AI_STAGES: AiStage[] = [
  { title: '解析品种合规资产', summary: '说明书、适应症与既有话术库已载入', chips: ['说明书 ✓', '适应症 ✓', '批准文号 ✓', '既有话术 3 条'], text: '读取阿托伐他汀钙片(20mg) 说明书：适应症为高胆固醇血症、混合型血脂异常；校验批准文号 国药准字H20051408 状态有效；载入该品种既有话术 3 条，提取本厂惯用表述风格……' },
  { title: '检索行业反馈与话术模式', summary: '医生关注点与高转化话术结构已归纳', chips: ['市场反馈 12 条', '优秀话术结构 4 类'], text: '聚合近期拜访反馈：医生关注点集中于 LDL-C 达标率与老年患者耐受性；归纳学术拜访场景高转化话术结构：开场共鸣→循证要点→患者获益→行动建议……' },
  { title: '构建合规约束', summary: '禁用语库与推广红线已锁定', chips: ['禁用语 217 项', '红线 5 条'], text: '注入医药推广禁用语库（含绝对化用语 217 项）；锁定红线：不得超出说明书适应症、不得暗示疗效承诺、不得进行竞品贬损、不得使用「最/第一/根治」类表述……' },
  { title: '候选生成', summary: '3 个候选中选出 1 个', chips: ['候选 3 → 入选 1'], text: '按目标结构生成 3 个候选：候选 A 学术性最强但句长 68 字偏长；候选 B 结构完整；候选 C 患者获益表述略弱。综合评估选择候选 B……' },
  { title: '合规自检', summary: '命中 1 处禁用词，已自动改写', chips: ['禁用词扫描', '超适应症检测'], text: '逐词扫描候选话术……命中 1 处：「最有效」属于广告法绝对化用语——标记改写；比对说明书适应症：候选表述未超范围；复扫通过 ✓', warning: true },
  { title: '输出与置信度', summary: '校验全通过，置信度 92%', chips: ['置信度 92%'], text: '综合合规校验全通过、结构完整度、表述风格匹配度，输出最终话术与配套客户反馈；置信度 92%，建议人工确认后采纳……' },
];

const CHECKUP_STAGES: AiStage[] = [
  { title: '载入既有话术', summary: '已载入该品种全部话术', chips: ['话术 N 条'], text: '从品种话术库载入该品种全部话术，逐条准备合规扫描……' },
  { title: '逐条合规扫描', summary: '禁用词与超适应症检测完成', chips: ['禁用词扫描', '超适应症检测'], text: '逐条执行禁用语扫描与超适应症检测：发现 1 处禁用词风险、1 处表述越界风险，已生成改写建议……', warning: true },
];

const SCRIPT_SINGLE: ScriptItem[] = [
  {
    label: '话术',
    content: '医生您好，想和您同步阿托伐他汀钙片的循证信息：其适应症为高胆固醇血症与混合型血脂异常，临床研究显示可有效降低LDL-C水平；对于老年患者，常规剂量下安全性与耐受性数据充分，是经临床验证的降脂治疗选择。如您有血脂控制不佳的患者，欢迎考虑调整治疗方案。',
    feedback: '了解，我有几位老年患者LDL-C长期未达标，可以评估剂量方案，你把研究资料留下来。',
  },
];

const SCRIPT_PACKAGE: ScriptItem[] = [
  { label: '开场', content: '医生您好，占用您两分钟，想同步阿托伐他汀钙片最新的循证资料与科室使用反馈。', feedback: '可以，你简单说。' },
  { label: '学术要点', content: '阿托伐他汀钙片适应症为高胆固醇血症与混合型血脂异常，临床研究显示可有效降低LDL-C水平，老年患者常规剂量下安全性与耐受性数据充分。', feedback: '降脂幅度确实是我在意的点。' },
  { label: '异议应对', content: '关于您提到的耐受性问题：本品常规剂量下不良反应发生率低，肌肉酸痛等不适事件在大样本研究中与安慰剂组无显著差异，可从常规剂量起始观察。', feedback: '那我先给两位老患者试试。' },
  { label: '跟进', content: '上次留给您的循证资料若有疑问，我可以约科里老师做一次十分钟的小型分享，也欢迎把使用反馈告诉我。', feedback: '下月中旬科会有空档，可以来。' },
  { label: '收尾', content: '感谢您的时间，这是资料与联系卡，患者血脂控制有任何问题随时联系我。', feedback: '好的，有需要我找你。' },
];

/** 体检结果：预置风险行（演示，通用表述不绑定品种） */
const CHECKUP_ROWS = [
  { risk: '提示' as const, note: '「依从性显著改善」中「显著」接近绝对化表述，建议删除', rewrite: '（改写）……老年患者用药依从性改善，胃肠耐受良好' },
  { risk: '高危' as const, note: '「安全性与疗效兼备」属疗效承诺表述，必须改写', rewrite: '（改写）……临床应用广泛，安全性与耐受性数据充分' },
];

/** 「为什么用 baiyee-AI 生成」对比（通用 AI vs 平台 AI） */
const WHY_CARDS: { title: string; left: string; right: string; flywheel?: boolean }[] = [
  { title: '知识边界', left: '不掌握本品种说明书、批准文号、适应症，凭通用知识编造', right: '注入本品种合规资产（说明书/适应症/批准文号/价目/既有话术库）' },
  { title: '合规校验', left: '生成后需法务逐字审查，漏审即风险', right: '禁用语引擎+超适应症检测，生成即校验，逐条出报告' },
  { title: '业务闭环', left: '产出还要复制粘贴进系统，口径二次失真', right: '一键入库直达拜访执行，移动端自动带出，全程不下桌' },
  { title: '管控审计', left: '员工私下使用无从管控，无法追溯', right: '谁生成、谁采纳、何时入库全留痕，可管可查' },
  { title: '数据飞轮', left: '每次对话从零开始，越用越泛', right: '持续学习本厂话术库与拜访反馈，越用越懂你的品种', flywheel: true },
];

// ===== 批量结果面板（Result Canvas）：50 条演示种子（确定性，源自 stitch 设计稿） =====

/** 批量剧本可选品种（含「全部品种」档，仅话术包/体检模式可选） */
const ALL_PRODUCTS_OPTION = '全部品种';
const BATCH_VARIETIES = [ALL_PRODUCTS_OPTION, ...VARIETIES];

const BATCH_PRODUCTS: { name: string; count: number }[] = [
  { name: '阿托伐他汀钙片(20mg)', count: 10 },
  { name: '瑞舒伐他汀钙片(10mg)', count: 8 },
  { name: '二甲双胍缓释片(500mg)', count: 9 },
  { name: '氨氯地平片(5mg)', count: 8 },
  { name: '奥美拉唑肠溶胶囊(20mg)', count: 8 },
  { name: '辛伐他汀片(20mg)', count: 7 },
];

const BATCH_ROLES = ['开场破冰', '循证要点', '异议应对', '科室跟进', '拜访收尾'] as const;

const BATCH_SAMPLES: Record<string, string> = {
  开场破冰: '医生您好，占用您两分钟，想同步本品最新的临床循证数据，重点是针对极高危心血管疾病患者的达标率管理……',
  循证要点: '近期发表于权威期刊的多中心 RCT 研究表明，规律治疗后主要观察指标在 4 周内显著优于基线，且安全性事件发生率与对照组无统计学差异。',
  异议应对: '理解您对不良反应的顾虑。临床监测数据显示相关发生率低于 0.1%，并建议在用药前建立基线检验记录作为对照。',
  科室跟进: '上次您提到的合并用药方案，我们整理了最新指南推荐证据链，方便您在早交班时参考。',
  拜访收尾: '感谢您的专业反馈，相关真实世界研究汇总资料已同步发送至科室公共邮箱，期待下次随访交流。',
};

const BATCH_FEEDBACK: Record<string, string> = {
  开场破冰: '可以，你简单说。',
  循证要点: '数据有说服力，资料留一份。',
  异议应对: '这样解释患者更容易接受。',
  科室跟进: '下周科会前发我。',
  拜访收尾: '好的，有需要我联系你。',
};

/** 高危条目「采纳改写版」：提取改写建议「」内的正文 */
function rewriteOf(it: ScriptBatchItem): string {
  const m = it.rewriteText?.match(/「(.+?)」/);
  return m ? m[1] : it.content;
}

function buildBatchItems(): ScriptBatchItem[] {
  const items: ScriptBatchItem[] = [];
  let id = 1;
  BATCH_PRODUCTS.forEach((p) => {
    for (let i = 0; i < p.count; i++) {
      const role = BATCH_ROLES[i % BATCH_ROLES.length];
      // 确定性置信度：82–97 区间按 id 摊开；#14/#29 低置信；#1–5/12/20 高置信
      let conf = 82 + ((id * 7) % 16);
      if (id === 14 || id === 29) conf = 79;
      if ([1, 2, 3, 4, 5, 12, 20].includes(id)) conf = 94 + (id % 4);
      let riskLevel: BatchRisk = 'none';
      let riskTitle = '';
      let riskDesc = '';
      let rewriteText = '';
      if (id === 17) {
        riskLevel = 'warn';
        riskTitle = '提示级合规风险：使用了绝对倾向词「显著改善」';
        riskDesc = '表述包含「血压显著改善」，未附具体降幅区间及统计学依据，易引发患者预期过高。';
        rewriteText = '建议改写为：「临床观察显示收缩压平均降低 12.4 mmHg（P<0.01），血压控制稳定性良好」。';
      }
      if (id === 38) {
        riskLevel = 'high';
        riskTitle = '高危合规风险：疗效承诺表述「安全性与疗效兼备」';
        riskDesc = '使用了绝对化保证语句「安全性与疗效兼备且无并发症」，属于严重合规高危用语，禁止直接宣讲。';
        rewriteText = '必须改写为：「在规范用法用量下展现出良好耐受性与有效性，详细不良反应请参考说明书」。';
      }
      let status: BatchStatus = 'pending';
      if ([1, 2, 3, 4, 5, 11, 23].includes(id)) status = 'accepted';
      else if ([9, 31].includes(id)) status = 'ignored';
      let content = BATCH_SAMPLES[role];
      if (id === 17) content = '对于伴有轻度肾功能不全的高血压患者，氨氯地平可带来显著改善的平稳降压疗效，晨峰血压得到全天候控制。';
      if (id === 38) content = '在反流性食管炎维持治疗中，本品确保安全性与疗效兼备且无并发症，可作为常规一线长期用药推荐。';
      items.push({
        id,
        code: String(id).padStart(2, '0'),
        product: p.name,
        role,
        confidence: conf,
        riskLevel,
        riskTitle,
        riskDesc,
        rewriteText,
        status,
        content,
      });
      id++;
    }
  });
  return items;
}

/** 单品种话术包（5 条组合）→ 面板条目 */
function buildSinglePackageItems(p: ScriptParams): ScriptBatchItem[] {
  return SCRIPT_PACKAGE.map((it, i) => ({
    id: i + 1,
    code: String(i + 1).padStart(2, '0'),
    product: p.variety,
    role: it.label,
    confidence: 88 + ((i * 3) % 8),
    riskLevel: 'none' as BatchRisk,
    status: 'pending' as BatchStatus,
    content: it.content,
  }));
}

/** 既有话术合规体检 → 面板条目（前两条预置提示/高危，附改写建议） */
function buildCheckupItems(p: ScriptParams, scripts: { variety: string; firstCat: string; secondCat: string; content: string; feedback: string }[]): ScriptBatchItem[] {
  const rows = (p.variety === ALL_PRODUCTS_OPTION ? scripts : scripts.filter((s) => s.variety === p.variety)).slice(0, 24);
  return rows.map((s, i) => {
    const row = CHECKUP_ROWS[i] as { risk: '提示' | '高危'; note: string; rewrite: string } | undefined;
    const riskLevel: BatchRisk = i === 0 ? 'warn' : i === 1 ? 'high' : 'none';
    return {
      id: i + 1,
      code: String(i + 1).padStart(2, '0'),
      product: s.variety,
      role: `${s.firstCat} · ${s.secondCat}`,
      confidence: 85 + ((i * 5) % 11),
      riskLevel,
      riskTitle: row?.note ?? '',
      riskDesc: row?.note ?? '',
      rewriteText: row?.rewrite ?? '',
      status: 'pending' as BatchStatus,
      content: s.content,
    };
  });
}

const TODAY = ['新对话', '限时拜访规则配置', '阿托伐他汀话术生成'] as const;
const RECENT = ['本月预算执行分析', '合规审批积压分析', '华东区服务商逾期任务', '二甲双胍话术包（已采纳 5 条）'] as const;
const NARROW_MQ = '(max-width: 899px)';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json';

function isImage(mime: string) { return mime.startsWith('image/'); }
function formatSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
function fileIconFor(mime: string, name: string): typeof FileIcon {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (isImage(mime)) return ImageIcon;
  if (['csv', 'xlsx', 'xls', 'et'].includes(ext) || mime.includes('spreadsheet')) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'json'].includes(ext) || mime.includes('word') || mime.includes('presentation')) return FileText;
  return FileIcon;
}
function downloadAttachment(att: Attachment) {
  const link = document.createElement('a');
  link.href = att.url;
  link.download = att.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function intentOf(value: string): Intent { const t = value.replace(/\s/g, ''); if (t.includes('话术')) return 'script'; if (t.includes('限时拜访') || (t.includes('09:00') && t.includes('18:00')) || t.includes('配置限时')) return 'timed'; if (t.includes('预算')) return 'budget'; if (t.includes('积压') || t.includes('审批')) return 'approval'; if (t.includes('服务商') || t.includes('完成率') || t.includes('逾期')) return 'provider'; return 'unknown'; }
function stamp() { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function queryFor(intent: Intent): Query | undefined {
  if (intent === 'budget') return { title: '本月预算执行', conclusion: '8 月预算执行偏慢，智联科技单月计划偏高、实际结算尚未跟上；整体无超支，但进度落后时间进度约 12 个百分点。', fields: [{ k: '月度预算合计', v: '￥148,000' }, { k: '已结算实际', v: '￥96,200' }, { k: '执行率', v: '65%（时间进度约 84%）' }, { k: '药厂', v: PHARMA }], anomalies: ['智联科技 8 月预算 ￥80,000，已结算 ￥36,000，进度明显落后。', '康晟云服 11–12 月未排预算，不影响本月，但四季度计划不完整。'], range: RANGE, period: PERIOD, action: '查看预算执行分析', page: 'analytics' };
  if (intent === 'approval') return { title: '本周合规审批积压', conclusion: '积压主要来自拜访审核与代表备案待核验，集中在合规审核环节，不是任务创建量突增。', fields: [{ k: '待处理审批', v: '23 条' }, { k: '拜访待审核', v: '22 条' }, { k: '代表备案待核验', v: '7 条' }, { k: '超区域授权待核', v: '5 条' }, { k: '涉及环节', v: '拜访审核、医药代表备案' }, { k: '建议动作', v: '优先处理 22 条待审核拜访；对 7 条备案发起催核' }], range: RANGE, period: '统计周期 2026-08-20 至 2026-08-26' };
  if (intent === 'provider') return { title: '服务商拜访完成率与逾期', conclusion: '华东口径下逾期任务最多的是东方恒业推广有限公司（9 条），完成率 74%；智联科技完成率更高但逾期 6 条。', fields: [{ k: '东方恒业推广有限公司', v: '完成率 74% · 逾期 9 条 · 奥美拉唑 / 氨氯地平' }, { k: '智联科技有限公司', v: '完成率 81% · 逾期 6 条 · 阿托伐他汀 / 二甲双胍' }, { k: '永泰汇通推广有限公司', v: '完成率 69% · 逾期 5 条 · 瑞舒伐他汀' }, { k: '康晟云服科技有限公司', v: '完成率 88% · 逾期 3 条 · 二甲双胍' }], range: '数据范围：华东演示口径（江苏 / 浙江 / 广东）· 百益健康下属服务商', period: PERIOD, action: '查看任务明细', page: 'task-dispatch' };
}
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_MQ).matches;
}

export function BaiyeeAI({ navigate }: { navigate: NavigateFn }) {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState(''), [enabled, setEnabled] = useState(false), [enabledAt, setEnabledAt] = useState<string | null>(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState<Phase>('done'), [revealed, setRevealed] = useState(0), [copied, setCopied] = useState<string | null>(null);
  // 品种话术生成场景（付费）：独立 stage 状态机，与既有剧本互不串扰
  const [scriptFlow, setScriptFlow] = useState<'none' | 'param' | 'credit' | 'running' | 'result' | 'adopting' | 'done'>('none');
  const [billingOpen, setBillingOpen] = useState(false);
  // 批量结果面板（Result Canvas）交互态：面板开合 / 勾选 / 批量确认弹窗
  const [panelOpen, setPanelOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<number[]>([]);
  const [batchConfirm, setBatchConfirm] = useState<{ mid: string; kind: 'all-pending' | 'selected' } | null>(null);
  const { credits, spend, refund, billing } = useAICredit();
  const { scripts: talkScripts, adoptFromAI, removeScript } = useTalkScript();
  const userName = usePermissionOptional()?.principal?.name ?? '李航';
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const [railOpen, setRailOpen] = useState(() => !isNarrowViewport());
  const list = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), seq = useRef(1);
  const blobUrls = useRef<string[]>([]);
  const attachErrTimer = useRef(0);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const id = () => `message-${seq.current++}`, empty = messages.length === 0;
  const push = (message: Message) => setMessages(prev => [...prev, message]);
  const expanded = narrow || railOpen;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (!empty) inputRef.current?.focus(); }, [empty]);
  // 话术页入口带参跳转：消费一次性任务（品种预填 / 直开账单 / 定位会话历史）
  useEffect(() => {
    const task = consumePendingScriptTask();
    if (!task) return;
    if (task.openBilling) {
      setBillingOpen(true);
      return;
    }
    if (task.historyOnly) return;
    const text = task.variety ? `为${task.variety}生成话术` : '生成品种话术';
    window.setTimeout(() => send(text), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages, revealed]);
  useEffect(() => {
    if (phase !== 'running') return;
    if (revealed >= STEPS.length) { setPhase('awaiting'); setBusy(false); return; }
    const timer = window.setTimeout(() => setRevealed(n => n + 1), 420);
    return () => window.clearTimeout(timer);
  }, [phase, revealed]);

  const trackUrl = (url: string) => { blobUrls.current.push(url); return url; };
  const revokeUrl = (url: string) => { URL.revokeObjectURL(url); blobUrls.current = blobUrls.current.filter(u => u !== url); };

  useEffect(() => () => { for (const url of blobUrls.current) URL.revokeObjectURL(url); }, []);
  useEffect(() => {
    if (!previewAtt) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewAtt(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewAtt]);

  const notify = (message: string) => {
    window.clearTimeout(attachErrTimer.current);
    setAttachError(message);
    attachErrTimer.current = window.setTimeout(() => setAttachError(null), 4200);
  };
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const onChange = () => {
      setNarrow(mq.matches);
      if (mq.matches) setRailOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const addFiles = (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length || busy) return;
    let oversize: string | null = null, full = false, added = false;
    const next = [...pending];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) { oversize = oversize ?? file.name; continue; }
      if (next.length >= MAX_FILES) { full = true; break; }
      if (next.some(a => a.name === file.name && a.size === file.size)) continue;
      next.push({ id: `att-${seq.current++}`, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', url: trackUrl(URL.createObjectURL(file)) });
      added = true;
    }
    if (added) setPending(next);
    if (oversize) notify(`「${oversize}」超过 10MB 上限，已跳过`);
    else if (full) notify(`单条消息最多添加 ${MAX_FILES} 个附件`);
  };
  const removePending = (attId: string) => {
    const target = pending.find(a => a.id === attId);
    if (target) revokeUrl(target.url);
    setPending(pending.filter(a => a.id !== attId));
  };

  // ===== 品种话术生成：剧本流转（付费场景；AI 辅助不裁决，采纳需人工确认） =====

  /** 确认类 script 卡被处理后锁定为快照，防止重复扣费/重复入库 */
  const markScriptConfirmed = (mid: string) => {
    setMessages((prev) => prev.map((m) => (m.id === mid ? { ...m, confirmedScript: true } : m)));
  };

  const startScriptFlow = (preset: ScriptParams) => {
    setScriptFlow('param');
    push({ id: id(), role: 'ai', kind: 'scriptParam', script: preset });
  };
  const confirmScriptParams = (mid: string, p: ScriptParams) => {
    markScriptConfirmed(mid);
    setScriptFlow('credit');
    push({ id: id(), role: 'ai', kind: 'scriptCredit', script: p });
  };
  const scriptCostOf = (p: ScriptParams) => {
    if (p.mode === 'package') {
      // 全品种话术包：50 条 = 10 包 × 100 积分/包（与价目表自洽）；单品种包 = 100
      return p.variety === ALL_PRODUCTS_OPTION ? 1000 : AI_MODES[1].cost;
    }
    if (p.mode === 'checkup') {
      const n = p.variety === ALL_PRODUCTS_OPTION ? talkScripts.length : talkScripts.filter((s) => s.variety === p.variety).length;
      return Math.max(1, n) * AI_MODES[2].cost;
    }
    return AI_MODES[0].cost;
  };
  const cancelScriptCredit = (mid: string) => {
    markScriptConfirmed(mid);
    setScriptFlow('none');
    push({ id: id(), role: 'ai', kind: 'text', text: '已取消，未消耗积分。' });
  };
  const confirmScriptCredit = (mid: string, p: ScriptParams) => {
    markScriptConfirmed(mid);
    const cost = scriptCostOf(p);
    const scene = p.mode === 'package' ? (p.variety === ALL_PRODUCTS_OPTION ? 'AI品种话术包 ×10（全品种 50 条）' : 'AI品种话术包') : `话术合规体检（${p.variety === ALL_PRODUCTS_OPTION ? '全部品种' : ''}${Math.max(1, Math.floor(cost / 2))}条）`;
    spend(scene, p.variety === ALL_PRODUCTS_OPTION ? '全部品种' : p.variety, cost, userName);
    setScriptFlow('running');
    push({ id: id(), role: 'ai', kind: 'scriptProcess', script: p });
  };
  const completeScriptProcess = (p: ScriptParams) => {
    if (p.mode === 'single') {
      // 单条模式：保持对话内结果卡（链路最短）
      setScriptFlow('result');
      push({ id: id(), role: 'ai', kind: 'scriptResult', script: { ...p, items: SCRIPT_SINGLE } });
      return;
    }
    // 批量模式（话术包 / 体检）：对话流只留摘要卡，结果进右侧面板
    const items = p.mode === 'package'
      ? (p.variety === ALL_PRODUCTS_OPTION ? buildBatchItems() : buildSinglePackageItems(p))
      : buildCheckupItems(p, talkScripts);
    setScriptFlow('result');
    setBatchSelected([]);
    setPanelOpen(true);
    push({ id: id(), role: 'ai', kind: 'scriptSummary', script: { ...p, items, cost: scriptCostOf(p), generatedAt: stamp() } });
  };
  const regenerateScript = (mid: string, p: ScriptParams) => {
    markScriptConfirmed(mid);
    setScriptFlow('credit');
    push({ id: id(), role: 'ai', kind: 'scriptCredit', script: p });
  };
  const tuneScript = (mid: string, p: ScriptParams) => {
    markScriptConfirmed(mid);
    spend('AI微调', p.variety, TUNE_COST, userName);
    push({ id: id(), role: 'ai', kind: 'text', text: `已按「更口语化、突出医保目录内」完成微调（消耗 ${TUNE_COST} 积分，演示）。如需继续调整，请再描述修改方向。` });
  };
  const adoptScriptItems = (mid: string, items: ScriptItem[], p: ScriptParams) => {
    markScriptConfirmed(mid);
    setScriptFlow('adopting');
    push({ id: id(), role: 'ai', kind: 'scriptAdopt', script: { ...p, items } });
  };
  const confirmAdoptScript = (mid: string, payload: ScriptPayload) => {
    markScriptConfirmed(mid);
    payload.items.forEach((it) =>
      adoptFromAI({ variety: payload.variety, firstCat: payload.firstCat, secondCat: payload.secondCat, content: it.content, feedback: it.feedback, confirmBy: `${userName} · ${stamp()}` }),
    );
    setScriptFlow('done');
    push({ id: id(), role: 'ai', kind: 'scriptDone', script: payload });
  };
  const cancelAdoptScript = (mid: string) => {
    markScriptConfirmed(mid);
    setScriptFlow('result');
    push({ id: id(), role: 'ai', kind: 'text', text: '已取消采纳，生成结果仍可查看，也可重新生成。' });
  };
  const undoScriptAdopt = (mid: string, payload: ScriptPayload) => {
    markScriptConfirmed(mid);
    // 演示撤销：按内容匹配删除刚入库的 AI 行，并按生成模式返还积分
    talkScripts
      .filter((s) => s.isAI && payload.items.some((it) => it.content === s.content))
      .forEach((s) => removeScript(s.id));
    const cost = payload.mode === 'package' ? AI_MODES[1].cost : AI_MODES[0].cost;
    refund('撤销采纳自动返还', payload.variety, cost);
    push({ id: id(), role: 'ai', kind: 'text', text: `已撤销本次入库，并返还 ${cost} 积分（演示）。` });
  };

  // ===== 批量结果面板（Result Canvas）：条目状态操作（数据存消息载荷，面板与摘要卡同源联动） =====

  const updateBatchMsg = (mid: string, updater: (items: ScriptBatchItem[]) => ScriptBatchItem[]) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== mid || m.kind !== 'scriptSummary' || !m.script) return m;
        const payload = m.script as BatchPayload;
        return { ...m, script: { ...payload, items: updater(payload.items) } };
      }),
    );
  };

  /** 批量采纳：高危条目自动套用改写版入库；逐条写入话术库（待启用） */
  const batchAdoptItems = (mid: string, ids: number[]) => {
    const msg = messages.find((m) => m.id === mid);
    if (!msg?.script) return;
    const payload = msg.script as BatchPayload;
    const idSet = new Set(ids);
    payload.items
      .filter((it) => idSet.has(it.id) && it.status === 'pending')
      .forEach((it) => {
        const content = it.riskLevel === 'high' ? rewriteOf(it) : it.content;
        adoptFromAI({
          variety: it.product,
          firstCat: payload.firstCat,
          secondCat: it.role,
          content,
          feedback: BATCH_FEEDBACK[it.role] ?? '（AI 批次生成）',
          confirmBy: `${userName} · ${stamp()}`,
        });
      });
    updateBatchMsg(mid, (items) => items.map((it) => (idSet.has(it.id) && it.status === 'pending' ? { ...it, status: 'accepted' } : it)));
  };

  const batchIgnoreItems = (mid: string, ids: number[]) => {
    const idSet = new Set(ids);
    updateBatchMsg(mid, (items) => items.map((it) => (idSet.has(it.id) && it.status === 'pending' ? { ...it, status: 'ignored' } : it)));
  };

  /** 面板行内撤销：accepted 回待确认（同步删除已入库行，不返还生成积分）；ignored 仅回状态 */
  const batchRevertItem = (mid: string, itemId: number) => {
    const msg = messages.find((m) => m.id === mid);
    const payload = msg?.script as BatchPayload | undefined;
    const it = payload?.items.find((x) => x.id === itemId);
    if (it?.status === 'accepted') {
      talkScripts
        .filter((s) => s.isAI && (s.content === it.content || (it.riskLevel === 'high' && s.content === rewriteOf(it))))
        .forEach((s) => removeScript(s.id));
    }
    updateBatchMsg(mid, (items) => items.map((x) => (x.id === itemId ? { ...x, status: 'pending' } : x)));
  };

  const send = (raw: string, atts: Attachment[] = []) => { const text = raw.trim(); if ((!text && !atts.length) || busy) return; setInput(''); if (atts.length) setPending([]); push({ id: id(), role: 'user', kind: 'text', text, ...(atts.length ? { attachments: atts } : {}) }); const intent = intentOf(text); if (intent === 'script') { startScriptFlow(parseScriptPreset(text)); return; } if (intent === 'timed') { if (enabled) { push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'neutral', title: '限时拜访当前已启用', fields: [{ k: '启用时间', v: enabledAt ?? '—' }, { k: '作用范围', v: `${PHARMA} · 医院 / 商业 / 药房拜访` }, { k: '规则摘要', v: '每日仅 09:00–18:00 允许创建、编辑或提交拜访记录' }], canUndo: true } }); return; } setPhase('running'); setRevealed(1); setBusy(true); push({ id: id(), role: 'ai', kind: 'process' }); return; } const query = queryFor(intent); if (query) push({ id: id(), role: 'ai', kind: 'query', query }); else { const ack = atts.length ? `已收到 ${atts.length} 个附件（${atts.slice(0, 3).map(a => a.name).join('、')}${atts.length > 3 ? ' 等' : ''}）。` : ''; push({ id: id(), role: 'ai', kind: 'text', text: `${ack}我可以查询预算执行、分析审批积压、查看服务商逾期任务，或配置限时拜访业务开关。请直接描述需要处理的业务范围或规则。` }); } };
  const confirm = () => { const at = stamp(); setEnabled(true); setEnabledAt(at); setPhase('done'); push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'success', title: '限时拜访已启用', fields: [{ k: '启用时间', v: at }, { k: '作用范围', v: `${PHARMA} 下属全部服务商、工作组、服务专员` }, { k: '规则摘要', v: '每日 09:00–18:00 允许医院 / 商业 / 药房拜访的创建、编辑与提交；其余时段业务端提示并禁止提交' }, { k: '模拟影响', v: '近 7 日 64 条非工作时段提交将被拦截；今日 37 条待提交记录在非允许时段无法提交' }], canUndo: true } }); };
  const cancel = () => { setPhase('cancelled'); push({ id: id(), role: 'ai', kind: 'text', text: '已取消。限时拜访仍为未启用，拜访记录可全天提交。' }); };
  const undo = () => { setEnabled(false); setEnabledAt(null); setPhase('done'); push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'neutral', title: '已撤销本次变更', fields: [{ k: '当前状态', v: '限时拜访未启用' }, { k: '可提交时段', v: '全天' }, { k: '说明', v: '仅恢复本页演示状态，未改真实拜访数据' }] } }); };
  const newChat = () => { pending.forEach(a => revokeUrl(a.url)); setPending([]); setPreviewAtt(null); setMessages([]); setInput(''); setPhase('done'); setBusy(false); setRevealed(0); if (narrow) setRailOpen(false); window.setTimeout(() => inputRef.current?.focus(), 0); };
  const copy = (messageId: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(messageId); window.setTimeout(() => setCopied(null), 1200); };
  const goHome = () => navigate('dashboard');
  const showRail = !narrow || railOpen;

  // 最新一批批量结果的载荷（面板绑定批次）
  const latestBatchMsg = [...messages].reverse().find((m) => m.kind === 'scriptSummary');
  const latestBatchPayload = latestBatchMsg?.script as BatchPayload | undefined;

  const scriptHandlers: ScriptHandlers = {
    confirmParams: confirmScriptParams,
    confirmCredit: confirmScriptCredit,
    cancelCredit: cancelScriptCredit,
    complete: completeScriptProcess,
    regenerate: regenerateScript,
    tune: tuneScript,
    adopt: adoptScriptItems,
    confirmAdopt: confirmAdoptScript,
    cancelAdopt: cancelAdoptScript,
    goList: () => navigate('talk-script-variety'),
    undoAdopt: undoScriptAdopt,
    openBilling: () => setBillingOpen(true),
    togglePanel: () => setPanelOpen((v) => !v),
    openPanel: () => setPanelOpen(true),
    batchAdopt: batchAdoptItems,
    batchIgnore: batchIgnoreItems,
    batchRevert: batchRevertItem,
  };

  return (
    <div className="baiyee-ai-root" style={S.page}>
      <style>{SCOPED_CSS}</style>
      {narrow && railOpen && <button type="button" aria-label="关闭会话侧栏" onClick={() => setRailOpen(false)} style={S.backdrop} />}
      {showRail && (
        <aside aria-label="会话管理" style={{ ...S.rail, width: expanded ? 240 : 64, padding: expanded ? 12 : 10, ...(narrow ? S.railDrawer : {}) }}>
          <div style={{ ...S.brandrow, justifyContent: expanded ? 'space-between' : 'center' }}>
            {expanded && <span style={S.brand}><Brand /><b>baiyee-AI</b></span>}
            {!expanded && <Brand />}
            <Icon label={railOpen ? '折叠侧栏' : '展开侧栏'} dark onClick={() => setRailOpen(v => !v)}><Menu size={17} /></Icon>
          </div>
          <button type="button" onClick={newChat} style={{ ...S.new, justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '0 10px' : 0 }}>
            <MessageSquarePlus size={16} />{expanded && '新对话'}
          </button>
          {expanded && (
            <div style={S.history}>
              <History title="今天" entries={TODAY} current />
              <History title="最近7天" entries={RECENT} />
            </div>
          )}
          <button type="button" className="baiyee-back-rail" aria-label="返回药合作" title="返回药合作" onClick={goHome} style={{ ...S.backRail, justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '0 10px' : 0 }}>
            <ArrowLeft size={16} />{expanded && '返回药合作'}
          </button>
        </aside>
      )}
      <section style={S.main}>
        <header style={S.top}>
          {narrow && !railOpen && <Icon label="打开会话侧栏" onClick={() => setRailOpen(true)}><Menu size={18} /></Icon>}
          <span style={S.title}>新对话 <ChevronDown size={14} /></span>
          <span className="baiyee-sep" style={S.sep} />
          <span className="baiyee-assistant" style={S.assistant}>baiyee-AI</span>
          <span style={S.spacer} />
          <CreditPill credits={credits} onClick={() => setBillingOpen(true)} />
          <span className="baiyee-pharma" style={S.pharma}>{PHARMA}</span>
          <Icon label="更多操作" onClick={() => undefined}><Ellipsis size={18} /></Icon>
        </header>
        <div ref={list} style={S.scroll}>
          <div style={{ ...S.stream, paddingBottom: 28 }}>
            {empty
              ? <Welcome send={send} />
              : messages.map(m => <MessageView key={m.id} message={m} phase={phase} revealed={revealed} navigate={navigate} confirm={confirm} cancel={cancel} undo={undo} copied={copied === m.id} copy={copy} onPreview={setPreviewAtt} scriptHandlers={scriptHandlers} costOf={scriptCostOf} credits={credits} batchPanelOpen={panelOpen && latestBatchMsg?.id === m.id} isLatestBatch={latestBatchMsg?.id === m.id} onBatchAll={() => { setPanelOpen(true); setBatchConfirm({ mid: m.id, kind: 'all-pending' }); }} />)}
          </div>
        </div>
        <footer style={S.footer}>
          <Composer value={input} setValue={setInput} send={() => { send(input, pending); }} busy={busy} inputRef={inputRef} attachments={pending} onAddFiles={addFiles} onRemoveAttach={removePending} attachError={attachError} />
          <p style={S.disclaimer}>baiyee-AI可能会产生错误，请结合业务数据核实。所有配置操作与 AI 内容采纳均需人工确认。</p>
        </footer>
      </section>
      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} />
      {latestBatchMsg && latestBatchPayload && (
        <ResultCanvasPanel
          open={panelOpen}
          payload={latestBatchPayload}
          selected={batchSelected}
          onSelect={setBatchSelected}
          onClose={() => setPanelOpen(false)}
          onAdoptIds={(ids) => batchAdoptItems(latestBatchMsg.id, ids)}
          onIgnoreIds={(ids) => batchIgnoreItems(latestBatchMsg.id, ids)}
          onRevert={(itemId) => batchRevertItem(latestBatchMsg.id, itemId)}
          onBatchConfirm={(kind) => setBatchConfirm({ mid: latestBatchMsg.id, kind })}
          onGoList={() => navigate('talk-script-variety')}
          confirmBy={userName}
        />
      )}
      {batchConfirm && latestBatchPayload && (
        <BatchConfirmModal
          payload={latestBatchPayload}
          kind={batchConfirm.kind}
          selected={batchSelected}
          onCancel={() => setBatchConfirm(null)}
          onConfirm={() => {
            const ids = batchConfirm.kind === 'all-pending'
              ? latestBatchPayload.items.filter((it) => it.status === 'pending').map((it) => it.id)
              : batchSelected.filter((sid) => latestBatchPayload.items.some((it) => it.id === sid && it.status === 'pending'));
            batchAdoptItems(batchConfirm.mid, ids);
            setBatchSelected([]);
            setBatchConfirm(null);
          }}
        />
      )}
      {previewAtt && (
        <div className="baiyee-preview" role="dialog" aria-modal="true" aria-label={`图片预览：${previewAtt.name}`} onClick={() => setPreviewAtt(null)} style={S.previewback}>
          <figure className="baiyee-preview-card" onClick={event => event.stopPropagation()} style={S.previewcard}>
            <img src={previewAtt.url} alt={previewAtt.name} style={S.previewimg} />
            <figcaption style={S.previewcap}>
              <span style={S.previewname}>{previewAtt.name}</span>
              <span style={{ ...S.chipsize, color: '#B9C0BB' }}>{formatSize(previewAtt.size)}</span>
              <Icon dark label="关闭预览" onClick={() => setPreviewAtt(null)}><X size={17} /></Icon>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function Brand() { return <span style={S.mark}><Sparkles size={14} /></span>; }
function Icon({ label, onClick, dark, children }: { label: string; onClick: () => void; dark?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={dark ? 'baiyee-icon baiyee-icon-dark' : 'baiyee-icon'} aria-label={label} title={label} onClick={onClick} style={{ ...S.icon, color: dark ? '#B7C0BA' : '#626864' }}>
      {children}
    </button>
  );
}
function History({ title, entries, current }: { title: string; entries: readonly string[]; current?: boolean }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <p style={S.group}>{title}</p>
      {entries.map((entry, i) => (
        <button key={entry} type="button" className="baiyee-history-item" style={{ ...S.historyitem, background: current && i === 0 ? '#2A302D' : 'transparent', color: current && i === 0 ? '#F2F5F2' : '#BCC4BF' }}>
          {entry}
        </button>
      ))}
    </section>
  );
}
function Prompt({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="baiyee-prompt" disabled={disabled} onClick={onClick} style={S.prompt}>{label}</button>;
}
function Welcome({ send }: { send: (text: string) => void }) {
  return (
    <div style={S.welcome}>
      <div style={S.welcomeinner}>
        <h1 style={S.h1}>今天有什么可以帮你？</h1>
        <p style={S.lead}>你可以查询药厂运营数据、分析业务异常，或通过自然语言配置受控业务规则。</p>
        <div style={S.shortcuts}>
          {SHORTCUTS.map(([label, text]) => <Prompt key={label} label={label} disabled={false} onClick={() => send(text)} />)}
        </div>
      </div>
    </div>
  );
}
function Composer({ value, setValue, send, busy, inputRef, attachments, onAddFiles, onRemoveAttach, attachError }: { value: string; setValue: (value: string) => void; send: () => void; busy: boolean; inputRef?: RefObject<HTMLTextAreaElement | null>; attachments: Attachment[]; onAddFiles: (files: FileList | File[] | null) => void; onRemoveAttach: (id: string) => void; attachError: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const idle = busy || (!value.trim() && !attachments.length);
  return (
    <div
      className="baiyee-ai-composer"
      style={{ ...S.composer, ...(dragOver ? S.composerdrop : {}) }}
      onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
      onDrop={e => { e.preventDefault(); setDragOver(false); onAddFiles(e.dataTransfer.files); }}
    >
      <textarea
        ref={inputRef}
        autoFocus
        aria-label="向 baiyee-AI 发送消息"
        value={value}
        disabled={busy}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        onPaste={e => { const files = Array.from(e.clipboardData?.files ?? []); if (files.length) { e.preventDefault(); onAddFiles(files); } }}
        placeholder="询问运营数据，或描述需要配置的业务规则"
        rows={2}
        style={S.textarea}
      />
      {(attachments.length > 0 || attachError) && (
        <div style={S.chipsrow}>
          {attachments.map(att => <PendingChip key={att.id} att={att} onRemove={() => onRemoveAttach(att.id)} />)}
          {attachError && <span className="baiyee-attach-error" style={S.attacherrortext}>{attachError}</span>}
        </div>
      )}
      <div style={S.composerbar}>
        <Icon label={attachments.length ? `添加附件（${attachments.length}/${MAX_FILES}）` : '添加附件'} onClick={() => fileRef.current?.click()}><Paperclip size={17} /></Icon>
        <button type="button" aria-label="发送消息" disabled={idle} onClick={send} style={{ ...S.send, background: idle ? '#C8CECA' : 'var(--color-brand)', cursor: idle ? 'not-allowed' : 'pointer' }}>
          <Send size={15} />
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept={ACCEPT} aria-hidden="true" tabIndex={-1} style={{ display: 'none' }} onChange={e => { onAddFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
    </div>
  );
}
function MessageView({ message, phase, revealed, navigate, confirm, cancel, undo, copied, copy, onPreview, scriptHandlers, costOf, credits, batchPanelOpen, isLatestBatch, onBatchAll }: { message: Message; phase: Phase; revealed: number; navigate: NavigateFn; confirm: () => void; cancel: () => void; undo: () => void; copied: boolean; copy: (id: string, text: string) => void; onPreview: (att: Attachment) => void; scriptHandlers: ScriptHandlers; costOf: (p: ScriptParams) => number; credits: number; batchPanelOpen: boolean; isLatestBatch: boolean; onBatchAll: () => void }) {
  if (message.role === 'user') {
    return (
      <div style={S.userrow}>
        <div style={S.userbubble}>
          {message.text && <div style={S.usertext}>{message.text}</div>}
          {message.attachments && message.attachments.length > 0 && <BubbleAttachments atts={message.attachments} onPreview={onPreview} />}
        </div>
      </div>
    );
  }
  const raw = message.text ?? message.query?.conclusion ?? message.result?.title ?? '处理过程';
  const isScriptCard = message.kind.startsWith('script');
  const script = message.script as ScriptPayload | undefined;
  return (
    <article style={S.airow}>
      <Brand />
      <div style={S.aibody}>
        <p style={S.ainame}>baiyee-AI</p>
        {message.kind === 'text' && <p style={S.aitext}>{message.text}</p>}
        {message.kind === 'process' && <Process phase={phase} revealed={revealed} confirm={confirm} cancel={cancel} />}
        {message.kind === 'query' && message.query && <QueryCard query={message.query} navigate={navigate} />}
        {message.kind === 'result' && message.result && <ResultCard result={message.result} undo={undo} />}
        {message.kind === 'scriptParam' && message.script && <ScriptParamCard msgId={message.id} locked={message.confirmedScript} initial={message.script as ScriptParams} onConfirm={scriptHandlers.confirmParams} />}
        {message.kind === 'scriptCredit' && message.script && <ScriptCreditCard msgId={message.id} locked={message.confirmedScript} params={message.script as ScriptParams} cost={costOf(message.script as ScriptParams)} credits={credits} onConfirm={scriptHandlers.confirmCredit} onCancel={scriptHandlers.cancelCredit} onRecharge={scriptHandlers.openBilling} />}
        {message.kind === 'scriptProcess' && message.script && <ScriptProcessCard params={message.script as ScriptParams} cost={costOf(message.script as ScriptParams)} onComplete={scriptHandlers.complete} />}
        {message.kind === 'scriptResult' && script && <ScriptResultCard msgId={message.id} locked={message.confirmedScript} payload={script} onAdopt={scriptHandlers.adopt} onRegenerate={scriptHandlers.regenerate} onTune={scriptHandlers.tune} />}
        {message.kind === 'scriptAdopt' && script && <ScriptAdoptCard msgId={message.id} locked={message.confirmedScript} payload={script} onConfirm={scriptHandlers.confirmAdopt} onCancel={scriptHandlers.cancelAdopt} />}
        {message.kind === 'scriptDone' && script && <ScriptDoneCard msgId={message.id} locked={message.confirmedScript} payload={script} onGoList={scriptHandlers.goList} onUndo={scriptHandlers.undoAdopt} />}
        {message.kind === 'scriptSummary' && message.script && (
          <ScriptSummaryCard
            payload={message.script as BatchPayload}
            panelOpen={batchPanelOpen}
            isLatestBatch={isLatestBatch}
            onTogglePanel={scriptHandlers.togglePanel}
            onBatchAll={onBatchAll}
          />
        )}
        {!isScriptCard && (
          <div style={S.actions}>
            <Icon label={copied ? '已复制' : '复制'} onClick={() => copy(message.id, raw)}>{copied ? <Check size={14} /> : <Clipboard size={14} />}</Icon>
            <Icon label="重新生成" onClick={() => undefined}><RotateCcw size={14} /></Icon>
            <Icon label="有帮助" onClick={() => undefined}><ThumbsUp size={14} /></Icon>
            <Icon label="无帮助" onClick={() => undefined}><ThumbsDown size={14} /></Icon>
          </div>
        )}
      </div>
    </article>
  );
}
function Process({ phase, revealed, confirm, cancel }: { phase: Phase; revealed: number; confirm: () => void; cancel: () => void }) {
  const [open, setOpen] = useState(false), done = phase !== 'running';
  return (
    <div>
      <button type="button" onClick={() => setOpen(v => !v)} style={S.processhead}>
        <span style={{ ...S.processmark, color: done ? 'var(--color-brand)' : '#A56B12', background: done ? '#E6F1EC' : '#FFF2D9' }}>{done ? <Check size={13} /> : <Sparkles size={12} />}</span>
        <b>处理过程</b>
        <span style={S.processsummary}>{phase === 'running' ? '正在分析业务范围…' : '已完成需求识别、配置读取、沙箱模拟与风险校验'}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && STEPS.slice(0, Math.max(1, revealed)).map((step, i) => <StepView key={step.title} step={step} running={phase === 'running' && i === revealed - 1} />)}
      {phase === 'awaiting' && <Confirm confirm={confirm} cancel={cancel} />}
      {phase === 'cancelled' && <p style={S.cancelled}>已取消，未更改开关状态。</p>}
    </div>
  );
}
function StepView({ step, running }: { step: Step; running: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={S.step}>
      <button type="button" onClick={() => setOpen(v => !v)} style={S.stepline}>
        <span style={S.check}><Check size={12} /></span>
        <b style={{ fontSize: 'var(--fs-13)' }}>{step.title}{running ? '…' : ''}</b>
        {step.sandbox && <span style={S.sandbox}>沙箱环境，不写入生产</span>}
        <span style={S.stepsummary}>{step.summary}</span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open && (
        <div style={S.stepdetails}>
          {step.rows.map(row => <div key={row.k} style={S.detailrow}><span style={S.detailk}>{row.k}</span><span style={S.detailv}>{row.v}</span></div>)}
          {step.notes?.map(note => <p key={note} style={S.note}>{note}</p>)}
        </div>
      )}
    </div>
  );
}
function Confirm({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  return (
    <div style={S.confirm}>
      <b style={{ fontSize: 'var(--fs-14)' }}>限时拜访</b>
      <p style={{ ...S.aitext, marginTop: 7 }}>每日 09:00–18:00<br />覆盖医院、商业、药房拜访<br />影响百益健康下属全部服务商、工作组和服务专员</p>
      <div style={S.confirmactions}>
        <button type="button" onClick={cancel} style={S.cancel}>取消</button>
        <button type="button" onClick={confirm} style={S.confirmbutton}>确认启用</button>
      </div>
    </div>
  );
}
function QueryCard({ query, navigate }: { query: Query; navigate: NavigateFn }) {
  return (
    <div style={S.card}>
      <b>{query.title}</b>
      <p style={S.aitext}>{query.conclusion}</p>
      {query.fields.map(row => <div key={row.k} style={S.detailrow}><span style={S.detailk}>{row.k}</span><span style={S.detailv}>{row.v}</span></div>)}
      {query.anomalies?.map(note => <p key={note} style={S.note}>{note}</p>)}
      <p style={S.source}>{query.range}<br />{query.period}</p>
      {query.action && query.page && <button type="button" onClick={() => navigate(query.page!)} style={S.outline}>{query.action}</button>}
    </div>
  );
}
function ResultCard({ result, undo }: { result: Result; undo: () => void }) {
  return (
    <div style={{ ...S.card, borderColor: result.tone === 'success' ? '#CFE2D7' : '#E2E6E2' }}>
      <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ ...S.check, width: 19, height: 19 }}>{<Check size={12} />}</span>{result.title}</b>
      {result.fields.map(row => <div key={row.k} style={{ ...S.detailrow, marginTop: 7 }}><span style={S.detailk}>{row.k}</span><span style={S.detailv}>{row.v}</span></div>)}
      {result.canUndo && <button type="button" onClick={undo} style={S.undo}>撤销本次变更</button>}
    </div>
  );
}

function AttThumb({ att, size }: { att: Attachment; size: number }) {
  const Type = fileIconFor(att.mime, att.name);
  return isImage(att.mime)
    ? <img src={att.url} alt={att.name} style={{ width: size, height: size, borderRadius: 6, objectFit: 'cover', background: '#F1F4F1', display: 'block', flexShrink: 0 }} />
    : <span style={{ width: size, height: size, borderRadius: 6, background: '#F1F4F1', color: '#5A6560', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Type size={Math.max(13, Math.round(size * 0.52))} strokeWidth={1.8} /></span>;
}
function PendingChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  return (
    <span className="baiyee-pendingchip" style={S.pendingchip}>
      <AttThumb att={att} size={26} />
      <span style={S.chipname} title={att.name}>{att.name}</span>
      <span style={S.chipsize}>{formatSize(att.size)}</span>
      <button type="button" className="baiyee-att-remove" aria-label={`移除附件 ${att.name}`} onClick={onRemove} style={S.chipremove}><X size={13} /></button>
    </span>
  );
}
function BubbleAttachments({ atts, onPreview }: { atts: Attachment[]; onPreview: (att: Attachment) => void }) {
  return (
    <div style={S.bubbleatts}>
      {atts.map(att => isImage(att.mime)
        ? <button key={att.id} type="button" className="baiyee-attimg" aria-label={`预览图片 ${att.name}`} onClick={() => onPreview(att)} style={S.attimgbtn}><img src={att.url} alt={att.name} style={S.attimgthumb} /></button>
        : <button key={att.id} type="button" className="baiyee-msgchip" title={att.name} onClick={() => downloadAttachment(att)} style={S.msgchip}>
            <AttThumb att={att} size={28} />
            <span style={S.chipname}>{att.name}</span>
            <span style={S.chipsize}>{formatSize(att.size)}</span>
          </button>)}
    </div>
  );
}

// =====================================================================
// 品种话术生成（付费）：卡片组件
// =====================================================================

interface ScriptHandlers {
  confirmParams: (mid: string, p: ScriptParams) => void;
  confirmCredit: (mid: string, p: ScriptParams) => void;
  cancelCredit: (mid: string) => void;
  complete: (p: ScriptParams) => void;
  regenerate: (mid: string, p: ScriptParams) => void;
  tune: (mid: string, p: ScriptParams) => void;
  adopt: (mid: string, items: ScriptItem[], p: ScriptParams) => void;
  confirmAdopt: (mid: string, payload: ScriptPayload) => void;
  cancelAdopt: (mid: string) => void;
  goList: () => void;
  undoAdopt: (mid: string, payload: ScriptPayload) => void;
  openBilling: () => void;
  togglePanel: () => void;
  openPanel: () => void;
  batchAdopt: (mid: string, ids: number[]) => void;
  batchIgnore: (mid: string, ids: number[]) => void;
  batchRevert: (mid: string, itemId: number) => void;
}

/** 从自然语言解析话术剧本预填参数（品种名精确包含匹配 + 类别词匹配 + 全部品种关键词） */
function parseScriptPreset(text: string): ScriptParams {
  const allProducts = text.includes('全部品种') || text.includes('全品种') || text.includes('所有品种');
  const variety = allProducts ? ALL_PRODUCTS_OPTION : VARIETIES.find((v) => text.includes(v)) ?? '';
  const firstCat = FIRST_CATS.find((c) => text.includes(c)) ?? '终端拜访';
  const secondCat = firstCat === '跟台服务' ? '—' : (SUB_CATS[firstCat] ?? [])[0] ?? '';
  return { variety, firstCat, secondCat, mode: 'single', notes: '' };
}

/** 面板/表格内文字操作按钮 */
const LINK_BTN: CSSProperties = {
  background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-12)',
  color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
};

function useTypewriter(text: string, active: boolean) {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!active) { setOut(''); return; }
    let i = 0;
    const timer = window.setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  }, [active, text]);
  return out;
}

function ConfidenceRingSmall({ pct }: { pct: number }) {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const start = Date.now(), dur = 1200;
    let raf = 0;
    const frame = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      setCur(Math.round(pct * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const R = 20, C = 2 * Math.PI * R;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r={R} fill="none" stroke="#E4E9E2" strokeWidth="4" />
      <circle cx="24" cy="24" r={R} fill="none" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - cur / 100)} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1B322D" fontFamily="var(--font-mono)">{cur}%</text>
    </svg>
  );
}

function DemoTag() {
  return <span style={S.demotag}>演示</span>;
}

function Chip({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="baiyee-prompt"
      disabled={disabled}
      onClick={onClick}
      style={active ? { ...S.prompt, ...S.promptOn } : disabled ? { ...S.prompt, opacity: 0.55, cursor: 'not-allowed' } : S.prompt}
    >
      {children}
    </button>
  );
}

function ScriptParamCard({ msgId, locked, initial, onConfirm }: { msgId: string; locked?: boolean; initial: ScriptParams; onConfirm: (mid: string, p: ScriptParams) => void }) {
  const [p, setP] = useState<ScriptParams>(initial);
  const [whyOpen, setWhyOpen] = useState(true);
  const subCats = p.firstCat === '跟台服务' ? [] : p.firstCat ? SUB_CATS[p.firstCat] ?? [] : [];
  // 「全部品种」仅话术包 / 体检可选；单条生成必须绑定具体品种
  const ready = !!p.variety
    && !!p.firstCat
    && (p.firstCat === '跟台服务' || !!p.secondCat)
    && !(p.mode === 'single' && p.variety === ALL_PRODUCTS_OPTION);
  const noteChips = ['老年适用', '起效快', '医保目录内', '与竞品对比'];
  return (
    <div style={{ ...S.card, maxWidth: 560 }}>
      <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>✦ 品种话术生成 · 参数确认 {<DemoTag />}</b>
      <p style={{ ...S.aitext, marginTop: 7 }}>请确认生成参数（AI 建议内容需人工确认后才会入库）：</p>
      <div style={{ ...S.detailrow, alignItems: 'flex-start' }}>
        <span style={S.detailk}>品种</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BATCH_VARIETIES.map((v) => (
            <Chip key={v} disabled={locked} active={p.variety === v} onClick={() => setP((prev) => ({ ...prev, variety: v }))}>{v}</Chip>
          ))}
        </span>
      </div>
      <div style={{ ...S.detailrow, alignItems: 'flex-start' }}>
        <span style={S.detailk}>一级类别</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FIRST_CATS.map((c) => (
            <Chip key={c} disabled={locked} active={p.firstCat === c} onClick={() => setP((prev) => ({ ...prev, firstCat: c, secondCat: c === '跟台服务' ? '—' : '' }))}>{c}</Chip>
          ))}
        </span>
      </div>
      {p.firstCat === '跟台服务' ? (
        <div style={S.detailrow}><span style={S.detailk}>二级类别</span><span style={S.detailv}>—（跟台服务暂无二级类别）</span></div>
      ) : p.firstCat ? (
        <div style={{ ...S.detailrow, alignItems: 'flex-start' }}>
          <span style={S.detailk}>二级类别</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subCats.map((c) => (
              <Chip key={c} disabled={locked} active={p.secondCat === c} onClick={() => setP((prev) => ({ ...prev, secondCat: c }))}>{c}</Chip>
            ))}
          </span>
        </div>
      ) : null}
      <div style={{ ...S.detailrow, alignItems: 'flex-start' }}>
        <span style={S.detailk}>生成模式</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          {AI_MODES.map((m) => (
            <Chip key={m.key} disabled={locked} active={p.mode === m.key} onClick={() => setP((prev) => ({ ...prev, mode: m.key }))}>
              {m.label} · {m.cost} 积分{m.perUnit ? `/${m.perUnit}` : '/次'} —— {m.desc}
            </Chip>
          ))}
        </span>
      </div>
      <div style={{ ...S.detailrow, alignItems: 'flex-start' }}>
        <span style={S.detailk}>补充要点</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {noteChips.map((c) => (
            <Chip key={c} disabled={locked} active={p.notes.includes(c)} onClick={() => setP((prev) => ({ ...prev, notes: prev.notes.includes(c) ? prev.notes : (prev.notes ? `${prev.notes} ${c}` : c) }))}>{c}</Chip>
          ))}
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={() => setWhyOpen((v) => !v)} style={{ ...S.processhead, padding: '6px 0' }}>
          <span style={{ ...S.processmark, color: 'var(--color-brand)', background: '#E6F1EC' }}><Sparkles size={12} /></span>
          <b style={{ fontSize: 'var(--fs-13)' }}>为什么用 baiyee-AI 生成，而不是通用 AI？</b>
          {whyOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {whyOpen && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {WHY_CARDS.map((c) => (
              <div key={c.title} style={{ background: '#FBFCFA', border: '1px solid #EDF0ED', borderRadius: 8, padding: '8px 10px' }}>
                <b style={{ fontSize: 'var(--fs-12)', color: '#242725' }}>{c.title}</b>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>通用 AI：{c.left}</p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-12)', color: 'var(--color-brand)' }}>平台 AI：{c.right}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={S.confirmactions}>
        {locked ? (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Check size={13} /> 已确认
          </span>
        ) : (
          <button type="button" disabled={!ready} onClick={() => onConfirm(msgId, p)} style={{ ...S.confirmbutton, opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}>
            确认参数
          </button>
        )}
      </div>
    </div>
  );
}

function ScriptCreditCard({ msgId, locked, params, cost, credits, onConfirm, onCancel, onRecharge }: { msgId: string; locked?: boolean; params: ScriptParams; cost: number; credits: number; onConfirm: (mid: string, p: ScriptParams) => void; onCancel: (mid: string) => void; onRecharge: () => void }) {
  const insufficient = credits < cost;
  const mode = AI_MODES.find((m) => m.key === params.mode)!;
  return (
    <div style={{ ...S.confirm, maxWidth: 520 }}>
      <b style={{ fontSize: 'var(--fs-14)' }}>✦ {mode.label} · 积分确认{locked ? '（已确认）' : ''}</b>
      {locked ? (
        <div style={{ marginTop: 10 }}>
          <div style={S.detailrow}><span style={S.detailk}>实际消耗</span><span style={{ ...S.detailv, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cost} 积分（已记账，演示）</span></div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={S.detailrow}><span style={S.detailk}>本次消耗</span><span style={{ ...S.detailv, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cost} 积分</span></div>
          <div style={S.detailrow}><span style={S.detailk}>当前余额</span><span style={{ ...S.detailv, fontFamily: 'var(--font-mono)' }}>{credits.toLocaleString()}</span></div>
          <div style={S.detailrow}><span style={S.detailk}>生成后余额</span><span style={{ ...S.detailv, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-brand)' }}>{Math.max(0, credits - cost).toLocaleString()}</span></div>
        </div>
      )}
      <p style={S.note}>生成失败将自动全额返还。{params.mode === 'checkup' ? `体检按话术条数计费（${Math.max(1, Math.floor(cost / 2))} 条 × 2 积分）。` : ''}（演示）原型不产生真实扣费。</p>
      {locked ? null : insufficient ? (
        <div style={{ ...S.confirmactions, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--fs-12)', color: '#B3411B' }}>余额不足（差额 {cost - credits} 积分）</span>
          <button type="button" onClick={onRecharge} style={S.confirmbutton}>去充值</button>
        </div>
      ) : (
        <div style={S.confirmactions}>
          <button type="button" onClick={() => onCancel(msgId)} style={S.cancel}>取消</button>
          <button type="button" onClick={() => onConfirm(msgId, params)} style={S.confirmbutton}>确认并生成</button>
        </div>
      )}
    </div>
  );
}

function ScriptProcessCard({ params, cost, onComplete }: { params: ScriptParams; cost: number; onComplete: (p: ScriptParams) => void }) {
  const stages = params.mode === 'checkup' ? CHECKUP_STAGES : AI_STAGES;
  const [current, setCurrent] = useState(-1);
  const [revealed, setRevealed] = useState(0);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [selfCorrect, setSelfCorrect] = useState<'none' | 'error' | 'correcting' | 'done'>('none');
  const [collapsed, setCollapsed] = useState(false);
  const doneRef = useRef(false);
  const mode = AI_MODES.find((m) => m.key === params.mode)!;
  const totalMs = stages.reduce((s, st) => s + (st.duration ?? 0), 0);

  useEffect(() => {
    const timers: number[] = [];
    let t = 0;
    stages.forEach((stage, i) => {
      timers.push(window.setTimeout(() => setCurrent(i), t));
      timers.push(window.setTimeout(() => {
        setRevealed(i + 1);
        setExpanded((prev) => (prev.includes(i) ? prev : [...prev, i]));
        if (i === 4 && params.mode !== 'checkup') setSelfCorrect('done');
      }, t + (stage.duration ?? 0)));
      if (i === 4 && params.mode !== 'checkup') {
        timers.push(window.setTimeout(() => setSelfCorrect('error'), t + 700));
        timers.push(window.setTimeout(() => setSelfCorrect('correcting'), t + 1600));
      }
      t += stage.duration ?? 0;
    });
    timers.push(window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        // 完成后默认收起为一行（点击头部可展开回看六阶段）
        setCollapsed(true);
        onComplete(params);
      }
    }, t + 240));
    return () => timers.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t0 = useTypewriter(stages[0]?.text ?? '', current === 0);
  const t1 = useTypewriter(stages[1]?.text ?? '', current === 1);
  const t2 = useTypewriter(stages[2]?.text ?? '', current === 2);
  const t3 = useTypewriter(stages[3]?.text ?? '', current === 3);
  const t4 = useTypewriter(stages[4]?.text ?? '', current === 4);
  const t5 = useTypewriter(stages[5]?.text ?? '', current === 5);
  const texts = [t0, t1, t2, t3, t4, t5];

  return (
    <div>
      <button type="button" onClick={() => setCollapsed((v) => !v)} style={S.processhead}>
        <span style={{ ...S.processmark, color: 'var(--color-brand)', background: '#E6F1EC' }}>{collapsed || revealed >= stages.length ? <Check size={13} /> : <Sparkles size={12} />}</span>
        <b>品种话术生成 · {mode.label}</b>
        <span style={S.processsummary}>
          {revealed >= stages.length
            ? `六阶段流水线执行完成（解析合规资产 → 检索反馈 → 合规约束 → 候选生成 → 合规自检 → 输出置信度）· 耗时 ${(totalMs / 1000).toFixed(1)}s · 消耗 ${cost} 积分`
            : `${stages[Math.max(0, current)]?.title ?? '启动中'}…`}
        </span>
        {<DemoTag />}
        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      </button>
      {!collapsed && (
      <div style={{ ...S.stepdetails, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {stages.map((stage, i) => {
          const state = i < revealed ? 'done' : i === current ? 'running' : 'waiting';
          const isOpen = expanded.includes(i);
          return (
            <div key={stage.title} style={{ ...S.step, borderBottom: i < stages.length - 1 ? '1px solid #EDF0ED' : 'none', opacity: state === 'waiting' ? 0.45 : 1 }}>
              <button type="button" onClick={() => setExpanded((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))} style={S.stepline}>
                <span style={{ ...S.check, background: state === 'done' ? '#E6F1EC' : state === 'running' ? '#FFF2D9' : '#F3F4F6', color: state === 'done' ? 'var(--color-brand)' : state === 'running' ? '#A56B12' : '#9CA3AF' }}>
                  {state === 'done' ? <Check size={12} /> : state === 'running' ? <Sparkles size={11} /> : <span style={{ fontSize: 11 }}>·</span>}
                </span>
                <b style={{ fontSize: 'var(--fs-13)', color: stage.warning && state !== 'waiting' ? '#A56B12' : '#242725' }}>{stage.title}{state === 'running' ? '…' : ''}</b>
                {stage.warning && state === 'done' && <span style={{ ...S.sandbox, fontSize: 'var(--fs-11)' }}>⚠ 命中 1 处 · 已改写</span>}
                <span style={S.stepsummary}>{stage.summary}</span>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              {isOpen && (
                <div style={{ ...S.stepdetails, marginTop: 8, background: '#F8FBF9' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
                    {stage.chips.map((c) => (
                      <span key={c} style={{ fontSize: 'var(--fs-11)', padding: '1px 7px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', border: '1px solid rgba(23,107,91,.15)' }}>{c}</span>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: '#1B322D', lineHeight: 1.7, wordBreak: 'break-word' }}>
                    {state === 'running' ? texts[i] : stage.text}
                    {state === 'running' && <span className="baiyee-cursor">▍</span>}
                  </p>
                  {i === 4 && selfCorrect !== 'none' && params.mode !== 'checkup' && (
                    <div style={{ marginTop: 8, background: '#FFFFFF', border: '1px solid #E4E9E2', borderRadius: 8, padding: '8px 10px' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 'var(--fs-11)', color: '#6D7972' }}>候选话术预览（合规自检中）</p>
                      <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#1B322D', lineHeight: 1.7 }}>
                        医生您好，阿托伐他汀钙片是{' '}
                        {selfCorrect === 'error' ? (
                          <span style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-fg)', textDecoration: 'line-through', padding: '0 3px', borderRadius: 3 }}>最有效</span>
                        ) : selfCorrect === 'correcting' ? (
                          <span style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-fg)', padding: '0 3px', borderRadius: 3 }}>经临床验证</span>
                        ) : (
                          <span style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-fg)', padding: '0 3px', borderRadius: 3 }}>经临床验证</span>
                        )}
                        {' '}的降脂治疗选择，适用于高胆固醇血症患者…
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function ReportBlock({ payload }: { payload: ScriptPayload }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...S.processhead, padding: '6px 0' }}>
        <b style={{ fontSize: 'var(--fs-12)' }}>查看合规报告</b>
        <span style={S.processsummary}>{open ? '收起' : '禁用词 0 处 · 未超适应症 · 条款 3 条'}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div style={{ ...S.stepdetails, background: '#F8FBF9' }}>
          <div style={S.detailrow}>
            <span style={S.detailk}>禁用词扫描</span>
            <span style={S.detailv}>
              命中 1 处 → 改写后 0 处：
              <span style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-fg)', textDecoration: 'line-through', padding: '0 3px', borderRadius: 3 }}>最有效</span>
              <span style={{ margin: '0 2px', color: '#9CA3AF' }}>→</span>
              <span style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-fg)', padding: '0 3px', borderRadius: 3 }}>经临床验证</span>
            </span>
          </div>
          <div style={S.detailrow}>
            <span style={S.detailk}>超适应症对比</span>
            <span style={S.detailv}>
              ✓ 高胆固醇血症 → 话术表述未超出；✓ 混合型血脂异常 → 话术表述未超出
            </span>
          </div>
          <div style={S.detailrow}>
            <span style={S.detailk}>法规条款引用</span>
            <span style={S.detailv}>《广告法》第九条（绝对化用语）· 药品广告审查标准相关口径 · 《医药代表备案管理办法》</span>
          </div>
          <p style={{ ...S.note, marginTop: 8 }}>合规报告由平台规则引擎生成，供人工确认参考；最终以人工确认为准。</p>
        </div>
      )}
    </div>
  );
}

function ScriptResultCard({ msgId, locked, payload, onAdopt, onRegenerate, onTune }: { msgId: string; locked?: boolean; payload: ScriptPayload; onAdopt: (mid: string, items: ScriptItem[], p: ScriptParams) => void; onRegenerate: (mid: string, p: ScriptParams) => void; onTune: (mid: string, p: ScriptParams) => void }) {
  const params: ScriptParams = { variety: payload.variety, firstCat: payload.firstCat, secondCat: payload.secondCat, mode: payload.mode, notes: payload.notes };
  const varietyScripts = useTalkScript().scripts.filter((s) => s.variety === payload.variety);

  if (payload.mode === 'checkup') {
    const rows = varietyScripts.slice(0, 6);
    return (
      <div style={{ ...S.card, maxWidth: 620 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>✦ 合规体检报告 · {payload.variety} {<DemoTag />}</b>
        <p style={{ ...S.aitext, marginTop: 7 }}>共扫描 {rows.length} 条话术，发现 2 处风险。逐条结果如下（演示剧本）：</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((s, i) => {
            const risk = CHECKUP_ROWS[i];
            return (
              <div key={s.id} style={{ border: '1px solid #EDF0ED', borderRadius: 8, padding: '8px 10px', background: risk ? '#FBFCFA' : '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#242725', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstCat}/{s.secondCat} · {s.content}</span>
                  {risk ? (
                    <span style={{ fontSize: 'var(--fs-11)', padding: '1px 7px', borderRadius: 999, background: risk.risk === '高危' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)', color: risk.risk === '高危' ? 'var(--color-danger-fg)' : 'var(--color-warning-fg)', flexShrink: 0 }}>{risk.risk}</span>
                  ) : (
                    <span style={{ fontSize: 'var(--fs-11)', padding: '1px 7px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success-fg)', flexShrink: 0 }}>无风险</span>
                  )}
                </div>
                {risk && (
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-12)', color: '#875C21' }}>
                    {risk.note}
                    {risk.risk === '高危' && (
                      <button type="button" onClick={() => onAdopt(msgId, [{ label: '改写', content: risk.rewrite, feedback: s.feedback }], { ...params, secondCat: s.secondCat })} style={{ ...S.outline, marginTop: 6, display: 'inline-block', padding: '3px 8px' }}>
                        采纳改写（入库待启用）
                      </button>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div style={S.confirmactions}>
          {locked ? null : (<button type="button" onClick={() => onRegenerate(msgId, params)} style={S.cancel}>重新体检</button>) }
        </div>
      </div>
    );
  }

  if (payload.mode === 'package') {
    return (
      <div style={{ ...S.card, maxWidth: 620 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>✦ 品种话术包 · {payload.variety} · {payload.firstCat}/{payload.secondCat} {<DemoTag />}</b>
        <p style={{ ...S.aitext, marginTop: 7 }}>AI 建议 · 待人工确认。共 5 条组合话术，可逐条采纳或全部采纳：</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {payload.items.map((it) => (
            <div key={it.label} style={{ border: '1px solid #E4E9E2', borderRadius: 8, padding: '10px 12px', background: '#FBFCFA' }}>
              <b style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand)' }}>{it.label}</b>
              <p style={{ margin: '5px 0 0', fontSize: 'var(--fs-12)', color: '#242725', lineHeight: 1.7 }}>{it.content}</p>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-11)', color: '#6D7972' }}>客户反馈：{it.feedback}</p>
            </div>
          ))}
        </div>
        <div style={S.confirmactions}>
          {locked ? null : (<button type="button" onClick={() => onRegenerate(msgId, params)} style={S.cancel}>重新生成</button>) }
          {locked ? null : (<button type="button" onClick={() => onAdopt(msgId, payload.items, params)} style={S.confirmbutton}>全部采纳并入库</button>) }
        </div>
      </div>
    );
  }

  const item = payload.items[0];
  return (
    <div style={{ ...S.card, maxWidth: 560, borderColor: '#CFE2D7' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ConfidenceRingSmall pct={92} />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 'var(--fs-13)' }}>✦ AI 建议 · 待人工确认 {<DemoTag />}</b>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--fs-11)', color: '#6D7972' }}>{payload.variety} · {payload.firstCat}/{payload.secondCat} · 置信度 92%，最终以人工确认为准</p>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <p style={{ margin: '0 0 3px', fontSize: 'var(--fs-11)', fontWeight: 600, color: '#6D7972' }}>话术内容</p>
        <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: '#242725', lineHeight: 1.75 }}>
          {item.content.split('经临床验证').map((seg, i) => (
            <span key={i}>{i > 0 && <span style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-fg)', padding: '0 3px', borderRadius: 3 }}>经临床验证</span>}{seg}</span>
          ))}
        </p>
        <p style={{ margin: '8px 0 3px', fontSize: 'var(--fs-11)', fontWeight: 600, color: '#6D7972' }}>客户反馈</p>
        <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: '#242725', lineHeight: 1.7 }}>{item.feedback}</p>
      </div>
      <ReportBlock payload={payload} />
      <div style={S.confirmactions}>
        {locked ? null : (<button type="button" onClick={() => onTune(msgId, params)} style={S.cancel}>微调（5 积分）</button>) }
        <button type="button" onClick={() => onRegenerate(msgId, params)} style={S.cancel}>重新生成</button>
        {locked ? <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={13} /> 已处理</span> : (<button type="button" onClick={() => onAdopt(msgId, payload.items, params)} style={S.confirmbutton}>采纳并入库</button>) }
      </div>
    </div>
  );
}

function ScriptAdoptCard({ msgId, locked, payload, onConfirm, onCancel }: { msgId: string; locked?: boolean; payload: ScriptPayload; onConfirm: (mid: string, p: ScriptPayload) => void; onCancel: (mid: string) => void }) {
  const userName = usePermissionOptional()?.principal?.name ?? '李航';
  const count = payload.items.length;
  return (
    <div style={S.confirm}>
      <b style={{ fontSize: 'var(--fs-14)' }}>采纳 AI 话术{count > 1 ? `（${count} 条）` : ''}</b>
      <div style={{ marginTop: 10 }}>
        <div style={S.detailrow}><span style={S.detailk}>目标品种</span><span style={S.detailv}>{payload.variety}</span></div>
        <div style={S.detailrow}><span style={S.detailk}>类别</span><span style={S.detailv}>{payload.firstCat} / {payload.secondCat}</span></div>
        <div style={S.detailrow}><span style={S.detailk}>入库状态</span><span style={S.detailv}>待启用（启用后才会下发移动端）</span></div>
        <div style={S.detailrow}><span style={S.detailk}>来源</span><span style={S.detailv}>✦ AI 生成 · baiyee-AI</span></div>
        <div style={S.detailrow}><span style={S.detailk}>确认人</span><span style={S.detailv}>{userName} · {stamp()}</span></div>
      </div>
      <div style={S.confirmactions}>
        {locked ? (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Check size={13} /> 已处理
          </span>
        ) : (
          <>
            <button type="button" onClick={() => onCancel(msgId)} style={S.cancel}>取消</button>
            <button type="button" onClick={() => onConfirm(msgId, payload)} style={S.confirmbutton}>确认采纳</button>
          </>
        )}
      </div>
    </div>
  );
}

function ScriptDoneCard({ msgId, locked, payload, onGoList, onUndo }: { msgId: string; locked?: boolean; payload: ScriptPayload; onGoList: () => void; onUndo: (mid: string, p: ScriptPayload) => void }) {
  const cost = payload.mode === 'package' ? AI_MODES[1].cost : payload.mode === 'checkup' ? AI_MODES[2].cost : AI_MODES[0].cost;
  return (
    <div style={{ ...S.card, borderColor: '#CFE2D7' }}>
      <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ ...S.check, width: 19, height: 19 }}>{<Check size={12} />}</span>
        已入库（待启用）{payload.items.length > 1 ? ` · 共 ${payload.items.length} 条` : ''}
      </b>
      <div style={{ ...S.detailrow, marginTop: 7 }}>
        <span style={S.detailk}>消耗积分</span>
        <span style={S.detailv}>{cost} 积分已记账（演示）</span>
      </div>
      <button type="button" onClick={onGoList} style={S.outline}>前往话术列表启用 →</button>
      {!locked && <button type="button" onClick={() => onUndo(msgId, payload)} style={{ ...S.undo, marginLeft: 10 }}>撤销本次入库</button>}
    </div>
  );
}

// =====================================================================
// 积分：顶栏胶囊 + 账单面板
// =====================================================================

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from === to) return;
    const start = Date.now(), dur = 400;
    let raf = 0;
    const frame = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      setDisplay(Math.round(from + (to - from) * t));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: 'tnum' }}>{display.toLocaleString()}</span>;
}

function CreditPill({ credits, onClick }: { credits: number; onClick: () => void }) {
  const low = credits < 5;
  return (
    <button
      type="button"
      aria-label={`积分余额 ${credits}，打开账单面板`}
      title="baiyee-AI 积分余额，点击查看账单"
      onClick={onClick}
      className="baiyee-credit-pill"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 999,
        border: low ? '1px solid #E7BD79' : '1px solid #E5E7E5',
        background: low ? '#FFF8EA' : '#fff',
        color: low ? '#875C21' : '#535956',
        fontSize: 'var(--fs-12)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Coins size={13} />
      <AnimatedNumber value={credits} />
    </button>
  );
}

function BillingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { credits, billing, recharge } = useAICredit();
  const [typeFilter, setTypeFilter] = useState('');
  const [billingPage, setBillingPage] = useState(1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [pendingPkg, setPendingPkg] = useState<string | null>(null);
  const [rechargedNote, setRechargedNote] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState(false);
  const PAGE_SZ = 8;

  if (!open) return null;

  const filtered = billing.filter((b) => !typeFilter || b.type === typeFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SZ));
  const safePage = Math.min(billingPage, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SZ, safePage * PAGE_SZ);
  const consumed = billing.filter((b) => b.type === '消耗').reduce((s, b) => s + Math.abs(b.change), 0);
  const rechargedSum = billing.filter((b) => b.type === '充值').reduce((s, b) => s + b.change, 0);
  const gifted = billing.filter((b) => b.type === '获赠').reduce((s, b) => s + b.change, 0);

  const sectionTitle: CSSProperties = { fontSize: 'var(--fs-14)', fontWeight: 600, color: '#1F2937', margin: '18px 0 8px' };
  const tableTh: CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 500, color: '#6B7280', padding: '8px 10px', whiteSpace: 'nowrap' };
  const tableTd: CSSProperties = { fontSize: 'var(--fs-12)', color: '#374151', padding: '8px 10px', borderTop: '1px solid #F3F4F6', whiteSpace: 'nowrap' };

  return (
    <Modal open={open} title="积分与账单" onClose={onClose} width={880}>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-12)', color: '#6B7280' }}>
        baiyee-AI 付费能力统一计费中心 ·（演示）原型不涉及真实资金 · 积分永不过期
      </p>

      {/* 余额卡 */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#6B7280' }}>可用积分</p>
          <p style={{ margin: '2px 0 0', fontSize: 32, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{credits.toLocaleString()}</p>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 'var(--fs-12)', flexWrap: 'wrap' }}>
            <span style={{ color: '#6B7280' }}>注册赠送 <b style={{ color: '#6B7280', fontFamily: 'var(--font-mono)' }}>{gifted.toLocaleString()}</b></span>
            <span style={{ color: '#6B7280' }}>充值所得 <b style={{ color: '#176B5B', fontFamily: 'var(--font-mono)' }}>{rechargedSum.toLocaleString()}</b></span>
            <span style={{ color: '#6B7280' }}>累计消耗 <b style={{ color: '#C73A3A', fontFamily: 'var(--font-mono)' }}>{consumed.toLocaleString()}</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="sm" onClick={() => setRulesOpen(true)}>积分规则</Button>
        </div>
      </div>

      {/* 充值套餐 */}
      <h4 style={sectionTitle}>充值套餐（对公转账）</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {CREDIT_PACKAGES.map((pkg) => (
          <div key={pkg.key} style={{ position: 'relative', border: '2px solid', borderColor: pkg.popular ? 'var(--color-brand)' : 'var(--color-border)', borderRadius: 10, padding: 14 }}>
            {pkg.popular && (
              <span style={{ position: 'absolute', top: -10, left: 12, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-11)', padding: '1px 8px', borderRadius: 999, border: '1px solid rgba(23,107,91,.2)' }}>最受欢迎</span>
            )}
            <p style={{ margin: 0, fontSize: 'var(--fs-14)', fontWeight: 600, color: '#111827' }}>{pkg.name}</p>
            <p style={{ margin: '4px 0 2px', fontSize: 24, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-mono)' }}>￥{pkg.priceLabel.replace('￥', '')}</p>
            <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: '#374151' }}>
              <b style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}>{pkg.credits.toLocaleString()}</b> 积分
              {pkg.bonus > 0 && <span style={{ color: 'var(--color-success-fg)', marginLeft: 4 }}>+赠 {pkg.bonus.toLocaleString()}</span>}
            </p>
            <Button size="sm" variant={pkg.popular ? 'primary' : 'secondary'} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} onClick={() => { setPendingPkg(pkg.key); setRechargedNote(null); }}>
              选择套餐
            </Button>
          </div>
        ))}
      </div>
      {pendingPkg && (
        <div style={{ marginTop: 10, border: '1px solid #E7BD79', background: '#FFF8EA', borderRadius: 8, padding: 12, fontSize: 'var(--fs-12)', color: '#875C21' }}>
          {rechargedNote ? (
            <span>✓ {rechargedNote}</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span>积分充值采用对公转账，下单后商务将在 1 个工作日内联系确认，到账后自动入账并开具发票。（演示）原型不产生真实订单。</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => setPendingPkg(null)}>取消</Button>
                <Button size="sm" variant="primary" onClick={() => { recharge(pendingPkg); const pkg = CREDIT_PACKAGES.find((p) => p.key === pendingPkg); setRechargedNote(`已按「${pkg?.name}」演示入账 ${pkg?.credits.toLocaleString()} 积分。`); }}>确认充值（演示）</Button>
              </span>
            </div>
          )}
        </div>
      )}

      {/* 价目表 */}
      <h4 style={sectionTitle}>价目表</h4>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['模式', '计价', '说明'].map((h) => <th key={h} style={tableTh}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...AI_MODES.map((m) => ({ mode: m.label, price: `${m.cost} 积分/${m.perUnit ?? '次'}`, desc: m.desc })), { mode: '微调', price: `${TUNE_COST} 积分/次`, desc: '在已生成话术基础上按指令微调' }].map((r) => (
              <tr key={r.mode}>
                <td style={{ ...tableTd, fontWeight: 600 }}>{r.mode}</td>
                <td style={{ ...tableTd, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.price}</td>
                <td style={tableTd}>{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 流水 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
        <h4 style={{ ...sectionTitle, margin: 0 }}>消耗流水</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setBillingPage(1); }} style={{ height: 28, padding: '0 8px', fontSize: 'var(--fs-12)', border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff' }}>
            <option value="">全部类型</option>
            {['充值', '获赠', '消耗', '返还'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button size="sm" onClick={() => setExportNote(true)}>导出账单</Button>
        </div>
      </div>
      {exportNote && <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-12)', color: '#6B7280' }}>（演示）原型未生成真实文件，导出后应下载《积分账单.xlsx》。</p>}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['时间', '类型', '场景', '品种', '变动', '结余', '操作人'].map((h) => <th key={h} style={tableTh}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={`${b.time}-${i}`} style={{ background: i % 2 === 1 ? '#FAFAFA' : 'transparent' }}>
                  <td style={{ ...tableTd, color: '#6B7280', fontFamily: 'var(--font-mono)' }}>{b.time}</td>
                  <td style={tableTd}>
                    <span style={{ fontSize: 'var(--fs-11)', padding: '1px 7px', borderRadius: 999, background: b.type === '充值' ? 'var(--color-success-bg)' : b.type === '返还' ? 'var(--color-info-bg)' : b.type === '获赠' ? 'var(--color-warning-bg)' : '#F3F4F6', color: b.type === '充值' ? 'var(--color-success-fg)' : b.type === '返还' ? 'var(--color-info-fg)' : b.type === '获赠' ? 'var(--color-warning-fg)' : '#6B7280' }}>{b.type}</span>
                  </td>
                  <td style={tableTd}>{b.scene}</td>
                  <td style={{ ...tableTd, color: '#6B7280' }}>{b.variety}</td>
                  <td style={{ ...tableTd, fontFamily: 'var(--font-mono)', fontWeight: 600, color: b.change > 0 ? 'var(--color-success-fg)' : 'var(--color-danger-fg)' }}>{b.change > 0 ? `+${b.change}` : b.change}</td>
                  <td style={{ ...tableTd, fontFamily: 'var(--font-mono)' }}>{b.balance.toLocaleString()}</td>
                  <td style={{ ...tableTd, color: '#6B7280' }}>{b.operator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #F3F4F6', fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
          <span>共 {filtered.length} 条 · 第 {safePage} / {totalPages} 页</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" disabled={safePage <= 1} onClick={() => setBillingPage(safePage - 1)}>上一页</Button>
            <Button size="sm" disabled={safePage >= totalPages} onClick={() => setBillingPage(safePage + 1)}>下一页</Button>
          </span>
        </div>
      </div>

      {/* 规则折叠 */}
      {rulesOpen && (
        <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, fontSize: 'var(--fs-12)', color: '#6B7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['基准：1 元 = 10 积分；积分永不过期', '获取：注册赠 500 体验积分；对公充值套餐', '返还规则：生成失败自动全额返还；重新生成按全价再次计费', '抵扣顺序：先消耗「注册赠送」，再消耗「充值积分」'].map((r) => (
            <p key={r} style={{ margin: 0 }}>· {r}</p>
          ))}
        </div>
      )}

      {/* 不可替代性五卡折叠 */}
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={() => setWhyOpen((v) => !v)} style={{ ...S.processhead, padding: '6px 0' }}>
          <span style={{ ...S.processmark, color: 'var(--color-brand)', background: '#E6F1EC' }}><Sparkles size={12} /></span>
          <b style={{ fontSize: 'var(--fs-13)' }}>为什么用 baiyee-AI 生成（通用大模型给不了的四重保障与一个飞轮）</b>
          <span style={S.spacer} />
          {whyOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {whyOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 8 }}>
            {WHY_CARDS.map((c) => (
              <div key={c.title} style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <div style={{ padding: '6px 10px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#1F2937' }}>{c.title}</div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ margin: 0, fontSize: 'var(--fs-11)', color: '#9CA3AF', lineHeight: 1.5 }}>通用 AI：{c.left}</p>
                  <p style={{ margin: 0, fontSize: 'var(--fs-11)', color: 'var(--color-brand)', fontWeight: 500, lineHeight: 1.5, borderLeft: '3px solid var(--color-brand)', paddingLeft: 6 }}>平台 AI：{c.right}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ===== 批量结果：对话流摘要卡 + 右侧结果面板（Result Canvas） =====

function batchStats(items: ScriptBatchItem[]) {
  const total = items.length;
  const accepted = items.filter((d) => d.status === 'accepted').length;
  const ignored = items.filter((d) => d.status === 'ignored').length;
  const pending = items.filter((d) => d.status === 'pending').length;
  const risks = items.filter((d) => d.riskLevel !== 'none').length;
  const processed = accepted + ignored;
  const confs = items.map((d) => d.confidence).sort((a, b) => a - b);
  const high = confs.filter((c) => c >= 90).length;
  return {
    total, accepted, ignored, pending, risks, processed,
    percent: total ? Math.round((accepted / total) * 100) : 0,
    confMin: confs[0] ?? 0, confMax: confs[confs.length - 1] ?? 0,
    confHigh: high,
    confMid: confs.length ? confs[Math.floor(confs.length / 2)] : 0,
    allDone: total > 0 && processed === total,
  };
}

function ScriptSummaryCard({ payload, panelOpen, isLatestBatch, onTogglePanel, onBatchAll }: { payload: BatchPayload; panelOpen: boolean; isLatestBatch: boolean; onTogglePanel: () => void; onBatchAll: () => void }) {
  const st = batchStats(payload.items);
  const mode = AI_MODES.find((m) => m.key === payload.mode)!;
  return (
    <div style={{ ...S.card, maxWidth: 560, borderColor: '#CFE2D7' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-14)' }}>
          ✦ {mode.label} · {payload.variety === ALL_PRODUCTS_OPTION ? '6 品种' : payload.variety} × {st.total} 条 {<DemoTag />}
        </b>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#8C928C' }}>
          {isLatestBatch && (
            <>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: panelOpen ? 'var(--color-brand)' : '#9CA3AF' }} />
              {panelOpen ? '面板已打开' : '面板已收起'}
            </>
          )}
          {!isLatestBatch && '已归档批次'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F7F7F5', borderRadius: 6, padding: '10px 14px', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 18 }}>
          {[
            { label: '已生成', val: st.total, color: '#191B19' },
            { label: '待确认', val: st.pending, color: '#191B19' },
            { label: '已采纳', val: st.accepted, color: 'var(--color-brand)' },
            { label: '合规风险', val: st.risks, color: '#C77A16' },
          ].map((u) => (
            <div key={u.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'var(--fs-11)', color: '#8C928C' }}>{u.label}</span>
              <span className="baiyee-tnum" style={{ fontSize: 16, fontWeight: 600, color: u.color }}>{u.val}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ConfidenceRingSmall pct={st.percent} />
          <span style={{ fontSize: 'var(--fs-11)', color: '#8C928C', lineHeight: 1.3 }}>
            采纳进度<br />
            <span className="baiyee-tnum" style={{ color: '#191B19', fontWeight: 600 }}>{st.accepted}/{st.total}</span>
          </span>
        </div>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-12)', color: '#575B57', display: 'flex', alignItems: 'center', gap: 8 }}>
        话术置信度：
        <span className="baiyee-tnum" style={{ background: '#EAECEA', padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>{st.confMin}% – {st.confMax}%</span>
        <span style={{ color: '#8C928C' }}>中位 {st.confMid}% · 高可信 {st.confHigh} 条</span>
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E5E7E5', paddingTop: 12, marginTop: 12 }}>
        <span style={{ fontSize: 'var(--fs-12)', color: '#8C928C' }}>
          {st.allDone ? `✓ 全部处理完成（采纳 ${st.accepted} · 忽略 ${st.ignored}）` : 'AI 辅助生成不默认入库，需人工逐条或批量确认采纳。'}
        </span>
        {isLatestBatch && !st.allDone && (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onBatchAll} style={S.cancel}>全部采纳</button>
            <button type="button" onClick={onTogglePanel} style={S.confirmbutton}>
              {panelOpen ? '收起面板' : '打开结果面板 →'}
            </button>
          </span>
        )}
        {isLatestBatch && st.allDone && (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onTogglePanel} style={S.outline}>查看批次面板</button>
          </span>
        )}
      </div>
    </div>
  );
}

function BatchItemRow({ item, selected, expanded, checkupMode, onToggleSelect, onAdopt, onIgnore, onRevert, onToggleExpand }: {
  item: ScriptBatchItem; selected: boolean; expanded: boolean; checkupMode: boolean;
  onToggleSelect: () => void; onAdopt: () => void; onIgnore: () => void; onRevert: () => void; onToggleExpand: () => void;
}) {
  const stateBorder = item.status === 'accepted' ? '3.5px solid var(--color-brand)' : item.status === 'ignored' ? 'none' : item.riskLevel === 'high' ? '3.5px solid #C73A3A' : item.riskLevel === 'warn' ? '3.5px solid #C77A16' : 'none';
  const confBg = item.confidence >= 90 ? 'var(--color-brand-subtle)' : item.confidence < 80 ? 'var(--color-warning-bg)' : '#EEF0EE';
  const confFg = item.confidence >= 90 ? 'var(--color-brand)' : item.confidence < 80 ? 'var(--color-warning-fg)' : '#575B57';
  const riskBadge = item.riskLevel === 'high'
    ? { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-fg)', text: '⏹ 高危质检', border: '1px solid #F8B4B4' }
    : item.riskLevel === 'warn'
      ? { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-fg)', text: '⚠ 提示风险', border: '1px solid #F6D6AA' }
      : { bg: '#F0F4F2', fg: '#386652', text: '✓ 无风险', border: 'none' };
  const statusBadge = item.status === 'accepted'
    ? { bg: 'var(--color-brand-subtle)', fg: 'var(--color-brand)', text: '✓ 已采纳' }
    : item.status === 'ignored'
      ? { bg: '#E5E7E5', fg: '#8C928C', text: '已忽略' }
      : { bg: '#F0F2F0', fg: '#8C928C', text: '待确认' };
  return (
    <div style={{
      background: item.status === 'accepted' ? '#FCFDFC' : item.status === 'ignored' ? '#F9FAF9' : '#FFFFFF',
      border: '1px solid #E5E7E5', borderLeft: stateBorder === 'none' ? '1px solid #E5E7E5' : stateBorder,
      borderRadius: 9, padding: '12px 14px', opacity: item.status === 'ignored' ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ width: 15, height: 15, accentColor: 'var(--color-brand)', cursor: 'pointer' }} />
          <span className="baiyee-tnum" style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#8C928C', fontFamily: 'var(--font-mono)' }}>{item.code}</span>
          <span style={{ fontSize: 'var(--fs-12)', fontWeight: 500, color: '#575B57' }}>{item.role}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="baiyee-tnum" style={{ fontSize: 'var(--fs-11)', fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: confBg, color: confFg }}>{item.confidence}%</span>
          <span style={{ fontSize: 'var(--fs-11)', fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: riskBadge.bg, color: riskBadge.fg, border: riskBadge.border }}>{riskBadge.text}</span>
          <span style={{ fontSize: 'var(--fs-11)', fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: statusBadge.bg, color: statusBadge.fg }}>{statusBadge.text}</span>
        </span>
      </div>
      <div style={{
        fontSize: 'var(--fs-13)', lineHeight: 1.55, color: '#191B19', marginBottom: 10,
        display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all',
      }}>
        {item.content}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-12)', color: '#8C928C' }}>
        <span>{item.product}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.status === 'pending' ? (
            <>
              {item.riskLevel === 'high' ? (
                <button type="button" onClick={onAdopt} style={{ ...S.confirmbutton, background: 'var(--color-button-danger)' }}>采纳改写版</button>
              ) : !checkupMode ? (
                <button type="button" onClick={onAdopt} style={S.confirmbutton}>采纳</button>
              ) : null}
              <button type="button" onClick={onIgnore} style={S.cancel}>忽略</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 'var(--fs-11)', color: item.status === 'accepted' ? 'var(--color-brand)' : '#8C928C' }}>{item.status === 'accepted' ? '已入库' : '已忽略'}</span>
              <button type="button" onClick={onRevert} style={{ ...S.undo, marginTop: 0 }}>撤销</button>
            </>
          )}
          <button type="button" onClick={onToggleExpand} title="展开详情" style={{ ...S.icon, width: 24, height: 24, cursor: 'pointer' }}>
            <span style={{ display: 'inline-flex', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none', color: '#8C928C' }}><ChevronDown size={14} /></span>
          </button>
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #E5E7E5', fontSize: 'var(--fs-12)', color: '#575B57' }}>
          {item.riskLevel !== 'none' ? (
            <div style={{
              background: item.riskLevel === 'high' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
              border: `1px solid ${item.riskLevel === 'high' ? '#F8B4B4' : '#F6D6AA'}`,
              borderRadius: 6, padding: '10px 12px', marginBottom: 10,
            }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', marginBottom: 4, color: item.riskLevel === 'high' ? 'var(--color-danger-fg)' : 'var(--color-warning-fg)' }}>{item.riskTitle}</b>
              <div>{item.riskDesc}</div>
              <div style={{ background: '#FFFFFF', border: '1px solid #DFE3DF', borderRadius: 6, padding: '8px 10px', marginTop: 6 }}>
                <div style={{ fontWeight: 600, color: 'var(--color-brand)', marginBottom: 2 }}>合规改写推荐版本：</div>
                <div>{item.rewriteText}</div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#FAFAFA', border: '1px solid #E5E7E5', borderRadius: 6, padding: '10px 12px', marginBottom: 10, color: '#386652' }}>
              <b style={{ fontSize: 'var(--fs-12)' }}>✓ 合规自检通过</b>
              <div>未检出超适应症用药、未检出广告法绝对化禁用词、已匹配该药品最新说明书适应证要求。</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-11)', color: '#8C928C' }}>模型底座 baiyee-BioMed-v3（演示）· 循证文献 8 篇附录</span>
            {item.status === 'pending' && !checkupMode && item.riskLevel !== 'high' && (
              <button type="button" onClick={onAdopt} style={S.outline}>采纳并入库</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCanvasPanel({ open, payload, selected, onSelect, onClose, onAdoptIds, onIgnoreIds, onRevert, onBatchConfirm, onGoList, confirmBy }: {
  open: boolean; payload: BatchPayload; selected: number[]; onSelect: (ids: number[]) => void;
  onClose: () => void; onAdoptIds: (ids: number[]) => void; onIgnoreIds: (ids: number[]) => void;
  onRevert: (itemId: number) => void; onBatchConfirm: (kind: 'all-pending' | 'selected') => void;
  onGoList: () => void; confirmBy: string;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'ignored' | 'risk'>('all');
  const [view, setView] = useState<'card' | 'table'>('card');
  const [groupBy, setGroupBy] = useState<'none' | 'product' | 'role'>('product');
  const [sortBy, setSortBy] = useState<'default' | 'conf-desc' | 'risk-first'>('default');
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const st = batchStats(payload.items);
  const checkupMode = payload.mode === 'checkup';
  // 批次留痕按真实入库数计（种子预置的采纳态仅为视觉演示，不对应库内行）
  const libraryScripts = useTalkScript().scripts;
  const realAdopted = payload.items.filter(
    (it) => it.status === 'accepted' && libraryScripts.some((s) => s.isAI && (s.content === it.content || (it.riskLevel === 'high' && s.content === rewriteOf(it)))),
  ).length;

  const filtered = payload.items.filter((it) => {
    if (filter === 'pending') return it.status === 'pending';
    if (filter === 'accepted') return it.status === 'accepted';
    if (filter === 'ignored') return it.status === 'ignored';
    if (filter === 'risk') return it.riskLevel !== 'none';
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'conf-desc') return b.confidence - a.confidence;
    if (sortBy === 'risk-first') {
      const s = (r: BatchRisk) => (r === 'high' ? 3 : r === 'warn' ? 2 : 1);
      return s(b.riskLevel) - s(a.riskLevel);
    }
    return a.id - b.id;
  });
  const groups: { key: string; items: ScriptBatchItem[] }[] =
    groupBy === 'product'
      ? [...new Set(sorted.map((i) => i.product))].map((k) => ({ key: k, items: sorted.filter((i) => i.product === k) }))
      : groupBy === 'role'
        ? [...new Set(sorted.map((i) => i.role))].map((k) => ({ key: k, items: sorted.filter((i) => i.role === k) }))
        : [{ key: '', items: sorted }];
  const selectedPending = selected.filter((sid) => payload.items.some((it) => it.id === sid && it.status === 'pending'));
  const chip = (active: boolean) => ({
    padding: '4px 10px', borderRadius: 20, fontSize: 'var(--fs-12)', fontWeight: 500, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-brand)' : '#E5E7E5'}`,
    background: active ? 'var(--color-brand)' : '#FFFFFF',
    color: active ? '#fff' : '#575B57', fontFamily: 'inherit',
  } as CSSProperties);

  return (
    <div className="baiyee-batch-panel" style={{ transform: open ? 'translateX(0)' : 'translateX(105%)' }} aria-label="生成结果面板">
      {/* 头部 */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', flexShrink: 0 }}>
        <div>
          <b style={{ fontSize: 'var(--fs-15)', display: 'flex', alignItems: 'center', gap: 8 }}>
            ✦ 生成结果 <span style={{ fontWeight: 500, fontSize: 'var(--fs-13)', color: '#575B57' }}>· {st.total} 条</span>
          </b>
          <div style={{ fontSize: 'var(--fs-12)', color: '#8C928C', display: 'flex', gap: 6, marginTop: 2 }}>
            <span>{AI_MODES.find((m) => m.key === payload.mode)!.label}</span><span>·</span>
            <span className="baiyee-tnum">{payload.generatedAt}</span><span>·</span>
            <span>消耗 {payload.cost} 积分（演示）</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', background: '#EEF0EE', padding: 2, borderRadius: 6 }}>
            {(['card', 'table'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} style={{
                padding: '4px 10px', fontSize: 'var(--fs-12)', fontWeight: 500, border: 'none', cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit',
                background: view === v ? '#fff' : 'transparent', color: view === v ? '#191B19' : '#575B57',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
              }}>
                {v === 'card' ? '卡片' : '表格'}
              </button>
            ))}
          </span>
          <button type="button" onClick={onClose} title="收起面板" style={{ ...S.icon, cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#E8ECE8', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--color-brand)', width: `${st.percent}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* 统计 chips 即筛选 */}
      <div style={{ padding: '10px 20px', background: '#FAFAFA', borderBottom: '1px solid #E5E7E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['all', `全部 ${st.total}`], ['pending', `待确认 ${st.pending}`], ['accepted', `已采纳 ${st.accepted}`],
            ['ignored', `已忽略 ${st.ignored}`], ['risk', `风险 ${st.risks}`],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} style={chip(filter === key)}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--fs-12)', color: '#575B57' }}>
          已处理 <b className="baiyee-tnum" style={{ color: 'var(--color-brand)' }}>{st.processed}</b>/{st.total}
        </span>
      </div>

      {/* 工具行 */}
      <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7E5', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#8C928C' }}>
            分组:
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} style={{ background: '#F4F6F4', border: '1px solid #E5E7E5', padding: '5px 8px', borderRadius: 6, fontSize: 'var(--fs-12)', fontFamily: 'inherit' }}>
              <option value="none">不分组</option>
              <option value="product">按品种</option>
              <option value="role">按拜访角色</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#8C928C' }}>
            排序:
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={{ background: '#F4F6F4', border: '1px solid #E5E7E5', padding: '5px 8px', borderRadius: 6, fontSize: 'var(--fs-12)', fontFamily: 'inherit' }}>
              <option value="default">默认序号</option>
              <option value="conf-desc">置信度降序</option>
              <option value="risk-first">风险优先</option>
            </select>
          </label>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#575B57', cursor: 'pointer' }}>
            <input type="checkbox" checked={selectedPending.length > 0 && selectedPending.length === filtered.filter((i) => i.status === 'pending').length} onChange={(e) => onSelect(e.target.checked ? filtered.filter((i) => i.status === 'pending').map((i) => i.id) : [])} style={{ accentColor: 'var(--color-brand)' }} />
            全选（当前筛选 {filtered.length} 条）
          </label>
          {selectedPending.length > 0 && (
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => onBatchConfirm('selected')} style={S.confirmbutton}>采纳所选（{selectedPending.length}）</button>
              <button type="button" onClick={() => { onIgnoreIds(selectedPending); onSelect([]); }} style={S.cancel}>忽略所选</button>
            </span>
          )}
        </span>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#FFFFFF' }}>
        {st.allDone && (
          <div style={{ background: '#E8F3F0', border: '1px solid #B8DDD5', color: 'var(--color-brand)', padding: '10px 16px', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-13)', fontWeight: 500 }}>
            <span>✓ {st.total} 条全部处理完成（采纳 {st.accepted} · 忽略 {st.ignored}）</span>
            <button type="button" onClick={onGoList} style={S.outline}>前往话术列表启用 →</button>
          </div>
        )}
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 20px', color: '#8C928C' }}>
            <span>当前筛选条件下没有话术</span>
            <button type="button" onClick={() => setFilter('all')} style={S.cancel}>清除筛选条件</button>
          </div>
        ) : view === 'card' ? (
          groups.map((g) => {
            const collapsed = collapsedGroups.includes(g.key);
            const gAccepted = g.items.filter((i) => i.status === 'accepted').length;
            return (
              <div key={g.key || 'flat'} style={{ marginBottom: 14 }}>
                {g.key && (
                  <div style={{ position: 'sticky', top: -16, zIndex: 5, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(4px)', padding: '8px 0', marginBottom: 8, borderBottom: '1px solid #E5E7E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-13)', fontWeight: 600, color: '#191B19', cursor: 'pointer' }} onClick={() => setCollapsedGroups((p) => (p.includes(g.key) ? p.filter((k) => k !== g.key) : [...p, g.key]))}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#8C928C', display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : 'none' }}><ChevronDown size={14} /></span>
                      {g.key}
                      <span style={{ fontSize: 'var(--fs-12)', fontWeight: 400, color: '#8C928C' }}>（{g.items.length} 条）</span>
                    </span>
                    <span style={{ fontSize: 'var(--fs-12)', fontWeight: 400, color: '#575B57' }}>已采纳 <b className="baiyee-tnum" style={{ color: 'var(--color-brand)' }}>{gAccepted}</b>/{g.items.length}</span>
                  </div>
                )}
                {!collapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {g.items.map((it) => (
                      <BatchItemRow
                        key={it.id}
                        item={it}
                        selected={selected.includes(it.id)}
                        expanded={expandedIds.includes(it.id)}
                        checkupMode={checkupMode}
                        onToggleSelect={() => onSelect(selected.includes(it.id) ? selected.filter((x) => x !== it.id) : [...selected, it.id])}
                        onAdopt={() => onAdoptIds([it.id])}
                        onIgnore={() => onIgnoreIds([it.id])}
                        onRevert={() => onRevert(it.id)}
                        onToggleExpand={() => setExpandedIds((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : [...p, it.id]))}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-12)' }}>
            <thead>
              <tr>
                {['', '#', '品种', '角色', '话术正文摘要', '置信度', '风险', '状态', '操作'].map((h, i) => (
                  <th key={i} style={{ background: '#FAFAFA', padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#575B57', borderBottom: '1px solid #E5E7E5', position: 'sticky', top: -16, zIndex: 4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((it) => (
                <tr key={it.id} style={{ background: it.status === 'accepted' ? '#FCFDFC' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5' }}>
                    <input type="checkbox" checked={selected.includes(it.id)} disabled={it.status !== 'pending'} onChange={() => onSelect(selected.includes(it.id) ? selected.filter((x) => x !== it.id) : [...selected, it.id])} style={{ accentColor: 'var(--color-brand)' }} />
                  </td>
                  <td className="baiyee-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', color: '#8C928C', fontFamily: 'var(--font-mono)' }}>{it.code}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', fontWeight: 500, whiteSpace: 'nowrap' }}>{it.product}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', color: '#575B57', whiteSpace: 'nowrap' }}>{it.role}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.content}>{it.content}</td>
                  <td className="baiyee-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5' }}>{it.confidence}%</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', color: it.riskLevel === 'high' ? 'var(--color-danger-fg)' : it.riskLevel === 'warn' ? 'var(--color-warning-fg)' : '#386652', fontWeight: it.riskLevel === 'high' ? 700 : 400 }}>
                    {it.riskLevel === 'high' ? '⏹' : it.riskLevel === 'warn' ? '⚠' : '✓'}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', color: it.status === 'accepted' ? 'var(--color-brand)' : '#8C928C', fontWeight: it.status === 'accepted' ? 500 : 400 }}>
                    {it.status === 'accepted' ? '已采纳' : it.status === 'ignored' ? '已忽略' : '待确认'}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #E5E7E5', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {it.status === 'pending' ? (
                      <>
                        {!checkupMode || it.riskLevel === 'high' ? (
                          <button type="button" onClick={() => onAdoptIds([it.id])} style={{ ...LINK_BTN, fontWeight: 500 }}>{it.riskLevel === 'high' ? '采纳改写' : '采纳'}</button>
                        ) : null}
                        {!checkupMode || true ? (
                          <>
                            {(!checkupMode || it.riskLevel === 'high') && <span style={{ color: '#D1D5DB' }}> | </span>}
                            <button type="button" onClick={() => onIgnoreIds([it.id])} style={{ ...LINK_BTN, color: '#8C928C' }}>忽略</button>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <button type="button" onClick={() => onRevert(it.id)} style={{ ...LINK_BTN, color: '#8C928C' }}>撤销</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 底部批次留痕 */}
      <div style={{ padding: '10px 20px', background: '#FBFBFB', borderTop: '1px solid #E5E7E5', fontSize: 'var(--fs-12)', color: '#8C928C', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>批次留痕：<b className="baiyee-tnum">{realAdopted}</b> 条已入库 · 操作人 <b>{confirmBy}</b> · 含改写 {payload.items.filter((i) => i.status === 'accepted' && i.riskLevel !== 'none').length} 条</span>
        <span style={{ fontSize: 'var(--fs-11)' }}>撤销不返还生成积分</span>
      </div>
    </div>
  );
}

function BatchConfirmModal({ payload, kind, selected, onCancel, onConfirm }: { payload: BatchPayload; kind: 'all-pending' | 'selected'; selected: number[]; onCancel: () => void; onConfirm: () => void }) {
  const targets = kind === 'all-pending'
    ? payload.items.filter((it) => it.status === 'pending')
    : payload.items.filter((it) => selected.includes(it.id) && it.status === 'pending');
  const highCount = targets.filter((it) => it.riskLevel === 'high').length;
  return (
    <Modal open title={kind === 'all-pending' ? `全部采纳确认（共 ${targets.length} 条待处理）` : `批量采纳确认（已选 ${targets.length} 条待处理）`} width={480} onClose={onCancel}
      footer={<><Button onClick={onCancel}>取消</Button><Button variant="primary" onClick={onConfirm}>确认入库</Button></>}>
      <div style={{ fontSize: 'var(--fs-13)', color: '#575B57', lineHeight: 1.6 }}>
        将批量采纳并入库选中的话术条目（入库状态=待启用），供拜访人员确认启用后同步移动端使用。
        <div style={{ background: '#F7F7F5', borderRadius: 6, padding: '10px 12px', margin: '12px 0', fontSize: 'var(--fs-12)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {targets.slice(0, 4).map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#191B19' }}>
              <span>#{it.code} {it.product} · {it.role}</span>
              <span className="baiyee-tnum" style={{ color: 'var(--color-brand)' }}>{it.confidence}% 置信度</span>
            </div>
          ))}
          {targets.length > 4 && <div style={{ color: '#8C928C', textAlign: 'center', fontSize: 'var(--fs-11)' }}>… 以及其余 {targets.length - 4} 条话术</div>}
        </div>
        {highCount > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: 'var(--color-warning-fg)' }}>⚠ 含高危条目 {highCount} 条，将自动套用合规改写版本入库。</p>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-11)', color: '#8C928C' }}>（演示）原型不产生真实扣费与写入；确认后话术进入品种话术维护列表（待启用）。</p>
      </div>
    </Modal>
  );
}

const SCOPED_CSS = `
.baiyee-ai-root { width: 100%; max-width: 100%; overflow: hidden; }
.baiyee-ai-root *, .baiyee-ai-root *::before, .baiyee-ai-root *::after { box-sizing: border-box; }
.baiyee-ai-root button:focus-visible,
.baiyee-ai-root textarea:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.baiyee-ai-composer:focus-within { box-shadow: 0 0 0 2px var(--color-brand); }
.baiyee-ai-root textarea { outline: none; }
.baiyee-ai-root .baiyee-icon:hover { background: rgba(36,39,37,.06); }
.baiyee-ai-root .baiyee-icon-dark:hover { background: rgba(255,255,255,.08); }
.baiyee-ai-root .baiyee-history-item:hover { background: #2A302D; }
.baiyee-ai-root .baiyee-prompt:hover { background: #F3F5F3; }
.baiyee-ai-root .baiyee-prompt:disabled { opacity: .55; cursor: not-allowed; }
.baiyee-ai-root .baiyee-back-rail:hover { background: #2A302D; }
.baiyee-ai-root .baiyee-att-remove:hover { background: rgba(36,39,37,.09); color: #3F4642; }
.baiyee-ai-root .baiyee-pendingchip { transition: border-color 120ms ease; }
.baiyee-ai-root .baiyee-pendingchip:hover { border-color: #C7D3CB; }
.baiyee-ai-root .baiyee-msgchip { transition: border-color 120ms ease; }
.baiyee-ai-root .baiyee-msgchip:hover { border-color: #B9CFC5; }
.baiyee-ai-root .baiyee-attimg { transition: box-shadow 120ms ease; }
.baiyee-ai-root .baiyee-attimg:hover { box-shadow: 0 0 0 2px rgba(23,107,91,.38); }
.baiyee-ai-root .baiyee-credit-pill { transition: border-color 150ms ease, background 150ms ease; }
.baiyee-ai-root .baiyee-credit-pill:hover { border-color: #C9D9D2; background: #FBFCFA; }
.baiyee-ai-root .baiyee-cursor { animation: baiyee-cursor-blink 600ms step-end infinite; }
.baiyee-ai-root .baiyee-tnum { font-family: var(--font-mono); font-feature-settings: 'tnum'; }
@keyframes baiyee-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.baiyee-ai-root .baiyee-batch-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(760px, 58vw);
  z-index: 60;
  background: #FFFFFF;
  border-left: 1px solid #E5E7E5;
  box-shadow: -8px 0 28px rgba(23, 26, 25, 0.08);
  display: flex;
  flex-direction: column;
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}
.baiyee-ai-root .baiyee-batch-panel button:focus-visible,
.baiyee-ai-root .baiyee-batch-panel select:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
@media (max-width: 1100px) {
  .baiyee-ai-root .baiyee-batch-panel { width: 100vw; }
}
@media (prefers-reduced-motion: reduce) {
  .baiyee-ai-root .baiyee-batch-panel { transition: none; }
  .baiyee-ai-root .baiyee-cursor { animation: none !important; }
}
@media (max-width: 899px) {
  .baiyee-ai-root textarea { font-size: 16px; }
}
@media (max-width: 640px) {
  .baiyee-ai-root .baiyee-sep { display: none; }
  .baiyee-ai-root .baiyee-pharma { max-width: 28vw !important; }
}
`;

const S: Record<string, CSSProperties> = {
  page: { height: '100%', width: '100%', maxWidth: '100%', display: 'flex', overflow: 'hidden', background: '#F7F7F5', color: '#242725' },
  rail: { flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#171A19', color: '#E9ECE9', transition: 'width 180ms ease' },
  railDrawer: { position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 40, width: 240, boxShadow: '8px 0 24px rgba(23,26,25,.28)' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, margin: 0, padding: 0, border: 0, background: 'rgba(23,26,25,.45)', cursor: 'pointer' },
  brandrow: { display: 'flex', alignItems: 'center', minHeight: 36, marginBottom: 14 },
  brand: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--fs-15)', whiteSpace: 'nowrap' },
  mark: { width: 23, height: 23, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--color-brand)', color: '#fff', flexShrink: 0 },
  icon: { width: 32, height: 32, flexShrink: 0, marginLeft: 4, border: 0, borderRadius: 6, background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  new: { height: 38, gap: 9, display: 'flex', alignItems: 'center', borderRadius: 8, background: '#2A302D', border: '1px solid #363D39', color: '#F7F7F5', fontSize: 'var(--fs-13)', cursor: 'pointer' },
  backRail: { marginTop: 'auto', height: 38, gap: 8, display: 'flex', alignItems: 'center', borderRadius: 8, background: 'transparent', border: '1px solid #363D39', color: '#E9ECE9', fontSize: 'var(--fs-13)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  history: { marginTop: 23, overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 },
  group: { margin: '0 0 6px', padding: '0 8px', color: '#7D8781', fontSize: 'var(--fs-11)' },
  historyitem: { display: 'block', border: 0, borderRadius: 6, width: '100%', padding: '8px 9px', marginBottom: 2, textAlign: 'left', fontSize: 'var(--fs-13)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' },
  main: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F7F5' },
  top: { height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px 0 16px', borderBottom: '1px solid #E5E7E5', gap: 4, minWidth: 0, overflow: 'hidden' },
  title: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-14)', fontWeight: 600, whiteSpace: 'nowrap' },
  sep: { width: 1, height: 16, margin: '0 10px', background: '#E5E7E5', flexShrink: 0 },
  assistant: { fontSize: 'var(--fs-12)', color: '#6B706D', whiteSpace: 'nowrap' },
  spacer: { flex: 1, minWidth: 8 },
  pharma: { padding: '4px 9px', borderRadius: 999, border: '1px solid #E5E7E5', background: '#fff', color: '#535956', fontSize: 'var(--fs-12)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '42%' },
  scroll: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' },
  stream: { maxWidth: 800, width: '100%', minHeight: '100%', margin: '0 auto', padding: '28px 16px' },
  footer: { flexShrink: 0, width: '100%', maxWidth: '100%', padding: '12px 16px 14px', background: '#F7F7F5' },
  shortcuts: { maxWidth: 800, margin: '0 auto 10px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  prompt: { padding: '6px 10px', border: '1px solid #E5E7E5', borderRadius: 8, background: '#fff', color: '#6B706D', fontSize: 'var(--fs-12)', lineHeight: 1.4, cursor: 'pointer' },
  disclaimer: { maxWidth: 800, margin: '8px auto 0', textAlign: 'center', color: '#7B817E', fontSize: 'var(--fs-11)' },
  welcome: { minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '4vh', paddingBottom: '8vh' },
  welcomeinner: { width: '100%', maxWidth: 800, margin: '0 auto' },
  h1: { margin: '0 0 10px', textAlign: 'center', fontSize: 'clamp(26px, 4vw, 34px)', lineHeight: 1.25, letterSpacing: '-.03em', fontWeight: 650, color: '#242725' },
  lead: { maxWidth: 580, margin: '0 auto 26px', textAlign: 'center', color: '#6B706D', fontSize: 'var(--fs-15)', lineHeight: 1.65 },
  composer: { maxWidth: 800, width: '100%', margin: '0 auto', padding: '11px 12px 10px', border: '1px solid #E5E7E5', borderRadius: 14, background: '#FFFFFF', boxShadow: '0 2px 7px rgba(26,34,29,.06)' },
  textarea: { display: 'block', width: '100%', minHeight: 44, border: 0, outline: 0, resize: 'none', background: 'transparent', color: '#242725', font: 'var(--fs-14) var(--font-sans)', lineHeight: 1.6 },
  composerbar: { display: 'flex', alignItems: 'center', marginTop: 6, minWidth: 0 },
  send: { marginLeft: 'auto', width: 31, height: 31, border: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },
  userrow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 24 },
  userbubble: { maxWidth: '78%', padding: '10px 13px', borderRadius: '13px 13px 3px 13px', background: '#E7F0EC', color: '#28332E', fontSize: 'var(--fs-14)', lineHeight: 1.6, wordBreak: 'break-word' },
  airow: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 28, minWidth: 0 },
  aibody: { minWidth: 0, flex: 1, paddingTop: 1 },
  ainame: { margin: '0 0 7px', color: '#535A56', fontSize: 'var(--fs-12)', fontWeight: 600 },
  aitext: { margin: '0 0 11px', color: '#3F4642', fontSize: 'var(--fs-13)', lineHeight: 1.7, wordBreak: 'break-word' },
  actions: { display: 'flex', alignItems: 'center', marginTop: 9, gap: 2 },
  processhead: { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#242725', minWidth: 0 },
  processmark: { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 },
  processsummary: { flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#6B706D', fontSize: 'var(--fs-12)', minWidth: 0 },
  step: { padding: '11px 0', borderBottom: '1px solid #EDF0ED' },
  stepline: { display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: 0, border: 0, background: 'transparent', color: '#242725', textAlign: 'left', cursor: 'pointer', minWidth: 0 },
  check: { display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', color: 'var(--color-brand)', background: '#E6F1EC' },
  sandbox: { padding: '2px 5px', border: '1px solid #F3DCB6', borderRadius: 4, background: '#FFF2D9', color: '#986016', fontSize: 'var(--fs-11)', whiteSpace: 'nowrap' },
  stepsummary: { flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#6B706D', fontSize: 'var(--fs-12)', minWidth: 0 },
  stepdetails: { margin: '10px 0 0 27px', padding: '9px 11px', borderRadius: 6, background: '#FBFCFA', minWidth: 0 },
  detailrow: { display: 'flex', gap: 12, padding: '4px 0', fontSize: 'var(--fs-12)', lineHeight: 1.55, minWidth: 0 },
  detailk: { color: '#6B706D', flexShrink: 0, minWidth: 72 },
  detailv: { minWidth: 0, flex: 1, wordBreak: 'break-word', color: '#242725' },
  note: { margin: '8px 0 0', padding: '7px 9px', borderLeft: '2px solid #E7BD79', background: '#FFF8EA', color: '#875C21', fontSize: 'var(--fs-12)', lineHeight: 1.55, wordBreak: 'break-word' },
  confirm: { marginTop: 15, padding: '13px 14px', border: '1px solid #DDE5DF', borderRadius: 9, background: '#fff' },
  confirmactions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 13, flexWrap: 'wrap' },
  cancel: { height: 30, padding: '0 12px', border: '1px solid #DCE0DD', borderRadius: 6, background: '#fff', color: '#4F5652', fontSize: 'var(--fs-12)', cursor: 'pointer' },
  confirmbutton: { height: 30, padding: '0 12px', border: 0, borderRadius: 6, background: 'var(--color-brand)', color: '#fff', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer' },
  cancelled: { margin: '11px 0 0', color: '#6B706D', fontSize: 'var(--fs-13)' },
  card: { padding: '14px 15px', border: '1px solid #E5E7E5', borderRadius: 9, background: '#FFFFFF', color: '#242725', minWidth: 0 },
  source: { margin: '10px 0 0', color: '#737975', fontSize: 'var(--fs-11)', lineHeight: 1.6, wordBreak: 'break-word' },
  outline: { marginTop: 12, padding: '6px 9px', border: '1px solid #C9D9D2', borderRadius: 6, background: '#fff', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer' },
  undo: { marginTop: 12, padding: 0, border: 0, background: 'transparent', color: '#4E655C', fontSize: 'var(--fs-12)', textDecoration: 'underline', cursor: 'pointer' },
  usertext: { whiteSpace: 'pre-wrap' },
  bubbleatts: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end', minWidth: 0 },
  chipsrow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '8px 0 2px', minWidth: 0 },
  pendingchip: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 6px 4px 4px', border: '1px solid #E2E6E2', borderRadius: 9, background: '#FBFCFA', fontSize: 'var(--fs-12)', color: '#3F4642', maxWidth: 280, minWidth: 0 },
  chipname: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontWeight: 500 },
  chipsize: { flexShrink: 0, color: '#7B817E', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-11)' },
  chipremove: { width: 20, height: 20, marginLeft: 2, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '50%', background: 'transparent', color: '#8A908C', cursor: 'pointer' },
  attimgbtn: { padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in', borderRadius: 8, lineHeight: 0 },
  attimgthumb: { width: 68, height: 68, objectFit: 'cover', borderRadius: 8, display: 'block', background: '#F1F4F1' },
  msgchip: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 9px 4px 4px', border: '1px solid #D8E2DC', borderRadius: 9, background: '#FFFFFF', fontSize: 'var(--fs-12)', color: '#3F4642', cursor: 'pointer', maxWidth: 250, minWidth: 0 },
  attacherrortext: { alignSelf: 'center', fontSize: 'var(--fs-12)', color: '#B3411B' },
  composerdrop: { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 2px rgba(23,107,91,.32), 0 2px 7px rgba(26,34,29,.06)' },
  previewback: { position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(18,21,19,.63)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  previewcard: { margin: 0, maxWidth: 'min(1100px, 92vw)', display: 'flex', flexDirection: 'column', gap: 10 },
  previewimg: { display: 'block', maxHeight: '76vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,.45)', background: '#141715' },
  previewcap: { display: 'flex', alignItems: 'center', gap: 10, color: '#ECEFEB', fontSize: 'var(--fs-12)', minWidth: 0 },
  previewname: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, minWidth: 0 },
  promptOn: { borderColor: 'var(--color-brand)', color: 'var(--color-brand)', background: 'var(--color-brand-subtle)', fontWeight: 600 },
  demotag: { fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid #E5E7EB', color: '#9CA3AF', marginLeft: 'auto', flexShrink: 0 },
};
