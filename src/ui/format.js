// 界面层辅助：纯展示格式化
import { LANGUAGES } from '../rules/constants.js';

export const langOf = (code) => LANGUAGES.find((l) => l.code === code) || { name: code, short: code };

export const mmss = (sec) => {
  const n = Number(sec) || 0;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtTs = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const exhibitTitle = (ex, lang = 'zh-CN') =>
  ex.langs[lang]?.title?.trim() || ex.langs['zh-CN']?.title?.trim() || ex.room || '未命名展项';
