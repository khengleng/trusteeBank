import { LANDING_HTML } from './landing.html';
import { ADMIN_CONSOLE_TEMPLATE } from './admin-console.html';
import { DEVELOPER_HUB_TEMPLATE } from './developer-hub.html';

export { LANDING_HTML };

/**
 * Render the Developer Hub for the API host root. `apiBase` targets the API for
 * the page's live health + JWKS fetches; empty means same-origin (correct when
 * the API itself serves this page at api.trustee.cambobia.com).
 */
export function developerHubHtml(apiBase = ''): string {
  return DEVELOPER_HUB_TEMPLATE.split('{{API_BASE}}').join(apiBase);
}

/**
 * Render the landing/status page with the admin console link pointing at the
 * absolute admin portal URL (trustee.cambobia.com), so the button works no
 * matter which host serves the landing.
 */
export function landingHtml(adminUrl = 'https://trustee.cambobia.com'): string {
  return LANDING_HTML.replace('href="/admin"', `href="${adminUrl}"`);
}

/**
 * Render the admin console with an injected API base URL. When served from a
 * different origin than the API (the separate portal service), the console's
 * fetch calls target `apiBase`; when empty, calls are same-origin.
 */
export function adminConsoleHtml(apiBase = ''): string {
  const inject = `<script>window.__API_BASE__=${JSON.stringify(apiBase)};</script>`;
  return ADMIN_CONSOLE_TEMPLATE.replace('</head>', `${inject}</head>`);
}
