import { describe, expect, it } from 'vitest';
import { buildCsvTemplate, parseCsvRows, parseQuestionnaireCsv } from './questionnaireCsv';

describe('问卷题目 CSV', () => {
  it('模板：带表头与三行示例', () => {
    const rows = parseCsvRows(buildCsvTemplate());
    expect(rows[0].slice(0, 3).join(',')).toBe('题目,题型,选项');
    expect(rows.length).toBe(4);
  });

  it('支持 BOM、CRLF/CR、引号包裹与 "" 转义', () => {
    const text = '\uFEFF题目,题型,选项\r\n"含,逗号的题目","单选","甲；乙"\r\n"含""引号""的题目",填空,\r';
    const qs = parseQuestionnaireCsv(text);
    expect(qs[0]).toEqual({ title: '含,逗号的题目', kind: '单选', options: ['甲', '乙'] });
    expect(qs[1]).toEqual({ title: '含"引号"的题目', kind: '填空' });
  });

  it('表头不匹配报错', () => {
    expect(() => parseQuestionnaireCsv('题目,题型\nx,单选')).toThrow('请使用提供的 CSV 模板');
  });

  it('题目/题型无效带行号（数据行从第 2 行计）', () => {
    expect(() => parseQuestionnaireCsv('题目,题型,选项\r\nok,单选,甲；乙\r\n,单选,甲；乙\r\n'))
      .toThrow('第 3 行题目或题型无效');
    expect(() => parseQuestionnaireCsv('题目,题型,选项\r\nok,单选,甲；乙\r\n标题,排序,甲；乙\r\n'))
      .toThrow('第 3 行题目或题型无效');
  });

  it('非填空至少两个选项，中英文分号均可分隔', () => {
    expect(() => parseQuestionnaireCsv('题目,题型,选项\r\nx,单选,只有一个\r\n')).toThrow('第 2 行至少需要两个选项');
    const qs = parseQuestionnaireCsv('题目,题型,选项\r\nx,多选,甲;乙;丙\r\n');
    expect(qs[0].options).toEqual(['甲', '乙', '丙']);
  });

  it('空文件（只有表头）报「文件中没有题目」', () => {
    expect(() => parseQuestionnaireCsv('题目,题型,选项\r\n')).toThrow('文件中没有题目');
  });

  it('引号未闭合报错', () => {
    expect(() => parseCsvRows('题目,题型,选项\r\n"未闭合,单选,甲\r\n')).toThrow('CSV 引号未闭合');
  });
});
