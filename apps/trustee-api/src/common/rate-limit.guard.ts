import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../infra/prisma.service';
import { RateLimitService } from '../infra/rate-limit.service';

/**
 * Per-client rate limiting (update §3 "separate rate limits"). Applies to CLIENT
 * principals using the `rateLimitPerMin` configured on their ClientApplication
 * (editable from the admin portal). Emits `X-RateLimit-*` headers and returns
 * 429 with `Retry-After` when the window is exhausted. User/admin sessions and
 * exempt (unauthenticated) routes are not limited here.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { principal?: { type: string; oauthClientId?: string } }>();
    const principal = req.principal;
    if (!principal || principal.type !== 'client' || !principal.oauthClientId) return true;

    const client = await this.prisma.clientApplication.findUnique({
      where: { oauthClientId: principal.oauthClientId },
      select: { rateLimitPerMin: true },
    });
    const limit = client?.rateLimitPerMin ?? 600;
    const decision = await this.rateLimit.consume(principal.oauthClientId, limit);

    const res = http.getResponse<Response>();
    res.setHeader('X-RateLimit-Limit', String(decision.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    res.setHeader('X-RateLimit-Reset', String(decision.resetSeconds));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.resetSeconds));
      throw new HttpException(
        { statusCode: 429, message: 'Rate limit exceeded', retryAfterSeconds: decision.resetSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
