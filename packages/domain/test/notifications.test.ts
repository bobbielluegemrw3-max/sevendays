import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TEMPLATES_V1,
  NOTIFICATION_TYPES_V1,
  renderNotification,
} from '../src/index.js';

describe('notification templates (Decision 065)', () => {
  it('defines the owner-adopted types + support bonus + item types (074/078/079)', () => {
    expect(NOTIFICATION_TYPES_V1).toHaveLength(16);
    expect(NOTIFICATION_TYPES_V1).toContain('SUPPORT_BONUS_PAID');
    expect(NOTIFICATION_TYPES_V1).toContain('ITEM_DROPPED');
    expect(NOTIFICATION_TYPES_V1).toContain('ITEM_GIFT_RECEIVED');
    expect(Object.keys(NOTIFICATION_TEMPLATES_V1).sort()).toEqual([...NOTIFICATION_TYPES_V1].sort());
  });

  it('the support bonus copy follows the R3 naming rule (never MLM/紹介報酬)', () => {
    const rendered = renderNotification('SUPPORT_BONUS_PAID', { amount: '3.00', tier: 1 });
    expect(rendered.title).toBe('サポートボーナスを受け取りました。');
    expect(`${rendered.title}${rendered.body}`).not.toMatch(/MLM|コミッション|紹介報酬/);
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
    };
    for (const type of NOTIFICATION_TYPES_V1) {
      const rendered = renderNotification(type, generic);
      expect(rendered.title).not.toMatch(/\{[a-z_]+\}/);
      expect(rendered.body).not.toMatch(/\{[a-z_]+\}/);
    }
  });
});
