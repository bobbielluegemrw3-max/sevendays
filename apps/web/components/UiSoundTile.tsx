'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  previewUiSound,
  readUiSoundSettings,
  writeUiSoundSettings,
  type UiSoundSettings,
} from '@/lib/ui-sound';
import s from '@/app/account.module.css';

/* UI音の設定(UI_FOUNDATION_PLAN 3-4)。
 *
 * **音量とミュートは必須**。音を足す改修で最初に用意すべきものは、音を
 * 止める手段である。設定は localStorage に持つ(端末ごとの好み — サーバーに
 * 送る性質のものではない)。
 *
 * SSRとの不一致を避けるため既定値で描いてから effect で実値に差し替える。
 * ショーの音量とは別系統(ショーは `/daily-derby` 右上の SOUND ON/OFF)。
 */
export function UiSoundTile({
  t,
}: {
  t: { label: string; lead: string; on: string; off: string; volume: string; note: string };
}) {
  const [conf, setConf] = useState<UiSoundSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setConf(readUiSoundSettings());
  }, []);

  const update = (next: UiSoundSettings, preview: boolean) => {
    setConf(next);
    writeUiSoundSettings(next);
    // 変えた瞬間に確かめられる(音量スライダーは聴かないと決められない)
    if (preview && next.enabled) previewUiSound(next);
  };

  return (
    <div className={s.soundTile}>
      <div className={s.soundRow}>
        <span className={s.soundLabel}>{t.label}</span>
        <button
          type="button"
          className={conf.enabled ? s.soundOn : s.soundOff}
          onClick={() => update({ ...conf, enabled: !conf.enabled }, !conf.enabled)}
          aria-pressed={conf.enabled}
        >
          {conf.enabled ? t.on : t.off}
        </button>
      </div>
      <div className={s.soundLead}>{t.lead}</div>
      <label className={s.soundVolRow}>
        <span className={s.soundVolK}>{t.volume}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(conf.volume * 100)}
          disabled={!conf.enabled}
          onChange={(e) => setConf({ ...conf, volume: Number(e.target.value) / 100 })}
          // 動かしている最中に鳴らすと連射になるので、離した/確定した時だけ試聴
          onMouseUp={() => update(conf, true)}
          onTouchEnd={() => update(conf, true)}
          onKeyUp={() => update(conf, true)}
          aria-label={t.volume}
        />
        <span className={s.soundVolV}>{Math.round(conf.volume * 100)}</span>
      </label>
      <div className={s.soundNote}>{t.note}</div>
    </div>
  );
}
