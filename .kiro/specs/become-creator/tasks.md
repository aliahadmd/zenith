# Implementation Plan: Become Creator

## Overview

Implement the Become Creator feature across three layers: (1) a D1 schema migration and backend routes for creator application and short-post publishing, (2) a React frontend with the application form, Studio page, and short-post composer, and (3) sidebar and routing updates to wire everything together.

## Tasks

- [x] 1. Add `creator_applications` table to the D1 schema and generate a migration
  - Add `creatorApplications` table definition to `src/worker/db/schema.ts` with all required columns: `id`, `userId` (unique FK → users), `fullName`, `address`, `city`, `country`, `nidNumber`, `nidDocumentR2Key`, `socialLinks`, `contentLinks`, `status` (enum: pending/approved/rejected, default approved), `createdAt`
  - Export `CreatorApplication` and `NewCreatorApplication` inferred types
  - Run `npx wrangler d1 migrations create social-feed-db add-creator-applications` and write the `CREATE TABLE` SQL into the generated migration file
  - _Requirements: 3.1, 3.2_

- [x] 2. Implement the `POST /api/creator/apply` backend route
  - [x] 2.1 Create `src/worker/routes/creator.ts` with the apply handler
    - Parse `multipart/form-data` using Hono's `c.req.formData()`
    - Validate all required fields are present; return 422 with `"Missing required field: {fieldName}"` for the first missing field
    - Validate `socialLinks` and `contentLinks` are JSON arrays of `https://` URLs; return 422 on invalid URL
    - Check file MIME type (JPEG/PNG/WebP); return 415 if wrong
    - Check file size ≤ 10 MB; return 413 if exceeded
    - Check for existing application via `userId` unique constraint; return 409 `"Application already submitted"`
    - Check if user is already a creator; return 409 `"User is already a creator"`
    - Upload NID document to R2 under key `nid-documents/{userId}/{filename}` using `c.env.AVATARS`
    - Atomically insert into `creator_applications` and update `users.role = 'creator'` using `db.batch()`
    - Return 201 `{ "role": "creator" }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 2.2 Write property test for R2 key construction (Property 3)
    - **Property 3: R2 key follows the `nid-documents/{userId}/{filename}` pattern**
    - **Validates: Requirements 3.3**
    - File: `src/worker/routes/creator.test.ts`

  - [x] 2.3 Write property test for duplicate application rejection (Property 4)
    - **Property 4: Duplicate application is always rejected**
    - **Validates: Requirements 3.4**
    - File: `src/worker/routes/creator.test.ts`

  - [x] 2.4 Write property test for missing required fields returning 422 (Property 5)
    - **Property 5: Missing required fields always return 422**
    - **Validates: Requirements 3.6**
    - File: `src/worker/routes/creator.test.ts`

  - [x] 2.5 Write unit tests for the apply handler
    - Test 409 on duplicate application
    - Test 409 for existing creator
    - Test 413 for oversized NID document
    - Test 415 for wrong file type
    - Test 422 for each missing required field
    - Test 201 happy path with correct response body
    - File: `src/worker/routes/creator.test.ts`
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Implement the `POST /api/posts` backend route
  - [x] 3.1 Create `src/worker/routes/posts.ts` with the post creation handler
    - Apply `authMiddleware` and `requireRole('creator')`; return 403 for subscribers
    - Parse JSON body; validate `body` is a non-empty string of 1–500 characters; return 422 with `"Post body must be between 1 and 500 characters"` otherwise
    - Insert into `posts` table with `crypto.randomUUID()` as `id` and `c.var.user.id` as `authorId`
    - Return 201 `{ "id", "body", "createdAt" }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 3.2 Write property test for post creation round-trip (Property 8)
    - **Property 8: Post creation round-trip preserves body**
    - **Validates: Requirements 8.4**
    - File: `src/worker/routes/posts.test.ts`

  - [x] 3.3 Write property test for invalid post bodies rejected by API (Property 9)
    - **Property 9: Invalid post bodies are always rejected by the API**
    - **Validates: Requirements 8.3**
    - File: `src/worker/routes/posts.test.ts`

  - [x] 3.4 Write unit tests for the posts handler
    - Test 403 for subscriber role
    - Test 422 for empty body
    - Test 422 for body > 500 characters
    - Test 201 happy path with correct response shape
    - File: `src/worker/routes/posts.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4. Mount new routes in the Hono app entry point
  - Import `creatorRoutes` from `./routes/creator` and mount at `/api/creator`
  - Import `postsRoutes` from `./routes/posts` and mount at `/api/posts`
  - File: `src/worker/index.ts`
  - _Requirements: 3.1, 8.1_

- [x] 5. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add `isValidHttpsUrl` validator and property test
  - [x] 6.1 Add `isValidHttpsUrl` function to `src/worker/lib/validators.ts`
    - Accept a string; return `true` if and only if it is a well-formed absolute URL with scheme `https:`
    - _Requirements: 2.5_

  - [x] 6.2 Write property test for URL validation (Property 1)
    - **Property 1: URL validation accepts only `https://` URLs**
    - **Validates: Requirements 2.5**
    - Add to `src/worker/lib/validators.test.ts` under a `become-creator` describe block

- [x] 7. Implement the `CreatorRoute` guard component
  - Create `src/react-app/components/CreatorRoute.tsx`
  - If `isLoading`: render a centered spinner (matching `ProtectedRoute` pattern)
  - If no `currentUser`: redirect to `/login`
  - If `currentUser.role !== 'creator'`: redirect to `/become-creator`
  - Otherwise: render `<Outlet />`
  - _Requirements: 5.2, 5.3_

  - [x] 7.1 Write unit tests for `CreatorRoute`
    - Test redirect to `/become-creator` for subscriber
    - Test redirect to `/login` for unauthenticated user
    - Test renders outlet for creator
    - File: `src/react-app/components/CreatorRoute.test.tsx`
    - _Requirements: 5.2, 5.3_

- [x] 8. Register new routes in `App.tsx`
  - Add `<Route path="/become-creator" element={<BecomeCreatorPage />} />` inside `ProtectedRoute > AppShell`
  - Add `<Route element={<CreatorRoute />}>` wrapping `<Route path="/studio" element={<StudioPage />} />` inside `ProtectedRoute > AppShell`
  - Import `BecomeCreatorPage`, `StudioPage`, and `CreatorRoute`
  - File: `src/react-app/App.tsx`
  - _Requirements: 5.1, 5.4_

- [x] 9. Update `Sidebar` with conditional navigation links
  - When `currentUser.role === 'subscriber'`: render `<NavLink to="/become-creator">Become Creator</NavLink>` using the existing `navLinkClass` helper
  - When `currentUser.role === 'creator'`: render `<NavLink to="/studio">Studio</NavLink>` using the existing `navLinkClass` helper
  - File: `src/react-app/components/Sidebar.tsx`
  - _Requirements: 1.1, 1.2, 1.3_

  - [x] 9.1 Write unit tests for `Sidebar`
    - Test "Become Creator" link renders for subscriber
    - Test "Studio" link renders for creator
    - Test active-link class is applied correctly
    - File: `src/react-app/components/Sidebar.test.tsx`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 10. Implement `BecomeCreatorPage`
  - [x] 10.1 Create `src/react-app/pages/BecomeCreatorPage.tsx`
    - Use `react-hook-form` + `zod` with `creatorApplicationSchema` (as defined in design)
    - Render all required fields: full legal name, street address, city, country, NID number, NID document file input, at least one social profile URL, at least one content sample URL
    - Support dynamic addition of extra social/content URL fields (useFieldArray)
    - Validate each URL field starts with `https://`
    - Validate NID document: JPEG/PNG/WebP only, ≤ 10 MB; display field-level error if invalid
    - On submit: disable button and show loading spinner; submit as `FormData` via `apiPost`
    - On 409 response (either on load check or submit): replace form with read-only "Application under review" status message
    - On success: call `refreshCurrentUser()`, navigate to `/studio`, show congratulations toast including user's display name
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.1, 4.2, 4.3_

  - [x] 10.2 Write unit tests for `BecomeCreatorPage`
    - Test all required fields are rendered for subscriber
    - Test read-only status message when application already exists (mock 409)
    - Test field-level validation errors on empty submit
    - Test successful submit triggers `refreshCurrentUser` and navigation to `/studio`
    - File: `src/react-app/pages/BecomeCreatorPage.test.tsx`
    - _Requirements: 2.1, 2.3, 2.4, 2.8, 4.1, 4.2_

- [x] 11. Implement `ContentTypeCard` component
  - Create `src/react-app/components/ContentTypeCard.tsx`
  - Accept props: `icon: React.ReactNode`, `title: string`, `description: string`, `disabled?: boolean`, `comingSoon?: boolean`, `onClick?: () => void`
  - When `disabled` is true: apply reduced opacity and `cursor-not-allowed`; suppress `onClick`
  - When `comingSoon` is true: render a "Coming Soon" label overlay or badge
  - _Requirements: 6.2, 6.4_

- [x] 12. Implement `ShortPostComposer` component
  - [x] 12.1 Create `src/react-app/components/ShortPostComposer.tsx`
    - Render as a modal overlay (shadcn `Dialog` or equivalent) on top of the Studio page
    - Textarea with `maxLength={500}`
    - Live character count: display `{remaining} / 500` where `remaining = 500 - body.length`
    - Disable publish button when body is empty or length > 500; display validation message
    - On publish: call `POST /api/posts` with `{ body }`; on success close modal and show success toast
    - On dismiss (close button or backdrop): close modal without sending any request
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 12.2 Write property test for character count accuracy (Property 6)
    - **Property 6: Character count display is always accurate**
    - **Validates: Requirements 7.3**
    - File: `src/react-app/components/ShortPostComposer.test.tsx`

  - [x] 12.3 Write property test for invalid post bodies disabled in composer (Property 7)
    - **Property 7: Invalid post bodies are always rejected by the composer**
    - **Validates: Requirements 7.5**
    - File: `src/react-app/components/ShortPostComposer.test.tsx`

  - [x] 12.4 Write unit tests for `ShortPostComposer`
    - Test textarea has maxLength 500
    - Test publish button disabled on empty body
    - Test publish button disabled when body > 500 chars
    - Test successful publish closes modal and shows toast
    - Test dismiss without publish sends no request
    - File: `src/react-app/components/ShortPostComposer.test.tsx`
    - _Requirements: 7.2, 7.5, 7.6, 7.7_

- [x] 13. Implement `StudioPage`
  - Create `src/react-app/pages/StudioPage.tsx`
  - Render three `ContentTypeCard` components: "Short Post" (enabled), "Long Post" (disabled, comingSoon), "Course" (disabled, comingSoon)
  - Each card has a distinct icon, title, and short description
  - Clicking "Short Post" card opens `ShortPostComposer` modal (manage open state locally)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 13.1 Write unit tests for `StudioPage`
    - Test all three content-type cards are rendered
    - Test "Long Post" and "Course" cards are in disabled/coming-soon state
    - Test clicking "Short Post" card opens the composer
    - File: `src/react-app/pages/StudioPage.test.tsx`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Wire feed to include creator posts for followers
  - Verify the existing feed query in `src/worker/routes/feed.ts` already joins `posts` from followed creators; if not, update the query to include posts from users the current user follows in reverse-chronological order
  - _Requirements: 8.5_

  - [x] 15.1 Write property test for reverse-chronological feed order (Property 10)
    - **Property 10: New posts appear in follower feeds in reverse-chronological order**
    - **Validates: Requirements 8.5**
    - File: `src/worker/routes/posts.test.ts`

- [x] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `{ numRuns: 100 }` and are tagged with `// Feature: become-creator, Property {N}: {text}`
- The existing `AVATARS` R2 binding is reused for NID documents under the `nid-documents/` key prefix
- D1 batch writes (`db.batch()`) ensure atomicity for the insert + role-update in the apply handler
- The `isValidHttpsUrl` validator (task 6) is shared between frontend Zod schema and backend validation
