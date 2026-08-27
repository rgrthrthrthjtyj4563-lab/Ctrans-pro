import { useMemo, useState } from 'react';
import { Copy, Percent, Table2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { formatCNY, useTaskData } from '../context/TaskDataContext';
import type { PriceItem, PriceRatio, ReportPrice, Role, UnitPriceAdjustRule, Variety } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 8px',
  fontSize: 13,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
};

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 13, color: '#1F2937', borderBottom: '1px solid #F3F4F6',
};

export function PriceConfig({ addToast, currentRole }: Props) {
  const {
    varieties, priceBooks, priceItems, priceRatios, reportPrices, unitPriceAdjustRule,
    savePriceItems, savePriceRatios, saveReportPrices, copyPriceList,
    bindVarietyPriceBook, saveUnitPriceAdjustRule,
  } = useTaskData();
  const canWrite = currentRole === '药厂销售部门';

  const [priceTarget, setPriceTarget] = useState<Variety | null>(null);
  const [ratioTarget, setRatioTarget] = useState<Variety | null>(null);
  const [reportTarget, setReportTarget] = useState<Variety | null>(null);
  const [copyTarget, setCopyTarget] = useState<Variety | null>(null);
  const [draftItems, setDraftItems] = useState<PriceItem[]>([]);
  const [draftRatios, setDraftRatios] = useState<PriceRatio[]>([]);
  const [draftReports, setDraftReports] = useState<ReportPrice[]>([]);
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ruleDraft, setRuleDraft] = useState<UnitPriceAdjustRule>(unitPriceAdjustRule);

  const ratioSum = draftRatios.reduce((s, r) => s + Number(r.ratio || 0), 0);
  const reportSum = draftReports.reduce((s, r) => s + Number(r.ratio || 0), 0);

  function itemsOfBook(bookId: string) {
    return priceItems.filter((p) => p.priceBookId === bookId);
  }
  function ratiosOfBook(bookId: string) {
    return priceRatios.filter((p) => p.priceBookId === bookId);
  }
  function reportsOfBook(bookId: string) {
    return reportPrices.filter((p) => p.priceBookId === bookId);
  }

  function openPrice(v: Variety) {
    setPriceTarget(v);
    setDraftItems(itemsOfBook(v.activePriceBookId).map((p) => ({ ...p })));
    setError('');
  }

  function openRatio(v: Variety) {
    setRatioTarget(v);
    setDraftRatios(ratiosOfBook(v.activePriceBookId).map((p) => ({ ...p })));
    setError('');
  }

  function openReport(v: Variety) {
    setReportTarget(v);
    setDraftReports(reportsOfBook(v.activePriceBookId).map((p) => ({ ...p })));
    setError('');
  }

  function saveItems() {
    if (!priceTarget) return;
    savePriceItems(priceTarget.id, draftItems);
    addToast({ type: 'success', title: '工作量价目表已保存', description: priceTarget.tradeName });
    setPriceTarget(null);
  }

  function saveRatios() {
    if (!ratioTarget) return;
    const result = savePriceRatios(ratioTarget.id, draftRatios);
    if (!result.ok) {
      setError(result.error || '保存失败');
      return;
    }
    addToast({ type: 'success', title: '工作量比例表已保存', description: ratioTarget.tradeName });
    setRatioTarget(null);
  }

  function saveReports() {
    if (!reportTarget) return;
    const result = saveReportPrices(reportTarget.id, draftReports);
    if (!result.ok) {
      setError(result.error || '保存失败');
      return;
    }
    addToast({ type: 'success', title: '报告价目表已保存', description: reportTarget.tradeName });
    setReportTarget(null);
  }

  function doCopy() {
    if (!copyTarget) return;
    const result = copyPriceList(copyTarget.id, copyTo);
    if (!result.ok) {
      setError(result.error || '复制失败');
      return;
    }
    addToast({ type: 'success', title: '价目表已复制', description: `从 ${copyTarget.tradeName} 复制到 ${copyTo.length} 个品种` });
    setCopyTarget(null);
    setCopyTo([]);
  }

  const billingOf = useMemo(() => {
    const map: Record<string, string> = {};
    varieties.forEach((v) => {
      const book = priceBooks.find((b) => b.id === v.activePriceBookId);
      map[v.id] = book ? `${book.name} ${book.version}（${book.status}）` : '未绑定价目表';
    });
    return map;
  }, [varieties, priceBooks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="价目配置"
        description="标准价目表通过 ID 绑定到品种。同一价目表的品种可同单发包；后续改价不影响既有任务快照。比例合计必须 100%。"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 10 }}>全局单价调整规则</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 120px 120px 140px 1fr auto', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ruleDraft.enabled} onChange={(e) => setRuleDraft({ ...ruleDraft, enabled: e.target.checked })} disabled={!canWrite} />
              启用
            </label>
            <input type="number" step="0.05" value={ruleDraft.minAdjustRatio} onChange={(e) => setRuleDraft({ ...ruleDraft, minAdjustRatio: Number(e.target.value) })} style={inputStyle} disabled={!canWrite} />
            <input type="number" step="0.05" value={ruleDraft.maxAdjustRatio} onChange={(e) => setRuleDraft({ ...ruleDraft, maxAdjustRatio: Number(e.target.value) })} style={inputStyle} disabled={!canWrite} />
            <select value={ruleDraft.roundingMode} onChange={(e) => setRuleDraft({ ...ruleDraft, roundingMode: e.target.value as UnitPriceAdjustRule['roundingMode'] })} style={inputStyle} disabled={!canWrite}>
              <option value="nearest">最近可选档位</option>
            </select>
            <input value={ruleDraft.hint} onChange={(e) => setRuleDraft({ ...ruleDraft, hint: e.target.value })} style={inputStyle} disabled={!canWrite} />
            {canWrite && (
              <Button variant="primary" size="sm" onClick={() => {
                const r = saveUnitPriceAdjustRule(ruleDraft);
                if (!r.ok) addToast({ type: 'error', title: '保存失败', description: r.error });
                else addToast({ type: 'success', title: '单价调整规则已保存', description: `默认范围 ${(ruleDraft.minAdjustRatio * 100).toFixed(0)}% ~ ${(ruleDraft.maxAdjustRatio * 100).toFixed(0)}%` });
              }}>保存规则</Button>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 8 }}>最小/最大调整比例相对建议单价，默认 ±30%。取整后须 Toast 告知调整前后金额、数量与原因。</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['序号', '通用名', '商品名', '批准文号', '包装', '规格', '单位', '持有人', '标准价目表', '操作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {varieties.map((v, i) => (
                <tr key={v.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{v.genericName}</td>
                  <td style={td}>{v.tradeName}</td>
                  <td style={td}>{v.approvalNo}</td>
                  <td style={td}>{v.package}</td>
                  <td style={td}>{v.spec}</td>
                  <td style={td}>{v.unit}</td>
                  <td style={td}>{v.holder}</td>
                  <td style={td}>{billingOf[v.id]}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={v.activePriceBookId}
                        disabled={!canWrite}
                        onChange={(e) => {
                          const r = bindVarietyPriceBook(v.id, e.target.value);
                          if (!r.ok) addToast({ type: 'error', title: '绑定失败', description: r.error });
                          else addToast({ type: 'success', title: '已绑定价目表', description: v.tradeName });
                        }}
                        style={{ ...inputStyle, width: 180, height: 28 }}
                      >
                        <option value="">未绑定</option>
                        {priceBooks.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} {b.version}（{b.status}）</option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm" icon={<Table2 size={13} />} onClick={() => openPrice(v)} disabled={!canWrite || !v.activePriceBookId}>设置工作量价目表</Button>
                      <Button variant="ghost" size="sm" icon={<Percent size={13} />} onClick={() => openRatio(v)} disabled={!canWrite}>设置工作量比例表</Button>
                      <Button variant="ghost" size="sm" onClick={() => openReport(v)} disabled={!canWrite}>报告价目表</Button>
                      <Button variant="ghost" size="sm" icon={<Copy size={13} />} onClick={() => { setCopyTarget(v); setCopyTo([]); setError(''); }} disabled={!canWrite}>批量复制价目表</Button>
                      <Button variant="ghost" size="sm" disabled title="本期预留，不做城市区域价">设置城市级别</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!priceTarget}
        title={`设置工作量价目表 · ${priceTarget?.tradeName ?? ''}`}
        onClose={() => setPriceTarget(null)}
        width={860}
        footer={
          <>
            <Button variant="outline" onClick={() => setPriceTarget(null)}>取消</Button>
            <Button variant="primary" onClick={saveItems}>保存</Button>
          </>
        }
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['价目类别', '类别', '金额（￥）', '单位', '是否发包金额', '是否预设值'].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {draftItems.map((it, idx) => (
              <tr key={it.id}>
                <td style={td}><input value={it.category} onChange={(e) => setDraftItems(patch(draftItems, idx, { category: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input value={it.name} onChange={(e) => setDraftItems(patch(draftItems, idx, { name: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input type="number" value={it.amount} onChange={(e) => setDraftItems(patch(draftItems, idx, { amount: Number(e.target.value) || 0 }))} style={inputStyle} /></td>
                <td style={td}><input value={it.unit} onChange={(e) => setDraftItems(patch(draftItems, idx, { unit: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input type="checkbox" checked={it.isContractAmount} onChange={(e) => setDraftItems(patch(draftItems, idx, { isContractAmount: e.target.checked }))} /></td>
                <td style={td}><input type="checkbox" checked={it.isPreset} onChange={(e) => setDraftItems(patch(draftItems, idx, { isPreset: e.target.checked }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 10 }}>
          金额展示示例：医院拜访 {formatCNY(200)}/次，科室会议 {formatCNY(2000)}/场。区域价、对私金额、人数限制本期预留。
        </div>
      </Modal>

      <Modal
        open={!!ratioTarget}
        title={`设置工作量比例表 · ${ratioTarget?.tradeName ?? ''}`}
        onClose={() => setRatioTarget(null)}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setRatioTarget(null)}>取消</Button>
            <Button variant="primary" onClick={saveRatios} disabled={ratioSum !== 100}>保存</Button>
          </>
        }
      >
        {error && <div style={{ color: '#C73A3A', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={th}>业务类型</th><th style={th}>比例（%）</th></tr>
          </thead>
          <tbody>
            {draftRatios.map((r, idx) => (
              <tr key={r.id}>
                <td style={td}>{r.name}</td>
                <td style={td}>
                  <input
                    type="number"
                    value={r.ratio}
                    onChange={(e) => setDraftRatios(patch(draftRatios, idx, { ratio: Number(e.target.value) || 0 }))}
                    style={inputStyle}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 13, color: ratioSum === 100 ? '#176B5B' : '#C73A3A' }}>
          合计 {ratioSum}% {ratioSum === 100 ? '（可保存）' : '（必须为 100% 才能保存）'}
        </div>
      </Modal>

      <Modal
        open={!!reportTarget}
        title={`品种报告价目表 · ${reportTarget?.tradeName ?? ''}`}
        onClose={() => setReportTarget(null)}
        width={560}
        footer={
          <>
            <Button variant="outline" onClick={() => setReportTarget(null)}>取消</Button>
            <Button variant="primary" onClick={saveReports} disabled={reportSum !== 100}>保存</Button>
          </>
        }
      >
        {error && <div style={{ color: '#C73A3A', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={th}>价目类别</th><th style={th}>服务项目</th><th style={th}>价目（￥）</th><th style={th}>单位</th><th style={th}>比例（%）</th></tr>
          </thead>
          <tbody>
            {draftReports.map((r, idx) => (
              <tr key={r.id}>
                <td style={td}><input value={r.reportType} onChange={(e) => setDraftReports(patch(draftReports, idx, { reportType: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input value={r.name} onChange={(e) => setDraftReports(patch(draftReports, idx, { name: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input type="number" value={r.amount} onChange={(e) => setDraftReports(patch(draftReports, idx, { amount: Number(e.target.value) || 0 }))} style={inputStyle} /></td>
                <td style={td}><input value={r.unit} onChange={(e) => setDraftReports(patch(draftReports, idx, { unit: e.target.value }))} style={inputStyle} /></td>
                <td style={td}><input type="number" value={r.ratio} onChange={(e) => setDraftReports(patch(draftReports, idx, { ratio: Number(e.target.value) || 0 }))} style={inputStyle} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 13, color: reportSum === 100 ? '#176B5B' : '#C73A3A' }}>
          报告比例合计 {reportSum}% {reportSum === 100 ? '（可保存）' : '（必须为 100% 才能保存）'}；价目类别 = 分析报告服务 / 问卷调研与分析服务。
        </div>
      </Modal>

      <Modal
        open={!!copyTarget}
        title={`批量复制价目表 · 源 ${copyTarget?.tradeName ?? ''}`}
        onClose={() => setCopyTarget(null)}
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyTarget(null)}>取消</Button>
            <Button variant="primary" onClick={doCopy}>确认复制</Button>
          </>
        }
      >
        {error && <div style={{ color: '#C73A3A', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ fontSize: 13, color: '#667085', marginBottom: 10 }}>选择目标品种（将绑定到与源品种相同的标准价目表 ID，而不是复制明细来“看起来一样”）</div>
        {varieties.filter((v) => v.id !== copyTarget?.id).map((v) => (
          <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={copyTo.includes(v.id)}
              onChange={(e) => setCopyTo((prev) => e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id))}
            />
            {v.tradeName}
          </label>
        ))}
      </Modal>
    </div>
  );
}

function patch<T>(list: T[], idx: number, part: Partial<T>): T[] {
  return list.map((item, i) => (i === idx ? { ...item, ...part } : item));
}
