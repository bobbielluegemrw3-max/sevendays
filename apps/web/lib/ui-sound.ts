'use client';

/* ============================================================================
 * UI音(UI_FOUNDATION_PLAN 3-4)。
 *
 * 監査: `/daily-derby` と `/champion` を出た瞬間、アプリは完全に無音になる。
 * クリック音・確定音・成功音・エラー音は皆無。一方で本格的な再生エンジンは
 * 既に `DailyDerbyStage.tsx` にある(iOSアンロック処理込み)。
 *
 * ただしショーの音とUI音は**別物として扱う**:
 *  - ショーの音 = オーナー支給の実音源。ラウドネスを実測して階層を作ってある
 *    (`public/sounds/README.md` が正典)。感情を運ぶ
 *  - UI音 = 操作の返事。感情を運ばない。鳴って気持ちいい必要すらなく、
 *    「効いた」ことが分かればよい
 *
 * したがってUI音に既存の音源を流用しない。ショーの語彙(own-good 等)を
 * ボタンに使うと、生死の音が日常の音になって意味が磨り減る。
 *
 * 音源も足さない。**WebAudio の合成音**にしてあるのは、設計原則 6.1
 * 「品質がアート実装に依存するものを避ける」に従ったため — 短い正弦波の
 * 包絡は実装で劣化しない。オーナーが実音源を用意したくなったら、
 * `SYNTH` を差し替えるだけで移行できる(`play()` の呼び出し側は不変)。
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
  /** 0〜1。既定は控えめ。 */
  volume: number;
}

const STORAGE_KEY = 'sdd_ui_sound';
export const DEFAULT_SETTINGS: UiSoundSettings = { enabled: true, volume: 0.35 };

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
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* プライベートブラウズ等で書けなくても音は鳴らせる(その場限りになるだけ) */
  }
  cached = next;
}

let cached: UiSoundSettings | null = null;
function settings(): UiSoundSettings {
  if (cached === null) cached = readUiSoundSettings();
  return cached;
}

/* ---- 合成 ----------------------------------------------------------------- */

/** 音の設計。周波数(Hz)・長さ(秒)・音量比・波形。短いほど「返事」に聞こえる。 */
const SYNTH: Record<UiSoundKind, { steps: Array<[number, number]>; type: OscillatorType; gain: number }> = {
  // 確定: 上向きの2音。「決まった」で終わる
  confirm: { steps: [[880, 0.05], [1174.7, 0.09]], type: 'sine', gain: 0.9 },
  // 完了: 三和音を薄く。祝わない — 通っただけ
  success: { steps: [[659.3, 0.05], [880, 0.05], [1318.5, 0.1]], type: 'sine', gain: 0.7 },
  // 失敗: 下向きの2音。警報にしない(驚かせるのが目的ではない)
  error: { steps: [[392, 0.07], [293.7, 0.12]], type: 'triangle', gain: 0.8 },
  // 遷移: ごく短い刻み
  nav: { steps: [[1046.5, 0.03]], type: 'sine', gain: 0.45 },
};

let ctx: AudioContext | null = null;

/** iOS/Safari は最初のユーザー操作の中でしか AudioContext を起こせない。
 *  クリックハンドラから呼ばれる play() の中で作る(=常に操作の中)。 */
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * UI音を鳴らす。設定でOFF、または音が出せない環境なら**黙って何もしない**
 * (音は演出であって機能ではない — 失敗しても操作は続く)。
 */
export function playUiSound(kind: UiSoundKind): void {
  const s = settings();
  if (!s.enabled || s.volume <= 0) return;
  if (kind === 'nav' && !DEFAULT_NAV) return;
  const ac = context();
  if (!ac) return;

  const spec = SYNTH[kind];
  let at = ac.currentTime;
  for (const [freq, dur] of spec.steps) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(freq, at);
    // 包絡: 立ち上がり3ms・以後は指数減衰。矩形に切るとプチッと鳴る
    const peak = s.volume * spec.gain * 0.22;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + dur + 0.01);
    at += dur * 0.75; // わずかに重ねる(段が切れて聞こえないように)
  }
}

/** 設定画面のプレビュー用(音量を変えた瞬間に確かめられる)。 */
export function previewUiSound(next: UiSoundSettings): void {
  cached = next;
  playUiSound('confirm');
}
