import React from 'react';
import { fmtTs, langOf } from './format.js';

// 规则记录 / 冲突抽屉：列出 展项、语种、原值、新值、规则
const ACTION_LABEL = {
  publish: '发布',
  republish: '重新发布',
  withdraw: '撤回',
  proof: '校对',
  'auto-reset-proof': '联动重置',
};

function val(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (v === 'pending') return '待校对';
  if (v === 'approved') return '已校对';
  if (v === 'published') return '已发布';
  if (v === 'archived') return '已归档';
  if (v === 'none') return '无（隐藏）';
  if (typeof v === 'string' && v.startsWith('v-')) return v.slice(0, 12) + '…';
  return String(v);
}

export default function ConflictLog({ conflicts, onClose, onClear }) {
  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">RULE LOG</span>
            <h2>规则记录与冲突</h2>
          </div>
          <div className="drawer-actions">
            <button className="secondary" onClick={onClear}>清空</button>
            <button className="ghost" onClick={onClose}>关闭 ✕</button>
          </div>
        </header>
        <p className="drawer-intro">
          每条记录包含：展项、语种、原值 → 新值、触发规则。<b className="blocking-text">红色为阻断性冲突</b>（操作未生效）；灰底为系统联动与正常流转留痕。
        </p>
        <div className="log-list">
          {conflicts.length === 0 && <div className="log-empty">暂无记录。试试在缺音频或超时时发布、或修改中文稿。</div>}
          {conflicts.map((c) => (
            <article key={c.id} className={'log-item ' + (c.blocking ? 'blocking' : 'benign')}>
              <div className="log-top">
                <span className="log-action">{ACTION_LABEL[c.action] || c.action}</span>
                <span className="log-lang">{langOf(c.lang).short} · {langOf(c.lang).name}</span>
                <span className={'pill ' + (c.blocking ? 'pill-block' : 'pill-ok')}>{c.blocking ? '已拦截' : '已生效'}</span>
                <time>{fmtTs(c.at)}</time>
              </div>
              <div className="log-exhibit">展项：{c.exhibitTitle || c.exhibitId}</div>
              <div className="log-diff">
                <span className="old"><i>原值</i>{val(c.oldValue)}</span>
                <span className="arrow">→</span>
                <span className="new"><i>新值</i>{val(c.newValue)}</span>
              </div>
              <p className="log-rule">规则：{c.rule}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
