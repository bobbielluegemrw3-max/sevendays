'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * /champion 憧れリデザイン — デザイナー正典 Champion.html の忠実写経(仕様書.md)。
 * 色/余白/角丸/タイポ/アニメの厳密値は正典が正。正典のインラインスタイル文字列を
 * そのまま保持してドリフトを排除する(市場/アイテムのプレビューと同方式)。
 *
 * ★これはプレビュー(視覚承認用)。機構(buybacks/hall API・報酬ルール)には触れない。
 * 既定は R1 準拠の空状態(hall=[]/buybacks=[])= 架空チャンピオンを出さない。
 * 承認後に本番 ChampionView / ChampionHero へ結線。
 */

// ── 正典の fixture(Champion Page.dc.html の PAYOFFS/THRONES/LEAGUE/ladder) ──
const PAYOFFS = [
  { kicker: '確定報酬', title: '200 USDT', forever: false,
    desc: '7 レースを走破すると確定で受け取れる現金報酬。', foot: '7回に分けて支払い' },
  { kicker: '永久の記念NFT', title: '永遠に残る一頭', forever: true,
    desc: 'あなたの馬が唯一の形で刻まれる記念NFT。走り切った証として、ずっと残ります。', foot: 'あなたの所有・譲渡不可の栄誉' },
  { kicker: '殿堂 永久掲載', title: 'HALL OF CHAMPIONS', forever: true,
    desc: '7 レースを走り切った証として、馬の名が殿堂に永久に掲載されます。', foot: '誰でも見られる公開の栄誉' },
  { kicker: '独占参加権', title: 'リーグの切符', forever: false,
    desc: '未来の週次競技に入れるのはチャンピオンだけ。開幕前に資格を確保できます。', foot: 'CHAMPION LEAGUE — 10,000人到達で開幕' },
];
const THRONES: Array<[string, string]> = [
  ['I', '最初の王'], ['II', '—'], ['III', '—'], ['IV', '—'], ['V', '—'],
];
const LEAGUE: Array<[string, string]> = [
  ['WEEKLY RACES', '毎週の競技。クラスを勝ち上がって上位を目指します。'],
  ['PRIZE POOL', '週ごとの賞金プール。上位入着に配分されます。'],
  ['RETIREMENT', '引退制度。走り切った馬に記録が残ります。'],
  ['FAN PASS — 3 USDT', 'ファンとしてリーグを観戦できるパス。'],
];
const LADDER_NAMES = ['Maiden', '1勝', '2勝', '3勝', 'G3', 'G2', 'G1'];

const tab = (on: boolean): string =>
  'appearance:none;padding:6px 15px;border:none;border-radius:999px;cursor:pointer;font:700 12px/1 var(--font-jp);' +
  (on ? 'background:linear-gradient(100deg,var(--gold),var(--gold-bright));color:#150410' : 'background:transparent;color:var(--muted)');

function embersHtml(): string {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8]
    .map((i) => {
      const left = 4 + i * 7.5;
      const dur = (5 + (i % 4) * 1.4).toFixed(1);
      const del = (i * 0.72).toFixed(1);
      const sz = i % 3 === 0 ? 3 : 2;
      const color = i % 3 === 0 ? '#ffb08a' : '#ff8a6a';
      return `<span style="position:absolute;bottom:6%;left:${left}%;width:${sz}px;height:${sz}px;border-radius:50%;background:${color};box-shadow:0 0 8px rgba(255,140,100,.9);opacity:0;animation:chEmber ${dur}s linear infinite;animation-delay:${del}s;pointer-events:none"></span>`;
    })
    .join('');
}

function payoffsHtml(): string {
  return PAYOFFS.map((p) => `
    <div style="display:flex;flex-direction:column;border:1px solid var(--gold-line);border-top:2px solid rgba(201,168,106,.65);border-radius:var(--radius-sm);padding:15px 16px;background:radial-gradient(320px 180px at 50% 0%,rgba(201,168,106,.09),transparent 70%),rgba(255,255,255,.015)">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:9px">
        <span style="font:500 9px/1 var(--font-mono);letter-spacing:.18em;color:var(--muted);text-transform:uppercase">${p.kicker}</span>
        ${p.forever ? '<span style="font:700 8.5px/1 var(--font-display);letter-spacing:.08em;color:var(--gold-bright);border:1px solid rgba(201,168,106,.45);border-radius:5px;padding:3px 7px;white-space:nowrap">FOREVER</span>' : ''}
      </div>
      <div style="font:800 clamp(19px,2.4vw,24px)/1.15 var(--font-display);letter-spacing:.02em;margin-top:11px;background:linear-gradient(92deg,#f6ecd2,var(--gold-bright) 48%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent">${p.title}</div>
      <div style="font:400 12.5px/1.7 var(--font-jp);color:var(--muted);margin-top:10px;flex:1 1 auto">${p.desc}</div>
      <div style="font:500 10.5px/1.5 var(--font-mono);color:var(--faint);margin-top:11px;padding-top:10px;border-top:1px solid var(--border)">${p.foot}</div>
    </div>`).join('');
}

function thronesHtml(): string {
  return THRONES.map(([label, text], i) => {
    const num = i === 0 ? 'var(--gold-bright)' : 'var(--faint)';
    const txt = i === 0 ? 'var(--gold-bright)' : 'var(--faint)';
    const box =
      'width:clamp(58px,9vw,74px);aspect-ratio:3/4;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:6px;' +
      (i === 0
        ? 'border:1px solid rgba(201,168,106,.55);background:radial-gradient(circle at 50% 30%,rgba(201,168,106,.16),rgba(10,8,19,.6))'
        : 'border:1px dashed rgba(255,255,255,.1);background:rgba(255,255,255,.012)');
    return `<div style="${box}"><span style="font:500 9px/1 var(--font-mono);letter-spacing:.1em;color:${num}">${label}</span><span style="font:700 9.5px/1.4 var(--font-jp);color:${txt};text-align:center">${text}</span></div>`;
  }).join('');
}

function ladderHtml(): string {
  return LADDER_NAMES.map((name, i) => {
    const dot = `flex:0 0 auto;width:8px;height:8px;border-radius:999px;background:${i >= 4 ? 'var(--gold)' : '#3a3658'}`;
    const chip = `display:inline-flex;font:400 11.5px/1 var(--font-mono);padding:4px 10px;border-radius:999px;border:1px solid ${i >= 4 ? 'rgba(201,168,106,.55)' : 'var(--border)'};color:${i >= 4 ? 'var(--gold-bright)' : 'var(--muted)'}`;
    return `<div style="display:flex;align-items:center;gap:9px;padding:3px 0">
      <span style="flex:0 0 16px;text-align:right;font:400 9px/1 var(--font-mono);color:var(--faint)">${i + 1}</span>
      <span style="${dot}"></span>
      <span style="${chip}">${name}</span>
      <span style="flex:1;height:1px;background:linear-gradient(90deg,rgba(201,168,106,.3),transparent)"></span>
    </div>`;
  }).join('');
}

function leagueHtml(): string {
  return LEAGUE.map(([k, v]) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 14px;background:rgba(255,255,255,.015)">
      <div style="font:500 10px/1 var(--font-mono);letter-spacing:.2em;color:var(--muted);margin-bottom:7px">${k}</div>
      <div style="font:400 12.5px/1.7 var(--font-jp);color:var(--muted)">${v}</div>
    </div>`).join('');
}

const soundStyle =
  'position:absolute;right:14px;bottom:13px;z-index:3;padding:5px 11px;border:1px solid rgba(201,168,106,.45);border-radius:999px;background:rgba(10,8,18,.55);color:var(--gold);font:400 10px/1 var(--font-mono);letter-spacing:.14em;cursor:pointer';

/** 正典 markup の忠実写経(既定=PC・sound OFF・hall/buybacks 空)。 */
function pageHtml(view: 'pc' | 'mobile', soundOn: boolean): string {
  const soundLabel = soundOn ? '♪ SOUND ON' : '♪ SOUND OFF';
  return `
<div style="position:fixed;top:14px;right:14px;z-index:80;display:flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:999px;background:rgba(10,7,20,.92);backdrop-filter:blur(8px);box-shadow:var(--shadow)">
  <button data-act="mobile" style="${tab(view === 'mobile')}">モバイル</button>
  <button data-act="pc" style="${tab(view === 'pc')}">PC</button>
</div>
<div style="max-width:var(--colW);margin:0 auto;padding:22px var(--padX) 96px;display:flex;flex-direction:column;gap:16px">

  <!-- ① HERO -->
  <div style="position:relative;overflow:hidden;border:1px solid var(--gold-line);border-radius:var(--radius);background:#050409;box-shadow:0 0 60px rgba(201,168,106,.08) inset,var(--shadow);min-height:clamp(400px,52vh,480px);display:flex;flex-direction:column;justify-content:flex-end">
    <div style="position:absolute;inset:0">
      <video autoplay muted loop playsinline preload="metadata" poster="/champions/hero-poster.webp" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 55%">
        <source src="/champions/hero-loop.mp4" type="video/mp4">
      </video>
    </div>
    <div style="position:absolute;inset:0;background:radial-gradient(80% 120% at 8% 108%,rgba(255,92,92,.24),transparent 58%),radial-gradient(70% 110% at 92% 104%,rgba(201,168,106,.26),transparent 56%)"></div>
    ${embersHtml()}
    <div style="position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,92,92,.5) 22%,rgba(201,168,106,.85) 68%,transparent)"></div>
    <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none"><div style="position:absolute;top:0;bottom:0;width:38%;background:linear-gradient(100deg,transparent,rgba(242,228,191,.07),transparent);animation:chGleam 8s ease-in-out infinite"></div></div>
    <button data-act="sound" style="${soundStyle}">${soundLabel}</button>
    <div style="position:relative;padding:var(--padS);text-align:center;background:linear-gradient(180deg,transparent,rgba(5,4,9,.9) 58%)">
      <div style="font:500 10px/1 var(--font-mono);letter-spacing:.42em;color:var(--faint);text-transform:uppercase">IMMORTALITY</div>
      <h1 style="margin:12px auto 0;font:900 clamp(19px,3.5vw,30px)/1.4 var(--font-jp);letter-spacing:.02em;color:var(--text);max-width:34ch;line-break:strict;word-break:keep-all;text-wrap:pretty">7つのレースを生き抜いた馬だけが、<br><span style="background:linear-gradient(92deg,#f6ecd2,var(--gold-bright) 42%,#8a6d3b);-webkit-background-clip:text;background-clip:text;color:transparent">チャンピオン馬になる。</span></h1>
      <div style="display:inline-flex;align-items:center;gap:11px;margin-top:16px;padding:7px 16px 7px 18px;border:1px solid rgba(201,168,106,.5);border-radius:999px;background:rgba(10,8,18,.6)">
        <span style="font:800 12px/1 var(--font-display);letter-spacing:.4em;text-indent:.4em;background:linear-gradient(92deg,#f6ecd2,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent">CHAMPION</span>
        <span style="width:1px;height:12px;background:var(--gold-line)"></span>
        <span style="font:700 11px/1 var(--font-jp);color:var(--gold-bright)">不滅の証</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,26px);margin-top:20px;flex-wrap:wrap">
        <div style="text-align:right;min-width:120px">
          <div style="font:500 9px/1 var(--font-mono);letter-spacing:.2em;color:rgba(255,92,92,.75);text-transform:uppercase">毎レース</div>
          <div style="font:700 14px/1.4 var(--font-jp);color:rgba(255,146,146,.9);margin-top:5px">多くの馬が途中で去っていく</div>
        </div>
        <span style="font:400 18px/1 var(--font-mono);color:var(--faint)">→</span>
        <div style="text-align:left;min-width:120px">
          <div style="font:500 9px/1 var(--font-mono);letter-spacing:.2em;color:var(--gold);text-transform:uppercase">7レース 走破</div>
          <div style="font:700 14px/1.4 var(--font-jp);color:var(--gold-bright);margin-top:5px">ただ一頭、永遠に残る</div>
        </div>
      </div>
      <p style="margin:16px auto 0;max-width:56ch;font:400 12.5px/1.8 var(--font-jp);color:var(--muted);line-break:strict;word-break:keep-all;text-wrap:pretty">あなたの馬を、この殿堂に永久に刻む。それがチャンピオンです。</p>
    </div>
  </div>

  <!-- ② THE PAYOFF -->
  <section style="border:1px solid var(--gold-line);border-radius:var(--radius);padding:var(--padS);background:radial-gradient(600px 260px at 12% 0%,rgba(201,168,106,.11),transparent 68%),var(--panel);box-shadow:var(--shadow);animation:chFade .5s ease both">
    <div style="display:flex;align-items:center;gap:13px;flex-wrap:wrap">
      <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));box-shadow:0 0 14px rgba(201,168,106,.45)"></span>
      <div style="flex:1 1 auto"><div style="font:700 10px/1 var(--font-mono);letter-spacing:.24em;color:var(--gold)">THE PAYOFF</div><h2 style="margin:4px 0 0;font:800 20px/1.15 var(--font-display);letter-spacing:.05em;color:var(--text)">チャンピオンになると手に入るもの</h2></div>
      <span style="font:400 11.5px/1.6 var(--font-jp);color:var(--muted);text-align:right;max-width:34ch;line-break:strict;word-break:keep-all">7レースを走破した“あなたの”馬に起きること</span>
    </div>
    <div style="display:grid;grid-template-columns:var(--payoffCols);gap:12px;margin-top:16px">${payoffsHtml()}</div>
    <p style="margin:14px 0 0;font:400 11.5px/1.75 var(--font-jp);color:var(--faint)">7 レースを走破すると確定する報酬です（200 USDT は7回に分けて支払われます）。ゲームの達成に対する報酬で、投資リターンではありません。</p>
  </section>

  <!-- 下段 2カラム -->
  <div style="display:grid;grid-template-columns:var(--lowerCols);gap:16px;align-items:start">
    <div style="display:flex;flex-direction:column;gap:16px;min-width:0">

      <!-- ③ HALL OF CHAMPIONS(空＝最初の王になれ・R1) -->
      <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:chFade .6s ease both">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <h2 style="margin:0;font:800 16px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">HALL OF CHAMPIONS</h2>
          <span style="font:400 11px/1 var(--font-mono);color:var(--faint)">走り切った馬の証</span>
          <span style="margin-left:auto;font:700 13px/1 var(--font-display);color:var(--gold-bright)">戴冠 0</span>
        </div>
        <div style="margin-top:15px;border:1px solid var(--gold-line);border-radius:var(--radius-sm);padding:clamp(20px,4vw,34px) var(--padS);background:radial-gradient(520px 240px at 50% 4%,rgba(201,168,106,.12),transparent 68%),rgba(255,255,255,.012);text-align:center">
          <div style="font:500 9.5px/1 var(--font-mono);letter-spacing:.28em;color:var(--gold);text-transform:uppercase">THE THRONE IS EMPTY</div>
          <div style="font:900 clamp(20px,3.2vw,27px)/1.4 var(--font-jp);margin:13px auto 0;max-width:32ch;line-break:strict;word-break:keep-all;text-wrap:pretty;background:linear-gradient(92deg,#f6ecd2,var(--gold-bright) 45%,#8a6d3b);-webkit-background-clip:text;background-clip:text;color:transparent">まだ王はいない — 最初の伝説になれ。</div>
          <p style="margin:12px auto 0;max-width:48ch;font:400 12.5px/1.8 var(--font-jp);color:var(--muted);line-break:strict;word-break:keep-all;text-wrap:pretty">この殿堂はまだ空です。あなたの馬が 7 レースを走破すれば、最初の名がここに永久に刻まれます。</p>
          <div style="display:flex;justify-content:center;gap:10px;margin-top:22px;flex-wrap:wrap">${thronesHtml()}</div>
          <div style="margin-top:20px;font:400 11px/1.7 var(--font-jp);color:var(--faint)">最初の王の座は、まだ誰のものでもありません。</div>
        </div>
      </section>

      <!-- ② YOUR CHAMPION REWARDS(空) -->
      <section style="border:1px solid var(--gold-line);border-radius:var(--radius);padding:var(--padS);background:radial-gradient(500px 220px at 12% 0%,rgba(201,168,106,.1),transparent 68%),var(--panel);box-shadow:var(--shadow);animation:chFade .7s ease both">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <h2 style="margin:0;font:800 16px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">YOUR CHAMPION REWARDS</h2>
          <span style="font:400 11px/1 var(--font-mono);color:var(--faint)">走破馬の報酬</span>
        </div>
        <p style="margin:9px 0 0;font:400 11px/1.7 var(--font-mono);color:var(--faint)">7 レース走破で <b style="color:var(--gold-bright)">200 USDT</b> を7回に分けて受け取ります。</p>
        <div style="margin-top:13px;border:1px dashed var(--border-strong);border-radius:10px;padding:15px 16px;font:400 12.5px/1.7 var(--font-jp);color:var(--muted)">まだ走破した馬はいません。チャンピオンになると、ここに報酬の受け取り履歴が並びます。</div>
      </section>
    </div>

    <!-- ④ CHAMPION LEAGUE(待ち遠しさへ反転・sticky) -->
    <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);position:sticky;top:16px;animation:chFade .8s ease both">
      <div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap">
        <h2 style="margin:0;font:800 15px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">CHAMPION LEAGUE</h2>
        <span style="font:500 9.5px/1 var(--font-mono);letter-spacing:.22em;color:var(--gold-bright);border:1px solid rgba(201,168,106,.45);border-radius:999px;padding:4px 9px">開幕前</span>
      </div>
      <div style="margin-top:13px;border:1px solid var(--gold-line);border-radius:var(--radius-sm);padding:14px 15px;background:radial-gradient(320px 160px at 50% 0%,rgba(201,168,106,.1),transparent 70%),rgba(255,255,255,.012)">
        <div style="font:800 15px/1.5 var(--font-jp);color:var(--text)">リーグに入れるのは、<span style="color:var(--gold-bright)">チャンピオンだけ</span>。</div>
        <p style="margin:9px 0 0;font:400 12.5px/1.8 var(--font-jp);color:var(--muted)">10,000人到達で開幕します。開幕前にチャンピオンになって、その資格を確保してください。</p>
        <div style="margin-top:12px;padding-top:11px;border-top:1px solid var(--border);display:flex;align-items:center;gap:9px">
          <span style="width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:0 0 9px rgba(201,168,106,.8);animation:chBeat 2s ease-in-out infinite"></span>
          <span style="font:500 10.5px/1.5 var(--font-mono);color:var(--faint)">今チャンピオンを取る ＝ 未来リーグの切符</span>
        </div>
      </div>
      <div style="margin-top:14px;border:1px solid var(--border);border-radius:13px;padding:13px 14px;background:rgba(255,255,255,.015)">
        <div style="font:500 9.5px/1 var(--font-mono);letter-spacing:.2em;color:var(--muted);margin-bottom:10px">昇級ラダー</div>${ladderHtml()}</div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px">${leagueHtml()}</div>
      <div style="margin-top:13px;font:400 10.5px/1.7 var(--font-jp);color:var(--faint)">チャンピオンが解放する未来です。開幕時期は10,000人到達によります。</div>
    </section>
  </div>

  <div style="text-align:center;font:400 10.5px/1.6 var(--font-mono);letter-spacing:.08em;color:var(--faint)">Hall・報酬は実データのみ（架空チャンピオンは表示しません）— 表示中の値は代表値（fixture）</div>
</div>`;
}

const SCOPED_STYLE = `
.champPreview{--bg:#050409;--panel:#12101d;--panel-2:#16132a;--border:rgba(255,255,255,.08);--border-strong:rgba(0,234,255,.28);--gold-line:rgba(201,168,106,.35);--text:#eae7ff;--muted:#8f8ac2;--faint:#5a5580;--cyan:#00eaff;--magenta:#ff2dc4;--magenta-soft:#ff8fe4;--gold:#c9a86a;--gold-bright:#f2e4bf;--good:#35d07f;--good-soft:#9dffc4;--bad:#ff5c5c;--radius:16px;--radius-sm:11px;--radius-xs:8px;--shadow:0 24px 60px -24px rgba(0,0,0,.8);--font-display:'Orbitron',system-ui,sans-serif;--font-sans:'Space Grotesk','Zen Kaku Gothic New',system-ui,sans-serif;--font-jp:'Zen Kaku Gothic New',system-ui,sans-serif;--font-mono:'IBM Plex Mono',ui-monospace,monospace;color:var(--text);font-family:var(--font-sans);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh;background:radial-gradient(900px 520px at 50% -8%,#1b1206 0%,#0a0714 46%,var(--bg) 100%),var(--bg)}
.champPreview *{box-sizing:border-box}
.champPreview a{color:var(--gold-bright);text-decoration:none}
@keyframes chEmber{0%{transform:translateY(0);opacity:0}18%{opacity:.75}100%{transform:translateY(-90px);opacity:0}}
@keyframes chGleam{0%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
@keyframes chBeat{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes chFade{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.champPreview *{animation:none!important}}
`;

const VIEW_VARS = {
  pc: { '--colW': '1120px', '--padX': 'clamp(14px,4vw,26px)', '--padS': 'clamp(15px,2.6vw,22px)', '--lowerCols': '1.6fr 1fr', '--payoffCols': 'repeat(auto-fit,minmax(232px,1fr))' },
  mobile: { '--colW': '402px', '--padX': '16px', '--padS': '15px', '--lowerCols': '1fr', '--payoffCols': '1fr' },
} as const;

export function ChampionPreview(): React.JSX.Element {
  const [view, setView] = useState<'pc' | 'mobile'>('pc');
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
    if (act === 'mobile') setView('mobile');
    else if (act === 'pc') setView('pc');
    else if (act === 'sound') setSoundOn((s) => !s);
  }, []);

  useEffect(() => {
    if (soundOn) {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/hoofbeats.mp3');
        audioRef.current.loop = true;
        audioRef.current.volume = 0.45;
      }
      audioRef.current.play().catch(() => setSoundOn(false));
    } else {
      audioRef.current?.pause();
    }
    return () => audioRef.current?.pause();
  }, [soundOn]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SCOPED_STYLE }} />
      <div
        ref={rootRef}
        className="champPreview"
        style={VIEW_VARS[view] as React.CSSProperties}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: pageHtml(view, soundOn) }}
      />
    </>
  );
}
