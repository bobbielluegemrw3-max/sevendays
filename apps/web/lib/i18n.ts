import { LANDING_LANGS, LANG_LABEL, isLang, type Lang } from '@/lib/landing-i18n';

/* ============================================================================
 * アプリ内(ログイン後)多言語化の土台。ランディングと同じ仕組みを流用する:
 * cookie `sdd_lang`(LanguageSwitcher が書き込む)を唯一の言語ソースとし、
 * サーバーで getLang()(lib/i18n-server.ts)で読み、辞書 APP_COPY[lang] を
 * 各ビューへ prop で渡す。
 *
 * 重要: このファイルはクライアントコンポーネント(例 LogoutButton)からも import
 * される。ゆえに next/headers 等のサーバー専用APIは絶対に持ち込まない(持ち込むと
 * クライアントバンドルに混入してビルド失敗)。cookie を読む getLang() はサーバー
 * 専用の別ファイル lib/i18n-server.ts に分離してある。
 *
 * 方針: 新ライブラリは入れない(landing-i18n と一貫)。ページを1枚ずつ翻訳する
 * たびに AppDict にセクション(nav / dash / …)を足していく。JA は原文を正典、
 * EN は確定品質、ZH/KO/MS は一次翻訳(有料マーケ前にネイティブ最終確認を推奨)。
 * ゲーム内リンクの英字ラベル(DASHBOARD/STABLE/…)は全言語共通のセクション名
 * として英語のまま維持する(TopNav の設計意図)。
 * ========================================================================== */

export { LANDING_LANGS as APP_LANGS, LANG_LABEL, isLang, type Lang };

/** fill はクライアント安全な lib/i18n-shared.ts へ移設(サーバー互換の再export)。
 * クライアントコンポーネントは本ファイルではなく i18n-shared から import すること
 * (本ファイルを import すると5言語辞書がクライアントバンドルに混入する)。 */
export { fill } from '@/lib/i18n-shared';

export interface AppDict {
  common: {
    horses_unit: string; // 数の後ろに付く「頭」(英語は " horses" のようにスペース込み)
    cases_unit: string; // 「件」
  };
  nav: {
    notifications: string;
    account: string;
    guide: string;
    contact: string;
    logout: string;
  };
  dash: {
    result_label: string;
    result_detail: string;
    res_survived: string;
    res_burned: string;
    res_best_tpl: string; // 「最高順位 / 全{n}頭」
    pill_burn: string;
    pill_survived_tpl: string; // 「生存 · Day {d}」
    result_empty: string;

    tonight_label: string;
    countdown_to: string;
    tonight_note: string;
    watch_show: string;

    tasks_label: string;
    untrained_suffix: string; // 「 が未調教」(直前に <b>{n}頭</b>)
    pending_suffix: string; // 「 が割当待ち」(直前に <b>{n}件</b>)
    tasks_prepare_items: string;
    tasks_train: string;
    tasks_adopt: string;
    tasks_sub: string;
    tasks_done_text: string;

    balance_k: string;
    balance_avail: string;
    balance_locked_tpl: string; // 「 · ロック中 {v}」
    stable_val_k: string;
    stable_val_s_tpl: string; // 「USDT · {n}頭の現在価値」
    buff_none: string;
    buff_active_s: string;
    buff_none_s: string;

    stable_mine: string;
    stable_sub_tpl: string; // 「STABLE {n} · 評価額 {v} USDT」
    stable_adopt: string;
    stable_all: string;
    stable_empty_pending_tpl: string; // 「割当待ち {n} 件 — 今夜のレースで確定します。」
    stable_empty_none: string;
    train_yes: string;
    train_no: string;

    bb_title: string;
    bb_title_count_tpl: string; // 「 · {n}頭」
    bb_per: string;
    bb_count_tpl: string; // 「{p} / 7 回」
    bb_note: string;
  };
  /** 引換コード(PromoRedeemForm)。 */
  promo: {
    done_pre: string; // 「🎁 」+ <b>馬名</b> + done_post
    done_post: string;
    view_horse: string;
    toggle: string;
    label: string;
    submit: string;
    submitting: string;
    close: string;
    err_default: string;
  };
  /** 売買自動化(TradeAutoControls: モーダル + タイル)。 */
  trade: {
    save_err: string;
    modal_title: string;
    modal_lead: string;
    smart_head: string;
    smart_badge: string;
    smart_li1: string;
    smart_li2: string;
    smart_li3: string;
    smart_li4: string;
    smart_cta: string;
    manual_head: string;
    manual_li1: string;
    manual_li2: string;
    manual_li3: string;
    manual_li4: string;
    manual_cta: string;
    modal_note: string;
    tile_label: string;
    tile_note: string;
    smart_name: string;
    smart_on_desc: string;
    smart_off_desc: string;
    reserve_name: string;
    reserve_on_desc: string;
    reserve_off_desc: string;
    max_label: string;
    max_unit: string; // オプション「{n} 頭」の単位(先頭スペース込み)
  };
  /** アプリ化&通知導線(PwaSetupTile)。 */
  pwa: {
    label: string;
    done_text: string;
    enable_text: string;
    enable_btn: string;
    enable_busy: string;
    register_text: string;
    register_btn: string;
    register_busy: string;
    blocked_text: string;
    ios_install_text: string;
    install_text: string;
    ios_step1_a: string; // 「共有ボタン」+ アイコン + ios_step1_b
    ios_step1_b: string;
    ios_step2: string;
    ios_step3: string;
    install_steps: string;
    install_hint: string;
    add_app: string;
  };
  /** アカウントページ(AccountView)。 */
  account: {
    title: string;
    st_racing: string;
    st_listed: string;
    st_champions: string;
    st_burned: string;
    st_pending: string;
    email_unset: string;
    reg_label: string; // 「登録 」+ 日付
    play_tpl: string; // 「プレイ {n}日目」
    id_label: string; // 「ID 」+ id
    record_label: string;
    stat_note_a: string; // …報酬の受け取り状況は [CHAMPION] …入出金の履歴は [WALLET] …
    stat_note_b: string;
    stat_note_c: string;
    settings_label: string;
    linking_label: string;
    linking_lead: string;
    support_label: string;
    support_lead: string;
    support_guide: string;
    support_contact: string;
  };
  /** 厩舎名フォーム(StableNameForm)。 */
  stableName: {
    unset: string;
    set_btn: string;
    change_btn: string;
    placeholder: string;
    saving: string;
    save: string;
    cancel: string;
    hint: string;
    err: string;
  };
  /** ログイン連携(AccountLinking)。 */
  linking: {
    login_id: string;
    loading: string;
    unlink: string;
    last_id: string;
    link_google: string;
    wallet_h: string;
    no_wallet: string;
    link_metamask: string;
    err_no_metamask: string;
    err_no_address: string;
    err_link_wallet: string;
    linked_tpl: string; // 「ウォレット {addr} を紐づけました」
    err_unlink: string;
  };
  /** 問い合わせフォーム(ContactView)。 */
  contact: {
    title: string;
    lead: string;
    faq_label: string;
    faq_burn: string;
    faq_buy: string;
    faq_deposit: string;
    faq_champion: string;
    faq_team: string;
    cat_rules: string;
    cat_money: string;
    cat_trade: string;
    cat_team: string;
    cat_other: string;
    cat_label: string;
    subject_label: string;
    subject_ph: string;
    body_label: string;
    body_ph: string;
    sending: string;
    send: string;
    err_send: string;
    done_title: string;
    done_a: string; // …確認のうえ [ご登録のメールアドレス] へ返信…
    done_bold: string;
    done_b: string;
    done_guide: string;
    done_dashboard: string;
    aside_reply_title: string;
    li1_bold: string; // <b>ご登録のメールアドレス</b> + li1_rest
    li1_rest: string;
    aside_li2: string;
    aside_li3: string;
    aside_mail_title: string;
  };
  /** 通知(NotificationsView + NotificationsList)。 */
  notif: {
    title: string;
    unread_tpl: string; // 「未読 {n}」
    read_note: string;
    /** 通知種別ラベル(notification_type → 表示名)。 */
    types: Record<string, string>;
    type_default: string;
    /** カテゴリ表示名(内部id → 表示名)。 */
    cats: Record<'race' | 'trade' | 'reward' | 'money' | 'other', string>;
    cat_all: string;
    digest_title_tpl: string; // 「{d} のダイジェスト」
    count_tpl: string; // 「{n}件」(ダイジェスト件数)
    digest_results: string;
    digest_history: string;
    search_ph: string;
    unread_only: string;
    count_all_tpl: string; // 「全{n}件」
    count_some_tpl: string; // 「{total}件中 {shown}件」
    empty_a: string;
    empty_b: string;
    empty_filtered: string;
    prev: string;
    next: string;
    min_tpl: string; // 「{n}分前」
    hour_tpl: string; // 「{n}時間前」
    day_tpl: string; // 「{n}日前」
  };
  /** チャンピオン(ChampionView + ChampionHero + BuybacksView + BuybackDetailView)。 */
  champion: {
    // ヒーロー
    hero_note: string;
    sound_on_aria: string;
    sound_off_aria: string;
    // 報酬セクション見出し
    rewards_sub: string;
    rewards_note_a: string; // …として <b>200 USDT</b> …
    rewards_note_b: string;
    // 殿堂
    hall_sub: string;
    hall_count_tpl: string; // 「総戴冠 {n}頭」
    hall_sample: string;
    filter_all: string;
    sort_recent: string;
    sort_oldest: string;
    sort_name: string;
    sort_aria: string;
    crowned: string; // 「戴冠」+ 日付
    owner_label: string; // 「オーナー」+ 名
    // リーグ
    league_desc: string;
    ladder_title: string;
    class_win_tpl: string; // 「{n}勝」
    weekly_races_v: string;
    prize_pool_v: string;
    retirement_v: string;
    fanpass_v: string;
    // 報酬一覧(BuybacksView)
    bv_title: string;
    bv_intro_a: string; bv_intro_bold1: string; bv_intro_b: string; bv_intro_bold2: string;
    bv_intro_c: string; bv_intro_bold3: string; bv_intro_d: string;
    card_day7_tpl: string; // 「Day7達成 {d}」
    status_done: string;
    status_progress: string;
    card_horse_tpl: string; // 「馬 {id}」
    count7_tpl: string; // 「{p} / 7 回」
    detail_arrow: string;
    empty_a: string;
    empty_b: string;
    // 報酬詳細(BuybackDetailView)
    crumb: string;
    detail_title_tpl: string; // 「チャンピオン報酬 {d}」
    horse_link_tpl: string; // 「馬 {id} →」
    progress_k: string;
    of7: string; // 「 / 7 回」
    total_received_k: string;
    schedule_label: string;
    due_tpl: string; // 「予定 {d}」
    paid_tpl: string; // 「 · 支払 {t}」
    status_paid: string;
    status_next: string;
    status_pending: string;
    detail_note: string;
  };
  /** サポートボーナス(SupportDashboardView + SupportMapView + /support/map page)。
   *  R3規範: MLM/コミッション/紹介報酬/稼げる 等は使わない。 */
  support: {
    // 共通
    self: string; // 「あなた」
    unit_people: string; // 「名」
    unit_horses: string; // 「頭」
    // ダッシュボード見出し・リード
    map_cta: string;
    lead: string;
    // スターターレート
    rate_k: string;
    rate_who: string;
    gauge_starter: string;
    gauge_leader: string;
    gauge_sub_a: string;
    gauge_sub_bold: string;
    boost_tpl: string; // 「スターターブースト ×{x}」
    standard: string;
    rate_note: string;
    // ティアヒーロー
    tier_hero_k: string;
    next_maintain_tpl: string; // 「T{n}まで 組織 {v} USDT 以上を維持」
    next_direct_tpl: string; // 「(+直接 {d} 以上)」
    tier_max: string;
    vol_a: string; vol_b: string; vol_c: string; // 現在価値: [org] · 直接: [direct] · 再評価…
    action_k: string;
    action_pool_tpl: string; // 「配置待ちの仲間が {n}名 …」
    action_grow_tpl: string; // 「次のティア解放は組織 {v} USDT から。…」
    action_max: string;
    action_btn_place: string;
    action_btn_view: string;
    // KPI
    kpi_total: string;
    kpi_total_sub_tpl: string; // 「{n}回の受け取り」
    kpi_network: string;
    kpi_network_sub: string;
    kpi_pool: string;
    kpi_pool_place: string;
    kpi_pool_none: string;
    // ティア表
    tier_table_h: string;
    tier_meta: string;
    tier_cond_always: string;
    tier_cond_org_tpl: string; // 「組織 ≥ {v}」
    tier_cond_direct_tpl: string; // 「 +直接 ≥ {d}」
    t1_range: string; // 「 (3〜8)」
    tier_foot: string;
    // 招待
    invite_title: string;
    invite_code_label: string; // 「あなたのコード 」+ <b>code</b>
    invite_copied: string;
    invite_copy: string;
    invite_note: string;
    // 履歴
    hist_h: string;
    hist_empty: string;
    hist_why: string;
    // マップ: ツールバー・検索
    toolbar_stats_tpl: string; // 「メンバー {members}名 · 配置待ち {pool}名 · 最深 T{depth}」
    mode_map: string;
    mode_list: string;
    expand_all: string;
    collapse_all: string;
    map_search_ph: string;
    map_search_aria: string;
    map_search_btn: string;
    map_search_notfound: string;
    // 配置バナー
    place_select_a: string; // 「 の配置先を選択中 — 」
    place_hint_map: string;
    place_hint_list: string;
    place_select_b: string; // 「してください」
    cancel: string;
    // ドリルダウン
    you_crumb: string;
    focus_tier_tpl: string; // 「TIER {t} · 」
    focus_meta_tpl: string; // 「直下 {direct}名 · 配下 {sub}名」
    detail_btn: string;
    place_here: string;
    drill_empty: string;
    child_horse_tpl: string; // 「馬{h}頭 · 」
    child_meta_tpl: string; // 「直下{kids}名 · 配下{sub}名」
    drill_open_aria: string;
    // マップキャンバス
    empty_tree: string;
    node_collapsed_tpl: string; // 「+{n}名 折りたたみ中」
    node_series_tpl: string; // 「直下 {n}系列」
    node_direct_tpl: string; // 「直下 {n}名」
    toggle_expand_aria: string;
    toggle_collapse_aria: string;
    node_place_hint_tpl: string; // 「ここに配置 · T{n}」
    // プールドック
    dock_title: string;
    dock_hint: string;
    dock_empty: string;
    pool_joined_tpl: string; // 「参加 {d}」
    pool_place_btn: string;
    // 詳細モーダル
    m_sub_tpl: string; // 「TIER {t}(あなたから{t}段目)」
    m_placed_tpl: string; // 「 · 配置 {d}」
    m_active_horses: string;
    m_horses_value: string;
    m_burns: string; unit_times: string;
    m_items: string; unit_items: string;
    m_direct: string;
    m_subtree: string;
    m_note: string;
    m_note_loading: string;
    close: string;
    // 確定ダイアログ
    confirm_title: string;
    confirm_body_a: string; // 「 を 」
    confirm_target_self: string;
    confirm_target_tpl: string; // 「{name} の直下(TIER {t})」
    confirm_body_b: string; // 「 に配置します。」
    warn_a: string; warn_bold: string; warn_b: string;
    confirm_check: string;
    reselect: string;
    placing: string;
    confirm_btn: string;
    err_place: string;
    // /support/map デモ注記
    demo_note: string;
  };
  /** 透明性台帳(LedgerView + /ledger page)。
   *  注: CSV のヘッダー・値(date/RACE/MINT/BURNED 等)は多言語化しない — 分析用の
   *  安定コードとして英語のまま維持する(誰でも同じ列で率を再計算できるため)。 */
  ledger: {
    title: string;
    intro: string;
    loading: string;
    empty_no_races: string;
    dow: readonly [string, string, string, string, string, string, string];
    month_tpl: string; // 「{y}年{m}月」
    date_full_tpl: string; // 「{y}年{m}月{d}日」
    prev_month_aria: string;
    next_month_aria: string;
    weather: Record<string, string>;
    track: Record<string, string>;
    surface: Record<string, string>;
    t_participants: string;
    t_survived: string;
    t_burn: string;
    t_day7: string;
    t_matched: string;
    t_matched_vol: string;
    t_mints: string;
    t_burn_rate: string;
    csv_daily: string;
    csv_generating: string;
    csv_monthly: string;
    verify_link: string;
    trades_label: string;
    trades_loading: string;
    trades_empty: string;
    mint_label_day0: string; // 「新規発行(DAY0)」
    p2p_day_tpl: string; // 「(DAY{day})」
    badge_mint: string;
    more_tpl: string; // 「ほか {n} 件 — 全件は「この日のCSV」に含まれます。」
  };
  /** 使い方ガイド(GuideView)。**太字** と \n(改行)マーカーを rich() で描画する。 */
  guide: {
    h1: string; lead: string; hero_title: string; hero_p: string; toc_aria: string; back_top: string;
    // セクション見出し(TOC + SecHead 共用)
    sec_register: string; sec_buy: string; sec_sell: string; sec_race: string; sec_champion: string;
    sec_team: string; sec_items: string; sec_wallet: string; sec_contact: string;
    // ① 登録
    reg_p: string; reg_box_t: string; reg_box_d: string; reg_tip: string;
    // ② 購入
    buy_p1: string;
    buy_b1_t: string; buy_b1_d: string; buy_b2_t: string; buy_b2_d: string;
    buy_b3_t: string; buy_b3_d: string; buy_b4_t: string; buy_b4_d: string;
    buy_p2: string; buy_warn: string;
    // ③ 売却
    sell_p: string;
    sell_b1_t: string; sell_b1_d: string; sell_b2_t: string; sell_b2_d: string; sell_b3_t: string; sell_b3_d: string;
    sell_tip: string;
    // ④ レース
    race_p1: string;
    tl1_t: string; tl1_v: string; tl2_t: string; tl2_v: string; tl3_t: string; tl3_v: string; tl4_t: string; tl4_v: string;
    race_p2: string; race_p3: string; race_p4: string; race_tip: string;
    // ⑤ チャンピオン
    champ_p1: string; ladder_survive: string; ladder_day7_v: string; champ_p2: string; champ_tip: string;
    // ⑥ TEAM
    team_p1: string; tree_svg_aria: string;
    tree_you: string; tree_fa: string; tree_fb: string; tree_fc: string; tree_fa_sub: string; tree_fb_sub: string;
    team_p2: string;
    team_b1_t: string; team_b1_d: string; team_b2_t: string; team_b2_d: string; team_b3_t: string; team_b3_d: string;
    team_warn: string;
    // ⑦ アイテム
    items_p1: string;
    items_b1_t: string; items_b1_d: string; items_b2_t: string; items_b2_d: string; items_b3_t: string; items_b3_d: string;
    items_p2: string; items_tip: string;
    // ⑧ 入出金
    wallet_p: string;
    w_b1_t: string; w_b1_d: string; w_b2_t: string; w_b2_d: string; w_b3_t: string; w_b3_d: string;
    w_b4_t: string; w_b4_d: string; w_b5_t: string; w_b5_d: string; w_b6_t: string; w_b6_d: string;
    wallet_warn: string;
    // ⑨ お問い合わせ
    contact_p: string;
    c_b1_t: string; c_b1_d: string; c_b2_t: string;
    c_box_t: string; c_box_d: string; contact_link: string;
  };
}

const ja: AppDict = {
  common: { horses_unit: '頭', cases_unit: '件' },
  nav: { notifications: '通知', account: 'アカウント', guide: '使い方', contact: 'お問い合わせ', logout: 'ログアウト' },
  dash: {
    result_label: '昨夜の結果',
    result_detail: 'レース詳細 →',
    res_survived: '生存',
    res_burned: 'Burn(消滅)',
    res_best_tpl: '最高順位 / 全{n}頭',
    pill_burn: 'Burn',
    pill_survived_tpl: '生存 · Day {d}',
    result_empty: 'まだレース結果はありません。今夜20:00、最初のレースであなたの馬が誕生します。',
    tonight_label: '今夜のレース',
    countdown_to: '発走まで',
    tonight_note: '成績下位の馬はBurn=消滅。生き残った馬は日ごとに価値が上がります。全記録は台帳で公開。',
    watch_show: '今夜のショーを見る →',
    tasks_label: '今日やること',
    untrained_suffix: ' が未調教',
    pending_suffix: ' が割当待ち',
    tasks_prepare_items: 'アイテムを備える →',
    tasks_train: '調教する',
    tasks_adopt: '馬を迎える',
    tasks_sub: '調教は1日1回・今夜のスナップショット確定まで。割当待ちは今夜のレースで馬が確定します。',
    tasks_done_text: '本日のタスクは完了。あとは20:00の発走を待つだけ。',
    balance_k: '残高 BALANCE',
    balance_avail: 'USDT 利用可能',
    balance_locked_tpl: ' · ロック中 {v}',
    stable_val_k: '厩舎の評価額',
    stable_val_s_tpl: 'USDT · {n}頭の現在価値',
    buff_none: 'なし',
    buff_active_s: '次回割当に自動で加点',
    buff_none_s: 'Burnで獲得する次走ボーナス',
    stable_mine: 'マイ厩舎',
    stable_sub_tpl: 'STABLE {n} · 評価額 {v} USDT',
    stable_adopt: '馬を迎える ▶',
    stable_all: 'すべて →',
    stable_empty_pending_tpl: '割当待ち {n} 件 — 今夜のレースで確定します。',
    stable_empty_none: '出走中の馬はいません。上の「馬を迎える ▶」から今夜のダービーに参加しましょう。',
    train_yes: '調教済',
    train_no: '未調教',
    bb_title: 'チャンピオン報酬 受取中',
    bb_title_count_tpl: ' · {n}頭',
    bb_per: '200 USDT を7回に分けて受取',
    bb_count_tpl: '{p} / 7 回',
    bb_note: '毎晩20:00の精算で1回ずつ支払い',
  },
  promo: {
    done_pre: '🎁 ',
    done_post: ' があなたの厩舎に届きました — 今夜20:00から出走します。',
    view_horse: '馬を見る →',
    toggle: '引換コードをお持ちですか? →',
    label: '引換コード',
    submit: '馬を受け取る',
    submitting: '確認中…',
    close: '閉じる',
    err_default: '引換に失敗しました。コードをご確認ください。',
  },
  trade: {
    save_err: '設定の保存に失敗しました。',
    modal_title: '馬の売り方を選んでください',
    modal_lead: 'あなたの馬をどうやってマーケットに出すかを選びます(あとからいつでも変更できます)。',
    smart_head: 'スマート出品',
    smart_badge: 'おすすめ',
    smart_li1: '経済エンジンが良いタイミングで自動出品(1晩最大1頭・当日価格)',
    smart_li2: '出品中もレースに出走します',
    smart_li3: '自動購入予約(売れたら翌晩の予約を自動作成)が使えます',
    smart_li4: '毎日の操作は不要',
    smart_cta: 'スマート出品ではじめる',
    manual_head: '手動出品',
    manual_li1: '出品する馬とタイミングを自分で選ぶ',
    manual_li2: '出品中はレースに出走しません(Day・価値は凍結)',
    manual_li3: '出品操作は馬ごとに1日1回・取り下げは翌バッチ反映',
    manual_li4: '自動購入予約は使えません',
    manual_cta: '手動出品でやる',
    modal_note: 'どちらを選んでも、購入予約・台帳の公開ルールは同じです。',
    tile_label: 'AUTO · 売買の自動化',
    tile_note: 'いつでも変更できます',
    smart_name: 'スマート出品',
    smart_on_desc: '経済エンジンが自動で出品します(出品中もレースに出走)',
    smart_off_desc: 'OFF: 出品はマーケットの「馬を出品する」から手動で行います',
    reserve_name: '自動購入予約',
    reserve_on_desc: '毎晩のバッチ後、残高の範囲で購入予約を自動作成(メールで毎回お知らせ)',
    reserve_off_desc: 'スマート出品ONで使えます',
    max_label: '上限',
    max_unit: ' 頭',
  },
  pwa: {
    label: 'APP & 通知',
    done_text: '通知はONです。毎晩20:00、発走をお知らせします。',
    enable_text: '通知をONにすると、毎晩20:00の発走をお知らせします。',
    enable_btn: '通知をONにする',
    enable_busy: '設定中…',
    register_text: '許可は済んでいますが、この端末の登録がまだ完了していません。',
    register_btn: '登録を完了する',
    register_busy: '登録中…',
    blocked_text: '通知は現在ブロック中です。ブラウザの設定で許可すると再開できます。',
    ios_install_text: 'ホーム画面に追加すると発走通知が届きます。',
    install_text: 'ホーム画面に追加すると、アプリとして使えます。',
    ios_step1_a: '共有ボタン',
    ios_step1_b: 'をタップ',
    ios_step2: '「ホーム画面に追加」',
    ios_step3: 'アプリを開いて通知ON',
    install_steps: 'ブラウザのメニューから「ホーム画面に追加」/「アプリをインストール」を選ぶと、アプリとして起動できます。',
    install_hint: 'ホーム画面に追加するとワンタップで開けます。',
    add_app: '+ アプリを追加',
  },
  account: {
    title: 'アカウント',
    st_racing: '出走中',
    st_listed: '出品中',
    st_champions: 'チャンピオン',
    st_burned: '消滅',
    st_pending: '割当待ち予約',
    email_unset: '(メール未設定 — ウォレットログイン)',
    reg_label: '登録 ',
    play_tpl: 'プレイ {n}日目',
    id_label: 'ID ',
    record_label: 'あなたの記録',
    stat_note_a: '数字をタップすると各ページへ移動します。報酬の受け取り状況は ',
    stat_note_b: '、入出金の履歴は ',
    stat_note_c: ' で確認できます。',
    settings_label: '設定',
    linking_label: 'ログイン方法の連携',
    linking_lead: '連携すると、どのログイン方法でも同じアカウント(残高・馬)にアクセスできます。1つのウォレットは1つのアカウントにのみ紐づけできます。',
    support_label: 'サポート',
    support_lead: 'ゲームのルール・アカウント・入出金など、お困りのことがあればお気軽にご連絡ください。ご登録のメールアドレスへ返信します。',
    support_guide: '使い方を見る →',
    support_contact: 'お問い合わせフォームへ →',
  },
  stableName: {
    unset: '厩舎名 未設定 — 設定すると成約や組織マップにこの名前が出ます',
    set_btn: '厩舎名を設定',
    change_btn: '変更',
    placeholder: '例: 流星ステーブル',
    saving: '保存中…',
    save: '保存',
    cancel: 'やめる',
    hint: '2〜20文字(日本語/英数字)・全ユーザーに公開・変更は1日1回',
    err: '厩舎名を保存できませんでした。',
  },
  linking: {
    login_id: 'ログインID(Supabase)',
    loading: '読み込み中…',
    unlink: '解除',
    last_id: '(最後のログインIDは解除できません)',
    link_google: 'Google を紐づけ',
    wallet_h: 'ウォレット',
    no_wallet: '紐づけ済みのウォレットはありません。',
    link_metamask: '🦊 MetaMask を紐づけ',
    err_no_metamask: 'MetaMaskが見つかりません。拡張機能をインストールしてください。',
    err_no_address: 'ウォレットアドレスを取得できませんでした',
    err_link_wallet: 'ウォレットの紐づけに失敗しました',
    linked_tpl: 'ウォレット {addr} を紐づけました',
    err_unlink: '解除に失敗しました',
  },
  contact: {
    title: 'お問い合わせ',
    lead: 'ゲームのルール・アカウント・入出金など、なんでもお気軽にどうぞ。サポートチームが確認し、ご登録のメールアドレスへ返信します。',
    faq_label: 'よくある質問',
    faq_burn: 'BURNとは?',
    faq_buy: '購入・売却のしくみ',
    faq_deposit: '入金が反映されない',
    faq_champion: 'チャンピオン報酬はいつ?',
    faq_team: 'チーム(サポートボーナス)',
    cat_rules: 'ゲームのルール',
    cat_money: '入出金',
    cat_trade: '購入・売却',
    cat_team: 'チーム',
    cat_other: 'その他',
    cat_label: 'カテゴリ(任意)',
    subject_label: '件名',
    subject_ph: '例: BURNについて教えてください',
    body_label: 'お問い合わせ内容',
    body_ph: 'できるだけ具体的にお書きいただくと、正確なご案内ができます',
    sending: '送信中…',
    send: '送信する',
    err_send: '送信に失敗しました。時間をおいてお試しください。',
    done_title: '送信しました',
    done_a: 'お問い合わせありがとうございます。サポートチームが確認のうえ、',
    done_bold: 'ご登録のメールアドレス',
    done_b: 'へ返信いたします。',
    done_guide: '使い方を見る →',
    done_dashboard: 'ダッシュボードへ →',
    aside_reply_title: '返信について',
    li1_bold: 'ご登録のメールアドレス',
    li1_rest: '宛に返信します(このページでの返信表示はありません)',
    aside_li2: '内容により確認へお時間をいただく場合があります',
    aside_li3: '残高・取引の具体的な数字は、サイト内の各ページでご確認いただけます',
    aside_mail_title: 'メールでも受け付けています',
  },
  notif: {
    title: '通知',
    unread_tpl: '未読 {n}',
    read_note: '開くと既読になります · タップで関連ページへ',
    types: {
      RACE_RESULT_READY: 'レース結果', HORSE_BURNED: 'Burn', REVENGE_BUFF_GENERATED: 'Revenge Buff',
      BUYBACK_PAYMENT_PAID: 'チャンピオン報酬', BUYBACK_COMPLETED: 'チャンピオン報酬', MEMORIAL_NFT_MINTED: '記念NFT',
      SUPPORT_BONUS_PAID: 'サポートボーナス', SUPPORT_CELEBRATION_PAID: 'お祝い金', ASSIGNMENT_COMPLETED: '馬の割当',
      HORSE_SOLD: '売却成立', AUTO_LISTED: '自動出品', AUTO_RESERVED: '自動購入予約',
      MARKETPLACE_LOCKED: '精算中', MARKETPLACE_REOPENED: '再開', DEPOSIT_CONFIRMED: '入金',
      WITHDRAWAL_COMPLETED: '出金', WITHDRAWAL_FAILED: '出金エラー', TRAINING_COMPLETED: '調教',
      ITEM_DROPPED: 'アイテム', ITEM_GIFT_RECEIVED: 'ギフト',
    },
    type_default: 'お知らせ',
    cats: { race: 'レース', trade: '売買', reward: '報酬', money: '入出金', other: 'その他' },
    cat_all: 'すべて',
    digest_title_tpl: '{d} のダイジェスト',
    count_tpl: '{n}件',
    digest_results: '結果を見る →',
    digest_history: '取引履歴 →',
    search_ph: '通知を検索…',
    unread_only: '未読のみ',
    count_all_tpl: '全{n}件',
    count_some_tpl: '{total}件中 {shown}件',
    empty_a: '通知はまだありません。',
    empty_b: 'レース結果・Burn・チャンピオン報酬・売買などがここに届きます。',
    empty_filtered: '条件に一致する通知がありません。',
    prev: '← 前へ',
    next: '次へ →',
    min_tpl: '{n}分前',
    hour_tpl: '{n}時間前',
    day_tpl: '{n}日前',
  },
  champion: {
    hero_note: 'アクティブユーザー 10,000人 到達で開幕',
    sound_on_aria: 'サウンドをオフ',
    sound_off_aria: 'サウンドをオン',
    rewards_sub: 'あなたのチャンピオン報酬',
    rewards_note_a: 'Day7を走破した馬はチャンピオンとして ',
    rewards_note_b: ' のチャンピオン報酬を受け取り、記念NFTになります。報酬は7回の分割で、毎晩の精算時に自動で支払われます。',
    hall_sub: 'Day7を走破した全ての馬',
    hall_count_tpl: '総戴冠 {n}頭',
    hall_sample: 'サンプル表示(仮データ)— 最初のチャンピオンが誕生すると、ここに実際の馬が刻まれます。',
    filter_all: 'すべて',
    sort_recent: '新しい順',
    sort_oldest: '古い順',
    sort_name: '名前順',
    sort_aria: '並び替え',
    crowned: '戴冠',
    owner_label: 'オーナー',
    league_desc: 'Day7を走破したチャンピオン馬だけが出走できる、週次の頂上リーグ。アクティブユーザーが10,000人に到達すると開幕します。デイリーダービーとは独立した経済で運営されます。',
    ladder_title: '7 CLASSES · 昇級ラダー',
    class_win_tpl: '{n}勝',
    weekly_races_v: '週1回開催・1レース最大18頭。登録されたチャンピオン馬の数に応じてレースが自動編成されます。',
    prize_pool_v: '毎週のアイテムショップ売上の1%が賞金プールへ。勝者総取りではなく、複数の出走馬に分配されます。',
    retirement_v: 'G1制覇、またはリーグ10走で名誉引退。引退馬は殿堂に永久に刻まれます。',
    fanpass_v: 'マルチカメラアングルとプレミアム観戦を解放。ファン参加・ランキングなどの機能も計画中です。',
    bv_title: 'チャンピオン報酬',
    bv_intro_a: 'Day7を走破した馬はチャンピオンとして ',
    bv_intro_bold1: '200 USDT',
    bv_intro_b: ' のチャンピオン報酬を受け取ります。翌日（D+1）から ',
    bv_intro_bold2: '7回',
    bv_intro_c: 'に分けて自動で支払われます。7回完了で ',
    bv_intro_bold3: '記念NFT',
    bv_intro_d: '（Polygon / ERC-721）がミントされます。',
    card_day7_tpl: 'Day7達成 {d}',
    status_done: '完了',
    status_progress: '進行中',
    card_horse_tpl: '馬 {id}',
    count7_tpl: '{p} / 7 回',
    detail_arrow: '詳細 →',
    empty_a: 'チャンピオン報酬はまだありません。',
    empty_b: '馬がDay7を走り切るとチャンピオンとなり、報酬(200 USDT)がここに表示されます。',
    crumb: '← チャンピオン報酬一覧',
    detail_title_tpl: 'チャンピオン報酬 {d}',
    horse_link_tpl: '馬 {id} →',
    progress_k: '受取進捗 · PROGRESS',
    of7: ' / 7 回',
    total_received_k: '総額 · 受取済',
    schedule_label: '支払いスケジュール · 7 PAYMENTS',
    due_tpl: '予定 {d}',
    paid_tpl: ' · 支払 {t}',
    status_paid: 'PAID · 支払済',
    status_next: '次回',
    status_pending: '予定',
    detail_note: '毎晩20:00の精算で1回ずつ支払われます。7回すべて完了すると、この馬の記念NFT（Polygon / ERC-721）がミントされます。',
  },
  support: {
    self: 'あなた',
    unit_people: '名',
    unit_horses: '頭',
    map_cta: '組織マップを開く →',
    lead: 'あなたの組織からチャンピオン(7日間走破)が誕生したとき、支えたネットワークにお祝い金が支払われます。紹介しただけでは発生しません。',
    rate_k: 'STARTER RATE · あなたの紹介単価',
    rate_who: '直接招待した仲間のチャンピオン1頭ごとに、あなたへ',
    gauge_starter: 'スターター',
    gauge_leader: 'リーダー',
    gauge_sub_a: '組織が育つほど単価は 8.00 → 3.00 へ滑らかに移行します(組織 50,000 USDT で 3.00)。単価×組織規模は一定になる設計 — ',
    gauge_sub_bold: '組織が育っても、直接分の合計は下がりません。',
    boost_tpl: 'スターターブースト ×{x}',
    standard: 'スタンダード',
    rate_note: '単価はチャンピオン誕生の夜のものが適用され、毎日 20:00 (GMT+8) に再評価されます。',
    tier_hero_k: 'SUPPORT TIER · 現在のティア',
    next_maintain_tpl: 'T{n}まで 組織 {v} USDT 以上を維持',
    next_direct_tpl: '(+直接 {d} 以上)',
    tier_max: '最上位ティアに到達しています',
    vol_a: '組織(配下7段)の稼働馬 現在価値: ',
    vol_b: ' · 直接招待分: ',
    vol_c: ' · 毎日20:00 (GMT+8) に再評価(下回ると自動で下がります)',
    action_k: '次のアクション · NEXT',
    action_pool_tpl: '配置待ちの仲間が {n}名 います。配置するとネットワークに加わり、ティア維持につながります。',
    action_grow_tpl: '次のティア解放は組織 {v} USDT から。仲間を招待して、ネットワーク全体を育てましょう。',
    action_max: 'すべてのティアが解放されています。ネットワークの維持を続けましょう。',
    action_btn_place: 'マップで配置する',
    action_btn_view: '組織マップを見る',
    kpi_total: '累計サポートボーナス',
    kpi_total_sub_tpl: '{n}回の受け取り',
    kpi_network: 'ネットワーク',
    kpi_network_sub: 'あなたが支える仲間',
    kpi_pool: '配置待ち',
    kpi_pool_place: 'マップで配置する →',
    kpi_pool_none: '配置待ちなし',
    tier_table_h: 'ティアと支払額',
    tier_meta: 'チャンピオン1頭の誕生で、お祝い金(T1=あなたの紹介単価 3〜8 / T2=2 / T3〜7=各1 USDT)が上位7ティアに配られます。',
    tier_cond_always: '常時',
    tier_cond_org_tpl: '組織 ≥ {v}',
    tier_cond_direct_tpl: ' +直接 ≥ {d}',
    t1_range: ' (3〜8)',
    tier_foot: '組織ボリューム = あなたの組織マップ配下7段(サポートボーナスが届く範囲)の稼働馬価値の合計。T5以上は「直接招待した仲間の稼働馬価値」も併せて必要です。横並び(直下の系列数)は無制限。',
    invite_title: '招待リンク · INVITE',
    invite_code_label: 'あなたのコード ',
    invite_copied: '✓ コピーしました',
    invite_copy: 'リンクをコピー',
    invite_note: '招待しただけではボーナスは発生しません。サポートボーナスは、あなたのネットワーク内でチャンピオン(7日間走破)が誕生したときにだけ、所定の額(T1=紹介単価3〜8 / T2=2 / T3〜7=各1 USDT)の範囲でお祝い金として支払われます。金額・頻度の保証はありません。',
    hist_h: 'サポートボーナス履歴',
    hist_empty: 'まだサポートボーナスはありません。',
    hist_why: '組織のチャンピオン誕生',
    toolbar_stats_tpl: 'メンバー {members}名 · 配置待ち {pool}名 · 最深 T{depth}',
    mode_map: 'マップ',
    mode_list: 'リスト',
    expand_all: 'すべて展開',
    collapse_all: 'すべて折りたたむ',
    map_search_ph: 'メンバーを探す(表示名の一部 or メールアドレス完全一致)',
    map_search_aria: '組織内メンバー検索',
    map_search_btn: '検索',
    map_search_notfound: 'あなたの組織(配下7段)には見つかりませんでした',
    place_select_a: ' の配置先を選択中 — ',
    place_hint_map: 'マップ上のノード(あなた or 配下メンバー)をクリック',
    place_hint_list: 'リストのメンバーをタップ',
    place_select_b: 'してください',
    cancel: 'キャンセル',
    you_crumb: '★ あなた',
    focus_tier_tpl: 'TIER {t} · ',
    focus_meta_tpl: '直下 {direct}名 · 配下 {sub}名',
    detail_btn: '詳細',
    place_here: 'ここに配置',
    drill_empty: 'この下にはまだ誰もいません。',
    child_horse_tpl: '馬{h}頭 · ',
    child_meta_tpl: '直下{kids}名 · 配下{sub}名',
    drill_open_aria: 'この系列を開く',
    empty_tree: 'まだ誰も配置されていません。仲間を招待して、最初の1人を配置しましょう。',
    node_collapsed_tpl: '+{n}名 折りたたみ中',
    node_series_tpl: '直下 {n}系列',
    node_direct_tpl: '直下 {n}名',
    toggle_expand_aria: '展開',
    toggle_collapse_aria: '折りたたむ',
    node_place_hint_tpl: 'ここに配置 · T{n}',
    dock_title: '配置待ちの仲間',
    dock_hint: '配置は確定すると変更不可',
    dock_empty: '配置待ちの仲間はいません。ダッシュボードから招待リンクを共有しましょう。',
    pool_joined_tpl: '参加 {d}',
    pool_place_btn: '配置',
    m_sub_tpl: 'TIER {t}(あなたから{t}段目)',
    m_placed_tpl: ' · 配置 {d}',
    m_active_horses: '稼働馬',
    m_horses_value: '稼働馬の現在価値',
    m_burns: 'BURN回数(累計)', unit_times: '回',
    m_items: 'アイテム使用(累計)', unit_items: '個',
    m_direct: '直下',
    m_subtree: '配下(7段内)',
    m_note: '稼働馬の現在価値は、あなたの組織ボリューム(ティア解放)への貢献分です。',
    m_note_loading: ' 取得中…',
    close: '閉じる',
    confirm_title: '配置を確定する',
    confirm_body_a: ' を ',
    confirm_target_self: 'あなたの直下(TIER 1)',
    confirm_target_tpl: '{name} の直下(TIER {t})',
    confirm_body_b: ' に配置します。',
    warn_a: '⚠ 配置は一度確定すると',
    warn_bold: '二度と変更できません',
    warn_b: '。配置換えの依頼は受け付けられません(システム上の例外処理は運営管理者のみ)。',
    confirm_check: '変更できないことを理解しました',
    reselect: '配置先を選び直す',
    placing: '配置中…',
    confirm_btn: 'この位置で確定する',
    err_place: '配置に失敗しました。',
    demo_note: 'サンプル組織を表示中(仮データ・約60名)— 招待した仲間が増えると、ここは自動的にあなたの実際の組織に切り替わります。',
  },
  ledger: {
    title: '台帳 · LEDGER',
    intro: '毎晩のレースと売買の全記録を、そのまま公開しています。ユーザーは匿名ID表示です。各日の「全馬の結果と検証」から、公開シードによる再計算(コミット・リビール)で結果が操作不能であることを誰でも確認できます。',
    loading: '台帳を読み込み中…',
    empty_no_races: '確定したレースはまだありません。最初のレース確定後、ここに全記録が公開されます。',
    dow: ['日', '月', '火', '水', '木', '金', '土'],
    month_tpl: '{y}年{m}月',
    date_full_tpl: '{y}年{m}月{d}日',
    prev_month_aria: '前の月',
    next_month_aria: '次の月',
    weather: { SUNNY: '晴れ', CLOUDY: '曇り', RAIN: '雨', STORM: '嵐' },
    track: { FAST: '高速', GOOD: '良', SOFT: '稍重', HEAVY: '不良' },
    surface: { TURF: '芝', DIRT: 'ダート' },
    t_participants: '出走',
    t_survived: '生存',
    t_burn: 'BURN',
    t_day7: 'DAY7 走破',
    t_matched: '成約',
    t_matched_vol: '成約総額 USDT',
    t_mints: '新規発行',
    t_burn_rate: '採用BURN率(シード由来)',
    csv_daily: 'この日のCSV',
    csv_generating: '生成中…',
    csv_monthly: '月次CSV',
    verify_link: '全馬の結果と検証 →',
    trades_label: '成約の記録(匿名) · SETTLED TRADES',
    trades_loading: '読み込み中…',
    trades_empty: 'この日の成約はありません。',
    mint_label_day0: '新規発行(DAY0)',
    p2p_day_tpl: '(DAY{day})',
    badge_mint: '新規発行',
    more_tpl: 'ほか {n} 件 — 全件は「この日のCSV」に含まれます。',
  },
  guide: {
    h1: '使い方ガイド',
    lead: 'Seven Days Derby は、NFTの競走馬とともに**7日間のサバイバルレース**を戦うゲームです。このページでは、登録からチャンピオン獲得までの流れを初心者向けに図解します。',
    hero_title: '7日間を走り切れ',
    hero_p: '毎晩20:00(マレーシア時間)、全ての馬が一斉に走ります。生き残った馬は日ごとに価値を上げ、7日目を走破すれば200 USDTのチャンピオン報酬と記念NFTに。',
    toc_aria: '目次',
    back_top: '↑ ページ上部へ戻る',
    sec_register: 'アカウント登録',
    sec_buy: '馬の購入',
    sec_sell: '馬の売却(マーケット)',
    sec_race: '毎晩のレース',
    sec_champion: 'Day7達成 — チャンピオン',
    sec_team: 'TEAMボーナスと組織の作り方',
    sec_items: 'アイテム',
    sec_wallet: '入金・出金',
    sec_contact: 'お問い合わせ',
    reg_p: 'ログインは**Googleアカウント**で行います。登録もログインも同じボタン、パスワードは不要です。初回ログインであなたの厩舎が自動で開設されます。',
    reg_box_t: 'Google でログイン',
    reg_box_d: '残高・馬・履歴はすべてこの1つのオーナーアカウントに紐づきます',
    reg_tip: '友人の紹介リンクから登録すると、その友人のTEAM(応援組織)に加わります(⑥参照)。',
    buy_p1: '馬はマーケットプレイスで「購入予約」をして迎えます。あなたの馬は毎晩20:00(マレーシア時間)のバッチで決定され、DNAから**見た目・名前・能力が一意に生成**されます(あとから変更不可・完全に決定論)。',
    buy_b1_t: '購入予約', buy_b1_d: '1頭につき最大 177.16 USDT をロック\n(価格テーブル上限)',
    buy_b2_t: '20:00 バッチ', buy_b2_d: 'あなたの馬が決定',
    buy_b3_t: 'Day0 ミント', buy_b3_d: '請求 102 USDT\n(価格100+手数料2)',
    buy_b4_t: '差額は自動返金', buy_b4_d: 'ロック額との差額が残高に戻ります',
    buy_p2: 'マーケットで**他のオーナーの馬(Day1〜Day6)**を買うこともできます。日数が進んだ馬ほど価格テーブルが上がります:',
    buy_warn: '**重要なリスク:** 馬は毎晩のレースで**BURN(NFT消滅)する可能性**があります。消滅した馬と支払った代金は戻りません。必ず余裕資金の範囲でお楽しみください。',
    sell_p: 'Day1〜Day6の馬は、あなたの判断で**マーケットに出品**できます。「チャンピオンまで走らせるか、途中で売って利益を確定するか」— この駆け引きがSeven Days Derbyの醍醐味です。',
    sell_b1_t: '出品', sell_b1_d: '馬詳細ページから\nDay1〜6のみ',
    sell_b2_t: '購入者が決定', sell_b2_d: '今夜のバッチで成立',
    sell_b3_t: '売却代金を受取', sell_b3_d: '馬は新オーナーの元で残りの日程を走ります',
    sell_tip: '出品・購入には毎晩の締切があります(レース処理中はマーケットが一時ロックされます)。',
    race_p1: '毎晩**20:00(マレーシア時間)**、その日の全ての馬が一斉に走ります。レース結果で馬は**「生存」か「BURN」**に分かれ、生存した馬はDayが1つ進みます。',
    tl1_t: '日中', tl1_v: 'アイテム適用・売買・作戦タイム',
    tl2_t: 'レース前', tl2_v: '締切(マーケット・アイテムがロック)',
    tl3_t: '20:00 MYT', tl3_v: '一斉レース(Daily Derbyで観戦)',
    tl4_t: '直後', tl4_v: '結果確定: 生存→次のDayへ / BURN',
    race_p2: '**レースは誰にも操作できません。**結果は事前にコミット(封印)された乱数シードから決定論的に計算され、レース後にシードが公開されます。誰でも結果を再計算して検証できる「コミット・リビール方式」です。運営もあなたも、結果を変えることはできません。',
    race_p3: '**毎晩、成績下位の馬はBURN(消滅)します。**何頭が走り、何頭が生き残り、何頭がBURNされたかの全記録は**「台帳」ページ**で毎日公開しており、CSVでダウンロードして誰でも検証・集計できます。',
    race_p4: 'レース演出の最後には**「明日の予報」**(天候・馬場・コース)が発表されます。予報は事前にコミットされたシードから機械的に生成される**的中率約70%の参考情報**で、結果を保証するものではありません。予報に合わせてアイテムを備えるかはあなた次第です。',
    race_tip: 'RACEページの「Daily Derby」で、毎晩のレースをライブ風の演出で観戦できます。自分の馬の走りには専用のハイライトが入ります。',
    champ_p1: '7晩のレースをすべて生き延びた馬は**チャンピオン**です。**200 USDTのチャンピオン報酬**(翌日から7回に分けて自動支払い)と、殿堂入りの**記念NFT**(Polygon / ERC-721)を獲得します。',
    ladder_survive: '生存', ladder_day7_v: '200 USDT + 記念NFT',
    champ_p2: 'チャンピオンの実績と報酬スケジュールは**CHAMPIONページ**に集約されています。あなたのチャンピオン報酬の支払い状況も、殿堂(Hall of Champions)もここで確認できます。',
    champ_tip: 'アクティブユーザーが10,000人に到達すると、チャンピオン馬だけが出走できる週次の頂上リーグ「Champion League」が開幕します。',
    team_p1: 'あなた専用の**紹介リンク**(TEAMページで確認)から友人が登録すると、あなたの**応援組織(TEAM)**に加わります。友人がさらに友人を招くと、組織は下へ広がっていきます(最大7段まで)。',
    tree_svg_aria: '組織ツリー: あなた → 友人A/B/C → その友人たち',
    tree_you: 'あなた', tree_fa: '友人A', tree_fb: '友人B', tree_fc: '友人C', tree_fa_sub: 'Aの友人', tree_fb_sub: 'Bの友人',
    team_p2: '組織のメンバーの馬が**チャンピオン(7日間走破)**になると、支えた組織に**サポートボーナス**がお祝い金として配られます(1頭につき合計10 USDT・上位7段)。受け取れる段数(ティア)は、**組織全体の活動量**に応じて解放されていきます — つまり「自分が直接誘った人数」だけでなく、**組織を育てること**が鍵です。',
    team_b1_t: '紹介リンクを共有', team_b1_d: 'TEAMページで取得',
    team_b2_t: '組織が育つ', team_b2_d: '友人の友人まで広がる(7段)',
    team_b3_t: 'チャンピオン誕生', team_b3_d: '組織からお祝い金(ティア解放分まで)',
    team_warn: 'サポートボーナスは組織からのチャンピオン誕生に応じて変動します。**収益の約束・保証は一切ありません。**詳しい条件と現在のティア状況はTEAMページでご確認ください。',
    items_p1: 'ITEMSページのショップで**30種類のアイテム**を購入できます(ベーシック / スタンダード / プレミアムの3バンド)。さらに、馬がBURNされたときに一定確率でドロップする**限定アイテム5種**は、ショップでは買えません。',
    items_b1_t: 'アイテムを入手', items_b1_d: 'ショップ購入 / BURNドロップ / ギフト受取',
    items_b2_t: 'レース前に馬へ適用', items_b2_d: '馬の詳細ページから。今夜のスコアに影響(上限あり)',
    items_b3_t: 'レース条件(天候・馬場・コース)', items_b3_d: 'アイテムの適性と噛み合うと最大×1.5(シードから決定・検証可能)',
    items_p2: '各アイテムには**適性**(芝巧者・ダート巧者・雨の鬼・道悪の鬼など)があり、毎晩の**レース条件(天候・馬場・コース)**と噛み合うと効果が最大×1.5に伸び、逆の条件では×0.5まで鈍ります。条件はレースのシードから決まるため、**運営が操作することはできません**。レース後に誰でも検証できます。',
    items_tip: 'アイテムは他のオーナーへ**メールアドレス指定でギフト**できます(一部を除く)。仲間の勝負どころに角砂糖を贈る — そんな使い方も。',
    wallet_p: 'ゲーム内通貨は **USDT(Polygonネットワーク)**です。WALLETページですべて完結します。',
    w_b1_t: '入金', w_b1_d: 'あなた専用の入金アドレスへUSDT(Polygon)を送金',
    w_b2_t: 'チェーン確認', w_b2_d: '所定の承認数の後、残高に反映',
    w_b3_t: '残高反映', w_b3_d: '馬・アイテムの購入に使えます',
    w_b4_t: '出金申請', w_b4_d: 'WALLETページから宛先アドレスと金額を指定',
    w_b5_t: '審査', w_b5_d: '高額出金は複数名の承認が必要なため時間がかかる場合があります',
    w_b6_t: '送金', w_b6_d: 'あなたのウォレットへUSDTが届きます',
    wallet_warn: '**必ずPolygonネットワークのUSDT**を使用してください。他のネットワークやトークンで送ると資産を失う可能性があります。',
    contact_p: 'わからないことがあれば、いつでもサポートチームにご連絡ください。ご登録のメールアドレスへ返信します。',
    c_b1_t: 'お問い合わせフォーム', c_b1_d: 'ナビの「お問い合わせ」から(おすすめ)',
    c_b2_t: 'メール',
    c_box_t: 'AI+サポートチームが確認して返信', c_box_d: 'グローバル対応 — お問い合わせの言語で返信します(日本語/英語ほか)',
    contact_link: '→ お問い合わせフォームを開く',
  },
};

const en: AppDict = {
  common: { horses_unit: ' horses', cases_unit: '' },
  nav: { notifications: 'Notifications', account: 'Account', guide: 'Guide', contact: 'Contact', logout: 'Log out' },
  dash: {
    result_label: 'Last night’s result',
    result_detail: 'Race details →',
    res_survived: 'Survived',
    res_burned: 'Burned',
    res_best_tpl: 'Best rank / of {n}',
    pill_burn: 'Burn',
    pill_survived_tpl: 'Survived · Day {d}',
    result_empty: 'No race results yet. Tonight at 20:00, your horse is born in its first race.',
    tonight_label: 'Tonight’s race',
    countdown_to: 'To post',
    tonight_note: 'The lowest-placed horses are Burned. Survivors rise in value each day. Every record is published on the ledger.',
    watch_show: 'Watch tonight’s show →',
    tasks_label: 'Today’s tasks',
    untrained_suffix: ' untrained',
    pending_suffix: ' awaiting assignment',
    tasks_prepare_items: 'Stock up on items →',
    tasks_train: 'Train',
    tasks_adopt: 'Adopt a horse',
    tasks_sub: 'Train once a day, until tonight’s snapshot is fixed. Assignments are settled in tonight’s race.',
    tasks_done_text: 'Today’s tasks are done. Now just wait for the 20:00 post.',
    balance_k: 'BALANCE',
    balance_avail: 'USDT available',
    balance_locked_tpl: ' · locked {v}',
    stable_val_k: 'Stable value',
    stable_val_s_tpl: 'USDT · current value of {n} horses',
    buff_none: 'None',
    buff_active_s: 'Auto-added to your next assignment',
    buff_none_s: 'A next-race bonus earned from a Burn',
    stable_mine: 'My Stable',
    stable_sub_tpl: 'STABLE {n} · value {v} USDT',
    stable_adopt: 'Adopt a horse ▶',
    stable_all: 'All →',
    stable_empty_pending_tpl: '{n} awaiting assignment — settled in tonight’s race.',
    stable_empty_none: 'No horses racing. Join tonight’s derby from “Adopt a horse ▶” above.',
    train_yes: 'Trained',
    train_no: 'Untrained',
    bb_title: 'Champion Reward in progress',
    bb_title_count_tpl: ' · {n} horses',
    bb_per: 'Receiving 200 USDT in 7 payments',
    bb_count_tpl: '{p} / 7',
    bb_note: 'One payment each night at the 20:00 settlement',
  },
  promo: {
    done_pre: '🎁 ',
    done_post: ' has arrived in your stable — racing from 20:00 tonight.',
    view_horse: 'View horse →',
    toggle: 'Have a redeem code? →',
    label: 'Redeem code',
    submit: 'Receive horse',
    submitting: 'Checking…',
    close: 'Close',
    err_default: 'Redemption failed. Please check the code.',
  },
  trade: {
    save_err: 'Failed to save settings.',
    modal_title: 'Choose how to sell your horses',
    modal_lead: 'Choose how your horses go to market (you can change this anytime).',
    smart_head: 'Smart listing',
    smart_badge: 'Recommended',
    smart_li1: 'The economy engine lists at a good moment (up to 1 per night, at that day’s price)',
    smart_li2: 'Your horse keeps racing while listed',
    smart_li3: 'Auto purchase-reserve is available (auto-creates next night’s reservation when sold)',
    smart_li4: 'No daily action needed',
    smart_cta: 'Start with Smart listing',
    manual_head: 'Manual listing',
    manual_li1: 'You choose which horse to list, and when',
    manual_li2: 'A listed horse does not race (its Day and value are frozen)',
    manual_li3: 'One listing action per horse per day; delisting applies next batch',
    manual_li4: 'Auto purchase-reserve is not available',
    manual_cta: 'Use Manual listing',
    modal_note: 'Either way, the purchase-reserve and ledger rules are the same.',
    tile_label: 'AUTO · trade automation',
    tile_note: 'Change anytime',
    smart_name: 'Smart listing',
    smart_on_desc: 'The economy engine lists automatically (your horse keeps racing while listed)',
    smart_off_desc: 'OFF: list manually from “List a horse” in the market',
    reserve_name: 'Auto purchase-reserve',
    reserve_on_desc: 'After each nightly batch, auto-creates purchase reservations within your balance (emailed each time)',
    reserve_off_desc: 'Available with Smart listing ON',
    max_label: 'Limit',
    max_unit: ' horses',
  },
  pwa: {
    label: 'APP & Notifications',
    done_text: 'Notifications are on. Every night at 20:00 we’ll tell you the post.',
    enable_text: 'Turn on notifications and we’ll tell you about the 20:00 post each night.',
    enable_btn: 'Turn on notifications',
    enable_busy: 'Setting up…',
    register_text: 'Permission is granted, but this device isn’t registered yet.',
    register_btn: 'Complete registration',
    register_busy: 'Registering…',
    blocked_text: 'Notifications are currently blocked. Allow them in your browser settings to resume.',
    ios_install_text: 'Add to your home screen to get post notifications.',
    install_text: 'Add to your home screen to use it as an app.',
    ios_step1_a: 'Tap the share button',
    ios_step1_b: '',
    ios_step2: '“Add to Home Screen”',
    ios_step3: 'Open the app and turn on notifications',
    install_steps: 'From your browser menu, choose “Add to Home Screen” / “Install app” to launch it as an app.',
    install_hint: 'Add to your home screen to open it with one tap.',
    add_app: '+ Add app',
  },
  account: {
    title: 'Account',
    st_racing: 'Racing',
    st_listed: 'Listed',
    st_champions: 'Champions',
    st_burned: 'Burned',
    st_pending: 'Pending reservations',
    email_unset: '(No email — wallet login)',
    reg_label: 'Joined ',
    play_tpl: 'Day {n} of play',
    id_label: 'ID ',
    record_label: 'Your record',
    stat_note_a: 'Tap a number to jump to its page. Check reward payouts in ',
    stat_note_b: ', and deposit/withdrawal history in ',
    stat_note_c: '.',
    settings_label: 'Settings',
    linking_label: 'Link your login methods',
    linking_lead: 'Once linked, any login method reaches the same account (balance and horses). A wallet can be linked to only one account.',
    support_label: 'Support',
    support_lead: 'Questions about the rules, your account, or deposits/withdrawals — reach out anytime. We reply to your registered email.',
    support_guide: 'Read the guide →',
    support_contact: 'Go to the contact form →',
  },
  stableName: {
    unset: 'Stable name not set — set it and this name shows on trades and the org map',
    set_btn: 'Set stable name',
    change_btn: 'Change',
    placeholder: 'e.g. Meteor Stable',
    saving: 'Saving…',
    save: 'Save',
    cancel: 'Cancel',
    hint: '2–20 characters · public to all users · one change per day',
    err: 'Could not save the stable name.',
  },
  linking: {
    login_id: 'Login IDs (Supabase)',
    loading: 'Loading…',
    unlink: 'Unlink',
    last_id: '(the last login ID cannot be unlinked)',
    link_google: 'Link Google',
    wallet_h: 'Wallets',
    no_wallet: 'No linked wallets.',
    link_metamask: '🦊 Link MetaMask',
    err_no_metamask: 'MetaMask not found. Please install the extension.',
    err_no_address: 'Could not get the wallet address',
    err_link_wallet: 'Failed to link the wallet',
    linked_tpl: 'Linked wallet {addr}',
    err_unlink: 'Failed to unlink',
  },
  contact: {
    title: 'Contact',
    lead: 'Rules, your account, deposits/withdrawals — ask us anything. Our support team reviews it and replies to your registered email.',
    faq_label: 'FAQ',
    faq_burn: 'What is BURN?',
    faq_buy: 'How buying & selling works',
    faq_deposit: 'My deposit isn’t showing',
    faq_champion: 'When is the Champion Reward?',
    faq_team: 'Teams (Support Bonus)',
    cat_rules: 'Game rules',
    cat_money: 'Deposits/withdrawals',
    cat_trade: 'Buying/selling',
    cat_team: 'Team',
    cat_other: 'Other',
    cat_label: 'Category (optional)',
    subject_label: 'Subject',
    subject_ph: 'e.g. Please explain BURN',
    body_label: 'Your message',
    body_ph: 'The more specific you are, the more accurately we can help',
    sending: 'Sending…',
    send: 'Send',
    err_send: 'Failed to send. Please try again later.',
    done_title: 'Sent',
    done_a: 'Thanks for reaching out. Our support team will review it and reply to ',
    done_bold: 'your registered email',
    done_b: '.',
    done_guide: 'Read the guide →',
    done_dashboard: 'To the dashboard →',
    aside_reply_title: 'About replies',
    li1_bold: 'Your registered email',
    li1_rest: ' — we reply there (no reply is shown on this page)',
    aside_li2: 'Some inquiries may take time to review',
    aside_li3: 'Exact balance and transaction figures are on their own pages in the app',
    aside_mail_title: 'You can also reach us by email',
  },
  notif: {
    title: 'Notifications',
    unread_tpl: '{n} unread',
    read_note: 'Opening marks them read · tap to go to the related page',
    types: {
      RACE_RESULT_READY: 'Race result', HORSE_BURNED: 'Burn', REVENGE_BUFF_GENERATED: 'Revenge Buff',
      BUYBACK_PAYMENT_PAID: 'Champion Reward', BUYBACK_COMPLETED: 'Champion Reward', MEMORIAL_NFT_MINTED: 'Memorial NFT',
      SUPPORT_BONUS_PAID: 'Support Bonus', SUPPORT_CELEBRATION_PAID: 'Celebration', ASSIGNMENT_COMPLETED: 'Horse assigned',
      HORSE_SOLD: 'Sold', AUTO_LISTED: 'Auto-listed', AUTO_RESERVED: 'Auto reservation',
      MARKETPLACE_LOCKED: 'Settling', MARKETPLACE_REOPENED: 'Reopened', DEPOSIT_CONFIRMED: 'Deposit',
      WITHDRAWAL_COMPLETED: 'Withdrawal', WITHDRAWAL_FAILED: 'Withdrawal error', TRAINING_COMPLETED: 'Training',
      ITEM_DROPPED: 'Item', ITEM_GIFT_RECEIVED: 'Gift',
    },
    type_default: 'Notice',
    cats: { race: 'Race', trade: 'Trade', reward: 'Reward', money: 'Deposits', other: 'Other' },
    cat_all: 'All',
    digest_title_tpl: '{d} digest',
    count_tpl: '{n}',
    digest_results: 'View results →',
    digest_history: 'Transaction history →',
    search_ph: 'Search notifications…',
    unread_only: 'Unread only',
    count_all_tpl: 'All {n}',
    count_some_tpl: '{shown} of {total}',
    empty_a: 'No notifications yet.',
    empty_b: 'Race results, Burns, Champion Rewards, trades and more arrive here.',
    empty_filtered: 'No notifications match.',
    prev: '← Prev',
    next: 'Next →',
    min_tpl: '{n}m ago',
    hour_tpl: '{n}h ago',
    day_tpl: '{n}d ago',
  },
  champion: {
    hero_note: 'Opens when active users reach 10,000',
    sound_on_aria: 'Turn sound off',
    sound_off_aria: 'Turn sound on',
    rewards_sub: 'Your Champion Rewards',
    rewards_note_a: 'A horse that clears Day 7 becomes a Champion and receives a ',
    rewards_note_b: ' Champion Reward, then becomes a Memorial NFT. The reward is split into 7 payments, paid automatically at each nightly settlement.',
    hall_sub: 'Every horse that cleared Day 7',
    hall_count_tpl: '{n} crowned',
    hall_sample: 'Sample view (placeholder data) — once the first Champion is born, real horses are engraved here.',
    filter_all: 'All',
    sort_recent: 'Newest',
    sort_oldest: 'Oldest',
    sort_name: 'By name',
    sort_aria: 'Sort',
    crowned: 'Crowned',
    owner_label: 'Owner',
    league_desc: 'A weekly top-tier league only Champion horses (Day 7 clears) can enter. It opens when active users reach 10,000, and runs on an economy separate from the Daily Derby.',
    ladder_title: '7 CLASSES · promotion ladder',
    class_win_tpl: '{n} win',
    weekly_races_v: 'Held once a week · up to 18 horses per race. Races are auto-formed based on the number of registered Champion horses.',
    prize_pool_v: '1% of each week’s item-shop sales goes to the prize pool. Not winner-take-all — it’s split among several runners.',
    retirement_v: 'Honorable retirement on a G1 win or 10 league starts. Retired horses are engraved in the hall forever.',
    fanpass_v: 'Unlocks multi-camera angles and premium viewing. Fan participation and rankings are also planned.',
    bv_title: 'Champion Reward',
    bv_intro_a: 'A horse that clears Day 7 becomes a Champion and receives a ',
    bv_intro_bold1: '200 USDT',
    bv_intro_b: ' Champion Reward. From the next day (D+1) it is paid automatically in ',
    bv_intro_bold2: '7 payments',
    bv_intro_c: '. When all 7 are done, a ',
    bv_intro_bold3: 'Memorial NFT',
    bv_intro_d: ' (Polygon / ERC-721) is minted.',
    card_day7_tpl: 'Day 7 cleared {d}',
    status_done: 'Done',
    status_progress: 'In progress',
    card_horse_tpl: 'Horse {id}',
    count7_tpl: '{p} / 7',
    detail_arrow: 'Details →',
    empty_a: 'No Champion Rewards yet.',
    empty_b: 'When a horse finishes Day 7 it becomes a Champion, and its reward (200 USDT) shows here.',
    crumb: '← Champion Rewards',
    detail_title_tpl: 'Champion Reward {d}',
    horse_link_tpl: 'Horse {id} →',
    progress_k: 'Received · PROGRESS',
    of7: ' / 7',
    total_received_k: 'Total · received',
    schedule_label: 'Payment schedule · 7 PAYMENTS',
    due_tpl: 'Due {d}',
    paid_tpl: ' · paid {t}',
    status_paid: 'PAID',
    status_next: 'Next',
    status_pending: 'Scheduled',
    detail_note: 'One payment is made each night at the 20:00 settlement. When all 7 are complete, this horse’s Memorial NFT (Polygon / ERC-721) is minted.',
  },
  support: {
    self: 'You',
    unit_people: '',
    unit_horses: '',
    map_cta: 'Open the org map →',
    lead: 'When a Champion (a seven-day finisher) is born from your organization, a celebration is paid to the network that supported it. Inviting alone does not trigger it.',
    rate_k: 'STARTER RATE · your referral rate',
    rate_who: 'To you, per Champion from a friend you directly invited',
    gauge_starter: 'Starter',
    gauge_leader: 'Leader',
    gauge_sub_a: 'As your organization grows, the rate shifts smoothly from 8.00 → 3.00 (3.00 at an organization of 50,000 USDT). Rate × organization size is designed to stay constant — ',
    gauge_sub_bold: 'as your organization grows, your direct total does not fall.',
    boost_tpl: 'Starter boost ×{x}',
    standard: 'Standard',
    rate_note: 'The rate applied is the one on the night a Champion is born, re-evaluated daily at 20:00 (GMT+8).',
    tier_hero_k: 'SUPPORT TIER · current tier',
    next_maintain_tpl: 'Maintain organization ≥ {v} USDT to reach T{n}',
    next_direct_tpl: ' (+ direct ≥ {d})',
    tier_max: 'You’ve reached the top tier',
    vol_a: 'Organization (7 tiers below) active-horse value: ',
    vol_b: ' · direct invites: ',
    vol_c: ' · re-evaluated daily at 20:00 (GMT+8) (drops automatically if it falls below)',
    action_k: 'NEXT · next action',
    action_pool_tpl: '{n} friends are waiting to be placed. Placing them adds them to your network and helps you hold your tier.',
    action_grow_tpl: 'The next tier unlocks at an organization of {v} USDT. Invite friends and grow the whole network.',
    action_max: 'All tiers are unlocked. Keep maintaining your network.',
    action_btn_place: 'Place on the map',
    action_btn_view: 'View the org map',
    kpi_total: 'Total Support Bonus',
    kpi_total_sub_tpl: '{n} received',
    kpi_network: 'Network',
    kpi_network_sub: 'Friends you support',
    kpi_pool: 'Awaiting placement',
    kpi_pool_place: 'Place on the map →',
    kpi_pool_none: 'None awaiting',
    tier_table_h: 'Tiers & payouts',
    tier_meta: 'When one Champion is born, a celebration (T1 = your referral rate 3–8 / T2 = 2 / T3–7 = 1 USDT each) is distributed to the 7 tiers above.',
    tier_cond_always: 'Always',
    tier_cond_org_tpl: 'Org ≥ {v}',
    tier_cond_direct_tpl: ' + direct ≥ {d}',
    t1_range: ' (3–8)',
    tier_foot: 'Organization volume = the total active-horse value of the 7 tiers below you on your org map (the range the Support Bonus reaches). T5+ also require the active-horse value of friends you directly invited. Width (number of direct lines) is unlimited.',
    invite_title: 'Invite link · INVITE',
    invite_code_label: 'Your code ',
    invite_copied: '✓ Copied',
    invite_copy: 'Copy link',
    invite_note: 'Inviting alone pays no bonus. A Support Bonus is paid only when a Champion (a seven-day finisher) is born within your network, as a celebration within set amounts (T1 = referral rate 3–8 / T2 = 2 / T3–7 = 1 USDT each). No amount or frequency is guaranteed.',
    hist_h: 'Support Bonus history',
    hist_empty: 'No Support Bonus yet.',
    hist_why: 'A Champion born in your organization',
    toolbar_stats_tpl: '{members} members · {pool} awaiting · deepest T{depth}',
    mode_map: 'Map',
    mode_list: 'List',
    expand_all: 'Expand all',
    collapse_all: 'Collapse all',
    map_search_ph: 'Find a member (part of a display name or exact email)',
    map_search_aria: 'Search members in your organization',
    map_search_btn: 'Search',
    map_search_notfound: 'Not found in your organization (7 tiers below)',
    place_select_a: ' — choosing where to place — ',
    place_hint_map: 'click a node on the map (you or a member below you)',
    place_hint_list: 'tap a member in the list',
    place_select_b: '',
    cancel: 'Cancel',
    you_crumb: '★ You',
    focus_tier_tpl: 'TIER {t} · ',
    focus_meta_tpl: '{direct} direct · {sub} below',
    detail_btn: 'Details',
    place_here: 'Place here',
    drill_empty: 'No one below this yet.',
    child_horse_tpl: '{h} horses · ',
    child_meta_tpl: '{kids} direct · {sub} below',
    drill_open_aria: 'Open this line',
    empty_tree: 'No one placed yet. Invite friends and place your first person.',
    node_collapsed_tpl: '+{n} collapsed',
    node_series_tpl: '{n} direct lines',
    node_direct_tpl: '{n} direct',
    toggle_expand_aria: 'Expand',
    toggle_collapse_aria: 'Collapse',
    node_place_hint_tpl: 'Place here · T{n}',
    dock_title: 'Friends awaiting placement',
    dock_hint: 'Placement is final once confirmed',
    dock_empty: 'No friends awaiting placement. Share your invite link from the dashboard.',
    pool_joined_tpl: 'Joined {d}',
    pool_place_btn: 'Place',
    m_sub_tpl: 'TIER {t} ({t} levels below you)',
    m_placed_tpl: ' · placed {d}',
    m_active_horses: 'Active horses',
    m_horses_value: 'Active-horse value',
    m_burns: 'BURNs (total)', unit_times: '',
    m_items: 'Items used (total)', unit_items: '',
    m_direct: 'Direct',
    m_subtree: 'Below (within 7 tiers)',
    m_note: 'Active-horse value is this member’s contribution to your organization volume (tier unlocks).',
    m_note_loading: ' loading…',
    close: 'Close',
    confirm_title: 'Confirm placement',
    confirm_body_a: ' will be placed ',
    confirm_target_self: 'directly below you (TIER 1)',
    confirm_target_tpl: 'directly below {name} (TIER {t})',
    confirm_body_b: '.',
    warn_a: '⚠ Once confirmed, placement ',
    warn_bold: 'can never be changed',
    warn_b: '. Re-placement requests cannot be accepted (system exceptions are for operators only).',
    confirm_check: 'I understand this cannot be changed',
    reselect: 'Choose a different spot',
    placing: 'Placing…',
    confirm_btn: 'Confirm this spot',
    err_place: 'Placement failed.',
    demo_note: 'Showing a sample organization (placeholder data, ~60 people) — as your invited friends grow, this switches automatically to your real organization.',
  },
  ledger: {
    title: 'LEDGER',
    intro: 'Every night’s races and trades are published exactly as recorded. Users appear as anonymous IDs. From each day’s “All results & verification,” anyone can re-compute from the public seed (commit–reveal) and confirm results can’t be tampered with.',
    loading: 'Loading the ledger…',
    empty_no_races: 'No finalized races yet. After the first race is finalized, all records are published here.',
    dow: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    month_tpl: '{m}/{y}',
    date_full_tpl: '{m}/{d}/{y}',
    prev_month_aria: 'Previous month',
    next_month_aria: 'Next month',
    weather: { SUNNY: 'Sunny', CLOUDY: 'Cloudy', RAIN: 'Rain', STORM: 'Storm' },
    track: { FAST: 'Fast', GOOD: 'Good', SOFT: 'Soft', HEAVY: 'Heavy' },
    surface: { TURF: 'Turf', DIRT: 'Dirt' },
    t_participants: 'Entrants',
    t_survived: 'Survived',
    t_burn: 'BURN',
    t_day7: 'DAY7 cleared',
    t_matched: 'Settled',
    t_matched_vol: 'Settled volume USDT',
    t_mints: 'New mints',
    t_burn_rate: 'Applied BURN rate (from seed)',
    csv_daily: 'This day’s CSV',
    csv_generating: 'Generating…',
    csv_monthly: 'Monthly CSV',
    verify_link: 'All results & verification →',
    trades_label: 'Settled trades (anonymous) · SETTLED TRADES',
    trades_loading: 'Loading…',
    trades_empty: 'No settled trades this day.',
    mint_label_day0: 'New mint (DAY0)',
    p2p_day_tpl: ' (DAY{day})',
    badge_mint: 'New mint',
    more_tpl: '{n} more — the full set is in “This day’s CSV.”',
  },
  guide: {
    h1: 'How to play',
    lead: 'Seven Days Derby is a game where you race NFT horses through a **seven-day survival race**. This page walks beginners through the flow from sign-up to becoming a Champion.',
    hero_title: 'Race through seven days',
    hero_p: 'Every night at 20:00 (Malaysia time), all horses run at once. Survivors gain value each day; finish Day 7 and you get a 200 USDT Champion Reward and a Memorial NFT.',
    toc_aria: 'Contents',
    back_top: '↑ Back to top',
    sec_register: 'Sign up',
    sec_buy: 'Buy a horse',
    sec_sell: 'Sell a horse (market)',
    sec_race: 'The nightly race',
    sec_champion: 'Day 7 — Champion',
    sec_team: 'TEAM bonus & building an org',
    sec_items: 'Items',
    sec_wallet: 'Deposits & withdrawals',
    sec_contact: 'Contact',
    reg_p: 'You sign in with a **Google account**. Sign-up and sign-in use the same button, no password needed. Your stable opens automatically on first sign-in.',
    reg_box_t: 'Sign in with Google',
    reg_box_d: 'Balance, horses, and history are all tied to this single owner account',
    reg_tip: 'Sign up from a friend’s invite link and you join that friend’s TEAM (support org) — see ⑥.',
    buy_p1: 'You get a horse by placing a “purchase reservation” in the marketplace. Your horse is decided in the nightly 20:00 (Malaysia time) batch, and its **look, name, and ability are uniquely generated** from its DNA (unchangeable afterward, fully deterministic).',
    buy_b1_t: 'Reserve a purchase', buy_b1_d: 'Locks up to 177.16 USDT per horse\n(price-table ceiling)',
    buy_b2_t: '20:00 batch', buy_b2_d: 'Your horse is decided',
    buy_b3_t: 'Day0 mint', buy_b3_d: 'Charged 102 USDT\n(price 100 + fee 2)',
    buy_b4_t: 'Difference auto-refunded', buy_b4_d: 'The gap from your locked amount returns to your balance',
    buy_p2: 'You can also buy **other owners’ horses (Day1–Day6)** on the market. The further along a horse is, the higher its price on the table:',
    buy_warn: '**Important risk:** a horse **may be BURNed (the NFT destroyed)** in a nightly race. A destroyed horse and the money paid do not come back. Only play with money you can afford to lose.',
    sell_p: 'Day1–Day6 horses can be **listed on the market** at your discretion. “Run it to Champion, or sell partway and lock in a gain” — that tension is the heart of Seven Days Derby.',
    sell_b1_t: 'List', sell_b1_d: 'From the horse detail page\nDay1–6 only',
    sell_b2_t: 'Buyer decided', sell_b2_d: 'Settled in tonight’s batch',
    sell_b3_t: 'Receive the proceeds', sell_b3_d: 'The horse runs its remaining days under its new owner',
    sell_tip: 'Listing and buying have a nightly cutoff (the market locks briefly during race processing).',
    race_p1: 'Every night at **20:00 (Malaysia time)**, all of that day’s horses run at once. The result splits horses into **“survived” or “BURN”**; survivors advance one Day.',
    tl1_t: 'Daytime', tl1_v: 'Apply items · trade · plan',
    tl2_t: 'Pre-race', tl2_v: 'Cutoff (market & items lock)',
    tl3_t: '20:00 MYT', tl3_v: 'The mass race (watch in Daily Derby)',
    tl4_t: 'Right after', tl4_v: 'Result finalized: survive → next Day / BURN',
    race_p2: '**No one can rig the race.** The result is computed deterministically from a random seed committed (sealed) in advance, and the seed is revealed after the race. Anyone can re-compute and verify it — this is the “commit–reveal” method. Neither the operator nor you can change a result.',
    race_p3: '**Each night, the lowest-placed horses are BURNed (destroyed).** The full record of how many ran, survived, and were BURNed is published daily on the **“Ledger” page**, downloadable as CSV so anyone can verify and tally it.',
    race_p4: 'At the end of the race presentation, a **“tomorrow’s forecast”** (weather, track, surface) is announced. The forecast is generated mechanically from a pre-committed seed — a **~70%-accurate hint**, not a guarantee of the result. Whether you stock items to match it is up to you.',
    race_tip: 'On the RACE page’s “Daily Derby,” you can watch each night’s race in a live-style presentation, with a dedicated highlight for your own horse’s run.',
    champ_p1: 'A horse that survives all seven nights is a **Champion**. It earns a **200 USDT Champion Reward** (paid automatically in 7 installments from the next day) and a hall-of-fame **Memorial NFT** (Polygon / ERC-721).',
    ladder_survive: 'Survived', ladder_day7_v: '200 USDT + Memorial NFT',
    champ_p2: 'Champion records and reward schedules are gathered on the **CHAMPION page**. Your own Champion Reward payout status and the Hall of Champions are both there.',
    champ_tip: 'When active users reach 10,000, a weekly top-tier “Champion League” — open only to Champion horses — begins.',
    team_p1: 'When a friend signs up from your personal **invite link** (found on the TEAM page), they join your **support org (TEAM)**. As friends invite more friends, the org spreads downward (up to 7 tiers).',
    tree_svg_aria: 'Org tree: You → Friends A/B/C → their friends',
    tree_you: 'You', tree_fa: 'Friend A', tree_fb: 'Friend B', tree_fc: 'Friend C', tree_fa_sub: 'A’s friend', tree_fb_sub: 'B’s friend',
    team_p2: 'When a member’s horse becomes a **Champion (a seven-day finisher)**, a **Support Bonus** is distributed as a celebration to the org that supported it (10 USDT total per horse, across the top 7 tiers). How many tiers you receive from unlocks with **your whole org’s activity** — so it’s not just “how many you invited directly,” but **growing the organization** that matters.',
    team_b1_t: 'Share the invite link', team_b1_d: 'Get it on the TEAM page',
    team_b2_t: 'The org grows', team_b2_d: 'Spreads to friends of friends (7 tiers)',
    team_b3_t: 'A Champion is born', team_b3_d: 'A celebration from the org (up to your unlocked tiers)',
    team_warn: 'The Support Bonus varies with Champions born from your org. **There is no promise or guarantee of income whatsoever.** Check the exact conditions and your current tier status on the TEAM page.',
    items_p1: 'You can buy **30 kinds of items** in the ITEMS-page shop (three bands: Basic / Standard / Premium). In addition, **5 exclusive items** that drop at a set chance when a horse is BURNed cannot be bought in the shop.',
    items_b1_t: 'Get items', items_b1_d: 'Shop purchase / BURN drop / gift received',
    items_b2_t: 'Apply to a horse before the race', items_b2_d: 'From the horse detail page. Affects tonight’s score (capped)',
    items_b3_t: 'Race conditions (weather, track, surface)', items_b3_d: 'Match an item’s aptitude for up to ×1.5 (decided from the seed, verifiable)',
    items_p2: 'Each item has an **aptitude** (turf specialist, dirt specialist, rain demon, off-track demon, etc.). Match the nightly **race conditions (weather, track, surface)** and its effect rises to as much as ×1.5; go against them and it dulls to ×0.5. Conditions are set by the race seed, so **the operator cannot manipulate them**. Anyone can verify after the race.',
    items_tip: 'You can **gift items to other owners by email address** (with some exceptions). Send a sugar cube for a friend’s big moment — that kind of use, too.',
    wallet_p: 'The in-game currency is **USDT (Polygon network)**. Everything is handled on the WALLET page.',
    w_b1_t: 'Deposit', w_b1_d: 'Send USDT (Polygon) to your personal deposit address',
    w_b2_t: 'Chain confirmation', w_b2_d: 'Credited after the required confirmations',
    w_b3_t: 'Balance credited', w_b3_d: 'Usable to buy horses and items',
    w_b4_t: 'Request a withdrawal', w_b4_d: 'Set the destination address and amount on the WALLET page',
    w_b5_t: 'Review', w_b5_d: 'Large withdrawals need approval from several people, so may take time',
    w_b6_t: 'Sent', w_b6_d: 'USDT arrives in your wallet',
    wallet_warn: '**Always use USDT on the Polygon network.** Sending on another network or token may cause loss of funds.',
    contact_p: 'If anything is unclear, contact the support team anytime. We reply to your registered email.',
    c_b1_t: 'Contact form', c_b1_d: 'From “Contact” in the nav (recommended)',
    c_b2_t: 'Email',
    c_box_t: 'AI + support team reviews and replies', c_box_d: 'Global support — we reply in the language of your inquiry (Japanese/English and more)',
    contact_link: '→ Open the contact form',
  },
};

const zh: AppDict = {
  common: { horses_unit: '匹', cases_unit: '件' },
  nav: { notifications: '通知', account: '账户', guide: '使用方法', contact: '联系我们', logout: '退出登录' },
  dash: {
    result_label: '昨晚的结果',
    result_detail: '比赛详情 →',
    res_survived: '存活',
    res_burned: 'Burn(消灭)',
    res_best_tpl: '最高名次 / 共{n}匹',
    pill_burn: 'Burn',
    pill_survived_tpl: '存活 · Day {d}',
    result_empty: '还没有比赛结果。今晚20:00，你的马将在首场比赛中诞生。',
    tonight_label: '今晚的比赛',
    countdown_to: '距起跑',
    tonight_note: '成绩垫底的马被Burn=消灭。存活的马身价逐日上涨。全部记录公开在账本。',
    watch_show: '观看今晚的演出 →',
    tasks_label: '今日待办',
    untrained_suffix: ' 未训练',
    pending_suffix: ' 等待分配',
    tasks_prepare_items: '备好道具 →',
    tasks_train: '训练',
    tasks_adopt: '迎接一匹马',
    tasks_sub: '每天可训练一次，直到今晚的快照确定。等待分配的马在今晚的比赛中确定。',
    tasks_done_text: '今日待办已完成。接下来只需等待20:00起跑。',
    balance_k: '余额',
    balance_avail: 'USDT 可用',
    balance_locked_tpl: ' · 锁定中 {v}',
    stable_val_k: '马房估值',
    stable_val_s_tpl: 'USDT · {n}匹的现值',
    buff_none: '无',
    buff_active_s: '下次分配自动加分',
    buff_none_s: 'Burn 时获得的下一场加成',
    stable_mine: '我的马房',
    stable_sub_tpl: 'STABLE {n} · 估值 {v} USDT',
    stable_adopt: '迎接一匹马 ▶',
    stable_all: '全部 →',
    stable_empty_pending_tpl: '等待分配 {n} 件 — 今晚的比赛中确定。',
    stable_empty_none: '暂无出赛的马。点击上方“迎接一匹马 ▶”参加今晚的德比。',
    train_yes: '已训练',
    train_no: '未训练',
    bb_title: '冠军奖励 领取中',
    bb_title_count_tpl: ' · {n}匹',
    bb_per: '200 USDT 分7次领取',
    bb_count_tpl: '{p} / 7 次',
    bb_note: '每晚20:00结算时支付一次',
  },
  promo: {
    done_pre: '🎁 ',
    done_post: ' 已进入你的马房 — 今晚20:00起出赛。',
    view_horse: '查看马匹 →',
    toggle: '有兑换码吗? →',
    label: '兑换码',
    submit: '领取马匹',
    submitting: '确认中…',
    close: '关闭',
    err_default: '兑换失败，请检查兑换码。',
  },
  trade: {
    save_err: '设置保存失败。',
    modal_title: '请选择卖马方式',
    modal_lead: '选择你的马如何上架市场(之后随时可更改)。',
    smart_head: '智能出品',
    smart_badge: '推荐',
    smart_li1: '经济引擎在合适时机自动出品(每晚最多1匹，按当日价格)',
    smart_li2: '出品期间仍照常出赛',
    smart_li3: '可使用自动购买预约(售出后自动创建次晚预约)',
    smart_li4: '无需每日操作',
    smart_cta: '以智能出品开始',
    manual_head: '手动出品',
    manual_li1: '自行选择出品的马与时机',
    manual_li2: '出品期间不出赛(Day 与价值冻结)',
    manual_li3: '每匹马每天可出品一次，撤回于次批次生效',
    manual_li4: '不能使用自动购买预约',
    manual_cta: '使用手动出品',
    modal_note: '无论选哪种，购买预约与账本的公开规则都相同。',
    tile_label: 'AUTO · 交易自动化',
    tile_note: '随时可更改',
    smart_name: '智能出品',
    smart_on_desc: '经济引擎自动出品(出品期间仍照常出赛)',
    smart_off_desc: 'OFF：从市场的“出品马匹”手动出品',
    reserve_name: '自动购买预约',
    reserve_on_desc: '每晚批次后，在余额范围内自动创建购买预约(每次邮件通知)',
    reserve_off_desc: '开启智能出品后可用',
    max_label: '上限',
    max_unit: ' 匹',
  },
  pwa: {
    label: 'APP 与通知',
    done_text: '通知已开启。每晚20:00通知你起跑。',
    enable_text: '开启通知后，每晚20:00起跑时通知你。',
    enable_btn: '开启通知',
    enable_busy: '设置中…',
    register_text: '已获授权，但此设备尚未完成注册。',
    register_btn: '完成注册',
    register_busy: '注册中…',
    blocked_text: '通知当前被屏蔽。在浏览器设置中允许即可恢复。',
    ios_install_text: '添加到主屏幕即可接收起跑通知。',
    install_text: '添加到主屏幕即可作为应用使用。',
    ios_step1_a: '点按分享按钮',
    ios_step1_b: '',
    ios_step2: '“添加到主屏幕”',
    ios_step3: '打开应用并开启通知',
    install_steps: '在浏览器菜单中选择“添加到主屏幕”/“安装应用”，即可作为应用启动。',
    install_hint: '添加到主屏幕即可一键打开。',
    add_app: '+ 添加应用',
  },
  account: {
    title: '账户',
    st_racing: '出赛中',
    st_listed: '出品中',
    st_champions: '冠军',
    st_burned: '消灭',
    st_pending: '等待分配的预约',
    email_unset: '(未设置邮箱 — 钱包登录)',
    reg_label: '注册 ',
    play_tpl: '游玩第 {n} 天',
    id_label: 'ID ',
    record_label: '你的记录',
    stat_note_a: '点按数字即可跳转到对应页面。奖励领取情况见 ',
    stat_note_b: '，入出金记录见 ',
    stat_note_c: '。',
    settings_label: '设置',
    linking_label: '关联登录方式',
    linking_lead: '关联后，任何登录方式都可访问同一账户(余额与马匹)。一个钱包只能关联一个账户。',
    support_label: '支持',
    support_lead: '有关游戏规则、账户、入出金等任何问题，欢迎随时联系。我们会回复到你注册的邮箱。',
    support_guide: '查看使用方法 →',
    support_contact: '前往联系表单 →',
  },
  stableName: {
    unset: '马房名 未设置 — 设置后成交与组织图会显示此名称',
    set_btn: '设置马房名',
    change_btn: '修改',
    placeholder: '例: 流星马房',
    saving: '保存中…',
    save: '保存',
    cancel: '取消',
    hint: '2〜20个字符 · 对所有用户公开 · 每天可修改一次',
    err: '无法保存马房名。',
  },
  linking: {
    login_id: '登录 ID(Supabase)',
    loading: '加载中…',
    unlink: '解除',
    last_id: '(最后一个登录 ID 无法解除)',
    link_google: '关联 Google',
    wallet_h: '钱包',
    no_wallet: '尚无已关联的钱包。',
    link_metamask: '🦊 关联 MetaMask',
    err_no_metamask: '未找到 MetaMask。请先安装该扩展。',
    err_no_address: '无法获取钱包地址',
    err_link_wallet: '钱包关联失败',
    linked_tpl: '已关联钱包 {addr}',
    err_unlink: '解除失败',
  },
  contact: {
    title: '联系我们',
    lead: '游戏规则、账户、入出金等，任何问题都欢迎咨询。支持团队会查看并回复到你注册的邮箱。',
    faq_label: '常见问题',
    faq_burn: '什么是 BURN?',
    faq_buy: '购买与出售的机制',
    faq_deposit: '入金未到账',
    faq_champion: '冠军奖励何时发放?',
    faq_team: '团队(支持奖励)',
    cat_rules: '游戏规则',
    cat_money: '入出金',
    cat_trade: '购买/出售',
    cat_team: '团队',
    cat_other: '其他',
    cat_label: '类别(可选)',
    subject_label: '主题',
    subject_ph: '例: 请说明 BURN',
    body_label: '咨询内容',
    body_ph: '尽量写得具体，我们才能更准确地为你解答',
    sending: '发送中…',
    send: '发送',
    err_send: '发送失败。请稍后再试。',
    done_title: '已发送',
    done_a: '感谢你的咨询。支持团队会查看并回复到',
    done_bold: '你注册的邮箱',
    done_b: '。',
    done_guide: '查看使用方法 →',
    done_dashboard: '前往仪表板 →',
    aside_reply_title: '关于回复',
    li1_bold: '你注册的邮箱',
    li1_rest: ' — 我们会回复到这里(本页不显示回复)',
    aside_li2: '部分咨询可能需要一些时间核实',
    aside_li3: '余额与交易的具体数字，可在站内各页面查看',
    aside_mail_title: '也可通过邮件联系',
  },
  notif: {
    title: '通知',
    unread_tpl: '未读 {n}',
    read_note: '打开即标记为已读 · 点按前往相关页面',
    types: {
      RACE_RESULT_READY: '比赛结果', HORSE_BURNED: 'Burn', REVENGE_BUFF_GENERATED: 'Revenge Buff',
      BUYBACK_PAYMENT_PAID: '冠军奖励', BUYBACK_COMPLETED: '冠军奖励', MEMORIAL_NFT_MINTED: '纪念NFT',
      SUPPORT_BONUS_PAID: '支持奖励', SUPPORT_CELEBRATION_PAID: '祝贺金', ASSIGNMENT_COMPLETED: '马匹分配',
      HORSE_SOLD: '出售成交', AUTO_LISTED: '自动出品', AUTO_RESERVED: '自动购买预约',
      MARKETPLACE_LOCKED: '结算中', MARKETPLACE_REOPENED: '重新开放', DEPOSIT_CONFIRMED: '入金',
      WITHDRAWAL_COMPLETED: '出金', WITHDRAWAL_FAILED: '出金错误', TRAINING_COMPLETED: '训练',
      ITEM_DROPPED: '道具', ITEM_GIFT_RECEIVED: '礼物',
    },
    type_default: '通知',
    cats: { race: '比赛', trade: '买卖', reward: '奖励', money: '入出金', other: '其他' },
    cat_all: '全部',
    digest_title_tpl: '{d} 摘要',
    count_tpl: '{n}件',
    digest_results: '查看结果 →',
    digest_history: '交易记录 →',
    search_ph: '搜索通知…',
    unread_only: '仅未读',
    count_all_tpl: '共{n}件',
    count_some_tpl: '{total}件中 {shown}件',
    empty_a: '还没有通知。',
    empty_b: '比赛结果、Burn、冠军奖励、买卖等都会显示在这里。',
    empty_filtered: '没有符合条件的通知。',
    prev: '← 上一页',
    next: '下一页 →',
    min_tpl: '{n}分钟前',
    hour_tpl: '{n}小时前',
    day_tpl: '{n}天前',
  },
  champion: {
    hero_note: '活跃用户达到 10,000 人时开赛',
    sound_on_aria: '关闭声音',
    sound_off_aria: '开启声音',
    rewards_sub: '你的冠军奖励',
    rewards_note_a: '跑完 Day7 的马成为冠军，获得 ',
    rewards_note_b: ' 冠军奖励，并成为纪念NFT。奖励分7次发放，每晚结算时自动支付。',
    hall_sub: '所有跑完 Day7 的马',
    hall_count_tpl: '累计加冕 {n} 匹',
    hall_sample: '示例展示(模拟数据)— 第一位冠军诞生后，这里会刻上真实的马。',
    filter_all: '全部',
    sort_recent: '最新优先',
    sort_oldest: '最早优先',
    sort_name: '按名称',
    sort_aria: '排序',
    crowned: '加冕',
    owner_label: '拥有者',
    league_desc: '仅限跑完 Day7 的冠军马参加的每周顶级联赛。活跃用户达到 10,000 人时开幕，采用与 Daily Derby 独立的经济运营。',
    ladder_title: '7 CLASSES · 升级阶梯',
    class_win_tpl: '{n}胜',
    weekly_races_v: '每周举办一次·每场最多18匹。根据已登记的冠军马数量自动编排比赛。',
    prize_pool_v: '每周道具商店销售额的 1% 进入奖金池。并非赢家通吃，而是分配给多匹出赛马。',
    retirement_v: '夺得 G1 或联赛出赛10场即荣誉退役。退役马将永久刻入殿堂。',
    fanpass_v: '解锁多机位视角与高级观赛。粉丝参与、排行榜等功能也在规划中。',
    bv_title: '冠军奖励',
    bv_intro_a: '跑完 Day7 的马成为冠军，获得 ',
    bv_intro_bold1: '200 USDT',
    bv_intro_b: ' 冠军奖励。自次日（D+1）起分 ',
    bv_intro_bold2: '7次',
    bv_intro_c: '自动支付。7次完成后铸造 ',
    bv_intro_bold3: '纪念NFT',
    bv_intro_d: '（Polygon / ERC-721）。',
    card_day7_tpl: 'Day7 达成 {d}',
    status_done: '完成',
    status_progress: '进行中',
    card_horse_tpl: '马 {id}',
    count7_tpl: '{p} / 7 次',
    detail_arrow: '详情 →',
    empty_a: '还没有冠军奖励。',
    empty_b: '当马跑完 Day7 成为冠军后，奖励(200 USDT)会显示在这里。',
    crumb: '← 冠军奖励一览',
    detail_title_tpl: '冠军奖励 {d}',
    horse_link_tpl: '马 {id} →',
    progress_k: '领取进度 · PROGRESS',
    of7: ' / 7 次',
    total_received_k: '总额 · 已领取',
    schedule_label: '支付计划 · 7 PAYMENTS',
    due_tpl: '预定 {d}',
    paid_tpl: ' · 支付 {t}',
    status_paid: 'PAID · 已支付',
    status_next: '下次',
    status_pending: '预定',
    detail_note: '每晚20:00结算时支付一次。7次全部完成后，将铸造这匹马的纪念NFT（Polygon / ERC-721）。',
  },
  support: {
    self: '你',
    unit_people: '人',
    unit_horses: '匹',
    map_cta: '打开组织图 →',
    lead: '当你的组织中诞生冠军(跑完七天)时，会向支持它的网络发放祝贺金。仅仅邀请不会触发。',
    rate_k: 'STARTER RATE · 你的推荐单价',
    rate_who: '你直接邀请的伙伴每诞生一匹冠军，就发给你',
    gauge_starter: '新手',
    gauge_leader: '领袖',
    gauge_sub_a: '组织越壮大，单价从 8.00 → 3.00 平滑过渡(组织达 50,000 USDT 时为 3.00)。单价×组织规模设计为恒定 — ',
    gauge_sub_bold: '组织壮大后，你直接部分的合计也不会减少。',
    boost_tpl: '新手加成 ×{x}',
    standard: '标准',
    rate_note: '适用的单价为冠军诞生当晚的单价，每天 20:00 (GMT+8) 重新评估。',
    tier_hero_k: 'SUPPORT TIER · 当前层级',
    next_maintain_tpl: '维持组织 ≥ {v} USDT 以达到 T{n}',
    next_direct_tpl: '(+直接 ≥ {d})',
    tier_max: '你已达到最高层级',
    vol_a: '组织(下方7层)在役马现值: ',
    vol_b: ' · 直接邀请部分: ',
    vol_c: ' · 每天20:00 (GMT+8) 重新评估(低于则自动下降)',
    action_k: 'NEXT · 下一步',
    action_pool_tpl: '有 {n} 位伙伴等待安置。安置后即加入你的网络，有助于维持层级。',
    action_grow_tpl: '下一层级在组织达 {v} USDT 时解锁。邀请伙伴，壮大整个网络。',
    action_max: '所有层级均已解锁。继续维护你的网络。',
    action_btn_place: '在组织图中安置',
    action_btn_view: '查看组织图',
    kpi_total: '累计支持奖励',
    kpi_total_sub_tpl: '已领取 {n} 次',
    kpi_network: '网络',
    kpi_network_sub: '你支持的伙伴',
    kpi_pool: '等待安置',
    kpi_pool_place: '在组织图中安置 →',
    kpi_pool_none: '无等待安置',
    tier_table_h: '层级与发放额',
    tier_meta: '每诞生一匹冠军，祝贺金(T1=你的推荐单价 3〜8 / T2=2 / T3〜7=各1 USDT)会分配给前7层。',
    tier_cond_always: '始终',
    tier_cond_org_tpl: '组织 ≥ {v}',
    tier_cond_direct_tpl: ' +直接 ≥ {d}',
    t1_range: ' (3〜8)',
    tier_foot: '组织规模 = 你组织图下方7层(支持奖励覆盖范围)在役马价值的合计。T5 以上还需「你直接邀请伙伴的在役马价值」。横向(直属系列数)不限。',
    invite_title: '邀请链接 · INVITE',
    invite_code_label: '你的邀请码 ',
    invite_copied: '✓ 已复制',
    invite_copy: '复制链接',
    invite_note: '仅仅邀请不会产生奖励。支持奖励仅在你的网络中诞生冠军(跑完七天)时，才会在规定额度(T1=推荐单价3〜8 / T2=2 / T3〜7=各1 USDT)内作为祝贺金发放。金额与频率不作保证。',
    hist_h: '支持奖励记录',
    hist_empty: '还没有支持奖励。',
    hist_why: '组织内冠军诞生',
    toolbar_stats_tpl: '成员 {members} 人 · 等待安置 {pool} 人 · 最深 T{depth}',
    mode_map: '图谱',
    mode_list: '列表',
    expand_all: '全部展开',
    collapse_all: '全部折叠',
    map_search_ph: '查找成员(显示名的一部分 或 邮箱完全匹配)',
    map_search_aria: '组织内成员搜索',
    map_search_btn: '搜索',
    map_search_notfound: '在你的组织(下方7层)中未找到',
    place_select_a: ' 的安置位置选择中 — ',
    place_hint_map: '请点击图上的节点(你 或 下属成员)',
    place_hint_list: '请点按列表中的成员',
    place_select_b: '',
    cancel: '取消',
    you_crumb: '★ 你',
    focus_tier_tpl: 'TIER {t} · ',
    focus_meta_tpl: '直属 {direct} 人 · 下属 {sub} 人',
    detail_btn: '详情',
    place_here: '安置到这里',
    drill_empty: '此下方还没有任何人。',
    child_horse_tpl: '马{h}匹 · ',
    child_meta_tpl: '直属{kids}人 · 下属{sub}人',
    drill_open_aria: '展开该系列',
    empty_tree: '还没有安置任何人。邀请伙伴，安置第一个人吧。',
    node_collapsed_tpl: '+{n} 人 折叠中',
    node_series_tpl: '直属 {n} 系列',
    node_direct_tpl: '直属 {n} 人',
    toggle_expand_aria: '展开',
    toggle_collapse_aria: '折叠',
    node_place_hint_tpl: '安置到这里 · T{n}',
    dock_title: '等待安置的伙伴',
    dock_hint: '安置一经确认不可更改',
    dock_empty: '没有等待安置的伙伴。从仪表板分享你的邀请链接吧。',
    pool_joined_tpl: '加入 {d}',
    pool_place_btn: '安置',
    m_sub_tpl: 'TIER {t}(距你第{t}层)',
    m_placed_tpl: ' · 安置 {d}',
    m_active_horses: '在役马',
    m_horses_value: '在役马现值',
    m_burns: 'BURN次数(累计)', unit_times: '次',
    m_items: '道具使用(累计)', unit_items: '个',
    m_direct: '直属',
    m_subtree: '下属(7层内)',
    m_note: '在役马现值是该成员对你组织规模(层级解锁)的贡献部分。',
    m_note_loading: ' 获取中…',
    close: '关闭',
    confirm_title: '确认安置',
    confirm_body_a: ' 将被安置到 ',
    confirm_target_self: '你的直属下方（TIER 1）',
    confirm_target_tpl: '{name} 的直属下方（TIER {t}）',
    confirm_body_b: '。',
    warn_a: '⚠ 安置一经确认',
    warn_bold: '将永久无法更改',
    warn_b: '。恕不受理改置请求(系统例外处理仅限运营管理员)。',
    confirm_check: '我已明白此操作不可更改',
    reselect: '重新选择位置',
    placing: '安置中…',
    confirm_btn: '确认此位置',
    err_place: '安置失败。',
    demo_note: '正在显示示例组织(模拟数据·约60人)— 当你邀请的伙伴增多时，这里会自动切换为你的真实组织。',
  },
  ledger: {
    title: '账本 · LEDGER',
    intro: '每晚的比赛与买卖全记录，原样公开。用户以匿名ID显示。通过每天的「全马结果与验证」，任何人都能用公开种子重新计算(承诺-揭示)，确认结果无法被操纵。',
    loading: '正在加载账本…',
    empty_no_races: '还没有已确定的比赛。首场比赛确定后，全部记录会公开在这里。',
    dow: ['日', '一', '二', '三', '四', '五', '六'],
    month_tpl: '{y}年{m}月',
    date_full_tpl: '{y}年{m}月{d}日',
    prev_month_aria: '上一月',
    next_month_aria: '下一月',
    weather: { SUNNY: '晴', CLOUDY: '多云', RAIN: '雨', STORM: '暴风雨' },
    track: { FAST: '快速', GOOD: '良', SOFT: '稍重', HEAVY: '不良' },
    surface: { TURF: '草地', DIRT: '泥地' },
    t_participants: '出赛',
    t_survived: '存活',
    t_burn: 'BURN',
    t_day7: 'DAY7 跑完',
    t_matched: '成交',
    t_matched_vol: '成交总额 USDT',
    t_mints: '新铸造',
    t_burn_rate: '采用BURN率(源自种子)',
    csv_daily: '当日CSV',
    csv_generating: '生成中…',
    csv_monthly: '月度CSV',
    verify_link: '全马结果与验证 →',
    trades_label: '成交记录(匿名) · SETTLED TRADES',
    trades_loading: '加载中…',
    trades_empty: '当日没有成交。',
    mint_label_day0: '新铸造(DAY0)',
    p2p_day_tpl: '(DAY{day})',
    badge_mint: '新铸造',
    more_tpl: '另有 {n} 条 — 全部包含在「当日CSV」中。',
  },
  guide: {
    h1: '使用指南',
    lead: 'Seven Days Derby 是一款与 NFT 赛马一起进行**七天生存赛**的游戏。本页面用图解为新手讲解从注册到夺冠的流程。',
    hero_title: '跑完七天',
    hero_p: '每晚20:00(马来西亚时间)，所有马匹同时起跑。存活的马逐日升值，跑完第7天即可获得 200 USDT 冠军奖励与纪念NFT。',
    toc_aria: '目录',
    back_top: '↑ 返回页首',
    sec_register: '账户注册',
    sec_buy: '购买马匹',
    sec_sell: '出售马匹(市场)',
    sec_race: '每晚的比赛',
    sec_champion: 'Day7 达成 — 冠军',
    sec_team: 'TEAM 奖励与组织搭建',
    sec_items: '道具',
    sec_wallet: '入金・出金',
    sec_contact: '联系我们',
    reg_p: '登录使用 **Google 账号**。注册与登录是同一个按钮，无需密码。首次登录会自动为你开设马房。',
    reg_box_t: '用 Google 登录',
    reg_box_d: '余额、马匹、记录都绑定在这一个所有者账户上',
    reg_tip: '通过朋友的邀请链接注册，即加入该朋友的 TEAM(应援组织)(见⑥)。',
    buy_p1: '通过在市场进行「购买预约」来迎接马匹。你的马在每晚20:00(马来西亚时间)的批次中确定，其**外观・名字・能力由 DNA 唯一生成**(之后不可更改・完全决定论)。',
    buy_b1_t: '购买预约', buy_b1_d: '每匹最多锁定 177.16 USDT\n(价格表上限)',
    buy_b2_t: '20:00 批次', buy_b2_d: '你的马被确定',
    buy_b3_t: 'Day0 铸造', buy_b3_d: '扣款 102 USDT\n(价格100+手续费2)',
    buy_b4_t: '差额自动退还', buy_b4_d: '与锁定额的差额退回余额',
    buy_p2: '你也可以在市场购买**其他所有者的马(Day1〜Day6)**。天数越靠后的马，价格表越高:',
    buy_warn: '**重要风险:** 马在每晚的比赛中**可能被 BURN(NFT 消灭)**。消灭的马与已付款项不会退还。请务必在闲余资金范围内游玩。',
    sell_p: 'Day1〜Day6 的马可由你自行决定**在市场出品**。「养到冠军，还是中途卖出锁定利润」— 这种博弈正是 Seven Days Derby 的乐趣所在。',
    sell_b1_t: '出品', sell_b1_d: '从马匹详情页\n仅限 Day1〜6',
    sell_b2_t: '买家确定', sell_b2_d: '在今晚批次成交',
    sell_b3_t: '收到售款', sell_b3_d: '马在新所有者名下跑完剩余日程',
    sell_tip: '出品与购买每晚都有截止时间(比赛处理期间市场会临时锁定)。',
    race_p1: '每晚**20:00(马来西亚时间)**，当天所有马匹同时起跑。比赛结果将马分为**「存活」或「BURN」**，存活的马前进一个 Day。',
    tl1_t: '白天', tl1_v: '道具应用・买卖・策略时间',
    tl2_t: '赛前', tl2_v: '截止(市场・道具锁定)',
    tl3_t: '20:00 MYT', tl3_v: '同场比赛(在 Daily Derby 观战)',
    tl4_t: '赛后即刻', tl4_v: '结果确定: 存活→进入下一 Day / BURN',
    race_p2: '**比赛无人能操纵。**结果由事先承诺(封印)的随机种子决定论地计算，赛后公开种子。任何人都能重新计算并验证 — 这就是「承诺-揭示」方式。运营和你都无法更改结果。',
    race_p3: '**每晚，成绩垫底的马会被 BURN(消灭)。**多少匹出赛、多少存活、多少被 BURN 的全记录，每天公开在**「账本」页面**，可下载 CSV 供任何人验证与统计。',
    race_p4: '比赛演出的最后会公布**「明日预报」**(天气・赛道・场地)。预报由事先承诺的种子机械生成，是**约70%命中率的参考信息**，不保证结果。是否按预报备好道具由你决定。',
    race_tip: '在 RACE 页面的「Daily Derby」，可以以直播风格的演出观看每晚的比赛，你自己马匹的奔跑会有专属高光。',
    champ_p1: '熬过全部七晚比赛的马就是**冠军**。可获得**200 USDT 冠军奖励**(从次日起分7次自动支付)与入殿堂的**纪念NFT**(Polygon / ERC-721)。',
    ladder_survive: '存活', ladder_day7_v: '200 USDT + 纪念NFT',
    champ_p2: '冠军战绩与奖励发放计划汇总在**CHAMPION 页面**。你的冠军奖励支付情况与殿堂(Hall of Champions)都可在此查看。',
    champ_tip: '当活跃用户达到 10,000 人，仅限冠军马参加的每周顶级联赛「Champion League」将开幕。',
    team_p1: '朋友通过你专属的**邀请链接**(在 TEAM 页面查看)注册后，即加入你的**应援组织(TEAM)**。朋友再邀请朋友，组织便向下扩展(最多7层)。',
    tree_svg_aria: '组织树: 你 → 朋友A/B/C → 他们的朋友',
    tree_you: '你', tree_fa: '朋友A', tree_fb: '朋友B', tree_fc: '朋友C', tree_fa_sub: 'A的朋友', tree_fb_sub: 'B的朋友',
    team_p2: '当组织成员的马成为**冠军(跑完七天)**时，会向支持的组织发放**支持奖励**作为祝贺金(每匹合计 10 USDT、前7层)。可领取的层级根据**整个组织的活跃度**逐步解锁 — 也就是说，不仅是「你直接邀请的人数」，**培育组织**才是关键。',
    team_b1_t: '分享邀请链接', team_b1_d: '在 TEAM 页面获取',
    team_b2_t: '组织成长', team_b2_d: '扩展到朋友的朋友(7层)',
    team_b3_t: '冠军诞生', team_b3_d: '来自组织的祝贺金(至已解锁层级)',
    team_warn: '支持奖励随组织中冠军的诞生而变动。**绝无任何收益承诺或保证。**详细条件与当前层级状况请在 TEAM 页面确认。',
    items_p1: '在 ITEMS 页面的商店可购买**30 种道具**(基础 / 标准 / 高级三档)。此外，马被 BURN 时按一定概率掉落的**5 种限定道具**无法在商店购买。',
    items_b1_t: '获得道具', items_b1_d: '商店购买 / BURN 掉落 / 收到赠送',
    items_b2_t: '赛前给马使用', items_b2_d: '从马匹详情页。影响今晚的分数(有上限)',
    items_b3_t: '比赛条件(天气・赛道・场地)', items_b3_d: '与道具适性契合时最高 ×1.5(由种子决定・可验证)',
    items_p2: '每个道具都有**适性**(草地好手・泥地好手・雨战之鬼・恶劣场地之鬼等)，与每晚的**比赛条件(天气・赛道・场地)**契合时效果最高提升至 ×1.5，相反条件下则钝化至 ×0.5。条件由比赛种子决定，因此**运营无法操纵**。赛后任何人都能验证。',
    items_tip: '道具可**指定邮箱赠送**给其他所有者(部分除外)。在同伴的关键时刻送上一颗方糖 — 也是一种玩法。',
    wallet_p: '游戏内货币是 **USDT(Polygon 网络)**。所有操作都在 WALLET 页面完成。',
    w_b1_t: '入金', w_b1_d: '向你专属的入金地址发送 USDT(Polygon)',
    w_b2_t: '链上确认', w_b2_d: '达到所需确认数后计入余额',
    w_b3_t: '余额到账', w_b3_d: '可用于购买马匹与道具',
    w_b4_t: '出金申请', w_b4_d: '在 WALLET 页面指定目标地址与金额',
    w_b5_t: '审核', w_b5_d: '大额出金需多人批准，可能需要时间',
    w_b6_t: '发送', w_b6_d: 'USDT 到达你的钱包',
    wallet_warn: '**请务必使用 Polygon 网络的 USDT。**用其他网络或代币发送可能导致资产损失。',
    contact_p: '有任何不明白的地方，随时联系支持团队。我们会回复到你注册的邮箱。',
    c_b1_t: '联系表单', c_b1_d: '从导航的「联系我们」(推荐)',
    c_b2_t: '邮件',
    c_box_t: 'AI+支持团队查看并回复', c_box_d: '全球支持 — 以你咨询的语言回复(中文/英文等)',
    contact_link: '→ 打开联系表单',
  },
};

const ko: AppDict = {
  common: { horses_unit: '마리', cases_unit: '건' },
  nav: { notifications: '알림', account: '계정', guide: '이용 방법', contact: '문의', logout: '로그아웃' },
  dash: {
    result_label: '어젯밤 결과',
    result_detail: '레이스 상세 →',
    res_survived: '생존',
    res_burned: 'Burn(소멸)',
    res_best_tpl: '최고 순위 / 전체 {n}마리',
    pill_burn: 'Burn',
    pill_survived_tpl: '생존 · Day {d}',
    result_empty: '아직 레이스 결과가 없습니다. 오늘 밤 20:00, 첫 레이스에서 당신의 말이 태어납니다.',
    tonight_label: '오늘 밤 레이스',
    countdown_to: '출발까지',
    tonight_note: '성적 하위권 말은 Burn=소멸. 살아남은 말은 날마다 가치가 오릅니다. 모든 기록은 원장에 공개.',
    watch_show: '오늘 밤 쇼 보기 →',
    tasks_label: '오늘 할 일',
    untrained_suffix: ' 미조련',
    pending_suffix: ' 배정 대기',
    tasks_prepare_items: '아이템 준비하기 →',
    tasks_train: '조련하기',
    tasks_adopt: '말 맞이하기',
    tasks_sub: '조련은 하루 한 번, 오늘 밤 스냅샷 확정까지. 배정 대기는 오늘 밤 레이스에서 말이 확정됩니다.',
    tasks_done_text: '오늘 할 일 완료. 이제 20:00 출발을 기다리면 됩니다.',
    balance_k: '잔액',
    balance_avail: 'USDT 사용 가능',
    balance_locked_tpl: ' · 잠금 {v}',
    stable_val_k: '마구간 평가액',
    stable_val_s_tpl: 'USDT · {n}마리의 현재 가치',
    buff_none: '없음',
    buff_active_s: '다음 배정에 자동 가산',
    buff_none_s: 'Burn으로 얻는 다음 레이스 보너스',
    stable_mine: '내 마구간',
    stable_sub_tpl: 'STABLE {n} · 평가액 {v} USDT',
    stable_adopt: '말 맞이하기 ▶',
    stable_all: '전체 →',
    stable_empty_pending_tpl: '배정 대기 {n} 건 — 오늘 밤 레이스에서 확정됩니다.',
    stable_empty_none: '출전 중인 말이 없습니다. 위의 “말 맞이하기 ▶”에서 오늘 밤 더비에 참가하세요.',
    train_yes: '조련 완료',
    train_no: '미조련',
    bb_title: '챔피언 보상 수령 중',
    bb_title_count_tpl: ' · {n}마리',
    bb_per: '200 USDT를 7회에 걸쳐 수령',
    bb_count_tpl: '{p} / 7 회',
    bb_note: '매일 밤 20:00 정산에서 1회씩 지급',
  },
  promo: {
    done_pre: '🎁 ',
    done_post: ' 이(가) 당신의 마구간에 도착했습니다 — 오늘 밤 20:00부터 출전합니다.',
    view_horse: '말 보기 →',
    toggle: '교환 코드가 있으신가요? →',
    label: '교환 코드',
    submit: '말 받기',
    submitting: '확인 중…',
    close: '닫기',
    err_default: '교환에 실패했습니다. 코드를 확인해 주세요.',
  },
  trade: {
    save_err: '설정 저장에 실패했습니다.',
    modal_title: '말을 파는 방식을 선택하세요',
    modal_lead: '당신의 말을 어떻게 마켓에 내놓을지 선택합니다(나중에 언제든 변경할 수 있습니다).',
    smart_head: '스마트 출품',
    smart_badge: '추천',
    smart_li1: '경제 엔진이 적절한 시점에 자동 출품(하룻밤 최대 1마리, 당일 가격)',
    smart_li2: '출품 중에도 레이스에 출전합니다',
    smart_li3: '자동 구매 예약(팔리면 다음 밤 예약을 자동 생성)을 사용할 수 있습니다',
    smart_li4: '매일 조작할 필요 없음',
    smart_cta: '스마트 출품으로 시작',
    manual_head: '수동 출품',
    manual_li1: '출품할 말과 시점을 직접 선택',
    manual_li2: '출품 중에는 레이스에 출전하지 않음(Day·가치 동결)',
    manual_li3: '출품은 말마다 하루 한 번, 출품 취소는 다음 배치에 반영',
    manual_li4: '자동 구매 예약을 사용할 수 없음',
    manual_cta: '수동 출품으로 하기',
    modal_note: '어느 쪽을 선택해도 구매 예약·원장 공개 규칙은 동일합니다.',
    tile_label: 'AUTO · 매매 자동화',
    tile_note: '언제든 변경 가능',
    smart_name: '스마트 출품',
    smart_on_desc: '경제 엔진이 자동으로 출품합니다(출품 중에도 레이스에 출전)',
    smart_off_desc: 'OFF: 마켓의 “말 출품하기”에서 수동으로 출품',
    reserve_name: '자동 구매 예약',
    reserve_on_desc: '매일 밤 배치 후, 잔액 범위 내에서 구매 예약을 자동 생성(매번 이메일 안내)',
    reserve_off_desc: '스마트 출품 ON에서 사용 가능',
    max_label: '상한',
    max_unit: ' 마리',
  },
  pwa: {
    label: 'APP & 알림',
    done_text: '알림이 켜졌습니다. 매일 밤 20:00 출발을 알려드립니다.',
    enable_text: '알림을 켜면 매일 밤 20:00 출발을 알려드립니다.',
    enable_btn: '알림 켜기',
    enable_busy: '설정 중…',
    register_text: '허용은 되었지만 이 기기의 등록이 아직 완료되지 않았습니다.',
    register_btn: '등록 완료하기',
    register_busy: '등록 중…',
    blocked_text: '알림이 현재 차단되어 있습니다. 브라우저 설정에서 허용하면 다시 받을 수 있습니다.',
    ios_install_text: '홈 화면에 추가하면 출발 알림을 받습니다.',
    install_text: '홈 화면에 추가하면 앱으로 사용할 수 있습니다.',
    ios_step1_a: '공유 버튼',
    ios_step1_b: '을 탭',
    ios_step2: '“홈 화면에 추가”',
    ios_step3: '앱을 열고 알림 켜기',
    install_steps: '브라우저 메뉴에서 “홈 화면에 추가” / “앱 설치”를 선택하면 앱으로 실행할 수 있습니다.',
    install_hint: '홈 화면에 추가하면 한 번의 탭으로 열 수 있습니다.',
    add_app: '+ 앱 추가',
  },
  account: {
    title: '계정',
    st_racing: '출전 중',
    st_listed: '출품 중',
    st_champions: '챔피언',
    st_burned: '소멸',
    st_pending: '배정 대기 예약',
    email_unset: '(이메일 미설정 — 지갑 로그인)',
    reg_label: '가입 ',
    play_tpl: '플레이 {n}일째',
    id_label: 'ID ',
    record_label: '당신의 기록',
    stat_note_a: '숫자를 탭하면 각 페이지로 이동합니다. 보상 수령 현황은 ',
    stat_note_b: ', 입출금 내역은 ',
    stat_note_c: ' 에서 확인할 수 있습니다.',
    settings_label: '설정',
    linking_label: '로그인 방법 연동',
    linking_lead: '연동하면 어떤 로그인 방법으로도 같은 계정(잔액·말)에 접근할 수 있습니다. 지갑 하나는 계정 하나에만 연동할 수 있습니다.',
    support_label: '지원',
    support_lead: '게임 규칙·계정·입출금 등 궁금한 점이 있으면 언제든 문의하세요. 등록하신 이메일로 답변드립니다.',
    support_guide: '이용 방법 보기 →',
    support_contact: '문의 양식으로 →',
  },
  stableName: {
    unset: '마구간 이름 미설정 — 설정하면 거래와 조직도에 이 이름이 표시됩니다',
    set_btn: '마구간 이름 설정',
    change_btn: '변경',
    placeholder: '예: 유성 마구간',
    saving: '저장 중…',
    save: '저장',
    cancel: '취소',
    hint: '2〜20자 · 모든 사용자에게 공개 · 하루 한 번 변경',
    err: '마구간 이름을 저장하지 못했습니다.',
  },
  linking: {
    login_id: '로그인 ID(Supabase)',
    loading: '불러오는 중…',
    unlink: '해제',
    last_id: '(마지막 로그인 ID는 해제할 수 없습니다)',
    link_google: 'Google 연동',
    wallet_h: '지갑',
    no_wallet: '연동된 지갑이 없습니다.',
    link_metamask: '🦊 MetaMask 연동',
    err_no_metamask: 'MetaMask를 찾을 수 없습니다. 확장 프로그램을 설치해 주세요.',
    err_no_address: '지갑 주소를 가져오지 못했습니다',
    err_link_wallet: '지갑 연동에 실패했습니다',
    linked_tpl: '지갑 {addr} 을(를) 연동했습니다',
    err_unlink: '해제에 실패했습니다',
  },
  contact: {
    title: '문의',
    lead: '게임 규칙·계정·입출금 등 무엇이든 편하게 물어보세요. 지원팀이 확인 후 등록하신 이메일로 답변드립니다.',
    faq_label: '자주 묻는 질문',
    faq_burn: 'BURN이란?',
    faq_buy: '구매·판매의 구조',
    faq_deposit: '입금이 반영되지 않음',
    faq_champion: '챔피언 보상은 언제?',
    faq_team: '팀(서포트 보너스)',
    cat_rules: '게임 규칙',
    cat_money: '입출금',
    cat_trade: '구매/판매',
    cat_team: '팀',
    cat_other: '기타',
    cat_label: '카테고리(선택)',
    subject_label: '제목',
    subject_ph: '예: BURN에 대해 알려주세요',
    body_label: '문의 내용',
    body_ph: '가능한 한 구체적으로 작성해 주시면 정확히 안내해 드릴 수 있습니다',
    sending: '전송 중…',
    send: '보내기',
    err_send: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    done_title: '전송했습니다',
    done_a: '문의해 주셔서 감사합니다. 지원팀이 확인 후 ',
    done_bold: '등록하신 이메일',
    done_b: '로 답변드립니다.',
    done_guide: '이용 방법 보기 →',
    done_dashboard: '대시보드로 →',
    aside_reply_title: '답변 안내',
    li1_bold: '등록하신 이메일',
    li1_rest: ' 로 답변드립니다(이 페이지에는 답변이 표시되지 않습니다)',
    aside_li2: '내용에 따라 확인에 시간이 걸릴 수 있습니다',
    aside_li3: '잔액·거래의 구체적인 수치는 사이트 내 각 페이지에서 확인할 수 있습니다',
    aside_mail_title: '이메일로도 접수합니다',
  },
  notif: {
    title: '알림',
    unread_tpl: '안 읽음 {n}',
    read_note: '열면 읽음 처리됩니다 · 탭하면 관련 페이지로',
    types: {
      RACE_RESULT_READY: '레이스 결과', HORSE_BURNED: 'Burn', REVENGE_BUFF_GENERATED: 'Revenge Buff',
      BUYBACK_PAYMENT_PAID: '챔피언 보상', BUYBACK_COMPLETED: '챔피언 보상', MEMORIAL_NFT_MINTED: '기념 NFT',
      SUPPORT_BONUS_PAID: '서포트 보너스', SUPPORT_CELEBRATION_PAID: '축하금', ASSIGNMENT_COMPLETED: '말 배정',
      HORSE_SOLD: '판매 성사', AUTO_LISTED: '자동 출품', AUTO_RESERVED: '자동 구매 예약',
      MARKETPLACE_LOCKED: '정산 중', MARKETPLACE_REOPENED: '재개', DEPOSIT_CONFIRMED: '입금',
      WITHDRAWAL_COMPLETED: '출금', WITHDRAWAL_FAILED: '출금 오류', TRAINING_COMPLETED: '조련',
      ITEM_DROPPED: '아이템', ITEM_GIFT_RECEIVED: '선물',
    },
    type_default: '알림',
    cats: { race: '레이스', trade: '매매', reward: '보상', money: '입출금', other: '기타' },
    cat_all: '전체',
    digest_title_tpl: '{d} 다이제스트',
    count_tpl: '{n}건',
    digest_results: '결과 보기 →',
    digest_history: '거래 내역 →',
    search_ph: '알림 검색…',
    unread_only: '안 읽은 알림만',
    count_all_tpl: '전체 {n}건',
    count_some_tpl: '{total}건 중 {shown}건',
    empty_a: '아직 알림이 없습니다.',
    empty_b: '레이스 결과·Burn·챔피언 보상·매매 등이 여기에 도착합니다.',
    empty_filtered: '조건에 맞는 알림이 없습니다.',
    prev: '← 이전',
    next: '다음 →',
    min_tpl: '{n}분 전',
    hour_tpl: '{n}시간 전',
    day_tpl: '{n}일 전',
  },
  champion: {
    hero_note: '활성 사용자 10,000명 도달 시 개막',
    sound_on_aria: '사운드 끄기',
    sound_off_aria: '사운드 켜기',
    rewards_sub: '나의 챔피언 보상',
    rewards_note_a: 'Day7을 완주한 말은 챔피언으로서 ',
    rewards_note_b: ' 의 챔피언 보상을 받고 기념 NFT가 됩니다. 보상은 7회로 나뉘어 매일 밤 정산 시 자동 지급됩니다.',
    hall_sub: 'Day7을 완주한 모든 말',
    hall_count_tpl: '누적 대관 {n}마리',
    hall_sample: '샘플 표시(임시 데이터) — 첫 챔피언이 탄생하면 여기에 실제 말이 새겨집니다.',
    filter_all: '전체',
    sort_recent: '최신순',
    sort_oldest: '오래된순',
    sort_name: '이름순',
    sort_aria: '정렬',
    crowned: '대관',
    owner_label: '소유자',
    league_desc: 'Day7을 완주한 챔피언 말만 출전할 수 있는 주간 정상 리그. 활성 사용자가 10,000명에 도달하면 개막하며, 데일리 더비와 독립된 경제로 운영됩니다.',
    ladder_title: '7 CLASSES · 승급 래더',
    class_win_tpl: '{n}승',
    weekly_races_v: '주 1회 개최 · 레이스당 최대 18마리. 등록된 챔피언 말 수에 따라 레이스가 자동 편성됩니다.',
    prize_pool_v: '매주 아이템 상점 매출의 1%가 상금 풀로. 승자 독식이 아니라 여러 출전마에게 분배됩니다.',
    retirement_v: 'G1 제패 또는 리그 10회 출전 시 명예 은퇴. 은퇴한 말은 전당에 영구히 새겨집니다.',
    fanpass_v: '멀티 카메라 앵글과 프리미엄 관전을 해제. 팬 참여·랭킹 등의 기능도 계획 중입니다.',
    bv_title: '챔피언 보상',
    bv_intro_a: 'Day7을 완주한 말은 챔피언으로서 ',
    bv_intro_bold1: '200 USDT',
    bv_intro_b: ' 의 챔피언 보상을 받습니다. 다음 날(D+1)부터 ',
    bv_intro_bold2: '7회',
    bv_intro_c: '로 나뉘어 자동 지급됩니다. 7회 완료 시 ',
    bv_intro_bold3: '기념 NFT',
    bv_intro_d: '(Polygon / ERC-721)가 발행됩니다.',
    card_day7_tpl: 'Day7 달성 {d}',
    status_done: '완료',
    status_progress: '진행 중',
    card_horse_tpl: '말 {id}',
    count7_tpl: '{p} / 7 회',
    detail_arrow: '상세 →',
    empty_a: '아직 챔피언 보상이 없습니다.',
    empty_b: '말이 Day7을 완주하면 챔피언이 되고, 보상(200 USDT)이 여기에 표시됩니다.',
    crumb: '← 챔피언 보상 목록',
    detail_title_tpl: '챔피언 보상 {d}',
    horse_link_tpl: '말 {id} →',
    progress_k: '수령 진행 · PROGRESS',
    of7: ' / 7 회',
    total_received_k: '총액 · 수령 완료',
    schedule_label: '지급 일정 · 7 PAYMENTS',
    due_tpl: '예정 {d}',
    paid_tpl: ' · 지급 {t}',
    status_paid: 'PAID · 지급 완료',
    status_next: '다음',
    status_pending: '예정',
    detail_note: '매일 밤 20:00 정산에서 1회씩 지급됩니다. 7회 모두 완료되면 이 말의 기념 NFT(Polygon / ERC-721)가 발행됩니다.',
  },
  support: {
    self: '나',
    unit_people: '명',
    unit_horses: '마리',
    map_cta: '조직도 열기 →',
    lead: '당신의 조직에서 챔피언(7일 완주)이 탄생하면, 이를 뒷받침한 네트워크에 축하금이 지급됩니다. 초대만으로는 발생하지 않습니다.',
    rate_k: 'STARTER RATE · 나의 추천 단가',
    rate_who: '직접 초대한 동료의 챔피언 한 마리마다 당신에게',
    gauge_starter: '스타터',
    gauge_leader: '리더',
    gauge_sub_a: '조직이 성장할수록 단가는 8.00 → 3.00 으로 부드럽게 이동합니다(조직 50,000 USDT에서 3.00). 단가×조직 규모는 일정하도록 설계 — ',
    gauge_sub_bold: '조직이 커져도 직접 몫의 합계는 줄지 않습니다.',
    boost_tpl: '스타터 부스트 ×{x}',
    standard: '스탠다드',
    rate_note: '적용 단가는 챔피언이 탄생한 밤의 단가이며, 매일 20:00 (GMT+8)에 재평가됩니다.',
    tier_hero_k: 'SUPPORT TIER · 현재 티어',
    next_maintain_tpl: 'T{n}까지 조직 {v} USDT 이상 유지',
    next_direct_tpl: '(+직접 {d} 이상)',
    tier_max: '최상위 티어에 도달했습니다',
    vol_a: '조직(하위 7단) 현역마 현재 가치: ',
    vol_b: ' · 직접 초대분: ',
    vol_c: ' · 매일 20:00 (GMT+8)에 재평가(밑돌면 자동으로 내려갑니다)',
    action_k: 'NEXT · 다음 행동',
    action_pool_tpl: '배치 대기 중인 동료가 {n}명 있습니다. 배치하면 네트워크에 합류하고 티어 유지에 도움이 됩니다.',
    action_grow_tpl: '다음 티어 해제는 조직 {v} USDT 부터. 동료를 초대해 네트워크 전체를 키우세요.',
    action_max: '모든 티어가 해제되었습니다. 네트워크 유지를 이어가세요.',
    action_btn_place: '지도에서 배치하기',
    action_btn_view: '조직도 보기',
    kpi_total: '누적 서포트 보너스',
    kpi_total_sub_tpl: '{n}회 수령',
    kpi_network: '네트워크',
    kpi_network_sub: '당신이 뒷받침하는 동료',
    kpi_pool: '배치 대기',
    kpi_pool_place: '지도에서 배치하기 →',
    kpi_pool_none: '배치 대기 없음',
    tier_table_h: '티어와 지급액',
    tier_meta: '챔피언 한 마리 탄생 시, 축하금(T1=나의 추천 단가 3〜8 / T2=2 / T3〜7=각 1 USDT)이 상위 7티어에 분배됩니다.',
    tier_cond_always: '항상',
    tier_cond_org_tpl: '조직 ≥ {v}',
    tier_cond_direct_tpl: ' +직접 ≥ {d}',
    t1_range: ' (3〜8)',
    tier_foot: '조직 볼륨 = 조직도에서 당신 하위 7단(서포트 보너스가 닿는 범위)의 현역마 가치 합계. T5 이상은 「직접 초대한 동료의 현역마 가치」도 함께 필요합니다. 가로 폭(직속 계열 수)은 무제한.',
    invite_title: '초대 링크 · INVITE',
    invite_code_label: '나의 코드 ',
    invite_copied: '✓ 복사했습니다',
    invite_copy: '링크 복사',
    invite_note: '초대만으로는 보너스가 발생하지 않습니다. 서포트 보너스는 당신의 네트워크 안에서 챔피언(7일 완주)이 탄생했을 때에만 정해진 금액(T1=추천 단가 3〜8 / T2=2 / T3〜7=각 1 USDT) 범위에서 축하금으로 지급됩니다. 금액·빈도는 보장되지 않습니다.',
    hist_h: '서포트 보너스 내역',
    hist_empty: '아직 서포트 보너스가 없습니다.',
    hist_why: '조직의 챔피언 탄생',
    toolbar_stats_tpl: '멤버 {members}명 · 배치 대기 {pool}명 · 최심 T{depth}',
    mode_map: '지도',
    mode_list: '목록',
    expand_all: '모두 펼치기',
    collapse_all: '모두 접기',
    map_search_ph: '멤버 찾기(표시명 일부 또는 이메일 완전 일치)',
    map_search_aria: '조직 내 멤버 검색',
    map_search_btn: '검색',
    map_search_notfound: '당신의 조직(하위 7단)에서 찾을 수 없습니다',
    place_select_a: ' 의 배치 위치 선택 중 — ',
    place_hint_map: '지도의 노드(나 또는 하위 멤버)를 클릭',
    place_hint_list: '목록의 멤버를 탭',
    place_select_b: '하세요',
    cancel: '취소',
    you_crumb: '★ 나',
    focus_tier_tpl: 'TIER {t} · ',
    focus_meta_tpl: '직속 {direct}명 · 하위 {sub}명',
    detail_btn: '상세',
    place_here: '여기에 배치',
    drill_empty: '이 아래에는 아직 아무도 없습니다.',
    child_horse_tpl: '말{h}마리 · ',
    child_meta_tpl: '직속{kids}명 · 하위{sub}명',
    drill_open_aria: '이 계열 열기',
    empty_tree: '아직 아무도 배치되지 않았습니다. 동료를 초대해 첫 사람을 배치하세요.',
    node_collapsed_tpl: '+{n}명 접힘',
    node_series_tpl: '직속 {n}계열',
    node_direct_tpl: '직속 {n}명',
    toggle_expand_aria: '펼치기',
    toggle_collapse_aria: '접기',
    node_place_hint_tpl: '여기에 배치 · T{n}',
    dock_title: '배치 대기 중인 동료',
    dock_hint: '배치는 확정 시 변경 불가',
    dock_empty: '배치 대기 중인 동료가 없습니다. 대시보드에서 초대 링크를 공유하세요.',
    pool_joined_tpl: '참가 {d}',
    pool_place_btn: '배치',
    m_sub_tpl: 'TIER {t}(당신으로부터 {t}단째)',
    m_placed_tpl: ' · 배치 {d}',
    m_active_horses: '현역마',
    m_horses_value: '현역마 현재 가치',
    m_burns: 'BURN 횟수(누적)', unit_times: '회',
    m_items: '아이템 사용(누적)', unit_items: '개',
    m_direct: '직속',
    m_subtree: '하위(7단 이내)',
    m_note: '현역마 현재 가치는 이 멤버가 당신의 조직 볼륨(티어 해제)에 기여한 몫입니다.',
    m_note_loading: ' 가져오는 중…',
    close: '닫기',
    confirm_title: '배치 확정',
    confirm_body_a: ' 을(를) ',
    confirm_target_self: '당신의 바로 아래(TIER 1)',
    confirm_target_tpl: '{name} 의 바로 아래(TIER {t})',
    confirm_body_b: ' 에 배치합니다.',
    warn_a: '⚠ 배치는 한 번 확정하면 ',
    warn_bold: '다시는 변경할 수 없습니다',
    warn_b: '. 재배치 요청은 받을 수 없습니다(시스템 예외 처리는 운영 관리자만).',
    confirm_check: '변경할 수 없음을 이해했습니다',
    reselect: '배치 위치 다시 선택',
    placing: '배치 중…',
    confirm_btn: '이 위치로 확정',
    err_place: '배치에 실패했습니다.',
    demo_note: '샘플 조직을 표시 중(임시 데이터·약 60명) — 초대한 동료가 늘어나면 여기는 자동으로 당신의 실제 조직으로 전환됩니다.',
  },
  ledger: {
    title: '원장 · LEDGER',
    intro: '매일 밤의 레이스와 매매의 모든 기록을 그대로 공개합니다. 사용자는 익명 ID로 표시됩니다. 매일의 「전체 결과와 검증」에서 공개 시드로 재계산(커밋-리빌)하여 결과가 조작 불가능함을 누구나 확인할 수 있습니다.',
    loading: '원장을 불러오는 중…',
    empty_no_races: '아직 확정된 레이스가 없습니다. 첫 레이스가 확정되면 모든 기록이 여기에 공개됩니다.',
    dow: ['일', '월', '화', '수', '목', '금', '토'],
    month_tpl: '{y}년 {m}월',
    date_full_tpl: '{y}년 {m}월 {d}일',
    prev_month_aria: '이전 달',
    next_month_aria: '다음 달',
    weather: { SUNNY: '맑음', CLOUDY: '흐림', RAIN: '비', STORM: '폭풍' },
    track: { FAST: '고속', GOOD: '양호', SOFT: '약간 무거움', HEAVY: '불량' },
    surface: { TURF: '잔디', DIRT: '더트' },
    t_participants: '출전',
    t_survived: '생존',
    t_burn: 'BURN',
    t_day7: 'DAY7 완주',
    t_matched: '체결',
    t_matched_vol: '체결 총액 USDT',
    t_mints: '신규 발행',
    t_burn_rate: '적용 BURN율(시드 유래)',
    csv_daily: '이 날의 CSV',
    csv_generating: '생성 중…',
    csv_monthly: '월간 CSV',
    verify_link: '전체 결과와 검증 →',
    trades_label: '체결 기록(익명) · SETTLED TRADES',
    trades_loading: '불러오는 중…',
    trades_empty: '이 날의 체결이 없습니다.',
    mint_label_day0: '신규 발행(DAY0)',
    p2p_day_tpl: '(DAY{day})',
    badge_mint: '신규 발행',
    more_tpl: '외 {n}건 — 전체는 「이 날의 CSV」에 포함됩니다.',
  },
  guide: {
    h1: '이용 가이드',
    lead: 'Seven Days Derby는 NFT 경주마와 함께 **7일간의 서바이벌 레이스**를 치르는 게임입니다. 이 페이지에서는 가입부터 챔피언 획득까지의 흐름을 초보자용으로 그림과 함께 설명합니다.',
    hero_title: '7일을 완주하라',
    hero_p: '매일 밤 20:00(말레이시아 시간), 모든 말이 일제히 달립니다. 살아남은 말은 날마다 가치가 오르고, 7일째를 완주하면 200 USDT 챔피언 보상과 기념 NFT를 받습니다.',
    toc_aria: '목차',
    back_top: '↑ 페이지 상단으로',
    sec_register: '계정 등록',
    sec_buy: '말 구매',
    sec_sell: '말 판매(마켓)',
    sec_race: '매일 밤의 레이스',
    sec_champion: 'Day7 달성 — 챔피언',
    sec_team: 'TEAM 보너스와 조직 만들기',
    sec_items: '아이템',
    sec_wallet: '입금・출금',
    sec_contact: '문의',
    reg_p: '로그인은 **Google 계정**으로 합니다. 등록도 로그인도 같은 버튼이며 비밀번호는 필요 없습니다. 첫 로그인에서 당신의 마구간이 자동으로 개설됩니다.',
    reg_box_t: 'Google로 로그인',
    reg_box_d: '잔액・말・내역은 모두 이 하나의 소유자 계정에 연결됩니다',
    reg_tip: '친구의 초대 링크로 등록하면 그 친구의 TEAM(응원 조직)에 합류합니다(⑥ 참조).',
    buy_p1: '말은 마켓플레이스에서 「구매 예약」을 하여 맞이합니다. 당신의 말은 매일 밤 20:00(말레이시아 시간) 배치에서 결정되며, DNA로부터 **외형・이름・능력이 고유하게 생성**됩니다(이후 변경 불가・완전 결정론).',
    buy_b1_t: '구매 예약', buy_b1_d: '한 마리당 최대 177.16 USDT 잠금\n(가격표 상한)',
    buy_b2_t: '20:00 배치', buy_b2_d: '당신의 말이 결정',
    buy_b3_t: 'Day0 민트', buy_b3_d: '청구 102 USDT\n(가격100+수수료2)',
    buy_b4_t: '차액 자동 환불', buy_b4_d: '잠금액과의 차액이 잔액으로 돌아옵니다',
    buy_p2: '마켓에서 **다른 소유자의 말(Day1〜Day6)**도 살 수 있습니다. 일수가 진행된 말일수록 가격표가 올라갑니다:',
    buy_warn: '**중요 리스크:** 말은 매일 밤 레이스에서 **BURN(NFT 소멸)될 수 있습니다**. 소멸된 말과 지불한 대금은 돌아오지 않습니다. 반드시 여유 자금 범위에서 즐겨 주세요.',
    sell_p: 'Day1〜Day6의 말은 당신의 판단으로 **마켓에 출품**할 수 있습니다. 「챔피언까지 달리게 할지, 도중에 팔아 이익을 확정할지」— 이 수 싸움이 Seven Days Derby의 묘미입니다.',
    sell_b1_t: '출품', sell_b1_d: '말 상세 페이지에서\nDay1〜6만',
    sell_b2_t: '구매자 결정', sell_b2_d: '오늘 밤 배치에서 성립',
    sell_b3_t: '판매 대금 수령', sell_b3_d: '말은 새 소유자 아래에서 남은 일정을 달립니다',
    sell_tip: '출품・구매에는 매일 밤 마감이 있습니다(레이스 처리 중에는 마켓이 일시 잠깁니다).',
    race_p1: '매일 밤 **20:00(말레이시아 시간)**, 그날의 모든 말이 일제히 달립니다. 레이스 결과로 말은 **「생존」 또는 「BURN」**으로 나뉘며, 생존한 말은 Day가 하나 진행됩니다.',
    tl1_t: '낮', tl1_v: '아이템 적용・매매・작전 타임',
    tl2_t: '레이스 전', tl2_v: '마감(마켓・아이템 잠금)',
    tl3_t: '20:00 MYT', tl3_v: '일제 레이스(Daily Derby에서 관전)',
    tl4_t: '직후', tl4_v: '결과 확정: 생존→다음 Day로 / BURN',
    race_p2: '**레이스는 누구도 조작할 수 없습니다.** 결과는 사전에 커밋(봉인)된 난수 시드로부터 결정론적으로 계산되고, 레이스 후 시드가 공개됩니다. 누구나 결과를 다시 계산해 검증할 수 있는 「커밋-리빌 방식」입니다. 운영도 당신도 결과를 바꿀 수 없습니다.',
    race_p3: '**매일 밤 성적 하위권 말은 BURN(소멸)됩니다.** 몇 마리가 달리고, 몇 마리가 살아남고, 몇 마리가 BURN됐는지의 전 기록은 **「원장」 페이지**에 매일 공개되며, CSV로 내려받아 누구나 검증・집계할 수 있습니다.',
    race_p4: '레이스 연출의 마지막에 **「내일의 예보」**(날씨・주로・코스)가 발표됩니다. 예보는 사전에 커밋된 시드로부터 기계적으로 생성되는 **적중률 약 70%의 참고 정보**로, 결과를 보장하지 않습니다. 예보에 맞춰 아이템을 준비할지는 당신에게 달려 있습니다.',
    race_tip: 'RACE 페이지의 「Daily Derby」에서 매일 밤 레이스를 라이브 풍 연출로 관전할 수 있습니다. 자신의 말의 질주에는 전용 하이라이트가 들어갑니다.',
    champ_p1: '7일 밤의 레이스를 모두 살아남은 말은 **챔피언**입니다. **200 USDT 챔피언 보상**(다음 날부터 7회로 나눠 자동 지급)과 전당 입성의 **기념 NFT**(Polygon / ERC-721)를 획득합니다.',
    ladder_survive: '생존', ladder_day7_v: '200 USDT + 기념 NFT',
    champ_p2: '챔피언 실적과 보상 일정은 **CHAMPION 페이지**에 모여 있습니다. 당신의 챔피언 보상 지급 현황도, 전당(Hall of Champions)도 여기서 확인할 수 있습니다.',
    champ_tip: '활성 사용자가 10,000명에 도달하면 챔피언 말만 출전할 수 있는 주간 정상 리그 「Champion League」가 개막합니다.',
    team_p1: '당신 전용의 **초대 링크**(TEAM 페이지에서 확인)로 친구가 등록하면 당신의 **응원 조직(TEAM)**에 합류합니다. 친구가 다시 친구를 초대하면 조직은 아래로 넓어집니다(최대 7단).',
    tree_svg_aria: '조직 트리: 나 → 친구A/B/C → 그들의 친구들',
    tree_you: '나', tree_fa: '친구A', tree_fb: '친구B', tree_fc: '친구C', tree_fa_sub: 'A의 친구', tree_fb_sub: 'B의 친구',
    team_p2: '조직 멤버의 말이 **챔피언(7일 완주)**이 되면 뒷받침한 조직에 **서포트 보너스**가 축하금으로 분배됩니다(한 마리당 합계 10 USDT・상위 7단). 받을 수 있는 단수(티어)는 **조직 전체의 활동량**에 따라 해제됩니다 — 즉 「자신이 직접 초대한 인원」만이 아니라 **조직을 키우는 것**이 열쇠입니다.',
    team_b1_t: '초대 링크 공유', team_b1_d: 'TEAM 페이지에서 획득',
    team_b2_t: '조직이 성장', team_b2_d: '친구의 친구까지 확장(7단)',
    team_b3_t: '챔피언 탄생', team_b3_d: '조직으로부터 축하금(해제된 티어까지)',
    team_warn: '서포트 보너스는 조직에서의 챔피언 탄생에 따라 변동합니다. **수익의 약속・보장은 일절 없습니다.** 자세한 조건과 현재 티어 상황은 TEAM 페이지에서 확인해 주세요.',
    items_p1: 'ITEMS 페이지의 상점에서 **30종의 아이템**을 구매할 수 있습니다(베이식 / 스탠다드 / 프리미엄 3밴드). 또한 말이 BURN될 때 일정 확률로 드롭되는 **한정 아이템 5종**은 상점에서 살 수 없습니다.',
    items_b1_t: '아이템 입수', items_b1_d: '상점 구매 / BURN 드롭 / 선물 수령',
    items_b2_t: '레이스 전 말에 적용', items_b2_d: '말 상세 페이지에서. 오늘 밤 점수에 영향(상한 있음)',
    items_b3_t: '레이스 조건(날씨・주로・코스)', items_b3_d: '아이템 적성과 맞물리면 최대 ×1.5(시드에서 결정・검증 가능)',
    items_p2: '각 아이템에는 **적성**(잔디 명수・더트 명수・비의 귀신・악조건의 귀신 등)이 있어, 매일 밤의 **레이스 조건(날씨・주로・코스)**과 맞물리면 효과가 최대 ×1.5까지 오르고, 반대 조건에서는 ×0.5까지 둔해집니다. 조건은 레이스 시드로 정해지므로 **운영이 조작할 수 없습니다**. 레이스 후 누구나 검증할 수 있습니다.',
    items_tip: '아이템은 다른 소유자에게 **이메일 지정으로 선물**할 수 있습니다(일부 제외). 동료의 승부처에 각설탕을 선물하는 — 그런 활용법도 있습니다.',
    wallet_p: '게임 내 화폐는 **USDT(Polygon 네트워크)**입니다. 모든 것은 WALLET 페이지에서 완결됩니다.',
    w_b1_t: '입금', w_b1_d: '당신 전용 입금 주소로 USDT(Polygon)를 송금',
    w_b2_t: '체인 확인', w_b2_d: '소정의 승인 수 이후 잔액에 반영',
    w_b3_t: '잔액 반영', w_b3_d: '말・아이템 구매에 사용 가능',
    w_b4_t: '출금 신청', w_b4_d: 'WALLET 페이지에서 대상 주소와 금액을 지정',
    w_b5_t: '심사', w_b5_d: '고액 출금은 여러 명의 승인이 필요해 시간이 걸릴 수 있습니다',
    w_b6_t: '송금', w_b6_d: '당신의 지갑으로 USDT가 도착합니다',
    wallet_warn: '**반드시 Polygon 네트워크의 USDT**를 사용하세요. 다른 네트워크나 토큰으로 보내면 자산을 잃을 수 있습니다.',
    contact_p: '모르는 점이 있으면 언제든 지원팀에 문의하세요. 등록하신 이메일로 답변드립니다.',
    c_b1_t: '문의 양식', c_b1_d: '내비게이션의 「문의」에서(추천)',
    c_b2_t: '이메일',
    c_box_t: 'AI+지원팀이 확인 후 답변', c_box_d: '글로벌 지원 — 문의하신 언어로 답변합니다(한국어/영어 등)',
    contact_link: '→ 문의 양식 열기',
  },
};

const ms: AppDict = {
  common: { horses_unit: ' ekor', cases_unit: '' },
  nav: { notifications: 'Notifikasi', account: 'Akaun', guide: 'Panduan', contact: 'Hubungi', logout: 'Log keluar' },
  dash: {
    result_label: 'Keputusan malam tadi',
    result_detail: 'Butiran perlumbaan →',
    res_survived: 'Terselamat',
    res_burned: 'Burn (musnah)',
    res_best_tpl: 'Kedudukan terbaik / daripada {n}',
    pill_burn: 'Burn',
    pill_survived_tpl: 'Terselamat · Day {d}',
    result_empty: 'Belum ada keputusan perlumbaan. Malam ini 20:00, kuda anda lahir dalam perlumbaan pertamanya.',
    tonight_label: 'Perlumbaan malam ini',
    countdown_to: 'Ke pelepasan',
    tonight_note: 'Kuda berkedudukan terendah di-Burn (musnah). Yang terselamat naik nilai setiap hari. Setiap rekod diterbitkan pada lejar.',
    watch_show: 'Tonton pertunjukan malam ini →',
    tasks_label: 'Tugas hari ini',
    untrained_suffix: ' belum dilatih',
    pending_suffix: ' menunggu penetapan',
    tasks_prepare_items: 'Sediakan item →',
    tasks_train: 'Latih',
    tasks_adopt: 'Dapatkan kuda',
    tasks_sub: 'Latih sekali sehari, sehingga rekod malam ini dikunci. Yang menunggu penetapan disahkan dalam perlumbaan malam ini.',
    tasks_done_text: 'Tugas hari ini selesai. Kini tunggu sahaja pelepasan 20:00.',
    balance_k: 'Baki',
    balance_avail: 'USDT tersedia',
    balance_locked_tpl: ' · dikunci {v}',
    stable_val_k: 'Nilai kandang',
    stable_val_s_tpl: 'USDT · nilai semasa {n} ekor',
    buff_none: 'Tiada',
    buff_active_s: 'Ditambah automatik pada penetapan seterusnya',
    buff_none_s: 'Bonus perlumbaan seterusnya daripada Burn',
    stable_mine: 'Kandang Saya',
    stable_sub_tpl: 'STABLE {n} · nilai {v} USDT',
    stable_adopt: 'Dapatkan kuda ▶',
    stable_all: 'Semua →',
    stable_empty_pending_tpl: '{n} menunggu penetapan — disahkan dalam perlumbaan malam ini.',
    stable_empty_none: 'Tiada kuda berlumba. Sertai derby malam ini melalui “Dapatkan kuda ▶” di atas.',
    train_yes: 'Dilatih',
    train_no: 'Belum',
    bb_title: 'Champion Reward sedang diterima',
    bb_title_count_tpl: ' · {n} ekor',
    bb_per: 'Menerima 200 USDT dalam 7 bayaran',
    bb_count_tpl: '{p} / 7',
    bb_note: 'Satu bayaran setiap malam pada penyelesaian 20:00',
  },
  promo: {
    done_pre: '🎁 ',
    done_post: ' telah tiba di kandang anda — berlumba dari 20:00 malam ini.',
    view_horse: 'Lihat kuda →',
    toggle: 'Ada kod tebus? →',
    label: 'Kod tebus',
    submit: 'Terima kuda',
    submitting: 'Menyemak…',
    close: 'Tutup',
    err_default: 'Penebusan gagal. Sila semak kod.',
  },
  trade: {
    save_err: 'Gagal menyimpan tetapan.',
    modal_title: 'Pilih cara menjual kuda anda',
    modal_lead: 'Pilih cara kuda anda dibawa ke pasaran (boleh diubah bila-bila masa).',
    smart_head: 'Penyenaraian pintar',
    smart_badge: 'Disyorkan',
    smart_li1: 'Enjin ekonomi menyenaraikan pada masa yang baik (maksimum 1 semalam, pada harga hari itu)',
    smart_li2: 'Kuda anda terus berlumba semasa disenaraikan',
    smart_li3: 'Tempahan beli automatik tersedia (mencipta tempahan malam esok apabila terjual)',
    smart_li4: 'Tiada tindakan harian diperlukan',
    smart_cta: 'Mula dengan Penyenaraian pintar',
    manual_head: 'Penyenaraian manual',
    manual_li1: 'Anda pilih kuda mana untuk disenaraikan, dan bila',
    manual_li2: 'Kuda yang disenaraikan tidak berlumba (Day dan nilainya dibekukan)',
    manual_li3: 'Satu tindakan senarai bagi setiap kuda sehari; penyahsenaraian berkuat kuasa pada kelompok seterusnya',
    manual_li4: 'Tempahan beli automatik tidak tersedia',
    manual_cta: 'Guna Penyenaraian manual',
    modal_note: 'Walau apa pun pilihan anda, peraturan tempahan beli dan lejar adalah sama.',
    tile_label: 'AUTO · automasi dagangan',
    tile_note: 'Ubah bila-bila masa',
    smart_name: 'Penyenaraian pintar',
    smart_on_desc: 'Enjin ekonomi menyenaraikan secara automatik (kuda terus berlumba semasa disenaraikan)',
    smart_off_desc: 'OFF: senaraikan secara manual dari “Senaraikan kuda” di pasaran',
    reserve_name: 'Tempahan beli automatik',
    reserve_on_desc: 'Selepas setiap kelompok malam, mencipta tempahan beli dalam had baki anda (dimaklumkan melalui e-mel setiap kali)',
    reserve_off_desc: 'Tersedia apabila Penyenaraian pintar ON',
    max_label: 'Had',
    max_unit: ' ekor',
  },
  pwa: {
    label: 'APP & Notifikasi',
    done_text: 'Notifikasi dihidupkan. Setiap malam 20:00 kami maklumkan pelepasan.',
    enable_text: 'Hidupkan notifikasi dan kami maklumkan pelepasan 20:00 setiap malam.',
    enable_btn: 'Hidupkan notifikasi',
    enable_busy: 'Menyediakan…',
    register_text: 'Kebenaran diberi, tetapi peranti ini belum didaftarkan.',
    register_btn: 'Lengkapkan pendaftaran',
    register_busy: 'Mendaftar…',
    blocked_text: 'Notifikasi kini disekat. Benarkan dalam tetapan pelayar untuk menyambung semula.',
    ios_install_text: 'Tambah ke skrin utama untuk menerima notifikasi pelepasan.',
    install_text: 'Tambah ke skrin utama untuk menggunakannya sebagai aplikasi.',
    ios_step1_a: 'Ketik butang kongsi',
    ios_step1_b: '',
    ios_step2: '“Tambah ke Skrin Utama”',
    ios_step3: 'Buka aplikasi dan hidupkan notifikasi',
    install_steps: 'Dari menu pelayar, pilih “Tambah ke Skrin Utama” / “Pasang aplikasi” untuk melancarkannya sebagai aplikasi.',
    install_hint: 'Tambah ke skrin utama untuk membukanya dengan satu ketikan.',
    add_app: '+ Tambah aplikasi',
  },
  account: {
    title: 'Akaun',
    st_racing: 'Berlumba',
    st_listed: 'Disenaraikan',
    st_champions: 'Juara',
    st_burned: 'Musnah',
    st_pending: 'Tempahan menunggu',
    email_unset: '(Tiada e-mel — log masuk dompet)',
    reg_label: 'Menyertai pada ',
    play_tpl: 'Hari ke-{n} bermain',
    id_label: 'ID ',
    record_label: 'Rekod anda',
    stat_note_a: 'Ketik nombor untuk ke halamannya. Semak bayaran ganjaran di ',
    stat_note_b: ', dan sejarah deposit/pengeluaran di ',
    stat_note_c: '.',
    settings_label: 'Tetapan',
    linking_label: 'Pautkan kaedah log masuk anda',
    linking_lead: 'Setelah dipautkan, mana-mana kaedah log masuk mencapai akaun yang sama (baki dan kuda). Satu dompet hanya boleh dipautkan ke satu akaun.',
    support_label: 'Sokongan',
    support_lead: 'Soalan tentang peraturan, akaun, atau deposit/pengeluaran — hubungi kami bila-bila masa. Kami membalas ke e-mel berdaftar anda.',
    support_guide: 'Baca panduan →',
    support_contact: 'Ke borang hubungi →',
  },
  stableName: {
    unset: 'Nama kandang belum ditetapkan — tetapkan dan nama ini muncul pada dagangan dan peta organisasi',
    set_btn: 'Tetapkan nama kandang',
    change_btn: 'Ubah',
    placeholder: 'cth. Kandang Meteor',
    saving: 'Menyimpan…',
    save: 'Simpan',
    cancel: 'Batal',
    hint: '2–20 aksara · terbuka kepada semua pengguna · satu perubahan sehari',
    err: 'Tidak dapat menyimpan nama kandang.',
  },
  linking: {
    login_id: 'ID log masuk (Supabase)',
    loading: 'Memuatkan…',
    unlink: 'Nyahpaut',
    last_id: '(ID log masuk terakhir tidak boleh dinyahpaut)',
    link_google: 'Pautkan Google',
    wallet_h: 'Dompet',
    no_wallet: 'Tiada dompet dipautkan.',
    link_metamask: '🦊 Pautkan MetaMask',
    err_no_metamask: 'MetaMask tidak dijumpai. Sila pasang sambungan itu.',
    err_no_address: 'Tidak dapat memperoleh alamat dompet',
    err_link_wallet: 'Gagal memautkan dompet',
    linked_tpl: 'Dompet {addr} dipautkan',
    err_unlink: 'Gagal menyahpaut',
  },
  contact: {
    title: 'Hubungi',
    lead: 'Peraturan, akaun, deposit/pengeluaran — tanya kami apa sahaja. Pasukan sokongan akan menyemak dan membalas ke e-mel berdaftar anda.',
    faq_label: 'Soalan lazim',
    faq_burn: 'Apa itu BURN?',
    faq_buy: 'Cara beli & jual',
    faq_deposit: 'Deposit saya tidak muncul',
    faq_champion: 'Bila Champion Reward?',
    faq_team: 'Pasukan (Support Bonus)',
    cat_rules: 'Peraturan permainan',
    cat_money: 'Deposit/pengeluaran',
    cat_trade: 'Beli/jual',
    cat_team: 'Pasukan',
    cat_other: 'Lain-lain',
    cat_label: 'Kategori (pilihan)',
    subject_label: 'Subjek',
    subject_ph: 'cth. Sila jelaskan BURN',
    body_label: 'Mesej anda',
    body_ph: 'Lebih terperinci anda menulis, lebih tepat kami dapat membantu',
    sending: 'Menghantar…',
    send: 'Hantar',
    err_send: 'Gagal menghantar. Sila cuba lagi kemudian.',
    done_title: 'Dihantar',
    done_a: 'Terima kasih kerana menghubungi kami. Pasukan sokongan akan menyemak dan membalas ke ',
    done_bold: 'e-mel berdaftar anda',
    done_b: '.',
    done_guide: 'Baca panduan →',
    done_dashboard: 'Ke papan pemuka →',
    aside_reply_title: 'Tentang balasan',
    li1_bold: 'E-mel berdaftar anda',
    li1_rest: ' — kami membalas di sana (tiada balasan dipaparkan di halaman ini)',
    aside_li2: 'Sesetengah pertanyaan mungkin mengambil masa untuk disemak',
    aside_li3: 'Angka baki dan transaksi yang tepat ada pada halaman masing-masing dalam aplikasi',
    aside_mail_title: 'Anda juga boleh menghubungi kami melalui e-mel',
  },
  notif: {
    title: 'Notifikasi',
    unread_tpl: '{n} belum dibaca',
    read_note: 'Membuka menandakannya dibaca · ketik untuk ke halaman berkaitan',
    types: {
      RACE_RESULT_READY: 'Keputusan perlumbaan', HORSE_BURNED: 'Burn', REVENGE_BUFF_GENERATED: 'Revenge Buff',
      BUYBACK_PAYMENT_PAID: 'Champion Reward', BUYBACK_COMPLETED: 'Champion Reward', MEMORIAL_NFT_MINTED: 'NFT peringatan',
      SUPPORT_BONUS_PAID: 'Support Bonus', SUPPORT_CELEBRATION_PAID: 'Wang Raikan', ASSIGNMENT_COMPLETED: 'Kuda ditetapkan',
      HORSE_SOLD: 'Terjual', AUTO_LISTED: 'Auto-senarai', AUTO_RESERVED: 'Tempahan automatik',
      MARKETPLACE_LOCKED: 'Menyelesaikan', MARKETPLACE_REOPENED: 'Dibuka semula', DEPOSIT_CONFIRMED: 'Deposit',
      WITHDRAWAL_COMPLETED: 'Pengeluaran', WITHDRAWAL_FAILED: 'Ralat pengeluaran', TRAINING_COMPLETED: 'Latihan',
      ITEM_DROPPED: 'Item', ITEM_GIFT_RECEIVED: 'Hadiah',
    },
    type_default: 'Notis',
    cats: { race: 'Perlumbaan', trade: 'Dagangan', reward: 'Ganjaran', money: 'Deposit', other: 'Lain-lain' },
    cat_all: 'Semua',
    digest_title_tpl: 'Ringkasan {d}',
    count_tpl: '{n}',
    digest_results: 'Lihat keputusan →',
    digest_history: 'Sejarah transaksi →',
    search_ph: 'Cari notifikasi…',
    unread_only: 'Belum dibaca sahaja',
    count_all_tpl: 'Semua {n}',
    count_some_tpl: '{shown} daripada {total}',
    empty_a: 'Belum ada notifikasi.',
    empty_b: 'Keputusan perlumbaan, Burn, Champion Reward, dagangan dan banyak lagi tiba di sini.',
    empty_filtered: 'Tiada notifikasi sepadan.',
    prev: '← Sebelum',
    next: 'Seterusnya →',
    min_tpl: '{n} min lalu',
    hour_tpl: '{n} jam lalu',
    day_tpl: '{n} hari lalu',
  },
  champion: {
    hero_note: 'Dibuka apabila pengguna aktif mencapai 10,000',
    sound_on_aria: 'Matikan bunyi',
    sound_off_aria: 'Hidupkan bunyi',
    rewards_sub: 'Champion Reward anda',
    rewards_note_a: 'Kuda yang melepasi Day7 menjadi Juara dan menerima Champion Reward ',
    rewards_note_b: ', kemudian menjadi NFT peringatan. Ganjaran dibahagi kepada 7 bayaran, dibayar automatik pada setiap penyelesaian malam.',
    hall_sub: 'Setiap kuda yang melepasi Day7',
    hall_count_tpl: '{n} dimahkotai',
    hall_sample: 'Paparan sampel (data sementara) — sebaik Juara pertama lahir, kuda sebenar diukir di sini.',
    filter_all: 'Semua',
    sort_recent: 'Terbaru',
    sort_oldest: 'Terlama',
    sort_name: 'Ikut nama',
    sort_aria: 'Susunan',
    crowned: 'Dimahkotai',
    owner_label: 'Pemilik',
    league_desc: 'Liga peringkat teratas mingguan yang hanya boleh disertai kuda Juara (lepasan Day7). Ia dibuka apabila pengguna aktif mencapai 10,000, dan berjalan pada ekonomi berasingan daripada Daily Derby.',
    ladder_title: '7 CLASSES · tangga kenaikan',
    class_win_tpl: '{n} menang',
    weekly_races_v: 'Diadakan sekali seminggu · sehingga 18 kuda setiap perlumbaan. Perlumbaan dibentuk automatik berdasarkan bilangan kuda Juara berdaftar.',
    prize_pool_v: '1% daripada jualan kedai item setiap minggu masuk ke kolam hadiah. Bukan pemenang ambil semua — ia dibahagi antara beberapa peserta.',
    retirement_v: 'Persaraan mulia apabila menang G1 atau 10 penyertaan liga. Kuda bersara diukir di dewan selama-lamanya.',
    fanpass_v: 'Membuka sudut berbilang kamera dan tontonan premium. Penyertaan peminat dan kedudukan juga dirancang.',
    bv_title: 'Champion Reward',
    bv_intro_a: 'Kuda yang melepasi Day7 menjadi Juara dan menerima Champion Reward ',
    bv_intro_bold1: '200 USDT',
    bv_intro_b: '. Mulai keesokan hari (D+1) ia dibayar automatik dalam ',
    bv_intro_bold2: '7 bayaran',
    bv_intro_c: '. Apabila kesemua 7 selesai, sebuah ',
    bv_intro_bold3: 'NFT peringatan',
    bv_intro_d: ' (Polygon / ERC-721) ditempa.',
    card_day7_tpl: 'Day7 dilepasi {d}',
    status_done: 'Selesai',
    status_progress: 'Sedang berjalan',
    card_horse_tpl: 'Kuda {id}',
    count7_tpl: '{p} / 7',
    detail_arrow: 'Butiran →',
    empty_a: 'Belum ada Champion Reward.',
    empty_b: 'Apabila kuda menamatkan Day7 ia menjadi Juara, dan ganjarannya (200 USDT) muncul di sini.',
    crumb: '← Senarai Champion Reward',
    detail_title_tpl: 'Champion Reward {d}',
    horse_link_tpl: 'Kuda {id} →',
    progress_k: 'Diterima · PROGRESS',
    of7: ' / 7',
    total_received_k: 'Jumlah · diterima',
    schedule_label: 'Jadual bayaran · 7 PAYMENTS',
    due_tpl: 'Dijangka {d}',
    paid_tpl: ' · dibayar {t}',
    status_paid: 'PAID · dibayar',
    status_next: 'Seterusnya',
    status_pending: 'Dijadualkan',
    detail_note: 'Satu bayaran dibuat setiap malam pada penyelesaian 20:00. Apabila kesemua 7 selesai, NFT peringatan kuda ini (Polygon / ERC-721) ditempa.',
  },
  support: {
    self: 'Anda',
    unit_people: '',
    unit_horses: '',
    map_cta: 'Buka peta organisasi →',
    lead: 'Apabila seorang Juara (penamat tujuh hari) lahir daripada organisasi anda, wang raikan dibayar kepada rangkaian yang menyokongnya. Menjemput sahaja tidak mencetuskannya.',
    rate_k: 'STARTER RATE · kadar rujukan anda',
    rate_who: 'Kepada anda, bagi setiap Juara daripada rakan yang anda jemput terus',
    gauge_starter: 'Pemula',
    gauge_leader: 'Pemimpin',
    gauge_sub_a: 'Semakin organisasi anda berkembang, kadar beralih lancar dari 8.00 → 3.00 (3.00 pada organisasi 50,000 USDT). Kadar × saiz organisasi direka kekal malar — ',
    gauge_sub_bold: 'apabila organisasi berkembang, jumlah bahagian terus anda tidak menurun.',
    boost_tpl: 'Boost pemula ×{x}',
    standard: 'Standard',
    rate_note: 'Kadar yang digunakan ialah kadar pada malam Juara lahir, dinilai semula setiap hari pada 20:00 (GMT+8).',
    tier_hero_k: 'SUPPORT TIER · tier semasa',
    next_maintain_tpl: 'Kekalkan organisasi ≥ {v} USDT untuk mencapai T{n}',
    next_direct_tpl: ' (+ terus ≥ {d})',
    tier_max: 'Anda telah mencapai tier tertinggi',
    vol_a: 'Nilai kuda aktif organisasi (7 tier di bawah): ',
    vol_b: ' · jemputan terus: ',
    vol_c: ' · dinilai semula setiap hari 20:00 (GMT+8) (turun automatik jika di bawahnya)',
    action_k: 'NEXT · tindakan seterusnya',
    action_pool_tpl: '{n} rakan menunggu untuk diletakkan. Meletakkan mereka menambah mereka ke rangkaian anda dan membantu mengekalkan tier.',
    action_grow_tpl: 'Tier seterusnya dibuka pada organisasi {v} USDT. Jemput rakan dan kembangkan seluruh rangkaian.',
    action_max: 'Semua tier dibuka. Teruskan mengekalkan rangkaian anda.',
    action_btn_place: 'Letak pada peta',
    action_btn_view: 'Lihat peta organisasi',
    kpi_total: 'Jumlah Support Bonus',
    kpi_total_sub_tpl: '{n} kali diterima',
    kpi_network: 'Rangkaian',
    kpi_network_sub: 'Rakan yang anda sokong',
    kpi_pool: 'Menunggu penempatan',
    kpi_pool_place: 'Letak pada peta →',
    kpi_pool_none: 'Tiada menunggu',
    tier_table_h: 'Tier & bayaran',
    tier_meta: 'Apabila seorang Juara lahir, wang raikan (T1 = kadar rujukan anda 3–8 / T2 = 2 / T3–7 = 1 USDT setiap satu) diagihkan kepada 7 tier di atas.',
    tier_cond_always: 'Sentiasa',
    tier_cond_org_tpl: 'Org ≥ {v}',
    tier_cond_direct_tpl: ' + terus ≥ {d}',
    t1_range: ' (3–8)',
    tier_foot: 'Volum organisasi = jumlah nilai kuda aktif 7 tier di bawah anda pada peta organisasi (julat yang dicapai Support Bonus). T5+ turut memerlukan nilai kuda aktif rakan yang anda jemput terus. Lebar (bilangan barisan terus) tanpa had.',
    invite_title: 'Pautan jemputan · INVITE',
    invite_code_label: 'Kod anda ',
    invite_copied: '✓ Disalin',
    invite_copy: 'Salin pautan',
    invite_note: 'Menjemput sahaja tidak membayar bonus. Support Bonus dibayar hanya apabila seorang Juara (penamat tujuh hari) lahir dalam rangkaian anda, sebagai wang raikan dalam jumlah yang ditetapkan (T1 = kadar rujukan 3–8 / T2 = 2 / T3–7 = 1 USDT setiap satu). Jumlah dan kekerapan tidak dijamin.',
    hist_h: 'Sejarah Support Bonus',
    hist_empty: 'Belum ada Support Bonus.',
    hist_why: 'Juara lahir dalam organisasi anda',
    toolbar_stats_tpl: '{members} ahli · {pool} menunggu · terdalam T{depth}',
    mode_map: 'Peta',
    mode_list: 'Senarai',
    expand_all: 'Kembang semua',
    collapse_all: 'Runtuh semua',
    map_search_ph: 'Cari ahli (sebahagian nama paparan atau e-mel tepat)',
    map_search_aria: 'Cari ahli dalam organisasi anda',
    map_search_btn: 'Cari',
    map_search_notfound: 'Tidak dijumpai dalam organisasi anda (7 tier di bawah)',
    place_select_a: ' — memilih tempat penempatan — ',
    place_hint_map: 'klik nod pada peta (anda atau ahli di bawah anda)',
    place_hint_list: 'ketik seorang ahli dalam senarai',
    place_select_b: '',
    cancel: 'Batal',
    you_crumb: '★ Anda',
    focus_tier_tpl: 'TIER {t} · ',
    focus_meta_tpl: '{direct} terus · {sub} di bawah',
    detail_btn: 'Butiran',
    place_here: 'Letak di sini',
    drill_empty: 'Belum ada sesiapa di bawah ini.',
    child_horse_tpl: '{h} kuda · ',
    child_meta_tpl: '{kids} terus · {sub} di bawah',
    drill_open_aria: 'Buka barisan ini',
    empty_tree: 'Belum ada sesiapa diletakkan. Jemput rakan dan letakkan orang pertama anda.',
    node_collapsed_tpl: '+{n} diruntuhkan',
    node_series_tpl: '{n} barisan terus',
    node_direct_tpl: '{n} terus',
    toggle_expand_aria: 'Kembang',
    toggle_collapse_aria: 'Runtuh',
    node_place_hint_tpl: 'Letak di sini · T{n}',
    dock_title: 'Rakan menunggu penempatan',
    dock_hint: 'Penempatan muktamad setelah disahkan',
    dock_empty: 'Tiada rakan menunggu penempatan. Kongsi pautan jemputan anda dari papan pemuka.',
    pool_joined_tpl: 'Menyertai {d}',
    pool_place_btn: 'Letak',
    m_sub_tpl: 'TIER {t} ({t} tingkat di bawah anda)',
    m_placed_tpl: ' · diletakkan {d}',
    m_active_horses: 'Kuda aktif',
    m_horses_value: 'Nilai kuda aktif',
    m_burns: 'BURN (jumlah)', unit_times: '',
    m_items: 'Item digunakan (jumlah)', unit_items: '',
    m_direct: 'Terus',
    m_subtree: 'Di bawah (dalam 7 tier)',
    m_note: 'Nilai kuda aktif ialah sumbangan ahli ini kepada volum organisasi anda (pembukaan tier).',
    m_note_loading: ' memuatkan…',
    close: 'Tutup',
    confirm_title: 'Sahkan penempatan',
    confirm_body_a: ' akan diletakkan ',
    confirm_target_self: 'terus di bawah anda (TIER 1)',
    confirm_target_tpl: 'terus di bawah {name} (TIER {t})',
    confirm_body_b: '.',
    warn_a: '⚠ Setelah disahkan, penempatan ',
    warn_bold: 'tidak boleh diubah selama-lamanya',
    warn_b: '. Permintaan penempatan semula tidak boleh diterima (pengecualian sistem untuk pengendali sahaja).',
    confirm_check: 'Saya faham ini tidak boleh diubah',
    reselect: 'Pilih tempat lain',
    placing: 'Meletakkan…',
    confirm_btn: 'Sahkan tempat ini',
    err_place: 'Penempatan gagal.',
    demo_note: 'Memaparkan organisasi sampel (data sementara, ~60 orang) — apabila rakan yang anda jemput bertambah, ini bertukar automatik kepada organisasi sebenar anda.',
  },
  ledger: {
    title: 'Lejar · LEDGER',
    intro: 'Setiap perlumbaan dan dagangan malam diterbitkan tepat seperti direkodkan. Pengguna dipaparkan sebagai ID tanpa nama. Daripada “Semua keputusan & pengesahan” setiap hari, sesiapa boleh mengira semula daripada benih awam (commit–reveal) dan mengesahkan keputusan tidak boleh diganggu.',
    loading: 'Memuatkan lejar…',
    empty_no_races: 'Belum ada perlumbaan dimuktamadkan. Selepas perlumbaan pertama dimuktamadkan, semua rekod diterbitkan di sini.',
    dow: ['Ah', 'Is', 'Se', 'Ra', 'Kh', 'Ju', 'Sa'],
    month_tpl: '{m}/{y}',
    date_full_tpl: '{d}/{m}/{y}',
    prev_month_aria: 'Bulan sebelumnya',
    next_month_aria: 'Bulan seterusnya',
    weather: { SUNNY: 'Cerah', CLOUDY: 'Mendung', RAIN: 'Hujan', STORM: 'Ribut' },
    track: { FAST: 'Laju', GOOD: 'Baik', SOFT: 'Lembut', HEAVY: 'Berat' },
    surface: { TURF: 'Rumput', DIRT: 'Tanah' },
    t_participants: 'Peserta',
    t_survived: 'Terselamat',
    t_burn: 'BURN',
    t_day7: 'DAY7 dilepasi',
    t_matched: 'Diselesaikan',
    t_matched_vol: 'Volum diselesaikan USDT',
    t_mints: 'Tempaan baharu',
    t_burn_rate: 'Kadar BURN digunakan (daripada benih)',
    csv_daily: 'CSV hari ini',
    csv_generating: 'Menjana…',
    csv_monthly: 'CSV bulanan',
    verify_link: 'Semua keputusan & pengesahan →',
    trades_label: 'Dagangan diselesaikan (tanpa nama) · SETTLED TRADES',
    trades_loading: 'Memuatkan…',
    trades_empty: 'Tiada dagangan diselesaikan hari ini.',
    mint_label_day0: 'Tempaan baharu (DAY0)',
    p2p_day_tpl: ' (DAY{day})',
    badge_mint: 'Tempaan baharu',
    more_tpl: '{n} lagi — set penuh ada dalam “CSV hari ini.”',
  },
  guide: {
    h1: 'Cara bermain',
    lead: 'Seven Days Derby ialah permainan di mana anda melumbakan kuda NFT menerusi **perlumbaan survival tujuh hari**. Halaman ini membimbing pemula melalui aliran daripada pendaftaran hingga menjadi Juara.',
    hero_title: 'Lengkapkan tujuh hari',
    hero_p: 'Setiap malam 20:00 (waktu Malaysia), semua kuda berlari serentak. Yang terselamat naik nilai setiap hari; tamatkan Day 7 dan anda memperoleh Champion Reward 200 USDT serta NFT peringatan.',
    toc_aria: 'Kandungan',
    back_top: '↑ Kembali ke atas',
    sec_register: 'Pendaftaran akaun',
    sec_buy: 'Beli kuda',
    sec_sell: 'Jual kuda (pasaran)',
    sec_race: 'Perlumbaan malam',
    sec_champion: 'Day7 — Juara',
    sec_team: 'Bonus TEAM & membina organisasi',
    sec_items: 'Item',
    sec_wallet: 'Deposit & pengeluaran',
    sec_contact: 'Hubungi',
    reg_p: 'Anda log masuk dengan **akaun Google**. Pendaftaran dan log masuk menggunakan butang yang sama, tiada kata laluan diperlukan. Kandang anda dibuka automatik pada log masuk pertama.',
    reg_box_t: 'Log masuk dengan Google',
    reg_box_d: 'Baki, kuda dan sejarah semuanya terikat pada satu akaun pemilik ini',
    reg_tip: 'Daftar melalui pautan jemputan rakan dan anda menyertai TEAM (organisasi sokongan) rakan itu — lihat ⑥.',
    buy_p1: 'Anda memperoleh kuda dengan membuat “tempahan pembelian” di pasaran. Kuda anda ditentukan dalam kelompok 20:00 (waktu Malaysia) setiap malam, dan **rupa, nama serta keupayaannya dijana secara unik** daripada DNA-nya (tidak boleh diubah selepas itu, sepenuhnya berketentuan).',
    buy_b1_t: 'Tempah pembelian', buy_b1_d: 'Mengunci sehingga 177.16 USDT sekuda\n(had jadual harga)',
    buy_b2_t: 'Kelompok 20:00', buy_b2_d: 'Kuda anda ditentukan',
    buy_b3_t: 'Tempaan Day0', buy_b3_d: 'Dicaj 102 USDT\n(harga 100 + yuran 2)',
    buy_b4_t: 'Baki dikembalikan automatik', buy_b4_d: 'Beza daripada jumlah dikunci kembali ke baki anda',
    buy_p2: 'Anda juga boleh membeli **kuda pemilik lain (Day1–Day6)** di pasaran. Semakin jauh hari kuda, semakin tinggi harganya pada jadual:',
    buy_warn: '**Risiko penting:** kuda **mungkin di-BURN (NFT dimusnahkan)** dalam perlumbaan malam. Kuda yang musnah dan wang yang dibayar tidak dikembalikan. Bermain hanya dengan wang yang anda mampu kehilangannya.',
    sell_p: 'Kuda Day1–Day6 boleh **disenaraikan di pasaran** mengikut budi bicara anda. “Larikannya hingga Juara, atau jual separuh jalan dan kunci keuntungan” — ketegangan itulah jantung Seven Days Derby.',
    sell_b1_t: 'Senaraikan', sell_b1_d: 'Dari halaman butiran kuda\nDay1–6 sahaja',
    sell_b2_t: 'Pembeli ditentukan', sell_b2_d: 'Diselesaikan dalam kelompok malam ini',
    sell_b3_t: 'Terima hasil jualan', sell_b3_d: 'Kuda melarikan baki harinya di bawah pemilik baharu',
    sell_tip: 'Penyenaraian dan pembelian ada tarikh tutup setiap malam (pasaran dikunci sebentar semasa pemprosesan perlumbaan).',
    race_p1: 'Setiap malam **20:00 (waktu Malaysia)**, semua kuda hari itu berlari serentak. Keputusan membahagikan kuda kepada **“terselamat” atau “BURN”**; yang terselamat maju satu Day.',
    tl1_t: 'Siang', tl1_v: 'Guna item · berdagang · rancang',
    tl2_t: 'Sebelum perlumbaan', tl2_v: 'Tutup (pasaran & item dikunci)',
    tl3_t: '20:00 MYT', tl3_v: 'Perlumbaan beramai-ramai (tonton di Daily Derby)',
    tl4_t: 'Sejurus selepas', tl4_v: 'Keputusan dimuktamadkan: selamat → Day seterusnya / BURN',
    race_p2: '**Tiada sesiapa boleh menipu perlumbaan.** Keputusan dikira secara berketentuan daripada benih rawak yang dikomit (dimeterai) lebih awal, dan benih didedahkan selepas perlumbaan. Sesiapa boleh mengira semula dan mengesahkannya — inilah kaedah “commit–reveal”. Pengendali mahupun anda tidak boleh mengubah keputusan.',
    race_p3: '**Setiap malam, kuda berkedudukan terendah di-BURN (dimusnahkan).** Rekod penuh berapa yang berlari, terselamat dan di-BURN diterbitkan setiap hari pada **halaman “Lejar”**, boleh dimuat turun sebagai CSV supaya sesiapa boleh mengesahkan dan mengiranya.',
    race_p4: 'Pada penghujung persembahan perlumbaan, satu **“ramalan esok”** (cuaca, trek, padang) diumumkan. Ramalan dijana secara mekanikal daripada benih yang dikomit awal — satu **petunjuk berketepatan ~70%**, bukan jaminan keputusan. Sama ada anda menyimpan item untuk memadankannya terpulang kepada anda.',
    race_tip: 'Di “Daily Derby” pada halaman RACE, anda boleh menonton perlumbaan setiap malam dalam persembahan gaya langsung, dengan sorotan khas untuk larian kuda anda sendiri.',
    champ_p1: 'Kuda yang terselamat kesemua tujuh malam ialah **Juara**. Ia memperoleh **Champion Reward 200 USDT** (dibayar automatik dalam 7 ansuran mulai keesokan hari) dan **NFT peringatan** dewan kemasyhuran (Polygon / ERC-721).',
    ladder_survive: 'Terselamat', ladder_day7_v: '200 USDT + NFT peringatan',
    champ_p2: 'Rekod Juara dan jadual ganjaran dikumpulkan pada **halaman CHAMPION**. Status bayaran Champion Reward anda dan Hall of Champions kedua-duanya ada di sana.',
    champ_tip: 'Apabila pengguna aktif mencapai 10,000, liga peringkat teratas mingguan “Champion League” — hanya untuk kuda Juara — bermula.',
    team_p1: 'Apabila seorang rakan mendaftar dari **pautan jemputan** peribadi anda (di halaman TEAM), mereka menyertai **organisasi sokongan (TEAM)** anda. Apabila rakan menjemput lebih ramai rakan, organisasi merebak ke bawah (sehingga 7 tier).',
    tree_svg_aria: 'Pokok organisasi: Anda → Rakan A/B/C → rakan mereka',
    tree_you: 'Anda', tree_fa: 'Rakan A', tree_fb: 'Rakan B', tree_fc: 'Rakan C', tree_fa_sub: 'Rakan kpd A', tree_fb_sub: 'Rakan kpd B',
    team_p2: 'Apabila kuda ahli menjadi **Juara (penamat tujuh hari)**, satu **Support Bonus** diagihkan sebagai wang raikan kepada organisasi yang menyokongnya (sejumlah 10 USDT setiap kuda, merentasi 7 tier teratas). Berapa tier yang anda terima dibuka mengikut **aktiviti seluruh organisasi anda** — jadi bukan sekadar “berapa yang anda jemput terus”, tetapi **membina organisasi** yang penting.',
    team_b1_t: 'Kongsi pautan jemputan', team_b1_d: 'Dapatkan di halaman TEAM',
    team_b2_t: 'Organisasi berkembang', team_b2_d: 'Merebak ke rakan kepada rakan (7 tier)',
    team_b3_t: 'Seorang Juara lahir', team_b3_d: 'Wang raikan daripada organisasi (sehingga tier yang dibuka)',
    team_warn: 'Support Bonus berubah mengikut Juara yang lahir daripada organisasi anda. **Tiada sebarang janji atau jaminan pendapatan.** Semak syarat tepat dan status tier semasa anda di halaman TEAM.',
    items_p1: 'Anda boleh membeli **30 jenis item** di kedai halaman ITEMS (tiga jalur: Basic / Standard / Premium). Selain itu, **5 item eksklusif** yang jatuh pada kadar tertentu apabila kuda di-BURN tidak boleh dibeli di kedai.',
    items_b1_t: 'Dapatkan item', items_b1_d: 'Beli di kedai / jatuh BURN / terima hadiah',
    items_b2_t: 'Guna pada kuda sebelum perlumbaan', items_b2_d: 'Dari halaman butiran kuda. Mempengaruhi skor malam ini (berhad)',
    items_b3_t: 'Keadaan perlumbaan (cuaca, trek, padang)', items_b3_d: 'Padankan bakat item untuk sehingga ×1.5 (ditentukan daripada benih, boleh disahkan)',
    items_p2: 'Setiap item mempunyai **bakat** (pakar rumput, pakar tanah, jaguh hujan, jaguh padang teruk, dsb.). Padankan **keadaan perlumbaan (cuaca, trek, padang)** setiap malam dan kesannya naik sehingga ×1.5; lawan keadaan dan ia tumpul kepada ×0.5. Keadaan ditetapkan oleh benih perlumbaan, jadi **pengendali tidak boleh memanipulasinya**. Sesiapa boleh mengesahkan selepas perlumbaan.',
    items_tip: 'Anda boleh **menghadiahkan item kepada pemilik lain melalui alamat e-mel** (dengan beberapa pengecualian). Hantar kiub gula untuk detik besar rakan — begitu juga penggunaannya.',
    wallet_p: 'Mata wang dalam permainan ialah **USDT (rangkaian Polygon)**. Semuanya dikendalikan di halaman WALLET.',
    w_b1_t: 'Deposit', w_b1_d: 'Hantar USDT (Polygon) ke alamat deposit peribadi anda',
    w_b2_t: 'Pengesahan rantai', w_b2_d: 'Dikreditkan selepas pengesahan yang diperlukan',
    w_b3_t: 'Baki dikreditkan', w_b3_d: 'Boleh digunakan untuk membeli kuda dan item',
    w_b4_t: 'Mohon pengeluaran', w_b4_d: 'Tetapkan alamat destinasi dan jumlah di halaman WALLET',
    w_b5_t: 'Semakan', w_b5_d: 'Pengeluaran besar memerlukan kelulusan beberapa orang, jadi mungkin mengambil masa',
    w_b6_t: 'Dihantar', w_b6_d: 'USDT tiba di dompet anda',
    wallet_warn: '**Sentiasa guna USDT pada rangkaian Polygon.** Menghantar pada rangkaian atau token lain boleh menyebabkan kehilangan dana.',
    contact_p: 'Jika ada yang tidak jelas, hubungi pasukan sokongan bila-bila masa. Kami membalas ke e-mel berdaftar anda.',
    c_b1_t: 'Borang hubungi', c_b1_d: 'Dari “Hubungi” pada navigasi (disyorkan)',
    c_b2_t: 'E-mel',
    c_box_t: 'AI + pasukan sokongan menyemak dan membalas', c_box_d: 'Sokongan global — kami membalas dalam bahasa pertanyaan anda (Bahasa Melayu/Inggeris dan lain-lain)',
    contact_link: '→ Buka borang hubungi',
  },
};

export const APP_COPY: Record<Lang, AppDict> = { ja, en, zh, ko, ms };
