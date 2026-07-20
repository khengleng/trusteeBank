import { createHash } from 'node:crypto';

export type Verdict = 'PASS' | 'FAIL' | 'NOT_READY';

export interface EvidenceRecord {
  testId: string;
  title: string;
  controlObjective: string[];
  platform: 'trustee' | 'paychain' | 'paykh' | 'auditor';
  timestamp: string;
  detail: Record<string, unknown>;
  /** Verbatim signed artifact bytes + signature, when applicable (regulator re-verify). */
  artifact?: { type: string; canonical: string; signature?: { keyId: string; alg: string; value: string } };
  independentCheck?: { method: string; result: Verdict; note?: string };
  verdict: Verdict;
  evidenceHash?: string;
}

function sha256Hex(s: string): string {
  return 'sha256:' + createHash('sha256').update(s).digest('hex');
}

/** Collects evidence records and produces a tamper-evident manifest. */
export class Recorder {
  private records: EvidenceRecord[] = [];
  constructor(private readonly now: () => string) {}

  record(r: Omit<EvidenceRecord, 'timestamp' | 'evidenceHash'>): EvidenceRecord {
    const full: EvidenceRecord = { ...r, timestamp: this.now() };
    // Content hash over the deterministic record (excluding the hash field).
    full.evidenceHash = sha256Hex(JSON.stringify(full));
    this.records.push(full);
    return full;
  }

  all(): EvidenceRecord[] {
    return this.records;
  }

  summary(): { total: number; pass: number; fail: number; notReady: number } {
    const pass = this.records.filter((r) => r.verdict === 'PASS').length;
    const fail = this.records.filter((r) => r.verdict === 'FAIL').length;
    const notReady = this.records.filter((r) => r.verdict === 'NOT_READY').length;
    return { total: this.records.length, pass, fail, notReady };
  }

  /** Overall run outcome for sign-off (§8 of the test plan). */
  outcome(): Verdict {
    const s = this.summary();
    if (s.fail > 0) return 'FAIL';
    if (s.notReady > 0) return 'NOT_READY';
    return 'PASS';
  }

  /** Tamper-evident manifest: each record hash chained into a root hash. */
  manifest(runId: string): { runId: string; recordHashes: string[]; rootHash: string } {
    const recordHashes = this.records.map((r) => r.evidenceHash!);
    const rootHash = sha256Hex(recordHashes.join('|'));
    return { runId, recordHashes, rootHash };
  }
}
