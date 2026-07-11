import { ApiRegistry } from './router.js';
import { registerUserEndpoints } from './endpoints/user.js';
import { registerAdminEndpoints } from './endpoints/admin.js';
import { registerSupportEndpoints } from './endpoints/support.js';
import { registerMarketEndpoints } from './endpoints/market.js';
import { registerItemEndpoints } from './endpoints/items.js';
import { registerDerbyEndpoints } from './endpoints/derby.js';
import { registerInternalEndpoints } from './endpoints/internal.js';
import { registerCsEndpoints } from './endpoints/cs.js';
import { registerPushEndpoints } from './endpoints/push.js';

export * from './errors.js';
export * from './forbidden.js';
export * from './router.js';
export * from './server.js';

/** The complete v1.0 API surface. */
export function buildApiRegistry(): ApiRegistry {
  const registry = new ApiRegistry();
  registerUserEndpoints(registry);
  registerSupportEndpoints(registry);
  registerMarketEndpoints(registry);
  registerItemEndpoints(registry);
  registerDerbyEndpoints(registry);
  registerAdminEndpoints(registry);
  registerCsEndpoints(registry);
  registerInternalEndpoints(registry);
  registerPushEndpoints(registry);
  return registry;
}

// AIカスタマーサービス(webhookルートから利用)
export { generateCsReply, type CsAiContext, type CsAiResult } from './cs/ai.js';
export { sendCsEmail, CsMailError } from './cs/mail.js';
export { CS_KNOWLEDGE } from './cs/knowledge.js';

// Webプッシュ(Decision 084)
export {
  sendNightlyBroadcast,
  raceStartMessage,
  raceReminderMessage,
  hasBroadcast,
  type BroadcastResult,
} from './push/broadcast.js';
export {
  buildWebPushTransport,
  vapidPublicKey,
  type PushTransport,
  type PushMessage,
  type PushSendResult,
  type PushSubscriptionRow,
} from './push/webpush.js';
