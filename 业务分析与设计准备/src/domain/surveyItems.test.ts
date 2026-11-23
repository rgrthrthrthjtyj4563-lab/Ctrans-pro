import { beforeEach, describe, expect, it } from 'vitest';
import { bindQuestionnaire, questionnaireTaskSnapshot, resetQuestionnaireStore } from '../data/questionnaireStore';

beforeEach(() => {
  resetQuestionnaireStore();
});

// 「问卷类别异价派生 deriveSurveyItems」已随 2026-11-20 迭代移除：
// 报告侧「调研问卷与分析服务」改为按价目项目（问卷样本量 / 分析总结）计价，
// 推广侧「调查问卷」走市场推广价目，下游拆包时再选问卷类型。

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
