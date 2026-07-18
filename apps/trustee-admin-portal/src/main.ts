/**
 * Trustee Admin Portal — a standalone web service (Railway service
 * `trustee-admin-portal`, domain `trustee.cambobia.com`) separate from the API
 * gateway. It serves the admin console UI only; all data operations go to the
 * trustee API (`api.trustee.cambobia.com`) with TRUSTEE_BANK credentials the
 * operator enters. No database, no secrets — just the UI.
 */
import express from 'express';
import { adminConsoleHtml, landingHtml } from '@trustee/portal-ui';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const apiBase = process.env.TRUSTEE_API_URL ?? 'https://api.trustee.cambobia.com';
const adminUrl = process.env.TRUSTEE_PUBLIC_URL ?? 'https://trustee.cambobia.com';

const console_ = adminConsoleHtml(apiBase);
const LANDING_HTML = landingHtml(adminUrl);

app.disable('x-powered-by');

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'trustee-admin-portal' }));

// The admin console is the portal's primary surface.
app.get(['/', '/admin'], (_req, res) => {
  res.type('html').send(console_);
});
app.get('/status', (_req, res) => {
  res.type('html').send(LANDING_HTML);
});

app.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Trustee Admin Portal on :${port} → API ${apiBase}`);
});
