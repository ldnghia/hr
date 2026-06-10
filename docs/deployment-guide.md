# Deployment Guide — HR Management System

---

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Docker & Docker Compose (optional, for production)
- Git

---

## Local Development Setup

### 1. Clone & Install Dependencies

```bash
# Clone repository
git clone https://github.com/dcorp/hr-project.git
cd hr-project

# Backend
cd backend
npm install
npm run prisma:generate

# Frontend
cd ../frontend
npm install
```

### 2. Environment Variables

**Backend** (`backend/.env.local`):
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hr_db"

# JWT
JWT_SECRET="your-256-bit-secret-key-here"
JWT_EXPIRY="24h"

# Server
PORT=3000
CORS_ORIGIN="http://localhost:3001"

# Telegram (optional)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

# Passwords
BCRYPT_ROUNDS=12

# Node
NODE_ENV="development"
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:3000/api/v1"
```

### 3. Database Setup

```bash
# Backend directory
cd backend

# Create database
createdb hr_db

# Run migrations
npx prisma migrate dev

# (Optional) Seed with test data
npx prisma db seed

# View schema (Prisma Studio)
npx prisma studio
```

### 4. Start Backend

```bash
cd backend
npm run start:dev
```

Output:
```
🚀 Local:   http://localhost:3000/api/v1
🌐 Network: http://192.168.1.x:3000/api/v1
📚 Swagger: http://localhost:3000/api/docs
```

### 5. Start Frontend

```bash
cd frontend
npm run dev
```

Output:
```
▲ Next.js 16.2.1
- Local:        http://localhost:3001
```

Visit `http://localhost:3001` in browser.

---

## Default Test Credentials

After seeding:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dcorp.vn | admin123 |
| HR | hr@dcorp.vn | hr123 |
| Manager | manager@dcorp.vn | manager123 |
| Employee | emp1@dcorp.vn | emp123 |

**Never use these in production.**

---

## Database Migrations

### Creating a New Migration

```bash
cd backend

# Create migration with Prisma schema changes
npx prisma migrate dev --name add_field_name

# This:
# 1. Creates migration file in prisma/migrations/
# 2. Applies to local database
# 3. Commits schema.prisma changes
```

### Applying Migrations (Production)

```bash
cd backend

# Preview
npx prisma migrate status

# Apply all pending
npx prisma migrate deploy
```

### Resetting Database (Development Only)

```bash
cd backend

# ⚠️ DELETES ALL DATA
npx prisma migrate reset --force

# This:
# 1. Drops database
# 2. Recreates
# 3. Runs all migrations
# 4. Seeds (if seed.ts exists)
```

---

## Building for Production

### Backend Build

```bash
cd backend

# Lint & format
npm run lint --fix
npm run format

# Compile TypeScript
npm run build

# Output: dist/ directory with compiled JS
npm run start:prod   # Run compiled version
```

### Frontend Build

```bash
cd frontend

# Build Next.js
npm run build

# Output: .next/ directory (standalone)

# Test production build locally
npm run start   # Requires build to exist
```

---

## Docker Deployment

### Docker Compose (Recommended)

**docker-compose.yml** (at project root):
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: hr_db
    environment:
      POSTGRES_USER: hr_user
      POSTGRES_PASSWORD: secure_password_here
      POSTGRES_DB: hr_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hr_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: hr_backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgresql://hr_user:secure_password_here@postgres:5432/hr_db"
      JWT_SECRET: "your-production-secret-key"
      CORS_ORIGIN: "https://hr.dcorp.vn"
      NODE_ENV: "production"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: hr_frontend
    ports:
      - "3001:3001"
    environment:
      NEXT_PUBLIC_API_URL: "https://api.hr.dcorp.vn/api/v1"
    depends_on:
      - backend
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    image: nginx:latest
    container_name: hr_nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  postgres_data:
```

**Dockerfile** (backend):
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist/ ./dist/

EXPOSE 3000

CMD ["node", "dist/main"]
```

**Dockerfile** (frontend):
```dockerfile
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["node", "server.js"]
```

### Running with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all
docker-compose down

# Rebuild after code changes
docker-compose build
docker-compose up -d
```

---

## Nginx Reverse Proxy Setup

**nginx.conf** (example):
```nginx
upstream backend {
  server backend:3000;
}

upstream frontend {
  server frontend:3001;
}

server {
  listen 80;
  server_name hr.dcorp.vn;

  # API routes
  location /api/v1 {
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Swagger docs
  location /api/docs {
    proxy_pass http://backend;
    proxy_set_header Host $host;
  }

  # Frontend
  location / {
    proxy_pass http://frontend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # WebSocket support (if needed)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

---

## SSL/HTTPS Setup

### Self-Signed Certificate (Development)

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

### Let's Encrypt (Production)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d hr.dcorp.vn

# Copy to nginx directory
sudo cp /etc/letsencrypt/live/hr.dcorp.vn/fullchain.pem ./certs/
sudo cp /etc/letsencrypt/live/hr.dcorp.vn/privkey.pem ./certs/
```

### Nginx HTTPS Configuration

```nginx
server {
  listen 443 ssl http2;
  server_name hr.dcorp.vn;

  ssl_certificate /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;

  # HSTS header
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  # ... rest of config (same as above)
}

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name hr.dcorp.vn;
  return 301 https://$server_name$request_uri;
}
```

---

## Environment Configuration

### Development (.env.local)

```env
DATABASE_URL="postgresql://dev_user:dev_pass@localhost:5432/hr_dev"
JWT_SECRET="dev-secret-key"
CORS_ORIGIN="http://localhost:3001"
NODE_ENV="development"
BCRYPT_ROUNDS=10  # Faster for dev
```

### Staging (.env.staging)

```env
DATABASE_URL="postgresql://stage_user:stage_pass@staging-db:5432/hr_stage"
JWT_SECRET="staging-secret-key"
CORS_ORIGIN="https://hr-staging.dcorp.vn"
NODE_ENV="production"
BCRYPT_ROUNDS=12
```

### Production (.env.production)

```env
DATABASE_URL="postgresql://prod_user:prod_pass@prod-db-primary:5432/hr_prod"
JWT_SECRET="production-secret-key-256bit"
CORS_ORIGIN="https://hr.dcorp.vn"
NODE_ENV="production"
BCRYPT_ROUNDS=12
TELEGRAM_BOT_TOKEN="your-bot-token"
```

**Security Notes**:
- Never commit .env files to git
- Use secrets manager (AWS Secrets Manager, Vault, etc.) for prod
- Rotate JWT_SECRET every 6 months
- Use strong passwords (32+ chars, random)

---

## Monitoring & Logging

### Application Health Check

```bash
# Backend health
curl http://localhost:3000/api/v1/health

# Frontend health
curl http://localhost:3001/health
```

### View Logs

**Docker**:
```bash
docker-compose logs -f --tail=100 backend
docker-compose logs -f --tail=100 frontend
```

**Local**:
```bash
# Backend logs in terminal running npm run start:dev
# Frontend logs in terminal running npm run dev
```

### Setup Log Aggregation (Optional)

```bash
# Install ELK (Elasticsearch, Logstash, Kibana) or Datadog
# Backend sends logs to log aggregator
# Frontend logs via error tracking (Sentry)
```

---

## Backup & Restore

### Database Backup

```bash
# Dump database
pg_dump -U hr_user -h localhost hr_db > backup.sql

# Or with Docker
docker exec hr_db pg_dump -U hr_user hr_db > backup.sql

# Scheduled backup (cron job)
0 2 * * * pg_dump -U hr_user hr_db | gzip > /backups/hr_db_$(date +\%Y\%m\%d).sql.gz
```

### Database Restore

```bash
# From dump
psql -U hr_user -h localhost hr_db < backup.sql

# Or with Docker
docker exec -i hr_db psql -U hr_user hr_db < backup.sql
```

---

## Scaling Considerations

### Read Replicas

```
Primary DB (write operations)
├─ Replica 1 (read-only, backup)
└─ Replica 2 (read-only, reports)

Backend routes:
  ├─ SELECT queries → Replicas (load-balanced)
  └─ INSERT/UPDATE/DELETE → Primary
```

### Load Balancing

```
Load Balancer (nginx/HAProxy)
├─ Backend Instance 1
├─ Backend Instance 2
└─ Backend Instance 3

Health checks: /api/v1/health (interval: 10s)
```

### Caching

```
Redis Cache Layer
├─ Session cache (user tokens)
├─ Query cache (employee list)
└─ Rate limit counters

Backend queries Redis before DB:
  if cache hit → return cached
  else → query DB, cache result (TTL: 5 min)
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check port in use
lsof -i :3000

# Check environment variables
echo $DATABASE_URL
echo $JWT_SECRET

# Check database connection
psql postgresql://user:password@localhost:5432/hr_db -c "SELECT 1"

# Check migrations
npx prisma migrate status
```

### Frontend Won't Load

```bash
# Check API URL
echo $NEXT_PUBLIC_API_URL

# Check backend is running
curl http://localhost:3000/api/v1/health

# Check CORS headers
curl -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:3000/api/v1/employees -v
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
pg_isready -h localhost

# Check credentials
PGPASSWORD=password psql -h localhost -U user -d hr_db -c "SELECT 1"

# Check replication (if replica setup)
SELECT * FROM pg_stat_replication;
```

### JWT Token Expired

```
Backend logs: "Invalid token" or 401 Unauthorized
Frontend: Auto-logout, redirect to /login (axios interceptor)
Solution: User logs in again, gets new token
```

---

## Deployment Checklist

- [ ] Database migrations tested locally
- [ ] Environment variables configured (no .env in git)
- [ ] Backend build successful (npm run build)
- [ ] Frontend build successful (npm run build)
- [ ] Docker images built and tested
- [ ] docker-compose.yml tested locally
- [ ] Nginx configuration tested
- [ ] SSL certificate installed (HTTPS)
- [ ] Backup strategy in place
- [ ] Monitoring/logging configured
- [ ] Database replicas configured (if scaling)
- [ ] Load balancer tested
- [ ] Health checks verified
- [ ] Runbooks written (disaster recovery)
- [ ] Team trained on deployment process

---

## CI/CD Integration (GitHub Actions Example)

**.github/workflows/deploy.yml**:
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: |
          cd backend && npm install
          cd ../frontend && npm install
      
      - name: Build backend
        run: cd backend && npm run build
      
      - name: Build frontend
        run: cd frontend && npm run build
      
      - name: Run tests
        run: cd backend && npm test
      
      - name: Push to Docker Hub
        run: |
          docker build -t hr-backend:latest backend/
          docker build -t hr-frontend:latest frontend/
          docker push ...
      
      - name: Deploy to production
        run: |
          ssh deploy@prod-server 'cd /app && docker-compose pull && docker-compose up -d'
```

---

## Post-Deployment Verification

```bash
# 1. Check all services running
docker-compose ps

# 2. Test API endpoints
curl https://hr.dcorp.vn/api/v1/health
curl https://hr.dcorp.vn/api/docs

# 3. Test frontend
curl https://hr.dcorp.vn

# 4. Check database
psql postgresql://user@prod-db/hr_db -c "SELECT COUNT(*) FROM employee"

# 5. Review logs
docker-compose logs backend | grep -i error
docker-compose logs frontend | grep -i error

# 6. Load testing (optional)
ab -n 1000 -c 10 https://hr.dcorp.vn/api/v1/employees
```

---

## Rollback Procedure

```bash
# If deployment fails:
# 1. Identify previous working version (git tag or docker image)
# 2. Rollback database (if needed)
# 3. Update docker-compose.yml with previous image tags
# 4. Restart services

docker-compose down
git checkout previous-tag
docker-compose up -d

# 5. Verify functionality
# 6. Investigate root cause
# 7. Re-deploy with fix
```
