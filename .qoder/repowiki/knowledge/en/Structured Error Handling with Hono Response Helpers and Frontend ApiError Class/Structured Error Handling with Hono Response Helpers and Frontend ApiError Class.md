---
kind: error_handling
name: Structured Error Handling with Hono Response Helpers and Frontend ApiError Class
category: error_handling
scope:
    - '**'
source_files:
    - src/worker/lib/http.ts
    - src/worker/index.ts
    - src/worker/middleware/auth.ts
    - src/worker/middleware/admin.ts
    - src/worker/routes/auth.ts
    - src/worker/routes/posts.ts
    - src/react-app/lib/api.ts
    - src/react-app/lib/auth.ts
    - src/react-app/context/AuthContext.tsx
    - src/worker/lib/http.test.ts
---

## Overview

The Zenith Creator Platform uses a dual-layer error handling strategy: **structured HTTP error responses** on the Cloudflare Workers backend (via Hono) and a typed **ApiError class** on the React frontend. Errors flow through middleware guards, route-level validation, and a global error handler.

---

## Backend Error System (Cloudflare Workers / Hono)

### Core Error Module: `src/worker/lib/http.ts`

All server-side errors are produced through a centralized helper module that defines:

1. **ErrorCode type** — a union of canonical error codes:
   - `bad_request`, `validation_failed`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `payload_too_large`, `unsupported_media_type`, `internal_server_error`
   - Custom codes (e.g., `account_suspended`, `otp_email_unavailable`, `schedule_processing`) can be passed as strings for domain-specific scenarios.

2. **Standard error envelope** — every error response follows this JSON shape:
   ```json
   {
     "error": {
       "code": "validation_failed",
       "message": "Validation failed",
       "details": { ...optional }
     }
   }
   ```

3. **Named response helpers** — each maps to an HTTP status code and error code:
   - `errorResponse(c, status, code, message, details?)` — generic builder
   - `validationError(c, error)` — returns 422 with Zod issue details
   - `badRequest(c, message?, details?)` — 400
   - `unauthorized(c, message?)` — 401
   - `forbidden(c, message?)` — 403
   - `notFound(c, message?)` — 404
   - `conflict(c, message)` — 409
   - `payloadTooLarge(c, message)` — 413
   - `unsupportedMediaType(c, message)` — 415
   - `serverError(c, message?)` — 500

4. **Zod integration hook** — `zodHook` is passed to `@hono/zod-validator`'s `zValidator` to automatically return a 422 `validationError` when schema validation fails.

### Global Error Handler

In `src/worker/index.ts`, a catch-all error handler ensures unhandled exceptions never leak stack traces:

```ts
app.onError((err, c) => {
  console.error(err)
  return serverError(c)
})
```

A custom 404 handler distinguishes API routes from static asset fallbacks:

```ts
app.notFound((c) => {
  const url = new URL(c.req.url)
  if (url.pathname.startsWith('/api/')) return notFound(c)
  // Fallback to ASSETS or return notFound
})
```

### Middleware Error Patterns

Authentication and authorization middleware (`src/worker/middleware/auth.ts`, `src/worker/middleware/admin.ts`) short-circuit requests by returning early error responses:

- Missing session → `unauthorized(c)` (401)
- Suspended account → `errorResponse(c, 403, 'account_suspended', ...)` (403)
- Wrong role → `forbidden(c)` (403)
- Missing admin role → `forbidden(c, 'Administrator access required')` (403)
- Non-owner admin action → `forbidden(c, 'Owner access required')` (403)

Middleware runs before route handlers, so errors here prevent any business logic from executing.

### Route-Level Validation and Errors

Routes use `zValidator` with `zodHook` for automatic input validation. Manual validation checks within handlers also use the error helpers:

```ts
if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Validation failed', { issues: parsed.error.issues })
if (images.length > MAX_IMAGES) return unsupportedMediaType(c, '...')
if (file.size > MAX_IMAGE_SIZE) return payloadTooLarge(c, '...')
```

Domain-specific error codes appear in routes like `auth.ts`:
- `otp_email_unavailable` (503) — email delivery failure
- `too_many_otp_attempts` (403) — rate-limited OTP verification
- `invalid_otp` (400) — wrong or expired OTP
- `password_auth_disabled` (400) — legacy endpoint blocked

---

## Frontend Error System (React)

### ApiError Class: `src/react-app/lib/api.ts`

The frontend defines a typed error class that mirrors the backend envelope:

```ts
export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
}
```

### API Fetch Layer

The `apiFetch` function normalizes all HTTP responses into an `ApiResponse<T>` shape:

```ts
type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
  code?: string
  details?: unknown
}
```

Key behaviors:
- Parses JSON error envelopes from the backend and extracts `code`, `message`, and `details`
- Dispatches a `CustomEvent('unauthorized')` on 401 responses, triggering global auth state reset
- Dispatches `CustomEvent('account-suspended')` when `code === 'account_suspended'`
- Catches network failures and returns `{ error: 'Network error', status: 0 }`

### Throwing vs. Returning Errors

Two usage patterns exist:

1. **Lenient pattern** — `apiGet`, `apiPost`, etc. return `ApiResponse<T>` without throwing. Callers check `response.error`.
2. **Strict pattern** — `apiRequest`, `apiGetRequired`, `apiPostRequired`, etc. throw `ApiError` when `error` is present. Used with TanStack Query mutations where errors propagate to `onError` callbacks.

### Context-Level Error Handling

`AuthContext.tsx` listens for dispatched events and clears auth state:

```ts
useEffect(() => {
  const handleUnauthorized = () => queryClient.setQueryData(authKeys.me, null)
  window.addEventListener('unauthorized', handleUnauthorized)
  window.addEventListener('account-suspended', handleUnauthorized)
  return () => { /* cleanup */ }
}, [queryClient])
```

Mutation error handling catches `ApiError` instances and displays user-friendly messages:

```ts
catch (error) {
  return {
    error: error instanceof ApiError ? error.message : 'Invalid or expired code',
    user: null,
  }
}
```

---

## Developer Conventions

1. **Always use the named helpers** (`badRequest`, `unauthorized`, etc.) instead of manually constructing `c.json()` error responses. This ensures consistent envelope shape.
2. **Use `zodHook` with `zValidator`** for automatic 422 responses on schema failures. Do not manually check Zod results unless you need custom error formatting.
3. **Return early on errors** in route handlers — do not nest success logic inside `else` blocks.
4. **Use domain-specific error codes** (strings outside the `ErrorCode` union) sparingly and document them. The frontend may dispatch custom events based on these codes.
5. **Frontend callers should prefer strict helpers** (`apiPostRequired`, etc.) when using TanStack Query, since mutations handle thrown errors via `onError`. Use lenient helpers only when you need inline error inspection.
6. **Never expose raw exception messages** to clients. The global `onError` handler logs the error server-side and returns a generic `internal_server_error` response.
7. **Middleware errors take precedence** — authentication and authorization checks run before route logic, so handlers can assume `c.var.user` is valid.