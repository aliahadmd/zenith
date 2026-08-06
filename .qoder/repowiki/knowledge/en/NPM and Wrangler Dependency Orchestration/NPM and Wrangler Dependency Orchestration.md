---
kind: dependency_management
name: NPM and Wrangler Dependency Orchestration
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - wrangler.json
    - components.json
    - plans/001-patch-direct-dependencies.md
    - drizzle.config.ts
---

The Zenith Creator Platform uses a single-root NPM workspace strategy to manage dependencies for both its React frontend and Cloudflare Workers backend. There are no separate `package.json` files for the `src/react-app` or `src/worker` directories; all third-party libraries are declared in the root `package.json`.

### Core Systems
- **Package Manager**: NPM (v10+ implied by lockfile v3). The project relies on `package-lock.json` for deterministic installs.
- **Build & Dev Tooling**: Vite serves as the primary build orchestrator, using the `@cloudflare/vite-plugin` to integrate the Worker runtime into the development server. Wrangler is used for deployment, type generation (`wrangler types`), and local emulation.
- **Database Schema Management**: Drizzle ORM is managed via `drizzle-kit`, with migrations stored in the `drizzle/` directory. The `wrangler.json` configuration points directly to this directory for D1 database bindings.

### Key Conventions
1. **Unified Dependency Graph**: By co-locating frontend and backend dependencies, the team ensures type compatibility (e.g., shared Zod schemas) but must carefully manage environment-specific imports (e.g., ensuring Node-only packages don't leak into the browser bundle).
2. **Patch-First Security Strategy**: The `plans/001-patch-direct-dependencies.md` document establishes a strict convention for dependency updates: 
   - Use `npm audit --omit=dev` to identify risks.
   - Apply compatible patch releases (e.g., `better-auth@1.6.9` -> `1.6.23`) rather than major upgrades.
   - Verify integrity via `npm test`, `npm run lint`, and `npm run check` (Wrangler dry-run) before committing.
3. **Environment-Specific Configuration**: `wrangler.json` handles environment-dependent dependency bindings (D1, R2, Send Email) through named environments (`production` vs. default/local), avoiding the need for multiple package manifests.
4. **UI Component Registry**: The `components.json` file configures `shadcn/ui` to pull from the `radix-luma` style registry, managing UI dependencies like `@radix-ui/react-*` and `lucide-react` as direct dependencies rather than dev-only tools.

### Developer Rules
- **No Major Upgrades Without Plan**: Major version jumps for core tools (React, Vite, Wrangler) are explicitly out of scope for routine maintenance and require dedicated implementation plans.
- **Lockfile Integrity**: `package-lock.json` is committed and must be updated via `npm install` or `npm update` commands, never manually edited.
- **Matched Pair Updates**: When updating `better-auth`, the `@better-auth/drizzle-adapter` must be updated to the matching version to prevent API mismatches.