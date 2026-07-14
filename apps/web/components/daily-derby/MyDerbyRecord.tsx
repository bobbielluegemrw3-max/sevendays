'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DAY0_MINT_FEE } from '@sevendays/domain';
import { apiFetch } from '@/lib/client-api';
import { NightResultsList, nightResultsCount } from '@/components/daily-derby/NightResultsList';
import { conditionsView, type DerbyConditionsView, type DerbyNightResults } from '@/lib/daily-derby';
import s from '../../app/races.module.css';

/**
 * あなたのレース記録 — Racing Diary リデザイン(2026-07-10 オーナー指示 + 見やすさ改善)。
 * 「記録は毎日のこと」なので、日次アーカイブを3層で見せる:
 *   ① 月カレンダーで日付を選ぶ(記録のある夜=点、選択中=シアン)。← 旧 ←/select/→ を置換
 *   ② その夜のダイジェスト(生存/DAY7/BURN/売買のタリー + 売買収支)。数値は記録データから算出のみ。
 *   ③ カテゴリ別グループ(NightResultsList grouped)。行の見た目は審判演出と共用のまま。
 *
 * データ契約は不変: GET /api/v1/daily-derby/my-results/:date が
 * DerbyNightResults & { date, dates } を返す。カレンダーの月送りは client 状態のみ(追加API不要)。
 */

type MyResults = DerbyNightResults & {
  date: string | null;
  dates: string[];
  conditions: { weather: string; track: string; surface: string; night_name: string | null } | null;
};

/* その日のレース条件の値色(ショーの CONDITION_COLORS と同じ意味色)。 */
const COND_COLORS: Record<string, string> = {
  SUNNY: '#ffd97a', CLOUDY: '#aab4c8', RAIN: '#6fc3ff', STORM: '#c78cff',
  FAST: '#00eaff', GOOD: '#35d07f', SOFT: '#e6b24a', HEAVY: '#ff5c5c',
  TURF: '#58d68d', DIRT: '#d8a05a',
};

/* その日の天候・馬場・コース(オーナー指示 2026-07-10: レース確定日は必ず表示)。 */
function DayConditions({ c }: { c: DerbyConditionsView }) {
  return (
    <div className={s.digestCond}>
      <span className={s.digestCondK}>天候</span>
      <b style={{ color: COND_COLORS[c.weather] }}>{c.weather_ja}</b>
      <span className={s.digestCondK}>/ 馬場</span>
      <b style={{ color: COND_COLORS[c.track] }}>{c.track_ja}</b>
      <span className={s.digestCondK}>/ コース</span>
      <b style={{ color: COND_COLORS[c.surface] }}>{c.surface_ja}</b>
      {c.night_name && <span className={s.digestFes}>{c.night_name}</span>}
    </div>
  );
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'] as const;

function fmtJa(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}
function dowOf(iso: string): string {
  return DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}
function money(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** その夜のダイジェスト(記録データから算出。架空値なし)。 */
function NightDigest({ iso, data }: { iso: string; data: MyResults }) {
  const day7 = data.survived.filter((h) => h.day7).length;
  const srv = data.survived.filter((h) => !h.day7).length;
  const burn = data.burned.length;
  const trade = data.sold.length + data.bought.length;
  // 実際に動いたお金で合計する(2026-07-14 オーナー指摘):
  // 売却=手数料2%控除後の受取 / 新規発行=価格+ミント手数料2 / P2P購入=成立額。
  const inSum = data.sold.reduce((t, h) => t + Number(h.price) * 0.98, 0);
  const outSum = data.bought.reduce(
    (t, h) => t + Number(h.price) + (h.is_mint ? Number(DAY0_MINT_FEE) : 0),
    0,
  );
  const empty = nightResultsCount(data) === 0;

  const idx = data.dates.indexOf(iso);
  const newer = idx > 0 ? data.dates[idx - 1]! : null;
  const older = idx >= 0 && idx < data.dates.length - 1 ? data.dates[idx + 1]! : null;

  return (
    <div className={s.digest}>
      <div className={s.digestTop}>
        <span className={s.digestDate}>{fmtJa(iso)}</span>
        <span className={s.digestDow}>{dowOf(iso)}曜</span>
      </div>
      {data.conditions && <DayConditions c={conditionsView(data.conditions)} />}
      {empty ? (
        <div className={s.digestEmpty}>この夜は、あなたの出走・売買はありませんでした。</div>
      ) : (
        <>
          <div className={s.tally}>
            {day7 > 0 && <div className={`${s.tStat} ${s.tDay7}`}><span className={s.tStatN}>{day7}</span><span className={s.tStatK}>DAY7 走破</span></div>}
            {srv > 0 && <div className={`${s.tStat} ${s.tSrv}`}><span className={s.tStatN}>{srv}</span><span className={s.tStatK}>生存</span></div>}
            {burn > 0 && <div className={`${s.tStat} ${s.tBurn}`}><span className={s.tStatN}>{burn}</span><span className={s.tStatK}>BURN 消滅</span></div>}
            {trade > 0 && <div className={`${s.tStat} ${s.tTrade}`}><span className={s.tStatN}>{trade}</span><span className={s.tStatK}>売買 成立</span></div>}
          </div>
          {(data.sold.length > 0 || data.bought.length > 0) && (
            <div className={s.pl}>
              {data.sold.length > 0 && <span className={s.plIn}>売却 受取(手数料2%控除後) <b>+{money(inSum)}</b> USDT</span>}
              {data.bought.length > 0 && <span className={s.plOut}>購入・発行 支払(手数料込み) <b>−{money(outSum)}</b> USDT</span>}
            </div>
          )}
        </>
      )}
      <div className={s.digestStep}>
        <button type="button" className={s.stepBtn} disabled={!older} onClick={() => older && window.dispatchEvent(new CustomEvent('derby-record-go', { detail: older }))}>← 前日</button>
        <button type="button" className={s.stepBtn} disabled={!newer} onClick={() => newer && window.dispatchEvent(new CustomEvent('derby-record-go', { detail: newer }))}>翌日 →</button>
      </div>
    </div>
  );
}

/** 月カレンダー(記録のある夜=点、選択中=シアン)。月送りは records のある月のみ。 */
function RecordCalendar({
  dates,
  selected,
  viewMonth,
  onPickDate,
  onPickMonth,
}: {
  dates: string[];
  selected: string | null;
  viewMonth: string; // 'YYYY-MM'
  onPickDate: (iso: string) => void;
  onPickMonth: (ym: string) => void;
}) {
  const have = useMemo(() => new Set(dates), [dates]);
  const months = useMemo(() => [...new Set(dates.map((d) => d.slice(0, 7)))].sort(), [dates]);
  const prev = months.filter((x) => x < viewMonth).pop() ?? null;
  const next = months.filter((x) => x > viewMonth).shift() ?? null;

  const [y, m] = viewMonth.split('-').map(Number) as [number, number];
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: ({ iso: string; day: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  return (
    <div className={s.cal}>
      <div className={s.calHead}>
        <button type="button" className={s.calNav} disabled={!prev} onClick={() => prev && onPickMonth(prev)} aria-label="前の月">‹</button>
        <span className={s.calMonth}>{y}年{m}月</span>
        <button type="button" className={s.calNav} disabled={!next} onClick={() => next && onPickMonth(next)} aria-label="次の月">›</button>
      </div>
      <div className={s.calGrid}>
        {DOW.map((d) => <div key={d} className={s.calDow}>{d}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} className={s.calCell} />;
          const has = have.has(c.iso);
          const sel = c.iso === selected;
          const cls = [s.calCell];
          if (has) cls.push(s.calHas);
          if (sel) cls.push(s.calSel);
          return (
            <div
              key={c.iso}
              className={cls.join(' ')}
              onClick={has ? () => onPickDate(c.iso) : undefined}
              role={has ? 'button' : undefined}
            >
              {c.day}
              {has && !sel ? <span className={s.calDot} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MyDerbyRecord() {
  const [data, setData] = useState<MyResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState<string>('');

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const r = await apiFetch<MyResults>(`/api/v1/daily-derby/my-results/${date}`);
    if (r.status === 200) {
      const body = r.body as MyResults;
      setData(body);
      if (body.date) setViewMonth(body.date.slice(0, 7));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load('latest');
  }, [load]);

  // 前日/翌日ボタン(NightDigest 内)からのジャンプ
  useEffect(() => {
    const h = (e: Event) => void load((e as CustomEvent<string>).detail);
    window.addEventListener('derby-record-go', h);
    return () => window.removeEventListener('derby-record-go', h);
  }, [load]);

  if (!data) {
    return (
      <section>
        <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>
        <div className={s.empty}>{loading ? '読み込み中…' : 'レース記録を取得できませんでした。'}</div>
      </section>
    );
  }

  return (
    <section>
      <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>

      <div className={s.recStack}>
        <RecordCalendar
          dates={data.dates}
          selected={data.date}
          viewMonth={viewMonth || (data.date ?? '2026-01').slice(0, 7)}
          onPickDate={(iso) => void load(iso)}
          onPickMonth={setViewMonth}
        />

        {data.date === null ? (
          <div className={s.empty}>確定したレースはまだありません。</div>
        ) : (
          <>
            <NightDigest iso={data.date} data={data} />
            {nightResultsCount(data) > 0 && <NightResultsList results={data} grouped />}
          </>
        )}
      </div>
    </section>
  );
}
