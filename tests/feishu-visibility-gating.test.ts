import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv/config', () => ({}));

vi.mock('../src/config.js', () => ({
  outputConfig: {
    feishu: {
      showThinkingChain: true,
      showToolChain: true,
    },
  },
}));

import { buildStreamCards, buildStreamCard, type StreamCardData } from '../src/feishu/cards-stream.js';

const baseData: StreamCardData = {
  thinking: '',
  text: 'hello',
  tools: [],
  status: 'completed',
};

function makeDataWithSegments(overrides?: Partial<StreamCardData>): StreamCardData {
  return {
    ...baseData,
    segments: [
      { type: 'reasoning', text: '这是思考内容' },
      { type: 'tool', name: 'bash', status: 'completed', output: '执行完毕' },
      { type: 'text', text: '最终回复' },
    ],
    ...overrides,
  };
}

function cardBodyText(card: object): string {
  const c = card as { body?: { elements?: { content?: string; elements?: { content?: string }[] }[] } };
  return JSON.stringify(c.body?.elements ?? []);
}

describe('buildStreamCards 卡片门控', () => {
  describe('默认行为（visibility 未传 → 读 outputConfig.feishu.*）', () => {
    it('thinking 和 tool 均默认显示', () => {
      const cards = buildStreamCards(makeDataWithSegments());
      const body = cardBodyText(cards[0]);
      expect(body).toContain('思考过程');
      expect(body).toContain('bash');
    });
  });

  describe('显式传入 visibility', () => {
    it('showThinking=false 时不渲染 reasoning segment', () => {
      const cards = buildStreamCards(
        makeDataWithSegments(),
        undefined,
        { showThinking: false, showTools: true }
      );
      const body = cardBodyText(cards[0]);
      expect(body).not.toContain('思考过程');
      expect(body).toContain('bash');
    });

    it('showTools=false 时不渲染 tool segment', () => {
      const cards = buildStreamCards(
        makeDataWithSegments(),
        undefined,
        { showThinking: true, showTools: false }
      );
      const body = cardBodyText(cards[0]);
      expect(body).toContain('思考过程');
      expect(body).not.toContain('bash');
    });

    it('两项均 false 时只剩文本内容', () => {
      const cards = buildStreamCards(
        makeDataWithSegments(),
        undefined,
        { showThinking: false, showTools: false }
      );
      const body = cardBodyText(cards[0]);
      expect(body).not.toContain('思考过程');
      expect(body).not.toContain('bash');
      expect(body).toContain('最终回复');
    });
  });

  describe('传统字段 thinking + tools（无 segments）', () => {
    it('showThinking=false 隐藏旧版思考面板', () => {
      const data: StreamCardData = {
        thinking: '旧版思考内容',
        text: '回复',
        tools: [],
        status: 'completed',
      };
      const cards = buildStreamCards(data, undefined, { showThinking: false, showTools: true });
      const body = cardBodyText(cards[0]);
      expect(body).not.toContain('思考过程');
      expect(body).toContain('回复');
    });

    it('showTools=false 隐藏旧版工具列表', () => {
      const data: StreamCardData = {
        thinking: '',
        text: '回复',
        tools: [{ name: 'Read', status: 'completed', output: '文件内容' }],
        status: 'completed',
      };
      const cards = buildStreamCards(data, undefined, { showThinking: true, showTools: false });
      const body = cardBodyText(cards[0]);
      expect(body).not.toContain('Read');
    });
  });

  describe('buildStreamCard 单卡', () => {
    it('showThinking=false 有效', () => {
      const card = buildStreamCard(makeDataWithSegments(), { showThinking: false });
      expect(cardBodyText(card)).not.toContain('思考过程');
    });
  });
});
