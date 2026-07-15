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
};

export const APP_COPY: Record<Lang, AppDict> = { ja, en, zh, ko, ms };
