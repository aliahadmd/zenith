# Plan 005: Batch Creator-Course Profile Loading

> **Executor instructions**: Optimize only the creator-profile course list. Keep
> the single-course detail payload and entitlement model intact unless a shared
> helper can be reused without changing response behavior.
>
> **Drift check (run first)**: `git diff --stat 31a4da6..HEAD -- src/worker/routes/courses.ts src/worker/routes/profile.ts src/react-app/lib/courses.ts src/react-app/components/CourseCard.tsx src/react-app/pages/ProfilePage.tsx`
> Stop if profile courses gained cursor pagination or a dedicated summary endpoint.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED - batching can accidentally expose locked content or omit cards' fields.
- **Depends on**: `plans/001-patch-direct-dependencies.md`
- **Category**: performance | correctness | tests
- **Planned at**: commit `31a4da6`, 2026-07-12

## Why This Matters

The profile Courses tab and All tab call `GET /api/profile/:username/courses`.
The route permits 100 courses. Current code selects IDs, loops sequentially to
load each course, then does per-course entitlement, post-interaction, and
structure work. Creators with many courses can cause hundreds of D1 operations
before a profile renders.

## Current State

- `src/worker/routes/profile.ts:299-314` calls
  `listPublishedCoursesForCreator(db, viewerId, creatorId)`.
- `src/worker/routes/courses.ts:738-748` selects up to 100 IDs then uses a
  sequential `for` loop with `await getCourseById` and `await getCoursePayload`.
- `getCoursePayload` at `courses.ts:252-258` performs a per-course entitlement
  query, post extras, and `getStructure` load.
- `getStructure` at `courses.ts:197-250` already loads one course's module,
  lesson, attachment, and progress rows in parallel.
- `src/worker/lib/post-data.ts:143-277` batches interactions for an array of
  backing post IDs and should be reused once for the whole list.
- `src/react-app/lib/courses.ts`, `CourseCard.tsx`, and `ProfilePage.tsx` define
  and consume the list response. Non-members must still receive no lesson
  markdown or attachment URLs.

## Scope

**In scope**
- `src/worker/routes/courses.ts`
- `src/worker/routes/profile.ts` only if helper wiring changes
- `src/worker/routes/courses.test.ts` and/or a focused profile route test
- `src/react-app/lib/courses.ts` and `CourseCard.tsx` only for a backward-compatible type adjustment

**Out of scope**
- Cursor pagination, infinite scrolling, new profile UX, or changing the 100-course cap.
- Course publishing, progress mutation, attachment access, and backing-post behavior.
- Database migrations unless query-plan evidence proves a missing index; report
  that separately rather than adding an index by assumption.

## Git Workflow

- Branch: `codex/005-batch-course-profile-loading`
- Commit message: `perf: batch creator course profile loading`

## Steps

### Step 1: Characterize the existing profile response

Using the setup in `src/worker/routes/courses.test.ts`, create a creator,
member, non-member, and several published courses with modules and lessons.
Call the profile course endpoint for each viewer. Add regression coverage for:

- public profile listings contain only published courses in `publishedAt DESC` order;
- an active member receives only the content currently allowed by the contract;
- a non-member receives metadata/outline but `markdown: null` and no attachment URLs;
- creator draft visibility stays limited to creator-specific detail flows, not
  public profile lists.

**Verify**: these characterization tests pass before refactoring.

### Step 2: Build a list-oriented payload path

Replace the sequential loop with a helper that:

1. Selects all visible course rows with the creator/user join in one query.
2. Calculates creator access once because all listed courses share creator/viewer.
3. Calls `buildPostExtras` once for all backing post IDs.
4. Loads modules, lessons, ready attachments, and viewer progress with bounded,
   set-based queries keyed by course IDs, then groups them in memory.
5. Applies existing draft and `includeContent` rules while serializing. For every
   non-member lesson, retain the outline but return `markdown: null` and an empty
   attachment array.

Do not rewrite the single-course detail route unless a shared serializer can be
extracted without changing its behavior. Prefer a clearly named list helper
such as `listPublishedCoursePayloadsForCreator`.

**Verify**: static review finds no `await` inside a loop over course rows and no
per-course `hasCreatorAccess` or `buildPostExtras` call remains.

### Step 3: Preserve frontend expectations

Compare the new response with Step 1 fixtures for creator, member, and
non-member. Update types only when necessary; do not make UI authorization
depend on accidentally missing fields. `CourseCard` must continue rendering
the title, description, creator, progress, lock state, interactions, and link.

**Verify**:

```sh
npx tsc -b --pretty false
npx vitest --run --config vitest.config.frontend.ts src/react-app/pages/ProfilePage.test.tsx
```

Expected: no type errors and profile tests pass.

### Step 4: Add a batching regression guard

Add a route/helper test with multiple published courses that confirms the list
is complete and ordered. Where the D1 test environment exposes executed
statements, assert a bounded query count independent of course count. If it
does not, retain a structural test proving the list helper contains no
per-course await loop and document the test-runner limitation in review notes.

**Verify**:

```sh
npx vitest --run --config vitest.config.ts src/worker/routes/courses.test.ts
```

### Step 5: Run full verification

```sh
npm test
npm run lint
npm run build
npm run check
```

**Verify**: all commands exit 0 and no migration appears unless a separately
approved query-plan investigation requires one.

## Done Criteria

- [ ] Profile course listing has no sequential per-course database loop.
- [ ] Entitlement is computed once per creator/viewer list request.
- [ ] Interactions and structure are loaded in set-based batches.
- [ ] Creator/member/non-member privacy is covered by tests.
- [ ] Profile and All-tab frontend tests pass.
- [ ] `npm test`, `npm run lint`, `npm run build`, and `npm run check` exit 0.
- [ ] No migration or breaking API change occurs without explicit approval.
- [ ] `plans/README.md` marks Plan 005 as DONE.

## STOP Conditions

- `CourseCard` requires detail-only data that cannot be batched without changing the response contract.
- A batched query exposes drafts, markdown, or attachment URLs to unauthorized viewers.
- Query-plan evidence proves an additional index is required; stop and propose a separate migration plan.
- The test runtime cannot create multiple isolated courses reliably.

## Maintenance Notes

- Revisit this serializer when cursor pagination is added; avoid loading full
  course structures merely to display summary cards.
- Keep single-course detail authorization centralized so list optimization does
  not create a second, divergent entitlement implementation.
