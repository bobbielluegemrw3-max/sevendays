/**
 * ランディング(TOPページ)の多言語コピー。日本語(既定)+ 英語・中国語・
 * 韓国語・マレー語(2026-07-15 オーナー決定)。
 *
 * コピー規範(正直化 R1/R3・「単なるゲーム」framing 維持):
 *  - earn / profit / invest / return / 利回り / 保証 系の語は入れない
 *  - BURN(馬の消滅)などのリスクは正直に書く
 *  - サポートボーナス系は Support Bonus / お祝い金(commission/MLMと言わない)
 *
 * 注: 英語・日本語は本実装で確定。中/韓/マレー語は一次翻訳で、公開マーケティング
 *  前に各ネイティブのレビューを推奨(辞書構造なので差し替えは容易)。
 */

export const LANDING_LANGS = ['ja', 'en', 'zh', 'ko', 'ms'] as const;
export type Lang = (typeof LANDING_LANGS)[number];

export const LANG_LABEL: Record<Lang, string> = {
  ja: '日本語',
  en: 'English',
  zh: '中文',
  ko: '한국어',
  ms: 'Bahasa Melayu',
};

export interface LandingDict {
  nav_how: string;
  nav_collection: string;
  nav_economy: string;
  login: string;
  login_join_race: string;
  login_own: string;
  login_buy: string;
  hero_lead: string;
  hero_cta_adopt: string;
  hero_cta_how: string;
  trust_commit: string;
  trust_usdt: string;
  trust_ledger: string;
  step01_t: string;
  step01_d: string;
  step02_t: string;
  step02_da: string;
  step02_db: string;
  /** 見ている人の地域時刻の括弧書き。{t} を実際の現地時刻に置換する(例: '(あなたの地域では {t})')。 */
  local_area_tpl: string;
  /** カウントダウンカードの発走行: post_pre + <LocalRaceTime/> + post_post。 */
  post_pre: string;
  post_post: string;
  step03_t: string;
  step03_d: string;
  step04_t: string;
  step04_d: string;
  step05_t: string;
  step05_d: string;
  s3_h2: string;
  s3_lead: string;
  q1_h: string;
  q1_p: string;
  q2_h: string;
  q2_p: string;
  q3_h: string;
  q3_p: string;
  s3_closing: string;
  s4_h2: string;
  s4_lead_a: string;
  s4_lead_b: string;
  mylane_yours: string;
  ev_champ: string;
  ev_survive: string;
  ev_burn: string;
  fc_tag: string;
  fc_title: string;
  fc_weather_k: string;
  fc_weather_v: string;
  fc_track_k: string;
  fc_track_v: string;
  fc_course_k: string;
  fc_course_v: string;
  fc_note_b: string;
  fc_note_rest: string;
  next_race_note: string;
  /** LP改修 2026-07-22(LP_REVISION_SPEC 層A)。
   *  showcase_tag = 実績でなく見本であることの明示。
   *  ladder_burn_* / s5_p3 = 値上がりと同格に置く「消滅」(R1: 上がる話だけ見せない)。 */
  /** LP改修 B-2(2026-07-22): ④を帯レースの順位表に描き替える。
   *  実データではなく UI の例示。数字は価格表・スコアの体裁に収まる範囲のみ。 */
  br_eyebrow: string;
  br_you: string;
  br_prov_tpl: string;
  br_line_tpl: string;
  br_margin_k: string;
  br_margin_t: string;
  br_note: string;
  showcase_tag: string;
  ladder_burn_v: string;
  ladder_burn_d: string;
  s5_p3: string;
  s5_h2: string;
  s5_p: string;
  s5_p2: string;
  s6_h2: string;
  champ_small: string;
  s6_p: string;
  league_p: string;
  s7_h2: string;
  s7_pa: string;
  s7_support: string;
  s7_pb: string;
  team_mate: string;
  team_center: string;
  s8_h2: string;
  showcase_note_rest: string;
  mint_label: string;
  see_all: string;
  s9_h2: string;
  s9_lead_a: string;
  s9_lead_b: string;
  s9_lead_c: string;
  ledger_a_n: string;
  ledger_a_k: string;
  ledger_b_k: string;
  ledger_c_n: string;
  ledger_c_k: string;
  ledger_d_n: string;
  ledger_d_k: string;
  csv_note: string;
  s10_h2a: string;
  s10_h2b: string;
  s10_p: string;
  gate_name: string;
  gate_slot: string;
  field_entrants_a: string;
  field_entrants_u: string;
  field_burn_a: string;
  field_burn_u: string;
}

const ja: LandingDict = {
  nav_how: '遊び方', nav_collection: 'コレクション', nav_economy: 'エコノミー',
  login: 'Google でログイン', login_join_race: 'Google でレースに参加',
  login_own: 'Google で厩舎を持つ', login_buy: 'Google で購入',
  hero_lead: 'LV.7まで、走り抜け。全馬が一斉に発走。下位はBurn、生き残った馬はレースごとに価値が高まる。P2Pで売買。',
  hero_cta_adopt: '馬を迎える ▶', hero_cta_how: '遊び方を見る',
  trust_commit: '結果は事前にコミットされ、後から検証できる。',
  trust_usdt: '賞金はオンチェーンで受け取る。',
  trust_ledger: '全レースの記録は台帳で公開、CSVで検証可能。',
  step01_t: '馬を迎える',
  step01_d: '予算額を指定してプール予約すると自動で割り当て。出走中の馬(P2P)を優先、足りなければ新規Mint(102 USDT=価格100+手数料2)。予算いっぱい迎えて、余りは自動返金。',
  step02_t: '調教して出走',
  step02_da: 'レース前に調教で総合値を伸ばせます(6メニューから2つ)。毎日 ', step02_db: '、すべての馬が一斉に走ります。',
  local_area_tpl: '(あなたの地域では {t})', post_pre: '毎日 ', post_post: ' · 全馬一斉発走',
  step03_t: '生存 or Burn',
  step03_d: '1日2回レース開催。朝8:00と夜20:00、存在する全ての馬が一斉にレース出走。成績下位の馬はBurnで消滅(全記録は台帳で公開)。生き残った馬はLVが上がり、価値も高まる。',
  step04_t: 'P2P売買',
  step04_d: '生き残り馬は価値が高まったままP2P売買で自動的に売却される。所有者は即座にUSDTを受け取ります。',
  step05_t: 'LV.7 → チャンピオン',
  step05_d: '7つのレースを走り切れば200 USDTを7回で受取(最速3.5日)。完済で記念NFTになります。',
  s3_h2: 'これは、厩舎のゲームだ。',
  s3_lead: 'あなたは厩舎のオーナー。あなたが迎える馬が、あなたのレースを決める。',
  q1_h: '集める', q1_p: 'マイ厩舎に、有能な馬をどれだけ揃えられるか。',
  q2_h: '狙う', q2_p: 'チャンピオンになる馬を、見抜けるか。',
  q3_h: '守る', q3_p: 'BURNされない馬を、走らせ続けられるか。',
  s3_closing: '買う・鍛える・走らせる・手放す。すべての判断が、あなたの厩舎の物語になる。',
  s4_h2: '朝8:00と夜20:00 — 全馬一斉の巨大レース、1日2回。',
  s4_lead_a: 'あなたの国では ', s4_lead_b: ' — マイ厩舎の馬は、毎日2回デイリーダービーに出走する。勝ち残った馬は価値が上がり(100 → 110 → 121 → …)、敗れた馬はBURN — 消滅する。',
  mylane_yours: 'あなたの馬',
  ev_champ: 'LV.7 走破 — CHAMPION', ev_survive: 'LV.3 → LV.4 生存', ev_burn: 'LV.2 — BURN',
  fc_tag: '— 次のレースの予報 —', fc_title: 'レースの最後には、「次のレースの予報」が発表される。',
  fc_weather_k: '天候', fc_weather_v: '雨', fc_track_k: '馬場', fc_track_v: '稍重', fc_course_k: 'コース', fc_course_v: '芝',
  fc_note_b: '予報が見られるのは、レース演出の中だけ。',
  fc_note_rest: 'だから、毎レース見る理由がある。予報は参考情報で、結果を保証するものではありません。',
  next_race_note: 'この時間だけ、次のレースの予報が出る。',
  br_eyebrow: 'BRACKET · LV.4',
  br_you: 'あなたの馬',
  br_prov_tpl: '暫定 {r}位',
  br_line_tpl: '生存ライン {n}位',
  br_margin_k: 'MARGIN',
  br_margin_t: '点差で生存',
  br_note: '同じLVの馬が同じ帯で走る。下位の数頭がBURNされる — 誰が消えるかは、最後の1頭が確定するまで決まらない。',
  showcase_tag: '表示例',
  ladder_burn_v: '0',
  ladder_burn_d: 'BURN',
  s5_p3: '負けた馬は消える。価値は0になり、戻らない。上がる話と同じだけ、これも起きる。',
  s5_h2: '走った馬は、売れる。',
  s5_p: 'レースが終わるたび、マーケットプレイスが開く。生き残ったあなたの馬は、価値が上がった状態で取引される。高く売るか、次も走らせるか、新しい馬を迎えるか — それを決めるのが、厩舎のオーナーの仕事だ。',
  s5_p2: '生き残るほど価値が積み上がる。手放す時は、あなたが選ぶ。',
  s6_h2: '7つのレースを勝ち残った馬は、チャンピオンになる。',
  champ_small: '7回にわたって賞金を受け取り、合計200 USDT。',
  s6_p: 'チャンピオン馬はもうレースを走らない。マーケットにも出ない。走り切った証は、記念NFTとして厩舎に残る。',
  league_p: 'アクティブユーザー10,000人到達で開幕。チャンピオン馬を持つ厩舎だけが出られる週次リーグ戦。毎週、賞金がかかる。',
  s7_h2: '仲間の栄光は、チームの祝福だ。',
  s7_pa: 'あなたの厩舎は、仲間を招いてチームを作れる。チームの中からチャンピオン(LV.7走破)が誕生したとき、支えたチームには',
  s7_support: 'サポートボーナス',
  s7_pb: 'がお祝い金として配られる。誰かの栄光が、チーム全体の実りになる仕組みだ。だから仲間の馬を応援しよう — チームの中から、次のチャンピオンを送り出そう。',
  team_mate: '仲間', team_center: 'あなたの厩舎',
  s8_h2: '厩舎に迎えられる馬たち。',
  showcase_note_rest: '実際の出品と価格は、ログイン後のマーケットでご覧いただけます。',
  mint_label: 'MINT · 手数料込', see_all: 'すべての出品を見る →',
  s9_h2: 'すべての記録が、台帳に残る。',
  s9_lead_a: 'ゲーム内には公開台帳がある。各レースで何頭が走り、何頭が生き残り、何頭がBURNされたか — 全記録がそのまま公開される。',
  s9_lead_b: 'CSVでダウンロードして、勝率でもなんでも、自由に計算していい。',
  s9_lead_c: 'レース結果は事前コミットされたシードから決定論的に計算され、レース後にシードが公開される。誰でも再計算して検証できる。',
  ledger_a_n: '台帳', ledger_a_k: '毎レース公開', ledger_b_k: 'ダウンロード可',
  ledger_c_n: 'コミット・リビール', ledger_c_k: '誰でも検証',
  ledger_d_n: '複式簿記', ledger_d_k: '負残高を構造的に許さない',
  csv_note: '誰でもダウンロードして再計算できます。',
  s10_h2a: '今日から、あなたは', s10_h2b: '厩舎のオーナーだ。',
  s10_p: 'Googleアカウントで、すぐに始められます。',
  gate_name: 'まだ名前のない一頭', gate_slot: '◇ 枠 空き',
  field_entrants_a: '出走予定 ', field_entrants_u: '頭', field_burn_a: 'BURN枠 ', field_burn_u: '頭',
};

const en: LandingDict = {
  nav_how: 'How to Play', nav_collection: 'Collection', nav_economy: 'Economy',
  login: 'Sign in with Google', login_join_race: 'Join the race with Google',
  login_own: 'Start your stable with Google', login_buy: 'Buy with Google',
  hero_lead: 'Race to LV.7. Every horse starts at once. The lowest are Burned; survivors gain value with every race. Trade P2P.',
  hero_cta_adopt: 'Get a horse ▶', hero_cta_how: 'See how it works',
  trust_commit: 'Every result is committed in advance and verifiable afterward.',
  trust_usdt: 'Rewards are received on-chain.',
  trust_ledger: 'Every race is published on the ledger and checkable via CSV.',
  step01_t: 'Get a horse',
  step01_d: 'Set a budget and reserve a pool — horses are assigned automatically. Racing horses (P2P) come first; new mints fill the rest (102 USDT = 100 price + 2 fee). Your budget is filled and any remainder auto-refunds.',
  step02_t: 'Train and race',
  step02_da: 'Train before each race to raise Total Value (pick 2 of 6 menus). Every day at ', step02_db: ', all horses run at once.',
  local_area_tpl: '({t} your time)', post_pre: 'Every day at ', post_post: ' · all horses start together',
  step03_t: 'Survive or Burn',
  step03_d: 'Two races a day. At 8:00 and 20:00 (MYT), every existing horse runs at once. The lowest finishers are Burned and destroyed (all records are public on the ledger). Survivors gain an LV and rise in value.',
  step04_t: 'P2P trading',
  step04_d: 'Survivors carry their higher value into P2P trades and are sold automatically. The owner receives USDT immediately.',
  step05_t: 'LV.7 → Champion',
  step05_d: 'Run all seven races to receive 200 USDT in seven payments — in as little as 3.5 days. On completion it becomes a memorial NFT.',
  s3_h2: 'This is a game of stables.',
  s3_lead: 'You are the stable owner. The horses you take in decide your race to LV.7.',
  q1_h: 'Collect', q1_p: 'How strong a lineup can you gather in your stable?',
  q2_h: 'Spot', q2_p: 'Can you pick the horse that becomes a Champion?',
  q3_h: 'Protect', q3_p: 'Can you keep a horse running without it being Burned?',
  s3_closing: 'Buy, train, race, let go. Every decision becomes your stable’s story.',
  s4_h2: 'At 8:00 and 20:00 — one massive race for all horses, twice a day.',
  s4_lead_a: 'In your country that is ', s4_lead_b: ' — your stable’s horses run in the Daily Derby twice a day. Winners rise in value (100 → 110 → 121 → …); the defeated are Burned — destroyed.',
  mylane_yours: 'your horses',
  ev_champ: 'LV.7 CLEARED — CHAMPION', ev_survive: 'LV.3 → LV.4 SURVIVED', ev_burn: 'LV.2 — BURN',
  fc_tag: '— Next race’s forecast —', fc_title: 'At the end of each race, the next race’s forecast is revealed.',
  fc_weather_k: 'Weather', fc_weather_v: 'Rain', fc_track_k: 'Track', fc_track_v: 'Soft', fc_course_k: 'Course', fc_course_v: 'Turf',
  fc_note_b: 'The forecast is only visible during the race show.',
  fc_note_rest: 'So there is a reason to watch every race. The forecast is a guide and does not guarantee results.',
  next_race_note: 'Only at this time does the next race’s forecast appear.',
  br_eyebrow: 'BRACKET · LV.4',
  br_you: 'YOUR HORSE',
  br_prov_tpl: 'Provisional #{r}',
  br_line_tpl: 'Survival line #{n}',
  br_margin_k: 'MARGIN',
  br_margin_t: 'points clear — survived',
  br_note: 'Horses of the same LV run in the same bracket. The lowest few are burned — and who they are is not settled until the last horse is revealed.',
  showcase_tag: 'SHOWCASE',
  ladder_burn_v: '0',
  ladder_burn_d: 'BURN',
  s5_p3: 'A horse that loses is burned. Its value becomes 0 and does not come back. This happens just as often as the rise.',
  s5_h2: 'A horse that raced can be sold.',
  s5_p: 'Each time a race ends, the marketplace opens. Your surviving horses trade at their raised value. Sell high, run the next race, or take in a new horse — deciding is the stable owner’s job.',
  s5_p2: 'The longer it survives, the more value builds. You choose the moment to let go.',
  s6_h2: 'A horse that survives seven races becomes a Champion.',
  champ_small: 'Rewards paid in seven installments, 200 USDT in total.',
  s6_p: 'A Champion no longer races and never returns to the market. Its proof of finishing remains in your stable as a memorial NFT.',
  league_p: 'Opens when active users reach 10,000. A weekly league only stables with a Champion horse can enter. Every week, prizes are on the line.',
  s7_h2: 'A teammate’s glory is the team’s blessing.',
  s7_pa: 'Your stable can invite friends and form a team. When a Champion (an LV.7 finisher) is born within the team, the supporting team receives a ',
  s7_support: 'Support Bonus',
  s7_pb: ' as a celebration. One member’s glory becomes the whole team’s harvest. So cheer for your teammates’ horses — send out the next Champion from within the team.',
  team_mate: 'Teammate', team_center: 'Your stable',
  s8_h2: 'The horses you can take in.',
  showcase_note_rest: 'Actual listings and prices are visible in the marketplace after you sign in.',
  mint_label: 'MINT · fee incl.', see_all: 'See all listings →',
  s9_h2: 'Every record stays on the ledger.',
  s9_lead_a: 'The game has a public ledger. How many raced, how many survived, how many were Burned in each race — every record is published as-is.',
  s9_lead_b: 'Download the CSV and compute win rates or anything else, freely.',
  s9_lead_c: 'Results are computed deterministically from a pre-committed seed, and the seed is revealed after the race. Anyone can recompute and verify.',
  ledger_a_n: 'Ledger', ledger_a_k: 'Published every race', ledger_b_k: 'Downloadable',
  ledger_c_n: 'Commit-Reveal', ledger_c_k: 'Anyone can verify',
  ledger_d_n: 'Double-entry', ledger_d_k: 'Negative balances structurally impossible',
  csv_note: 'Anyone can download and recompute.',
  s10_h2a: 'From today, you are', s10_h2b: 'a stable owner.',
  s10_p: 'Start right away with a Google account.',
  gate_name: 'A horse with no name yet', gate_slot: '◇ Stall open',
  field_entrants_a: 'Entrants ', field_entrants_u: '', field_burn_a: 'Burn slots ', field_burn_u: '',
};

const zh: LandingDict = {
  nav_how: '玩法', nav_collection: '收藏', nav_economy: '经济',
  login: '使用 Google 登录', login_join_race: '用 Google 参加比赛',
  login_own: '用 Google 建立马房', login_buy: '用 Google 购买',
  hero_lead: '一路跑到LV.7。所有马匹同时起跑。垫底者被销毁（Burn），存活的马每场比赛身价上涨。可P2P交易。',
  hero_cta_adopt: '迎接一匹马 ▶', hero_cta_how: '查看玩法',
  trust_commit: '每个结果都事先承诺，赛后可验证。',
  trust_usdt: '奖励在链上领取。',
  trust_ledger: '每场比赛都公开在账本上，可用CSV核对。',
  step01_t: '迎接一匹马',
  step01_d: '设定预算进行池预约，系统自动分配。优先分配比赛中的马（P2P），不足则新铸造（102 USDT＝价格100＋手续费2）。按预算配满，余额自动退还。',
  step02_t: '训练并出赛',
  step02_da: '赛前可通过训练提升总合值（6选2）。每天 ', step02_db: '，所有马匹同时起跑。',
  local_area_tpl: '(你所在地区为 {t})', post_pre: '每天 ', post_post: ' · 所有马匹同时起跑',
  step03_t: '存活或销毁',
  step03_d: '每天两场比赛。8:00 与 20:00（马来西亚时间），所有现存马匹同时出赛。成绩垫底的马被销毁（Burn，全部记录公开在账本）。存活的马LV上升，身价上涨。',
  step04_t: 'P2P交易',
  step04_d: '存活的马带着升高的价值进入P2P交易，交易达成后自动结算。马主立即获得USDT。',
  step05_t: 'LV.7 → 冠军',
  step05_d: '跑完七场比赛，分7次领取200 USDT（最快3.5天）。付清后成为纪念NFT。',
  s3_h2: '这是一款关于马房的游戏。',
  s3_lead: '你是马房的主人。你迎接的马，决定你通往LV.7的征程。',
  q1_h: '收集', q1_p: '你能在马房里集齐多少匹出色的马？',
  q2_h: '识别', q2_p: '你能看出哪匹马会成为冠军吗？',
  q3_h: '守护', q3_p: '你能让马持续奔跑而不被销毁吗？',
  s3_closing: '买马、训练、出赛、放手。每一个决定，都成为你马房的故事。',
  s4_h2: '8:00 与 20:00 — 所有马匹同场竞逐的大型比赛，每天两场。',
  s4_lead_a: '在你的国家是 ', s4_lead_b: ' — 马房的马每天两次出战每日德比。胜出的马身价上涨（100 → 110 → 121 → …），落败的马被销毁（Burn）。',
  mylane_yours: '你的马',
  ev_champ: 'LV.7 跑完 — 冠军', ev_survive: 'LV.3 → LV.4 存活', ev_burn: 'LV.2 — 销毁',
  fc_tag: '— 下一场预报 —', fc_title: '每场比赛的最后，会公布“下一场预报”。',
  fc_weather_k: '天气', fc_weather_v: '雨', fc_track_k: '赛道', fc_track_v: '稍重', fc_course_k: '场地', fc_course_v: '草地',
  fc_note_b: '预报只在比赛演出中才能看到。',
  fc_note_rest: '所以每场比赛都有观看的理由。预报仅供参考，不保证结果。',
  next_race_note: '只有这个时间，才会出现下一场预报。',
  br_eyebrow: 'BRACKET · LV.4',
  br_you: '您的马',
  br_prov_tpl: '暂定第{r}位',
  br_line_tpl: '存活线 第{n}位',
  br_margin_k: 'MARGIN',
  br_margin_t: '分之差存活',
  br_note: '同一LV的马在同一梯队比赛。末位数匹会被销毁 — 谁会消失，要到最后一匹确定后才知道。',
  showcase_tag: '示例',
  ladder_burn_v: '0',
  ladder_burn_d: 'BURN',
  s5_p3: '落败的马会消失。价值归零，且不会回来。上涨会发生，这同样会发生。',
  s5_h2: '跑过的马，可以卖出。',
  s5_p: '每场比赛结束后，市场开启。你存活的马以升高的价值交易。高价卖出、继续出赛、还是迎接新马 — 决定权在马房主人手中。',
  s5_p2: '存活越久，价值越高。何时放手，由你选择。',
  s6_h2: '在七场比赛中存活的马，成为冠军。',
  champ_small: '奖励分七次发放，合计200 USDT。',
  s6_p: '冠军马不再参赛，也不再上架市场。跑完全程的证明，作为纪念NFT留在马房。',
  league_p: '活跃用户达到10,000人时开赛。只有拥有冠军马的马房才能参加的每周联赛。每周都设有奖金。',
  s7_h2: '同伴的荣耀，是团队的祝福。',
  s7_pa: '你的马房可以邀请伙伴组建团队。当团队中诞生冠军（跑完LV.7）时，提供支持的团队会获得',
  s7_support: '支持奖励',
  s7_pb: '作为祝贺金。某人的荣耀，成为整个团队的收获。所以为同伴的马加油 — 从团队中送出下一位冠军。',
  team_mate: '伙伴', team_center: '你的马房',
  s8_h2: '可以迎接进马房的马。',
  showcase_note_rest: '实际的上架与价格，登录后可在市场中查看。',
  mint_label: 'MINT · 含手续费', see_all: '查看全部上架 →',
  s9_h2: '每一条记录，都留在账本上。',
  s9_lead_a: '游戏内有公开账本。每场比赛有多少马奔跑、多少存活、多少被销毁 — 全部记录如实公开。',
  s9_lead_b: '下载CSV，胜率或任何数据都能自由计算。',
  s9_lead_c: '结果依据事先承诺的种子以确定性方式算出，赛后公开该种子。任何人都能重新计算并验证。',
  ledger_a_n: '账本', ledger_a_k: '每场公开', ledger_b_k: '可下载',
  ledger_c_n: '承诺-揭示', ledger_c_k: '人人可验证',
  ledger_d_n: '复式记账', ledger_d_k: '结构上不允许负余额',
  csv_note: '任何人都能下载并重新计算。',
  s10_h2a: '从今天起，你就是', s10_h2b: '马房的主人。',
  s10_p: '用 Google 账号，立即开始。',
  gate_name: '一匹还没有名字的马', gate_slot: '◇ 空位',
  field_entrants_a: '预计出战 ', field_entrants_u: '匹', field_burn_a: '销毁名额 ', field_burn_u: '匹',
};

const ko: LandingDict = {
  nav_how: '플레이 방법', nav_collection: '컬렉션', nav_economy: '이코노미',
  login: 'Google로 로그인', login_join_race: 'Google로 레이스 참가',
  login_own: 'Google로 마구간 시작', login_buy: 'Google로 구매',
  hero_lead: 'LV.7까지 달려라. 모든 말이 일제히 출발. 하위권은 소멸(Burn), 살아남은 말은 레이스마다 가치가 오른다. P2P 거래.',
  hero_cta_adopt: '말 맞이하기 ▶', hero_cta_how: '플레이 방법 보기',
  trust_commit: '모든 결과는 사전에 커밋되고, 이후 검증할 수 있습니다.',
  trust_usdt: '보상은 온체인으로 받습니다.',
  trust_ledger: '모든 레이스는 원장에 공개되고 CSV로 확인할 수 있습니다.',
  step01_t: '말 맞이하기',
  step01_d: '예산액을 지정해 풀 예약하면 자동으로 배정됩니다. 달리는 중인 말(P2P)이 우선, 부족하면 신규 민트(102 USDT=가격100+수수료2). 예산껏 맞이하고 잔액은 자동 환불.',
  step02_t: '조련하고 출전',
  step02_da: '레이스 전 조교로 총합값을 올릴 수 있습니다(6개 메뉴 중 2개). 매일 ', step02_db: ', 모든 말이 일제히 달립니다.',
  local_area_tpl: '(현지 시간 {t})', post_pre: '매일 ', post_post: ' · 모든 말이 일제히 출발',
  step03_t: '생존 또는 소멸',
  step03_d: '하루 2회 레이스 개최. 아침 8:00과 밤 20:00(MYT), 존재하는 모든 말이 일제히 출전. 성적 하위권 말은 소멸(Burn, 모든 기록은 원장에 공개). 살아남은 말은 LV이 오르고 가치도 높아진다.',
  step04_t: 'P2P 거래',
  step04_d: '살아남은 말은 오른 가치 그대로 P2P 거래로 자동 판매되고, 소유자는 즉시 USDT를 받습니다.',
  step05_t: 'LV.7 → 챔피언',
  step05_d: '7개 레이스를 완주하면 200 USDT를 7회에 걸쳐 수령(최단 3.5일). 지급이 끝나면 기념 NFT가 됩니다.',
  s3_h2: '이것은 마구간의 게임이다.',
  s3_lead: '당신은 마구간의 주인. 당신이 맞이하는 말이 당신의 레이스를 결정한다.',
  q1_h: '모으기', q1_p: '마구간에 유능한 말을 얼마나 갖출 수 있는가.',
  q2_h: '노리기', q2_p: '챔피언이 될 말을 알아볼 수 있는가.',
  q3_h: '지키기', q3_p: '소멸되지 않는 말을 계속 달리게 할 수 있는가.',
  s3_closing: '사고, 단련하고, 달리게 하고, 놓아준다. 모든 판단이 당신 마구간의 이야기가 된다.',
  s4_h2: '아침 8:00과 밤 20:00 — 모든 말이 일제히 달리는 거대한 레이스, 하루 2회.',
  s4_lead_a: '당신의 나라에서는 ', s4_lead_b: ' — 마구간의 말은 매일 2회 데일리 더비에 출전한다. 이긴 말은 가치가 오르고(100 → 110 → 121 → …), 진 말은 소멸(Burn)한다.',
  mylane_yours: '당신의 말',
  ev_champ: 'LV.7 완주 — 챔피언', ev_survive: 'LV.3 → LV.4 생존', ev_burn: 'LV.2 — BURN',
  fc_tag: '— 다음 레이스 예보 —', fc_title: '레이스의 마지막에 “다음 레이스 예보”가 발표된다.',
  fc_weather_k: '날씨', fc_weather_v: '비', fc_track_k: '주로', fc_track_v: '약간 무거움', fc_course_k: '코스', fc_course_v: '잔디',
  fc_note_b: '예보는 레이스 연출 중에만 볼 수 있다.',
  fc_note_rest: '그래서 매 레이스 볼 이유가 있다. 예보는 참고 정보이며 결과를 보장하지 않습니다.',
  next_race_note: '이 시간에만 다음 레이스 예보가 나온다.',
  br_eyebrow: 'BRACKET · LV.4',
  br_you: '내 말',
  br_prov_tpl: '잠정 {r}위',
  br_line_tpl: '생존 라인 {n}위',
  br_margin_k: 'MARGIN',
  br_margin_t: '점 차로 생존',
  br_note: '같은 LV의 말이 같은 구간에서 달립니다. 하위 몇 마리가 소멸하며, 누가 사라질지는 마지막 한 마리가 확정될 때까지 정해지지 않습니다.',
  showcase_tag: '표시 예',
  ladder_burn_v: '0',
  ladder_burn_d: 'BURN',
  s5_p3: '패한 말은 사라집니다. 가치는 0이 되고 돌아오지 않습니다. 오르는 일과 같은 만큼 이것도 일어납니다.',
  s5_h2: '달린 말은 팔 수 있다.',
  s5_p: '레이스가 끝날 때마다 마켓플레이스가 열린다. 살아남은 당신의 말은 오른 가치로 거래된다. 비싸게 팔지, 다음 레이스도 달리게 할지, 새 말을 맞이할지 — 정하는 것이 마구간 주인의 일이다.',
  s5_p2: '오래 살아남을수록 가치가 쌓인다. 놓아줄 때는 당신이 고른다.',
  s6_h2: '일곱 레이스를 살아남은 말은 챔피언이 된다.',
  champ_small: '7회에 걸쳐 보상을 받아 합계 200 USDT.',
  s6_p: '챔피언 말은 더 이상 레이스를 달리지 않고 마켓에도 나오지 않는다. 완주의 증표는 기념 NFT로 마구간에 남는다.',
  league_p: '활성 사용자 10,000명 도달로 개막. 챔피언 말을 가진 마구간만 나갈 수 있는 주간 리그전. 매주 상금이 걸린다.',
  s7_h2: '동료의 영광은 팀의 축복이다.',
  s7_pa: '당신의 마구간은 동료를 초대해 팀을 만들 수 있다. 팀에서 챔피언(LV.7 완주)이 태어나면 지원한 팀에는 ',
  s7_support: '서포트 보너스',
  s7_pb: '가 축하금으로 지급된다. 누군가의 영광이 팀 전체의 결실이 되는 구조다. 그러니 동료의 말을 응원하자 — 팀에서 다음 챔피언을 내보내자.',
  team_mate: '동료', team_center: '당신의 마구간',
  s8_h2: '마구간에 맞이할 수 있는 말들.',
  showcase_note_rest: '실제 매물과 가격은 로그인 후 마켓에서 볼 수 있습니다.',
  mint_label: 'MINT · 수수료 포함', see_all: '모든 매물 보기 →',
  s9_h2: '모든 기록이 원장에 남는다.',
  s9_lead_a: '게임 안에는 공개 원장이 있다. 레이스마다 몇 마리가 달리고, 몇 마리가 살아남고, 몇 마리가 소멸됐는지 — 모든 기록이 그대로 공개된다.',
  s9_lead_b: 'CSV로 내려받아 승률이든 무엇이든 자유롭게 계산해도 된다.',
  s9_lead_c: '결과는 사전에 커밋된 시드로부터 결정론적으로 계산되고, 레이스 후 시드가 공개된다. 누구나 다시 계산해 검증할 수 있다.',
  ledger_a_n: '원장', ledger_a_k: '레이스마다 공개', ledger_b_k: '다운로드 가능',
  ledger_c_n: '커밋-리빌', ledger_c_k: '누구나 검증',
  ledger_d_n: '복식부기', ledger_d_k: '마이너스 잔액을 구조적으로 불허',
  csv_note: '누구나 내려받아 다시 계산할 수 있습니다.',
  s10_h2a: '오늘부터 당신은', s10_h2b: '마구간의 주인이다.',
  s10_p: 'Google 계정으로 바로 시작할 수 있습니다.',
  gate_name: '아직 이름 없는 한 마리', gate_slot: '◇ 빈자리',
  field_entrants_a: '출전 예정 ', field_entrants_u: '마리', field_burn_a: 'Burn 슬롯 ', field_burn_u: '마리',
};

const ms: LandingDict = {
  nav_how: 'Cara Bermain', nav_collection: 'Koleksi', nav_economy: 'Ekonomi',
  login: 'Log masuk dengan Google', login_join_race: 'Sertai perlumbaan dengan Google',
  login_own: 'Mulakan kandang dengan Google', login_buy: 'Beli dengan Google',
  hero_lead: 'Berlumba ke LV.7. Semua kuda bermula serentak. Yang terbawah dibakar (Burn); yang terselamat naik nilai setiap perlumbaan. Dagang P2P.',
  hero_cta_adopt: 'Dapatkan kuda ▶', hero_cta_how: 'Lihat cara bermain',
  trust_commit: 'Setiap keputusan dikomit lebih awal dan boleh disahkan selepas itu.',
  trust_usdt: 'Ganjaran diterima on-chain.',
  trust_ledger: 'Setiap perlumbaan diterbitkan pada lejar dan boleh disemak melalui CSV.',
  step01_t: 'Dapatkan kuda',
  step01_d: 'Tetapkan bajet dan buat tempahan kolam — kuda diberikan secara automatik. Kuda yang sedang berlumba (P2P) diutamakan; mint baharu mengisi selebihnya (102 USDT = harga 100 + yuran 2). Bajet anda diisi dan baki dikembalikan automatik.',
  step02_t: 'Latih dan berlumba',
  step02_da: 'Latih sebelum setiap perlumbaan untuk menaikkan Nilai Total (pilih 2 daripada 6 menu). Setiap hari ', step02_db: ', semua kuda berlari serentak.',
  local_area_tpl: '(waktu tempatan anda {t})', post_pre: 'Setiap hari ', post_post: ' · semua kuda bermula serentak',
  step03_t: 'Terselamat atau Burn',
  step03_d: 'Dua perlumbaan sehari. Pada 8:00 dan 20:00 (MYT), semua kuda yang wujud berlari serentak. Yang terbawah dibakar (Burn) dan musnah (semua rekod didedahkan pada lejar). Yang terselamat naik LV dan naik nilai.',
  step04_t: 'Dagangan P2P',
  step04_d: 'Kuda terselamat membawa nilai lebih tinggi ke dagangan P2P dan dijual secara automatik. Pemilik menerima USDT serta-merta.',
  step05_t: 'LV.7 → Juara',
  step05_d: 'Berlari kesemua tujuh perlumbaan untuk menerima 200 USDT dalam tujuh bayaran — sepantas 3.5 hari. Setelah selesai ia menjadi NFT peringatan.',
  s3_h2: 'Ini permainan kandang kuda.',
  s3_lead: 'Anda pemilik kandang. Kuda yang anda ambil menentukan perlumbaan anda ke LV.7.',
  q1_h: 'Kumpul', q1_p: 'Seberapa hebat barisan kuda yang boleh anda kumpul di kandang?',
  q2_h: 'Kesan', q2_p: 'Bolehkah anda mengenal pasti kuda yang akan menjadi Juara?',
  q3_h: 'Lindungi', q3_p: 'Bolehkah anda memastikan kuda terus berlari tanpa dibakar?',
  s3_closing: 'Beli, latih, lumba, lepaskan. Setiap keputusan menjadi kisah kandang anda.',
  s4_h2: 'Pada 8:00 dan 20:00 — satu perlumbaan besar untuk semua kuda, dua kali sehari.',
  s4_lead_a: 'Di negara anda ialah ', s4_lead_b: ' — kuda kandang anda berlumba dalam Daily Derby dua kali sehari. Yang menang naik nilai (100 → 110 → 121 → …); yang kalah dibakar (Burn) — musnah.',
  mylane_yours: 'kuda anda',
  ev_champ: 'LV.7 SELESAI — JUARA', ev_survive: 'LV.3 → LV.4 SELAMAT', ev_burn: 'LV.2 — BURN',
  fc_tag: '— Ramalan perlumbaan seterusnya —', fc_title: 'Pada penghujung setiap perlumbaan, ramalan perlumbaan seterusnya didedahkan.',
  fc_weather_k: 'Cuaca', fc_weather_v: 'Hujan', fc_track_k: 'Trek', fc_track_v: 'Lembut', fc_course_k: 'Padang', fc_course_v: 'Rumput',
  fc_note_b: 'Ramalan hanya kelihatan semasa persembahan perlumbaan.',
  fc_note_rest: 'Jadi ada sebab untuk menonton setiap perlumbaan. Ramalan hanya panduan dan tidak menjamin keputusan.',
  next_race_note: 'Hanya pada masa ini ramalan perlumbaan seterusnya muncul.',
  br_eyebrow: 'BRACKET · LV.4',
  br_you: 'KUDA ANDA',
  br_prov_tpl: 'Sementara #{r}',
  br_line_tpl: 'Garis hidup #{n}',
  br_margin_k: 'MARGIN',
  br_margin_t: 'mata — selamat',
  br_note: 'Kuda pada LV yang sama berlumba dalam kumpulan yang sama. Beberapa yang terbawah akan dibakar — siapa yang hilang tidak diketahui sehingga kuda terakhir disahkan.',
  showcase_tag: 'CONTOH',
  ladder_burn_v: '0',
  ladder_burn_d: 'BURN',
  s5_p3: 'Kuda yang kalah akan dibakar. Nilainya menjadi 0 dan tidak kembali. Ini berlaku sekerap kenaikan itu berlaku.',
  s5_h2: 'Kuda yang berlumba boleh dijual.',
  s5_p: 'Setiap kali perlumbaan tamat, pasaran dibuka. Kuda terselamat anda didagangkan pada nilai yang meningkat. Jual tinggi, berlari lagi, atau ambil kuda baharu — memutuskan itu tugas pemilik kandang.',
  s5_p2: 'Semakin lama terselamat, semakin tinggi nilainya. Saat untuk melepaskan, anda pilih.',
  s6_h2: 'Kuda yang terselamat tujuh perlumbaan menjadi Juara.',
  champ_small: 'Ganjaran dibayar dalam tujuh ansuran, 200 USDT keseluruhannya.',
  s6_p: 'Juara tidak lagi berlumba dan tidak kembali ke pasaran. Bukti tamatnya kekal di kandang sebagai NFT peringatan.',
  league_p: 'Dibuka apabila pengguna aktif mencapai 10,000. Liga mingguan yang hanya boleh disertai kandang yang memiliki kuda Juara. Setiap minggu, ada hadiah.',
  s7_h2: 'Kegemilangan rakan ialah restu pasukan.',
  s7_pa: 'Kandang anda boleh menjemput rakan dan membentuk pasukan. Apabila Juara (penamat LV.7) lahir dalam pasukan, pasukan penyokong menerima ',
  s7_support: 'Support Bonus',
  s7_pb: ' sebagai tanda raikan. Kegemilangan seseorang menjadi hasil seluruh pasukan. Jadi sokong kuda rakan anda — hantar Juara seterusnya dari dalam pasukan.',
  team_mate: 'Rakan', team_center: 'Kandang anda',
  s8_h2: 'Kuda yang boleh anda ambil.',
  showcase_note_rest: 'Penyenaraian dan harga sebenar kelihatan di pasaran selepas anda log masuk.',
  mint_label: 'MINT · termasuk yuran', see_all: 'Lihat semua penyenaraian →',
  s9_h2: 'Setiap rekod kekal pada lejar.',
  s9_lead_a: 'Permainan mempunyai lejar awam. Berapa yang berlumba, berapa terselamat, berapa dibakar dalam setiap perlumbaan — setiap rekod diterbitkan seadanya.',
  s9_lead_b: 'Muat turun CSV dan kira kadar menang atau apa sahaja, secara bebas.',
  s9_lead_c: 'Keputusan dikira secara berketentuan daripada benih yang dikomit awal, dan benih didedahkan selepas perlumbaan. Sesiapa boleh mengira semula dan mengesahkan.',
  ledger_a_n: 'Lejar', ledger_a_k: 'Terbit setiap perlumbaan', ledger_b_k: 'Boleh dimuat turun',
  ledger_c_n: 'Commit-Reveal', ledger_c_k: 'Sesiapa boleh sahkan',
  ledger_d_n: 'Catatan bergu', ledger_d_k: 'Baki negatif mustahil secara struktur',
  csv_note: 'Sesiapa boleh muat turun dan kira semula.',
  s10_h2a: 'Mulai hari ini, anda ialah', s10_h2b: 'pemilik kandang.',
  s10_p: 'Mulakan segera dengan akaun Google.',
  gate_name: 'Seekor kuda yang belum bernama', gate_slot: '◇ Ruang kosong',
  field_entrants_a: 'Peserta ', field_entrants_u: '', field_burn_a: 'Slot Burn ', field_burn_u: '',
};

export const LANDING_COPY: Record<Lang, LandingDict> = { ja, en, zh, ko, ms };

export function isLang(v: string | undefined | null): v is Lang {
  return v === 'ja' || v === 'en' || v === 'zh' || v === 'ko' || v === 'ms';
}
