---
title: "Zero-downtime hot reload khi có bản build mới"
description: "PM2 cluster mode + graceful shutdown + health endpoint để deploy không downtime cho NestJS backend và Next.js frontend"
status: pending
priority: P2
effort: 3h
branch: main
tags: [devops, pm2, deployment, ci-cd, graceful-shutdown]
created: 2026-05-23
---

# Zero-Downtime Hot Reload — Implementation Plan

## Mục tiêu

Loại bỏ downtime khi GitHub Actions deploy bản build mới cho backend (NestJS) và frontend (Next.js). User đang dùng app không bị lỗi 502/connection reset khi CI/CD chạy `pm2 reload/restart`.

## Vấn đề hiện tại

| Vấn đề | Hậu quả |
|---|---|
| `instances: 1` + fork mode | `pm2 reload` không zero-downtime — process bị kill rồi mới start lại |
| Frontend dùng `pm2 restart` | Hard kill ngay lập tức, user đang request thấy 502 |
| NestJS không có SIGTERM handler | PM2 force-kill sau `kill_timeout` (default 1600ms), connection đang in-flight bị đứt |
| Không có `process.send('ready')` | PM2 cluster mode bắt instance mới chạy traffic trước khi server thật sự listen → 502 trong ~2-5s |
| Không có health endpoint | Không validate được instance mới đã sẵn sàng |

## Approach (KISS)

- **Cluster mode = 2 instances** (đủ với ~150 user, không cần Redis session store vì OAuth session chỉ 5 phút và sticky không cần thiết — session store in-memory OK vì OAuth handshake hoàn tất trong 1 request flow)
- **PM2 `wait_ready` + `process.send('ready')`** — PM2 chỉ route traffic sang instance mới sau khi nó signal ready
- **SIGTERM graceful shutdown** — NestJS `app.close()` để in-flight requests hoàn tất trước khi process exit
- **Frontend: `pm2 reload` thay vì `restart`** — Next.js standalone server hỗ trợ graceful shutdown built-in

## Phases

| # | Phase | Status | Effort | Files |
|---|---|---|---|---|
| 01 | [Backend graceful shutdown + health endpoint](./phase-01-backend-graceful-shutdown-health.md) | pending | 1h | `backend/src/main.ts`, `backend/src/health/*` |
| 02 | [Ecosystem config — cluster mode](./phase-02-ecosystem-config-cluster-mode.md) | pending | 30m | `ecosystem.config.js` |
| 03 | [CI/CD reload update](./phase-03-cicd-reload-update.md) | pending | 30m | `.github/workflows/frontend.yml`, `.github/workflows/backend.yml` |

## Dependencies

```
Phase 01 (backend ready signal) ──┐
                                  ├─► Phase 02 (cluster mode cần ready signal)
                                  │
Phase 02 (ecosystem updated) ─────┴─► Phase 03 (CI/CD pull config mới)
```

**Bắt buộc theo thứ tự** — không parallel. Phase 02 cần Phase 01 đã merge để cluster mode hoạt động đúng. Phase 03 cần Phase 02 để ecosystem.config.js mới đã tồn tại trên server.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cluster mode lộ shared state bug (in-memory cache, session) | Medium | High | Session chỉ dùng cho OAuth (5min cookie) — handshake hoàn tất trong 1 request, không cross-instance. Audit code không có in-memory cache global. |
| `process.send('ready')` không trigger được (script chạy ngoài PM2 fork) | Low | Medium | Wrap trong `if (process.send) process.send('ready')` — fallback gracefully khi chạy dev mode |
| `ecosystem.config.js` không có trong git → conflict khi update | Medium | Medium | Phase 02 commit file vào repo, gitignore loại bỏ rule cũ nếu có |
| Prisma migrate trong CI/CD chạy đồng thời 2 instance | Low | High | Migrate chạy ở step trước `pm2 reload`, single exec — không phụ thuộc instances |
| Port collision khi cluster (Node.js cluster module share port) | Low | High | NestJS dùng built-in HTTP server, cluster mode chia sẻ port tự động qua master process |

## Backwards Compatibility

- API contract không đổi → frontend không cần update
- Health endpoint `/api/v1/health` là endpoint mới, không break gì
- Session cookie format không đổi
- DB schema không touched

## Rollback Plan

| Phase | Rollback |
|---|---|
| 01 | Revert commit `backend/src/main.ts` + xoá `backend/src/health/` |
| 02 | Revert `ecosystem.config.js` về `instances: 1` + xoá `wait_ready` |
| 03 | Đổi lại `pm2 reload` → `pm2 restart` trong workflow |

Mỗi phase có thể revert độc lập sau khi đã merge sau (không có cascading dependency).

## Test Matrix

| Test | Method |
|---|---|
| Backend graceful shutdown | Trigger SIGTERM → verify in-flight request hoàn tất, `app.close()` gọi |
| Health endpoint | `curl /api/v1/health` → 200 OK với `{ status: 'ok' }` |
| Cluster mode 2 instances | `pm2 list` → thấy 2 process `hr-backend`, status online |
| Zero-downtime reload | Loop `curl /api/v1/health` mỗi 100ms trong khi `pm2 reload hr-backend` → không có 5xx |
| Frontend reload | Loop `curl http://localhost:3000` trong khi `pm2 reload hr-frontend` → không có connection reset |

## Success Criteria

- [ ] `pm2 reload hr-backend` không gây 5xx trong test loop 30s
- [ ] `pm2 reload hr-frontend` không gây connection reset trong test loop 30s
- [ ] PM2 logs hiển thị `Application has been started` đúng 2 lần cho mỗi service (1 lần per instance)
- [ ] CI/CD workflow chạy thành công end-to-end (push commit → deploy → service vẫn responsive)
- [ ] `ecosystem.config.js` đã được commit vào git repo

## Unresolved Questions

- Server `/home/phamhai/hr/...` có đủ RAM cho 2 instances backend không? (Cần check `free -h` trước khi deploy phase 02)
- Có cần warm-up time cho instance mới trước khi switch traffic không? (PM2 `listen_timeout` default 3000ms — có thể đủ, monitor sau khi deploy)
