'use client';

/* ============================================================================
 * UI音(UI_FOUNDATION_PLAN 3-4)。
 *
 * 監査: `/daily-derby` と `/champion` を出た瞬間、アプリは完全に無音になる。
 *
 * ショーの音とUI音は**別物として扱う**:
 *  - ショーの音 = オーナー支給の実音源。ラウドネスを実測して階層を作ってある
 *    (`public/sounds/README.md` が正典)。感情を運ぶ
 *  - UI音 = 操作の返事。感情を運ばない。「効いた」ことが分かればよい
 * したがってショーの語彙(own-good 等)をボタンに流用しない — 生死の音を
 * 日常に使うと意味が磨り減る。
 *
 * ★2026-07-21 実機(iPhone)で鳴らなかった。原因は2つとも実装側にある:
 *   1. **WebAudio は iOS の消音スイッチで無音になる。** ショーの音は
 *      `new Audio()`(メディア要素)で鳴っており実機で鳴る実績がある。
 *      → 同じ方式に寄せる。音源ファイルは増やさず、WAVをその場で合成して
 *        data URI にし、メディア要素として鳴らす
 *   2. **単純に音が小さすぎた**(ピーク約0.07 = −23dBFS)。実機のスピーカーでは
 *      短い減衰音は聞こえない。ピークを上げ、長さもわずかに伸ばした
 *
 * 音源ファイルを持たないのは設計原則 6.1(品質がアート実装に依存するものを
 * 避ける)に従ったもの。実音源へ移りたくなったら SOURCES を差し替えるだけで
 * 呼び出し側は不変。
 *
 * ★禁則(ショーと共通): 収支のプラス/マイナスで音を変えない。
 *   ここで鳴らすのは「操作が通ったか」だけであって、儲かったかではない。
 * ========================================================================== */

export type UiSoundKind =
  /** 取り返しのつかない確定(調教確定・出金送信)。 */
  | 'confirm'
  /** 完了(保存できた・受け付けた)。 */
  | 'success'
  /** 失敗(操作が通らなかった)。 */
  | 'error'
  /** 画面遷移などの軽い刻み。既定では鳴らさない(下記 DEFAULT_NAV)。 */
  | 'nav';

export interface UiSoundSettings {
  enabled: boolean;
  /** 0〜1。 */
  volume: number;
}

const STORAGE_KEY = 'sdd_ui_sound';
export const DEFAULT_SETTINGS: UiSoundSettings = { enabled: true, volume: 0.7 };

/** 遷移音は既定で鳴らさない。移動のたびに鳴るのは「返事」ではなく雑音になる。 */
const DEFAULT_NAV = false;

/* ---- 設定の保存(localStorage) -------------------------------------------- */

export function readUiSoundSettings(): UiSoundSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UiSoundSettings>;
    const volume = typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume;
    return { enabled: parsed.enabled !== false, volume };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeUiSoundSettings(next: UiSoundSettings): void {
  cached = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* プライベートブラウズ等で書けなくても音は鳴らせる(その場限りになるだけ) */
  }
}

let cached: UiSoundSettings | null = null;
function settings(): UiSoundSettings {
  if (cached === null) cached = readUiSoundSettings();
  return cached;
}

/* ---- 合成(WAVをその場で作る) ---------------------------------------------- */

const SAMPLE_RATE = 44100;

/** 音の設計。[周波数Hz, 長さ秒] の並びと、全体の振幅。 */
const SOURCES: Record<UiSoundKind, { steps: Array<[number, number]>; amp: number }> = {
  // 確定: 上向きの2音。「決まった」で終わる
  confirm: { steps: [[880, 0.075], [1174.7, 0.13]], amp: 0.75 },
  // 完了: 三和音を薄く。祝わない — 通っただけ
  success: { steps: [[659.3, 0.07], [880, 0.07], [1318.5, 0.15]], amp: 0.6 },
  // 失敗: 下向きの2音。警報にしない(驚かせるのが目的ではない)
  error: { steps: [[392, 0.1], [293.7, 0.17]], amp: 0.7 },
  // 遷移: ごく短い刻み
  nav: { steps: [[1046.5, 0.045]], amp: 0.4 },
};

/** 16bit PCM モノラルの WAV を data URI で作る(音源ファイルを増やさないため)。 */
function buildWavDataUri(spec: { steps: Array<[number, number]>; amp: number }): string {
  const total = spec.steps.reduce((n, [, d]) => n + d, 0) + 0.02;
  const frames = Math.ceil(total * SAMPLE_RATE);
  const pcm = new Int16Array(frames);

  let offset = 0;
  for (const [freq, dur] of spec.steps) {
    const n = Math.ceil(dur * SAMPLE_RATE);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      // 立ち上がり4ms・以後は指数減衰。矩形に切るとプチッと鳴る
      const attack = Math.min(1, t / 0.004);
      const decay = Math.exp((-4.2 * t) / dur);
      const v = Math.sin(2 * Math.PI * freq * t) * attack * decay * spec.amp;
      const at = offset + i;
      if (at < frames) pcm[at] = Math.max(-1, Math.min(1, (pcm[at]! / 32767) + v)) * 32767;
    }
    offset += Math.ceil(n * 0.72); // わずかに重ねる(段が切れて聞こえないように)
  }

  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);       // fmt チャンク長
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // モノラル
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i]!, true);

  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/* ---- 再生(ショーと同じメディア要素) --------------------------------------- */

const pool = new Map<UiSoundKind, HTMLAudioElement>();

function element(kind: UiSoundKind): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let el = pool.get(kind) ?? null;
  if (el === null) {
    try {
      el = new Audio(buildWavDataUri(SOURCES[kind]));
      el.preload = 'auto';
      pool.set(kind, el);
    } catch {
      return null;
    }
  }
  return el;
}

/**
 * UI音を鳴らす。設定でOFF、または音が出せない環境なら**黙って何もしない**
 * (音は演出であって機能ではない — 失敗しても操作は続く)。
 *
 * クリックハンドラの中から呼ぶこと(iOSは最初のユーザー操作の中でしか
 * 音を出せない)。
 */
export function playUiSound(kind: UiSoundKind): void {
  const s = settings();
  if (!s.enabled || s.volume <= 0) return;
  if (kind === 'nav' && !DEFAULT_NAV) return;
  const el = element(kind);
  if (!el) return;
  try {
    el.volume = Math.max(0, Math.min(1, s.volume));
    el.currentTime = 0;
    void el.play().catch(() => {
      /* 未アンロック/自動再生拒否でも操作は続行する */
    });
  } catch {
    /* 同上 */
  }
}

/** 設定画面の試聴。音量を変えた直後に確かめられるようにする。 */
export function previewUiSound(next: UiSoundSettings): void {
  cached = next;
  const el = element('confirm');
  if (!el) return;
  try {
    el.volume = Math.max(0, Math.min(1, next.volume));
    el.currentTime = 0;
    void el.play().catch(() => {});
  } catch {
    /* noop */
  }
}
