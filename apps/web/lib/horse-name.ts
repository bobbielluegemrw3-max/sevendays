/* ============================================================================
 * 馬名のカタカナ表示(2026-07-22 オーナー決定)。
 *
 * 「馬の名前が英語だから印象が薄く、どれがどの馬か覚えていない」— のめり込め
 * ない理由としてオーナーが挙げた点。日本語UIでは**表示だけ**カタカナにする。
 *
 * ★ 正典(DB の horses.name)は英語のまま。理由:
 *   - レース実況 / 台帳 / P2P取引 で「同じ馬」を指す名前が1つでなくなる
 *   - deriveNftLook(dna_hash, name) が **名前の Prefix で色を決めている**
 *     (nft-visual.ts の PREFIX_TARGET)。名前を差し替えると馬の色が変わる
 *   - 既存馬の改名・マイグレーションが不要になる
 *   ゆえにこれは純粋な表示層の変換で、データには一切触れない。
 *
 * 語彙は name-generator.ts の Prefix 40 × Suffix 40 に固定されている
 * (Decision 050/055・オーナー確定語彙)。よって辞書は 80語弱で閉じており、
 * 実行時の音訳エンジンは不要 — 完全に決定論。
 *
 * 重複解決の接尾(II / III / G13)は英数のまま残す(世代表記なので訳さない)。
 * ========================================================================== */

/** 英単語 → カタカナ。name-generator.ts の語彙と1対1で対応する。 */
const KANA: Record<string, string> = {
  // ---- Prefix (40) ----
  Royal: 'ロイヤル', Black: 'ブラック', Golden: 'ゴールデン', Silver: 'シルバー',
  Crimson: 'クリムゾン', Azure: 'アズール', Emerald: 'エメラルド', Scarlet: 'スカーレット',
  White: 'ホワイト', Shadow: 'シャドウ', Storm: 'ストーム', Silent: 'サイレント',
  Wild: 'ワイルド', Iron: 'アイアン', Bright: 'ブライト', Dark: 'ダーク',
  Noble: 'ノーブル', Rapid: 'ラピッド', Mystic: 'ミスティック', Frozen: 'フローズン',
  Burning: 'バーニング', Grand: 'グランド', Lucky: 'ラッキー', Brave: 'ブレイブ',
  Crystal: 'クリスタル', Thunder: 'サンダー', Desert: 'デザート', Ocean: 'オーシャン',
  Sky: 'スカイ', Night: 'ナイト', Dawn: 'ドーン', Solar: 'ソーラー',
  Lunar: 'ルナー', Wind: 'ウインド', Rising: 'ライジング', Falling: 'フォーリング',
  Sacred: 'セイクリッド', Phantom: 'ファントム', Cosmic: 'コズミック', Blue: 'ブルー',
  // ---- Suffix (40・Prefix と重なる Thunder/Wind/Storm/Shadow は上で定義済み) ----
  Blade: 'ブレード', Arrow: 'アロー', Crown: 'クラウン', Spirit: 'スピリット',
  Runner: 'ランナー', Flash: 'フラッシュ', Comet: 'コメット', Star: 'スター',
  Knight: 'ナイト', King: 'キング', Queen: 'クイーン', Dragon: 'ドラゴン',
  Falcon: 'ファルコン', Eagle: 'イーグル', Wolf: 'ウルフ', Tiger: 'タイガー',
  Lion: 'ライオン', River: 'リバー', Flame: 'フレイム', Frost: 'フロスト',
  Light: 'ライト', Dream: 'ドリーム', Glory: 'グローリー', Legend: 'レジェンド',
  Strike: 'ストライク', Hoof: 'フーフ', Dash: 'ダッシュ', Rider: 'ライダー',
  Meteor: 'メテオ', Tempest: 'テンペスト', Wave: 'ウェーブ', Heart: 'ハート',
  Soul: 'ソウル', Peak: 'ピーク', Road: 'ロード', Mirage: 'ミラージュ',
};

/**
 * 表示用の馬名。日本語UIのときだけカタカナに変換する。
 * 変換できない語が1つでもあれば **原文をそのまま返す**(中途半端な
 * 「ラピッド Dawn」を作らない)。世代接尾(II/G13)は英数のまま残す。
 */
export function horseDisplayName(name: string, lang: string): string {
  if (lang !== 'ja' || !name) return name;
  const parts = name.split(' ');
  // 末尾が世代接尾(ローマ数字 or G+数字)なら切り離す
  const last = parts[parts.length - 1] ?? '';
  const hasGen = parts.length > 1 && (/^[IVX]+$/.test(last) || /^G\d+$/.test(last));
  const words = hasGen ? parts.slice(0, -1) : parts;
  const kana = words.map((w) => KANA[w]);
  if (kana.some((k) => k === undefined)) return name;
  const base = kana.join('・');
  return hasGen ? `${base} ${last}` : base;
}
