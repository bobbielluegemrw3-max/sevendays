/**
 * Notification specification v1.0 (Decision 065, resolves E17).
 * In-App only; the original thirteen types and their Japanese templates are
 * fixed by the owner verbatim; SUPPORT_BONUS_PAID was added by Decision 074;
 * the two BUYBACK_* texts were renamed to チャンピオン報酬 by Decision 075
 * (copy follows the R3 naming rule — never "MLM"/"紹介報酬").
 * `{placeholder}` interpolates from params.
 */

export const NOTIFICATION_TYPES_V1 = [
  'DEPOSIT_CONFIRMED',
  'ASSIGNMENT_COMPLETED',
  'TRAINING_COMPLETED',
  'RACE_RESULT_READY',
  'HORSE_BURNED',
  'REVENGE_BUFF_GENERATED',
  'ITEM_DROPPED',
  'ITEM_GIFT_RECEIVED',
  'BUYBACK_PAYMENT_PAID',
  'BUYBACK_COMPLETED',
  'MEMORIAL_NFT_MINTED',
  'WITHDRAWAL_COMPLETED',
  'WITHDRAWAL_FAILED',
  'MARKETPLACE_LOCKED',
  'MARKETPLACE_REOPENED',
  'SUPPORT_BONUS_PAID',
  // Decision 086: 売買自動化の3種(売却・自動出品・自動予約)
  'HORSE_SOLD',
  'AUTO_LISTED',
  'AUTO_RESERVED',
  // Decision 092: サポートボーナスはチャンピオン誕生時のお祝い金に
  'SUPPORT_CELEBRATION_PAID',
  // Decision 094: 馬の転送(ギフト)
  'HORSE_GIFT_RECEIVED',
  // Decision 106/108: 週次ジャックポット当選(当選者本人への個別通知)
  'JACKPOT_WON',
  // Decision 110: V2の金額指定・自動プール予約
  'AUTO_POOL_RESERVED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES_V1)[number];

export interface NotificationTemplate {
  title: string;
  body: string;
}

export const NOTIFICATION_TEMPLATES_V1: Record<NotificationType, NotificationTemplate> = {
  DEPOSIT_CONFIRMED: {
    title: '入金が確認されました。',
    body: '{amount} USDT がウォレットに反映されました。',
  },
  ASSIGNMENT_COMPLETED: {
    title: '新しい馬が割り当てられました。',
    body: '{horse_name} / Day {current_day} / Price {price} USDT',
  },
  TRAINING_COMPLETED: {
    title: 'トレーニングが完了しました。',
    body: '{horse_name} に {training_type} が適用されました。',
  },
  RACE_RESULT_READY: {
    title: '本日のレース結果が確定しました。',
    body: '{horse_name} の結果を確認してください。',
  },
  HORSE_BURNED: {
    title: '{horse_name} は本日のレースでBurnされました。',
    body: 'Revenge Buffが付与されました。',
  },
  REVENGE_BUFF_GENERATED: {
    title: 'Revenge Buffを獲得しました。',
    body: '次回の成功した馬の割当で自動適用されます。',
  },
  ITEM_DROPPED: {
    title: 'アイテムを獲得しました。',
    body: '{item_name} を受け取りました。厩舎の仲間からの弔いです。',
  },
  ITEM_GIFT_RECEIVED: {
    title: 'アイテムが届きました。',
    body: '{sender} さんから {item_name} が届きました。',
  },
  BUYBACK_PAYMENT_PAID: {
    title: 'チャンピオン報酬が支払われました。',
    body: '{amount} USDT がウォレットに反映されました。',
  },
  BUYBACK_COMPLETED: {
    title: 'チャンピオン報酬の受け取りが完了しました。',
    body: '記念NFTの作成準備が完了しました。',
  },
  MEMORIAL_NFT_MINTED: {
    title: 'Memorial NFTが作成されました。',
    body: '{horse_name} が記念馬として保存されました。',
  },
  WITHDRAWAL_COMPLETED: {
    title: '出金が完了しました。',
    body: '{amount} USDT の送金が確認されました。',
  },
  WITHDRAWAL_FAILED: {
    title: '出金処理に失敗しました。',
    body: 'サポートまたは管理者確認の対象になりました。',
  },
  MARKETPLACE_LOCKED: {
    title: 'Daily Settlement中です。',
    body: 'Marketplaceは一時的に停止しています。',
  },
  MARKETPLACE_REOPENED: {
    title: 'Daily Settlementが完了しました。',
    body: 'Marketplaceが再開されました。',
  },
  SUPPORT_BONUS_PAID: {
    title: 'サポートボーナスを受け取りました。',
    body: '{amount} USDT がウォレットに反映されました。(Tier {tier})',
  },
  HORSE_SOLD: {
    title: '{horse_name} が売れました。',
    body: '{proceeds} USDT(手数料控除後)がウォレットに反映されました。',
  },
  AUTO_LISTED: {
    title: '{horse_name} が自動出品されました。',
    body: '今夜のマッチング対象です(価格 {price} USDT)。出品中もレースに出走します。',
  },
  AUTO_RESERVED: {
    title: '自動購入予約を作成しました。',
    body: '{count}頭(最大ロック {total} USDT)。今夜20:00に処理されます。設定はダッシュボードから変更できます。',
  },
  SUPPORT_CELEBRATION_PAID: {
    title: 'あなたの組織からチャンピオンが誕生しました。',
    body: 'お祝い金 {amount} USDT がウォレットに反映されました。({horse_name} / Tier {tier})',
  },
  HORSE_GIFT_RECEIVED: {
    title: '馬が届きました。',
    body: '{sender} さんから {horse_name} が贈られました。今夜からあなたの厩舎で出走します。',
  },
  JACKPOT_WON: {
    title: 'ジャックポット当選!',
    body: '今週のジャックポットに当選しました。賞金 {amount} USDT がウォレットに支払われました。',
  },
  AUTO_POOL_RESERVED: {
    title: '自動プール予約を作成しました。',
    body: '{total} USDT のプール予約。次のレースで予算いっぱい割り当てられます(余りは自動返金)。精算前ならマーケットページから変更・キャンセルできます。',
  },
};

export interface RenderedNotification {
  title: string;
  body: string;
}

/** Fill `{placeholder}`s; a missing param is a programming error and throws. */
export function renderNotification(
  type: NotificationType,
  params: Record<string, string | number> = {},
): RenderedNotification {
  const template = NOTIFICATION_TEMPLATES_V1[type];
  const fill = (text: string): string =>
    text.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
      const value = params[key];
      if (value === undefined) {
        throw new Error(`Notification ${type} is missing template param "${key}"`);
      }
      return String(value);
    });
  return { title: fill(template.title), body: fill(template.body) };
}
