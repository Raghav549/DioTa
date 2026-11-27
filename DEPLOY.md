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
| `DATA_ENCRYPTION_KEY` | recommended | 32 random bytes: see "Creating the encryption key" below. If it is missing, the app creates its own key in the database, so sign-up still works |
| `APP_URL` | recommended | `https://your-domain.com` (no trailing slash) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `DATABASE_SSL` | optional | leave empty. Set it to `no-verify` only if your provider's certificate fails verification (e.g. Supabase pooler) |
| `PARTNER_API_SECRET` | optional | ≥ 32 random chars. Leave it empty to keep the partner API off |

> **Changing environment variables does not affect a running deployment.** After you add or change
> one, go to **Deployments → ⋯ → Redeploy**.

### Creating the encryption key
**Only `DATABASE_URL` is strictly required.** Without `DATA_ENCRYPTION_KEY`, DioTa generates a random key
on first start and stores it in the `app_secrets` table, so the app works right away. Setting your own key is
still recommended: then a copy of the database alone is not enough to read encrypted vault items.
You can add the key later at any time. Data saved before keeps working, and new data uses your key.
`/api/health` shows which one is in use (`"encryption": "env-key"` or `"auto-key"`).

You create this key yourself. It's not something you get from Vercel or from the database provider. Use any one of these methods:

- **Browser (easiest):** open any web page, press `F12` (or right-click → Inspect), open the **Console** tab,
  paste the line below and press Enter. Copy the 44-character result (without the quotes).
  ```js
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  ```
- **Terminal (Mac / Linux / Git Bash):** `openssl rand -base64 32`
- **In this project:** `npm run gen:key`

Paste only the value (for example `q3V9...Xk=`) into Vercel as `DATA_ENCRYPTION_KEY`. Don't include quotes or the `DATA_ENCRYPTION_KEY=` part.

> ⚠️ **Save this key somewhere safe (e.g. a password manager) and never change it once set.** Vault items and
> payment details are encrypted with it. If you lose or change it, that data can't be recovered.

### Check your setup
Open `https://your-domain.com/api/health`:
- `{"ok":true, ...}` means everything is configured.
- `{"ok":false, "problems":[...]}` tells you exactly which variable is missing or wrong.

## 3. Deploy
Push to GitHub (or click **Redeploy**). Vercel runs `npm run vercel-build`, which:
1. applies the database migrations in `drizzle/` (it's safe to re-run, and a lock stops two runs at once), then
2. runs `next build`.

Even if a build ran without `DATABASE_URL`, the app creates any missing tables automatically on
first use. The build itself doesn't need the database. If `DATABASE_URL` isn't set at build time, migrations are
skipped with a warning and the build still succeeds. Then run `npm run db:migrate` locally against the
production URL, or redeploy after you add the variable.

Check the deployment: `https://your-domain.com/api/health` should return `{"ok":true}`.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Sign-up shows "DioTa isn't fully set up on the server yet" | `DATABASE_URL` is missing or the database can't be reached. Check `/api/health`, fix the variable, then redeploy |
| Added a variable but nothing changed | You need to redeploy after changing variables |
| "Cannot connect to the database" in `/api/health` | Wrong `DATABASE_URL`. For certificate errors, set `DATABASE_SSL=no-verify` |
| Dashboard shows zeros after sign-up | Expected. DioTa only shows real data. Add apps under **Apps** and items in the **Vault** to start |

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
