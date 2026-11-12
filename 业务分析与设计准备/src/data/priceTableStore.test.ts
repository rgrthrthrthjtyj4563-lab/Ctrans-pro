import { describe, expect, it } from 'vitest';
import {
  SEED, activeSet, allProductNames, applyDraft, surveyPriceOf, today,
  SURVEY_SEED_SERVICES, type VendorKey,
} from './priceTableStore';

describe('价目 store 种子完整性', () => {
  it('两 vendor × 两品种；问卷方案三档公私价格齐全', () => {
    (Object.keys(SEED) as VendorKey[]).forEach((vid) => {
      expect(SEED[vid].products.length).toBe(2);
      SURVEY_SEED_SERVICES.forEach((s) => {
        SEED[vid].published.pricesByProduct.forEach((book) => {
          ['base', 'split'].forEach((st) => {
            ['医生', '患者', '商业公司'].forEach((tier) => {
              const row = book[st as 'base' | 'split'][s.id][tier];
              expect(row, `${vid} ${s.id} ${st} ${tier}`).toBeTruthy();
              expect(row.pub).not.toBeNull();
              expect(row.priv).not.toBeNull();
            });
          });
        });
      });
    });
  });

  it('品种宇宙 = 两 vendor 品种按序并集', () => {
    expect(allProductNames()).toEqual(['希刻劳', '泰诺林', '双黄连', '格华止']);
  });
});

describe('surveyPriceOf 取价', () => {
  it('品种路由到正确 vendor；价格与快照推导一致（含 upgrade 日期选集）', () => {
    const set = activeSet(SEED.A.published, today());
    const direct = SEED.A.published.pricesByProduct[0][set].surveyStd['医生'];
    expect(surveyPriceOf('希刻劳', 'surveyStd', '医生')).toEqual({ pub: direct.pub, priv: direct.priv });
    // 双黄连属 vendor B（split-basic → 恒读 base）
    expect(surveyPriceOf('双黄连', 'surveyStd', '医生')).toEqual({ pub: 840, priv: 672 });
  });

  it('同方案分品种不同价（第 2 品种 ×0.9）', () => {
    const a = surveyPriceOf('希刻劳', 'surveyStd', '患者');
    const b = surveyPriceOf('泰诺林', 'surveyStd', '患者');
    expect(b.pub).toBe(Math.round(a.pub! * 0.9));
    const c = surveyPriceOf('双黄连', 'surveyUrgent', '商业公司');
    const d = surveyPriceOf('格华止', 'surveyUrgent', '商业公司');
    expect(d.pub).toBe(Math.round(c.pub! * 0.9));
  });

  it('未知品种 / 未知方案返回 null（未配置）', () => {
    expect(surveyPriceOf('不存在', 'surveyStd', '医生')).toEqual({ pub: null, priv: null });
    expect(surveyPriceOf('希刻劳', 'ghost', '医生')).toEqual({ pub: null, priv: null });
  });

  it('草稿优先：applyDraft 改价后 surveyPriceOf 立即反映（0 是有效价）', () => {
    applyDraft('A', 0, (draft) => {
      const set = activeSet(draft, today());
      draft.pricesByProduct[0][set].surveyStd['患者'] = { pub: 0, priv: 123, limit: null, overPub: null, overPriv: null };
    });
    const p = surveyPriceOf('希刻劳', 'surveyStd', '患者');
    expect(p).toEqual({ pub: 0, priv: 123 });
  });
});
