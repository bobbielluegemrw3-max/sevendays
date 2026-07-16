import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { APP_COPY } from '@/lib/i18n';
import { HorseDetailView, type HorseDetail } from '@/components/HorseDetailView';
import { RacesView } from '@/components/RacesView';
import { RaceDetailView } from '@/components/RaceDetailView';
import { WalletView } from '@/components/WalletView';
import { PurchaseView } from '@/components/PurchaseView';
import { NotificationsView } from '@/components/NotificationsView';
import { BuybacksView } from '@/components/BuybacksView';
import { BuybackDetailView } from '@/components/BuybackDetailView';
import { AccountView } from '@/components/AccountView';

/**
 * Dev-only stacked preview of every redesigned page view with fixtures
 * (404 in production). Lets us QA all views without a signed-in session.
 */
const now = () => Date.now();
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

const HORSE: HorseDetail = {
  id: 'a1f4b2e7', name: 'Crimson Tiger', status: 'ACTIVE', current_day: 5,
  horse_type: 'POWER', rarity: 'LEGENDARY',
  dna_hash: '0xa1f4' + 'c3d9'.repeat(15), dna_modifier: '0.00',
  ability_json: { base_speed: 62, base_power: 78, base_stamina: 55, base_guts: 47, base_luck: 33 },
  // 本番のNUMERIC(20,8)テキストを再現(整数表示のQA用)
  condition: '82.00000000', fatigue: '34.00000000',
  mint_seed_hash: '0x77aa'.concat('19be'.repeat(15)), horse_generation_version: 'v1.0.0',
  listing: 'SMART',
  history: [
    { batch_date: '2026-07-06', final_rank: 812, final_score: '71.42', is_burned: false, participant_count: 1520, weather: 'SUNNY', track_condition: 'GOOD', surface: 'TURF' },
    { batch_date: '2026-07-07', final_rank: 233, final_score: '84.09', is_burned: false, participant_count: 1618, weather: 'CLOUDY', track_condition: 'FAST', surface: 'TURF' },
    { batch_date: '2026-07-08', final_rank: 1211, final_score: '63.77', is_burned: false, participant_count: 1702, weather: 'RAIN', track_condition: 'SOFT', surface: 'DIRT' },
    { batch_date: '2026-07-09', final_rank: 87, final_score: '90.15', is_burned: false, participant_count: 1793, weather: 'STORM', track_condition: 'HEAVY', surface: 'DIRT' },
    { batch_date: '2026-07-10', final_rank: 460, final_score: '78.30', is_burned: false, participant_count: 1874, weather: 'SUNNY', track_condition: 'FAST', surface: 'TURF' },
  ],
};

// 手動出品中(Market Lock)の表示QA用
const HORSE_LISTED: HorseDetail = {
  ...HORSE,
  id: 'b2c5d8e1', name: 'Velvet Storm', rarity: 'RARE', horse_type: 'SPRINTER',
  current_day: 5, listing: 'MANUAL',
  dna_hash: '0xb2c5' + 'd8e1'.repeat(15),
  history: HORSE.history.slice(0, 4),
};

// ハンドオフSTATE 02: Day6・走破戦(今夜生き残ればチャンピオン)
const HORSE_DAY6: HorseDetail = {
  ...HORSE,
  id: 'c3d6e9f2', name: 'Iron Monarch', rarity: 'EPIC', horse_type: 'ENDURANCE',
  current_day: 6, listing: 'SMART',
  dna_hash: '0xc3d6' + 'e9f2'.repeat(15),
  condition: '74.00000000', fatigue: '52.00000000',
  history: [
    ...HORSE.history,
    { batch_date: '2026-07-11', final_rank: 129, final_score: '88.61', is_burned: false, participant_count: 1910, weather: 'CLOUDY', track_condition: 'GOOD', surface: 'DIRT' },
  ],
};

// ハンドオフSTATE 04系: チャンピオン(報酬受取中)/ 記念馬(NFT化済み)
const HORSE_CHAMPION: HorseDetail = {
  ...HORSE_DAY6,
  id: 'd4e7f0a3', name: 'Grand Victory', rarity: 'EPIC', horse_type: 'ENDURANCE',
  status: 'DAY7_CLEARED', current_day: 7, listing: null,
  dna_hash: '0xd4e7' + 'f0a3'.repeat(15),
  history: [
    ...HORSE_DAY6.history,
    { batch_date: '2026-07-12', final_rank: 44, final_score: '92.30', is_burned: false, participant_count: 1988, weather: 'SUNNY', track_condition: 'FAST', surface: 'TURF' },
  ],
};
const HORSE_MEMORIAL: HorseDetail = {
  ...HORSE_CHAMPION,
  id: 'e5f8a1b4', name: 'Lucky Legend', rarity: 'LEGENDARY', horse_type: 'BALANCED',
  status: 'MEMORIALIZED',
  dna_hash: '0xe5f8' + 'a1b4'.repeat(15),
};

// ハンドオフSTATE 05: BURNED(最終戦で消滅)
const HORSE_BURNED: HorseDetail = {
  ...HORSE,
  id: 'f6a9b2c5', name: 'Burning Meteor', rarity: 'RARE', horse_type: 'POWER',
  status: 'BURNED', current_day: 4, listing: null,
  dna_hash: '0xf6a9' + 'b2c5'.repeat(15),
  condition: '41.00000000', fatigue: '77.00000000',
  history: [
    ...HORSE.history.slice(0, 3),
    { batch_date: '2026-07-09', final_rank: 1730, final_score: '48.02', is_burned: true, participant_count: 1793, weather: 'STORM', track_condition: 'HEAVY', surface: 'DIRT' },
  ],
};

// 未出走(戦績なし・Day0)の空状態QA用
const HORSE_ROOKIE: HorseDetail = {
  ...HORSE,
  id: 'a7b0c3d6', name: 'Silent Dash', rarity: 'COMMON', horse_type: 'LUCK',
  current_day: 0, listing: null,
  dna_hash: '0xa7b0' + 'c3d6'.repeat(15),
  condition: '80.00000000', fatigue: '0.00000000',
  history: [],
};

const RESULTS = Array.from({ length: 137 }, (_, i) => ({
  horse_id: `h-${(i + 1).toString().padStart(4, '0')}`,
  final_score: (95 - i * 0.31).toFixed(2),
  final_rank: i + 1,
  is_burned: i >= 122,
}));

export default async function PagesPreview() {
  await requireDevPreviewAccess();
  void now;
  const sect = (title: string) => (
    <h2 style={{ margin: '3rem 0 1rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
      ── {title} ──
    </h2>
  );
  return (
    <div>
      {sect('/horses/[id] 馬詳細')}
      <HorseDetailView horse={HORSE} />

      {sect('/horses/[id] 馬詳細(手動出品中 = Market Lock)')}
      <HorseDetailView horse={HORSE_LISTED} />

      {sect('/horses/[id] 馬詳細(Day6 走破戦 — 今夜走破すればチャンピオン)')}
      <HorseDetailView horse={HORSE_DAY6} />

      {sect('/horses/[id] 馬詳細(チャンピオン — 報酬受取中)')}
      <HorseDetailView horse={HORSE_CHAMPION} />

      {sect('/horses/[id] 馬詳細(記念馬 — NFT化済み)')}
      <HorseDetailView horse={HORSE_MEMORIAL} />

      {sect('/horses/[id] 馬詳細(BURNED — 消滅)')}
      <HorseDetailView horse={HORSE_BURNED} />

      {sect('/horses/[id] 馬詳細(新馬 Day0 — 未出走・戦績なし)')}
      <HorseDetailView horse={HORSE_ROOKIE} />

      {sect('/races 一覧')}
      <RacesView
        races={[
          { id: 'r-tonight', status: 'SCHEDULED', participant_count: null, batch_date: '2026-07-06', race_engine_version: 'v1.0.0' },
          { id: 'r-1', status: 'COMPLETED', participant_count: 1874, batch_date: '2026-07-05', race_engine_version: 'v1.0.0' },
          { id: 'r-2', status: 'COMPLETED', participant_count: 1793, batch_date: '2026-07-04', race_engine_version: 'v1.0.0' },
        ]}
      />

      {sect('/races/[id] レース詳細(commit-reveal + 結果ブラウザ)')}
      <RaceDetailView
        race={{
          id: 'r-1', status: 'COMPLETED', participant_count: 137, batch_date: '2026-07-05',
          race_engine_version: 'v1.0.0',
          seed_hash: '0x5eed'.concat('c0de'.repeat(15)), revealed_seed: '0xfeed'.concat('beef'.repeat(15)),
        }}
        results={RESULTS}
        replay={{ verified: true }}
      />

      {sect('/wallet ウォレット')}
      <WalletView
        stableValue={708.64}
        assetsCopy={APP_COPY.ja.dash}
        wallet={{ available: '312.55', locked: '177.16' }}
        deposit={{ address: '0x1234abcd5678ef901234abcd5678ef9012345678', chain_id: 'polygon-pos', asset: 'USDT', confirmations_required: 128 }}
        history={[
          { type: 'DEPOSIT_CREDIT', direction: 'CREDIT', amount: '250.00000000', account: 'USER_AVAILABLE', created_at: iso(60) },
          { type: 'PURCHASE_LOCK', direction: 'DEBIT', amount: '177.16000000', account: 'USER_AVAILABLE', created_at: iso(45) },
          { type: 'BUYBACK_PAYMENT', direction: 'CREDIT', amount: '28.57142857', account: 'USER_AVAILABLE', created_at: iso(30) },
          { type: 'WITHDRAWAL_LOCK', direction: 'DEBIT', amount: '40.00000000', account: 'USER_AVAILABLE', created_at: iso(10) },
        ]}
      />

      {sect('/purchase 購入')}
      <PurchaseView
        sessions={[
          { id: 's-1', status: 'PENDING_ASSIGNMENT', locked_amount: '177.16', assigned_price: null, refund_amount: null, created_at: iso(90) },
          { id: 's-2', status: 'ASSIGNED', locked_amount: '177.16', assigned_price: '110.00', refund_amount: '67.16', created_at: iso(1500) },
        ]}
        assignments={[
          { id: 'as-1', horse_id: 'a1f4b2e7', assigned_price: '110.00', status: 'COMPLETED', was_day0_mint: false, created_at: iso(1500) },
          { id: 'as-2', horse_id: 'b2e7c3d9', assigned_price: '100.00', status: 'COMPLETED', was_day0_mint: true, created_at: iso(2900) },
        ]}
      />

      {sect('/notifications 通知')}
      <NotificationsView
        preview
        notifications={[
          { id: 'n1', notification_type: 'RACE_RESULT_READY', payload_json: { title: '本日のレース結果が確定しました。', body: 'Crimson Tiger の結果を確認してください。' }, read_at: null, created_at: iso(35) },
          { id: 'n2', notification_type: 'HORSE_BURNED', payload_json: { title: 'Burning Meteor は本日のレースでBurnされました。', body: 'Revenge Buffが付与されました。' }, read_at: null, created_at: iso(36) },
          { id: 'n3', notification_type: 'BUYBACK_PAYMENT_PAID', payload_json: { title: 'チャンピオン報酬が支払われました。', body: '28.57 USDT がウォレットに反映されました。' }, read_at: iso(20), created_at: iso(37) },
          { id: 'n4', notification_type: 'DEPOSIT_CONFIRMED', payload_json: { title: '入金が確認されました。', body: '250 USDT がウォレットに反映されました。' }, read_at: iso(50), created_at: iso(70) },
        ]}
      />

      {sect('/champion チャンピオン報酬一覧')}
      <BuybacksView
        buybacks={[
          { id: 'bb-1', horse_id: 'f003aaaa', status: 'IN_PROGRESS', total_amount: '200.00', day7_clear_date: '2026-07-03', payments_paid: 3 },
          { id: 'bb-2', horse_id: 'f004bbbb', status: 'COMPLETED', total_amount: '200.00', day7_clear_date: '2026-06-25', payments_paid: 7 },
        ]}
        t={APP_COPY.ja.champion}
      />

      {sect('/champion/[id] チャンピオン報酬詳細')}
      <BuybackDetailView
        buyback={{
          id: 'bb-1', horse_id: 'f003aaaa', status: 'IN_PROGRESS', total_amount: '200.00', day7_clear_date: '2026-07-03',
          payments: Array.from({ length: 7 }, (_, i) => ({
            payment_number: i + 1,
            due_date: `2026-07-${String(4 + i).padStart(2, '0')}`,
            amount: '28.57142857',
            status: i < 3 ? 'PAID' : 'SCHEDULED',
            paid_at: i < 3 ? iso((3 - i) * 1440) : null,
          })),
        }}
      />

      {sect('/account アカウント')}
      <AccountView
        me={{ id: 'e54dd629-0000-4444-8888-abcdefabcdef', email: 'owner@example.com', created_at: iso(20000) }}
        stats={{ racing: 5, listed: 2, champions: 3, burned: 4, pendingReservations: 1 }}
        trade={{ chosen: true, auto_list: true, auto_reserve: true, auto_reserve_max: null }}
        wallets={[{ wallet_address: '0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432', created_at: iso(10000) }]}
      />
    </div>
  );
}
