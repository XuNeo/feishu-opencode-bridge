import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('dotenv/config', () => ({}));
vi.mock('fs');

const feishuVisibility = {
  showThinkingChain: true,
  showToolChain: true,
};

vi.mock('../src/config.js', () => ({
  get outputConfig() {
    return {
      feishu: {
        showThinkingChain: feishuVisibility.showThinkingChain,
        showToolChain: feishuVisibility.showToolChain,
      },
    };
  },
  userConfig: {
    setOwner: vi.fn(),
  },
}));

const mockFs = vi.mocked(fs);

beforeEach(() => {
  mockFs.existsSync.mockReturnValue(false);
  mockFs.writeFileSync.mockImplementation(() => undefined);
});

import { chatSessionStore } from '../src/store/chat-session.js';

const CHAT_ID = 'chat_test_001';
const SESSION_ID = 'ses_test_001';

function setupSession(): void {
  chatSessionStore.setSession(CHAT_ID, SESSION_ID, 'user_001', '测试群');
}

describe('chatSessionStore 会话级可见性配置', () => {
  describe('getVisibilityConfig 默认行为', () => {
    it('会话不存在时跟随平台级默认', () => {
      const vis = chatSessionStore.getVisibilityConfig('chat_unknown');
      expect(vis.showThinkingChain).toBe(true);
      expect(vis.showToolChain).toBe(true);
    });

    it('会话存在但未设置时跟随平台级默认', () => {
      setupSession();
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(true);
      expect(vis.showToolChain).toBe(true);
    });
  });

  describe('updateConfig 写入会话级开关', () => {
    it('设置 showThinkingChain=false 后 getVisibilityConfig 返回 false', () => {
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: false });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(false);
    });

    it('设置 showToolChain=false 后 getVisibilityConfig 返回 false', () => {
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showToolChain: false });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showToolChain).toBe(false);
    });

    it('null 值重置为跟随平台默认', () => {
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: false });
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: null });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(true);
    });

    it('两项独立配置互不影响', () => {
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: false, showToolChain: true });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(false);
      expect(vis.showToolChain).toBe(true);
    });
  });

  describe('三层优先级：会话级 > 平台级 > 全局', () => {
    it('会话级 false 优先于平台级 true', () => {
      feishuVisibility.showThinkingChain = true;
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: false });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(false);
    });

    it('会话级 true 优先于平台级 false', () => {
      feishuVisibility.showThinkingChain = false;
      setupSession();
      chatSessionStore.updateConfig(CHAT_ID, { showThinkingChain: true });
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(true);
      feishuVisibility.showThinkingChain = true;
    });

    it('会话级未设置时 getVisibilityConfig 返回平台级值', () => {
      feishuVisibility.showThinkingChain = false;
      setupSession();
      const vis = chatSessionStore.getVisibilityConfig(CHAT_ID);
      expect(vis.showThinkingChain).toBe(false);
      feishuVisibility.showThinkingChain = true;
    });
  });
});
