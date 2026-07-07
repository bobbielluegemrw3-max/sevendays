import { ApiRegistry } from './router.js';
import { registerUserEndpoints } from './endpoints/user.js';
import { registerAdminEndpoints } from './endpoints/admin.js';
import { registerSupportEndpoints } from './endpoints/support.js';
import { registerMarketEndpoints } from './endpoints/market.js';
import { registerItemEndpoints } from './endpoints/items.js';
import { registerInternalEndpoints } from './endpoints/internal.js';

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
  registerAdminEndpoints(registry);
  registerInternalEndpoints(registry);
  return registry;
}
