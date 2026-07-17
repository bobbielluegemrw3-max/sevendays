import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TEMPLATES_V1,
  NOTIFICATION_TYPES_V1,
  recommendedTrainingV1,
  renderNotification,
} from '../src/index.js';

describe('recommended training (Decision 088)', () => {
  it('follows type affinity while fresh, flips to recovery at fatigue 60', () => {
    expect(recommendedTrainingV1('SPRINTER', 0)).toBe('SPEED_TRAINING');
    expect(recommendedTrainingV1('POWER', 30)).toBe('POWER_TRAINING');
    expect(recommendedTrainingV1('ENDURANCE', 0)).toBe('RECOVERY_TRAINING');
    expect(recommendedTrainingV1('BALANCED', 0)).toBe('RECOVERY_TRAINING');
    expect(recommendedTrainingV1('LUCK', 0)).toBe('RECOVERY_TRAINING');
    expect(recommendedTrainingV1('SPRINTER', 60)).toBe('RECOVERY_TRAINING');
    expect(recommendedTrainingV1('POWER', 99)).toBe('RECOVERY_TRAINING');
  });
});

describe('notification templates (Decision 065)', () => {
  it('defines the owner-adopted types + support bonus + item types (074/078/079) + trade automation (086) + celebration (092) + horse gift (094) + jackpot (106/108)', () => {
    expect(NOTIFICATION_TYPES_V1).toHaveLength(22);
    expect(NOTIFICATION_TYPES_V1).toContain('JACKPOT_WON');
    expect(NOTIFICATION_TYPES_V1).toContain('SUPPORT_BONUS_PAID');
    expect(NOTIFICATION_TYPES_V1).toContain('SUPPORT_CELEBRATION_PAID');
    expect(NOTIFICATION_TYPES_V1).toContain('HORSE_GIFT_RECEIVED');
    expect(NOTIFICATION_TYPES_V1).toContain('ITEM_DROPPED');
    expect(NOTIFICATION_TYPES_V1).toContain('ITEM_GIFT_RECEIVED');
    expect(NOTIFICATION_TYPES_V1).toContain('HORSE_SOLD');
    expect(NOTIFICATION_TYPES_V1).toContain('AUTO_LISTED');
    expect(NOTIFICATION_TYPES_V1).toContain('AUTO_RESERVED');
    expect(Object.keys(NOTIFICATION_TEMPLATES_V1).sort()).toEqual([...NOTIFICATION_TYPES_V1].sort());
  });

  it('the support bonus copy follows the R3 naming rule (never MLM/紹介報酬)', () => {
    const rendered = renderNotification('SUPPORT_BONUS_PAID', { amount: '3.00', tier: 1 });
    expect(rendered.title).toBe('サポートボーナスを受け取りました。');
    expect(`${rendered.title}${rendered.body}`).not.toMatch(/MLM|コミッション|紹介報酬/);
  });

  it('the celebration copy (Decision 092) follows R3 and never mentions burns', () => {
    const rendered = renderNotification('SUPPORT_CELEBRATION_PAID', {
      amount: '3.00',
      tier: 1,
      horse_name: 'テスト号',
    });
    expect(rendered.title).toBe('あなたの組織からチャンピオンが誕生しました。');
    expect(rendered.body).toContain('お祝い金 3.00 USDT');
    expect(`${rendered.title}${rendered.body}`).not.toMatch(/MLM|コミッション|紹介報酬|BURN|Burn/);
  });

  it('renders placeholders with params', () => {
    expect(renderNotification('DEPOSIT_CONFIRMED', { amount: '100.00000000' })).toEqual({
      title: '入金が確認されました。',
      body: '100.00000000 USDT がウォレットに反映されました。',
    });
    expect(
      renderNotification('ASSIGNMENT_COMPLETED', {
        horse_name: 'Royal Thunder',
        current_day: 3,
        price: '253.10',
      }).body,
    ).toBe('Royal Thunder / Day 3 / Price 253.10 USDT');
    expect(renderNotification('HORSE_BURNED', { horse_name: 'Black Wind' }).title).toBe(
      'Black Wind は本日のレースでBurnされました。',
    );
  });

  it('throws on a missing template param (programming error, not silent)', () => {
    expect(() => renderNotification('DEPOSIT_CONFIRMED')).toThrow(/amount/);
  });

  it('every template renders with generic params (no orphan placeholders)', () => {
    const generic = {
      amount: '1',
      horse_name: 'X',
      current_day: 1,
      price: '1',
      training_type: 'SPEED_TRAINING',
      tier: 1,
      item_name: 'X',
      sender: 'X',
      proceeds: '1',
      count: 1,
      total: '1',
    };
    for (const type of NOTIFICATION_TYPES_V1) {
      const rendered = renderNotification(type, generic);
      expect(rendered.title).not.toMatch(/\{[a-z_]+\}/);
      expect(rendered.body).not.toMatch(/\{[a-z_]+\}/);
    }
  });
});
