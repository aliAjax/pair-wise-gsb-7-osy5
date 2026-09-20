import React from 'react';
import { langOf, mmss, fmtTs } from './format.js';

// 版本链：新 → 旧，展示发布稿归档历史（撤回回退后顺序仍正确）
export default function VersionChainView({ chain, langCode }) {
  return (
    <div className="chain-block">
      <div className="chain-head">
        <h3>{langOf(langCode).name}版本链</h3>
        <span>{chain.length} 个版本</span>
      </div>
      {chain.length === 0 && <p className="chain-empty">尚无版本。首次发布后生成第 1 版。</p>}
      <ol className="chain">
        {chain.map((v, i) => (
          <li key={v.id} className={'chain-node ' + (v.status === 'published' ? 'is-pub' : 'is-arch')}>
            <span className="chain-rail"><i></i>{i < chain.length - 1 && <b></b>}</span>
            <div className="chain-card">
              <div className="chain-card-top">
                <strong>{v.status === 'published' ? `线上版本` : `历史版本`}</strong>
                <span className={'status ' + (v.status === 'published' ? 'live' : 'draft')}>
                  {v.status === 'published' ? '发布中' : v.withdrawn ? '已撤回' : '已归档'}
                </span>
                <time>{fmtTs(v.createdAt)}</time>
              </div>
              <h4>{v.title || '（无标题）'}</h4>
              <p>{v.body || '（无正文）'}</p>
              <div className="chain-meta">
                <span>音频 {mmss(v.audioSeconds)}</span>
                <span>原因：{v.reason || '—'}</span>
                {v.restoredAt && <span className="restored">⟲ 撤回时回退恢复</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
