import { Injectable } from '@nestjs/common';
import { sha256Hex, hashesEqual } from '@trustee/cryptography';
import { PrismaService } from './prisma.service';

export interface AuthenticatedClient {
  platform: string;
  oauthClientId: string;
  displayName: string;
}

/**
 * Per-client credential verification (update §3, §8, domain config). Each client
 * (PAYCHAIN, PAYKH, TRUSTEE_BANK…) authenticates with its client id + secret.
 * Secrets are stored only as SHA-256 hashes and compared in constant time.
 *
 * This is the pilot credential mechanism. Production layers mTLS + OAuth 2.1
 * client-credentials + request signing on top (domain config, §28).
 */
@Injectable()
export class ClientAuthService {
  constructor(private readonly prisma: PrismaService) {}

  static hashSecret(secret: string): string {
    return sha256Hex(secret);
  }

  async verify(clientId: string, secret: string): Promise<AuthenticatedClient | null> {
    if (!clientId || !secret) return null;
    const client = await this.prisma.clientApplication.findUnique({
      where: { oauthClientId: clientId },
    });
    if (!client || client.disabled || !client.clientSecretHash) return null;
    if (!hashesEqual(sha256Hex(secret), client.clientSecretHash)) return null;
    return {
      platform: client.platform,
      oauthClientId: client.oauthClientId,
      displayName: client.displayName,
    };
  }
}
