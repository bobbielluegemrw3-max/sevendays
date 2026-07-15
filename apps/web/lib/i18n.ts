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
};

export const APP_COPY: Record<Lang, AppDict> = { ja, en, zh, ko, ms };
