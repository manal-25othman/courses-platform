import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from '../auth.types';

/**
 * Gives a handler the signed-in caller.
 *
 * Taken from the verified token, never from anything the client can set, so a
 * caller cannot claim to be someone else (ARCHITECTURE 12, barrier 1).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserType => {
    const request = context.switchToHttp().getRequest<{ user: CurrentUserType }>();
    return request.user;
  },
);
