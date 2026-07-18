import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { canonicalize, sha256Hex, verifyPayload } from '@trustee/cryptography';
import { PrismaService } from '../infra/prisma.service';
import { ClockService } from '../infra/clock.service';

const MAX_SKEW_SECONDS = Number(process.env.MAX_REQUEST_SKEW_SECONDS ?? 300);
const NONCE_TTL_SECONDS = MAX_SKEW_SECONDS + 60;

/**
 * Request signing, timestamp freshness and replay prevention (§28,
 * changeforpaychainandpaykh §8). Enforced for value-changing requests from
 * CLIENT principals whose registered ClientApplication has `requireSignature`
 * set and a `publicKeyPem`. Clients send:
 *
 *   X-Timestamp: <epoch ms>
 *   X-Nonce:     <unique per request>
 *   X-Signature: <base64 ed25519 over the canonical subject>
 *
 * Subject = canonical JSON of { method, path, clientId, timestamp, nonce,
 * bodyHash } where bodyHash = sha256(canonical(body)). Stale timestamps, reused
 * nonces and invalid signatures are rejected. Runs after ClientSeparationGuard.
 */
@Injectable()
export class RequestSignatureGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { principal?: { type: string; oauthClientId?: string } }>();

    const principal = req.principal;
    // Only client integrations sign; user/admin sessions and reads are exempt.
    if (!principal || principal.type !== 'client') return true;
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return true;

    const client = await this.prisma.clientApplication.findUnique({
      where: { oauthClientId: principal.oauthClientId ?? '' },
    });
    if (!client || !client.requireSignature) return true; // signing not enabled
    if (!client.publicKeyPem) {
      throw new ForbiddenException('Signing required but no public key registered for client');
    }

    const timestamp = req.header('x-timestamp');
    const nonce = req.header('x-nonce');
    const signature = req.header('x-signature');
    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedException('Missing X-Timestamp/X-Nonce/X-Signature');
    }

    const tsMs = Number(timestamp);
    const nowMs = this.clock.now().getTime();
    if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > MAX_SKEW_SECONDS * 1000) {
      throw new UnauthorizedException('Stale or invalid request timestamp');
    }

    const bodyHash = sha256Hex(canonicalize(req.body ?? {}));
    const subject = {
      method: req.method,
      path: req.path,
      clientId: client.oauthClientId,
      timestamp,
      nonce,
      bodyHash,
    };
    const ok = verifyPayload(client.publicKeyPem, subject, {
      keyId: client.oauthClientId,
      algorithm: 'ed25519',
      value: signature,
    });
    if (!ok) throw new UnauthorizedException('Invalid request signature');

    // Replay prevention: a nonce may be used once within its window.
    try {
      await this.prisma.nonceUsage.create({
        data: {
          nonce,
          clientId: client.oauthClientId,
          expiresAt: new Date(nowMs + NONCE_TTL_SECONDS * 1000),
        },
      });
    } catch {
      throw new UnauthorizedException('Replayed nonce');
    }
    return true;
  }
}
