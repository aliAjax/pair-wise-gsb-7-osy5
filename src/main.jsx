import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { loadState, persistState, resetState } from './data/store.js';
import { LANGUAGES, SOURCE_LANG, PROOF, PROOF_LABEL, MAX_AUDIO_SECONDS } from './rules/constants.js';
import {
  addExhibit, editMeta, editLang, setProof, publishLang, withdrawLang,
  getPublished, versionChain, validatePublish,
} from './rules/guide.js';
import { langOf, mmss, fmtTs, exhibitTitle } from './ui/format.js';
import ConflictLog from './ui/ConflictLog.jsx';
import VersionChainView from './ui/VersionChain.jsx';
import VisitorView from './ui/VisitorView.jsx';

const PALETTE = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'];

function App() {
  const [state, setState] = useState(loadState);
  const [selected, setSelected] = useState(() => state.exhibits[0]?.id);
  const [lang, setLang] = useState(SOURCE_LANG);
  const [view, setView] = useState('edit'); // edit | visitor | detail
  const [detailLang, setDetailLang] = useState(SOURCE_LANG);
  const [filter, setFilter] = useState('全部');
  const [reason, setReason] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [conflicts, setConflicts] = useState([]); // {id, blocking, exhibitId, exhibitTitle, lang, action, oldValue, newValue, rule, at}
  const [notice, setNotice] = useState('');

  useEffect(() => persistState(state), [state]);

  const current = state.exhibits.find((x) => x.id === selected) || state.exhibits[0];
  const d = current?.langs[lang];
  const published = current ? getPublished(state.versions, current.id, lang) : null;

  // 发布态派生（每语种独立），供列表徽标与筛选
  const pubSet = useMemo(() => {
    const m = new Map();
    state.versions.filter((v) => v.status === 'published').forEach((v) => m.set(`${v.exhibitId}|${v.lang}`, v));
    return m;
  }, [state.versions]);
  const isExhibitLive = (ex) => LANGUAGES.some((l) => pubSet.has(`${ex.id}|${l.code}`));

  const visible = useMemo(() => {
    if (filter === '全部') return state.exhibits;
    return state.exhibits.filter((ex) => (filter === '已发布' ? isExhibitLive(ex) : !isExhibitLive(ex)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exhibits, filter, pubSet]);

  const pushConflicts = (list, ex) => {
    if (!list || !list.length) return;
    const enriched = list.map((c, i) => ({
      id: `c-${Date.now()}-${i}`,
      at: new Date().toISOString(),
      exhibitTitle: c.exhibitTitle || (ex ? exhibitTitle(ex) : ''),
      ...c,
    }));
    setConflicts((prev) => [...enriched, ...prev].slice(0, 60));
    const blocking = enriched.filter((c) => c.blocking);
    if (blocking.length) {
      setNotice(`被规则拦截：${blocking[0].rule}`);
      setLogOpen(true);
    }
  };

  // ---- 编辑动作（数据/规则在 rules 内完成，这里只装配 state + 留痕）----
  const onEdit = (patch) => {
    if (!current) return;
    const r = editLang(state, current.id, lang, patch);
    setState(r.state);
    // 中文联动重置：仅记录一次折叠提示，避免刷屏
    const resets = r.conflicts.filter((c) => c.action === 'auto-reset-proof');
    if (resets.length) {
      pushConflicts([{
        ...resets[0],
        newValue: `${PROOF.PENDING}×${resets.length}`,
        rule: `中文稿变更，${resets.map((c) => langOf(c.lang).name).join('、')} 已自动回到待校对`,
      }], current);
    }
  };

  const onProof = (proof) => {
    if (!current) return;
    const before = d.proof;
    setState(setProof(state, current.id, lang, proof));
    pushConflicts([{
      exhibitId: current.id, lang, action: 'proof',
      oldValue: before, newValue: proof, blocking: false,
      rule: proof === PROOF.APPROVED ? '校对通过，可提交发布' : '已取消校对，稿件回到待校对',
    }], current);
  };

  const onPublish = () => {
    if (!current) return;
    const pre = validatePublish(current, lang);
    if (!pre.ok) {
      pushConflicts(pre.conflicts, current);
      return;
    }
    const had = !!published;
    const r = publishLang(state, current.id, lang, reason.trim() || (had ? '内容调整后重新发布' : '首次发布'));
    setState(r.state);
    pushConflicts(r.conflicts, current);
    setReason('');
    setNotice(had ? '已重新发布：旧稿归档，访客预览已切换到新稿' : '发布成功，访客预览已更新');
  };

  const onWithdraw = () => {
    if (!current) return;
    const r = withdrawLang(state, current.id, lang);
    setState(r.state);
    pushConflicts(r.conflicts, current);
    const blocking = r.conflicts.some((c) => c.blocking);
    if (!blocking) setNotice(r.conflicts[0]?.rule || '已撤回');
  };

  const onAdd = () => {
    const ex = addExhibit(state, { room: `展厅 ${String(state.exhibits.length + 1).padStart(2, '0')}`, color: PALETTE[state.exhibits.length % PALETTE.length] });
    setState(ex);
    const created = ex.exhibits[ex.exhibits.length - 1];
    setSelected(created.id);
    setLang(SOURCE_LANG);
    setNotice('已新建展项，各语种稿件初始为待校对');
  };

  const onReset = () => {
    if (!window.confirm('重置为演示种子数据？当前所有稿件与版本链将被清除。')) return;
    const fresh = resetState();
    setState(fresh);
    setSelected(fresh.exhibits[0].id);
    setLang(SOURCE_LANG);
    setConflicts([]);
    setNotice('已重置演示数据');
  };

  if (view === 'visitor') {
    return (
      <VisitorView
        state={state}
        pubSet={pubSet}
        onBack={() => setView('edit')}
        onOpen={(id, l) => { setSelected(id); setDetailLang(l); setView('detail'); }}
      />
    );
  }
  if (view === 'detail' && current) {
    return (
      <VisitorView
        state={state} pubSet={pubSet} detail
        detailId={current.id} detailLang={detailLang}
        onBack={() => setView('visitor')}
        onSwitchLang={(l) => setDetailLang(l)}
        onOpen={(id, l) => { setSelected(id); setDetailLang(l); }}
      />
    );
  }

  const chain = current ? versionChain(state.versions, current.id, lang) : [];
  const audioInvalid = !d?.audioSeconds || d.audioSeconds <= 0;
  const audioOver = d?.audioSeconds > MAX_AUDIO_SECONDS;

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">多语种导览审校</div>
        <div className="project">
          <span className="project-dot"></span>
          <div><strong>潮汐之后</strong><small>2024 春季展 · {LANGUAGES.length} 个语种</small></div>
        </div>
        <nav>
          <button className="active">▧ <span>稿件审校</span><b>{state.exhibits.length}</b></button>
          <button onClick={() => setView('visitor')}>◉ <span>访客预览</span></button>
        </nav>
        <div className="side-foot">
          <button onClick={onReset}>↺ 重置演示数据</button>
          <small>已自动保存 · 刷新不丢失</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">LOCALIZATION REVIEW</span>
            <h1>多语种导览稿审校</h1>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={() => setLogOpen(true)}>
              ⚠ 规则记录 <span className="badge">{conflicts.length}</span>
            </button>
            <button className="secondary" onClick={() => setView('visitor')}>◉ 访客预览</button>
          </div>
        </header>

        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{state.exhibits.length} 个展项 · {LANGUAGES.length} 个语种</span></div>
              <button className="add-btn" onClick={onAdd}>＋ 添加展项</button>
            </div>
            <div className="filters">
              {['全部', '已发布', '草稿'].map((x) => (
                <button key={x} className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)}>{x}</button>
              ))}
            </div>
            <div className="exhibit-list">
              {visible.map((ex) => (
                <button key={ex.id} className={'exhibit-row ' + (current?.id === ex.id ? 'chosen' : '')} onClick={() => { setSelected(ex.id); setLang(SOURCE_LANG); }}>
                  <span className="thumb" style={{ background: ex.color }}>{String(state.exhibits.indexOf(ex) + 1).padStart(2, '0')}</span>
                  <span className="row-copy">
                    <strong>{exhibitTitle(ex)}</strong>
                    <small>{ex.room} · {ex.type}</small>
                    <span className="lang-dots">
                      {LANGUAGES.map((l) => {
                        const pub = pubSet.get(`${ex.id}|${l.code}`);
                        const proof = ex.langs[l.code].proof === PROOF.APPROVED;
                        return (
                          <i key={l.code}
                             className={pub ? 'dot live' : proof ? 'dot approved' : 'dot pending'}
                             title={`${l.name}：${pub ? '已发布' : proof ? '已校对' : '待校对'}`}>
                            {l.short}
                          </i>
                        );
                      })}
                    </span>
                  </span>
                  <span className={'status ' + (isExhibitLive(ex) ? 'live' : 'draft')}>{isExhibitLive(ex) ? '已发布' : '草稿'}</span>
                </button>
              ))}
            </div>
          </section>

          {current && (
            <section className="form-panel">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">EDIT EXHIBIT · {current.room}</span>
                  <h2>{exhibitTitle(current)}</h2>
                </div>
                <input className="meta-input" value={current.type} onChange={(e) => setState(editMeta(state, current.id, { type: e.target.value }))} title="内容类型" />
              </div>

              <div className="lang-tabs">
                {LANGUAGES.map((l) => {
                  const pub = pubSet.get(`${current.id}|${l.code}`);
                  return (
                    <button key={l.code} className={'lang-tab ' + (lang === l.code ? 'on' : '')} onClick={() => setLang(l.code)}>
                      <span className="flag">{l.short}</span>
                      <span className="t-name">{l.name}{l.isSource && <em>源稿</em>}</span>
                      <span className={'mini-status ' + (pub ? 'live' : current.langs[l.code].proof === PROOF.APPROVED ? 'approved' : 'pending')}>
                        {pub ? '已发布' : PROOF_LABEL[current.langs[l.code].proof]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="editor">
                <label>标题（{langOf(lang).name}）
                  <input value={d.title} onChange={(e) => onEdit({ title: e.target.value })} placeholder="该语种稿件标题" />
                </label>
                <label>正文
                  <textarea rows={5} value={d.body} onChange={(e) => onEdit({ body: e.target.value })} placeholder="该语种导览正文" />
                </label>
                <label className={audioInvalid || audioOver ? 'field-error' : ''}>
                  音频时长（秒，上限 {MAX_AUDIO_SECONDS}s）
                  <input type="number" min="0" value={d.audioSeconds || ''} onChange={(e) => onEdit({ audioSeconds: Number(e.target.value) })} placeholder="0" />
                  <small className="hint">
                    {audioInvalid ? '⛔ 缺少音频时长，不能发布' : audioOver ? `⛔ ${d.audioSeconds}s 超过 ${MAX_AUDIO_SECONDS}s 上限，不能发布` : `时长 ${mmss(d.audioSeconds)}，符合发布要求`}
                  </small>
                </label>

                <div className="rule-bar">
                  <button className={'proof-btn ' + (d.proof === PROOF.APPROVED ? 'is-approved' : '')} onClick={() => onProof(d.proof === PROOF.APPROVED ? PROOF.PENDING : PROOF.APPROVED)}>
                    {d.proof === PROOF.APPROVED ? '✓ 已校对通过' : '○ 标记为校对通过'}
                  </button>
                  {lang === SOURCE_LANG && <small className="rule-note">中文为源稿：标题或正文变更后，其他语种自动回到待校对</small>}
                </div>

                <div className="publish-box">
                  <div className="publish-head">
                    <strong>{published ? '当前线上发布稿' : '该语种尚无发布稿'}</strong>
                    {published && <span className="status live">{mmss(published.audioSeconds)} · {fmtTs(published.createdAt)}</span>}
                  </div>
                  {published && (
                    <div className="pub-snapshot">
                      <h4>{published.title}</h4>
                      <p>{published.body}</p>
                      <small>发布原因：{published.reason}</small>
                    </div>
                  )}
                  <input className="reason-input" value={reason} onChange={(e) => setReason(e.target.value)}
                         placeholder={published ? '本次调整原因（必填留痕，默认“内容调整后重新发布”）' : '发布原因（可选）'} />
                  <div className="publish-actions">
                    {published
                      ? <button className="danger" onClick={onWithdraw}>↩ {chain.length > 1 ? '撤回并回退上一版' : '撤回（无旧版将隐藏）'}</button>
                      : <button className="danger ghost" disabled title="没有可撤回的发布稿">↩ 撤回（未发布）</button>}
                    <button className="primary" onClick={onPublish}>
                      {published ? '↻ 调整后重新发布' : '↗ 发布该语种'}
                    </button>
                  </div>
                  <small className="hint block">规则：同一展项同一语种仅保留 1 份发布稿；重新发布会归档旧稿；撤回后访客端回退上一版，无旧版则隐藏。</small>
                </div>

                <VersionChainView chain={chain} langCode={lang} />
              </div>
            </section>
          )}
        </div>
      </main>

      {logOpen && <ConflictLog conflicts={conflicts} onClose={() => setLogOpen(false)} onClear={() => setConflicts([])} />}
      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
