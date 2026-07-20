'use client';

import { useState } from 'react';
import { TRAINING_MENUS_V2, type TrainingMenuV2 } from '@sevendays/domain';

/* ============================================================================
 * /dev/train-panel-preview — 馬詳細「今日の調教」パネルの再設計案(2026-07-20)
 *
 * オーナー指摘: 「ごちゃごちゃしている。もっと良いのがある気がする」
 * 現行の内訳 = 見出し3 + 長い説明文2 + 横スクロールのカード列2 + ボタン4 が
 * 縦に積まれ、1画面に収まらない。
 *
 * 3案とも「情報は減らさず、同時に見せる量を減らす」方針。中身のルール
 * (公開レンジ・1レース1個・確定即最終)は一切変えない=経済/法務に影響なし。
 * これはモック(API非接続・状態はローカル)。採用案を実装に落とす前提。
 * ========================================================================== */

const MENU_JA: Record<TrainingMenuV2, string> = {
  HILL: '坂路', POOL: 'プール', SPAR: '併せ馬', GATE: 'ゲート練習', WOOD: 'ウッドチップ', REST: '休養',
};

interface MockItem { key: string; name: string; fx: string; price: number; band: string }
const TRAIN_ITEMS: MockItem[] = [
  { key: 'carrot_cube', name: 'にんじんキューブ', fx: 'ロールに +1.0', price: 2, band: 'ベーシック' },
  { key: 'highland_hay', name: '高原の干し草', fx: 'ロールに +1.0〜+2.0', price: 3, band: 'ベーシック' },
  { key: 'protein_mash', name: 'プロテインマッシュ', fx: 'ロールに +2.0〜+3.5', price: 5, band: 'スタンダード' },
  { key: 'royal_banquet', name: 'ロイヤルフィースト', fx: 'ロールに +3.0〜+5.0', price: 8, band: 'プレミアム' },
];
const RACE_ITEMS: MockItem[] = [
  { key: 'rain_cape', name: '雨のケープ', fx: '雨系に備え 的中+1.5 / 外れ−1.0', price: 2, band: 'ベーシック' },
  { key: 'sun_visor', name: '陽よけのバイザー', fx: '晴れ系に備え 的中+1.5 / 外れ−1.0', price: 2, band: 'ベーシック' },
  { key: 'mud_shoes', name: '道悪蹄鉄', fx: '道悪に備え 的中+1.5 / 外れ−1.0', price: 2, band: 'ベーシック' },
  { key: 'full_harness', name: '完全装備', fx: '両軸に備え 的中+2.0 / 外れ−2.0', price: 8, band: 'プレミアム' },
];

const C = {
  panel: {
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16,
    background: 'linear-gradient(180deg, rgba(20,18,34,0.6), rgba(10,8,19,0.6))',
  } as React.CSSProperties,
  head: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em' } as React.CSSProperties,
  faint: { color: 'var(--faint)', fontSize: 11, lineHeight: 1.6 } as React.CSSProperties,
  mono: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--faint)', letterSpacing: '0.06em' } as React.CSSProperties,
};

/** 共通: メニュー6枚のグリッド(3案とも同じ — ここは現行のまま良いという判断) */
function MenuGrid({ menus, setMenus }: { menus: TrainingMenuV2[]; setMenus: (m: TrainingMenuV2[]) => void }) {
  const countOf = (k: TrainingMenuV2) => menus.filter((m) => m === k).length;
  const full = menus.length >= 2;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
      {TRAINING_MENUS_V2.map((spec) => {
        const n = countOf(spec.key);
        const isRest = spec.key === 'REST';
        return (
          <button
            key={spec.key}
            type="button"
            onClick={() => {
              if (!full) setMenus([...menus, spec.key]);
              else if (n > 0) setMenus(menus.filter((m) => m !== spec.key));
            }}
            style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 11,
              border: `1px solid ${n > 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.1)'}`,
              background: n > 0 ? 'rgba(0,234,255,0.08)' : 'rgba(10,8,22,0.5)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
              {MENU_JA[spec.key]}{n === 2 ? <span style={{ color: 'var(--cyan)', fontSize: 9 }}> ×2</span> : null}
            </span>
            <span style={{ ...C.mono, color: isRest ? 'var(--gold-bright)' : 'var(--muted)' }}>
              {isRest ? '減衰を1回無効' : `${spec.min >= 0 ? '+' : ''}${spec.min}..+${spec.max}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 案A/Cで使う「1行アイテム」— 大カードをやめて縦に短く、効果と価格を1行で読む */
function ItemRow({ it, on, onClick }: { it: MockItem; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%',
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10,
        border: `1px solid ${on ? 'var(--cyan)' : 'rgba(255,255,255,0.09)'}`,
        background: on ? 'rgba(0,234,255,0.08)' : 'transparent',
      }}
    >
      <img src={`/items/${it.key}.webp`} alt="" width={30} height={30} style={{ borderRadius: 6, flex: 'none' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{it.name}</span>
        <span style={{ ...C.faint, fontSize: 10 }}>{it.fx}</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gold-bright)', flex: 'none' }}>
        {it.price} USDT
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- 案A: タブ */
function PlanA() {
  const [tab, setTab] = useState<'train' | 'titem' | 'ritem'>('train');
  const [menus, setMenus] = useState<TrainingMenuV2[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [tItem, setTItem] = useState('');
  const [rItem, setRItem] = useState('');

  const tabs = [
    { k: 'train' as const, label: '調教', badge: confirmed ? '確定済' : '無料', tone: confirmed ? 'done' : 'free' },
    { k: 'titem' as const, label: '調教アイテム', badge: tItem ? '使用済' : null, tone: 'done' },
    { k: 'ritem' as const, label: 'レース備え', badge: rItem ? '装備中' : null, tone: 'race' },
  ];

  return (
    <div style={C.panel}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tabs.map((tb) => (
          <button
            key={tb.k}
            type="button"
            onClick={() => setTab(tb.k)}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 9,
              border: `1px solid ${tab === tb.k ? 'var(--cyan)' : 'rgba(255,255,255,0.08)'}`,
              background: tab === tb.k ? 'rgba(0,234,255,0.1)' : 'transparent',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11.5,
              color: tab === tb.k ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {tb.label}
            {tb.badge ? (
              <span style={{
                marginLeft: 5, fontSize: 8.5, padding: '1px 5px', borderRadius: 999,
                color: tb.tone === 'race' ? 'var(--magenta-soft)' : tb.tone === 'done' ? '#35d07f' : 'var(--gold-bright)',
                border: `1px solid ${tb.tone === 'race' ? 'rgba(255,45,196,0.4)' : tb.tone === 'done' ? 'rgba(53,208,127,0.4)' : 'rgba(201,168,106,0.4)'}`,
              }}>{tb.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'train' ? (
        confirmed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...C.head, color: 'var(--cyan)' }}>確定済み — 総合値 +5.46</div>
            <div style={{ ...C.faint }}>坂路 +3.2 / ゲート練習 +2.26 — このレースの調教は確定済みです。</div>
            <button type="button" onClick={() => setConfirmed(false)} style={{ alignSelf: 'flex-start' }}>
              もう一度(モック)
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={C.faint}>6つのメニューから2つまで。確定した瞬間に結果がロールされます(やり直し不可)。</div>
            <MenuGrid menus={menus} setMenus={setMenus} />
            <div style={{ minHeight: 22, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {menus.map((m, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--cyan)',
                  border: '1px solid rgba(0,234,255,0.35)', borderRadius: 999, padding: '2px 9px',
                }}>{MENU_JA[m]}</span>
              ))}
            </div>
            <button type="button" disabled={menus.length === 0} onClick={() => setConfirmed(true)}>
              この調教にする(今夜20:00まで)
            </button>
            <div style={C.mono}>SOFT CAP 85 / DECAY −2.0</div>
          </div>
        )
      ) : null}

      {tab === 'titem' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={C.faint}>
            調教とは<b>別の行為</b>。確定したロールに1個だけ上乗せできます(レース処理前まで)。
          </div>
          {!confirmed ? (
            <div style={{
              ...C.faint, color: 'var(--gold-bright)', border: '1px solid rgba(201,168,106,0.35)',
              borderRadius: 9, padding: '7px 10px', background: 'rgba(201,168,106,0.08)',
            }}>
              先に「調教」タブで確定してください。
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {TRAIN_ITEMS.map((it) => (
              <ItemRow key={it.key} it={it} on={tItem === it.key} onClick={() => setTItem(tItem === it.key ? '' : it.key)} />
            ))}
          </div>
          <button type="button" disabled={!confirmed || !tItem}>
            {tItem ? `${TRAIN_ITEMS.find((i) => i.key === tItem)!.name}を買って使う` : 'アイテムを選ぶ'}
          </button>
        </div>
      ) : null}

      {tab === 'ritem' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={C.faint}>
            予報(的中率70%)を読んで次のレースに備える。的中で適性が上限側へ、外れると下限側へ下がります。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {RACE_ITEMS.map((it) => (
              <ItemRow key={it.key} it={it} on={rItem === it.key} onClick={() => setRItem(rItem === it.key ? '' : it.key)} />
            ))}
          </div>
          <button type="button" disabled={!rItem}>
            {rItem ? `${RACE_ITEMS.find((i) => i.key === rItem)!.name}を買って使う` : 'アイテムを選ぶ'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ 案B: ステップ */
function PlanB() {
  const [menus, setMenus] = useState<TrainingMenuV2[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [tItem, setTItem] = useState('');
  const [tUsed, setTUsed] = useState(false);
  const [rItem, setRItem] = useState('');
  const [rUsed, setRUsed] = useState(false);
  const [open, setOpen] = useState<2 | 3 | null>(null);

  const Step = ({ n, title, state, children }: {
    n: number; title: string; state: 'done' | 'active' | 'locked'; children?: React.ReactNode;
  }) => (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 0',
      borderTop: n === 1 ? 'none' : '1px solid rgba(255,255,255,0.07)',
      opacity: state === 'locked' ? 0.45 : 1,
    }}>
      <span style={{
        flex: 'none', width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        color: state === 'done' ? '#04141a' : state === 'active' ? '#04141a' : 'var(--muted)',
        background: state === 'done' ? '#35d07f' : state === 'active' ? 'var(--cyan)' : 'transparent',
        border: state === 'locked' ? '1px solid rgba(255,255,255,0.2)' : 'none',
      }}>{state === 'done' ? '✓' : n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ ...C.head, fontSize: 12 }}>{title}</span>
        {children}
      </div>
    </div>
  );

  return (
    <div style={C.panel}>
      <Step n={1} title={confirmed ? '調教 — 確定済み(総合値 +5.46)' : '調教を確定する(無料・1日1回)'} state={confirmed ? 'done' : 'active'}>
        {confirmed ? (
          <span style={C.faint}>坂路 +3.2 / ゲート練習 +2.26 — やり直しはできません。</span>
        ) : (
          <>
            <span style={C.faint}>6つから2つまで選ぶ。確定した瞬間に結果がロールされます。</span>
            <MenuGrid menus={menus} setMenus={setMenus} />
            <div style={{ minHeight: 22, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {menus.map((m, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--cyan)',
                  border: '1px solid rgba(0,234,255,0.35)', borderRadius: 999, padding: '2px 9px',
                }}>{MENU_JA[m]}</span>
              ))}
            </div>
            <button type="button" disabled={menus.length === 0} onClick={() => { setConfirmed(true); setOpen(2); }}>
              この調教にする
            </button>
          </>
        )}
      </Step>

      <Step
        n={2}
        title={tUsed ? '調教アイテム — 使用済み(+1.9)' : '調教アイテムで上乗せする(任意・有料)'}
        state={tUsed ? 'done' : confirmed ? 'active' : 'locked'}
      >
        {!confirmed ? (
          <span style={C.faint}>①の確定後に使えます。</span>
        ) : tUsed ? (
          <span style={C.faint}>にんじんキューブ +1.9 — 1レースに1個。次のサイクルでまた使えます。</span>
        ) : open === 2 ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {TRAIN_ITEMS.map((it) => (
                <ItemRow key={it.key} it={it} on={tItem === it.key} onClick={() => setTItem(tItem === it.key ? '' : it.key)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={!tItem} onClick={() => setTUsed(true)}>買って使う</button>
              <button type="button" className="secondary" onClick={() => { setOpen(3); }}>使わない</button>
            </div>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setOpen(2)} style={{ alignSelf: 'flex-start' }}>
            アイテムを見る(4種)
          </button>
        )}
      </Step>

      <Step
        n={3}
        title={rUsed ? 'レース備え — 雨のケープ 装備中' : '次のレースに備える(任意・有料)'}
        state={rUsed ? 'done' : 'active'}
      >
        {rUsed ? (
          <span style={C.faint}>的中なら適性が上限側へ、外れると下限側へ。レース前なら取消できます。</span>
        ) : open === 3 ? (
          <>
            <span style={C.faint}>予報(的中率70%)を読んで備える。的中で上がり、外れで下がります。</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {RACE_ITEMS.map((it) => (
                <ItemRow key={it.key} it={it} on={rItem === it.key} onClick={() => setRItem(rItem === it.key ? '' : it.key)} />
              ))}
            </div>
            <button type="button" disabled={!rItem} onClick={() => setRUsed(true)}>買って使う</button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setOpen(3)} style={{ alignSelf: 'flex-start' }}>
            アイテムを見る(4種)
          </button>
        )}
      </Step>
    </div>
  );
}

/* --------------------------------------------------------------- 案C: 圧縮 */
function PlanC() {
  const [menus, setMenus] = useState<TrainingMenuV2[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [cls, setCls] = useState<'TRAIN' | 'RACE'>('TRAIN');
  const [sel, setSel] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const items = cls === 'TRAIN' ? TRAIN_ITEMS : RACE_ITEMS;

  return (
    <div style={C.panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ ...C.head, color: 'var(--cyan)' }}>今日の調教</span>
        <span style={{ ...C.mono, border: '1px solid rgba(53,208,127,0.4)', color: '#35d07f', borderRadius: 999, padding: '1px 7px' }}>
          無料 · 1日1回
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          style={{
            all: 'unset', cursor: 'pointer', width: 20, height: 20, borderRadius: 999, display: 'grid',
            placeItems: 'center', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--muted)', fontSize: 11,
          }}
          aria-label="調教のルール"
        >?</button>
      </div>
      {showHelp ? (
        <div style={{ ...C.faint, marginBottom: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(0,0,0,0.25)' }}>
          調教は各レース前に1回。6つのメニューから2つまで選び(同じメニュー×2も可)、確定した瞬間に
          結果がロールされます — やり直しはできません。馬ごとに「大好物」と「苦手」の隠れた好みがあり、
          タイプごとの傾向は攻略で学べます。RESTは減衰(−2.0/レース)を1回無効にする手入れです。
        </div>
      ) : null}

      {confirmed ? (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 12px', borderRadius: 10,
          border: '1px solid rgba(0,234,255,0.3)', background: 'rgba(0,234,255,0.06)', marginBottom: 12,
        }}>
          <span style={{ ...C.mono, color: 'var(--cyan)' }}>確定済み</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--cyan)' }}>+5.46</span>
          <span style={C.faint}>坂路 +3.2 / ゲート練習 +2.26</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <MenuGrid menus={menus} setMenus={setMenus} />
          <div style={{ minHeight: 22, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {menus.map((m, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--cyan)',
                border: '1px solid rgba(0,234,255,0.35)', borderRadius: 999, padding: '2px 9px',
              }}>{MENU_JA[m]}</span>
            ))}
          </div>
          <button type="button" disabled={menus.length === 0} onClick={() => setConfirmed(true)}>
            この調教にする(今夜20:00まで)
          </button>
          <div style={C.mono}>SOFT CAP 85 / DECAY −2.0</div>
        </div>
      )}

      {/* アイテムは1区画に統合し、分類チップで切り替える(横スクロール廃止) */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...C.head, fontSize: 12 }}>アイテム</span>
          <span style={{ ...C.mono }}>任意 · 有料</span>
          <span style={{ flex: 1 }} />
          {(['TRAIN', 'RACE'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setCls(k); setSel(''); }}
              style={{
                all: 'unset', cursor: 'pointer', fontSize: 10.5, padding: '3px 10px', borderRadius: 999,
                fontFamily: 'var(--font-display)', fontWeight: 700,
                color: cls === k ? '#04141a' : 'var(--muted)',
                background: cls === k ? (k === 'TRAIN' ? 'var(--cyan)' : 'var(--magenta)') : 'transparent',
                border: `1px solid ${cls === k ? 'transparent' : 'rgba(255,255,255,0.15)'}`,
              }}
            >{k === 'TRAIN' ? '調教' : 'レース'}</button>
          ))}
        </div>
        <div style={{ ...C.faint, marginBottom: 8 }}>
          {cls === 'TRAIN'
            ? '確定したロールに1個だけ上乗せ(調教とは別の行為・レース処理前まで)。'
            : '予報(的中率70%)への備え。的中で適性が上限側へ、外れると下限側へ。'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((it) => (
            <ItemRow key={it.key} it={it} on={sel === it.key} onClick={() => setSel(sel === it.key ? '' : it.key)} />
          ))}
        </div>
        <button
          type="button"
          disabled={!sel || (cls === 'TRAIN' && !confirmed)}
          style={{ marginTop: 10 }}
        >
          {cls === 'TRAIN' && !confirmed
            ? '使うには先に調教を確定'
            : sel ? `${items.find((i) => i.key === sel)!.name}を買って使う` : 'アイテムを選ぶ'}
        </button>
      </div>
    </div>
  );
}

export default function TrainPanelPreview() {
  const plans = [
    {
      k: 'A', title: '案A — タブで1つずつ',
      note: '調教 / 調教アイテム / レース備え を切替。同時に見えるのは1つだけなので、パネルの高さがほぼ一定になり縦スクロールが消える。タブのバッジ(確定済・使用済・装備中)で、開かなくても状態が分かる。',
      el: <PlanA />,
    },
    {
      k: 'B', title: '案B — 手順(①→②→③)',
      note: '「まず調教 → 上乗せ → レースに備える」の順序をそのまま画面にする。終わった段は1行に畳まれ、進むほど画面が短くなる。初めての人が迷わない代わりに、慣れると①が毎回畳まれるまで縦に長い。',
      el: <PlanB />,
    },
    {
      k: 'C', title: '案C — 今の構成のまま密度を下げる',
      note: '構造は今のまま、①長い説明を「?」に畳む ②アイテムを大カード横スクロール→1行リスト ③調教/レースのアイテム2区画を1区画+分類チップに統合。変更が一番小さく、今の操作感を保てる。',
      el: <PlanC />,
    },
  ];
  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 18px 80px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>
        調教パネル 再設計案 — /dev/train-panel-preview
      </h1>
      <p style={{ ...C.faint, marginBottom: 22, maxWidth: 900 }}>
        現行は「見出し3 + 長い説明文2 + 横スクロールのカード列2 + ボタン4」が縦に積まれ、1画面に収まらない。
        3案とも<b>ルールは不変</b>(公開レンジ・1レース1個・確定即最終)で、同時に見せる量だけを減らしている。
        触って比べられるモック(API非接続)。
      </p>
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', alignItems: 'start' }}>
        {plans.map((p) => (
          <section key={p.k}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 4 }}>{p.title}</h2>
            <p style={{ ...C.faint, marginBottom: 10, minHeight: 66 }}>{p.note}</p>
            {p.el}
          </section>
        ))}
      </div>
    </main>
  );
}
