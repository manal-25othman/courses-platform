import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts an endpoint to the listed roles (SRS 3, 4, 5). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
