import React from 'react';
import { LANGUAGES } from '../rules/constants.js';
import { mmss, fmtTs } from './format.js';

// 访客端：只读"发布快照"。无发布稿的语种对访客隐藏；撤回回退后立即读到回退版本。
export default function VisitorView({ state, pubSet, detail, detailId, detailLang, onBack, onSwitchLang, onOpen }) {
  const liveExhibits = state.exhibits.filter((ex) => LANGUAGES.some((l) => pubSet.has(`${ex.id}|${l.code}`)));

  if (detail) {
    const ex = state.exhibits.find((x) => x.id === detailId);
    if (!ex) return null;
    const liveLangs = LANGUAGES.filter((l) => pubSet.has(`${ex.id}|${l.code}`));
    const useLang = liveLangs.some((l) => l.code === detailLang) ? detailLang : liveLangs[0]?.code;
    const snap = useLang ? pubSet.get(`${ex.id}|${useLang}`) : null;
    if (!snap) {
      return (
        <div className="visitor">
          <header><div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div><button className="ghost" onClick={onBack}>← 全部展项</button></header>
          <main className="visitor-main"><p className="lead">该展项当前语种已隐藏。</p></main>
        </div>
      );
    }
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
          <button className="ghost" onClick={onBack}>← 全部展项</button>
        </header>
        <main className="detail">
          <div className="detail-art" style={{ background: ex.color }}><span>{String(state.exhibits.indexOf(ex) + 1).padStart(2, '0')}</span></div>
          <div className="detail-copy">
            <span className="eyebrow">{ex.room} / {ex.type}</span>
            <h1>{snap.title}</h1>
            <p>{snap.body}</p>
            <button className="audio" onClick={(e) => { e.currentTarget.textContent = `▶ 正在播放 · ${mmss(snap.audioSeconds)}`; }}>▶ 播放语音导览（{mmss(snap.audioSeconds)}）</button>
            <div className="lang-switch">
              {liveLangs.map((l) => (
                <button key={l.code} className={l.code === useLang ? 'on' : ''} onClick={() => onSwitchLang(l.code)}>{l.short}</button>
              ))}
            </div>
            <small className="pub-meta">线上版本 {snap.id.slice(0, 10)}… · 发布于 {fmtTs(snap.createdAt)} · 原因：{snap.reason}</small>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={onBack}>返回工作台</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>沿着作品，<em>走进</em>另一种时间。</h1>
        <p className="lead">当你靠近一件作品，它的故事就开始流动。以下为已发布、对访客可见的展项与语种。</p>
        <div className="visitor-grid">
          {liveExhibits.map((ex) => {
            const liveLangs = LANGUAGES.filter((l) => pubSet.has(`${ex.id}|${l.code}`));
            const first = liveLangs[0];
            const snap = pubSet.get(`${ex.id}|${first.code}`);
            return (
              <article className="visitor-card" key={ex.id} onClick={() => onOpen(ex.id, first.code)}>
                <div className="art" style={{ background: ex.color }}>
                  <span>{String(state.exhibits.indexOf(ex) + 1).padStart(2, '0')}</span><i>↗</i>
                </div>
                <div className="card-meta">
                  <small>{ex.room}</small>
                  <h3>{snap.title}</h3>
                  <p>{snap.body}</p>
                  <span className="card-langs">
                    {liveLangs.map((l) => <i key={l.code}>{l.short}</i>)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        {liveExhibits.length === 0 && <p className="lead" style={{ marginTop: 40 }}>当前没有任何已发布展项。</p>}
      </main>
    </div>
  );
}
