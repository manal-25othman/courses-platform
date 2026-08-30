import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as reachable without signing in.
 *
 * Everything is protected unless it carries this, so forgetting to protect a
 * new endpoint leaves it locked rather than open (ARCHITECTURE 9.2).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
