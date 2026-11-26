/**
 * 新手引导文案回归（2026-11-26 合同管理与品种/价目解耦返修）：
 * 合同改为可稍后归档——欢迎卡与抽屉共用的副标题、合同步骤文案按评审定稿钉住；
 * 步骤 ID、顺序、完成态判定键与「合同管理」跳转保持不变，
 * 旧版「服务商上传合作合同 / 提醒服务商上传」口径不得回潮。
 * node 环境无 DOM，用 renderToStaticMarkup 渲染欢迎卡与抽屉核对实际输出。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  STARTUP_GUIDE_STEPS,
  STARTUP_GUIDE_SUBTITLE,
  STARTUP_GUIDE_TITLE,
  StartupGuideBanner,
  StartupGuideDrawer,
} from './StartupGuide';

const CONTRACT_STEP_TITLE = '归档合作合同（可稍后处理）';
const CONTRACT_STEP_DESCRIPTION =
  '准入通过后，由药厂上传双方线下已签署的合作合同。尚未归档时，仍可先配置品种授权。';
/** 旧版口径：合同由服务商上传，且被列为开展业务的前置配置 */
const RETIRED_COPY = ['服务商上传合作合同', '提醒服务商上传', '完成准入、合同、品种与价目'];

function contractStep() {
  const step = STARTUP_GUIDE_STEPS.find((item) => item.id === 'contract-upload');
  if (!step) throw new Error('缺少 contract-upload 步骤');
  return step;
}

function renderBanner(completedCount = 0) {
  return renderToStaticMarkup(
    createElement(StartupGuideBanner, {
      state: {
        userName: '测试管理员',
        completedCount,
        total: STARTUP_GUIDE_STEPS.length,
        visible: true,
        onOpen: () => {},
        onDismiss: () => {},
      },
    }),
  );
}

function renderDrawer(completedSteps: string[] = []) {
  return renderToStaticMarkup(
    createElement(StartupGuideDrawer, {
      open: true,
      onClose: () => {},
      completedSteps,
      onNavigate: () => {},
    }),
  );
}

describe('新手引导 · 步骤骨架不变', () => {
  it('步骤 ID 与顺序沿用（useStartupGuide 的完成态按这些 ID 判定）', () => {
    expect(STARTUP_GUIDE_STEPS.map((step) => step.id)).toEqual([
      'vendor-admission',
      'contract-upload',
      'variety-entry',
      'price-config',
    ]);
  });

  it('合同步骤仍跳转「合同管理」', () => {
    expect(contractStep().targetPage).toBe('contract-management');
    expect(contractStep().targetLabel).toBe('合同管理');
  });
});

describe('新手引导 · 合同可稍后归档的文案', () => {
  it('副标题只把服务商准入、品种、价目列为基础配置，合同另行归档', () => {
    expect(STARTUP_GUIDE_SUBTITLE).toBe(
      '完成服务商准入、品种和价目的基础配置后，即可开展后续业务。合作合同可另行归档。',
    );
  });

  it('合同步骤标题与说明按评审定稿', () => {
    expect(contractStep().title).toBe(CONTRACT_STEP_TITLE);
    expect(contractStep().description).toBe(CONTRACT_STEP_DESCRIPTION);
  });

  it('步骤配置中不再出现旧版口径', () => {
    const copy = [STARTUP_GUIDE_SUBTITLE, ...STARTUP_GUIDE_STEPS.flatMap((step) => [step.title, step.description])].join('\n');
    for (const retired of RETIRED_COPY) {
      expect(copy).not.toContain(retired);
    }
  });
});

describe('新手引导 · 欢迎卡与抽屉的实际渲染', () => {
  it('欢迎卡展示共用副标题', () => {
    const html = renderBanner(0);
    expect(html).toContain(STARTUP_GUIDE_TITLE);
    expect(html).toContain(STARTUP_GUIDE_SUBTITLE);
    expect(html).toContain('已完成 0/4 项');
  });

  it('抽屉展示共用副标题与合同步骤文案', () => {
    const html = renderDrawer();
    expect(html).toContain(STARTUP_GUIDE_TITLE);
    expect(html).toContain(STARTUP_GUIDE_SUBTITLE);
    expect(html).toContain(CONTRACT_STEP_TITLE);
    expect(html).toContain(CONTRACT_STEP_DESCRIPTION);
    expect(html).toContain('0/4 已完成');
  });

  it('合同未归档时抽屉提供「合同管理」入口，已归档后收起', () => {
    expect(renderDrawer()).toContain('前往处理 · 合同管理');
    expect(renderDrawer(['contract-upload'])).not.toContain('前往处理 · 合同管理');
  });

  it('欢迎卡与抽屉均不再渲染旧版口径', () => {
    for (const html of [renderBanner(1), renderDrawer(), renderDrawer(['vendor-admission'])]) {
      for (const retired of RETIRED_COPY) {
        expect(html).not.toContain(retired);
      }
    }
  });
});
