import { t } from '../i18n/index.js';
import { ACHIEVEMENTS, RANKS, rankFor } from '../engine/achievements.js';
import Icon from './Icons.jsx';
import Robot from './Robot.jsx';
import { Scramble } from './fx.jsx';

function fmtDate(iso, lang) {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Operator profile: rank, statistics and the badge wall. */
export default function ProfileScreen({ cur, save, lang }) {
  const earned = ACHIEVEMENTS.filter((a) => save.achievements[a.id]);
  const rank = rankFor(earned.length);
  const nextRank = RANKS[RANKS.indexOf(rank) + 1];
  const records = Object.values(save.missions);
  const completed = records.filter((r) => r.status === 'completed');
  const stats = [
    ['missions', completed.length],
    ['mastered', records.filter((r) => r.mastered).length],
    ['hintFree', completed.filter((r) => !r.hintLevel && !r.solutionRevealed).length],
    ['checks', save.stats.checks],
    ['runs', save.stats.runs],
    ['compileErrors', save.stats.compileErrors],
  ];
  const pct = nextRank ? ((earned.length - rank.min) / (nextRank.min - rank.min)) * 100 : 100;

  return (
    <main id="main" className="profile-screen">
      <section className="profile-card hud">
        <div className="profile-avatar" aria-hidden="true">
          <Robot size={120} mood={earned.length ? 'happy' : 'idle'} className="pip7-float" />
        </div>
        <div className="profile-id">
          <p className="small muted mono">{t(lang, 'profile.kicker')}</p>
          <h1 className="glitch" data-text={t(lang, `profile.ranks.${rank.id}`)}>
            <Scramble text={t(lang, `profile.ranks.${rank.id}`)} duration={700} />
          </h1>
          <p className="mono small">
            {t(lang, 'profile.badges', { n: earned.length, total: ACHIEVEMENTS.length })}
            {nextRank ? ` · ${t(lang, 'profile.next', { rank: t(lang, `profile.ranks.${nextRank.id}`), n: nextRank.min - earned.length })}` : ` · ${t(lang, 'profile.maxRank')}`}
          </p>
          <div className="rank-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t(lang, 'profile.rankProgress')}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <dl className="profile-stats">
          {stats.map(([k, v]) => (
            <div key={k} className="stat">
              <dt className="small muted">{t(lang, `profile.stats.${k}`)}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <h2 className="profile-h2">
        <Icon name="trophy" /> {t(lang, 'profile.wall')}
      </h2>
      <ul className="badge-grid">
        {ACHIEVEMENTS.map((a, i) => {
          const at = save.achievements[a.id];
          const [name, desc] = t(lang, `ach.${a.id}`);
          const hidden = !at && a.secret;
          return (
            <li key={a.id} className={`ach ${at ? 'ach-earned' : 'ach-locked'}`} style={{ '--i': i }}>
              <span className="ach-icon" aria-hidden="true">
                <Icon name={at ? a.icon : hidden ? 'lock' : a.icon} size={26} />
              </span>
              <div className="ach-text">
                <strong>{hidden ? t(lang, 'profile.classified') : name}</strong>
                <span className="small muted">{hidden ? t(lang, 'profile.classifiedHint') : desc}</span>
                <span className="small mono ach-state">{at ? t(lang, 'profile.earnedOn', { date: fmtDate(at, lang) }) : t(lang, 'profile.locked')}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="small muted">{t(lang, 'profile.note', { n: cur.mandatory.length })}</p>
    </main>
  );
}

/** Toast shown for each newly earned badge (decorative; also announced politely). */
export function AchievementToasts({ items, lang }) {
  if (!items.length) return null;
  // A burst of badges (e.g. an imported save) collapses into "+N more".
  const shown = items.length > 3 ? items.slice(0, 2) : items;
  const more = items.length - shown.length;
  return (
    <div className="ach-toasts" role="status" aria-live="polite">
      {more > 0 && (
        <div key={`more-${items[2].key}`} className="ach-toast hud">
          <span className="ach-icon" aria-hidden="true">
            <Icon name="trophy" size={24} />
          </span>
          <div>
            <div className="small mono ach-toast-kicker">{t(lang, 'profile.unlocked')}</div>
            <strong>{t(lang, 'profile.more', { n: more })}</strong>
          </div>
        </div>
      )}
      {shown.map((it) => {
        const a = ACHIEVEMENTS.find((x) => x.id === it.id);
        const [name] = t(lang, `ach.${it.id}`);
        return (
          <div key={it.key} className="ach-toast hud">
            <span className="ach-icon" aria-hidden="true">
              <Icon name={a?.icon || 'trophy'} size={24} />
            </span>
            <div>
              <div className="small mono ach-toast-kicker">{t(lang, 'profile.unlocked')}</div>
              <strong>{name}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}
