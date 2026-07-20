import 'reflect-metadata';
import { timingSafeEqual } from 'node:crypto';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';
import { FundingModule } from './modules/funding/funding.module';
import { ReserveModule } from './modules/reserve/reserve.module';
import { MintModule } from './modules/mint/mint.module';
import { LiabilityModule } from './modules/liability/liability.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AttestationModule } from './modules/attestation/attestation.module';
import { PaykhModule } from './modules/paykh/paykh.module';

interface DocsRes {
  status(code: number): void;
  send(body: string): void;
  set(field: string, value: string): void;
}

/** Keep only paths whose route starts with one of the allowed prefixes. */
function filterPaths<T extends { paths: Record<string, unknown> }>(doc: T, prefixes: string[]): T {
  const kept: Record<string, unknown> = {};
  for (const [route, item] of Object.entries(doc.paths)) {
    if (prefixes.some((p) => route.startsWith(p))) kept[route] = item;
  }
  return { ...doc, paths: kept };
}

function baseDoc(title: string): DocumentBuilder {
  return new DocumentBuilder()
    .setTitle(title)
    .setDescription('Cambobia Trustee Banking Platform — integration API')
    .setVersion('v1');
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  // Fail closed on the repo-default secret salt in production: the seed derives
  // the super-admin password and pilot client secrets from CLIENT_SECRET_SALT,
  // so the default makes them guessable from the public repo. Refuse to boot
  // until a real salt is set (then re-seed / rotate credentials).
  const salt = process.env.CLIENT_SECRET_SALT;
  if (config.nodeEnv === 'production' && (!salt || salt === 'cambobia-trustee-pilot')) {
    throw new Error(
      'CLIENT_SECRET_SALT must be a non-default secret in production (found unset or the repo default). ' +
        'Set a strong CLIENT_SECRET_SALT, then rotate the super-admin password and client secrets.',
    );
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const logger = new Logger('bootstrap');

  // Strict input validation; reject unknown properties (§28/§37).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // CORS: approved origins only, never wildcard for financial APIs (domain config).
  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.enableShutdownHooks(); // graceful shutdown (Railway reliability §25)

  // Baseline security headers on every response (§37). HSTS enforces TLS;
  // nosniff/frame-options/referrer-policy reduce sniffing, clickjacking and
  // referrer leakage. (No CSP here — the Swagger/dev-hub HTML needs a tuned
  // policy; JSON API responses do not require one.)
  app.use((_req: unknown, res: { set(k: string, v: string): void }, next: () => void) => {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  // Access-control the human-facing surfaces of the API host (Developer Hub,
  // Swagger UIs, OpenAPI JSON, status/marketing) with HTTP Basic auth. The data
  // API keeps its own client-credential auth and is NOT gated here; /health and
  // the public-key JWKS stay open for probes and signature verification.
  const docsUser = process.env.DOCS_ACCESS_USER ?? '';
  const docsPass = process.env.DOCS_ACCESS_PASSWORD ?? '';
  // NOTE: /.well-known/* (JWKS) is intentionally NOT gated — it must stay open so
  // clients, auditors and regulators can independently verify signed artifacts.
  const docsPaths = [/^\/$/, /^\/developers\/?$/, /^\/status\/?$/, /^\/docs(\/|$)/, /^\/api\/v1\/openapi/];
  const safeEqual = (a: string, b: string): boolean => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  };
  app.use((req: { path: string; headers: Record<string, unknown> }, res: DocsRes, next: () => void) => {
    if (!docsPaths.some((re) => re.test(req.path))) return next();
    // Fail closed: if no docs credential is configured, the hub is not public.
    if (!docsPass) {
      res.status(503);
      res.send('Developer Hub access is not configured. Set DOCS_ACCESS_USER/DOCS_ACCESS_PASSWORD.');
      return;
    }
    const header = String(req.headers['authorization'] ?? '');
    if (header.startsWith('Basic ')) {
      const [u, p] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
      if (safeEqual(u ?? '', docsUser) && safeEqual(p ?? '', docsPass)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Trustee Developer Hub", charset="UTF-8"');
    res.status(401);
    res.send('Authentication required to view the Trustee Developer Hub.');
  });

  const auth = (b: ReturnType<typeof baseDoc>) =>
    b
      .addApiKey({ type: 'apiKey', name: 'X-Client-Id', in: 'header' }, 'client-id')
      .addApiKey({ type: 'apiKey', name: 'X-Client-Secret', in: 'header' }, 'client-secret')
      .build();

  // OpenAPI documents (always built so the machine-readable contract is served
  // even when the Swagger UI is disabled).
  const full = SwaggerModule.createDocument(app, auth(baseDoc(config.branding.productName)));
  // Per-client contracts: build from the relevant modules, then filter to the
  // client's own namespace so shared modules (reconciliation, attestation) never
  // leak trustee-bank routes into a client's contract.
  const paychainDoc = filterPaths(
    SwaggerModule.createDocument(app, auth(baseDoc('PayChain Integration API')), {
      include: [FundingModule, ReserveModule, MintModule, LiabilityModule, RedemptionModule, ReconciliationModule, AttestationModule],
    }),
    ['/api/v1/paychain'],
  );
  const paykhDoc = filterPaths(
    SwaggerModule.createDocument(app, auth(baseDoc('PayKH Integration API')), {
      include: [PaykhModule, ReconciliationModule, AttestationModule],
    }),
    ['/api/v1/paykh'],
  );
  const clientDoc = filterPaths(full, ['/api/v1/paychain', '/api/v1/paykh']);

  // Published, machine-readable API contract (checklist: GET /api/v1/openapi.json).
  // Serves the client-facing contract; internal bank/admin routes are excluded.
  const http = app.getHttpAdapter();
  http.get('/api/v1/openapi.json', (_req: unknown, res: { json: (v: unknown) => void }) => res.json(clientDoc));
  http.get('/api/v1/openapi/paychain.json', (_req: unknown, res: { json: (v: unknown) => void }) => res.json(paychainDoc));
  http.get('/api/v1/openapi/paykh.json', (_req: unknown, res: { json: (v: unknown) => void }) => res.json(paykhDoc));

  if (config.swaggerEnabled) {
    // Per-client Swagger UI — each third party sees ONLY its own contract.
    SwaggerModule.setup('docs/paychain', app, paychainDoc);
    SwaggerModule.setup('docs/paykh', app, paykhDoc);
    // Full internal docs (trustee-bank + admin) — keep non-public in production.
    SwaggerModule.setup('docs', app, full);
  }

  await app.listen(config.port, '0.0.0.0');
  logger.log(`${config.branding.productName} listening on :${config.port} (${config.nodeEnv})`);
}

void bootstrap();
