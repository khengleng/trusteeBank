import type { EvidenceRecord, Verdict } from './evidence';

const COLOR: Record<Verdict, string> = { PASS: '#1a7f37', FAIL: '#b42318', NOT_READY: '#9a6700' };

export interface RunMeta {
  runId: string;
  startedAt: string;
  finishedAt: string;
  outcome: Verdict;
  summary: { total: number; pass: number; fail: number; notReady: number };
  manifest: { runId: string; recordHashes: string[]; rootHash: string };
  env: { trustee: string; paychain: string; paykh: string; horizon: string };
}

export function renderJson(meta: RunMeta, records: EvidenceRecord[]): string {
  return JSON.stringify({ meta, records }, null, 2);
}

/** Self-contained HTML evidence report for the regulator pack. */
export function renderHtml(meta: RunMeta, records: EvidenceRecord[]): string {
  const badge = (v: Verdict) => `<span style="color:#fff;background:${COLOR[v]};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600">${v}</span>`;
  const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

  // Control-objective coverage.
  const cos = new Map<string, { pass: number; fail: number; notReady: number }>();
  for (const r of records) for (const co of r.controlObjective) {
    const e = cos.get(co) ?? { pass: 0, fail: 0, notReady: 0 };
    if (r.verdict === 'PASS') e.pass++; else if (r.verdict === 'FAIL') e.fail++; else e.notReady++;
    cos.set(co, e);
  }
  const coRows = [...cos.entries()].sort().map(([co, e]) => {
    const v: Verdict = e.fail ? 'FAIL' : e.notReady ? 'NOT_READY' : 'PASS';
    return `<tr><td><b>${co}</b></td><td>${badge(v)}</td><td class="muted">${e.pass} pass · ${e.fail} fail · ${e.notReady} not-ready</td></tr>`;
  }).join('');

  const rows = records.map((r) => `<tr>
    <td><code>${esc(r.testId)}</code></td>
    <td>${esc(r.title)}</td>
    <td>${esc(r.platform)}</td>
    <td>${r.controlObjective.map((c) => `<span class="tag">${esc(c)}</span>`).join(' ')}</td>
    <td>${badge(r.verdict)}</td>
    <td class="muted">${esc(r.independentCheck ? r.independentCheck.method + ' → ' + r.independentCheck.result + (r.independentCheck.note ? ' · ' + r.independentCheck.note : '') : '')}</td>
    <td class="muted"><details><summary>evidence</summary><pre>${esc(JSON.stringify({ detail: r.detail, artifact: r.artifact ? { type: r.artifact.type, signature: r.artifact.signature } : undefined, evidenceHash: r.evidenceHash }, null, 2))}</pre></details></td>
  </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E2E Regulator Evidence — ${esc(meta.runId)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f8fa;color:#1f2328}
  .wrap{max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#656d76}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:16px;margin:14px 0}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #eaecef;vertical-align:top}
  th{color:#656d76;font-weight:600} code{background:#eff1f3;padding:1px 5px;border-radius:5px;font-size:12px}
  .tag{background:#ddf4ff;color:#0969da;border-radius:9px;padding:1px 7px;font-size:11px}
  pre{white-space:pre-wrap;font-size:11px;background:#f6f8fa;padding:8px;border-radius:6px;max-width:520px;overflow:auto}
  .kpi{display:inline-block;padding:10px 16px;border-radius:8px;margin-right:10px;font-weight:600}
</style></head><body><div class="wrap">
  <h1>End-to-End Regulator-Readiness Evidence</h1>
  <p class="muted">Trustee Internal Audit · Run <code>${esc(meta.runId)}</code> · ${esc(meta.startedAt)} → ${esc(meta.finishedAt)}</p>
  <div class="card">
    <div class="kpi" style="background:${COLOR[meta.outcome]};color:#fff">OUTCOME: ${meta.outcome}</div>
    <span class="kpi" style="background:#dafbe1;color:#1a7f37">${meta.summary.pass} PASS</span>
    <span class="kpi" style="background:#ffebe9;color:#b42318">${meta.summary.fail} FAIL</span>
    <span class="kpi" style="background:#fff8c5;color:#9a6700">${meta.summary.notReady} NOT_READY</span>
    <p class="muted" style="margin-bottom:0">Environment — trustee: ${esc(meta.env.trustee)} · PayChain: ${esc(meta.env.paychain || '(not configured)')} · PayKH: ${esc(meta.env.paykh || '(not configured)')} · Horizon: ${esc(meta.env.horizon)}</p>
  </div>
  <div class="card"><h3>Control-objective coverage</h3><table><tr><th>Objective</th><th>Status</th><th>Detail</th></tr>${coRows}</table></div>
  <div class="card"><h3>Test results & evidence</h3><table><tr><th>ID</th><th>Test</th><th>Platform</th><th>Controls</th><th>Verdict</th><th>Independent check</th><th>Evidence</th></tr>${rows}</table></div>
  <div class="card"><h3>Tamper-evidence manifest</h3><p class="muted">${meta.manifest.recordHashes.length} evidence records, each content-hashed.</p><p><b>Root hash:</b> <code>${esc(meta.manifest.rootHash)}</code></p><p class="muted">Any change to any record changes the root. Signed artifacts are stored verbatim in the JSON pack for offline re-verification against the JWKS.</p></div>
</div></body></html>`;
}
