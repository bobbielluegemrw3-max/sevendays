/**
 * デジタルウォッチ風 7セグメント表示(SVG自前描画・外部フォント不要)。
 * 点灯セグメントは currentColor — 色は親のクラス(通常シアン/警告レッド)で
 * 切り替える。未点灯セグメントは薄く残して液晶らしさを出す。
 */

const SEG_POINTS: Record<string, string> = {
  a: '8,2 48,2 52,6 48,10 8,10 4,6',
  b: '52,4 56,8 56,44 52,48 48,44 48,8',
  c: '52,52 56,56 56,92 52,96 48,92 48,56',
  d: '8,90 48,90 52,94 48,98 8,98 4,94',
  e: '4,52 8,56 8,92 4,96 0,92 0,56',
  f: '4,4 8,8 8,44 4,48 0,44 0,8',
  g: '8,46 48,46 52,50 48,54 8,54 4,50',
};

const DIGIT_SEGS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgcde',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

function Digit({ ch }: { ch: string }) {
  const lit = DIGIT_SEGS[ch] ?? '';
  return (
    <svg viewBox="-2 -2 60 104" aria-hidden="true" style={{ height: '100%' }}>
      {Object.entries(SEG_POINTS).map(([seg, points]) => (
        <polygon key={seg} points={points} fill="currentColor" opacity={lit.includes(seg) ? 1 : 0.08} />
      ))}
    </svg>
  );
}

function Colon({ blinkOff }: { blinkOff: boolean }) {
  return (
    <svg viewBox="-2 -2 20 104" aria-hidden="true" style={{ height: '100%' }}>
      <rect x="4" y="28" width="10" height="10" rx="2" fill="currentColor" opacity={blinkOff ? 0.08 : 1} />
      <rect x="4" y="62" width="10" height="10" rx="2" fill="currentColor" opacity={blinkOff ? 0.08 : 1} />
    </svg>
  );
}

/**
 * `text` は数字とコロンのみ(例 "02:59")。`blinkColon` でコロンを消灯側に。
 * 高さは親要素で決める(svg は height:100%)。
 */
export function SegmentClock({ text, blinkColon = false }: { text: string; blinkColon?: boolean }) {
  return (
    <span
      role="timer"
      aria-label={text}
      style={{ display: 'inline-flex', alignItems: 'stretch', gap: '0.14em', height: '1em', lineHeight: 1 }}
    >
      {[...text].map((ch, i) =>
        ch === ':' ? <Colon key={i} blinkOff={blinkColon} /> : <Digit key={i} ch={ch} />,
      )}
    </span>
  );
}
