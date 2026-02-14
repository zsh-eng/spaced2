# Migration Plan: Merge spaced-backend into spaced2 (Workers + Assets)

## Overview

Merge the separate `spaced-backend` Cloudflare Worker into the `spaced2` frontend repo, deploying as a single **Cloudflare Workers + Static Assets** project. The Hono API serves `/api/*` routes; Vite-built static assets serve the SPA.

**Current state:**
- Frontend: `spaced2` → Cloudflare Pages (`spaced2.zsheng.app`)
- Backend: `spaced-backend` → Cloudflare Workers (`api.spaced2.zsheng.app`)

**Target state:**
- Single repo: `spaced2` → Cloudflare Workers + Assets (`spaced2.zsheng.app`)
- API routes: `spaced2.zsheng.app/api/*` (same-origin, no more CORS)

---

## Step 1: Copy Backend Source into Frontend Repo

Create a `worker/` directory at the repo root with the backend code:

```
spaced2/
├── worker/                      # NEW — Backend source
│   ├── index.ts                 # Hono app (copied from spaced-backend/src/index.ts)
│   ├── auth/
│   │   ├── index.ts
│   │   ├── email-verify.ts
│   │   └── google.ts
│   ├── db/
│   │   └── schema.ts
│   ├── middleware/
│   │   ├── session.ts
│   │   └── clientid.ts
│   ├── client2server.ts
│   ├── server2client.ts
│   ├── clientid.ts
│   ├── operation.ts
│   ├── upload.ts
│   ├── utils.ts
│   └── logger.ts
├── drizzle/                     # NEW — SQL migrations
│   ├── 0000_sleepy_lady_deathstrike.sql
│   ├── 0001_fearless_katie_power.sql
│   ├── 0002_sour_gamma_corps.sql
│   └── meta/
├── src/                         # Existing frontend (unchanged)
├── public/                      # Existing PWA assets (unchanged)
├── vite.config.ts               # MODIFIED
├── wrangler.json                # MODIFIED (replaces old Pages config)
├── drizzle.config.ts            # NEW
├── worker-configuration.d.ts    # NEW (Env types)
├── tsconfig.worker.json         # NEW
└── package.json                 # MODIFIED
```

**Programmatic copy commands:**
```bash
# From spaced2 root:
mkdir -p worker
cp -r ../spaced-backend/src/* worker/
cp -r ../spaced-backend/drizzle .
cp ../spaced-backend/drizzle.config.ts .
cp ../spaced-backend/worker-configuration.d.ts .
cp ../spaced-backend/.dev.vars .
cp ../spaced-backend/.dev.vars.example .
```

---

## Step 2: Update Path Aliases in Worker Code

The backend uses `@/` path alias pointing to `src/`. After copying into `worker/`, all `@/` imports in worker code need to reference `worker/` instead.

**Options (pick one):**
- **A) Dedicated tsconfig.worker.json** with `"paths": { "@/*": ["./worker/*"] }` — cleanest, no import rewriting
- **B) Use a different alias** like `@worker/` to avoid collision with the frontend's `@/` → `src/`

**Recommended: Option A** — Create `tsconfig.worker.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["./worker/*"] },
    "types": ["@cloudflare/workers-types/2023-07-01"]
  },
  "include": ["worker/**/*.ts"]
}
```

Since Wrangler bundles the worker with esbuild, we also need to tell it about the alias. The `@cloudflare/vite-plugin` handles this automatically if we use it, or we can configure it in wrangler.json.

**However**, the simplest approach is to **rewrite all `@/` imports in `worker/` to relative imports**. This avoids all alias configuration issues since esbuild will resolve them natively. There are roughly 10 files with `@/` imports.

---

## Step 3: Install Backend Dependencies

Add backend-only dependencies to the frontend's `package.json`:

**New production dependencies:**
```
hono
@hono/zod-validator
crc-32
drizzle-orm
jose
nanoid
pino
resend
```

**New dev dependencies:**
```
drizzle-kit
@cloudflare/vite-plugin    # For integrated dev experience
```

**Already shared (no action needed):**
- `zod` (both repos use it)
- `@cloudflare/workers-types` (already in frontend devDeps)
- `wrangler` (already in frontend devDeps)
- `typescript` (already in frontend devDeps)

**Can likely drop from backend (not needed in merged):**
- `google-auth-library` (backend uses `jose` for JWT verification, not this)
- `vite-tsconfig-paths` (Vite plugin handles this)
- `@cloudflare/vitest-pool-workers`, `vitest`, `better-sqlite3`, `@libsql/client`, `dotenv` (test/dev tooling — add only if needed)

---

## Step 4: Configure wrangler.json for Workers + Assets

Replace the current Pages-style deployment with unified Workers + Assets:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "spaced2",
  "main": "./worker/index.ts",
  "compatibility_date": "2025-01-21",
  "observability": { "enabled": true },
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "D1",
      "database_name": "spaced-backend",
      "database_id": "611d4308-28af-437f-b5e8-ad12c77c209a",
      "migrations_dir": "drizzle/"
    }
  ],
  "r2_buckets": [
    {
      "bucket_name": "spaced2-files-bucket",
      "binding": "FILES_BUCKET"
    }
  ],
  "vars": {
    "WORKER_ENV": "production"
  }
}
```

**Key differences from old setup:**
- `assets.directory = "./dist"` — Vite's build output (the SPA)
- `assets.not_found_handling = "single-page-application"` — returns `index.html` for client-side routing
- `assets.run_worker_first = ["/api/*"]` — only API routes hit the Worker; static assets are served directly (free, no Worker invocation)
- `FRONTEND_ORIGIN` is **removed** — no longer needed since frontend and backend are same-origin
- `routes` with custom domain is **removed** — no separate API subdomain

---

## Step 5: Update vite.config.ts

Two options:

### Option A: Use `@cloudflare/vite-plugin` (Recommended)

This gives you local dev with the real `workerd` runtime:

```typescript
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),    // NEW — integrates Worker into Vite dev server
    VitePWA({ ... }),
  ],
  // ... rest unchanged
});
```

**Caveat:** Need to verify `@cloudflare/vite-plugin` works well with `vite-plugin-pwa`. If there are conflicts, fall back to Option B.

### Option B: Keep Vite for frontend only, proxy API in dev

Add a Vite proxy for `/api` routes in development:

```typescript
export default defineConfig({
  // ... existing config
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
```

Then run `wrangler dev worker/index.ts` separately in dev. This is the simpler, lower-risk approach.

---

## Step 6: Remove CORS from Backend

Since frontend and backend will be same-origin (`spaced2.zsheng.app`), CORS is no longer needed.

In `worker/index.ts`, **remove** the CORS middleware:
```typescript
// DELETE this entire block:
app.use('*', async (c, next) => {
  const corsMiddleware = cors({ ... });
  return corsMiddleware(c, next);
});
```

Also remove `FRONTEND_ORIGIN` from `Env` and `wrangler.json`.

---

## Step 7: Update Frontend API Calls (Remove VITE_BACKEND_URL)

The frontend currently prefixes all API calls with `import.meta.env.VITE_BACKEND_URL` (e.g., `https://api.spaced2.zsheng.app/api`). Since the API is now same-origin, all URLs become relative `/api/...`.

**Files to update (8 files):**

1. **`src/lib/sync/server.ts`** — Remove `VITE_BACKEND_URL` prefix from `/sync` calls
2. **`src/lib/auth/index.ts`** — Remove prefix from all `/auth/*` calls
3. **`src/lib/files/upload.ts`** — Remove prefix from `/upload` and `/files/` URLs
4. **`src/lib/images/db.ts`** — Update backend URL detection logic
5. **`src/components/hooks/logged-in-status.tsx`** — Remove prefix from `/auth/me`
6. **`src/components/hooks/google-sign-in-prompt.tsx`** — Change `login_uri` to `/api/auth/google`
7. **`src/components/auth/google-sign-in.tsx`** — Change `data-login_uri` to `/api/auth/google`
8. **`src/routes/Sync.tsx`** — Remove prefix (debug route)

**Example transformation:**
```typescript
// Before:
fetch(`${import.meta.env.VITE_BACKEND_URL}/auth/login`, { credentials: "include", ... })

// After:
fetch('/api/auth/login', { ... })
// Note: `credentials: "include"` can stay (harmless) or be removed (same-origin sends cookies automatically)
```

**Remove from `.env.local` and `.env.local.example`:**
- `VITE_BACKEND_URL` — no longer needed

**Keep:**
- `VITE_GOOGLE_CLIENT_ID` — still needed for Google Sign-In initialization on the frontend

---

## Step 8: Update Google OAuth Redirect

The Google OAuth flow currently redirects to `https://api.spaced2.zsheng.app/api/auth/google`. This needs to change.

### In Google Cloud Console:
1. Go to **APIs & Services → Credentials → OAuth 2.0 Client IDs**
2. Update **Authorized redirect URIs**:
   - **Remove:** `https://api.spaced2.zsheng.app/api/auth/google`
   - **Add:** `https://spaced2.zsheng.app/api/auth/google`
3. Update **Authorized JavaScript origins**:
   - Keep: `https://spaced2.zsheng.app` (unchanged)
   - **Remove:** `https://api.spaced2.zsheng.app` (if present)

### In the backend code (`worker/index.ts`):
The Google OAuth handler currently redirects back to `${c.env.FRONTEND_ORIGIN}/login-success`. Since we removed `FRONTEND_ORIGIN`, change to a relative redirect:

```typescript
// Before:
return c.redirect(`${c.env.FRONTEND_ORIGIN}/login-success?clientId=${clientId}`);

// After:
return c.redirect(`/login-success?clientId=${clientId}`);
```

### In the frontend:
Update `google-sign-in-prompt.tsx` and `google-sign-in.tsx` to point `login_uri` to `/api/auth/google` instead of `${VITE_BACKEND_URL}/auth/google`.

---

## Step 9: Update Cookie Configuration

Currently cookies are set without a `domain` attribute, meaning they're scoped to the issuing domain.

**Before:** Cookie set by `api.spaced2.zsheng.app` → only sent to `api.spaced2.zsheng.app`
**After:** Cookie set by `spaced2.zsheng.app` → sent to `spaced2.zsheng.app` (same-origin, works naturally)

The `makeProdCookieOptions` can stay as-is. The commented-out `domain: '.zsheng.app'` line is no longer relevant and can be removed.

**Important:** During migration, existing users will have cookies scoped to `api.spaced2.zsheng.app` which won't be sent to `spaced2.zsheng.app`. Users will need to log in again after migration. This is acceptable — sessions expire naturally anyway.

---

## Step 10: Update `constructImageMarkdownLink`

In `src/lib/files/upload.ts`, image URLs currently use the full backend URL:

```typescript
// Before:
`![${altText}](${import.meta.env.VITE_BACKEND_URL}/files/${fileKey})`
// Produces: ![Image](https://api.spaced2.zsheng.app/api/files/userId/fileId)

// After:
`![${altText}](/api/files/${fileKey})`
// Produces: ![Image](/api/files/userId/fileId)
```

**Backward compatibility for existing cards:** Cards already saved with the old `https://api.spaced2.zsheng.app/api/files/...` URLs will still work if:
- You keep the `api.spaced2.zsheng.app` DNS record pointing to the same Worker (or set up a redirect)
- OR you run a one-time migration to rewrite card content URLs in the D1 database
- OR you handle it in the image rendering pipeline (check for old URLs and transform them)

**Recommended:** Keep the old Worker alive temporarily as a redirect, and optionally run a D1 migration to rewrite URLs.

---

## Step 11: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "wrangler dev",
    "deploy": "pnpm run build && wrangler deploy",
    "gen": "drizzle-kit generate && bash ./scripts/generate-schema.sh",
    "schema:remote": "wrangler d1 execute spaced-backend --remote --file=./drizzle/0000_sleepy_lady_deathstrike.sql",
    "db:seed:local": "wrangler d1 execute spaced-backend --local --file=./local/spaced-prod-backup.sql"
  }
}
```

Key changes:
- `preview`: `wrangler pages dev ./dist` → `wrangler dev` (unified command)
- `deploy`: `wrangler pages deploy ./dist --project-name spaced2` → `wrangler deploy`
- Add drizzle scripts from backend

---

## Step 12: Secrets & Environment Variables

### Cloudflare Dashboard Secrets

Set these as **secrets** on the new Workers project (not in wrangler.json):

```bash
wrangler secret put COOKIE_SECRET
wrangler secret put RESEND_API_KEY
```

These were previously configured on the `spaced-backend` Worker. They need to be set on the `spaced2` Worker project.

### Local Development (`.dev.vars`)

Copy from backend:
```
COOKIE_SECRET=<value>
RESEND_API_KEY=<value>
```

### Environment Variables Summary

| Variable | Where | Before | After |
|----------|-------|--------|-------|
| `COOKIE_SECRET` | Worker secret | `spaced-backend` Worker | `spaced2` Worker |
| `RESEND_API_KEY` | Worker secret | `spaced-backend` Worker | `spaced2` Worker |
| `WORKER_ENV` | wrangler.json vars | `spaced-backend` Worker | `spaced2` Worker |
| `FRONTEND_ORIGIN` | wrangler.json vars | `spaced-backend` Worker | **REMOVED** (same-origin) |
| `VITE_BACKEND_URL` | .env.local (build-time) | Frontend env | **REMOVED** (relative URLs) |
| `VITE_GOOGLE_CLIENT_ID` | .env.local (build-time) | Frontend env | **UNCHANGED** |
| `D1` binding | wrangler.json | `spaced-backend` Worker | `spaced2` Worker (same DB ID) |
| `FILES_BUCKET` binding | wrangler.json | `spaced-backend` Worker | `spaced2` Worker (same bucket) |

---

## Step 13: DNS & Domain Changes

### Before:
- `spaced2.zsheng.app` → Cloudflare Pages
- `api.spaced2.zsheng.app` → Cloudflare Workers (custom domain)

### After:
- `spaced2.zsheng.app` → Cloudflare Workers + Assets (configure as custom domain on the Worker)
- `api.spaced2.zsheng.app` → Either:
  - **Keep temporarily** as a redirect worker for old image URLs
  - **Remove** once migration is confirmed complete

### Steps:
1. In Cloudflare Dashboard, add `spaced2.zsheng.app` as a custom domain on the new `spaced2` Worker
2. Delete the old Cloudflare Pages project for `spaced2`
3. Optionally keep `api.spaced2.zsheng.app` pointing to a minimal redirect Worker

---

## Step 14: Migration Checklist & Risks

### Pre-migration:
- [ ] Copy backend source to `worker/`
- [ ] Install new dependencies
- [ ] Update all imports (remove `@/` alias or configure it)
- [ ] Update `wrangler.json`
- [ ] Update `vite.config.ts`
- [ ] Remove CORS middleware
- [ ] Replace all `VITE_BACKEND_URL` references with relative URLs
- [ ] Update Google OAuth redirect URIs in Google Cloud Console
- [ ] Update cookie/redirect logic in backend
- [ ] Set secrets on the new Worker (`COOKIE_SECRET`, `RESEND_API_KEY`)
- [ ] Test locally end-to-end

### Deployment:
- [ ] Deploy with `wrangler deploy`
- [ ] Verify custom domain works
- [ ] Test all auth flows (email login, Google OAuth, session persistence)
- [ ] Test sync (push/pull operations)
- [ ] Test file upload and image serving
- [ ] Verify PWA still works (service worker, offline)

### Post-migration:
- [ ] Keep old `api.spaced2.zsheng.app` as redirect for existing image URLs
- [ ] Monitor for any broken image links in existing cards
- [ ] Clean up old Pages project
- [ ] Clean up old Workers project (after transition period)
- [ ] Remove `.env.local` entries for `VITE_BACKEND_URL`

### Risks:
1. **Existing image URLs break** — Cards contain `https://api.spaced2.zsheng.app/api/files/...` which won't resolve if the old Worker is removed. Mitigation: keep redirect or rewrite URLs.
2. **Users need to re-login** — Cookies from old domain won't transfer. Acceptable.
3. **PWA service worker cache** — Old cached API URLs won't match new paths. The PWA `autoUpdate` registration should handle this, but users may need to refresh.
4. **Google OAuth redirect** — Must update Google Cloud Console BEFORE deploying. If done out of order, Google login breaks.

---

## Summary of Changes by File

### New files:
- `worker/` — entire backend source tree
- `drizzle/` — SQL migrations
- `drizzle.config.ts`
- `worker-configuration.d.ts`
- `.dev.vars`
- `tsconfig.worker.json`

### Modified files:
- `wrangler.json` — complete rewrite for Workers + Assets
- `vite.config.ts` — add proxy or `@cloudflare/vite-plugin`
- `package.json` — new deps + updated scripts
- `src/lib/auth/index.ts` — remove `VITE_BACKEND_URL`
- `src/lib/sync/server.ts` — remove `VITE_BACKEND_URL`
- `src/lib/files/upload.ts` — remove `VITE_BACKEND_URL`
- `src/lib/images/db.ts` — update URL detection
- `src/components/hooks/logged-in-status.tsx` — remove `VITE_BACKEND_URL`
- `src/components/hooks/google-sign-in-prompt.tsx` — update `login_uri`
- `src/components/auth/google-sign-in.tsx` — update `data-login_uri`
- `src/routes/Sync.tsx` — remove `VITE_BACKEND_URL`
- `.env.local` — remove `VITE_BACKEND_URL`

### Deleted files/config:
- `VITE_BACKEND_URL` env var
- `FRONTEND_ORIGIN` env var
- CORS middleware in backend
- Old `wrangler pages deploy` script
