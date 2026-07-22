import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import type { TradeSettings } from '@/components/TradeAutoControls';
import {
  DashboardView,
  type DashHorse,
  type DashWallet,
  type DashBuff,
  type DashRace,
  type DashResult,
  type DashBuyback,
  type DashNotification,
} from '@/components/DashboardView';

interface Me { id: string; stable_name?: string | null; training_tickets?: number; jackpot?: { enabled: boolean; prize_usdt: string; winners: number } | null }
interface Session { id: string; status: string }
interface RaceResultRow { horse_id: string; final_score: string; final_rank: number; is_burned: boolean; current_day?: number | null }

/** Signed-in home: fetches everything through the in-process API bridge and
 *  hands plain data to the presentational DashboardView. */
export default async function Dashboard() {
  const lang = await getLang();
  // me も並列に含める(2026-07-16 §D: 直列1往復の解消。401時のredirectは
  // Promise.all内からも例外として伝播するので挙動は従来と同じ)。
  const [me, walletR, horsesR, buffR, sessionsR, racesR, buybacksR, notifR, tradeR] = await Promise.all([
    serverApiOrLogin<Me>('/api/v1/me'),
    serverApi<DashWallet>('/api/v1/wallet'),
    serverApi<{ horses: DashHorse[] }>('/api/v1/horses'),
    serverApi<DashBuff>('/api/v1/revenge-buffs/current'),
    serverApi<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ races: DashRace[] }>('/api/v1/races'),
    serverApi<{ buybacks: DashBuyback[] }>('/api/v1/buybacks'),
    serverApi<{ notifications: DashNotification[] }>('/api/v1/notifications'),
    serverApi<TradeSettings>('/api/v1/trade-settings'),
  ]);

  const horses = horsesR.status === 200 ? horsesR.body.horses : [];
  const races = racesR.status === 200 ? racesR.body.races : [];

  // Last completed race + this player's results in it.
  // 本番のレース終端状態は FINALIZED(COMPLETED は Step17 で FINALIZED に進む
  // 中間状態 — 2026-07-16 本番不具合: COMPLETED だけ探すと常に空だった)。
  const lastRace = races.find((r) => r.status === 'FINALIZED' || r.status === 'COMPLETED') ?? null;
  let myResults: DashResult[] = [];
  if (lastRace && horses.length > 0) {
    const resultsR = await serverApi<{ results: RaceResultRow[] }>(`/api/v1/races/${lastRace.id}/results`);
    if (resultsR.status === 200) {
      const byId = new Map(horses.map((h) => [h.id, h]));
      const rows = resultsR.body.results;
      /* 「あと何点で助かったか」— band-race.ts:302-305 と同じ定義で計算する。
         BURNは帯(=同じLV)の下位N切りなので、帯の中でしか意味を持たない。
           生存 … 自分と「BURNの最上位」の差
           BURN … 自分と「生存の最下位」の差
         レースは1レースで確定するので、ここは開示順序ではなく確定値の集計。
         結果は既に取得済みの配列から出す(追加リクエストなし)。 */
      const marginOf = (row: RaceResultRow): number | null => {
        const lv = row.current_day;
        if (lv === null || lv === undefined) return null;
        const band = rows.filter((x) => x.current_day === lv);
        const scores = (list: RaceResultRow[]) => list.map((x) => Number(x.final_score));
        const mine = Number(row.final_score);
        if (row.is_burned) {
          const survivors = scores(band.filter((x) => !x.is_burned));
          if (survivors.length === 0) return null;
          return Math.round((Math.min(...survivors) - mine) * 100) / 100;
        }
        const burned = scores(band.filter((x) => x.is_burned));
        if (burned.length === 0) return null; // 全馬生還の夜は「差」が存在しない
        return Math.round((mine - Math.max(...burned)) * 100) / 100;
      };
      myResults = rows
        .filter((r) => byId.has(r.horse_id))
        .map((r) => ({ ...r, horse: byId.get(r.horse_id)!, margin: marginOf(r) }));
    }
  }

  return (
    <DashboardView
      lang={lang}
      data={{
        wallet: walletR.status === 200 ? walletR.body : null,
        horses,
        buff: buffR.status === 200 && buffR.body?.buff_rarity ? buffR.body : null,
        pendingCount:
          sessionsR.status === 200
            ? sessionsR.body.sessions.filter((x) => x.status === 'PENDING_ASSIGNMENT').length
            : 0,
        lastRace,
        myResults,
        buybacks: buybacksR.status === 200 ? buybacksR.body.buybacks : [],
        notifications: notifR.status === 200 ? notifR.body.notifications : [],
        trade: tradeR.status === 200 ? tradeR.body : null,
        stableName: me.stable_name ?? null,
        weeklyTickets: me.training_tickets ?? 0,
        jackpot: me.jackpot ?? null,
      }}
    />
  );
}
