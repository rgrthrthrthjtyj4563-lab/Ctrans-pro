import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clipboard, Ellipsis, File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Menu, MessageSquarePlus, Paperclip, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { NavigateFn } from '../types';

type Intent = 'timed' | 'budget' | 'approval' | 'provider' | 'unknown';
type Phase = 'running' | 'awaiting' | 'done' | 'cancelled';
type Fields = { k: string; v: string }[];
interface Step { title: string; summary: string; sandbox?: boolean; rows: Fields; notes?: string[]; }
interface Query { title: string; conclusion: string; fields: Fields; anomalies?: string[]; range: string; period: string; action?: string; page?: 'analytics' | 'task-dispatch' | 'inspection'; }
interface Result { tone: 'success' | 'neutral'; title: string; fields: Fields; canUndo?: boolean; }
interface Message { id: string; role: 'user' | 'ai'; kind: 'text' | 'process' | 'query' | 'result'; text?: string; query?: Query; result?: Result; attachments?: Attachment[]; }
interface Attachment { id: string; name: string; size: number; mime: string; url: string; }

const PHARMA = '百益健康科技有限公司';
const PERIOD = '统计周期 2026-08-01 至 2026-08-26';
const RANGE = `数据范围：${PHARMA}（含下属服务商 / 工作组 / 服务专员）`;
const SHORTCUTS = [
  ['查询本月预算异常', '本月百益健康预算执行情况如何？'],
  ['分析审批积压原因', '为什么本周合规审批积压？'],
  ['查看服务商逾期任务', '华东区逾期任务最多的服务商是谁？'],
  ['配置限时拜访', '为百益健康开启限时拜访，每日 09:00 至 18:00 有效。'],
] as const;
const STEPS: Step[] = [
  { title: '已识别需求', summary: '启用限时拜访，每日 09:00–18:00，覆盖三类拜访。', rows: [{ k: '当前药厂', v: PHARMA }, { k: '操作类型', v: '启用业务开关' }, { k: '规则', v: '每日 09:00–18:00 限时拜访' }, { k: '覆盖业务', v: '医院拜访、商业拜访、药房拜访' }] },
  { title: '已读取当前配置', summary: '当前未启用，拜访可全天提交。', rows: [{ k: '当前状态', v: '限时拜访未启用' }, { k: '当前拜访记录', v: '1,286 条（演示库存）' }, { k: '当前可提交时段', v: '全天' }, { k: '规则作用范围', v: '百益健康下属全部服务商、工作组与服务专员' }] },
  { title: '沙箱模拟完成', summary: '非工作时段将阻止三类拜访的新建、编辑和提交。', sandbox: true, rows: [{ k: '模拟规则', v: '18:00–次日 09:00 阻止医院 / 商业 / 药房拜访的新建、编辑、提交' }, { k: '今日待提交记录', v: '37 条' }, { k: '近 7 日非工作时段提交', v: '64 条' }, { k: '涉及服务商', v: '4 家（智联科技、东方恒业、康晟云服、永泰汇通）' }], notes: ['沙箱模拟不会写入生产数据，不改变真实拜访记录。'] },
  { title: '风险检查完成', summary: '范围与时间规则有效，无跨药厂影响。', rows: [{ k: '范围校验', v: '有效 · 仅当前药厂' }, { k: '时间规则', v: '有效 · 每日 09:00–18:00' }, { k: '跨药厂影响', v: '无' }], notes: ['当前有 12 条待提交拜访记录；若启用时不在允许时段，这些记录将无法提交。', '该规则影响当前药厂下全部三类拜访业务，不影响其他药厂。'] },
  { title: '等待人工确认', summary: '校验已通过，确认后才会启用。', rows: [{ k: '待确认动作', v: '启用限时拜访' }, { k: '生效方式', v: '仅切换本页演示状态，不写真实业务库' }] },
];
const TODAY = ['新对话', '限时拜访规则配置'] as const;
const RECENT = ['本月预算执行分析', '合规审批积压分析', '华东区服务商逾期任务'] as const;
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

function intentOf(value: string): Intent { const t = value.replace(/\s/g, ''); if (t.includes('限时拜访') || (t.includes('09:00') && t.includes('18:00')) || t.includes('配置限时')) return 'timed'; if (t.includes('预算')) return 'budget'; if (t.includes('积压') || t.includes('审批')) return 'approval'; if (t.includes('服务商') || t.includes('完成率') || t.includes('逾期')) return 'provider'; return 'unknown'; }
function stamp() { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function queryFor(intent: Intent): Query | undefined {
  if (intent === 'budget') return { title: '本月预算执行', conclusion: '8 月预算执行偏慢，智联科技单月计划偏高、实际结算尚未跟上；整体无超支，但进度落后时间进度约 12 个百分点。', fields: [{ k: '月度预算合计', v: '￥148,000' }, { k: '已结算实际', v: '￥96,200' }, { k: '执行率', v: '65%（时间进度约 84%）' }, { k: '药厂', v: PHARMA }], anomalies: ['智联科技 8 月预算 ￥80,000，已结算 ￥36,000，进度明显落后。', '康晟云服 11–12 月未排预算，不影响本月，但四季度计划不完整。'], range: RANGE, period: PERIOD, action: '查看预算执行分析', page: 'analytics' };
  if (intent === 'approval') return { title: '本周合规审批积压', conclusion: '积压主要来自证据链 AI 存疑与代表备案待核验，集中在合规复审环节，不是任务创建量突增。', fields: [{ k: '待处理审批', v: '23 条' }, { k: '证据链 AI 存疑', v: '11 条' }, { k: '代表备案待核验', v: '7 条' }, { k: '超区域授权待核', v: '5 条' }, { k: '涉及环节', v: '证据链复审、医药代表备案' }, { k: '建议动作', v: '优先关闭 11 条存疑证据；对 7 条备案发起催核' }], range: RANGE, period: '统计周期 2026-08-20 至 2026-08-26', action: '打开随检 / 证据链工作台', page: 'inspection' };
  if (intent === 'provider') return { title: '服务商拜访完成率与逾期', conclusion: '华东口径下逾期任务最多的是东方恒业推广有限公司（9 条），完成率 74%；智联科技完成率更高但逾期 6 条。', fields: [{ k: '东方恒业推广有限公司', v: '完成率 74% · 逾期 9 条 · 奥美拉唑 / 氨氯地平' }, { k: '智联科技有限公司', v: '完成率 81% · 逾期 6 条 · 阿托伐他汀 / 二甲双胍' }, { k: '永泰汇通推广有限公司', v: '完成率 69% · 逾期 5 条 · 瑞舒伐他汀' }, { k: '康晟云服科技有限公司', v: '完成率 88% · 逾期 3 条 · 二甲双胍' }], range: '数据范围：华东演示口径（江苏 / 浙江 / 广东）· 百益健康下属服务商', period: PERIOD, action: '查看任务明细', page: 'task-dispatch' };
}
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_MQ).matches;
}

export function BaiyeeAI({ navigate }: { navigate: NavigateFn }) {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState(''), [enabled, setEnabled] = useState(false), [enabledAt, setEnabledAt] = useState<string | null>(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState<Phase>('done'), [revealed, setRevealed] = useState(0), [copied, setCopied] = useState<string | null>(null);
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

  const send = (raw: string, atts: Attachment[] = []) => { const text = raw.trim(); if ((!text && !atts.length) || busy) return; setInput(''); if (atts.length) setPending([]); push({ id: id(), role: 'user', kind: 'text', text, ...(atts.length ? { attachments: atts } : {}) }); const intent = intentOf(text); if (intent === 'timed') { if (enabled) { push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'neutral', title: '限时拜访当前已启用', fields: [{ k: '启用时间', v: enabledAt ?? '—' }, { k: '作用范围', v: `${PHARMA} · 医院 / 商业 / 药房拜访` }, { k: '规则摘要', v: '每日仅 09:00–18:00 允许创建、编辑或提交拜访记录' }], canUndo: true } }); return; } setPhase('running'); setRevealed(1); setBusy(true); push({ id: id(), role: 'ai', kind: 'process' }); return; } const query = queryFor(intent); if (query) push({ id: id(), role: 'ai', kind: 'query', query }); else { const ack = atts.length ? `已收到 ${atts.length} 个附件（${atts.slice(0, 3).map(a => a.name).join('、')}${atts.length > 3 ? ' 等' : ''}）。` : ''; push({ id: id(), role: 'ai', kind: 'text', text: `${ack}我可以查询预算执行、分析审批积压、查看服务商逾期任务，或配置限时拜访业务开关。请直接描述需要处理的业务范围或规则。` }); } };
  const confirm = () => { const at = stamp(); setEnabled(true); setEnabledAt(at); setPhase('done'); push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'success', title: '限时拜访已启用', fields: [{ k: '启用时间', v: at }, { k: '作用范围', v: `${PHARMA} 下属全部服务商、工作组、服务专员` }, { k: '规则摘要', v: '每日 09:00–18:00 允许医院 / 商业 / 药房拜访的创建、编辑与提交；其余时段业务端提示并禁止提交' }, { k: '模拟影响', v: '近 7 日 64 条非工作时段提交将被拦截；今日 37 条待提交记录在非允许时段无法提交' }], canUndo: true } }); };
  const cancel = () => { setPhase('cancelled'); push({ id: id(), role: 'ai', kind: 'text', text: '已取消。限时拜访仍为未启用，拜访记录可全天提交。' }); };
  const undo = () => { setEnabled(false); setEnabledAt(null); setPhase('done'); push({ id: id(), role: 'ai', kind: 'result', result: { tone: 'neutral', title: '已撤销本次变更', fields: [{ k: '当前状态', v: '限时拜访未启用' }, { k: '可提交时段', v: '全天' }, { k: '说明', v: '仅恢复本页演示状态，未改真实拜访数据' }] } }); };
  const newChat = () => { pending.forEach(a => revokeUrl(a.url)); setPending([]); setPreviewAtt(null); setMessages([]); setInput(''); setPhase('done'); setBusy(false); setRevealed(0); if (narrow) setRailOpen(false); window.setTimeout(() => inputRef.current?.focus(), 0); };
  const copy = (messageId: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(messageId); window.setTimeout(() => setCopied(null), 1200); };
  const goHome = () => navigate('dashboard');
  const showRail = !narrow || railOpen;

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
          <button type="button" className="baiyee-back-rail" aria-label="返回药合作系统" title="返回药合作系统" onClick={goHome} style={{ ...S.backRail, justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '0 10px' : 0 }}>
            <ArrowLeft size={16} />{expanded && '返回药合作系统'}
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
          <span className="baiyee-pharma" style={S.pharma}>{PHARMA}</span>
          <Icon label="更多操作" onClick={() => undefined}><Ellipsis size={18} /></Icon>
        </header>
        <div ref={list} style={S.scroll}>
          <div style={{ ...S.stream, paddingBottom: 28 }}>
            {empty
              ? <Welcome send={send} />
              : messages.map(m => <MessageView key={m.id} message={m} phase={phase} revealed={revealed} navigate={navigate} confirm={confirm} cancel={cancel} undo={undo} copied={copied === m.id} copy={copy} onPreview={setPreviewAtt} />)}
          </div>
        </div>
        <footer style={S.footer}>
          <Composer value={input} setValue={setInput} send={() => { send(input, pending); }} busy={busy} inputRef={inputRef} attachments={pending} onAddFiles={addFiles} onRemoveAttach={removePending} attachError={attachError} />
          <p style={S.disclaimer}>baiyee-AI可能会产生错误，请结合业务数据核实。所有配置操作均需人工确认。</p>
        </footer>
      </section>
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
        <button type="button" aria-label="发送消息" disabled={idle} onClick={send} style={{ ...S.send, background: idle ? '#C8CECA' : '#176B5B', cursor: idle ? 'not-allowed' : 'pointer' }}>
          <Send size={15} />
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept={ACCEPT} aria-hidden="true" tabIndex={-1} style={{ display: 'none' }} onChange={e => { onAddFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
    </div>
  );
}
function MessageView({ message, phase, revealed, navigate, confirm, cancel, undo, copied, copy, onPreview }: { message: Message; phase: Phase; revealed: number; navigate: NavigateFn; confirm: () => void; cancel: () => void; undo: () => void; copied: boolean; copy: (id: string, text: string) => void; onPreview: (att: Attachment) => void }) {
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
  return (
    <article style={S.airow}>
      <Brand />
      <div style={S.aibody}>
        <p style={S.ainame}>baiyee-AI</p>
        {message.kind === 'text' && <p style={S.aitext}>{message.text}</p>}
        {message.kind === 'process' && <Process phase={phase} revealed={revealed} confirm={confirm} cancel={cancel} />}
        {message.kind === 'query' && message.query && <QueryCard query={message.query} navigate={navigate} />}
        {message.kind === 'result' && message.result && <ResultCard result={message.result} undo={undo} />}
        <div style={S.actions}>
          <Icon label={copied ? '已复制' : '复制'} onClick={() => copy(message.id, raw)}>{copied ? <Check size={14} /> : <Clipboard size={14} />}</Icon>
          <Icon label="重新生成" onClick={() => undefined}><RotateCcw size={14} /></Icon>
          <Icon label="有帮助" onClick={() => undefined}><ThumbsUp size={14} /></Icon>
          <Icon label="无帮助" onClick={() => undefined}><ThumbsDown size={14} /></Icon>
        </div>
      </div>
    </article>
  );
}
function Process({ phase, revealed, confirm, cancel }: { phase: Phase; revealed: number; confirm: () => void; cancel: () => void }) {
  const [open, setOpen] = useState(false), done = phase !== 'running';
  return (
    <div>
      <button type="button" onClick={() => setOpen(v => !v)} style={S.processhead}>
        <span style={{ ...S.processmark, color: done ? '#176B5B' : '#A56B12', background: done ? '#E6F1EC' : '#FFF2D9' }}>{done ? <Check size={13} /> : <Sparkles size={12} />}</span>
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
        <b style={{ fontSize: 13 }}>{step.title}{running ? '…' : ''}</b>
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
      <b style={{ fontSize: 14 }}>限时拜访</b>
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

const SCOPED_CSS = `
.baiyee-ai-root { width: 100%; max-width: 100%; overflow: hidden; }
.baiyee-ai-root *, .baiyee-ai-root *::before, .baiyee-ai-root *::after { box-sizing: border-box; }
.baiyee-ai-root button:focus-visible,
.baiyee-ai-root textarea:focus-visible { outline: 2px solid #176B5B; outline-offset: 2px; }
.baiyee-ai-composer:focus-within { box-shadow: 0 0 0 2px #176B5B; }
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
  brand: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, whiteSpace: 'nowrap' },
  mark: { width: 23, height: 23, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: '#176B5B', color: '#fff', flexShrink: 0 },
  icon: { width: 32, height: 32, flexShrink: 0, marginLeft: 4, border: 0, borderRadius: 6, background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  new: { height: 38, gap: 9, display: 'flex', alignItems: 'center', borderRadius: 8, background: '#2A302D', border: '1px solid #363D39', color: '#F7F7F5', fontSize: 13, cursor: 'pointer' },
  backRail: { marginTop: 'auto', height: 38, gap: 8, display: 'flex', alignItems: 'center', borderRadius: 8, background: 'transparent', border: '1px solid #363D39', color: '#E9ECE9', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  history: { marginTop: 23, overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 },
  group: { margin: '0 0 6px', padding: '0 8px', color: '#7D8781', fontSize: 11 },
  historyitem: { display: 'block', border: 0, borderRadius: 6, width: '100%', padding: '8px 9px', marginBottom: 2, textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' },
  main: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F7F5' },
  top: { height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px 0 16px', borderBottom: '1px solid #E5E7E5', gap: 4, minWidth: 0, overflow: 'hidden' },
  title: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  sep: { width: 1, height: 16, margin: '0 10px', background: '#E5E7E5', flexShrink: 0 },
  assistant: { fontSize: 12, color: '#6B706D', whiteSpace: 'nowrap' },
  spacer: { flex: 1, minWidth: 8 },
  pharma: { padding: '4px 9px', borderRadius: 999, border: '1px solid #E5E7E5', background: '#fff', color: '#535956', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '42%' },
  scroll: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' },
  stream: { maxWidth: 800, width: '100%', minHeight: '100%', margin: '0 auto', padding: '28px 16px' },
  footer: { flexShrink: 0, width: '100%', maxWidth: '100%', padding: '12px 16px 14px', background: '#F7F7F5' },
  shortcuts: { maxWidth: 800, margin: '0 auto 10px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  prompt: { padding: '6px 10px', border: '1px solid #E5E7E5', borderRadius: 8, background: '#fff', color: '#6B706D', fontSize: 12, lineHeight: 1.4, cursor: 'pointer' },
  disclaimer: { maxWidth: 800, margin: '8px auto 0', textAlign: 'center', color: '#7B817E', fontSize: 11 },
  welcome: { minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '4vh', paddingBottom: '8vh' },
  welcomeinner: { width: '100%', maxWidth: 800, margin: '0 auto' },
  h1: { margin: '0 0 10px', textAlign: 'center', fontSize: 'clamp(26px, 4vw, 34px)', lineHeight: 1.25, letterSpacing: '-.03em', fontWeight: 650, color: '#242725' },
  lead: { maxWidth: 580, margin: '0 auto 26px', textAlign: 'center', color: '#6B706D', fontSize: 15, lineHeight: 1.65 },
  composer: { maxWidth: 800, width: '100%', margin: '0 auto', padding: '11px 12px 10px', border: '1px solid #E5E7E5', borderRadius: 14, background: '#FFFFFF', boxShadow: '0 2px 7px rgba(26,34,29,.06)' },
  textarea: { display: 'block', width: '100%', minHeight: 44, border: 0, outline: 0, resize: 'none', background: 'transparent', color: '#242725', font: '14px var(--font-sans)', lineHeight: 1.6 },
  composerbar: { display: 'flex', alignItems: 'center', marginTop: 6, minWidth: 0 },
  send: { marginLeft: 'auto', width: 31, height: 31, border: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },
  userrow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 24 },
  userbubble: { maxWidth: '78%', padding: '10px 13px', borderRadius: '13px 13px 3px 13px', background: '#E7F0EC', color: '#28332E', fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word' },
  airow: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 28, minWidth: 0 },
  aibody: { minWidth: 0, flex: 1, paddingTop: 1 },
  ainame: { margin: '0 0 7px', color: '#535A56', fontSize: 12, fontWeight: 600 },
  aitext: { margin: '0 0 11px', color: '#3F4642', fontSize: 13, lineHeight: 1.7, wordBreak: 'break-word' },
  actions: { display: 'flex', alignItems: 'center', marginTop: 9, gap: 2 },
  processhead: { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#242725', minWidth: 0 },
  processmark: { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 },
  processsummary: { flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#6B706D', fontSize: 12, minWidth: 0 },
  step: { padding: '11px 0', borderBottom: '1px solid #EDF0ED' },
  stepline: { display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: 0, border: 0, background: 'transparent', color: '#242725', textAlign: 'left', cursor: 'pointer', minWidth: 0 },
  check: { display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', color: '#176B5B', background: '#E6F1EC' },
  sandbox: { padding: '2px 5px', border: '1px solid #F3DCB6', borderRadius: 4, background: '#FFF2D9', color: '#986016', fontSize: 11, whiteSpace: 'nowrap' },
  stepsummary: { flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#6B706D', fontSize: 12, minWidth: 0 },
  stepdetails: { margin: '10px 0 0 27px', padding: '9px 11px', borderRadius: 6, background: '#FBFCFA', minWidth: 0 },
  detailrow: { display: 'flex', gap: 12, padding: '4px 0', fontSize: 12, lineHeight: 1.55, minWidth: 0 },
  detailk: { color: '#6B706D', flexShrink: 0, minWidth: 72 },
  detailv: { minWidth: 0, flex: 1, wordBreak: 'break-word', color: '#242725' },
  note: { margin: '8px 0 0', padding: '7px 9px', borderLeft: '2px solid #E7BD79', background: '#FFF8EA', color: '#875C21', fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word' },
  confirm: { marginTop: 15, padding: '13px 14px', border: '1px solid #DDE5DF', borderRadius: 9, background: '#fff' },
  confirmactions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 13, flexWrap: 'wrap' },
  cancel: { height: 30, padding: '0 12px', border: '1px solid #DCE0DD', borderRadius: 6, background: '#fff', color: '#4F5652', fontSize: 12, cursor: 'pointer' },
  confirmbutton: { height: 30, padding: '0 12px', border: 0, borderRadius: 6, background: '#176B5B', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelled: { margin: '11px 0 0', color: '#6B706D', fontSize: 13 },
  card: { padding: '14px 15px', border: '1px solid #E5E7E5', borderRadius: 9, background: '#FFFFFF', color: '#242725', minWidth: 0 },
  source: { margin: '10px 0 0', color: '#737975', fontSize: 11, lineHeight: 1.6, wordBreak: 'break-word' },
  outline: { marginTop: 12, padding: '6px 9px', border: '1px solid #C9D9D2', borderRadius: 6, background: '#fff', color: '#176B5B', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  undo: { marginTop: 12, padding: 0, border: 0, background: 'transparent', color: '#4E655C', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' },
  usertext: { whiteSpace: 'pre-wrap' },
  bubbleatts: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end', minWidth: 0 },
  chipsrow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '8px 0 2px', minWidth: 0 },
  pendingchip: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 6px 4px 4px', border: '1px solid #E2E6E2', borderRadius: 9, background: '#FBFCFA', fontSize: 12, color: '#3F4642', maxWidth: 280, minWidth: 0 },
  chipname: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontWeight: 500 },
  chipsize: { flexShrink: 0, color: '#7B817E', fontFamily: 'var(--font-mono)', fontSize: 11 },
  chipremove: { width: 20, height: 20, marginLeft: 2, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '50%', background: 'transparent', color: '#8A908C', cursor: 'pointer' },
  attimgbtn: { padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in', borderRadius: 8, lineHeight: 0 },
  attimgthumb: { width: 68, height: 68, objectFit: 'cover', borderRadius: 8, display: 'block', background: '#F1F4F1' },
  msgchip: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 9px 4px 4px', border: '1px solid #D8E2DC', borderRadius: 9, background: '#FFFFFF', fontSize: 12, color: '#3F4642', cursor: 'pointer', maxWidth: 250, minWidth: 0 },
  attacherrortext: { alignSelf: 'center', fontSize: 12, color: '#B3411B' },
  composerdrop: { borderColor: '#176B5B', boxShadow: '0 0 0 2px rgba(23,107,91,.32), 0 2px 7px rgba(26,34,29,.06)' },
  previewback: { position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(18,21,19,.63)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  previewcard: { margin: 0, maxWidth: 'min(1100px, 92vw)', display: 'flex', flexDirection: 'column', gap: 10 },
  previewimg: { display: 'block', maxHeight: '76vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,.45)', background: '#141715' },
  previewcap: { display: 'flex', alignItems: 'center', gap: 10, color: '#ECEFEB', fontSize: 12, minWidth: 0 },
  previewname: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, minWidth: 0 },
};
