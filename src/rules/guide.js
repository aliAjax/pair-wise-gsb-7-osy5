// 规则层：纯函数。不碰 localStorage / DOM，只接收 state 并返回新 state 或校验结果。
// 冲突统一结构：{ exhibitId, exhibitTitle, lang, action, oldValue, newValue, rule, blocking }
import { LANGUAGES, SOURCE_LANG, PROOF, VERSION, MAX_AUDIO_SECONDS } from './constants.js';

const nowIso = () => new Date().toISOString();
let seq = 0;
const genVersionId = () => `v-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function makeLang(title = '', body = '', audioSeconds = 0, proof = PROOF.PENDING) {
  return { title, body, audioSeconds: Number(audioSeconds) || 0, proof };
}

export function makeExhibit({ room = '', type = '装置', color = '#83b9b1' } = {}) {
  const langs = {};
  LANGUAGES.forEach((l) => { langs[l.code] = makeLang('', '', 0, l.code === SOURCE_LANG ? PROOF.PENDING : PROOF.PENDING); });
  return { id: `ex-${Date.now().toString(36)}-${(seq++).toString(36)}`, room, type, color, langs };
}

// ---- 冲突构造 ----
function conflict(lang, action, oldValue, newValue, rule, extra = {}) {
  return { lang, action, oldValue, newValue, rule, blocking: true, ...extra };
}

// ---- 规则 1：发布前校验 ----
// 同一展项按语种发布；超时（超过 MAX_AUDIO_SECONDS）或缺音频（<=0）不能发布；
// 未校对（proof !== approved）也不能发布。返回 { ok, conflicts }
export function validatePublish(exhibit, lang) {
  const d = exhibit.langs[lang];
  const conflicts = [];
  if (!d) return { ok: false, conflicts: [conflict(lang, 'publish', null, null, '该语种稿件不存在，无法发布')] };

  if (!d.title.trim()) {
    conflicts.push(conflict(lang, 'publish', '(空标题)', d.title, '发布稿标题不能为空'));
  }
  if (!d.body.trim()) {
    conflicts.push(conflict(lang, 'publish', '(空正文)', d.body, '发布稿正文不能为空'));
  }
  if (!d.audioSeconds || d.audioSeconds <= 0) {
    conflicts.push(conflict(lang, 'publish', d.audioSeconds || 0, d.audioSeconds || 0, '缺少语音导览音频，不能发布'));
  } else if (d.audioSeconds > MAX_AUDIO_SECONDS) {
    conflicts.push(conflict(lang, 'publish', `${d.audioSeconds}s`, `${d.audioSeconds}s`, `音频时长 ${d.audioSeconds}s 超过上限 ${MAX_AUDIO_SECONDS}s，超时不能发布`));
  }
  if (d.proof !== PROOF.APPROVED) {
    conflicts.push(conflict(lang, 'publish', PROOF.PENDING, d.proof, '稿件尚未校对通过（待校对状态不能发布）'));
  }
  return { ok: conflicts.length === 0, conflicts };
}

// ---- 规则 2：编辑稿件 ----
// 中文（源语种）变更后：其他语种回到待校对。
// 编辑已发布语种的当前稿（draft），不影响线上发布稿；发布稿以版本快照为准。
export function editLang(state, exhibitId, lang, patch) {
  const conflicts = [];
  const exhibits = state.exhibits.map((ex) => {
    if (ex.id !== exhibitId) return ex;
    const cur = ex.langs[lang];
    const next = { ...cur, ...patch };
    const langs = { ...ex.langs, [lang]: next };

    if (lang === SOURCE_LANG) {
      const sourceChanged =
        (patch.title !== undefined && patch.title !== cur.title) ||
        (patch.body !== undefined && patch.body !== cur.body);
      if (sourceChanged) {
        LANGUAGES.forEach((l) => {
          if (l.code === SOURCE_LANG) return;
          const before = langs[l.code].proof;
          // 记录"原值 → 新值"冲突/提示（非阻断，是联动规则留痕）
          conflicts.push({
            lang: l.code,
            action: 'auto-reset-proof',
            oldValue: before,
            newValue: PROOF.PENDING,
            rule: '中文稿发生变更，其他语种自动回到待校对',
            blocking: false,
          });
          langs[l.code] = { ...langs[l.code], proof: PROOF.PENDING };
        });
      }
    }
    return { ...ex, langs };
  });
  return { state: { ...state, exhibits }, conflicts };
}

// ---- 规则 3：校对通过 / 取消校对 ----
export function setProof(state, exhibitId, lang, proof) {
  const exhibits = state.exhibits.map((ex) => {
    if (ex.id !== exhibitId) return ex;
    return { ...ex, langs: { ...ex.langs, [lang]: { ...ex.langs[lang], proof } } };
  });
  return { ...state, exhibits };
}

// ---- 版本链工具 ----
function publishedSnapshot(exhibit, lang, reason, createdAt = nowIso()) {
  const d = exhibit.langs[lang];
  return {
    id: genVersionId(),
    exhibitId: exhibit.id,
    lang,
    title: d.title,
    body: d.body,
    audioSeconds: d.audioSeconds,
    reason,
    createdAt,
  };
}

// ---- 规则 4：发布（每展项每语种仅 1 份发布稿；调整发布生成新版本并归档旧稿）----
export function publishLang(state, exhibitId, lang, reason) {
  const exhibit = state.exhibits.find((x) => x.id === exhibitId);
  if (!exhibit) return { state, conflicts: [conflict(lang, 'publish', null, null, '展项不存在')] };

  const check = validatePublish(exhibit, lang);
  if (!check.ok) {
    return {
      state,
      conflicts: check.conflicts.map((c) => ({ ...c, exhibitId, exhibitTitle: exhibit.langs[SOURCE_LANG].title || exhibit.room })),
    };
  }

  const versions = [...state.versions];
  const idx = versions.findIndex((v) => v.exhibitId === exhibitId && v.lang === lang);
  let oldValue = VERSION.NONE;
  if (idx >= 0) {
    // 已有发布稿：旧稿降为 archived，链入 history
    const oldPub = versions[idx];
    oldValue = oldPub.id;
    versions[idx] = {
      ...oldPub,
      status: 'archived',
      archivedAt: nowIso(),
      supersededBy: null, // 先占位，下面填新版本号
    };
  }

  const snap = publishedSnapshot(exhibit, lang, reason);
  snap.status = 'published';
  if (idx >= 0) versions[idx].supersededBy = snap.id;
  versions.push(snap);

  const conflicts = idx >= 0
    ? [{
        exhibitId, exhibitTitle: exhibit.langs[SOURCE_LANG].title || exhibit.room,
        lang, action: 'republish', oldValue, newValue: snap.id,
        rule: '同一展项同一语种仅保留 1 份发布稿：旧发布稿已归档，新版本带调整原因并保留旧稿',
        blocking: false,
      }]
    : [];

  return { state: { ...state, versions }, conflicts };
}

// ---- 规则 5：撤回（访客预览回退上一版；无旧版则隐藏）----
export function withdrawLang(state, exhibitId, lang) {
  const versions = [...state.versions];
  const idx = versions.findIndex((v) => v.exhibitId === exhibitId && v.lang === lang && v.status === 'published');
  const exhibit = state.exhibits.find((x) => x.id === exhibitId);
  if (idx < 0 || !exhibit) {
    return {
      state,
      conflicts: [{
        exhibitId, exhibitTitle: exhibit?.langs[SOURCE_LANG].title || '',
        lang, action: 'withdraw', oldValue: VERSION.PUBLISHED, newValue: VERSION.NONE,
        rule: '当前没有可撤回的发布稿', blocking: true,
      }],
    };
  }

  const withdrawn = versions[idx];
  // 找该语种最近一份 archived 旧稿作为回退目标
  const previous = versions
    .filter((v) => v.exhibitId === exhibitId && v.lang === lang && v.status === 'archived')
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''))[0];

  let nextVersions;
  let newValue;
  let rule;
  if (previous) {
    // 回退上一版：旧稿恢复为 published（它的内容/原因保留），被撤回的稿转为 archived
    nextVersions = versions.map((v) => {
      if (v.id === previous.id) return { ...v, status: 'published', restoredAt: nowIso(), archivedAt: undefined };
      if (v.id === withdrawn.id) {
        return { ...v, status: 'archived', archivedAt: nowIso(), withdrawn: true };
      }
      return v;
    });
    newValue = VERSION.PUBLISHED;
    rule = `已撤回，访客预览回退到上一版（${previous.id}）`;
  } else {
    // 无旧版：隐藏（移除发布态，保留为 archived 以便审计/再查）
    nextVersions = versions.map((v) => v.id === withdrawn.id
      ? { ...v, status: 'archived', archivedAt: nowIso(), withdrawn: true }
      : v);
    newValue = VERSION.NONE;
    rule = '已撤回且无历史版本，访客端该语种已隐藏';
  }

  return {
    state: { ...state, versions: nextVersions },
    conflicts: [{
      exhibitId, exhibitTitle: exhibit.langs[SOURCE_LANG].title || exhibit.room,
      lang, action: 'withdraw', oldValue: withdrawn.id, newValue,
      rule, blocking: false,
    }],
  };
}

// ---- 查询：某展项某语种当前发布稿（无则 null = 访客端隐藏）----
export function getPublished(versions, exhibitId, lang) {
  return versions.find((v) => v.exhibitId === exhibitId && v.lang === lang && v.status === 'published') || null;
}

// ---- 查询：版本链（新 → 旧）----
export function versionChain(versions, exhibitId, lang) {
  return versions
    .filter((v) => v.exhibitId === exhibitId && v.lang === lang)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// ---- 展项增删 ----
export function addExhibit(state, partial) {
  const ex = makeExhibit(partial);
  return { ...state, exhibits: [...state.exhibits, ex] };
}

export function editMeta(state, exhibitId, patch) {
  const exhibits = state.exhibits.map((ex) => (ex.id === exhibitId ? { ...ex, ...patch } : ex));
  return { ...state, exhibits };
}
