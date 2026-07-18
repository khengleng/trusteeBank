import 'reflect-metadata';
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
