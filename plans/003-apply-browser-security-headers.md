# Plan 003: Apply Browser Security Headers To Static And API Responses

> **Executor instructions**: Follow these steps in order. Start CSP as
> report-only only when an unverified browser dependency requires it; never
> guess at a restrictive policy that breaks sign-in, media, or checkout.
>
> **Drift check (run first)**: `git diff --stat 31a4da6..HEAD -- src/worker/index.ts public wrangler.json src/worker/**/*.test.ts`
> Stop if static-header configuration or response-header middleware already
> exists, because the implementation approach must then be reconsidered.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED - an incomplete CSP can block valid browser resources.
- **Depends on**: `plans/001-patch-direct-dependencies.md`
- **Category**: security
- **Planned at**: commit `31a4da6`, 2026-07-12

## Why This Matters

The live custom domain returns no application-level `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or
`Permissions-Policy` header for either its SPA document or API errors. Zenith
has authenticated sessions, payments, private media, and creator content, so
baseline browser protections are a concrete defense-in-depth improvement.

## Current State

- `src/worker/index.ts:17-48` mounts Hono routes and error/not-found handlers,
  but adds no response headers.
- `wrangler.json` serves static assets from `dist/client`; only `/api/*` runs
  the Worker first. Static headers require a public `_headers` file, while API
  headers require Worker middleware.
- `src/react-app/pages/ProfilePage.tsx` uses private same-origin media and
  opens external social links with `rel="noopener noreferrer"`.
- Stripe Checkout is opened by assigning `window.location.href`; do not allow
  external scripts just for that navigation.
- `public/` has no `_headers` file.

## Scope

**In scope**
- `public/_headers` (new)
- `src/worker/index.ts`
- `src/worker/index.test.ts` (new), or the smallest suitable existing Worker test
- A short policy comment only when an exception is non-obvious.

**Out of scope**
- Better Auth cookie configuration.
- Replacing third-party libraries, adding analytics, or changing media access.
- Cloudflare dashboard security rules and production deployment.

## Git Workflow

- Branch: `codex/003-security-headers`
- Commit message: `fix: add browser security headers`

## Steps

### Step 1: Inventory actual browser resource origins

Before writing CSP, search source and built output for external `script`,
`style`, `font`, `connect`, `img`, `media`, `frame`, and `worker` origins.
Classify every origin as required or removable. Local font packages, APIs, and
media should remain same-origin.

**Verify**:

```sh
rg -n --glob '*.{ts,tsx,css,html}' 'https?://' src public index.html
```

Expected: every external browser origin has a documented reason or is removed.

### Step 2: Add static-document and asset headers

Create `public/_headers` so Vite copies it to static output. Apply to `/*`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- a `Permissions-Policy` that disables unused capabilities such as camera,
  microphone, geolocation, and payment
- CSP based on `default-src 'self'` and `frame-ancestors 'none'`

Use `Content-Security-Policy-Report-Only` only when Step 1 reveals a required
resource that cannot be browser-tested locally. Otherwise enforce CSP.

**Verify**: `npm run build` exits 0 and `dist/client/_headers` contains the
same rules.

### Step 3: Add API-safe headers in Hono

Add top-level middleware in `src/worker/index.ts`, before route mounting, that
awaits `next()` and appends API-safe baseline headers to Worker responses,
including 401, validation, 404, and 500 responses. Preserve multiple
`Set-Cookie` values, ranges, cache-control, and content-disposition.

Do not attach an HTML CSP intended for documents to streamed/downloaded media.
At minimum apply MIME, referrer, and frame protections consistently to
Worker-generated API responses.

**Verify**: existing authenticated and unauthenticated endpoint semantics stay
unchanged under the test suite.

### Step 4: Add regression tests and smoke checks

Create a small Worker test modeled on
`src/worker/routes/auth.integration.test.ts`, or extend it. Assert headers on:

- unauthenticated `GET /api/auth/me` (401 JSON)
- a validation failure (422 JSON)
- a successful authenticated API response

After a local production build, use preview or the custom domain to confirm
headers on `/` and `/api/auth/me`.

**Verify**:

```sh
npm test
npm run build
curl -sS -I http://127.0.0.1:<preview-port>/
curl -sS -i http://127.0.0.1:<preview-port>/api/auth/me
```

Expected: static and API responses expose intended headers without changing
content type, response status, or cookie behavior.

## Done Criteria

- [ ] Static assets/documents receive baseline headers through `public/_headers`.
- [ ] API success and error responses receive API-safe headers through Hono middleware.
- [ ] CSP is either enforced and browser-tested, or explicitly report-only with a tracked reason.
- [ ] Tests cover API header behavior.
- [ ] `npm test`, `npm run lint`, `npm run build`, and `npm run check` exit 0.
- [ ] `plans/README.md` marks Plan 003 as DONE.

## STOP Conditions

- A feature needs `unsafe-inline`, a wildcard origin, or another broad CSP exception that cannot be justified and tested.
- Header middleware mutates or collapses multiple Set-Cookie values.
- Vite does not copy `_headers` to the static output.
- Browser testing breaks private media, course media, or checkout navigation.

## Maintenance Notes

- New external scripts, fonts, analytics, or players must update CSP deliberately.
- Keep Worker API headers separate from static `_headers`; Cloudflare does not
  apply `_headers` to Worker-generated API responses.
