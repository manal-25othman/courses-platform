import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { withSettingsCache } from './settings-cache';

/**
 * Gives every request its own settings cache.
 *
 * Middleware rather than an interceptor, and the difference is not cosmetic.
 * An interceptor returns an Observable that Nest subscribes to after the
 * interceptor has returned, so the handler would run outside the storage
 * context and find no cache. Express middleware calls the rest of the chain
 * itself, so the controller, the services under it and every query they make
 * all run inside the context this opens.
 */
@Injectable()
export class SettingsCacheMiddleware implements NestMiddleware {
  use(_request: Request, _response: Response, next: NextFunction): void {
    withSettingsCache(() => next());
  }
}
