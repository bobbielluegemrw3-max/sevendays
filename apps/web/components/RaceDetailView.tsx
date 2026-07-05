import Link from 'next/link';
import { RaceResults, type RaceResult } from '@/components/RaceResults';
import s from '../app/races.module.css';

/* ============================================================================
 * /races/[id](レース詳細)再設計 — 結果 + commit-reveal 検証。
 * 純粋な表示コンポーネント。結果一覧は client の <RaceResults> に委譲。
 * データ取得層 page.tsx は依頼側で結線(§参考)。
 * ========================================================================== */

export interface RaceDetail {
  id: string; status: string; participant_count: number | null;
  batch_date: string; race_engine_version: string;
  seed_hash: string; revealed_seed: string | null;
}
export interface Replay { verified: boolean; reason?: string }

export function RaceDetailView({
  race, results, replay,
}: { race: RaceDetail; results: RaceResult[]; replay: Replay | null }) {
  const verifyState = replay == null ? 'pending' : replay.verified ? 'ok' : 'bad';
  const verifyCls = verifyState === 'ok' ? s.verifyOk : verifyState === 'bad' ? s.verifyBad : s.verifyPending;
  const badgeCls = verifyState === 'ok' ? s.vbOk : verifyState === 'bad' ? s.vbBad : s.vbPending;
  const badgeText = verifyState === 'ok' ? '✓ 検証OK' : verifyState === 'bad' ? '✗ 検証失敗' : '検証待ち';

  return (
    <div className={s.wrap}>
      {/* ヘッダ */}
      <div>
        <Link href="/races" className={s.crumb}>← レース一覧</Link>
        <div className={s.titleRow}>
          <span className={s.title}>レース {race.batch_date}</span>
          <span className={`${s.badge} ${race.status === 'COMPLETED' ? s.stCompleted : s.stOpen}`}>
            {race.status === 'COMPLETED' ? 'COMPLETED · 確定' : race.status}
          </span>
          <span className={s.titleMeta}>
            出走 {race.participant_count != null ? race.participant_count.toLocaleString('en-US') : '—'} 頭 · {race.race_engine_version}
          </span>
        </div>
      </div>

      {/* commit-reveal 検証 */}
      <section className={`${s.verify} ${verifyCls}`}>
        <div className={s.verifyHead}>
          <span className={s.verifyLabel}>リプレイ検証 · COMMIT-REVEAL</span>
          <span className={`${s.verifyBadge} ${badgeCls}`}>{badgeText}</span>
        </div>
        <div className={s.verifyRows}>
          <div className={s.vRow}>
            <span className={s.vK}>シードハッシュ(事前コミット)</span>
            <span className={s.vV}>{race.seed_hash}</span>
          </div>
          <div className={s.vRow}>
            <span className={s.vK}>公開シード(レース後)</span>
            <span className={s.vV}>{race.revealed_seed ?? '未公開(レース前)'}</span>
          </div>
        </div>
        <div className={s.verifyNote}>
          {verifyState === 'ok'
            ? '✓ スナップショット + 公開シードから同一の結果を再計算できました。事前に公開されたハッシュと一致 = 運営が結果を操作していないことを誰でも検証できます。'
            : verifyState === 'bad'
              ? `✗ 検証に失敗しました${replay?.reason ? `: ${replay.reason}` : ''}。`
              : 'レース後に公開シードが出ると、スナップショットから結果を再計算して検証できます。'}
        </div>
      </section>

      {/* 結果(検索/絞り込み/ページング) */}
      <RaceResults results={results} />
    </div>
  );
}
