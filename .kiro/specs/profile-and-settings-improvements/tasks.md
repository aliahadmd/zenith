# Implementation Plan: profile-and-settings-improvements

## Overview

Incremental improvements to the existing `auth-and-social-feed` app. Backend tasks (1–8) extend validators, add two new settings endpoints, fix email idempotency, and rename the follow endpoint. Frontend tasks (9–16) add theme support, new settings cards, and update copy throughout. Task 17 verifies the full build. All changes modify existing files or create new ones — no schema migrations or new Wrangler bindings required.

## Tasks

- [x] 1. Extend `src/worker/lib/validators.ts` with three new exports
  - [x] 1.1 Add `isValidUsername(username: string): boolean`
    - Implement using regex `/^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$|^[a-z0-9]{3}$/`
    - Export the function alongside the existing `isValidEmail` and `isValidPassword`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Add `isValidUrl(url: string): boolean`
    - Use `URL` constructor in a try/catch block
    - Return `true` only when parsing succeeds and `parsed.protocol` is `'http:'` or `'https:'`
    - Return `false` in the catch block
    - _Requirements: 3.4_
  - [x] 1.3 Add `generateUsername(emailLocalPart: string): string`
    - Step 1: lowercase the input
    - Step 2: replace chars outside `[a-z0-9]` with hyphens
    - Step 3: strip leading and trailing hyphens with `.replace(/^-+|-+$/g, '')`
    - Step 4: if the result is empty, set base to `'u'`
    - Step 5: truncate base to 5 characters with `.slice(0, 5)`
    - Step 6: strip trailing hyphens from the truncated base
    - Step 7: append `'-'` + 4-char alphanumeric suffix via `Math.random().toString(36).slice(2, 6).padEnd(4, '0')`
    - Export the function
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 2. Add property tests for new validators to `src/worker/lib/validators.test.ts`
  - Import `isValidUsername`, `isValidUrl`, `generateUsername` from `'./validators'`
  - [x] 2.1 Write property test for Property 9 — `isValidUsername` accepts all valid usernames
    - `// Feature: profile-and-settings-improvements, Property 9`
    - Two `fc.assert` calls: one with `fc.stringMatching(/^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$/)` and one with `fc.stringMatching(/^[a-z0-9]{3}$/)` — both must return `true`
    - `{ numRuns: 100 }` on each assertion
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Write property test for Property 10 — `isValidUsername` rejects all invalid usernames
    - `// Feature: profile-and-settings-improvements, Property 10`
    - Three `fc.assert` calls covering: strings containing `[A-Z]`, strings with `length < 3` or `length > 10`, and strings matching `^[-_]` or `[-_]$`
    - `{ numRuns: 100 }` on each assertion — all must return `false`
    - _Requirements: 1.3, 1.4_
  - [x] 2.3 Write property test for Property 11 — `generateUsername` always produces valid usernames
    - `// Feature: profile-and-settings-improvements, Property 11`
    - Arbitrary: `fc.emailAddress().map(e => e.split('@')[0])`
    - Assert: `isValidUsername(generateUsername(localPart))` returns `true`
    - `{ numRuns: 100 }`
    - _Requirements: 1.8, 1.9_
  - [x] 2.4 Write property test for Property 12 — `isValidUrl` accepts valid http/https URLs and rejects non-URLs
    - `// Feature: profile-and-settings-improvements, Property 12`
    - Two `fc.assert` calls: one with `fc.webUrl({ validSchemes: ['http', 'https'] })` → `true`; one with `fc.string().filter(s => { try { new URL(s); return false } catch { return true } })` → `false`
    - `{ numRuns: 100 }` on each assertion
    - _Requirements: 3.4_

- [x] 3. Remove local `generateUsername` from `src/worker/routes/auth.ts` and import from validators
  - Delete the `generateUsername` function definition at the top of `auth.ts`
  - Add `generateUsername` to the import from `'../lib/validators'`
  - Verify the registration handler still calls `generateUsername(localPart)` identically
  - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 4. Add `PUT /api/settings/username` to `src/worker/routes/settings.ts`
  - Add `isValidUsername` to the import from `'../lib/validators'`
  - Add `and`, `not` to the import from `'drizzle-orm'`
  - Handler steps:
    - Parse JSON body; return 422 `{ error: 'Invalid JSON body' }` on parse failure
    - If `newUsername` is missing or not a string, return 422 with descriptive message
    - If `!isValidUsername(newUsername)`, return 422 with format-rules message
    - Fetch `{ username }` for `userId` from DB; return 404 if not found
    - If `newUsername === currentUser.username`, return 200 `{ message: 'Username unchanged' }`
    - Query `SELECT id WHERE username = newUsername AND id != userId`; return 409 `{ error: 'Username is already taken' }` if found
    - `UPDATE users SET username = newUsername WHERE id = userId`
    - Return 200 `{ username: newUsername }`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 5. Add `PUT /api/settings/profile` to `src/worker/routes/settings.ts`
  - Add `isValidUrl` to the import from `'../lib/validators'`
  - Handler steps:
    - Parse JSON body; return 422 on parse failure
    - If `displayName` is absent, not a string, or `.trim() === ''`, return 422 with descriptive message
    - If `socialLinks` is provided, iterate its entries; for any non-empty URL that fails `isValidUrl`, return 422 `{ error: 'Invalid URL for ${field}' }`
    - `UPDATE users SET display_name = displayName.trim(), tagline = tagline ?? null, social_links = socialLinks ? JSON.stringify(socialLinks) : null WHERE id = userId`
    - Return 200 `{ displayName: displayName.trim(), tagline, socialLinks }`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Fix email change idempotency in `src/worker/routes/settings.ts`
  - In `PUT /api/settings/email`, replace the two separate DB queries (duplicate-email check + password fetch) with a single query that fetches `{ email, passwordHash }` for `userId`
  - After the single fetch, if `newEmail === currentUser.email`: verify password → 401 if wrong, 200 `{ message: 'Email unchanged' }` if correct
  - Only run the uniqueness check (`SELECT id WHERE email = newEmail`) when `newEmail !== currentUser.email`
  - Remove the now-redundant separate `SELECT passwordHash` query
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Replace `POST /api/feed/follow` with `POST /api/feed/subscribe` in `src/worker/routes/feed.ts`
  - Remove the `feedRoutes.post('/follow', ...)` handler entirely
  - Add `feedRoutes.post('/subscribe', ...)` with the same validation and creator-lookup logic, but:
    - Use `subscriberId` (= `c.var.user.id`) and `creatorId` as local variable names
    - Pass `{ followerId: subscriberId, followeeId: creatorId }` to `db.insert(follows).values(...)`
    - 409 message: `'Already subscribed to this creator'`
    - Return 201 `{ subscriberId, creatorId }`
  - In `GET /`, change the empty-feed message from `'You have not followed yet'` to `"You haven't subscribed to any creators yet"`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Checkpoint — verify backend changes compile and all tests pass
  - Run `npm test` and confirm all property tests pass (Properties 1–12, with 9–12 being new)
  - Run `npx tsc -p tsconfig.worker.json --noEmit` and fix any type errors
  - _Requirements: all backend_

- [x] 9. Add `refreshCurrentUser` to `src/react-app/context/AuthContext.tsx`
  - Add `refreshCurrentUser(): Promise<void>` to the `AuthContextValue` type
  - Implement the function: call `apiGet<User>('/api/auth/me')` and call `setCurrentUser(data)` on success
  - Include `refreshCurrentUser` in the `AuthContext.Provider` value object
  - Verify `useAuth()` returns the new function
  - _Requirements: 2.10_

- [x] 10. Wrap app with `ThemeProvider` in `src/react-app/main.tsx`
  - Import `ThemeProvider` from `'next-themes'`
  - Wrap `<BrowserRouter><App /></BrowserRouter>` with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`
  - Keep `<StrictMode>` as the outermost wrapper
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8_

- [x] 11. Create `src/react-app/components/ThemeSwitcher.tsx`
  - Import `useTheme` from `'next-themes'`
  - Import `Sun`, `Moon`, `Monitor` from `'lucide-react'`
  - Import `Button` from `'./ui/button'`
  - Render a `<div className="flex gap-1">` containing three `<Button size="icon">` elements
  - Active theme button uses `variant="secondary"`; inactive buttons use `variant="ghost"`
  - `aria-label` values: `"Light theme"`, `"Dark theme"`, `"System theme"`
  - Each button calls `setTheme('light' | 'dark' | 'system')` on click
  - _Requirements: 6.5, 6.6, 6.7_

- [x] 12. Update `src/react-app/components/Sidebar.tsx`
  - Change the Profile `NavLink` `to` prop from `` `/profile/${currentUser?.username}` `` to `` `/u/${currentUser?.username}` ``
  - Import `ThemeSwitcher` from `'./ThemeSwitcher'`
  - Render `<ThemeSwitcher />` between the closing `</nav>` tag and the logout `<Separator>`
  - _Requirements: 4.3, 6.5_

- [x] 13. Update profile route in `src/react-app/App.tsx`
  - Change `<Route path="/profile/:username" element={<ProfilePage />} />` to `<Route path="/u/:username" element={<ProfilePage />} />`
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 14. Add Public Profile and Username cards to `src/react-app/pages/SettingsPage.tsx`
  - [x] 14.1 Add Public Profile card at the top of the page (before the existing avatar card)
    - Import `useAuth` from `'../context/AuthContext'`
    - Parse `currentUser?.socialLinks` JSON string to extract initial `twitter`, `github`, `website` values (default to `''` if absent or unparseable)
    - Controlled state: `displayName` (init: `currentUser?.displayName ?? ''`), `tagline` (init: `currentUser?.tagline ?? ''`), `twitter`, `github`, `website`
    - On submit: call `apiPut('/api/settings/profile', { displayName, tagline: tagline || undefined, socialLinks: { twitter: twitter || undefined, github: github || undefined, website: website || undefined } })`
    - On 422 response: display `error` inline below the form
    - On 200 response: call `toast.success('Profile updated successfully.')`
    - _Requirements: 3.6, 3.7, 3.8, 3.9_
  - [x] 14.2 Add Username card after the Public Profile card (before the avatar card)
    - Controlled state: `username` (init: `currentUser?.username ?? ''`), `usernameError`
    - Render hint text below the input: `"3–10 characters, lowercase letters, numbers, _ and - only"`
    - On submit: call `apiPut('/api/settings/username', { newUsername: username })`
    - On 422 or 409 response: display `error` inline below the input
    - On 200 response: call `toast.success('Username updated successfully.')` then `await refreshCurrentUser()`
    - Destructure `refreshCurrentUser` from `useAuth()`
    - _Requirements: 2.8, 2.9, 2.10_

- [x] 15. Update empty-state copy in `src/react-app/pages/FeedPage.tsx`
  - Change primary empty-state text from `'You have not followed yet'` to `"You haven't subscribed to any creators yet"` (use `message` from API response if present, fall back to this string)
  - Change secondary empty-state text from `'Follow some creators to see their posts here.'` to `"Subscribe to creators to see their posts here."`
  - _Requirements: 5.7, 5.8, 5.12_

- [x] 16. Update subscription copy and links in `src/react-app/pages/ProfilePage.tsx`
  - Change `<TabsTrigger value="subscribed">` label from `"Subscribed"` to `"Subscribed to"`
  - Change subscriptions-tab empty-state text from `"Not following any creators yet."` to `"Not subscribed to any creators yet."`
  - Import `Link` from `'react-router'`
  - Wrap each subscription list item in `<Link to={`/u/${sub.username}`} key={sub.username} className="flex items-center gap-3">` replacing the existing plain `<div>`
  - _Requirements: 5.9, 5.10, 5.12, 4.4_

- [x] 17. Final build verification
  - Run `npm test` — confirm all tests pass including Properties 9–12
  - Run `npx tsc -b --noEmit` — confirm zero TypeScript errors across all tsconfigs
  - Run `npm run build` — confirm a clean Vite build with no errors
  - Fix any remaining type or build errors before marking complete
  - _Requirements: all_

## Notes

- Tasks 1–8 are backend-only; Tasks 9–16 are frontend-only; Task 17 is full-stack verification
- Tasks 4 and 5 both modify `settings.ts` — implement sequentially in the same file editing session
- Task 6 also modifies `settings.ts` — do it after Tasks 4 and 5 to avoid conflicts
- Task 9 (`AuthContext`) must be complete before Task 14.2 (Username card calls `refreshCurrentUser`)
- Task 10 (`ThemeProvider`) must be complete before Task 11 (`ThemeSwitcher` uses `useTheme`)
- Task 11 (`ThemeSwitcher`) must be complete before Task 12 (`Sidebar` imports it)
- Task 13 (route rename) is independent and can be done at any point during the frontend tasks
- Sub-tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests (2.1–2.4) validate the pure functions in `validators.ts` using fast-check (already in devDependencies)
