import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { creatorProfileTabs } from '../db/schema'

export const profileTabDefinitions = [
  { key: 'all', label: 'All' },
  { key: 'posts', label: 'Posts' },
  { key: 'photography', label: 'Photography' },
  { key: 'audio', label: 'Audio' },
  { key: 'articles', label: 'Articles' },
  { key: 'courses', label: 'Courses' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'subscribed', label: 'Subscribed to' },
  { key: 'about', label: 'About' },
] as const

export type ProfileTabKey = (typeof profileTabDefinitions)[number]['key']

export type ProfileTabSetting = {
  key: ProfileTabKey
  label: string
  visible: boolean
  order: number
}

const labelByKey = new Map<ProfileTabKey, string>(
  profileTabDefinitions.map((tab) => [tab.key, tab.label]),
)

export function defaultProfileTabs(): ProfileTabSetting[] {
  return profileTabDefinitions.map((tab, index) => ({
    key: tab.key,
    label: tab.label,
    visible: true,
    order: index,
  }))
}

export function normalizeProfileTabs(rows: Array<{ tabKey: string; visible: boolean; displayOrder: number }>) {
  const rowByKey = new Map(rows.map((row) => [row.tabKey, row]))
  const tabs = defaultProfileTabs()
    .map((tab) => {
      const row = rowByKey.get(tab.key)
      return row
        ? { ...tab, visible: row.visible, order: row.displayOrder }
        : tab
    })

  // Older creators have saved tab rows without All. Give those legacy defaults
  // the new first/last layout while preserving any later explicit ordering.
  const sortedTabs = rows.some((row) => row.tabKey === 'all')
    ? tabs.sort((a, b) => a.order - b.order)
    : tabs.sort((a, b) => {
        if (a.key === 'all') return -1
        if (b.key === 'all') return 1
        if (a.key === 'about') return 1
        if (b.key === 'about') return -1
        return a.order - b.order
      })

  return sortedTabs
    .map((tab, index) => ({
      ...tab,
      label: labelByKey.get(tab.key) ?? tab.label,
      order: index,
    }))
}

export async function getCreatorProfileTabs(db: Db, creatorId: string) {
  const rows = await db
    .select({
      tabKey: creatorProfileTabs.tabKey,
      visible: creatorProfileTabs.visible,
      displayOrder: creatorProfileTabs.displayOrder,
    })
    .from(creatorProfileTabs)
    .where(eq(creatorProfileTabs.creatorId, creatorId))
    .orderBy(asc(creatorProfileTabs.displayOrder))
    .all()

  return normalizeProfileTabs(rows)
}
