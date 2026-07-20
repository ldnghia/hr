import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as session from 'express-session';
import * as os from 'os';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

function getLanIP(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust the reverse proxy (Next.js) so req.ip resolves the real client IP
  // from X-Forwarded-For instead of the proxy's own address.
  app.set('trust proxy', true);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Session — required for OAuth2 CSRF state verification
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? 'session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000, // 5 minutes — only needed for OAuth handshake
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('HR Management System API')
    .setDescription('Production-ready HR Management System REST API')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Employees', 'Employee management')
    .addTag('Organization', 'Branch, Department & Position management')
    .addTag('Contracts', 'Employee contracts')
    .addTag('Leave', 'Leave requests & approvals')
    .addTag('Attendance', 'Attendance tracking')
    .addTag('Workflow', 'Approval workflows')
    .addTag('Offboarding', 'Resignation & offboarding')
    .addTag('Rewards', 'Decisions, rewards & penalties')
    .addTag('Audit', 'Audit logs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = parseInt(process.env.PORT ?? '3001', 10);
  const lanIP = getLanIP();

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Local:   http://localhost:${port}/api/v1`);
  logger.log(`🌐 Network: http://${lanIP}:${port}/api/v1`);
  logger.log(`🌍 Domain:  http://dcorp.vn:3000 → proxied via Next.js (frontend:3000 → backend:${port})`);
  logger.log(`📚 Swagger: http://localhost:${port}/api/docs`);

  // Signal PM2 cluster mode that this instance is ready to receive traffic
  if (process.send) {
    process.send('ready');
    logger.log('PM2 ready signal sent');
  }

  // Graceful shutdown — PM2 sends SIGTERM (Linux) or SIGINT (Windows)
  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — shutting down gracefully...`);
    try {
      await app.close();
      logger.log('Application closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap();
