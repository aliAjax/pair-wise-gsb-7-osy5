// 集成自测：node src/data/store.test.js
// 用内存 localStorage 垫片，验证"刷新后状态/发布稿/版本链一致"的端到端闭环。
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { loadState, persistState } = await import('./store.js');
const rules = await import('../rules/guide.js');
const { PROOF, SOURCE_LANG } = await import('../rules/constants.js');

let s = loadState();
const ex = s.exhibits[0];
const id = ex.id;

// 1) 中文正文变更 → 英/日回到待校对；中文已发布的快照不受编辑影响
const pubZhBefore = rules.getPublished(s.versions, id, SOURCE_LANG);
s = rules.editLang(s, id, SOURCE_LANG, { body: '更新后的中文正文' }).state;
assert.equal(s.exhibits[0].langs.en.proof, PROOF.PENDING);
assert.equal(s.exhibits[0].langs.ja.proof, PROOF.PENDING);
assert.equal(rules.getPublished(s.versions, id, SOURCE_LANG).body, pubZhBefore.body, '线上发布稿不被草稿编辑改动');

// 2) 英文待校对时发布 → 拦截
let blocked = rules.publishLang(s, id, 'en', 'x');
assert.ok(blocked.conflicts.some((c) => c.blocking && /校对/.test(c.rule)));
assert.equal(rules.getPublished(blocked.state.versions, id, 'en')?.id, 'v-seed-en-1', '被拦截时线上稿不变');

// 3) 校对英文 → 重新发布（带原因，旧稿归档）
s = rules.setProof(s, id, 'en', PROOF.APPROVED);
s = rules.publishLang(s, id, 'en', '配合中文新文案重译').state;
assert.equal(s.versions.filter((v) => v.exhibitId === id && v.lang === 'en' && v.status === 'published').length, 1);
assert.equal(s.versions.filter((v) => v.exhibitId === id && v.lang === 'en' && v.status === 'archived').length, 1);

// 4) 撤回英文 → 回退到上一版（种子里的英文版）
s = rules.withdrawLang(s, id, 'en').state;
const rolled = rules.getPublished(s.versions, id, 'en');
assert.equal(rolled.id, 'v-seed-en-1', '撤回后访客端回退到上一版');

// 5) 撤回日文（从未发布过）的前置：先发一版再撤回 → 无旧版应隐藏
s = rules.editLang(s, id, 'ja', { audioSeconds: 40 }).state;
s = rules.setProof(s, id, 'ja', PROOF.APPROVED);
s = rules.publishLang(s, id, 'ja', '初版').state;
assert.ok(rules.getPublished(s.versions, id, 'ja'));
s = rules.withdrawLang(s, id, 'ja').state;
assert.equal(rules.getPublished(s.versions, id, 'ja'), null, '无旧版撤回后隐藏');

// 6) 超时音频不能发布
s = rules.editLang(s, id, 'ja', { audioSeconds: 999 }).state;
s = rules.setProof(s, id, 'ja', PROOF.APPROVED);
const over = rules.publishLang(s, id, 'ja', '超时版');
assert.ok(over.conflicts.some((c) => c.blocking && /超过上限/.test(c.rule)));
assert.equal(rules.getPublished(over.state.versions, id, 'ja'), null);

// 7) 刷新：重新 loadState()，校验状态/发布稿/版本链与刷新前完全一致
// 7) persist then reload
persistState(s); // simulate auto-save after every mutation
const snapshot = JSON.stringify(s);
const reloaded = loadState();
assert.equal(JSON.stringify(reloaded), snapshot, '刷新后整体状态一致');
assert.equal(rules.getPublished(reloaded.versions, id, 'en').id, 'v-seed-en-1');
assert.equal(rules.getPublished(reloaded.versions, id, SOURCE_LANG).id, 'v-seed-zh-2');
assert.equal(rules.versionChain(reloaded.versions, id, SOURCE_LANG).length, 2);
assert.equal(rules.versionChain(reloaded.versions, id, 'ja').length, 1, '撤回稿仍在链上');

// 8) 冲突结构完整性：含 展项/语种/原值/新值/规则
const c = over.conflicts[0];
for (const k of ['exhibitId', 'exhibitTitle', 'lang', 'oldValue', 'newValue', 'rule', 'blocking']) {
  assert.ok(k in c, `冲突字段缺失: ${k}`);
}

console.log('✓ 集成自测全部通过（编辑联动 → 拦截 → 发布 → 版本归档 → 撤回回退/隐藏 → 刷新一致）');
