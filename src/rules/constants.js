// 规则层：领域常量（数据层/界面层共享，本身不含行为）
export const LANGUAGES = [
  { code: 'zh-CN', name: '中文', short: '中', isSource: true },
  { code: 'en', name: 'English', short: 'EN', isSource: false },
  { code: 'ja', name: '日本語', short: 'JA', isSource: false },
];

export const SOURCE_LANG = 'zh-CN';

export const PROOF = { PENDING: 'pending', APPROVED: 'approved' };
export const PROOF_LABEL = { pending: '待校对', approved: '已校对' };

export const VERSION = { PUBLISHED: 'published', ARCHIVED: 'archived', NONE: 'none' };

// 发布硬规则：音频时长必须在 (0, MAX_AUDIO_SECONDS] 秒之间
export const MAX_AUDIO_SECONDS = 180;

export const STORAGE_KEY = 'guide-exhibits-v2';
