// 规则层：语种、校对状态、发布规则与冲突判定。
// 只包含纯函数与常量，不碰存储，也不碰界面。

export const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];
export const LANG_LABEL = Object.fromEntries(LANGS.map(l => [l.code, l.label]));

export const PROOF = { PENDING: 'pending', APPROVED: 'approved' };
export const PROOF_LABEL = { [PROOF.PENDING]: '待校对', [PROOF.APPROVED]: '已校对' };

// 单条导览音频的时长上限（秒），超过即视为“超时”
export const MAX_AUDIO_SECONDS = 180;

export const RULE_LABEL = {
  'title-required': '标题不能为空',
  'body-required': '正文不能为空',
  'audio-required': '缺少导览音频',
  'audio-overtime': `音频超过 ${fmtDuration(MAX_AUDIO_SECONDS)} 上限`,
  'proof-required': '校对状态未通过',
};

export function fmtDuration(s) {
  if (s == null) return '—';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 某个语种的版本链（按发布时间升序）
export const chainOf = (ex, lang) => ex.versions.filter(v => v.lang === lang);

// 当前生效的发布稿（每个展项每个语种至多 1 份）
export const publishedOf = (ex, lang) =>
  ex.versions.find(v => v.id === ex.published?.[lang]) || null;

export const exhibitName = ex =>
  ex.scripts?.zh?.title?.trim() || `展项-${String(ex.id).padStart(3, '0')}`;

// 发布前校验：返回冲突列表（含展项、语种、字段、原值、新值、规则），空数组表示可发布
export function checkPublish(ex, lang) {
  const draft = ex.scripts[lang];
  const pub = publishedOf(ex, lang);
  const base = { exhibitId: ex.id, exhibit: exhibitName(ex), lang, langLabel: LANG_LABEL[lang] };
  const out = [];
  const add = (rule, field, oldValue, newValue) =>
    out.push({ ...base, rule, ruleLabel: RULE_LABEL[rule], field, oldValue, newValue });

  if (!draft.title.trim()) add('title-required', '标题', pub ? pub.title : '—', draft.title.trim() || '(空)');
  if (!draft.body.trim()) add('body-required', '正文', pub ? pub.body : '—', draft.body.trim() || '(空)');
  if (draft.audioDuration == null) {
    add('audio-required', '音频时长', pub ? fmtDuration(pub.audioDuration) : '—', '缺失');
  } else if (draft.audioDuration > MAX_AUDIO_SECONDS) {
    add('audio-overtime', '音频时长', pub ? fmtDuration(pub.audioDuration) : '—',
      `${fmtDuration(draft.audioDuration)}（上限 ${fmtDuration(MAX_AUDIO_SECONDS)}）`);
  }
  if (draft.status !== PROOF.APPROVED) {
    add('proof-required', '校对状态', pub ? PROOF_LABEL[PROOF.APPROVED] : '—', PROOF_LABEL[draft.status]);
  }
  return out;
}
