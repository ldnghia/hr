# Google OAuth2 Setup Guide

This guide explains how to set up and configure Google OAuth2 authentication for the HR Management System.

---

## Overview

Google OAuth2 enables employees to log in using their Google accounts. The system links the Google account to an existing employee record by email match, preventing auto-registration and unauthorized access.

**Key Flow:**
1. User clicks "Continue with Google"
2. Backend redirects to Google consent screen
3. User authorizes the app to access email & profile
4. Google redirects back with authorization code
5. Backend exchanges code for tokens & fetches user profile
6. Backend links profile to existing employee by email
7. Backend returns JWT token for subsequent API calls

---

## Prerequisites

- Google Cloud Console project created
- OAuth2 credentials (Client ID & Secret) generated
- Backend & frontend URLs known

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the "Google+ API":
   - Navigation Menu → APIs & Services → Library
   - Search "Google+ API"
   - Click Enable

---

## Step 2: Create OAuth2 Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → OAuth 2.0 Client ID
3. Choose "Web application"
4. Configure:
   - **Name**: HR Management System (or similar)
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000        (development backend)
     https://yourdomain.com       (production backend)
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:3000/api/v1/auth/google/callback        (dev)
     https://yourdomain.com/api/v1/auth/google/callback        (prod)
     ```

5. Copy the Client ID & Client Secret
6. Save securely (never commit to git)

---

## Step 3: Backend Configuration

### Install Dependencies

```bash
cd backend
npm install passport passport-google-oauth20 express-session
npm install -D @types/passport-google-oauth20
```

### Environment Variables

Add to `.env` (or equivalent):

```bash
# Google OAuth2
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Frontend OAuth redirect (after Google callback, redirect here with token)
FRONTEND_OAUTH_REDIRECT_URL=http://localhost:3001/auth/callback

# Express session (for CSRF state verification)
SESSION_SECRET=generate-a-strong-random-secret-here
```

**Generate SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verify Backend Code

Ensure these files exist:

1. `backend/src/auth/strategies/google.strategy.ts` — OAuth2 strategy
2. `backend/src/auth/guards/google-auth.guard.ts` — Guard
3. `backend/src/auth/auth.service.ts` — `loginWithGoogle()` method
4. `backend/src/auth/auth.controller.ts` — OAuth endpoints:
   - `GET /auth/google`
   - `GET /auth/google/callback`
5. `backend/src/main.ts` — Express-session middleware

### Verify Database Schema

Employee model has `googleId` field:

```bash
cd backend
npx prisma generate  # Generate Prisma client
npx prisma db push  # Apply pending migrations (if any)
```

---

## Step 4: Frontend Configuration

### Environment Variables

Add to `frontend/.env.local`:

```bash
# Must match backend's FRONTEND_OAUTH_REDIRECT_URL
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### Verify Frontend Code

Ensure these files exist:

1. `frontend/src/app/auth/callback/page.tsx` — OAuth callback handler
2. `frontend/src/app/login/page.tsx` — "Continue with Google" button

---

## Step 5: Local Testing

### Start Backend

```bash
cd backend
npm run start:dev
```

Verify OAuth endpoints:
```bash
curl http://localhost:3000/api/v1/auth/google
```

Should redirect to Google consent screen (or return redirect URL in test mode).

### Start Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3001/login

### Test OAuth Flow

1. Click "Continue with Google"
2. You should be redirected to Google consent screen
3. After authorization, redirected back to `/auth/callback`
4. Token stored in localStorage
5. Redirected to `/dashboard`

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Redirect URI mismatch | Verify `GOOGLE_CALLBACK_URL` matches Google Console config |
| "Client not authenticated" | Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |
| Account not found (not_registered) | Employee must exist with matching email before OAuth login |
| Account disabled (account_disabled) | Employee exists but status is not "official" or "probation" |
| Account conflict (account_conflict) | Employee has different googleId, cannot re-link |
| oauth_failed | Check backend logs, likely network or serialization issue |

---

## Step 6: Production Deployment

### Update Google Console

1. Update OAuth credentials:
   - Remove localhost origins
   - Add production domain:
     ```
     https://yourdomain.com
     https://yourdomain.com/api/v1/auth/google/callback
     ```

### Environment Variables (Production)

Update `.env` on production server:

```bash
GOOGLE_CLIENT_ID=your-prod-client-id
GOOGLE_CLIENT_SECRET=your-prod-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/v1/auth/google/callback
FRONTEND_OAUTH_REDIRECT_URL=https://yourdomain.com/auth/callback
SESSION_SECRET=your-prod-secret-key
```

### HTTPS Required

OAuth2 in production MUST use HTTPS. Enable via:
- Nginx/Apache reverse proxy with SSL
- Cloud provider (AWS, GCP, Azure) with TLS
- Cloudflare or similar CDN with TLS

---

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` (in .gitignore)
   - Use cloud secret manager (AWS Secrets, GCP Secret Manager)

2. **Rotate SESSION_SECRET periodically**
   - Changes will invalidate existing sessions (acceptable)
   - Users will need to log in again

3. **Monitor OAuth failures**
   - Log all `not_registered`, `account_disabled`, `account_conflict` errors
   - Investigate suspicious patterns (brute force attempts)

4. **Test account linking**
   - Ensure employee email matches Google email exactly
   - Warn employees about email mismatches during setup

5. **Disable OAuth if misconfigured**
   - Graceful fallback to email+password login
   - System logs warning if credentials missing

---

## API Error Codes

When OAuth login fails, users see error codes:

| Error Code | Meaning | User Action |
|-----------|---------|------------|
| `not_registered` | No employee found with this email | Contact HR to register account first |
| `account_disabled` | Employee status is inactive/resigned | Contact HR to reactivate account |
| `account_conflict` | Google ID doesn't match existing record | Use email+password or contact HR |
| `oauth_failed` | OAuth process failed (network, etc.) | Try again or use email+password |

---

## Verification Checklist

- [ ] Google Cloud project created
- [ ] OAuth2 credentials (Client ID, Secret) obtained
- [ ] `GOOGLE_CLIENT_ID` set in backend `.env`
- [ ] `GOOGLE_CLIENT_SECRET` set in backend `.env`
- [ ] `GOOGLE_CALLBACK_URL` set correctly
- [ ] `FRONTEND_OAUTH_REDIRECT_URL` set correctly
- [ ] `SESSION_SECRET` generated & set
- [ ] Backend `npm install` includes passport libraries
- [ ] Database migration applied (googleId field exists)
- [ ] Frontend OAuth callback page exists
- [ ] Login page has "Continue with Google" button
- [ ] Local testing passes (redirect → Google → callback → dashboard)
- [ ] Production domain added to Google Console
- [ ] HTTPS enabled in production
- [ ] Secrets stored securely (not in git)

---

## Troubleshooting Guide

### "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set" warning

**Cause**: Environment variables not loaded

**Fix**:
1. Check `.env` file exists in backend root
2. Verify variable names (exact case)
3. Restart backend: `npm run start:dev`

### Redirect loop between Google and /auth/callback

**Cause**: `FRONTEND_OAUTH_REDIRECT_URL` incorrect or mismatched

**Fix**:
1. Check backend config matches frontend URL
2. Ensure callback page exists at `frontend/src/app/auth/callback/page.tsx`
3. Check that callback page redirects to `/dashboard` on success

### "not_registered" error for valid employee

**Cause**: Email mismatch between Employee table and Google account

**Fix**:
1. Check employee email in database: `SELECT email FROM employee WHERE id = X;`
2. Verify Google account email matches exactly (case-sensitive)
3. If mismatch, either:
   - Update employee email in HR system
   - Use email+password login instead

### Account randomly gets "account_conflict"

**Cause**: Multiple people trying to link same employee account

**Fix**:
1. Only one Google account can link per employee
2. Disable one account or create separate employee records
3. Log which user is seeing the error to prevent duplicate linking

---

## Future Enhancements

- [ ] Support other OAuth providers (Microsoft, GitHub)
- [ ] Allow unlinking/relinking of OAuth accounts
- [ ] Optional: Require 2FA for OAuth logins
- [ ] Support offline access (refresh tokens)
- [ ] Auto-create employee on OAuth (if admin enables)

---

## References

- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [PassportJS Google Strategy](http://www.passportjs.org/packages/passport-google-oauth20/)
- [Express Session Middleware](https://github.com/expressjs/session)
