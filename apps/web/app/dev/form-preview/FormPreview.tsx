'use client';

import type { Surface, TrackCondition, Weather } from '@sevendays/domain';
import { FormPanel } from '@/components/FormPanel';
import { buildFormPanelData, type FormPanelSource } from '@/lib/form-panel-data';

/* ============================================================================
 * /dev/form-preview — 馬柱(成績表)+予報の読解プレビュー(実装⑤a)
 *
 * デザイン側 handoff(馬柱.zip / FORM_TABLE_DESIGN_BRIEF.md)の FormPanel を、
 * ドメイン(readFormV3 / aggregateVerdictV3)からアダプタ(buildFormPanelData)経由で描く。
 * モック3頭 = 道悪巧者 / 芝巧者 / まだ読めない新馬。V3有効化まで本番馬詳細には出さない。
 * ========================================================================== */

const TONIGHT: { weather: Weather; track: TrackCondition; surface: Surface } = {
  weather: 'RAIN',
  track: 'SOFT',
  surface: 'TURF',
};

const HORSES: FormPanelSource[] = [
  {
    kana: 'クリムゾン ノヴァ',
    en: 'Crimson Nova',
    totalValue: 72,
    horseType: 'SPRINTER',
    forecast: TONIGHT,
    runs: [
      { weather: 'STORM', track: 'SOFT', surface: 'TURF', rank: 3, entrants: 38 },
      { weather: 'SUNNY', track: 'FAST', surface: 'DIRT', rank: 22, entrants: 38 },
      { weather: 'RAIN', track: 'SOFT', surface: 'TURF', rank: 5, entrants: 38 },
      { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF', rank: 18, entrants: 40 },
      { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 2, entrants: 36 },
    ],
  },
  {
    kana: 'ターフ ダンサー',
    en: 'Turf Dancer',
    totalValue: 66,
    horseType: 'BALANCED',
    forecast: TONIGHT,
    runs: [
      { weather: 'SUNNY', track: 'FAST', surface: 'TURF', rank: 4, entrants: 40 },
      { weather: 'RAIN', track: 'SOFT', surface: 'DIRT', rank: 29, entrants: 38 },
      { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF', rank: 6, entrants: 37 },
      { weather: 'STORM', track: 'HEAVY', surface: 'DIRT', rank: 31, entrants: 36 },
      { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', rank: 3, entrants: 39 },
    ],
  },
  {
    kana: 'ニュー カマー',
    en: 'New Comer',
    totalValue: 51,
    horseType: 'POWER',
    forecast: TONIGHT,
    runs: [{ weather: 'CLOUDY', track: 'GOOD', surface: 'DIRT', rank: 14, entrants: 38 }],
  },
];

export function FormPreview() {
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>馬柱（成績表）＋ 予報 — 読解プレビュー</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
        デザイン側 handoff の FormPanel。今夜の予報に一致する過去走を表内で緑ハイライト（◂根拠）、
        非一致は薄く残す。読解の総合判定を最大見出しに。生値なし・断定なし・的中率70%の目安。
        <br />
        <strong>モック・V3有効化まで本番の馬詳細には出さない</strong>（現行V2に個体適性は無いため）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {HORSES.map((h) => (
          <FormPanel key={h.en} d={buildFormPanelData(h)} />
        ))}
      </div>
    </div>
  );
}
