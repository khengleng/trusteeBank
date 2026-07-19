import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClientAuthService } from '../infra/client-auth.service';
import { UserAuthService } from '../infra/user-auth.service';

/**
 * Authenticates the caller and enforces client separation (update §3, §8, domain
 * config). Two principal types are accepted:
 *
 *  - **Client credentials** (`X-Client-Id`/`X-Client-Secret` or Basic) — for
 *    PayChain, PayKH and trustee-bank service integrations. Namespace-scoped:
 *    PayChain creds cannot reach PayKH routes, etc.
 *  - **User session token** (`Authorization: Bearer <token>`) — a trustee-bank
 *    operator logged into the admin console with password + MFA. Valid only for
 *    the TRUSTEE_BANK namespaces (`/trustee`, `/bank`, `/admin`) and only if the
 *    user's institution is TRUSTEE_BANK.
 *
 * Exempt namespaces (health, docs, well-known, root, `/api/v1/auth`) need no
 * credential. The authenticated principal is attached to `req.principal`.
 */
@Injectable()
export class ClientSeparationGuard implements CanActivate {
  constructor(
    private readonly clientAuth: ClientAuthService,
    private readonly userAuth: UserAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const required = ClientSeparationGuard.requiredPlatform(req.path);
    if (required === null) return true; // exempt namespace

    // 1) User bearer token — only for TRUSTEE_BANK namespaces.
    const bearer = ClientSeparationGuard.bearer(req);
    if (bearer) {
      const user = this.userAuth.verifyToken(bearer);
      if (!user) throw new UnauthorizedException('Invalid or expired session token');
      if (required !== 'TRUSTEE_BANK' || user.institution !== 'TRUSTEE_BANK') {
        throw new ForbiddenException('User session not permitted for this namespace');
      }
      // Enrollment-scoped sessions (password verified, MFA not yet activated)
      // may reach only the /api/v1/auth endpoints (exempt above). Operator APIs
      // are blocked until MFA is enrolled.
      if (user.mfaPending) {
        throw new ForbiddenException(
          'MFA enrollment required — activate two-factor auth via /api/v1/auth/mfa/setup before using operator APIs',
        );
      }
      (req as Request & { principal?: unknown }).principal = { type: 'user', ...user };
      return true;
    }

    // 2) Client credentials.
    const creds = ClientSeparationGuard.extractCredentials(req);
    if (!creds) {
      throw new UnauthorizedException('Credentials required (X-Client-Id/Secret or Bearer token)');
    }
    const client = await this.clientAuth.verify(creds.clientId, creds.secret);
    if (!client) throw new UnauthorizedException('Invalid client credentials');
    if (client.platform !== required) {
      throw new ForbiddenException(
        `Client ${client.platform} may not access ${required} APIs (client separation)`,
      );
    }
    (req as Request & { principal?: unknown }).principal = { type: 'client', ...client };
    return true;
  }

  private static bearer(req: Request): string | null {
    const authz = req.headers['authorization'];
    if (typeof authz === 'string' && authz.startsWith('Bearer ')) return authz.slice(7).trim();
    return null;
  }

  private static extractCredentials(
    req: Request,
  ): { clientId: string; secret: string } | null {
    const id = req.headers['x-client-id'];
    const secret = req.headers['x-client-secret'];
    if (typeof id === 'string' && typeof secret === 'string' && id && secret) {
      return { clientId: id, secret };
    }
    const authz = req.headers['authorization'];
    if (typeof authz === 'string' && authz.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authz.slice(6), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx > 0) return { clientId: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
      } catch {
        return null;
      }
    }
    return null;
  }

  private static requiredPlatform(path: string): string | null {
    if (path.startsWith('/api/v1/auth')) return null; // login endpoints are open
    if (path.startsWith('/api/v1/paychain')) return 'PAYCHAIN';
    if (path.startsWith('/api/v1/paykh')) return 'PAYKH';
    if (path.startsWith('/api/v1/bank')) return 'TRUSTEE_BANK';
    if (path.startsWith('/api/v1/trustee')) return 'TRUSTEE_BANK';
    if (path.startsWith('/api/v1/admin')) return 'TRUSTEE_BANK';
    return null;
  }
}
