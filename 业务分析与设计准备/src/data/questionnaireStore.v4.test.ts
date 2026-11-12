import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindQuestionnaire, listQuestionnaires, migrateV3, questionnairesOfScheme,
  registerScheme, renameScheme, resetQuestionnaireStore, saveQuestionnaire,
  schemeOf, surveySchemes, unlinkService,
} from './questionnaireStore';

const V4_KEY = 'baiyee-questionnaire-store-v4';
const V3_KEY = 'baiyee-questionnaire-store-v3';

const seedQ = { code: 'QX-2026-0001', name: 'A', type: '通用', audience: '医生' as const, status: '启用' as const, taskRefs: 0, versions: [] };
const seedQ2 = { code: 'QX-2026-0002', name: 'B', type: '通用', audience: '患者' as const, status: '启用' as const, taskRefs: 0, versions: [] };

beforeEach(() => {
  window.localStorage.removeItem(V4_KEY);
  window.localStorage.removeItem(V3_KEY);
  resetQuestionnaireStore();
});

describe('v3 → v4 迁移', () => {
  it('全品种问卷展开为显式清单，归属 = 例外 > 默认', () => {
    const next = migrateV3(
      {
        version: 3,
        questionnaires: [
          { ...seedQ, varieties: [] },                              // 全品种 → 展开
          { ...seedQ2, varieties: [] },                             // 例外指向 surveyUrgent
        ],
        link: { defaults: { 问卷调查: 'surveyStd' }, exceptions: { 'QX-2026-0002': 'surveyUrgent' } },
        schemes: { surveyStd: { name: '问卷调研', group: '问卷调查' }, surveyUrgent: { name: '加急', group: '问卷调查' } },
      },
      ['希刻劳', '泰诺林', '双黄连', '格华止'],
    );
    expect(Object.keys(next.questionnaires[0].pricing)).toEqual(['希刻劳', '泰诺林', '双黄连', '格华止']);
    expect(Object.values(next.questionnaires[0].pricing)).toEqual(['surveyStd', 'surveyStd', 'surveyStd', 'surveyStd']);
    expect(Object.values(next.questionnaires[1].pricing)).toEqual(['surveyUrgent', 'surveyUrgent', 'surveyUrgent', 'surveyUrgent']);
  });

  it('指定品种问卷保持清单；无默认无例外 → null 待补齐；指向已删方案 → null', () => {
    const next = migrateV3(
      {
        version: 3,
        questionnaires: [
          { ...seedQ, varieties: ['希刻劳'] },
          { ...seedQ2, varieties: ['希刻劳'] },
        ],
        link: { defaults: {}, exceptions: { 'QX-2026-0002': 'ghost' } },
        schemes: {},
      },
      ['希刻劳', '泰诺林'],
    );
    expect(next.questionnaires[0].pricing).toEqual({ 希刻劳: null });
    expect(next.questionnaires[1].pricing).toEqual({ 希刻劳: null });
  });

  it('localStorage 无 v4 有 v3 时，模块加载即完成迁移并落 v4 键', async () => {
    window.localStorage.setItem(V3_KEY, JSON.stringify({
      version: 3,
      questionnaires: [{ ...seedQ, varieties: ['泰诺林'] }],
      link: { defaults: { 问卷调查: 'surveyStd' }, exceptions: {} },
      schemes: { surveyStd: { name: '问卷调研', group: '问卷调查' } },
    }));
    window.localStorage.removeItem(V4_KEY); // beforeEach 的 reset 已 persist 种子到 v4，须清掉才会走迁移
    vi.resetModules();
    const store = await import('./questionnaireStore');
    const q = store.listQuestionnaires().find((x) => x.code === seedQ.code);
    expect(q?.pricing).toEqual({ 泰诺林: 'surveyStd' });
    expect(window.localStorage.getItem(V4_KEY)).toBeTruthy();
  });
});

describe('按品种归属 API', () => {
  it('schemeOf：undefined=品种不在范围，null=待补齐，string=方案', () => {
    bindQuestionnaire(seedQ.code, { 希刻劳: 'surveyStd', 泰诺林: null });
    expect(schemeOf(seedQ.code, '希刻劳')).toBe('surveyStd');
    expect(schemeOf(seedQ.code, '泰诺林')).toBeNull();
    expect(schemeOf(seedQ.code, '双黄连')).toBeUndefined();
    expect(schemeOf('QX-9999', '希刻劳')).toBeUndefined();
  });

  it('创建时写入 pricing；bindQuestionnaire 整表替换', () => {
    const created = saveQuestionnaire({
      code: 'QX-2026-0099', name: '新问卷', type: '通用', audience: '医生', status: '启用',
      pricing: { 希刻劳: 'surveyUrgent' }, versions: [],
    });
    expect(created.taskRefs).toBe(0);
    bindQuestionnaire('QX-2026-0099', { 希刻劳: 'surveyStd', 格华止: 'surveyStd' });
    expect(schemeOf('QX-2026-0099', '格华止')).toBe('surveyStd');
  });

  it('unlinkService：清登记并把指向它的归属置 null（待补齐）', () => {
    registerScheme('user-x', '自建方案', '问卷调查');
    bindQuestionnaire(seedQ.code, { 希刻劳: 'user-x', 泰诺林: 'surveyStd' });
    unlinkService('user-x');
    expect(schemeOf(seedQ.code, '希刻劳')).toBeNull();
    expect(schemeOf(seedQ.code, '泰诺林')).toBe('surveyStd');
    expect(surveySchemes().some((s) => s.id === 'user-x')).toBe(false);
  });

  it('renameScheme：同步登记名；questionnairesOfScheme 反查绑定品种', () => {
    renameScheme('surveyStd', '问卷调研（2026）');
    expect(surveySchemes().find((s) => s.id === 'surveyStd')?.name).toBe('问卷调研（2026）');
    renameScheme('surveyStd', '问卷调研');

    bindQuestionnaire(seedQ.code, { 希刻劳: 'surveyStd' });
    const hits = questionnairesOfScheme('surveyStd').find((r) => r.code === seedQ.code);
    expect(hits?.varieties).toEqual(['希刻劳']);
    expect(questionnairesOfScheme('surveyUrgent').some((r) => r.code === seedQ.code)).toBe(false);
  });

  it('种子问卷带显式品种归属（无动态全品种）', () => {
    const names = listQuestionnaires().map((q) => q.name);
    expect(names).toContain('科室会满意度调研问卷');
    const all = listQuestionnaires().every((q) => Object.keys(q.pricing).length > 0);
    expect(all).toBe(true);
  });
});
