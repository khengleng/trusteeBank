import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config';
import { Recorder } from './evidence';
import { TrusteeClient } from './clients/trustee';
import { PayChainClient, PayKHClient } from './clients/platforms';
import { runE2E01, runControls, type Ctx } from './scenarios';
import { renderHtml, renderJson, type RunMeta } from './report';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
  const controlsOnly = args.includes('--controls-only');

  const cfg = loadConfig();
  const startedAt = new Date().toISOString();
  const runId = 'e2e-' + startedAt.replace(/[:.]/g, '-');
  const rec = new Recorder(() => new Date().toISOString());
  const ctx: Ctx = {
    cfg,
    rec,
    trustee: new TrusteeClient(cfg),
    paychain: new PayChainClient(cfg),
    paykh: new PayKHClient(cfg),
  };

  // Preflight: trustee reachable at all?
  const health = await ctx.trustee.health();
  rec.record({ testId: 'PRE-01', title: 'Trustee reachable', controlObjective: ['CO-1'], platform: 'trustee', detail: { status: health.status, body: health.json }, verdict: health.ok ? 'PASS' : 'NOT_READY' });

  if (!controlsOnly && (!only || only === 'E2E-01')) await runE2E01(ctx);
  if (!only || only === 'controls') await runControls(ctx);

  const finishedAt = new Date().toISOString();
  const meta: RunMeta = {
    runId,
    startedAt,
    finishedAt,
    outcome: rec.outcome(),
    summary: rec.summary(),
    manifest: rec.manifest(runId),
    env: { trustee: cfg.trusteeBase, paychain: cfg.paychainBase, paykh: cfg.paykhBase, horizon: cfg.stellarHorizon },
  };

  const outDir = cfg.outDir || join(process.cwd(), 'evidence', runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), renderJson(meta, rec.all()));
  writeFileSync(join(outDir, 'report.html'), renderHtml(meta, rec.all()));
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(meta.manifest, null, 2));

  const s = meta.summary;
  console.log(`\nRun ${runId}`);
  console.log(`Outcome: ${meta.outcome}  (${s.pass} PASS · ${s.fail} FAIL · ${s.notReady} NOT_READY of ${s.total})`);
  console.log(`Manifest root: ${meta.manifest.rootHash}`);
  console.log(`Evidence pack: ${outDir}/report.html`);

  // Non-zero exit unless a clean PASS (CI gate).
  process.exit(meta.outcome === 'PASS' ? 0 : meta.outcome === 'NOT_READY' ? 2 : 1);
}

main().catch((err) => {
  console.error('audit harness error:', err);
  process.exit(1);
});
