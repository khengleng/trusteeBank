import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../infra/prisma.service';

export const PERMISSION_KEY = 'required_permission';

/** Annotate a route with the permission a USER principal must hold (RBAC, §8). */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);

interface Principal {
  type: 'user' | 'client';
  roles?: string[];
}

/**
 * RBAC enforcement. Runs after {@link ClientSeparationGuard} has attached the
 * principal. When a route declares a required permission:
 *  - a **client** (service) principal is allowed (trusted machine integration);
 *  - a **user** principal must hold the permission via the union of their roles.
 * Routes without `@RequirePermission` are unaffected.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = req.principal;
    if (!principal) return true; // exempt route reached without auth
    if (principal.type === 'client') return true; // trusted service integration

    const roles = principal.roles ?? [];
    const roleRows = await this.prisma.role.findMany({ where: { slug: { in: roles } } });
    const has = roleRows.some((r) => r.permissions.includes(required));
    if (!has) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
