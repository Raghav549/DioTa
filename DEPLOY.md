# Deploying DioTa to Vercel

## 1. Create a Postgres database
Any Postgres 13+ works: **Neon** (Vercel Marketplace → Storage → Neon), Supabase, AWS RDS, etc.
Copy its connection string. Pick a region close to your Vercel function region
(for users in India: `ap-south-1` / Mumbai, and set the Vercel function region to `bom1`).

## 2. Set environment variables
Vercel → Project → **Settings → Environment Variables**. Tick **Production** and **Preview**.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `DATA_ENCRYPTION_KEY` | ✅ | `openssl rand -base64 32` (or `npm run gen:key`) |
| `APP_URL` | recommended | `https://your-domain.com` (no trailing slash) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `DATABASE_SSL` | optional | leave empty. Set it to `no-verify` only if your provider's certificate fails verification (e.g. Supabase pooler) |
| `PARTNER_API_SECRET` | optional | ≥ 32 random chars. Leave it empty to keep the partner API off |

> ⚠️ **Back up `DATA_ENCRYPTION_KEY` and never change it.** Vault items and payment details are
> encrypted with it. If you lose or change it, that data can't be recovered.

## 3. Deploy
Push to GitHub (or click **Redeploy**). Vercel runs `npm run vercel-build`, which:
1. applies the database migrations in `drizzle/` (it's safe to re-run, and a lock stops two runs at once), then
2. runs `next build`.

The build no longer needs the database. If `DATABASE_URL` isn't set at build time, migrations are
skipped with a warning and the build still succeeds. Then run `npm run db:migrate` locally against the
production URL, or redeploy after you add the variable.

Check the deployment: `https://your-domain.com/api/health` should return `{"ok":true}`.

## 4. Google sign-in (optional)
Google Cloud Console → APIs & Services → Credentials → OAuth client (Web):
- **Authorised redirect URI:** `https://your-domain.com/api/auth/google/callback`
  (this must match `APP_URL` exactly)

## Local development
```bash
cp .env.example .env      # fill in DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

## Changing the schema
Edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`.
It's applied automatically on the next deploy.

## Security summary
- Passwords use scrypt. Sessions use 256-bit random tokens, and only their SHA-256 is stored.
  The session cookie is `__Host-`, HttpOnly, Secure and SameSite=Lax, with a 30-day idle limit and a 90-day hard limit.
  The session rotates on login.
- Vault data and payment details use AES-256-GCM, with a separate key for each user (derived with HKDF) and the user id bound in as AAD.
- CSRF protection: a custom header plus Sec-Fetch-Site/Origin checks on every request that changes data.
- Rate limits are stored in the database, so they work across serverless instances. Accounts lock after repeated failed logins.
- Strict CSP with a per-request nonce, HSTS, frame-ancestors none, nosniff, COOP/CORP and Permissions-Policy.
- Google OAuth uses PKCE (S256), state verification and a canonical redirect origin. It never auto-links to an existing
  password account, which prevents account pre-hijacking.
- Withdrawals are serialised per user with a transaction advisory lock (no double-spend).
- The database uses TLS with full certificate verification by default.
