// 数据层：状态结构、种子数据、localStorage 持久化与全部状态变更动作。
// 不依赖界面；发布是否放行委托给 rules.js 判定。

import { LANGS, PROOF, checkPublish, chainOf } from './rules.js';

const KEY = 'exhibit-guide-v2';
const PALETTE = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'];

export const blankScript = () => ({ title: '', body: '', audioDuration: null, status: PROOF.PENDING });

let seq = 0;
const uid = () => `v${Date.now().toString(36)}-${(seq++).toString(36)}`;

// 发布即对当前草稿做快照，生成一条带原因的版本记录
const snapshot = (lang, script, n, reason, at) => ({
  id: uid(), lang, n,
  title: script.title, body: script.body, audioDuration: script.audioDuration,
  reason, at,
});

function seed() {
  const t = Date.now(), day = 86400000;
  const e1zh = { title: '潮汐之后', body: '一件记录海岸线变化的沉浸式影像装置。', audioDuration: 96, status: PROOF.APPROVED };
  const e1en = { title: 'After the Tide', body: 'An immersive video installation tracing the shifting coastline.', audioDuration: 101, status: PROOF.APPROVED };
  const e3zh = { title: '柔软的边界', body: '观众的移动会改变墙面上的光影。', audioDuration: 64, status: PROOF.APPROVED };
  const e3en = { title: 'Soft Boundaries', body: 'Visitors’ movements reshape the light projected on the walls.', audioDuration: 66, status: PROOF.APPROVED };
  const e3ja = { title: 'やわらかな境界', body: '観客の動きが壁面の光を変化させる。', audioDuration: 66, status: PROOF.APPROVED };
  const v1 = snapshot('zh', e1zh, 1, '首次发布', t - 3 * day);
  const v2 = snapshot('en', e1en, 1, '首次发布', t - 3 * day);
  const v3 = snapshot('zh', e3zh, 1, '首次发布', t - 2 * day);
  const v4 = snapshot('en', e3en, 1, '首次发布', t - 2 * day);
  const v5 = snapshot('ja', e3ja, 1, '首次发布', t - 2 * day);
  return {
    exhibits: [
      {
        id: 1, room: 'A01 · 主展厅', type: '装置', color: PALETTE[0],
        scripts: {
          zh: e1zh, en: e1en,
          ja: { title: '潮のあと', body: '海岸線の変化を記録する没入型映像作品。', audioDuration: 104, status: PROOF.PENDING },
        },
        versions: [v1, v2],
        published: { zh: v1.id, en: v2.id, ja: null },
      },
      {
        id: 2, room: 'B02 · 纸上时间', type: '档案', color: PALETTE[1],
        scripts: {
          zh: { title: '未寄出的信', body: '来自三代人的手写信件与声音档案。', audioDuration: 210, status: PROOF.PENDING },
          en: { title: 'Unsent Letters', body: 'Handwritten letters and sound archives from three generations.', audioDuration: null, status: PROOF.PENDING },
          ja: blankScript(),
        },
        versions: [],
        published: { zh: null, en: null, ja: null },
      },
      {
        id: 3, room: 'C01 · 新媒介', type: '互动', color: PALETTE[2],
        scripts: { zh: e3zh, en: e3en, ja: e3ja },
        versions: [v3, v4, v5],
        published: { zh: v3.id, en: v4.id, ja: v5.id },
      },
    ],
  };
}

// 刷新后校正：补齐缺失语种、清掉悬空发布指针，保证状态 / 发布稿 / 版本链一致
export function reconcile(state) {
  const exhibits = (state?.exhibits || []).map(ex => {
    const scripts = {};
    for (const l of LANGS) scripts[l.code] = { ...blankScript(), ...(ex.scripts?.[l.code] || {}) };
    const versions = (ex.versions || []).filter(v => LANGS.some(l => l.code === v.lang));
    const published = {};
    for (const l of LANGS) {
      const p = ex.published?.[l.code];
      published[l.code] = versions.some(v => v.id === p && v.lang === l.code) ? p : null;
    }
    return { ...ex, scripts, versions, published };
  });
  return { exhibits };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return reconcile(JSON.parse(raw));
  } catch { /* 数据损坏时回退种子 */ }
  return reconcile(seed());
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 存储不可用时静默 */ }
}

// ---- 状态变更动作（均为纯函数：接收旧状态，返回新状态或结果对象）----

const mapEx = (state, id, fn) => ({
  ...state,
  exhibits: state.exhibits.map(ex => (ex.id === id ? fn(ex) : ex)),
});

// 编辑草稿：内容变化会把本语种打回待校对；改的是中文源稿时，其他语种一并回到待校对
export function updateScript(state, id, lang, patch) {
  return mapEx(state, id, ex => {
    const prev = ex.scripts[lang];
    const changed = ['title', 'body', 'audioDuration'].some(k => k in patch && patch[k] !== prev[k]);
    const scripts = { ...ex.scripts, [lang]: { ...prev, ...patch, ...(changed ? { status: PROOF.PENDING } : {}) } };
    if (changed && lang === 'zh') {
      for (const l of LANGS) {
        if (l.code !== 'zh') scripts[l.code] = { ...scripts[l.code], status: PROOF.PENDING };
      }
    }
    return { ...ex, scripts };
  });
}

export function approveScript(state, id, lang) {
  return mapEx(state, id, ex => ({
    ...ex,
    scripts: { ...ex.scripts, [lang]: { ...ex.scripts[lang], status: PROOF.APPROVED } },
  }));
}

// 发布：规则不通过则原样返回状态并附上冲突列表；通过则生成新版本并指向它（旧稿保留在版本链）
export function publishScript(state, id, lang, reason) {
  const ex = state.exhibits.find(e => e.id === id);
  if (!ex) return { state, ok: false, conflicts: [] };
  const conflicts = checkPublish(ex, lang);
  if (conflicts.length) return { state, ok: false, conflicts };
  const v = snapshot(lang, ex.scripts[lang], chainOf(ex, lang).length + 1, reason, Date.now());
  const next = mapEx(state, id, e => ({
    ...e,
    versions: [...e.versions, v],
    published: { ...e.published, [lang]: v.id },
  }));
  return { state: next, ok: true, conflicts: [], version: v };
}

// 撤回：发布指针回退到版本链中的上一版；没有上一版则置空（访客侧隐藏该语种）
export function withdrawScript(state, id, lang) {
  const ex = state.exhibits.find(e => e.id === id);
  if (!ex) return { state, rolledBackTo: null, noop: true };
  const chain = chainOf(ex, lang);
  const idx = chain.findIndex(v => v.id === ex.published[lang]);
  if (idx < 0) return { state, rolledBackTo: null, noop: true };
  const prev = idx > 0 ? chain[idx - 1] : null;
  const next = mapEx(state, id, e => ({
    ...e,
    published: { ...e.published, [lang]: prev ? prev.id : null },
  }));
  return { state: next, rolledBackTo: prev };
}

export function addExhibit(state, { title, room, body }) {
  const id = Math.max(0, ...state.exhibits.map(e => e.id)) + 1;
  const ex = {
    id,
    room: room.trim() || '未分配展厅',
    type: '装置',
    color: PALETTE[state.exhibits.length % PALETTE.length],
    scripts: {
      zh: { ...blankScript(), title: title.trim(), body: body.trim() },
      en: blankScript(),
      ja: blankScript(),
    },
    versions: [],
    published: { zh: null, en: null, ja: null },
  };
  return { state: { ...state, exhibits: [...state.exhibits, ex] }, id };
}
