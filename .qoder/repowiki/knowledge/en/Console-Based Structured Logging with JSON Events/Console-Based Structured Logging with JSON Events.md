---
kind: logging_system
name: Console-Based Structured Logging with JSON Events
category: logging_system
scope:
    - '**'
source_files:
    - src/worker/index.ts
    - src/worker/lib/scheduling.ts
    - src/worker/lib/admin.ts
    - src/worker/lib/publication.ts
    - src/worker/lib/memberships.ts
    - src/worker/routes/payments.ts
    - package.json
---

## Overview

The Zenith Creator Platform uses **native `console` methods** (`console.log`, `console.warn`, `console.error`) as its logging mechanism, running on Cloudflare Workers runtime. There is no dedicated logging framework (e.g., pino, winston, bunyan). Instead, structured logging is achieved by passing `JSON.stringify()`-encoded objects to console methods.

## Logging Approach

### No External Framework

The repository does not include any third-party logging library in `package.json`. All logging relies on the built-in `console` API provided by the Cloudflare Workers runtime. The `worker-configuration.d.ts` type definitions confirm support for `console.debug()`, `console.info()`, `console.log()`, `console.warn()`, and `console.error()`.

### Structured Logging Convention

For operational events that need machine-parseable output, the codebase follows a consistent pattern:

```typescript
console.log(JSON.stringify({ event: 'content_published', postId, kind: record.kind, publishedAt: now.toISOString() }))
console.error(JSON.stringify({ event: 'content_schedule_failed', postId, input.postId, code: input.code, attemptCount: MAX_ATTEMPTS }))
console.warn(JSON.stringify({ event: 'content_schedule_retry', postId: claimed.postId, attemptCount: claimed.attemptCount, code }))
```

Key characteristics:
- Every structured log includes an **`event`** field identifying the log event type (e.g., `content_published`, `admin_action`, `membership_plan_transition_failed`).
- Contextual fields are included alongside `event` (e.g., `postId`, `creatorId`, `attemptCount`, `code`).
- Error messages are extracted via `error instanceof Error ? error.message : String(error)` to ensure serializability.
- Output is wrapped in `JSON.stringify()` so Cloudflare Workers log aggregation tools can parse it as structured JSON.

### Unstructured Logging

Some error paths use simple unstructured console calls:

```typescript
console.error('OTP email delivery failed:', error)
console.error('R2 upload failed:', err)
console.error(err)  // global error handler in index.ts
```

These are typically used for unexpected infrastructure errors where structured context is less critical or the error object itself carries sufficient detail.

## Log Levels Used

| Level | Usage |
|-------|-------|
| `console.log` | Successful operations, scheduled task summaries, admin actions |
| `console.warn` | Retry scenarios, non-fatal warnings |
| `console.error` | Failures, exceptions, infrastructure errors |

`console.debug` and `console.info` are available per the runtime types but are not actively used in the codebase.

## Key Logging Locations

### Global Error Handler

`src/worker/index.ts` registers a Hono-level error handler that logs all unhandled errors:

```typescript
app.onError((err, c) => {
  console.error(err)
  return serverError(c)
})
```

### Scheduled Task Logging

`src/worker/lib/scheduling.ts` emits structured logs at each stage of the content scheduling pipeline:
- `content_schedule_tick` — summary of each scheduled run (due count, published, retried, failed)
- `content_schedule_retry` — when a publish attempt is deferred for retry
- `content_schedule_failed` — when max retries are exhausted

### Admin Audit Logging

`src/worker/lib/admin.ts` writes both a database audit record and a structured log for every admin action:

```typescript
console.log(JSON.stringify({
  event: 'admin_action',
  actorId: input.actorId,
  action: input.action,
  targetType: input.targetType,
  targetId: input.targetId,
}))
```

### Payment/Webhook Error Logging

`src/worker/routes/payments.ts` uses structured logging for Stripe-related failures (e.g., `stripe_price_archive_failed`) and falls back to unstructured `console.error(error)` for generic payment provider errors.

### Publication Pipeline

`src/worker/lib/publication.ts` logs successful publications and notification failures with structured events.

## Developer Conventions

1. **Prefer structured logs for operational events.** Use `JSON.stringify({ event: '...', ...context })` for any log that may be queried, aggregated, or monitored.
2. **Always include an `event` field.** This enables log filtering and alerting by event type.
3. **Extract error messages safely.** Use `error instanceof Error ? error.message : String(error)` to avoid serialization issues.
4. **Use `console.error` for failures, `console.warn` for retries/warnings, `console.log` for successes and summaries.**
5. **Do not log sensitive data.** Avoid including PII, tokens, or secrets in log fields.
6. **Unstructured logs are acceptable for unexpected infrastructure errors** where the raw error object provides the most useful debugging information.

## Limitations

- No log level configuration or filtering at runtime.
- No log rotation, retention policy, or sink configuration within the application — these are managed by Cloudflare Workers platform.
- No correlation IDs or request tracing across log entries.
- Frontend (`src/react-app/`) does not appear to implement any client-side logging strategy beyond what testing frameworks provide.