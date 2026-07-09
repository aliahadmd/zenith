import { describe, expect, it } from 'vitest'
import { defaultProfileTabs, normalizeProfileTabs } from './profile-tabs'

describe('profile tab defaults', () => {
  it('places All first and About last', () => {
    const tabs = defaultProfileTabs()

    expect(tabs[0]?.key).toBe('all')
    expect(tabs.at(-1)?.key).toBe('about')
    expect(tabs).toHaveLength(9)
  })

  it('adds All and applies the new defaults to legacy settings', () => {
    const tabs = normalizeProfileTabs([
      { tabKey: 'about', visible: true, displayOrder: 0 },
      { tabKey: 'posts', visible: true, displayOrder: 1 },
      { tabKey: 'photography', visible: true, displayOrder: 2 },
      { tabKey: 'audio', visible: true, displayOrder: 3 },
      { tabKey: 'articles', visible: true, displayOrder: 4 },
      { tabKey: 'courses', visible: true, displayOrder: 5 },
      { tabKey: 'subscribers', visible: true, displayOrder: 6 },
      { tabKey: 'subscribed', visible: true, displayOrder: 7 },
    ])

    expect(tabs.map((tab) => tab.key)).toEqual([
      'all',
      'posts',
      'photography',
      'audio',
      'articles',
      'courses',
      'subscribers',
      'subscribed',
      'about',
    ])
  })

  it('preserves explicit ordering once All is saved', () => {
    const tabs = normalizeProfileTabs([
      { tabKey: 'about', visible: true, displayOrder: 0 },
      { tabKey: 'all', visible: true, displayOrder: 1 },
      { tabKey: 'posts', visible: true, displayOrder: 2 },
    ])

    expect(tabs.slice(0, 3).map((tab) => tab.key)).toEqual(['about', 'all', 'posts'])
  })
})
