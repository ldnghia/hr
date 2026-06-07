# Phase 03 — CI/CD Reload Update

## Overview

- **Priority:** P2
- **Status:** pending
- **Effort:** 30m
- **Depends on:** Phase 02 (ecosystem.config.js đã merged vào main)

Sửa GitHub Actions workflow cho frontend dùng `pm2 reload` (zero-downtime) thay vì `pm2 restart` (hard kill). Backend đã dùng `pm2 reload` rồi nhưng cần thêm smoke test sau deploy. Add post-deploy health check.

## Key Insights

- `pm2 restart` = stop + start → downtime ~2s. Phải đổi sang `pm2 reload`.
- `pm2 reload` cần cluster mode (đã setup phase 02) — nếu fork mode thì reload = restart.
- Smoke test sau reload đảm bảo deploy thành công, fail nhanh nếu app không healthy.
- `--update-env` cần thiết khi env vars (secrets) thay đổi — đã có ở backend, thêm cho frontend.

## Requirements

**Functional:**
- Frontend workflow dùng `pm2 reload --update-env`
- Smoke test sau reload (curl health endpoint backend, curl `/` frontend)
- Workflow fail nếu smoke test fail (CI exit non-zero)

**Non-functional:**
- Smoke test có timeout 30s (cho PM2 đủ thời gian rolling reload)
- Không cần thay đổi DB migration step

## Architecture

```
GitHub Action runner (self-hosted on /home/phamhai)
  │
  ├── Pull code → install → build
  ├── pm2 reload <service> --update-env
  ├── Wait for reload complete (poll pm2 jlist hoặc sleep)
  └── Smoke test: curl health endpoint
        │
        ├── 200 → success, exit 0
        └── 5xx hoặc timeout → fail, exit 1
```

## Related Code Files

**Modify:**
- `.github/workflows/frontend.yml` — đổi `pm2 restart` → `pm2 reload --update-env`, add smoke test
- `.github/workflows/backend.yml` — add smoke test (đã có pm2 reload)

## Implementation Steps

### Step 1 — Update frontend.yml

**File:** `.github/workflows/frontend.yml`

Thay step "Restart PM2" (line 55-58):

```yaml
      - name: Reload PM2 (zero-downtime)
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL }}
        run: |
          cd /home/phamhai/hr/hr_project
          pm2 reload ecosystem.config.js --only hr-frontend --update-env || pm2 start ecosystem.config.js --only hr-frontend
          pm2 save

      - name: Smoke test frontend
        run: |
          # Wait up to 30s for frontend to be healthy after reload
          for i in {1..30}; do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
            if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
              echo "Frontend healthy (HTTP $code)"
              exit 0
            fi
            echo "Attempt $i: HTTP $code — retrying..."
            sleep 1
          done
          echo "Frontend smoke test failed after 30s"
          exit 1
```

### Step 2 — Update backend.yml — add smoke test

**File:** `.github/workflows/backend.yml`

Sau step "Restart PM2" (line 68-77), thêm:

```yaml
      - name: Smoke test backend health
        run: |
          # Wait up to 30s for backend health endpoint
          for i in {1..30}; do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/health || echo "000")
            if [ "$code" = "200" ]; then
              echo "Backend healthy"
              curl -s http://localhost:3001/api/v1/health
              exit 0
            fi
            echo "Attempt $i: HTTP $code — retrying..."
            sleep 1
          done
          echo "Backend health check failed after 30s"
          pm2 logs hr-backend --lines 50 --nostream
          exit 1
```

### Step 3 — Test workflow

Push một commit nhỏ (ví dụ: comment trong README) để trigger workflow:

```bash
git commit --allow-empty -m "ci: trigger zero-downtime reload test"
git push origin main
```

Monitor:
- GitHub Actions UI → workflow phải green
- Trong khi deploy chạy, từ máy khác:
  ```bash
  while true; do curl -s -o /dev/null -w "%{http_code} " http://dcorp.vn:3000/api/v1/health; sleep 0.2; done
  ```
  Expect: chỉ thấy `200 200 200...`, không có `502` hoặc `000`.

### Step 4 — (Optional) Concurrency control

Add ở đầu workflow để tránh 2 deploy chạy song song:

```yaml
concurrency:
  group: deploy-${{ github.workflow }}
  cancel-in-progress: false
```

Áp dụng cho cả backend.yml và frontend.yml. Đảm bảo deploy chạy tuần tự, không xung đột với `pm2 reload`.

## Todo List

- [ ] Sửa `frontend.yml` — `pm2 restart` → `pm2 reload --update-env`
- [ ] Add smoke test step vào `frontend.yml`
- [ ] Add smoke test step vào `backend.yml`
- [ ] (Optional) Add `concurrency` block
- [ ] Test: push empty commit, verify workflow green
- [ ] Test: monitor curl loop khi deploy chạy → no 5xx

## Success Criteria

- [ ] Frontend workflow dùng `pm2 reload`, không còn `pm2 restart`
- [ ] Cả 2 workflow có smoke test step
- [ ] Push commit test → workflow chạy thành công
- [ ] Curl loop 30s khi deploy → 0 lỗi 5xx, 0 connection reset

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Smoke test fail false-positive do app chưa kịp ready trong 30s | Tăng loop lên 60 nếu hay timeout. Backend đã có `listen_timeout: 10000` |
| Frontend trả 307 (redirect to login) thay vì 200 | Smoke test accept 200/307/302 — đều là dấu hiệu server alive |
| `pm2 reload` fail do ecosystem.config.js không có trên server (chưa pull mới) | Workflow đã có `git reset --hard origin/main` trước reload → file luôn mới |
| Smoke test gọi qua localhost không reflect real user (qua nginx/firewall) | Acceptable cho phase này — nginx proxy không thay đổi. Có thể add external check sau |
| Two deploys race nhau (backend + frontend cùng lúc) | Concurrency block ngăn được. Hoặc chạy tuần tự manually |

## Security Considerations

- Smoke test không leak secret (chỉ check HTTP status code)
- Health endpoint không expose sensitive info (đã verify phase 01)
- Workflow vẫn dùng GitHub secrets cho env vars

## Next Steps

- Sau khi merge, theo dõi 2-3 deploy đầu để verify no regression
- Nếu ổn định, có thể remove các step backup/rollback manual (out of scope)
- Tương lai: thêm Prometheus/Grafana metric cho deploy latency (out of scope, YAGNI)
