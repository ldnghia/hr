# Phase 01 — Backend Graceful Shutdown + Health Endpoint

## Overview

- **Priority:** P1 (blocker cho phase 02)
- **Status:** pending
- **Effort:** 1h

Thêm `SIGTERM` handler vào NestJS để in-flight requests hoàn tất trước khi process exit. Thêm `process.send('ready')` để PM2 cluster mode biết khi nào instance sẵn sàng nhận traffic. Tạo `/health` endpoint để monitor + smoke test sau deploy.

## Key Insights

- NestJS `app.close()` đã handle drain HTTP connections — chỉ cần wrap nó trong SIGTERM listener
- PM2 fork mode: `process.send` không tồn tại → phải check `if (process.send)` trước khi gọi
- Health endpoint không cần check DB (KISS) — chỉ trả 200 OK báo HTTP server alive. DB health check thuộc về monitoring layer, không cần ở đây
- `enableShutdownHooks()` của NestJS auto-handle SIGTERM nhưng KHÔNG gọi `process.exit()` — cần thêm manual exit sau `app.close()` để PM2 biết process đã hoàn tất

## Requirements

**Functional:**
- App close gracefully khi nhận SIGTERM (PM2 send signal này khi reload)
- In-flight HTTP requests hoàn tất trước khi process exit
- PM2 nhận signal `ready` sau khi `app.listen()` hoàn tất
- GET `/api/v1/health` trả `{ status: 'ok', uptime: <seconds> }` với HTTP 200

**Non-functional:**
- Shutdown phải hoàn tất trong < 5s (PM2 kill_timeout sẽ set 5000ms ở phase 02)
- Health endpoint không yêu cầu auth (PM2/curl/load balancer cần hit được)

## Architecture

```
PM2 master ──SIGTERM──► NestJS process
                          │
                          ├─► SIGTERM listener triggers app.close()
                          ├─► Stop accepting new connections
                          ├─► Wait for in-flight requests
                          └─► process.exit(0)
                                  │
                                  └──► PM2 spawn instance mới
                                         │
                                         └──► app.listen() done
                                                │
                                                └──► process.send('ready')
                                                       │
                                                       └──► PM2 route traffic
```

## Related Code Files

**Modify:**
- `backend/src/main.ts` — thêm SIGTERM handler, `process.send('ready')`
- `backend/src/app.module.ts` — import HealthModule

**Create:**
- `backend/src/health/health.module.ts`
- `backend/src/health/health.controller.ts`

## Implementation Steps

### Step 1 — Tạo health module

**File:** `backend/src/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  @Get()
  @ApiOperation({ summary: 'Health check — used by PM2/load balancer' })
  check() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
```

**File:** `backend/src/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

### Step 2 — Đăng ký HealthModule

**File:** `backend/src/app.module.ts`

Thêm import:
```typescript
import { HealthModule } from './health/health.module';
```

Thêm `HealthModule` vào mảng `imports` của `@Module`.

### Step 3 — Update main.ts — graceful shutdown + ready signal

**File:** `backend/src/main.ts`

Thay đoạn cuối `bootstrap()` (sau `app.listen`):

```typescript
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const lanIP = getLanIP();

  // Enable graceful shutdown hooks for NestJS lifecycle events
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Local:   http://localhost:${port}/api/v1`);
  logger.log(`🌐 Network: http://${lanIP}:${port}/api/v1`);
  logger.log(`📚 Swagger: http://localhost:${port}/api/docs`);

  // Notify PM2 that the app is ready to receive traffic
  // process.send only exists when spawned by PM2 in cluster mode
  if (process.send) {
    process.send('ready');
    logger.log('✅ Sent ready signal to PM2');
  }

  // Graceful shutdown — PM2 sends SIGINT on Windows, SIGTERM on Linux
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal} — shutting down gracefully...`);
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
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
```

### Step 4 — Verify compile

```bash
cd backend
npm run build
```

Phải pass không có error.

### Step 5 — Smoke test local

```bash
cd backend
npm run start:dev
# Trong terminal khác
curl http://localhost:3000/api/v1/health
# Expect: {"status":"ok","uptime":N,"timestamp":"..."}

# Test SIGTERM
# Trong terminal chạy server, Ctrl+C
# Expect log: "Received SIGINT — shutting down gracefully..."
# Expect log: "Application closed cleanly"
```

## Todo List

- [ ] Tạo `backend/src/health/health.controller.ts`
- [ ] Tạo `backend/src/health/health.module.ts`
- [ ] Import `HealthModule` vào `app.module.ts`
- [ ] Update `main.ts` — thêm `enableShutdownHooks()`, `process.send('ready')`, SIGTERM/SIGINT handlers
- [ ] Run `npm run build` — pass không error
- [ ] Smoke test: curl `/api/v1/health` → 200
- [ ] Smoke test: Ctrl+C → log "Application closed cleanly"

## Success Criteria

- [ ] `npm run build` pass
- [ ] `curl http://localhost:3000/api/v1/health` trả HTTP 200 với JSON `{ status: 'ok', uptime: N, timestamp: ... }`
- [ ] Khi gửi SIGTERM/SIGINT, log "Application closed cleanly" xuất hiện trước khi process exit
- [ ] Khi chạy dưới PM2 cluster mode (test ở phase 02), PM2 logs hiển thị `ready` event

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `enableShutdownHooks()` conflict với manual `process.on` | NestJS shutdown hooks run BEFORE `app.close()` callbacks — không conflict. Manual handler đảm bảo `process.exit(0)` được gọi |
| Health endpoint bị block bởi global validation pipe | GET endpoint không có body → ValidationPipe không trigger |
| Health endpoint bị log spam bởi LoggingInterceptor | Acceptable — có thể filter sau nếu cần (out of scope phase này) |
| Prisma connection không đóng khi `app.close()` | NestJS shutdown hooks gọi `onModuleDestroy()` — PrismaService nếu implement đúng sẽ disconnect. Không action thêm ở phase này |

## Security Considerations

- Health endpoint không yêu cầu auth — đây là intended behavior cho load balancer/PM2
- Không leak sensitive info (chỉ uptime + status) — không expose DB info, env vars, version

## Next Steps

- Phase 02 sẽ dùng `wait_ready: true` trong ecosystem.config.js để PM2 chờ ready signal này
- Phase 03 CI/CD smoke test sau deploy: `curl http://localhost:3001/api/v1/health` để verify deploy thành công
