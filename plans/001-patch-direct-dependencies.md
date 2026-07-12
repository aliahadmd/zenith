# Plan 001: Patch Direct Dependencies With Security Fixes

> **Executor instructions**: Follow this plan in order. Run every verification
> command and confirm the expected result before moving forward. Update the Plan
> 001 status row in `plans/README.md` only after every done criterion is met.
>
> **Drift check (run first)**: `git diff --stat 31a4da6..HEAD -- package.json package-lock.json vite.config.ts vitest.config.ts`
> If package constraints differ materially from the excerpts below, stop and
> report the drift rather than choosing replacement versions by guesswork.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED - patch upgrades can alter auth, Worker bundling, or test behavior.
- **Depends on**: none
- **Category**: security | dependencies
- **Planned at**: commit `31a4da6`, 2026-07-12

## Why This Matters

The installed direct packages are `better-auth@1.6.9`, `hono@4.12.16`, and
`vite@6.4.1`. `npm audit --omit=dev` reports one critical and six high
advisories across the dependency tree, and compatible patch releases exist for
all three. Zenith only configures Better Auth's `emailOTP` plugin and does not
use Hono CORS middleware, so this is a defensive upgrade rather than evidence
of a currently exploitable application path.

## Current State

- `package.json` owns npm constraints and `package-lock.json` is committed.
- Current direct constraints are:

```json
"@better-auth/drizzle-adapter": "^1.6.9",
"better-auth": "^1.6.9",
"hono": "^4.12.16",
"vite": "^6.0.0"
```

- `src/worker/lib/auth.ts` combines Better Auth, the Drizzle adapter, and only
  `emailOTP`. Keep password auth disabled and do not enable new plugins.
- `vite.config.ts` combines React, TanStack Router, Cloudflare, and Tailwind
  plugins. Preserve their order and configuration.

| Purpose | Command | Expected result |
|---|---|---|
| Tests | `npm test` | exit 0; all Worker and frontend tests pass |
| Lint | `npm run lint` | exit 0; existing Fast Refresh warnings may remain warnings |
| Build | `npm run build` | exit 0 |
| Production validation | `npm run check` | exit 0; Wrangler dry-run only |

## Scope

**In scope**
- `package.json`
- `package-lock.json`
- Test or config files only when a compatible patch requires them.

**Out of scope**
- Major upgrades for React, TypeScript, ESLint, Vite, or Wrangler.
- Product behavior, dependency additions, source refactors, and deployment.

## Git Workflow

- Branch: `codex/001-patch-dependencies`
- Commit message: `chore: patch direct dependencies`
- Do not push, open a pull request, or deploy without explicit instruction.

## Steps

### Step 1: Record the pre-update baseline

Run:

```sh
npm audit --omit=dev --json
npm ls better-auth @better-auth/drizzle-adapter hono vite --depth=0
```

Record only package names, severities, and advisory URLs. Never copy an
environment value into a commit, issue, or plan.

**Verify**: the output identifies the current direct versions above.

### Step 2: Update compatible direct patch releases

Update Better Auth and its Drizzle adapter as a matched pair, plus Hono and the
Vite 6 patch release. At planning time compatible targets were
`better-auth@1.6.23`, `@better-auth/drizzle-adapter@1.6.23`, `hono@4.12.29`,
and `vite@6.4.3`; first confirm current compatible patches with `npm view`.
Use npm so the lockfile is regenerated consistently. Do not use
`npm audit fix --force`, because it can introduce unrelated major upgrades.

**Verify**:

```sh
npm ls better-auth @better-auth/drizzle-adapter hono vite --depth=0
git diff -- package.json package-lock.json
```

Expected: only scoped dependency constraints and their resolved graph change;
the Better Auth adapter and core package have matching releases.

### Step 3: Run all runtime and build checks

Run in order:

```sh
npm test
npm run lint
npm run build
npm run check
npm audit --omit=dev --json
```

Treat Stripe source-map warnings and the known Fast Refresh lint warnings as
warnings, not failures. Investigate any new warning or failed check.

**Verify**: all commands exit 0 and audit no longer reports the patched direct
Better Auth, Hono, and Vite versions in their vulnerable ranges.

## Test Plan

- The auth integration suite in `src/worker/routes/auth.integration.test.ts`
  must keep OTP sign-in and session access working.
- Payment tests must continue to load Stripe successfully.
- Add a narrow regression assertion only if a documented package contract
  changed; do not weaken tests merely to accept an upgrade.

## Done Criteria

- [ ] Direct package versions are patched with compatible releases.
- [ ] `npm test`, `npm run lint`, `npm run build`, and `npm run check` exit 0.
- [ ] Audit no longer reports the patched direct versions as vulnerable.
- [ ] `git diff --check` exits 0.
- [ ] No files outside dependency/config/test scope changed.
- [ ] `plans/README.md` marks Plan 001 as DONE.

## STOP Conditions

- A selected update requires a major-version jump or changes the Drizzle adapter API.
- Better Auth OTP, cookie propagation, or authenticated Worker tests fail twice after a scoped compatibility fix.
- `npm audit` proposes removing a runtime package outside the plan scope.
- The lockfile update changes unrelated direct package majors.

## Maintenance Notes

- Keep Better Auth and `@better-auth/drizzle-adapter` on matching releases.
- Review future audit output for reachable code paths, not severity labels alone.
- The deferred multipart-audio migration needs this patched toolchain but is not part of this plan.
