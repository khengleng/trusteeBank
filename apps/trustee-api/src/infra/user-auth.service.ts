import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';
import {
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  verifyTotp,
  otpauthUrl,
  sha256Hex,
} from '@trustee/cryptography';
import { PrismaService } from './prisma.service';
import { ClockService } from './clock.service';
import { NotificationService } from './notification.service';

export interface UserPrincipal {
  userId: string;
  email: string;
  institution: string;
  roles: string[];
}

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 3600);

/**
 * User login for the trustee admin console (§8): email + password + TOTP MFA.
 * Issues a short-lived HMAC-signed session token used as a Bearer credential for
 * the admin/trustee/bank namespaces. Passwords are scrypt-verified; MFA is TOTP.
 */
@Injectable()
export class UserAuthService {
  private readonly logger = new Logger(UserAuthService.name);
  private readonly secret =
    process.env.SESSION_SECRET ?? 'dev-session-secret-change-me';

  private readonly resetTtlSeconds = Number(process.env.PASSWORD_RESET_TTL_SECONDS ?? 3600);
  private readonly portalUrl = process.env.TRUSTEE_PUBLIC_URL ?? 'https://trustee.cambobia.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly notify: NotificationService,
  ) {
    if (!process.env.SESSION_SECRET) {
      this.logger.warn('SESSION_SECRET not set — using a dev fallback. Set it in production.');
    }
  }

  /** Self-service password change (requires the current password). */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    this.assertPasswordStrength(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } });
    return { changed: true };
  }

  /**
   * Forgot-password: issue a single-use, expiring reset token and email a reset
   * link via Resend. Always resolves the same way whether or not the email
   * exists (no account enumeration).
   */
  async requestPasswordReset(email: string): Promise<{ requested: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.disabled) {
      const token = randomBytes(32).toString('base64url');
      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(this.clock.now().getTime() + this.resetTtlSeconds * 1000),
        },
      });
      const link = `${this.portalUrl}/?reset_token=${token}`;
      await this.notify.notify(
        'Password reset request',
        `A password reset was requested for ${email}.\nReset your password (valid ${Math.round(
          this.resetTtlSeconds / 60,
        )} min): ${link}\nIf you did not request this, ignore this email.`,
        email, // deliver to the requesting user, not the ops inbox
      );
    }
    return { requested: true };
  }

  /** Complete a reset with a valid token. */
  async resetPassword(token: string, newPassword: string) {
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < this.clock.now().getTime()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    this.assertPasswordStrength(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: hashPassword(newPassword) } }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: this.clock.now() } }),
    ]);
    return { reset: true };
  }

  /** Admin-initiated reset: set a supplied password for a user (§8). */
  async adminSetPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    this.assertPasswordStrength(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } });
    return { userId, updated: true };
  }

  private assertPasswordStrength(pw: string): void {
    if (!pw || pw.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }
  }

  /**
   * Step 1/2 of login. With a correct password: if MFA is enabled a code is
   * required (returns `{ mfaRequired: true }` when omitted); otherwise a token
   * is issued.
   */
  async login(email: string, password: string, code?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabled || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.mfaEnabled) {
      if (!code) return { mfaRequired: true };
      if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code, this.clock.now().getTime())) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }
    return {
      mfaRequired: false,
      token: this.issueToken({ userId: user.id, email: user.email, institution: user.institution, roles: user.roles }),
      user: { userId: user.id, email: user.email, roles: user.roles, institution: user.institution, mfaEnabled: user.mfaEnabled },
    };
  }

  /**
   * Begin MFA enrollment: generate a secret and return the otpauth URL plus a
   * scannable QR-code data URI for the admin console.
   */
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
    const uri = otpauthUrl(secret, user.email);
    const qrDataUri = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return { secret, otpauthUrl: uri, qrDataUri };
  }

  /** Confirm enrollment by verifying a code; enables MFA. */
  async enableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new BadRequestException('Start MFA setup first');
    if (!verifyTotp(user.mfaSecret, code, this.clock.now().getTime())) {
      throw new UnauthorizedException('Invalid MFA code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return { mfaEnabled: true };
  }

  issueToken(p: UserPrincipal): string {
    const payload = {
      sub: p.userId,
      email: p.email,
      inst: p.institution,
      roles: p.roles,
      exp: Math.floor(this.clock.now().getTime() / 1000) + SESSION_TTL_SECONDS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  verifyToken(token: string): UserPrincipal | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = this.sign(body);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
        sub: string; email: string; inst: string; roles: string[]; exp: number;
      };
      if (p.exp * 1000 < this.clock.now().getTime()) return null;
      return { userId: p.sub, email: p.email, institution: p.inst, roles: p.roles };
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
