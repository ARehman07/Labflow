import { perRequest } from '@/core/db/memo';
import { auth } from './auth';

/**
 * The signed-in session, read once per request.
 *
 * Decoding the session cookie is cheap on its own, but `currentUser`,
 * `currentTenantId` and every one of the app's ~100 `can()` checks asked for it
 * separately, so a single page paid for it many times over. React's `cache`
 * makes the first caller do the work and the rest read the result.
 */
export const sessionOnce = perRequest(async () => auth());
