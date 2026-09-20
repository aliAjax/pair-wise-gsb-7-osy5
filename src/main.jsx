import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  LANGS, LANG_LABEL, PROOF, PROOF_LABEL, MAX_AUDIO_SECONDS,
  fmtDuration, chainOf, publishedOf, exhibitName,
} from './rules.js';
import * as store from './store.js';

const fmtTime = t => new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const publishedCount = ex => LANGS.filter(l => publishedOf(ex, l.code)).length;

// 冲突清单：展项 / 语种 / 字段 / 原值 / 新值 / 规则
function Conflicts({ conflicts, onClose }) {
  return (
    <div className="conflicts">
      <div className="conf-head">
        <strong>发布被拦截 · {conflicts.length} 条冲突</strong>
        <button onClick={onClose}>知道了</button>
      </div>
      <div className="conf-row head"><span>展项</span><span>语种</span><span>字段</span><span>原值</span><span>新值</span><span>规则</span></div>
      {conflicts.map((c, i) => (
        <div className="conf-row" key={i}>
          <span title={c.exhibit}>{c.exhibit}</span>
          <span>{c.langLabel}</span>
          <span>{c.field}</span>
          <span className="old" title={c.oldValue}>{c.oldValue}</span>
          <span className="new" title={c.newValue}>{c.newValue}</span>
          <span className="rule">{c.ruleLabel}</span>
        </div>
      ))}
    </div>
  );
}

// 版本链：新稿在上，当前发布高亮，旧稿保留为历史
function VersionChain({ ex, lang }) {
  const chain = chainOf(ex, lang);
  return (
    <div className="versions">
      <h3>版本链 · {LANG_LABEL[lang]}</h3>
      {chain.length === 0 && <p className="hint">暂无版本。每次发布会在此留下一份带原因的快照，旧稿不会被覆盖。</p>}
      {[...chain].reverse().map(v => {
        const current = ex.published[lang] === v.id;
        return (
          <div className={'ver-row ' + (current ? 'current' : '')} key={v.id}>
            <span className="ver-n">v{v.n}</span>
            <span className="ver-main">
              <strong>{v.title || '(无标题)'}</strong>
              <small>{v.reason} · {fmtTime(v.at)} · 音频 {fmtDuration(v.audioDuration)}</small>
            </span>
            <span className={'status ' + (current ? 'live' : 'draft')}>{current ? '当前发布' : '历史稿'}</span>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [state, setState] = useState(store.load);
  const [selected, setSelected] = useState(() => store.load().exhibits[0]?.id);
  const [lang, setLang] = useState('zh');
  const [visitorLang, setVisitorLang] = useState('zh');
  const [view, setView] = useState('edit');
  const [filter, setFilter] = useState('全部');
  const [form, setForm] = useState({ title: '', room: '', desc: '' });
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [notice, setNotice] = useState('');

  // 任何变更都落盘，刷新后由 reconcile 校正，保证状态 / 发布稿 / 版本链一致
  useEffect(() => { store.save(state); }, [state]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const current = state.exhibits.find(x => x.id === selected) || state.exhibits[0];
  const script = current?.scripts[lang];
  const pub = current ? publishedOf(current, lang) : null;

  const visible = useMemo(() => state.exhibits.filter(x => {
    if (filter === '全部') return true;
    const n = publishedCount(x);
    return filter === '已发布' ? n > 0 : n === 0;
  }), [state, filter]);

  const patch = p => setState(s => store.updateScript(s, current.id, lang, p));
  const approve = () => {
    setState(s => store.approveScript(s, current.id, lang));
    setNotice(`${LANG_LABEL[lang]}稿已标记为已校对`);
  };
  const doPublish = () => {
    if (!reason.trim()) { setNotice('请先填写本次调整原因，发布会记入版本链'); return; }
    const r = store.publishScript(state, current.id, lang, reason.trim());
    if (r.ok) {
      setState(r.state);
      setConflicts([]);
      setReason('');
      setNotice(`已发布 ${LANG_LABEL[lang]} v${r.version.n}，访客预览已更新`);
    } else {
      setConflicts(r.conflicts);
      setNotice(`发布被拦截：${r.conflicts.length} 条冲突，见下方清单`);
    }
  };
  const doWithdraw = () => {
    const r = store.withdrawScript(state, current.id, lang);
    setState(r.state);
    setNotice(r.rolledBackTo ? `已撤回，访客预览回退到 v${r.rolledBackTo.n}` : '已无更早版本，该语种对访客隐藏');
  };
  const add = () => {
    if (!form.title.trim()) return;
    const r = store.addExhibit(state, { title: form.title, room: form.room, body: form.desc });
    setState(r.state);
    setSelected(r.id);
    setLang('zh');
    setForm({ title: '', room: '', desc: '' });
    setNotice('展项已保存，中文稿待校对');
  };
  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = 'exhibition-guide.json';
    a.click();
    setNotice('已导出展项数据');
  };

  // ---- 访客预览：只读发布稿；某语种无发布稿的展项直接隐藏 ----
  if (view === 'visitor') {
    const cards = state.exhibits.map(ex => ({ ex, pub: publishedOf(ex, visitorLang) })).filter(x => x.pub);
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
          <div className="visitor-langs">
            {LANGS.map(l => (
              <button key={l.code} className={visitorLang === l.code ? 'on' : ''} onClick={() => setVisitorLang(l.code)}>{l.label}</button>
            ))}
          </div>
          <button className="ghost" onClick={() => setView('edit')}>返回工作台</button>
        </header>
        <main className="visitor-main">
          <span className="eyebrow">VISITOR GUIDE / {LANG_LABEL[visitorLang]}</span>
          <h1>沿着作品，<em>走进</em>另一种时间。</h1>
          <p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p>
          {cards.length === 0 && <p className="lead">该语种暂无已发布的导览内容。</p>}
          <div className="visitor-grid">
            {cards.map(({ ex, pub: p }) => (
              <article className="visitor-card" key={ex.id} onClick={() => { setSelected(ex.id); setView('detail'); }}>
                <div className="art" style={{ background: ex.color }}><span>{String(ex.id).padStart(2, '0')}</span><i>↗</i></div>
                <div className="card-meta">
                  <small>{ex.room} · 音频 {fmtDuration(p.audioDuration)}</small>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (view === 'detail' && current) {
    const p = publishedOf(current, visitorLang);
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
          <button className="ghost" onClick={() => setView('visitor')}>← 全部展项</button>
        </header>
        {p ? (
          <main className="detail">
            <div className="detail-art" style={{ background: current.color }}><span>{String(current.id).padStart(2, '0')}</span></div>
            <div className="detail-copy">
              <span className="eyebrow">{current.room} / {current.type} / {LANG_LABEL[visitorLang]}</span>
              <h1>{p.title}</h1>
              <p>{p.body}</p>
              <button className="audio" onClick={() => setNotice('正在播放导览音频…')}>▶ 播放语音导览（{fmtDuration(p.audioDuration)}）</button>
              <div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div>
            </div>
          </main>
        ) : (
          <main className="visitor-main"><p className="lead">该语种的导览尚未发布或已撤回。</p></main>
        )}
        {notice && <div className="toast">{notice}</div>}
      </div>
    );
  }

  // ---- 工作台 ----
  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project"><span className="project-dot"></span><div><strong>潮汐之后</strong><small>2024 春季展</small></div><span>⌄</span></div>
        <nav>
          <button className="active">▧ <span>展项内容</span><b>{state.exhibits.length}</b></button>
          <button>⌁ <span>展厅动线</span></button>
          <button>◉ <span>二维码</span></button>
        </nav>
        <div className="side-foot">
          <div className="side-rules">
            <span className="side-label">发布规则</span>
            <small>· 中文稿变更 → 其他语种回到待校对</small>
            <small>· 缺音频或超过 {fmtDuration(MAX_AUDIO_SECONDS)} 不可发布</small>
            <small>· 每语种仅 1 份发布稿，旧稿留在版本链</small>
            <small>· 撤回后回退上一版，无旧版则隐藏</small>
          </div>
          <button>⚙ 设置</button>
          <small>已自动保存 · 刚刚</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">EXHIBITION BUILDER</span><h1>展项内容 · 多语言导览稿</h1></div>
          <div className="top-actions">
            <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
            <button className="primary" onClick={() => setView('visitor')}>◉ 访客预览 <span>↗</span></button>
          </div>
        </header>
        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{state.exhibits.length} 个展项</span></div>
              <button className="add-btn" onClick={() => document.querySelector('.new-form').scrollIntoView({ behavior: 'smooth' })}>＋ 添加展项</button>
            </div>
            <div className="filters">
              {['全部', '已发布', '草稿'].map(x => <button className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>)}
            </div>
            <div className="exhibit-list">
              {visible.map(x => {
                const n = publishedCount(x);
                return (
                  <button className={'exhibit-row ' + (selected === x.id ? 'chosen' : '')} key={x.id} onClick={() => setSelected(x.id)}>
                    <span className="thumb" style={{ background: x.color }}>{String(x.id).padStart(2, '0')}</span>
                    <span className="row-copy">
                      <strong>{exhibitName(x)}</strong>
                      <small>{x.room} · {x.type}</small>
                    </span>
                    <span className="lang-dots">
                      {LANGS.map(l => <i key={l.code} className={'ld ' + (publishedOf(x, l.code) ? 'on' : '')} title={`${l.label}${publishedOf(x, l.code) ? '已发布' : '未发布'}`} />)}
                    </span>
                    <span className={'status ' + (n ? 'live' : 'draft')}>{n ? `已发布 ${n}/3` : '草稿'}</span>
                    <span className="chev">›</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="form-panel">
            {current && script && (
              <>
                <div className="panel-title">
                  <div><span className="eyebrow">SCRIPT EDITOR</span><h2>{exhibitName(current)}</h2></div>
                  <span className={'status ' + (script.status === PROOF.APPROVED ? 'live' : 'draft')}>{PROOF_LABEL[script.status]}</span>
                </div>
                <div className="lang-tabs">
                  {LANGS.map(l => {
                    const s = current.scripts[l.code];
                    const p = publishedOf(current, l.code);
                    return (
                      <button key={l.code} className={'lang-tab ' + (lang === l.code ? 'active' : '')} onClick={() => setLang(l.code)}>
                        <i className={'dot ' + (s.status === PROOF.APPROVED ? 'ok' : '')} />{l.label}{p && <em>· 已发布</em>}
                      </button>
                    );
                  })}
                </div>
                <div className="rule-note">
                  {lang === 'zh'
                    ? '中文是源语言：修改中文稿后，其他语种会自动回到「待校对」，需重新校对才能发布。'
                    : `翻译稿需跟随中文源稿。校对通过、音频齐全且不超 ${fmtDuration(MAX_AUDIO_SECONDS)} 才能发布。`}
                </div>
                <div className="editor">
                  <label>导览标题（{LANG_LABEL[lang]}）<input value={script.title} onChange={e => patch({ title: e.target.value })} /></label>
                  <label>导览正文<textarea rows="5" value={script.body} onChange={e => patch({ body: e.target.value })} /></label>
                  <div className="two">
                    <label>音频时长（秒）
                      <input type="number" min="0" value={script.audioDuration ?? ''} placeholder="留空表示无音频"
                        onChange={e => patch({ audioDuration: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </label>
                    <div className="dur">当前 {fmtDuration(script.audioDuration)} · 上限 {fmtDuration(MAX_AUDIO_SECONDS)}</div>
                  </div>
                  <div className="proof-row">
                    <span className={'status ' + (script.status === PROOF.APPROVED ? 'live' : 'draft')}>{PROOF_LABEL[script.status]}</span>
                    <button className="secondary" disabled={script.status === PROOF.APPROVED} onClick={approve}>标记为已校对</button>
                  </div>
                  <div className="pub-box">
                    <div className="rule-note">发布规则：校对通过 · 音频必填且不超 {fmtDuration(MAX_AUDIO_SECONDS)} · 每次调整须填写原因，旧稿保留在版本链，同一语种只留 1 份发布稿。</div>
                    <input placeholder="本次调整原因（如：首次发布 / 修订译文）" value={reason} onChange={e => setReason(e.target.value)} />
                    <div className="pub-actions">
                      <button className="primary" onClick={doPublish}>发布 {LANG_LABEL[lang]} 稿 <span>↗</span></button>
                      <button className="secondary" disabled={!pub} onClick={doWithdraw}>撤回（回退上一版）</button>
                    </div>
                    {pub
                      ? <small className="hint">当前发布：v{pub.n} · {pub.reason} · {fmtTime(pub.at)}</small>
                      : <small className="hint">该语种尚未发布，访客不可见。</small>}
                  </div>
                </div>
                {conflicts.length > 0 && <Conflicts conflicts={conflicts} onClose={() => setConflicts([])} />}
                <VersionChain ex={current} lang={lang} />
              </>
            )}
            <div className="new-form">
              <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
              <div className="two">
                <input placeholder="展项标题（中文）" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                <input placeholder="展厅编号" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} />
              </div>
              <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} />
              <button className="primary full" onClick={add}>保存新展项</button>
            </div>
          </section>
        </div>
      </main>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
