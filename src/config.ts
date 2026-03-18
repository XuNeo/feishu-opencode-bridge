import 'dotenv/config';

function normalizeBooleanToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim();
  if (!normalized) return undefined;
  // 兼容行内注释写法：SHOW_X=false # note / SHOW_X=false // note
  normalized = normalized
    .replace(/\s+#.*$/, '')
    .replace(/\s+\/\/.*$/, '')
    .trim();
  if (!normalized) return undefined;
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized ? normalized.toLowerCase() : undefined;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = normalizeBooleanToken(value);
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// 返回 boolean | undefined：undefined 表示"未配置"，供三层优先级覆盖链使用
export function parseOptionalBooleanEnv(value: string | undefined): boolean | undefined {
  const normalized = normalizeBooleanToken(value);
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseNonNegativeIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

// 飞书配置
export const feishuConfig = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
};

// OpenCode配置
export const opencodeConfig = {
  host: process.env.OPENCODE_HOST || 'localhost',
  port: parseInt(process.env.OPENCODE_PORT || '4096', 10),
  serverUsername: process.env.OPENCODE_SERVER_USERNAME?.trim() || 'opencode',
  serverPassword: process.env.OPENCODE_SERVER_PASSWORD?.trim() || undefined,
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
};

// 用户配置
export const userConfig = {
  // 是否开启手动绑定已有 OpenCode 会话能力
  enableManualSessionBind: parseBooleanEnv(process.env.ENABLE_MANUAL_SESSION_BIND, true),

  // 群聊中是否要求 @机器人 才响应普通消息（命令和待回答问题不受此限制）
  requireMention: parseBooleanEnv(process.env.REQUIRE_MENTION, true),

  // 运行时：owner 的 open_id（首次建群时自动从 creatorId 获取）
  _ownerId: undefined as string | undefined,

  // 运行时：仅限所有者模式（可通过 /owner on/off 动态切换）
  ownerOnlyMode: false,

  // 运行时：访问控制模式（whitelist = 白名单，blacklist = 黑名单）
  accessMode: 'whitelist' as 'whitelist' | 'blacklist',

  // 运行时：动态白名单（通过 /access allow 添加）
  dynamicAllowList: new Set<string>(),

  // 运行时：黑名单（通过 /access deny 添加）
  blacklist: new Set<string>(),

  // owner = 建群用户，自动从持久化数据或首次建群获取
  get ownerId(): string | undefined {
    return this._ownerId;
  },

  // 设置 owner（由 chat-session store 启动时或建群时调用）
  setOwner(userId: string): void {
    if (!this._ownerId) {
      this._ownerId = userId;
      console.log(`[Config] 自动识别 owner: ${userId}`);
    }
  },

  // 是否启用访问控制（有 owner 即视为启用）
  get isAccessControlEnabled(): boolean {
    return !!this._ownerId || this.dynamicAllowList.size > 0;
  },

  isOwner(userId: string): boolean {
    return !!this._ownerId && this._ownerId === userId;
  },

  // 判断用户是否可以使用机器人
  // - ownerOnlyMode 开启时：只有 owner 可用
  // - accessMode=blacklist：黑名单中的用户拒绝，其余放行
  // - 无 owner 且无白名单：全部放行（首次使用前不限制）
  canUseBot(userId: string): boolean {
    if (this.ownerOnlyMode) {
      return this.isOwner(userId);
    }
    if (this.accessMode === 'blacklist') {
      return !this.blacklist.has(userId);
    }
    // whitelist mode：无 owner 且无动态白名单时，全部放行
    if (!this._ownerId && this.dynamicAllowList.size === 0) {
      return true;
    }
    // 有 owner 时，owner 始终放行
    if (this.isOwner(userId)) {
      return true;
    }
    return this.dynamicAllowList.has(userId);
  },

  setOwnerOnlyMode(enabled: boolean): void {
    this.ownerOnlyMode = enabled;
  },
};
// 模型配置
const configuredDefaultProvider = process.env.DEFAULT_PROVIDER?.trim();
const configuredDefaultModel = process.env.DEFAULT_MODEL?.trim();
const hasConfiguredDefaultModel = Boolean(configuredDefaultProvider && configuredDefaultModel);

export const modelConfig = {
  // 不配置时交由 OpenCode 自身默认模型决策
  defaultProvider: hasConfiguredDefaultModel ? configuredDefaultProvider : undefined,
  defaultModel: hasConfiguredDefaultModel ? configuredDefaultModel : undefined,
};

// 权限配置
export const permissionConfig = {
  // 自动允许的工具列表
  toolWhitelist: (process.env.TOOL_WHITELIST || 'Read,Glob,Grep,Task').split(',').filter(Boolean),
  
  // 权限请求超时时间（毫秒）；<= 0 表示不超时，始终等待用户回复
  requestTimeout: parseNonNegativeIntEnv(process.env.PERMISSION_REQUEST_TIMEOUT_MS, 0),
};

// 输出配置
const showThinkingChain = parseBooleanEnv(process.env.SHOW_THINKING_CHAIN, true);
const showToolChain = parseBooleanEnv(process.env.SHOW_TOOL_CHAIN, true);

export const outputConfig = {
  updateInterval: parseInt(process.env.OUTPUT_UPDATE_INTERVAL || '3000', 10),
  maxMessageLength: 4000,
  showThinkingChain,
  showToolChain,
  feishu: {
    showThinkingChain,
    showToolChain,
  },
};

// 附件配置
export const attachmentConfig = {
  maxSize: parseInt(process.env.ATTACHMENT_MAX_SIZE || String(50 * 1024 * 1024), 10),
};

// 完成通知配置
export type CompletionNotifyMode = 'mention' | 'reaction' | 'both' | 'none';
const rawNotify = (process.env.COMPLETION_NOTIFY || 'both').trim().toLowerCase();
export const completionNotifyConfig = {
  mode: (['mention', 'reaction', 'both', 'none'].includes(rawNotify) ? rawNotify : 'both') as CompletionNotifyMode,
  get enableMention() { return this.mode === 'mention' || this.mode === 'both'; },
  get enableReaction() { return this.mode === 'reaction' || this.mode === 'both'; },
};

// 验证配置
export function validateConfig(): void {
  const errors: string[] = [];
  
  if (!feishuConfig.appId) {
    errors.push('缺少 FEISHU_APP_ID');
  }
  if (!feishuConfig.appSecret) {
    errors.push('缺少 FEISHU_APP_SECRET');
  }
  
  if (errors.length > 0) {
    throw new Error(`配置错误:\n${errors.join('\n')}`);
  }
}
