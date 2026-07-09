import { queryOptions } from '@tanstack/react-query'
import { apiGetRequired, apiPutRequired } from './api'

export const profileTabDefinitions = [
  { key: 'all', label: 'All', description: 'All published creator content' },
  { key: 'posts', label: 'Posts', description: 'Short updates and media posts' },
  { key: 'photography', label: 'Photography', description: 'Member photography albums' },
  { key: 'audio', label: 'Audio', description: 'Albums, tracks, podcasts, and episodes' },
  { key: 'articles', label: 'Articles', description: 'Long-form creator articles' },
  { key: 'courses', label: 'Courses', description: 'Structured subscriber courses' },
  { key: 'subscribers', label: 'Subscribers', description: 'People subscribed to this creator' },
  { key: 'subscribed', label: 'Subscribed to', description: 'Creators this profile follows' },
  { key: 'about', label: 'About', description: 'Bio and social links' },
] as const

export type ProfileTabKey = (typeof profileTabDefinitions)[number]['key']

export type ProfileTabSetting = {
  key: ProfileTabKey
  label: string
  visible: boolean
  order: number
}

export type ProfileTabsResponse = {
  tabs: ProfileTabSetting[]
}

export const profileTabsKeys = {
  settings: ['settings', 'profile-tabs'] as const,
}

export function defaultProfileTabs(): ProfileTabSetting[] {
  return profileTabDefinitions.map((tab, index) => ({
    key: tab.key,
    label: tab.label,
    visible: true,
    order: index,
  }))
}

export function profileTabsQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: profileTabsKeys.settings,
    queryFn: () => apiGetRequired<ProfileTabsResponse>('/api/settings/profile-tabs'),
    enabled,
  })
}

export function updateProfileTabs(tabs: Array<{ key: ProfileTabKey; visible: boolean }>) {
  return apiPutRequired<ProfileTabsResponse>('/api/settings/profile-tabs', { tabs })
}

export function profileTabDescription(key: ProfileTabKey) {
  return profileTabDefinitions.find((tab) => tab.key === key)?.description ?? ''
}
