import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  pollOptions,
  pollVotes,
  postAttachments,
  postLikes,
  postPolls,
  postReplies,
  replyAttachments,
  replyLikes,
  subscriptionMemberships,
} from '../db/schema'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave', 'audio/ogg', 'audio/webm'] as const
export const PHOTOGRAPHY_PREVIEW_TYPES = IMAGE_TYPES
export const PHOTOGRAPHY_ORIGINAL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/x-tiff',
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-adobe-dng',
  'image/x-sony-arw',
  'image/x-fuji-raf',
  'image/x-olympus-orf',
  'image/x-panasonic-rw2',
  'application/octet-stream',
] as const
export const PHOTOGRAPHY_ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2'] as const
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024
export const MAX_IMAGES = 4
export const MAX_AUDIO_SIZE = 90 * 1024 * 1024
export const MAX_PHOTOGRAPHY_PREVIEW_SIZE = 10 * 1024 * 1024
export const MAX_PHOTOGRAPHY_ORIGINAL_SIZE = 90 * 1024 * 1024

export type AttachmentSummary = {
  id: string
  url: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export type PollSummary = {
  id: string
  question: string
  closesAt: number | null
  viewerOptionId: string | null
  totalVotes: number
  options: Array<{
    id: string
    text: string
    position: number
    voteCount: number
  }>
}

export type PostExtras = {
  attachmentsByPostId: Map<string, AttachmentSummary[]>
  postLikeCounts: Map<string, number>
  postReplyCounts: Map<string, number>
  viewerLikedPostIds: Set<string>
  pollsByPostId: Map<string, PollSummary>
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

export function toUnixSeconds(value: Date | number | null) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  return value
}

export async function hasCreatorAccess(db: Db, viewerId: string, creatorId: string) {
  if (viewerId === creatorId) return true

  const membership = await db
    .select({ id: subscriptionMemberships.id })
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.subscriberId, viewerId),
      eq(subscriptionMemberships.creatorId, creatorId),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, nowSeconds())),
      ),
    ))
    .get()

  return Boolean(membership)
}

export function mediaUrl(attachmentId: string) {
  return `/api/media/${attachmentId}`
}

export function articleCoverUrl(postId: string) {
  return `/api/articles/${postId}/cover`
}

export function audioCollectionCoverUrl(collectionId: string) {
  return `/api/audio/collections/${collectionId}/cover`
}

export function audioItemCoverUrl(itemId: string) {
  return `/api/audio/items/${itemId}/cover`
}

export function audioStreamUrl(itemId: string) {
  return `/api/audio/items/${itemId}/stream`
}

export function photographyPhotoPreviewUrl(photoId: string) {
  return `/api/photography/photos/${photoId}/preview`
}

export function photographyPhotoOriginalUrl(photoId: string) {
  return `/api/photography/photos/${photoId}/original`
}

export function imageExtension(contentType: string) {
  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/webp') return '.webp'
  return ''
}

export function audioExtension(contentType: string) {
  if (contentType === 'audio/mpeg') return '.mp3'
  if (contentType === 'audio/mp4' || contentType === 'audio/x-m4a') return '.m4a'
  if (contentType === 'audio/wav' || contentType === 'audio/wave') return '.wav'
  if (contentType === 'audio/ogg') return '.ogg'
  if (contentType === 'audio/webm') return '.webm'
  return ''
}

export async function buildPostExtras(db: Db, viewerId: string, postIds: string[]): Promise<PostExtras> {
  const attachmentsByPostId = new Map<string, AttachmentSummary[]>()
  const postLikeCounts = new Map<string, number>()
  const postReplyCounts = new Map<string, number>()
  const viewerLikedPostIds = new Set<string>()
  const pollsByPostId = new Map<string, PollSummary>()

  if (postIds.length === 0) {
    return { attachmentsByPostId, postLikeCounts, postReplyCounts, viewerLikedPostIds, pollsByPostId }
  }

  const [attachments, likeCounts, replyCounts, viewerLikes, polls] = await Promise.all([
    db
      .select({
        id: postAttachments.id,
        postId: postAttachments.postId,
        fileName: postAttachments.fileName,
        contentType: postAttachments.contentType,
        sizeBytes: postAttachments.sizeBytes,
      })
      .from(postAttachments)
      .where(inArray(postAttachments.postId, postIds))
      .orderBy(postAttachments.displayOrder)
      .all(),
    db
      .select({ postId: postLikes.postId, count: sql<number>`count(*)` })
      .from(postLikes)
      .where(inArray(postLikes.postId, postIds))
      .groupBy(postLikes.postId)
      .all(),
    db
      .select({ postId: postReplies.postId, count: sql<number>`count(*)` })
      .from(postReplies)
      .where(inArray(postReplies.postId, postIds))
      .groupBy(postReplies.postId)
      .all(),
    db
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(and(inArray(postLikes.postId, postIds), eq(postLikes.userId, viewerId)))
      .all(),
    db
      .select({
        id: postPolls.id,
        postId: postPolls.postId,
        question: postPolls.question,
        closesAt: postPolls.closesAt,
      })
      .from(postPolls)
      .where(inArray(postPolls.postId, postIds))
      .all(),
  ])

  for (const attachment of attachments) {
    const existing = attachmentsByPostId.get(attachment.postId) ?? []
    existing.push({
      id: attachment.id,
      url: mediaUrl(attachment.id),
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    })
    attachmentsByPostId.set(attachment.postId, existing)
  }

  for (const row of likeCounts) postLikeCounts.set(row.postId, Number(row.count))
  for (const row of replyCounts) postReplyCounts.set(row.postId, Number(row.count))
  for (const row of viewerLikes) viewerLikedPostIds.add(row.postId)

  const pollIds = polls.map((poll) => poll.id)
  if (pollIds.length > 0) {
    const [options, voteCounts, viewerVotes] = await Promise.all([
      db
        .select({
          id: pollOptions.id,
          pollId: pollOptions.pollId,
          text: pollOptions.text,
          position: pollOptions.position,
        })
        .from(pollOptions)
        .where(inArray(pollOptions.pollId, pollIds))
        .orderBy(pollOptions.position)
        .all(),
      db
        .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId, count: sql<number>`count(*)` })
        .from(pollVotes)
        .where(inArray(pollVotes.pollId, pollIds))
        .groupBy(pollVotes.pollId, pollVotes.optionId)
        .all(),
      db
        .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId })
        .from(pollVotes)
        .where(and(inArray(pollVotes.pollId, pollIds), eq(pollVotes.userId, viewerId)))
        .all(),
    ])

    const optionsByPollId = new Map<string, typeof options>()
    const voteCountByOptionId = new Map<string, number>()
    const totalVotesByPollId = new Map<string, number>()
    const viewerVoteByPollId = new Map<string, string>()

    for (const option of options) {
      const existing = optionsByPollId.get(option.pollId) ?? []
      existing.push(option)
      optionsByPollId.set(option.pollId, existing)
    }

    for (const voteCount of voteCounts) {
      const count = Number(voteCount.count)
      voteCountByOptionId.set(voteCount.optionId, count)
      totalVotesByPollId.set(voteCount.pollId, (totalVotesByPollId.get(voteCount.pollId) ?? 0) + count)
    }

    for (const viewerVote of viewerVotes) {
      viewerVoteByPollId.set(viewerVote.pollId, viewerVote.optionId)
    }

    for (const poll of polls) {
      pollsByPostId.set(poll.postId, {
        id: poll.id,
        question: poll.question,
        closesAt: poll.closesAt,
        viewerOptionId: viewerVoteByPollId.get(poll.id) ?? null,
        totalVotes: totalVotesByPollId.get(poll.id) ?? 0,
        options: (optionsByPollId.get(poll.id) ?? []).map((option) => ({
          id: option.id,
          text: option.text,
          position: option.position,
          voteCount: voteCountByOptionId.get(option.id) ?? 0,
        })),
      })
    }
  }

  return { attachmentsByPostId, postLikeCounts, postReplyCounts, viewerLikedPostIds, pollsByPostId }
}

export async function buildReplyAttachments(db: Db, replyIds: string[]) {
  const byReplyId = new Map<string, AttachmentSummary[]>()
  if (replyIds.length === 0) return byReplyId

  const attachments = await db
    .select({
      id: replyAttachments.id,
      replyId: replyAttachments.replyId,
      fileName: replyAttachments.fileName,
      contentType: replyAttachments.contentType,
      sizeBytes: replyAttachments.sizeBytes,
    })
    .from(replyAttachments)
    .where(inArray(replyAttachments.replyId, replyIds))
    .orderBy(replyAttachments.displayOrder)
    .all()

  for (const attachment of attachments) {
    const existing = byReplyId.get(attachment.replyId) ?? []
    existing.push({
      id: attachment.id,
      url: mediaUrl(attachment.id),
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    })
    byReplyId.set(attachment.replyId, existing)
  }

  return byReplyId
}

export async function buildReplyLikeState(db: Db, viewerId: string, replyIds: string[]) {
  const counts = new Map<string, number>()
  const viewerLikedIds = new Set<string>()
  if (replyIds.length === 0) return { counts, viewerLikedIds }

  const [likeCounts, viewerLikes] = await Promise.all([
    db
      .select({ replyId: replyLikes.replyId, count: sql<number>`count(*)` })
      .from(replyLikes)
      .where(inArray(replyLikes.replyId, replyIds))
      .groupBy(replyLikes.replyId)
      .all(),
    db
      .select({ replyId: replyLikes.replyId })
      .from(replyLikes)
      .where(and(inArray(replyLikes.replyId, replyIds), eq(replyLikes.userId, viewerId)))
      .all(),
  ])

  for (const row of likeCounts) counts.set(row.replyId, Number(row.count))
  for (const row of viewerLikes) viewerLikedIds.add(row.replyId)

  return { counts, viewerLikedIds }
}
