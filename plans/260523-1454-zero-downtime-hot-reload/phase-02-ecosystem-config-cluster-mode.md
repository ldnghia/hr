# Phase 02 — Ecosystem Config: Cluster Mode + Wait Ready

## Overview

- **Priority:** P1
- **Status:** pending
- **Effort:** 30m
- **Depends on:** Phase 01 (cần `process.send('ready')` đã merge)

Update `ecosystem.config.js`: cluster mode cho cả backend và frontend, 2 instances mỗi service, `wait_ready: true`, `kill_timeout: 5000`. Commit file vào git repo để CI/CD có nguồn truthy.

## Key Insights

- **Backend cluster mode**: NestJS dùng built-in HTTP server → cluster module Node.js tự share port. Không cần code thay đổi nào ngoài phase 01.
- **Frontend cluster mode**: Next.js `next start` hỗ trợ cluster mode native. Không cần custom server.
- **2 instances là đủ**: ~150 user, không cần `max` (sẽ overcommit CPU). KISS.
- **`wait_ready: true`** chỉ áp dụng cho cluster mode + process.send('ready'). Fork mode bỏ qua flag này.
- **`kill_timeout: 5000`**: cho NestJS 5s để drain. Nếu app.close() chưa xong sau 5s, PM2 force SIGKILL.
- **`listen_timeout: 10000`**: PM2 chờ tối đa 10s cho ready signal. Hơi dư nhưng safe — build cold start có thể chậm.

## Requirements

**Functional:**
- Backend chạy 2 instances cluster mode
- Frontend chạy 2 instances cluster mode
- PM2 chỉ route traffic sau khi instance mới signal ready
- Reload từng instance một (rolling) → luôn có instance phục vụ

**Non-functional:**
- `ecosystem.config.js` commit vào git để CI/CD có nguồn nhất quán
- Config phải backwards-compatible — không break dev workflow

## Architecture

```
PM2 master process (cluster mode)
├── hr-backend
│   ├── worker 0 (port 3001 via shared socket)
│   └── worker 1 (port 3001 via shared socket)
└── hr-frontend
    ├── worker 0 (port 3000 via shared socket)
    └── worker 1 (port 3000 via shared socket)

Reload flow (pm2 reload hr-backend):
  1. Spawn new worker 0' → wait for 'ready' signal
  2. Send SIGTERM to old worker 0 → wait kill_timeout=5s
  3. Repeat for worker 1
  Result: always ≥1 instance serving traffic
```

## Related Code Files

**Modify:**
- `ecosystem.config.js` (project root)

**Verify (no edit):**
- `.gitignore` — đảm bảo `ecosystem.config.js` không bị ignore

## Implementation Steps

### Step 1 — Update ecosystem.config.js

**File:** `ecosystem.config.js` (project root)

```javascript
module.exports = {
  apps: [
    {
      name: 'hr-backend',
      script: 'dist/src/main.js',
      cwd: '/home/phamhai/hr/hr_project/backend',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      // Zero-downtime reload settings
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
        FRONTEND_OAUTH_REDIRECT_URL: process.env.FRONTEND_OAUTH_REDIRECT_URL || '',
      },
    },
    {
      name: 'hr-frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000 --hostname 0.0.0.0',
      cwd: '/home/phamhai/hr/hr_project/frontend',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      // Next.js handles SIGTERM natively; no wait_ready since next start doesn't send it
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
```

**Lưu ý quan trọng về frontend:**
- KHÔNG set `wait_ready: true` cho frontend vì `next start` không call `process.send('ready')`.
- Next.js đã có graceful shutdown built-in → `kill_timeout: 5000` là đủ.
- Cluster mode vẫn hoạt động: PM2 dùng `listen_timeout` default (3000ms) để check process còn live.

### Step 2 — Đảm bảo file được tracked bởi git

```bash
cd /f/AI/hr_project
git status ecosystem.config.js
# Phải hiển thị "modified" hoặc "untracked"
```

Nếu file đang trong `.gitignore`, xóa rule đó. Check:
```bash
git check-ignore -v ecosystem.config.js
```

### Step 3 — Test local (nếu có PM2 trên máy dev)

```bash
# Trên máy dev hoặc staging
pm2 delete all
pm2 start ecosystem.config.js
pm2 list
# Expect: 2 instances 'hr-backend' (status online), 2 instances 'hr-frontend' (status online)

# Test zero-downtime
# Terminal 1
while true; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/health; sleep 0.1; done

# Terminal 2
pm2 reload hr-backend
# Terminal 1 should show only 200, no 5xx
```

### Step 4 — Commit

```bash
git add ecosystem.config.js
git commit -m "chore: enable PM2 cluster mode with wait_ready for zero-downtime reload"
```

## Todo List

- [ ] Update `ecosystem.config.js` — instances 2, exec_mode cluster, wait_ready (backend), kill_timeout
- [ ] Verify file không bị `.gitignore`
- [ ] Test local: `pm2 start` thấy 2 instances mỗi service
- [ ] Test reload: loop curl không có 5xx khi `pm2 reload`
- [ ] Commit `ecosystem.config.js` vào repo

## Success Criteria

- [ ] `pm2 list` hiển thị 2 instances mỗi service, status `online`
- [ ] `pm2 logs hr-backend` hiển thị "Sent ready signal to PM2" 2 lần (1 lần per instance)
- [ ] `pm2 reload hr-backend` hoàn thành trong < 20s và 0 lỗi 5xx trong loop curl
- [ ] `pm2 reload hr-frontend` hoàn thành trong < 20s và 0 connection reset trong loop curl
- [ ] File `ecosystem.config.js` đã có trong git

## Risk Assessment

| Risk | Mitigation |
|---|---|
| RAM không đủ cho 2 instances backend (NestJS ~150-250MB/instance) | Check `free -h` trước. Nếu < 1GB free → giảm `instances: 1` cho frontend trước |
| Port 3001/3000 conflict | Node.js cluster module share port qua master — không conflict |
| Prisma client connection pool double khi cluster | Mỗi instance có pool riêng. Default pool size = 10. Tổng = 20 connections. Postgres `max_connections` default 100 → an toàn |
| Session in-memory khác nhau giữa 2 instance | OAuth handshake hoàn tất trong 1 request flow (state cookie → callback) → không cross-instance. Confirmed in code analysis |
| Next.js cluster mode có bug với static file caching | Next.js officially supports cluster mode. File caching dùng filesystem (shared). Không issue |
| `wait_ready` timeout (10s) quá ngắn cho cold start có Prisma | Prisma client lazy-load → bootstrap nhanh. 10s đủ. Tăng nếu cần |

## Security Considerations

- Không có thay đổi về security
- Env vars vẫn được PM2 inject như cũ

## Next Steps

- Phase 03 sẽ update CI/CD để dùng `pm2 reload` cho frontend (thay vì `restart`)
- Phase 03 cũng add smoke test sau deploy
