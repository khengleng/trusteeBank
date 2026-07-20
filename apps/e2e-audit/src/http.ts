/** Minimal HTTP helper (Node 18+ global fetch) with client-credential auth. */
export interface HttpResult {
  ok: boolean;
  status: number;
  json: any;
  text: string;
  headers: Record<string, string>;
}

export interface Creds {
  base: string;
  clientId?: string;
  clientSecret?: string;
}

export async function call(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 12000,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (creds.clientId) headers['x-client-id'] = creds.clientId;
  if (creds.clientSecret) headers['x-client-secret'] = creds.clientSecret;
  try {
    const res = await fetch(creds.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* non-JSON */
    }
    const hdrs: Record<string, string> = {};
    res.headers.forEach((v, k) => (hdrs[k] = v));
    return { ok: res.ok, status: res.status, json, text, headers: hdrs };
  } catch (err) {
    return { ok: false, status: 0, json: undefined, text: (err as Error).message, headers: {} };
  } finally {
    clearTimeout(timer);
  }
}
