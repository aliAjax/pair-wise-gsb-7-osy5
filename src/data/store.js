// 数据层：只管读写与持久化（localStorage），不包含任何业务规则。
// 刷新一致性 = state 是唯一真相，每次变更整体落盘；读取时整体恢复。
import { STORAGE_KEY, SOURCE_LANG, LANGUAGES, PROOF } from '../rules/constants.js';
import { makeLang, makeExhibit } from '../rules/guide.js';

const PALETTE = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'];

function seed() {
  // 展项 1：中英双语已发布；日文稿待校对（缺音频，演示不能发布）
  const a = makeExhibit({ room: 'A01 · 主展厅', type: '装置', color: PALETTE[0] });
  a.langs[SOURCE_LANG] = makeLang('潮汐之后', '一件记录海岸线变化的沉浸式影像装置。潮水的声音与光影随时间缓慢改变。', 96, PROOF.APPROVED);
  a.langs.en = makeLang('After the Tide', 'An immersive video installation recording changes along the coastline.', 88, PROOF.APPROVED);
  a.langs.ja = makeLang('潮のあとで', '海岸線の変化を記録する没入型映像インスタレーション。', 0, PROOF.PENDING);

  // 展项 2：中文草稿，无发布稿
  const b = makeExhibit({ room: 'B02 · 纸上时间', type: '档案', color: PALETTE[1] });
  b.langs[SOURCE_LANG] = makeLang('未寄出的信', '来自三代人的手写信件与声音档案。', 0, PROOF.PENDING);
  b.langs.en = makeLang('Letters Never Sent', 'Handwritten letters and sound archives from three generations.', 0, PROOF.PENDING);

  // 展项 3：中文已发布；英文超时（190s > 180s）演示拦截
  const c = makeExhibit({ room: 'C01 · 新媒介', type: '互动', color: PALETTE[2] });
  c.langs[SOURCE_LANG] = makeLang('柔软的边界', '观众的移动会改变墙面上的光影，边界因此变得柔软。', 74, PROOF.APPROVED);
  c.langs.en = makeLang('Soft Boundaries', 'Visitors’ movement shifts the light on the wall, softening every boundary.', 190, PROOF.APPROVED);

  return { exhibits: [a, b, c], versions: [] };
}

// 预置一条发布链：展项1 中文有"旧版 → 现版"，用于演示撤回回退；展项1 英文仅一版
function withPublishedHistory(state) {
  const [a] = state.exhibits;
  const oldZh = {
    id: 'v-seed-zh-1', exhibitId: a.id, lang: SOURCE_LANG, status: 'archived',
    title: '潮汐之后', body: '一件记录海岸线变化的沉浸式影像装置。（首版文案）',
    audioSeconds: 92, reason: '首版发布', createdAt: '2024-03-01T09:00:00.000Z',
    archivedAt: '2024-04-10T10:00:00.000Z',
  };
  const curZh = {
    id: 'v-seed-zh-2', exhibitId: a.id, lang: SOURCE_LANG, status: 'published',
    title: a.langs[SOURCE_LANG].title, body: a.langs[SOURCE_LANG].body,
    audioSeconds: a.langs[SOURCE_LANG].audioSeconds, reason: '更新第三段声音描述',
    createdAt: '2024-04-10T10:00:00.000Z',
  };
  oldZh.supersededBy = curZh.id;
  const curEn = {
    id: 'v-seed-en-1', exhibitId: a.id, lang: 'en', status: 'published',
    title: a.langs.en.title, body: a.langs.en.body, audioSeconds: a.langs.en.audioSeconds,
    reason: 'Initial release', createdAt: '2024-03-01T09:05:00.000Z',
  };
  return { ...state, versions: [oldZh, curZh, curEn] };
}

function isValidShape(data) {
  return data && Array.isArray(data.exhibits) && Array.isArray(data.versions) &&
    data.exhibits.every((e) => e && e.langs && LANGUAGES.every((l) => e.langs[l.code]));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isValidShape(data)) return data;
    }
  } catch {
    /* 损坏数据：回退种子 */
  }
  const initial = withPublishedHistory(seed());
  persistState(initial);
  return initial;
}

export function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 配额/隐私模式失败时静默，内存状态仍一致 */
  }
}

export function resetState() {
  const fresh = withPublishedHistory(seed());
  persistState(fresh);
  return fresh;
}
