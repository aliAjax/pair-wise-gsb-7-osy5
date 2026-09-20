// 规则层自测：node src/rules/guide.test.js
import assert from 'node:assert';
import { makeExhibit, makeLang, editLang, setProof, publishLang, withdrawLang, getPublished, versionChain, validatePublish } from './guide.js';
import { SOURCE_LANG, PROOF, MAX_AUDIO_SECONDS } from './constants.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const freshState = () => {
  const ex = makeExhibit({ room: 'A01' });
  ex.langs[SOURCE_LANG] = makeLang('标题', '正文内容', 60, PROOF.APPROVED);
  ex.langs.en = makeLang('Title', 'Body content', 55, PROOF.APPROVED);
  ex.langs.ja = makeLang('タイトル', '本文', 50, PROOF.APPROVED);
  return { exhibits: [ex], versions: [] };
};

console.log('发布校验：');
ok('缺音频不能发布', () => {
  let s = freshState();
  s.exhibits[0].langs.en.audioSeconds = 0;
  const r = validatePublish(s.exhibits[0], 'en');
  assert.equal(r.ok, false);
  assert.match(r.conflicts[0].rule, /缺少语音导览音频/);
});
ok(`超时（>${MAX_AUDIO_SECONDS}s）不能发布`, () => {
  let s = freshState();
  s.exhibits[0].langs.en.audioSeconds = MAX_AUDIO_SECONDS + 1;
  const r = validatePublish(s.exhibits[0], 'en');
  assert.equal(r.ok, false);
  assert.match(r.conflicts[0].rule, /超过上限/);
});
ok('待校对不能发布', () => {
  let s = freshState();
  s.exhibits[0].langs.en.proof = PROOF.PENDING;
  const r = validatePublish(s.exhibits[0], 'en');
  assert.equal(r.ok, false);
  assert.ok(r.conflicts.some((c) => /尚未校对/.test(c.rule)));
});
ok('合法稿件可发布', () => {
  const r = validatePublish(freshState().exhibits[0], 'en');
  assert.equal(r.ok, true);
});

console.log('中文联动：');
ok('中文稿标题/正文变更后其他语种回到待校对', () => {
  let s = freshState();
  const id = s.exhibits[0].id;
  const r = editLang(s, id, SOURCE_LANG, { body: '正文内容（修改）' });
  s = r.state;
  assert.equal(s.exhibits[0].langs.en.proof, PROOF.PENDING);
  assert.equal(s.exhibits[0].langs.ja.proof, PROOF.PENDING);
  assert.equal(s.exhibits[0].langs[SOURCE_LANG].proof, PROOF.APPROVED, '中文自身不被重置');
  assert.equal(r.conflicts.length, 2);
  assert.deepEqual(r.conflicts.map((c) => [c.oldValue, c.newValue]), [[PROOF.APPROVED, PROOF.PENDING], [PROOF.APPROVED, PROOF.PENDING]]);
});
ok('仅改音频时长不触发联动重置', () => {
  let s = freshState();
  const r = editLang(s, s.exhibits[0].id, SOURCE_LANG, { audioSeconds: 61 });
  assert.equal(r.state.exhibits[0].langs.en.proof, PROOF.APPROVED);
});

console.log('发布与版本链：');
ok('发布后可查到唯一发布稿', () => {
  let s = freshState();
  const id = s.exhibits[0].id;
  s = publishLang(s, id, 'en', 'Initial').state;
  const pub = getPublished(s.versions, id, 'en');
  assert.ok(pub);
  assert.equal(pub.reason, 'Initial');
  assert.equal(s.versions.filter((v) => v.status === 'published' && v.lang === 'en').length, 1);
});
ok('调整后再发布：旧稿归档、新稿带原因、链上保留', () => {
  let s = freshState();
  const id = s.exhibits[0].id;
  s = publishLang(s, id, 'en', 'v1').state;
  s = editLang(s, id, 'en', { body: 'new body' }).state;
  s = setProof(s, id, 'en', PROOF.APPROVED);
  const r = publishLang(s, id, 'en', 'v2 reason');
  s = r.state;
  assert.equal(s.versions.filter((v) => v.lang === 'en' && v.status === 'published').length, 1, '只有一份发布稿');
  assert.equal(s.versions.filter((v) => v.lang === 'en' && v.status === 'archived').length, 1, '旧稿保留为归档');
  assert.equal(getPublished(s.versions, id, 'en').reason, 'v2 reason');
  assert.equal(versionChain(s.versions, id, 'en').length, 2);
  assert.match(r.conflicts[0].rule, /仅保留 1 份发布稿/);
});

console.log('撤回：');
ok('有旧版：撤回回退上一版', () => {
  let s = freshState();
  const id = s.exhibits[0].id;
  s = publishLang(s, id, 'en', 'v1').state;
  s = editLang(s, id, 'en', { body: 'new body' }).state;
  s = setProof(s, id, 'en', PROOF.APPROVED);
  s = publishLang(s, id, 'en', 'v2').state;
  const v2 = getPublished(s.versions, id, 'en');
  s = withdrawLang(s, id, 'en').state;
  const pub = getPublished(s.versions, id, 'en');
  assert.ok(pub, '仍有发布稿（回退）');
  assert.notEqual(pub.id, v2.id);
  assert.equal(pub.reason, 'v1');
});
ok('无旧版：撤回后隐藏', () => {
  let s = freshState();
  const id = s.exhibits[0].id;
  s = publishLang(s, id, 'en', 'only').state;
  s = withdrawLang(s, id, 'en').state;
  assert.equal(getPublished(s.versions, id, 'en'), null);
  assert.equal(versionChain(s.versions, id, 'en').length, 1, '撤回稿仍留在链上可审计');
});

console.log(`\n全部通过：${passed} 项`);
