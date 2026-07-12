import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { posts, users } from '../db/schema'

export async function getPostModerationState(db: Db, postId: string) {
  return db.select({
    moderationStatus: posts.moderationStatus,
    moderationReason: posts.moderationReason,
    authorAccountStatus: users.accountStatus,
  }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(eq(posts.id, postId)).get()
}

export async function isPostMemberVisible(db: Db, postId: string) {
  const state = await getPostModerationState(db, postId)
  return state?.moderationStatus === 'active' && state.authorAccountStatus === 'active'
}
