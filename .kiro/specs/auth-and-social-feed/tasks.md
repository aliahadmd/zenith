# Implementation Plan: auth-and-social-feed

## Overview

Full-stack implementation of user authentication, role-based access control, social feed, profiles, and settings on a Cloudflare Workers + D1 + R2 backend with a React 19 SPA frontend. Tasks are ordered so each step builds on the previous, ending with all components wired together and verified.

## Tasks

- [x] 1. Project setup — dependencies, bindings, and tooling
  - Install new runtime dependencies: `drizzle-orm`, `react-router`
  - Install new dev dependencies: `drizzle-kit`, `vitest`, `@cloudflare/vitest-pool-workers`, `fast-check`
    - Use latest versions for all packages
  - Add D1 and R2 bindings to `wrangler.json`:
    - D1: binding name `DB`, database name `social-feed-db` (create with `wrangler d1 create social-feed-db`)
    - R2: binding name `AVATARS`, bucket name `social-feed-avatars` (create with `wrangler r2 bucket create social-feed-avatars`)
  - Add `JWT_SECRET` to `wrangler.json` vars section (placeholder value; real value set via `wrangler secret put JWT_SECRET`)
  - Create `drizzle.config.ts` at project root pointing to `src/worker/db/schema.ts` and the D1 database
  - Add `vitest.config.ts` (or extend `vite.config.ts`) with `@cloudflare/vitest-pool-workers` pool for worker tests
  - Add `test` script to `package.json`: `vitest --run`
  - Run `npx wrangler types` to regenerate `worker-configuration.d.ts` with the new `DB` and `AVATARS` bindings
  - Install shadcn components via CLI: `npx shadcn add input label avatar separator tabs card form sonner`
    - `button` is already present; skip it
  - _Requirements: 11.6_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create Drizzle schema file `src/worker/db/schema.ts`
    - Define `users` table: `id` (text PK, UUID), `email` (text, unique, not null), `password_hash` (text, not null), `role` (text enum `subscriber|creator`, default `subscriber`), `display_name` (text, not null), `username` (text, unique, not null), `tagline` (text), `avatar_url` (text), `avatar_r2_key` (text), `social_links` (text, JSON string), `created_at` (integer timestamp, default `unixepoch()`)
    - Define `posts` table: `id` (text PK), `author_id` (text FK → users.id cascade), `body` (text, not null), `created_at` (integer timestamp); add index `posts_author_created_idx` on `(author_id, created_at)`
    - Define `follows` table: `follower_id` (text FK → users.id cascade), `followee_id` (text FK → users.id cascade), `created_at` (integer timestamp); composite PK `(follower_id, followee_id)`; indexes `follows_follower_idx` and `follows_followee_idx`
    - Export inferred types: `User`, `NewUser`, `Post`, `Follow`
    - _Requirements: 1.2, 4.1, 6.1_
  - [x] 2.2 Create Drizzle client factory `src/worker/db/client.ts`
    - Export `createDb(d1: D1Database)` using `drizzle(d1, { schema })`
    - Export `Db` type alias
    - _Requirements: 1.2_
  - [x] 2.3 Generate and apply the initial migration
    - Run `npx drizzle-kit generate` to produce the SQL migration file under `drizzle/`
    - Run `npx wrangler d1 migrations apply social-feed-db --local` to apply locally
    - Commit the generated migration file
    - _Requirements: 1.2, 4.1, 6.1_

- [x] 3. Crypto library — PBKDF2 password hashing and JWT (Web Crypto API)
  - [x] 3.1 Implement `src/worker/lib/crypto.ts`
    - `hashPassword(password: string): Promise<string>` — PBKDF2-HMAC-SHA256, 100 000 iterations, 32-byte derived key, 16-byte random salt; encode as `pbkdf2:sha256:100000:<base64(salt)>:<base64(dk)>`
    - `verifyPassword(password: string, hash: string): Promise<boolean>` — parse the stored hash string, re-derive with same params, constant-time compare
    - `signJwt(payload: JwtPayload, secret: string): Promise<string>` — HMAC-SHA256 over `base64url(header).base64url(payload)`, return full JWT string; set `exp` to `iat + 7 days`
    - `verifyJwt(token: string, secret: string): Promise<JwtPayload | null>` — verify signature and `exp`; return null on any failure
    - Define `JwtPayload` type: `{ sub: string; email: string; role: 'subscriber' | 'creator'; iat: number; exp: number }`
    - Use only `crypto.subtle` (Web Crypto API) — no Node.js crypto imports
    - _Requirements: 1.3, 1.7, 2.2, 4.2_
  - [x] 3.2 Write property tests for crypto functions (Properties 1–4)
    - **Property 1: Password hash round-trip** — `fc.string({ minLength: 8, maxLength: 128 })` → hash then verify returns `true`
    - **Validates: Requirements 1.3, 9.2**
    - **Property 2: Wrong password verification always fails** — `fc.tuple(fc.string({ minLength: 8 }), fc.string({ minLength: 8 })).filter(([a,b]) => a !== b)` → hash `p1`, verify `p2` returns `false`
    - **Validates: Requirements 2.4, 9.3, 10.5**
    - **Property 3: JWT sign/verify round-trip preserves payload** — arbitrary `{ sub, email, role }` → sign then verify returns equivalent payload fields
    - **Validates: Requirements 1.7, 2.2, 4.2**
    - **Property 4: Tampered JWT is always rejected** — valid signed token, mutate one character at a random position → verify returns `null`
    - **Validates: Requirements 4.3**
    - Place tests in `src/worker/lib/crypto.test.ts`; use `{ numRuns: 100 }` for all properties
    - Tag each test: `// Feature: auth-and-social-feed, Property N: <title>`

- [x] 4. Input validators
  - [x] 4.1 Implement `src/worker/lib/validators.ts`
    - `isValidEmail(email: string): boolean` — RFC-5321-compatible regex: must have `local@domain.tld` structure
    - `isValidPassword(password: string): boolean` — returns `true` iff `password.length >= 8`
    - _Requirements: 1.5, 1.6, 9.4, 10.3_
  - [x] 4.2 Write property tests for validators (Properties 5–6)
    - **Property 5: Email validator rejects all malformed addresses** — generate strings without `@`, without domain, without TLD, or with illegal characters → `isValidEmail` returns `false`
    - **Validates: Requirements 1.5, 10.3**
    - **Property 6: Password length validator enforces 8-character minimum** — `fc.string({ maxLength: 7 })` → `isValidPassword` returns `false`; `fc.string({ minLength: 8 })` → returns `true`
    - **Validates: Requirements 1.6, 9.4**
    - Place tests in `src/worker/lib/validators.test.ts`; use `{ numRuns: 100 }`
    - Tag each test: `// Feature: auth-and-social-feed, Property N: <title>`

- [x] 5. Auth middleware and RBAC
  - Create `src/worker/middleware/auth.ts`
  - Define `HonoEnv` type: `{ Bindings: Env; Variables: { user: { id: string; email: string; role: 'subscriber' | 'creator' } } }`
  - Export `HonoEnv` from this file for reuse across route files
  - `authMiddleware` — reads `session` cookie via `getCookie(c, 'session')`, calls `verifyJwt`, sets `c.var.user`; returns 401 if missing or invalid
  - `requireRole(role)` — factory returning middleware that checks `c.var.user.role`; returns 403 if mismatch
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 6. Auth routes (`/api/auth`)
  - Create `src/worker/routes/auth.ts` exporting `authRoutes` as a `new Hono<HonoEnv>()`
  - `POST /register` — validate email + password, check duplicate email (409), hash password, generate UUID + username slug from email local-part, insert user, sign JWT, set `session` cookie (httpOnly, sameSite: Lax, path: /, maxAge: 604800, secure: true), return 201 `{ id, email, role, displayName, username }`
  - `POST /login` — look up user by email, verify password hash; return same 401 message for both "not found" and "wrong password" cases; on success sign JWT, set cookie, return 200 `{ id, email, role, displayName, username }`
  - `POST /logout` — `authMiddleware`, clear cookie (Max-Age=0), return 200 `{ message: 'Logged out' }`
  - `GET /me` — `authMiddleware`, query DB for full user row by `c.var.user.id`, return 200 `{ id, email, role, displayName, username, tagline, avatarUrl, socialLinks }`
  - _Requirements: 1.1–1.7, 2.1–2.5, 3.1–3.3, 4.2–4.5_

- [x] 7. Feed routes (`/api/feed`)
  - Create `src/worker/routes/feed.ts` exporting `feedRoutes`
  - `GET /` — `authMiddleware`, `requireRole('subscriber')`; query posts joined with follows where `follower_id = c.var.user.id`, order by `posts.created_at DESC`; if empty return `{ posts: [], message: 'You have not followed yet' }`; otherwise return `{ posts: [{ id, body, createdAt, author: { displayName, username } }] }`
  - `POST /follow` — `authMiddleware`, `requireRole('subscriber')`; accept `{ creatorId: string }` body; verify creator exists and has role `creator` (404 if not); insert follow record; return 409 if duplicate (catch unique constraint violation); return 201 `{ followerId, followeeId }`
  - _Requirements: 5.1–5.5, 6.1–6.4_
  - [x] 7.1 Write property test for feed ordering (Property 7)
    - **Property 7: Feed posts are always ordered by creation date descending** — for any non-empty list of posts, every consecutive pair satisfies `posts[i].createdAt >= posts[i+1].createdAt`
    - **Validates: Requirements 5.2**
    - Test the sort logic in isolation (pure function extracted from route handler or tested via `app.request()` with seeded D1 mock)
    - Place in `src/worker/routes/feed.test.ts`; tag: `// Feature: auth-and-social-feed, Property 7: Feed posts are always ordered by creation date descending`

- [x] 8. Profile routes (`/api/profile`)
  - Create `src/worker/routes/profile.ts` exporting `profileRoutes`
  - `GET /:username` — public; query user by username; 404 if not found; return `{ id, displayName, username, tagline, avatarUrl, socialLinks }`
  - `GET /:username/subscriptions` — public; look up user by username, then query follows joined with users where `follower_id = user.id` and followee role = `creator`; return `{ subscriptions: [{ displayName, username, avatarUrl }] }`
  - `GET /avatar/:userId` — public; read `avatar_r2_key` from DB; call `c.env.AVATARS.get(key)`; stream response body with correct `Content-Type` header; return 404 if object not found
  - _Requirements: 7.1–7.6_

- [x] 9. Settings routes (`/api/settings`)
  - Create `src/worker/routes/settings.ts` exporting `settingsRoutes`
  - `PUT /avatar` — `authMiddleware`; parse `multipart/form-data`; validate Content-Type (`image/jpeg`, `image/png`, `image/webp`) → 415 if invalid; validate size ≤ 5 242 880 bytes → 413 if exceeded; read existing `avatar_r2_key` from DB and delete from R2 if present; put new object under `avatars/<userId>.<ext>`; update `avatar_url` and `avatar_r2_key` in DB; return 200 `{ avatarUrl: '/api/profile/avatar/<userId>' }`
  - `PUT /password` — `authMiddleware`; accept `{ currentPassword, newPassword }`; verify current password hash → 401 if wrong; validate new password length ≥ 8 → 422 if short; validate new ≠ current → 422 if same; hash new password; update DB; return 200
  - `PUT /email` — `authMiddleware`; accept `{ newEmail, currentPassword }`; validate email format → 422 if invalid; check duplicate email → 409 if taken; verify current password → 401 if wrong; update DB; return 200
  - _Requirements: 8.1–8.7, 9.1–9.5, 10.1–10.5_

- [x] 10. Wire up Hono app entry point
  - Rewrite `src/worker/index.ts` to import and mount all four route modules
  - Mount: `app.route('/api/auth', authRoutes)`, `app.route('/api/feed', feedRoutes)`, `app.route('/api/profile', profileRoutes)`, `app.route('/api/settings', settingsRoutes)`
  - Add global error handler (`app.onError`) returning `{ error: 'Internal server error' }` with status 500
  - Add `app.notFound` handler returning `{ error: 'Not found' }` with status 404
  - Use `HonoEnv` type on the root `new Hono<HonoEnv>()`
  - _Requirements: 4.5_

- [x] 11. Checkpoint — backend unit tests pass
  - Run `npm test` and confirm all crypto, validator, and route tests pass
  - Fix any type errors reported by `tsc`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend API client (`src/react-app/lib/api.ts`)
  - Create typed `apiFetch` wrapper:
    - Always passes `credentials: 'include'`
    - Sets `Content-Type: application/json` for non-FormData bodies
    - Returns `{ data: T | null; error: string | null; status: number }`
    - On 401 response, dispatches a custom `unauthorized` window event (consumed by AuthContext to redirect)
  - Export typed helper functions: `apiGet<T>`, `apiPost<T>`, `apiPut<T>` using `apiFetch`
  - _Requirements: 4.3, 11.4_

- [x] 13. AuthContext and ProtectedRoute
  - [x] 13.1 Create `src/react-app/context/AuthContext.tsx`
    - `AuthProvider` — on mount calls `GET /api/auth/me`; stores `currentUser: User | null` and `isLoading: boolean` in state
    - Exposes `login(email, password)` — calls `POST /api/auth/login`, updates `currentUser`
    - Exposes `logout()` — calls `POST /api/auth/logout`, sets `currentUser` to null
    - Listens for the `unauthorized` window event from the API client and sets `currentUser` to null
    - Export `useAuth()` hook
    - _Requirements: 4.3, 11.4_
  - [x] 13.2 Create `src/react-app/components/ProtectedRoute.tsx`
    - Reads `{ currentUser, isLoading }` from `useAuth()`
    - While `isLoading`: render a centered full-screen spinner using Tailwind utilities
    - If `currentUser` is null after load: `<Navigate to="/login" replace />`
    - Otherwise: `<Outlet />`
    - _Requirements: 11.4_

- [x] 14. App routing — update `main.tsx` and `App.tsx`
  - Update `src/react-app/main.tsx` to wrap `<App />` in `<BrowserRouter>` from `react-router`
  - Rewrite `src/react-app/App.tsx` with the full route tree:
    - Public: `/login` → `<LoginPage />`, `/register` → `<RegisterPage />`
    - Protected (inside `<ProtectedRoute>` → `<AppShell>`): index → `<Navigate to="/feed" replace />`, `/feed` → `<FeedPage />`, `/profile/:username` → `<ProfilePage />`, `/settings` → `<SettingsPage />`
  - Import all page components (stubs are acceptable at this stage — create empty placeholder files so imports resolve)
  - _Requirements: 11.4, 11.5_

- [x] 15. AppShell and Sidebar
  - [x] 15.1 Create `src/react-app/components/Sidebar.tsx`
    - Use `useLocation()` and `NavLink` from `react-router` to highlight the active route
    - Render links to `/feed`, `/profile/<username>`, `/settings`
    - Render current user's `Avatar` (shadcn) and `displayName` at the top
    - Render a `Button` (shadcn, variant ghost) for logout at the bottom that calls `useAuth().logout()`
    - Use only Tailwind utility classes for layout (fixed left, `w-64`, full height, flex column)
    - _Requirements: 11.1, 11.2, 11.6_
  - [x] 15.2 Create `src/react-app/components/AppShell.tsx`
    - Render `<Sidebar />` fixed on the left and `<Outlet />` in a `flex-1` content column
    - Use `flex h-screen` on the root element
    - _Requirements: 11.3, 11.6_

- [x] 16. Login and Register pages
  - [x] 16.1 Create `src/react-app/pages/LoginPage.tsx`
    - shadcn `Card` with email `Input` + `Label` and password `Input` + `Label`
    - Submit calls `useAuth().login(email, password)`
    - On success: `navigate('/feed')`
    - On error: display inline error message below the form using a `<p>` with Tailwind text-red classes
    - Link to `/register`
    - _Requirements: 2.1–2.5_
  - [x] 16.2 Create `src/react-app/pages/RegisterPage.tsx`
    - shadcn `Card` with email and password fields
    - Submit calls `POST /api/auth/register` via `apiPost`; on success store user in AuthContext and `navigate('/feed')`
    - Display 409 (email taken) and 422 (validation) errors inline
    - Link to `/login`
    - _Requirements: 1.1–1.7_

- [x] 17. Feed page
  - Create `src/react-app/pages/FeedPage.tsx`
  - On mount: `GET /api/feed`; store posts in local state
  - If `posts.length === 0`: render the "You have not followed yet" empty state message
  - Otherwise: render a list of `PostCard` components
  - Create `src/react-app/components/PostCard.tsx` — displays `author.displayName`, `author.username`, `body`, and formatted `createdAt` using shadcn `Card`
  - _Requirements: 5.1–5.5_

- [x] 18. Profile page
  - Create `src/react-app/pages/ProfilePage.tsx`
  - Read `:username` param via `useParams()`
  - Fetch `GET /api/profile/:username` and `GET /api/profile/:username/subscriptions` in parallel
  - Render display name, username, tagline, avatar (`Avatar` shadcn), and social links
  - Use shadcn `Tabs` with a "Subscribed" tab listing followed creators (each with avatar, displayName, username)
  - When `currentUser.username === username`, default the active tab to "Subscribed"
  - _Requirements: 7.1–7.6_

- [x] 19. Settings page
  - Create `src/react-app/pages/SettingsPage.tsx`
  - Three independent shadcn `Card` sections, each with its own submit button and inline error/success feedback:
    - **Avatar** — file `Input` (accept `image/jpeg,image/png,image/webp`), preview `<img>` on selection, submit via `PUT /api/settings/avatar` as `multipart/form-data`; display 413/415 errors inline
    - **Change Password** — current password, new password, confirm new password fields; submit via `PUT /api/settings/password`; display 401/422 errors inline
    - **Change Email** — new email, current password fields; submit via `PUT /api/settings/email`; display 409/422/401 errors inline
  - Use shadcn `Sonner` toast for success notifications
  - _Requirements: 8.1–8.7, 9.1–9.5, 10.1–10.5_

- [x] 20. Property-based test for follow uniqueness (Property 8)
  - [x] 20.1 Write property test for follow uniqueness
    - **Property 8: Follow relationship is unique per (subscriber, creator) pair**
    - Seed a test D1 instance (or use an in-memory mock) with a subscriber and creator; insert a follow record; attempt a second insert for the same pair; assert 409 response and exactly one row in the follows table
    - **Validates: Requirements 6.3**
    - Place in `src/worker/routes/feed.test.ts`
    - Tag: `// Feature: auth-and-social-feed, Property 8: Follow relationship is unique per (subscriber, creator) pair`

- [x] 21. Checkpoint — full test suite passes
  - Run `npm test` and confirm all property tests and unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Wrangler types regeneration and final build verification
  - Run `npx wrangler types` to ensure `worker-configuration.d.ts` reflects the final `DB` and `AVATARS` bindings
  - Run `npm run build` (`tsc -b && vite build`) and confirm zero TypeScript errors and a clean Vite build
  - Run `npm run check` (`tsc && vite build && wrangler deploy --dry-run`) to confirm the Worker bundle is valid
  - Fix any remaining type errors before marking complete
  - _Requirements: all_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 11 and 21) ensure incremental validation
- Property tests validate universal correctness properties (Properties 1–8 from the design document)
- Unit tests validate specific examples and edge cases
- All layout uses shadcn/ui components and Tailwind utility classes — no custom CSS
- The `secure: true` cookie flag should be conditional on environment (`c.env.ENVIRONMENT !== 'development'`) to allow local dev over HTTP
