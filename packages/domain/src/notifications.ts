/**
 * Notification specification v1.0 (Decision 065, resolves E17).
 * In-App only; the thirteen types and their Japanese templates are fixed
 * by the owner verbatim. `{placeholder}` interpolates from params.
 */

export const NOTIFICATION_TYPES_V1 = [
  'DEPOSIT_CONFIRMED',
  'ASSIGNMENT_COMPLETED',
  'TRAINING_COMPLETED',
  'RACE_RESULT_READY',
  'HORSE_BURNED',
  'REVENGE_BUFF_GENERATED',
  'BUYBACK_PAYMENT_PAID',
  'BUYBACK_COMPLETED',
  'MEMORIAL_NFT_MINTED',
  'WITHDRAWAL_COMPLETED',
  'WITHDRAWAL_FAILED',
  'MARKETPLACE_LOCKED',
  'MARKETPLACE_REOPENED',
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
  BUYBACK_PAYMENT_PAID: {
    title: 'Buyback支払いが完了しました。',
    body: '{amount} USDT がウォレットに反映されました。',
  },
  BUYBACK_COMPLETED: {
    title: 'Buybackが完了しました。',
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
