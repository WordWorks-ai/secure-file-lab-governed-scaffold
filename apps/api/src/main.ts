import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { configureApiApplication } from './bootstrap/configure-api-application.js';
import { requestIdHook } from './common/middleware/request-id.middleware.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.API_PORT ?? 3000);

  const adapter = new FastifyAdapter({
    logger: true,
    bodyLimit: 8_388_608,
    // OWASP A09 – Assign a request ID before any handler runs.
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
      return (req.headers['x-request-id'] as string) ?? undefined;
    },
  });

  // Fastify lifecycle hook to ensure every request has X-Request-Id.
  adapter.getInstance().addHook('onRequest', async (request) => {
    requestIdHook(request as unknown as { headers: Record<string, string | undefined> });
  });

  // Echo X-Request-Id back to clients for correlation (OWASP A09).
  adapter.getInstance().addHook('onSend', async (request, reply) => {
    const requestId = request.headers['x-request-id'];
    if (requestId && typeof requestId === 'string') {
      void reply.header('x-request-id', requestId);
    }
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  // ── OWASP A05 – Security Headers ──────────────────────────────────
  // Helmet sets strict defaults: X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, X-DNS-Prefetch-Control, etc.
  await app.register(
    (await import('@fastify/helmet')).default,
    {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      // HSTS: 1 year, include subdomains, allow preload list submission
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      // Prevent MIME-type sniffing
      noSniff: true,
      // Prevent clickjacking
      frameguard: { action: 'deny' },
    },
  );

  // ── OWASP A05 – CORS Policy ──────────────────────────────────────
  // Explicit allowlist instead of wildcard. Defaults to same-origin only;
  // configure via CORS_ALLOWED_ORIGINS for deployments with a separate frontend.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  await app.register(
    (await import('@fastify/cors')).default,
    {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 86400, // Preflight cache: 24 hours
    },
  );

  configureApiApplication(app);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
