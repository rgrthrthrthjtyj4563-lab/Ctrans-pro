import { beforeEach, describe, expect, it } from 'vitest';
import { deriveSurveyItems } from './batchAdjust';
import { bindQuestionnaire, questionnaireTaskSnapshot, resetQuestionnaireStore } from '../data/questionnaireStore';

beforeEach(() => {
  resetQuestionnaireStore();
});

describe('问卷类别异价派生 deriveSurveyItems', () => {
  it('类别预算在品种间均摊，数量 = floor(自身金额 ÷ 自身单价)', () => {
    const items = deriveSurveyItems(10000, [
      { variety: '希刻劳', unitPrice: 1120 },
      { variety: '泰诺林', unitPrice: 1008 },
    ]);
    expect(items.map((x) => x.name)).toEqual(['希刻劳', '泰诺林']);
    expect(items[0].initialAmount).toBe(5000);
    expect(items[1].initialAmount).toBe(5000);
    expect(items[0].initialQty).toBe(4); // floor(5000 / 1120)
    expect(items[1].initialQty).toBe(4); // floor(5000 / 1008)
    expect(items.every((x) => !x.adjusted)).toBe(true);
  });

  it('金额不因取整反写：金额不足以整份时数量为 0、金额保留', () => {
    const items = deriveSurveyItems(1000, [{ variety: '希刻劳', unitPrice: 1120 }]);
    expect(items[0].initialQty).toBe(0);
    expect(items[0].initialAmount).toBe(1000);
  });

  it('三个品种按分精确均摊（合计＝基准）', () => {
    const items = deriveSurveyItems(100, [
      { variety: 'A', unitPrice: 10 },
      { variety: 'B', unitPrice: 20 },
      { variety: 'C', unitPrice: 30 },
    ]);
    const total = items.reduce((s, x) => s + x.initialAmount, 0);
    expect(Math.round(total * 100)).toBe(10000);
  });
});

describe('问卷计价快照 questionnaireTaskSnapshot', () => {
  it('锁定最新题目版本与公私单价；unitPrice 以创建流程传入值为准', () => {
    bindQuestionnaire('QX-2026-0001', { 希刻劳: 'surveyStd' });
    const snap = questionnaireTaskSnapshot('QX-2026-0001', '希刻劳', 1120);
    expect(snap).not.toBeNull();
    expect(snap!.code).toBe('QX-2026-0001');
    expect(snap!.schemeName).toBe('问卷调研');
    expect(snap!.version).toBe(2); // 最新版本
    expect(snap!.questions.length).toBe(4);
    expect(snap!.prices.pub).toBe(1120); // 创建流程解析的对公价（权威值）
    expect(snap!.prices.priv).not.toBeNull();
  });

  it('快照题目是深拷贝，改快照不影响 store', () => {
    bindQuestionnaire('QX-2026-0001', { 希刻劳: 'surveyStd' });
    const snap = questionnaireTaskSnapshot('QX-2026-0001', '希刻劳', 1120)!;
    snap.questions[0].title = '被篡改';
    expect(questionnaireTaskSnapshot('QX-2026-0001', '希刻劳', 1120)!.questions[0].title).not.toBe('被篡改');
  });

  it('归属缺失 / 品种不在范围 / 问卷不存在 → null', () => {
    expect(questionnaireTaskSnapshot('QX-2026-0001', '泰诺林', 1120)).toBeNull(); // 品种不在范围
    expect(questionnaireTaskSnapshot('QX-9999', '希刻劳', 1120)).toBeNull();
  });
});
