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

/** テンプレ文字列の {name} を値で埋める(多言語の語順差を吸収)。client 安全。 */
export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m: string, k: string) => String(vars[k] ?? ''));
}

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
    buff_none_s: 'Burn 时获得的下场加成',
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
    crowned: '加冕',
    owner_label: '拥有者',
    league_desc: '仅限跑完 Day7 的冠军马参加的每周顶级联赛。活跃用户达到 10,000 人时开幕，采用与每日德比独立的经济运营。',
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
    manual_li3: '출품은 말마다 하루 한 번, 내림은 다음 배치에 반영',
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
    unread_tpl: '미읽음 {n}',
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
    unread_only: '미읽음만',
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
    tasks_sub: 'Latih sekali sehari, sehingga syot kilat malam ini ditetapkan. Yang menunggu penetapan disahkan dalam perlumbaan malam ini.',
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
    manual_li3: 'Satu tindakan senarai bagi setiap kuda sehari; penyahsenaraian berkuat kuasa kelompok seterusnya',
    manual_li4: 'Tempahan beli automatik tidak tersedia',
    manual_cta: 'Guna Penyenaraian manual',
    modal_note: 'Kedua-duanya, peraturan tempahan beli dan lejar adalah sama.',
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
    reg_label: 'Menyertai ',
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
      SUPPORT_BONUS_PAID: 'Support Bonus', SUPPORT_CELEBRATION_PAID: 'Raikan', ASSIGNMENT_COMPLETED: 'Kuda ditetapkan',
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
    rewards_note_b: ' , kemudian menjadi NFT peringatan. Ganjaran dibahagi kepada 7 bayaran, dibayar automatik pada setiap penyelesaian malam.',
    hall_sub: 'Setiap kuda yang melepasi Day7',
    hall_count_tpl: '{n} dimahkotai',
    hall_sample: 'Paparan sampel (data sementara) — sebaik Juara pertama lahir, kuda sebenar diukir di sini.',
    filter_all: 'Semua',
    sort_recent: 'Terbaru',
    sort_oldest: 'Terlama',
    sort_name: 'Ikut nama',
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
    bv_intro_b: ' . Mulai keesokan hari (D+1) ia dibayar automatik dalam ',
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
};

export const APP_COPY: Record<Lang, AppDict> = { ja, en, zh, ko, ms };
