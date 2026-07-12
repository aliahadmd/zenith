# Plan 004: Maintain Audio R2 Object Lifecycle

> **Executor instructions**: Fix object cleanup without changing the audio upload
> protocol or public responses. Multipart audio upload is deliberately deferred.
>
> **Drift check (run first)**: `git diff --stat 31a4da6..HEAD -- src/worker/routes/audio.ts src/worker/routes/auth.integration.test.ts src/worker/routes/*.test.ts`
> Stop if audio mutations have moved to a shared storage helper that changes the
> locations below.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED - deleting the wrong key can break published media.
- **Depends on**: `plans/001-patch-direct-dependencies.md`
- **Category**: correctness | storage | tests
- **Planned at**: commit `31a4da6`, 2026-07-12

## Why This Matters

Audio cover and source uploads always generate new R2 keys. Replacing an item
or collection updates D1 but leaves prior keys behind. Creation paths upload
before database insertion, leaving unreachable objects when a later DB write
fails. This creates silent storage growth as creators edit content.

## Current State

- `src/worker/routes/audio.ts:244-280` creates a fresh R2 key per upload.
- `audio.ts:542-553` updates a collection cover key but does not delete
  `existing.coverR2Key`.
- `audio.ts:604-631` uploads item audio and cover before inserting `posts` and
  `audioItems`.
- `audio.ts:666-689` replaces item fields but never deletes the prior source or
  cover key.
- `audio.ts:712-716` shows the existing deletion pattern for currently owned
  item keys.
- `src/worker/routes/auth.integration.test.ts` already creates, streams, and
  authorizes audio through the real Worker. Extend it or add a focused Worker
  integration test; do not test only a miniature imitation route.

## Scope

**In scope**
- `src/worker/routes/audio.ts`
- `src/worker/routes/auth.integration.test.ts`, or new
  `src/worker/routes/audio.integration.test.ts`
- A small helper in `src/worker/lib/` only if it eliminates repeated cleanup
  without changing another content type.

**Out of scope**
- Audio size limits, `formData()` buffering, or resumable/multipart uploads.
- Database schema/migrations.
- Article, photography, post, and course storage code.
- Bulk deletion of historical orphaned objects.

## Git Workflow

- Branch: `codex/004-maintain-audio-r2-lifecycle`
- Commit message: `fix: clean up replaced audio storage objects`

## Steps

### Step 1: State the storage invariant next to the implementation

Add a concise, non-obvious code comment or helper contract:

1. D1 points at newly uploaded keys only after its write succeeds.
2. If a dependent D1 write fails, delete every key uploaded for that request.
3. After a successful replacement, delete only a prior key different from the
   newly stored key.
4. Failure to clean up a superseded key must not delete the current row or its
   new object; log structured context without personal data.

**Verify**: the invariant covers collection create/update and item create/update.

### Step 2: Compensate for failed database mutations

Track every newly uploaded key in collection and item creation. Wrap the
dependent database writes in `try/catch`; on failure, use `Promise.allSettled`
to delete only those new keys, then rethrow so the global error handler keeps
its current response shape.

For item creation, treat inserting the backing post and audio item as one
logical operation. Do not leave R2 state behind if either insert fails.

**Verify**: every upload-before-write path has compensation for its exact keys.

### Step 3: Delete only superseded keys after successful updates

After D1 has persisted replacement metadata:

- Delete an old collection cover only after a new cover is stored and keys differ.
- Delete old item audio only after a new audio object is stored and keys differ.
- Delete old item cover only after a new cover is stored and keys differ.

Use the existing deletion convention and `Promise.allSettled`. Do not delete a
collection cover inherited by an item.

**Verify**: new metadata is committed before old-key deletion begins.

### Step 4: Add integration coverage against production routes

Use existing migrations and creator helpers. Cover:

- Create an item with audio/cover, update both, confirm old keys are gone and
  new stream/cover endpoints return 200.
- Create a collection cover, replace it, and confirm only the new cover remains.
- Force a dependent DB write failure through a supported test seam and confirm
  new keys are removed with no persisted reference.
- Delete an item and confirm its current audio and cover are deleted once.

Use the Workers test-pool R2 binding APIs or a narrow injected storage/database
seam. Do not use a hand-written minimal Hono app as the sole regression test.

**Verify**:

```sh
npx vitest --run --config vitest.config.ts src/worker/routes/auth.integration.test.ts
```

Run any new dedicated suite too.

### Step 5: Run repository gates

```sh
npm test
npm run lint
npm run build
npm run check
```

**Verify**: all commands exit 0 without changing public audio response or
authorization behavior.

## Done Criteria

- [ ] Replacing source/cover deletes only the superseded key after D1 changes.
- [ ] Failed creates remove every key uploaded by that request.
- [ ] Existing item and collection deletion remains correct.
- [ ] Integration tests prove replacement, failure cleanup, and current-key deletion.
- [ ] `npm test`, `npm run lint`, `npm run build`, and `npm run check` exit 0.
- [ ] No migration is added.
- [ ] `plans/README.md` marks Plan 004 as DONE.

## STOP Conditions

- Supported test bindings cannot inspect R2 keys.
- A mutation requires a cross-service transaction that cannot be compensated.
- An old key is referenced by another D1 row or content type.
- Cleanup requires broad changes outside audio routes.

## Maintenance Notes

- This prevents future leaks; historical orphan cleanup requires a separate,
  reviewed maintenance operation.
- The deferred multipart-audio plan must reuse these cleanup rules for aborts,
  failed completion, and replacements.
