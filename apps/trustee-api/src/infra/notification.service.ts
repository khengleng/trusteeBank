import { Injectable, Logger } from '@nestjs/common';

/**
 * Stakeholder notifications (§30 "Notification to authorized stakeholders").
 * Uses Resend (resend.com) via its HTTP API when RESEND_API_KEY is configured;
 * otherwise logs the notification (safe no-op in dev). From/reply-to is the
 * platform owner contact. Never includes secrets or restricted data (§37).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.NOTIFY_FROM ?? 'Cambobia Trustee <contact@cambobia.com>';
  private readonly to = (process.env.NOTIFY_TO ?? 'contact@cambobia.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async notify(subject: string, text: string): Promise<{ sent: boolean }> {
    if (!this.apiKey) {
      this.logger.warn(`[notify:log-only] ${subject} — ${text}`);
      return { sent: false };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: this.to,
          subject: `[Trustee] ${subject}`,
          text,
        }),
      });
      if (!res.ok) {
        this.logger.error(`Resend send failed: ${res.status}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (err) {
      this.logger.error(`Resend send error: ${(err as Error).message}`);
      return { sent: false };
    }
  }
}
