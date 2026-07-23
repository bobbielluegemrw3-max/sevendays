'use client';

import {
  SURFACE_JA,
  TRACK_JA,
  WEATHER_JA,
  conditionGroupLabelV3,
  readFormV3,
  type AxisReadingV3,
  type FormRunV3,
  type Surface,
  type TrackCondition,
  type Weather,
} from '@sevendays/domain';

/* ============================================================================
 * /dev/form-preview — 馬柱(成績表)+ 予報 の再設計プレビュー(実装フェーズ⑤a)
 *
 * TRAINING_APTITUDE_REDESIGN.md §3 / §12.3-b の「読む→予想する」の核。
 * 隠れた個体適性は出さず、今夜の予報に一致する過去走だけを抜き出して並べる。
 * ヒントは曖昧(得意そう/苦手そう/五分/まだ読めない)= 決定論でない(基準D)。
 *
 * これはモック(API非接続・フィクスチャ)。V3 が有効化されるまで本番の馬詳細には出さない
 * (現行 V2 には個体適性が無いため)。オーナーが実機で「読める体験」を確認する用。
 * ========================================================================== */

interface SampleHorse {
  name: string;
  kana: string;
  type: string;
  totalValue: number;
  runs: FormRunV3[]; // 新しい順
}

const TONIGHT: { weather: Weather; track: TrackCondition; surface: Surface; accuracy: number } = {
  weather: 'RAIN',
  track: 'SOFT',
  surface: 'TURF',
  accuracy: 0.7,
};

// 新しい順(直近が先頭)
const HORSES: SampleHorse[] = [
  {
    name: 'Crimson Nova',
    kana: 'クリムゾン ノヴァ',
    type: 'SPRINTER',
    totalValue: 72,
    runs: [
      { weather: 'STORM', track: 'SOFT', surface: 'TURF', rank: 3, entrants: 38 },
      { weather: 'SUNNY', track: 'FAST', surface: 'DIRT', rank: 22, entrants: 38 },
      { weather: 'RAIN', track: 'SOFT', surface: 'TURF', rank: 5, entrants: 38 },
      { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF', rank: 18, entrants: 40 },
      { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 2, entrants: 36 },
    ],
  },
  {
    name: 'Turf Dancer',
    kana: 'ターフ ダンサー',
    type: 'BALANCED',
    totalValue: 66,
    runs: [
      { weather: 'SUNNY', track: 'FAST', surface: 'TURF', rank: 4, entrants: 40 },
      { weather: 'RAIN', track: 'SOFT', surface: 'DIRT', rank: 29, entrants: 38 },
      { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF', rank: 6, entrants: 37 },
      { weather: 'STORM', track: 'HEAVY', surface: 'DIRT', rank: 31, entrants: 36 },
      { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', rank: 3, entrants: 39 },
    ],
  },
  {
    name: 'New Comer',
    kana: 'ニュー カマー',
    type: 'POWER',
    totalValue: 51,
    runs: [{ weather: 'CLOUDY', track: 'GOOD', surface: 'DIRT', rank: 14, entrants: 38 }],
  },
];

const HINT_TEXT: Record<AxisReadingV3['hint'], { label: string; color: string; mark: string }> = {
  strong: { label: '得意そうだ', color: '#2ec27e', mark: '✨' },
  weak: { label: '苦手そう', color: '#b0453a', mark: '△' },
  even: { label: '五分か', color: '#9aa0a6', mark: '・' },
  unknown: { label: 'まだ読めない', color: '#7a7f85', mark: '？' },
};

function condText(c: { weather: Weather; track: TrackCondition; surface: Surface }): string {
  return `${WEATHER_JA[c.weather]} · ${TRACK_JA[c.track]} · ${SURFACE_JA[c.surface]}`;
}

function ResultBadge({ r }: { r: FormRunV3 }) {
  const top = r.rank <= Math.max(3, Math.ceil(r.entrants * 0.1));
  return (
    <span style={{ color: top ? '#2ec27e' : '#c9ccd1' }}>
      {r.rank}/{r.entrants} {top ? '✨' : ''}
    </span>
  );
}

function ReadingLine({ reading }: { reading: AxisReadingV3 }) {
  const cond = conditionGroupLabelV3(reading.axis, reading.pole);
  const h = HINT_TEXT[reading.hint];
  const ranks = reading.matched.map((m) => `${m.rank}位`).join(' · ') || '該当走なし';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', fontSize: 14 }}>
      <span style={{ minWidth: 92, color: '#c9ccd1' }}>「{cond}」での成績</span>
      <span style={{ flex: 1, color: '#e8eaed' }}>{ranks}</span>
      <span style={{ color: h.color, whiteSpace: 'nowrap' }}>
        {h.mark} {h.label}
      </span>
    </div>
  );
}

function HorseCard({ horse }: { horse: SampleHorse }) {
  const reading = readFormV3(horse.runs, TONIGHT);
  return (
    <div
      style={{
        border: '1px solid #2a2d31',
        borderRadius: 12,
        padding: 16,
        background: '#16181c',
        maxWidth: 620,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 18, color: '#f1f3f4' }}>{horse.kana}</strong>
        <span style={{ color: '#7a7f85', fontSize: 13 }}>{horse.name}</span>
        <span style={{ marginLeft: 'auto', color: '#c9ccd1', fontSize: 13 }}>
          総合値 <strong style={{ color: '#f1f3f4', fontSize: 16 }}>{horse.totalValue}</strong>
        </span>
        <span style={{ color: '#7a7f85', fontSize: 12, border: '1px solid #2a2d31', borderRadius: 6, padding: '1px 6px' }}>
          {horse.type}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#7a7f85', marginBottom: 4 }}>📋 成績表 — 推理の材料（直近{horse.runs.length}走）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: '#7a7f85', textAlign: 'left' }}>
            <th style={{ fontWeight: 400, padding: '2px 6px' }}>天候</th>
            <th style={{ fontWeight: 400, padding: '2px 6px' }}>馬場</th>
            <th style={{ fontWeight: 400, padding: '2px 6px' }}>コース</th>
            <th style={{ fontWeight: 400, padding: '2px 6px', textAlign: 'right' }}>着順</th>
          </tr>
        </thead>
        <tbody>
          {horse.runs.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #232629' }}>
              <td style={{ padding: '3px 6px' }}>{WEATHER_JA[r.weather]}</td>
              <td style={{ padding: '3px 6px' }}>{TRACK_JA[r.track]}</td>
              <td style={{ padding: '3px 6px' }}>{SURFACE_JA[r.surface]}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                <ResultBadge r={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#1b1e23',
          border: '1px solid #2a2d31',
        }}
      >
        <div style={{ fontSize: 13, color: '#c9ccd1', marginBottom: 6 }}>
          🔮 今夜の予報：<strong style={{ color: '#f1f3f4' }}>{condText(TONIGHT)}</strong>
          <span style={{ color: '#7a7f85', marginLeft: 8 }}>（的中率{Math.round(TONIGHT.accuracy * 100)}%・目安）</span>
        </div>
        <ReadingLine reading={reading.weather} />
        <ReadingLine reading={reading.track} />
        <ReadingLine reading={reading.surface} />
      </div>
    </div>
  );
}

export function FormPreview() {
  return (
    <div style={{ padding: 24, background: '#0e0f11', minHeight: '100vh', color: '#e8eaed' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>馬柱（成績表）＋ 予報 — 読解プレビュー</h1>
      <p style={{ color: '#7a7f85', fontSize: 13, maxWidth: 620, lineHeight: 1.6 }}>
        今夜の予報に一致する過去走だけを抜き出して並べる（§3/§12.3-b）。隠れた適性の生値は出さず、
        プレイヤーがパターンを読む。ヒントは曖昧（得意そう/苦手そう/五分/まだ読めない）＝決定論でない。
        <br />
        <strong style={{ color: '#c9ccd1' }}>モック・V3有効化まで本番の馬詳細には出さない</strong>（現行V2に個体適性は無いため）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
        {HORSES.map((h) => (
          <HorseCard key={h.name} horse={h} />
        ))}
      </div>
    </div>
  );
}
