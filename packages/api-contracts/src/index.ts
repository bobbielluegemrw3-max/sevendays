import { ApiRegistry } from './router.js';
import { registerUserEndpoints } from './endpoints/user.js';
import { registerAdminEndpoints } from './endpoints/admin.js';
import { registerInternalEndpoints } from './endpoints/internal.js';

export * from './errors.js';
export * from './forbidden.js';
export * from './router.js';

/** The complete v1.0 API surface. */
export function buildApiRegistry(): ApiRegistry {
  const registry = new ApiRegistry();
  registerUserEndpoints(registry);
  registerAdminEndpoints(registry);
  registerInternalEndpoints(registry);
  return registry;
}
