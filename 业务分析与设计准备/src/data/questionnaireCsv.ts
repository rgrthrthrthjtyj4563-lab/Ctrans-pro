// ===== 问卷题目 CSV 导入（2026-11-10 从交互原型移植，行为与其一致）=====
// 模板：表头「题目,题型,选项」；题型 ∈ 单选/多选/填空；选项以中英文分号分隔，非填空至少两项。
// 解析支持引号包裹与 "" 转义、CRLF/CR 换行、UTF-8 BOM；错误带行号（数据行从第 2 行计）。
import type { QuestionItem, QuestionKind } from './questionnaireStore';

const KINDS: QuestionKind[] = ['单选', '多选', '填空'];

export function buildCsvTemplate(): string {
  return '题目,题型,选项\r\n您是否了解该品种？,单选,了解；不了解\r\n您从哪些渠道了解信息？,多选,医生；药店；网络\r\n您有哪些建议？,填空,\r\n';
}

/** RFC4180 风格解析：忽略全空行；引号未闭合视为错误 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') { cell += '"'; i++; } else quote = !quote;
    } else if (c === ',' && !quote) {
      row.push(cell); cell = '';
    } else if ((c === '\n' || c === '\r') && !quote) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (quote) throw new Error('CSV 引号未闭合');
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** 校验并转为题目列表；任何一行不合法即抛错（带行号），保持整批原子性 */
export function parseQuestionnaireCsv(text: string): QuestionItem[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (rows[0]?.slice(0, 3).join(',') !== '题目,题型,选项') throw new Error('请使用提供的 CSV 模板（题目、题型、选项）');
  const imported: QuestionItem[] = [];
  rows.slice(1).forEach((r, i) => {
    const [title, kindRaw, optionsRaw = ''] = r.map((v) => v.trim());
    const kind = kindRaw as QuestionKind;
    if (!title || !KINDS.includes(kind)) throw new Error('第 ' + (i + 2) + ' 行题目或题型无效');
    if (kind !== '填空' && optionsRaw.split(/[；;]/).filter(Boolean).length < 2) {
      throw new Error('第 ' + (i + 2) + ' 行至少需要两个选项，以分号分隔');
    }
    imported.push(kind === '填空'
      ? { title, kind }
      : { title, kind, options: optionsRaw.split(/[；;]/).map((s) => s.trim()).filter(Boolean) });
  });
  if (!imported.length) throw new Error('文件中没有题目');
  return imported;
}

/** 浏览器侧：下载模板（带 BOM，Excel 可直接打开） */
export function downloadCsvTemplate(): void {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + buildCsvTemplate()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '问卷题目导入模板.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 浏览器侧：读取文件并解析（≤1MB），成功返回题目列表，失败抛带文案的错误 */
export async function readQuestionnaireCsvFile(file: File): Promise<QuestionItem[]> {
  if (file.size > 1024 * 1024) throw new Error('文件不能超过 1 MB');
  return parseQuestionnaireCsv(await file.text());
}
