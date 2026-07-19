import { MARK_SVG, FAVICON_LINK } from './logo';

/**
 * Developer Hub served at the API host root (api.trustee.cambobia.com). Unlike
 * the marketing landing, this orients an integrating developer: authentication,
 * client separation, request/webhook signing, the machine-readable contracts,
 * and a LIVE signing-key viewer that reads /.well-known/trustee-signing-keys so
 * partners can verify mint-authorization / reserve-snapshot / webhook signatures.
 *
 * Self-contained and theme-aware (no external requests). `{{API_BASE}}` is
 * substituted at render time; empty means same-origin (the API host itself).
 */
export const DEVELOPER_HUB_TEMPLATE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trustee Platform · Developer Hub</title>
${FAVICON_LINK}
<style>
:root{--bg:#0b1020;--card:#141a2e;--card2:#0f1526;--fg:#e8ecf5;--mut:#93a0bd;--acc:#5b8cff;--acc2:#8b5bff;--ok:#35c98b;--warn:#f0b429;--err:#f0556d;--line:#243050;--code:#0a0f1e}
@media(prefers-color-scheme:light){:root{--bg:#f4f6fb;--card:#fff;--card2:#f7f9fd;--fg:#111827;--mut:#5b6579;--acc:#2f5fe0;--acc2:#7b3fe0;--ok:#0a8f5b;--warn:#a15c00;--err:#c8324b;--line:#e3e8f2;--code:#0d1425}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--acc)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:14px;padding:12px 20px}
.brand{display:flex;align-items:center;gap:11px;font-weight:700}
.brand small{display:block;font-weight:500;color:var(--mut);font-size:12px}
nav{margin-left:auto;display:flex;gap:18px;flex-wrap:wrap}nav a{color:var(--mut);text-decoration:none;font-size:14px}nav a:hover{color:var(--fg)}
.hero{padding:44px 0 8px}
h1{font-size:30px;margin:14px 0 6px;letter-spacing:-.5px}
.lede{color:var(--mut);font-size:17px;max-width:720px;margin:0 0 18px}
.pill{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:13px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mut)}
.dot.ok{background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 25%,transparent)}
.dot.err{background:var(--err);box-shadow:0 0 0 4px color-mix(in srgb,var(--err) 25%,transparent)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:22px 0 8px}
.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact .k{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.fact .v{font-size:15px;margin-top:3px;word-break:break-all;font-weight:600}
section{padding:30px 0;border-top:1px solid var(--line)}
h2{font-size:21px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column}
.card h3{margin:0 0 6px;font-size:15px}.card p{margin:0 0 12px;color:var(--mut);font-size:14px}
.card .cta{margin-top:auto}
a.btn{display:inline-block;background:var(--acc);color:#fff;text-decoration:none;padding:9px 15px;border-radius:9px;font-weight:600;font-size:14px}
a.btn.ghost{background:transparent;color:var(--acc);border:1px solid var(--line)}
code,kbd{background:color-mix(in srgb,var(--fg) 9%,transparent);padding:2px 7px;border-radius:6px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--code);color:#dbe4ff;border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre .c{color:#7f8db3}pre .s{color:#9be59b}pre .k2{color:#7fb0ff}
table{width:100%;border-collapse:collapse;font-size:14px;overflow:hidden;border:1px solid var(--line);border-radius:12px}
th,td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;background:var(--card2)}tr:last-child td{border-bottom:0}
.note{background:var(--card2);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:10px;padding:13px 15px;font-size:14px;color:var(--mut);margin:14px 0}
.keys{display:grid;gap:10px;margin-top:6px}
.key{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:12px 14px;font-size:13px}
.key .row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.key .purpose{font-weight:700}.key .kid{color:var(--acc);font-family:ui-monospace,monospace}
.key details{margin-top:8px}.key summary{cursor:pointer;color:var(--mut);font-size:12px}
.key pre{margin:8px 0 0;font-size:11px;padding:10px}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mut)}
.foot{color:var(--mut);font-size:13px;padding:26px 0 50px;border-top:1px solid var(--line)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:720px){.two{grid-template-columns:1fr}nav{display:none}}
</style></head><body>

<header class="top"><div class="wrap">
<span class="brand"><span>${MARK_SVG}</span><span>Trustee Platform<small>Developer Hub</small></span></span>
<nav>
<a href="#auth">Auth</a><a href="#reference">API reference</a><a href="#webhooks">Webhooks</a><a href="#verify">Verify signatures</a><a href="#limits">Limits &amp; errors</a>
</nav>
</div></header>

<div class="wrap">
<div class="hero">
<span class="pill" id="statusPill"><span class="dot" id="statusDot"></span> <span id="statusText">checking status…</span></span>
<h1>Build against the Trustee Platform API</h1>
<p class="lede">The trustee is the institutional reserve &amp; safeguarding layer behind PayChain and PayKH. It verifies that real, cleared bank money exists before digital value is minted or a payment is confirmed — and signs the evidence. This hub has everything you need to integrate and to verify what we sign.</p>
<div class="facts">
<div class="fact"><div class="k">Base URL</div><div class="v" id="baseUrl">—</div></div>
<div class="fact"><div class="k">API version</div><div class="v">v1 <span class="badge">path-prefixed</span></div></div>
<div class="fact"><div class="k">Signing keys (JWKS)</div><div class="v"><a href="{{API_BASE}}/.well-known/trustee-signing-keys">/.well-known/trustee-signing-keys</a></div></div>
<div class="fact"><div class="k">OpenAPI</div><div class="v"><a href="{{API_BASE}}/api/v1/openapi.json">/api/v1/openapi.json</a></div></div>
</div>
</div>

<section id="auth">
<h2>Authentication</h2>
<p class="sub">Every integration call carries client credentials. Credentials are namespace-scoped — client separation is enforced server-side.</p>
<div class="two">
<div>
<p><strong>1 · Client credentials.</strong> Send your issued client id and secret on every request:</p>
<pre><span class="k2">X-Client-Id</span>:     client_your_app
<span class="k2">X-Client-Secret</span>: sk_live_…</pre>
<p class="note"><strong>Client separation:</strong> PayChain credentials may call <code>/api/v1/paychain/*</code> only; PayKH credentials <code>/api/v1/paykh/*</code> only. Cross-namespace calls return <code>403</code>. Trustee-bank operators use a session bearer token for <code>/bank</code> and <code>/admin</code>.</p>
</div>
<div>
<p><strong>2 · Request signing</strong> (when your client has signing enabled). Value-changing requests (POST/PUT/PATCH/DELETE) are Ed25519-signed:</p>
<pre><span class="k2">X-Timestamp</span>: 1721349000000   <span class="c"># epoch ms, within 5 min</span>
<span class="k2">X-Nonce</span>: &lt;unique per request&gt;
<span class="k2">X-Signature</span>: base64(ed25519 over subject)</pre>
<p style="color:var(--mut);font-size:13px">Subject = canonical JSON of <code>{method, path, clientId, timestamp, nonce, bodyHash}</code>, where <code>bodyHash = sha256(canonical(body))</code>. Stale timestamps and reused nonces are rejected (replay protection).</p>
<p><strong>3 · Idempotency.</strong> Send <code>Idempotency-Key</code> on POSTs; retried keys return the original result, never a duplicate action.</p>
</div>
</div>
</section>

<section id="reference">
<h2>API reference</h2>
<p class="sub">Interactive Swagger UIs and machine-readable OpenAPI — scoped so each partner sees only its own contract.</p>
<div class="grid">
<div class="card"><h3>PayChain API</h3><p>Funding, cleared-reserve verification, maker-checker mint authorization, proof-of-reserve, reconciliation.</p><div class="cta"><a class="btn" href="{{API_BASE}}/docs/paychain">Open Swagger →</a> &nbsp; <a class="btn ghost" href="{{API_BASE}}/api/v1/openapi/paychain.json">OpenAPI JSON</a></div></div>
<div class="card"><h3>PayKH API</h3><p>KHQR payment confirmation, duplicate-safe matching, program-fund safeguarding, settlement reconciliation.</p><div class="cta"><a class="btn" href="{{API_BASE}}/docs/paykh">Open Swagger →</a> &nbsp; <a class="btn ghost" href="{{API_BASE}}/api/v1/openapi/paykh.json">OpenAPI JSON</a></div></div>
<div class="card"><h3>Event contract</h3><p>Signed artifacts the trustee emits so you can <em>act</em> on events, not just log them: <code>mint.authorization.approved</code>, <code>reserve.snapshot.created</code>.</p><div class="cta"><a class="btn ghost" href="#webhooks">Webhooks &amp; events ↓</a></div></div>
</div>
</section>

<section id="webhooks">
<h2>Webhooks &amp; events</h2>
<p class="sub">The trustee delivers signed event envelopes to your registered URL. Delivery is at-least-once — dedupe on the event <code>id</code>.</p>
<div class="two">
<div>
<h3 style="font-size:15px;margin:0 0 8px">Envelope &amp; headers</h3>
<table>
<tr><th>Header</th><th>Meaning</th></tr>
<tr><td><code>X-Signature</code> / <code>X-Trustee-Signature</code></td><td>Ed25519 over <code>timestamp.rawBody</code> (webhook key)</td></tr>
<tr><td><code>X-Timestamp</code> / <code>X-Trustee-Timestamp</code></td><td>Epoch ms; reject if skew &gt; 5 min</td></tr>
<tr><td><code>X-Trustee-Event-Id</code></td><td>Idempotency key — dedupe on this</td></tr>
<tr><td><code>X-Trustee-Correlation-Id</code></td><td>Follows the flow across systems</td></tr>
</table>
<p class="note">Failed deliveries retry with backoff and are <strong>dead-lettered</strong> after 8 attempts. Operators can inspect every attempt and <strong>replay</strong> from the admin delivery log.</p>
</div>
<div>
<h3 style="font-size:15px;margin:0 0 8px">Signed artifacts</h3>
<p style="margin:0 0 8px;color:var(--mut);font-size:14px">Actionable events carry an inner <code>artifact</code> (canonical JSON string) plus a <code>signature</code> object signed by a purpose-specific key — independent of the envelope signature.</p>
<pre>{
  <span class="k2">"type"</span>: <span class="s">"mint.authorization.approved"</span>,
  <span class="k2">"id"</span>: <span class="s">"evt_…"</span>, <span class="k2">"occurredAt"</span>: <span class="s">"…Z"</span>,
  <span class="k2">"artifact"</span>: <span class="s">"{\\"amount\\":\\"100000\\",\\"assetId\\":\\"PUSD\\",…,\\"reference\\":\\"&lt;your mint-request id&gt;\\"}"</span>,
  <span class="k2">"signature"</span>: {
    <span class="k2">"keyId"</span>: <span class="s">"mint_authorization-v1"</span>,
    <span class="k2">"alg"</span>: <span class="s">"ed25519"</span>,
    <span class="k2">"value"</span>: <span class="s">"base64…"</span>
  }
}</pre>
<p style="color:var(--mut);font-size:13px;margin:8px 0 0"><code>reference</code> equals the mint-request id you submitted; <code>assetId</code>/<code>amount</code>/<code>destination</code> match your request. Verify <code>signature.value</code> over the exact <code>artifact</code> bytes with the matching JWKS key below.</p>
</div>
</div>
</section>

<section id="verify">
<h2>Verify what we sign</h2>
<p class="sub">Live public keys from this environment. Use the key whose <code>keyId</code> matches the artifact's <code>signature.keyId</code>.</p>
<div class="keys" id="keys"><div class="key">Loading signing keys…</div></div>
<h3 style="font-size:15px;margin:22px 0 8px">Verify an artifact (Node)</h3>
<pre><span class="k2">const</span> crypto = require(<span class="s">'crypto'</span>);
<span class="c">// body = parsed webhook JSON; jwks = GET /.well-known/trustee-signing-keys</span>
<span class="k2">const</span> key = jwks.keys.find(k =&gt; k.keyId === body.signature.keyId);
<span class="k2">const</span> pub = crypto.createPublicKey(key.publicKeyPem);
<span class="k2">const</span> ok  = crypto.verify(<span class="k2">null</span>, Buffer.from(body.artifact),
                        pub, Buffer.from(body.signature.value, <span class="s">'base64'</span>));
<span class="c">// ok === true  → the trustee authorized exactly this artifact</span></pre>
</section>

<section id="limits">
<h2>Rate limits &amp; errors</h2>
<div class="two">
<div>
<h3 style="font-size:15px;margin:0 0 8px">Rate limits</h3>
<p style="color:var(--mut);font-size:14px;margin:0 0 8px">Per-client, configurable by trustee operators. Every response carries:</p>
<pre><span class="k2">X-RateLimit-Limit</span>: 600
<span class="k2">X-RateLimit-Remaining</span>: 597
<span class="k2">X-RateLimit-Reset</span>: 42</pre>
<p style="color:var(--mut);font-size:14px">Over the limit returns <code>429</code> with <code>Retry-After</code> (seconds).</p>
</div>
<div>
<h3 style="font-size:15px;margin:0 0 8px">Error shape</h3>
<p style="color:var(--mut);font-size:14px;margin:0 0 8px">Errors are JSON with an HTTP status and a machine-stable message:</p>
<pre>{
  <span class="k2">"statusCode"</span>: 403,
  <span class="k2">"message"</span>: <span class="s">"Client PAYKH may not access PAYCHAIN APIs"</span>,
  <span class="k2">"error"</span>: <span class="s">"Forbidden"</span>
}</pre>
<p style="color:var(--mut);font-size:14px">Validation errors return <code>400</code> with a <code>message</code> array of field problems.</p>
</div>
</div>
</section>

<div class="foot">
Regulated institutional platform. Real-money production is gated pending trustee-bank and regulatory approval. Need credentials or a webhook URL registered? Contact your trustee integration manager. © Cambobia.
</div>
</div>

<script>
(function(){
  var API = "{{API_BASE}}";
  var origin = API || (location.origin);
  var b = document.getElementById('baseUrl'); if(b) b.textContent = origin;

  // Live platform status.
  fetch(API + '/health').then(function(r){return r.json();}).then(function(d){
    var ok = d && d.status === 'ok';
    document.getElementById('statusDot').className = 'dot ' + (ok?'ok':'err');
    document.getElementById('statusText').textContent = ok ? 'Platform operational' : 'Degraded';
  }).catch(function(){
    document.getElementById('statusDot').className = 'dot err';
    document.getElementById('statusText').textContent = 'Unreachable';
  });

  // Live signing keys.
  fetch(API + '/.well-known/trustee-signing-keys').then(function(r){return r.json();}).then(function(d){
    var el = document.getElementById('keys');
    if(!d || !d.keys || !d.keys.length){ el.innerHTML = '<div class="key">No keys published.</div>'; return; }
    el.innerHTML = '';
    d.keys.forEach(function(k){
      var div = document.createElement('div'); div.className = 'key';
      var row = document.createElement('div'); row.className = 'row';
      var left = document.createElement('span'); left.className = 'purpose'; left.textContent = k.purpose;
      var right = document.createElement('span'); right.className = 'kid'; right.textContent = k.keyId;
      row.appendChild(left); row.appendChild(right); div.appendChild(row);
      if(k.publicKeyPem){
        var det = document.createElement('details');
        var sum = document.createElement('summary'); sum.textContent = 'public key (PEM)';
        var pre = document.createElement('pre'); pre.textContent = k.publicKeyPem.trim();
        det.appendChild(sum); det.appendChild(pre); div.appendChild(det);
      }
      el.appendChild(div);
    });
  }).catch(function(){
    document.getElementById('keys').innerHTML = '<div class="key">Could not load signing keys.</div>';
  });
})();
</script>
</body></html>`;
