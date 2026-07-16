import s from '../app/stable.module.css';

/* 隠し実績バッジのストリップ(EASTER_EGG_PLAN.md)。
 * 獲得済みの称号だけを表示する — 「???ロック中」やヒントは出さない
 * (発見の楽しみを壊さないため)。0件ならセクションごと非表示。
 * 獲得条件はサーバーの秘密モジュールにのみ存在し、ここには一切来ない。 */

export interface HiddenBadge {
  key: string;
  name: string;
  flavor: string;
  tone: string;
}

const TONE_COLOR: Record<string, string> = {
  rain: '#4ea8ff',
  sun: '#f2c94c',
  storm: '#b06bff',
  mud: '#c98a4b',
  turf: '#35d07f',
  dirt: '#d9b06a',
  gold: '#ffd977',
  spirit: '#ff8fe4',
};

export function HiddenBadges({ badges, title = '獲得した称号' }: { badges: HiddenBadge[]; title?: string }) {
  if (badges.length === 0) return null;
  return (
    <section className={s.badgeStrip}>
      <div className={s.badgeStripHead}>
        <span className={s.badgeStripTitle}>{title}</span>
        <span className={s.badgeStripCount}>{badges.length}</span>
      </div>
      <div className={s.badgeGrid}>
        {badges.map((b) => {
          const c = TONE_COLOR[b.tone] ?? '#c9a86a';
          return (
            <div
              key={b.key}
              className={s.badgeCard}
              style={{ borderColor: `${c}66`, background: `linear-gradient(150deg, ${c}18, transparent 70%)` }}
              title={b.flavor}
            >
              <span className={s.badgeEmblem} style={{ background: c, boxShadow: `0 0 14px ${c}aa` }} />
              <span className={s.badgeName} style={{ color: c }}>{b.name}</span>
              <span className={s.badgeFlavor}>{b.flavor}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
