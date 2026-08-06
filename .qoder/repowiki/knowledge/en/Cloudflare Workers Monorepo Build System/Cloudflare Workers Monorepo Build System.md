---
kind: build_system
name: Cloudflare Workers Monorepo Build System
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - wrangler.json
    - drizzle.config.ts
    - vitest.config.ts
    - vitest.config.frontend.ts
    - tsconfig.json
    - tsconfig.app.json
    - tsconfig.worker.json
    - eslint.config.js
    - SKILL.md
    - AGENTS.md
---

## Build System Overview

The Zenith Creator Platform uses a **Vite + Wrangler** build pipeline targeting Cloudflare Workers, with no traditional Makefiles, Dockerfiles, or external CI configuration files. The entire build, test, and deployment lifecycle is orchestrated through npm scripts and Cloudflare's native tooling.

### Core Toolchain

- **Package Manager**: npm (explicitly required; pnpm/bun are discouraged)
- **Bundler**: Vite 6.x with `@cloudflare/vite-plugin` for Workers integration
- **TypeScript**: Project references split across three configs (`tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`) managed via root `tsconfig.json`
- **Testing**: Vitest with dual configurations — `vitest.config.ts` for worker tests using `@cloudflare/vitest-pool-workers`, and `vitest.config.frontend.ts` for React component tests in jsdom
- **Linting**: ESLint 9.x with TypeScript ESLint, react-hooks, and react-refresh plugins
- **Deployment**: Wrangler CLI (`wrangler deploy`) with environment-aware builds

### Build Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development via Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then Vite production build |
| `npm run build:production` | Production build with `CLOUDFLARE_ENV=production` |
| `npm run deploy` | Alias for `deploy:production` |
| `npm run deploy:production` | Build + `wrangler deploy` to production |
| `npm run check` | Full verification: build + `wrangler deploy --dry-run` |
| `npm run lint` | ESLint across all TS/TSX files |
| `npm test` | Vitest test suite (worker tests only by default) |
| `npm run cf-typegen` | Generate Cloudflare binding types via `wrangler types` |

### Architecture Decisions

1. **Single-package monorepo**: Frontend (`src/react-app`) and backend (`src/worker`) coexist in one package with shared dependencies. No workspace tooling (e.g., Turborepo, Nx) is used.

2. **Environment-driven deploys**: The `CLOUDFLARE_ENV` environment variable gates production builds. Wrangler's `env.production` block in `wrangler.json` defines production-specific bindings (D1 database ID, R2 bucket name, cron triggers, secrets).

3. **Assets served from Workers**: The `assets.directory` in `wrangler.json` points to `./dist/client`, meaning Vite's output is deployed as static assets alongside the Worker. SPA fallback is enabled via `not_found_handling: single-page-application`.

4. **Type-safe API contracts**: The `@cloudflare/vite-plugin` enables type inference between Hono routes and frontend clients. Running `wrangler types` after binding changes regenerates `worker-configuration.d.ts`.

5. **Database migrations via Drizzle**: Migration files live in `/drizzle/` with sequential naming (`0000_*.sql`). `drizzle.config.ts` configures D1 HTTP driver credentials from environment variables. Migrations are applied through Wrangler's D1 integration (`migrations_dir: "drizzle"`).

### Key Conventions for Developers

- **Always run `wrangler types`** after modifying bindings in `wrangler.json` to keep TypeScript types synchronized.
- **Use `npm run check`** before committing when Worker config, build output, or deploy compatibility may be affected — it combines type-checking, building, and a dry-run deploy.
- **Tests colocated with source**: Worker tests use `.test.ts` suffix under `src/worker/`; frontend tests use `.test.tsx` under `src/react-app/`. Run all tests via `npm test`.
- **No containerization**: The project relies entirely on Cloudflare's edge runtime; there are no Dockerfiles or container-based deployment paths.
- **No external CI**: No `.github/workflows`, GitLab CI, CircleCI, or Jenkins configuration exists. Deployment is manual via `npm run deploy` or would require adding CI separately.
- **Strict TypeScript**: All configs enforce `strict: true`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.

### Missing Elements

- No CI/CD pipeline configuration (GitHub Actions, etc.)
- No containerization (Docker, Podman)
- No Makefile or shell script automation
- No version numbering or release tagging strategy
- No artifact registry or package publishing configuration