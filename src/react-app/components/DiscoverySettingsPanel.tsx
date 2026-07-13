import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import {
  discoveryKeys,
  discoveryPreferencesQueryOptions,
  updateCreatorCategories,
  updateDiscoveryInterests,
  type DiscoveryPreferences,
} from '../lib/discovery'
import { DiscoveryCategoryPicker } from './DiscoveryCategoryPicker'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'

export function DiscoverySettingsPanel() {
  const { currentUser } = useAuth()
  const preferencesQuery = useQuery(discoveryPreferencesQueryOptions)

  if (preferencesQuery.isPending) {
    return <div className="grid gap-4"><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
  }
  if (preferencesQuery.isError) {
    return <p className="text-sm text-destructive">{preferencesQuery.error.message}</p>
  }

  return (
    <DiscoverySettingsForm
      key={`${preferencesQuery.data.interestCategoryIds.join(',')}:${preferencesQuery.data.creatorCategoryIds.join(',')}`}
      preferences={preferencesQuery.data}
      isCreator={currentUser?.role === 'creator'}
    />
  )
}

function DiscoverySettingsForm({ preferences, isCreator }: { preferences: DiscoveryPreferences; isCreator: boolean }) {
  const queryClient = useQueryClient()
  const [interests, setInterests] = useState(preferences.interestCategoryIds)
  const [creatorCategories, setCreatorCategories] = useState(preferences.creatorCategoryIds)
  const interestMutation = useMutation({
    mutationFn: () => updateDiscoveryInterests(interests),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discoveryKeys.all })
      toast.success('Discovery interests updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Interests could not be updated.'),
  })
  const creatorMutation = useMutation({
    mutationFn: () => updateCreatorCategories(creatorCategories),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discoveryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ])
      toast.success('Creator categories updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Creator categories could not be updated.'),
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="normal-case tracking-normal">Your interests</CardTitle>
          <CardDescription>Choose topics used to shape creator recommendations.</CardDescription>
        </CardHeader>
        <CardContent>
          <DiscoveryCategoryPicker categories={preferences.categories} selected={interests} maximum={5} onChange={setInterests} label="Recommendation interests" />
          <Button type="button" className="mt-4" disabled={interestMutation.isPending} onClick={() => interestMutation.mutate()}>
            {interestMutation.isPending ? 'Saving…' : 'Save interests'}
          </Button>
        </CardContent>
      </Card>

      {isCreator && (
        <Card>
          <CardHeader>
            <CardTitle className="normal-case tracking-normal">Creator categories</CardTitle>
            <CardDescription>Select up to three categories shown publicly on your profile and discovery cards.</CardDescription>
          </CardHeader>
          <CardContent>
            <DiscoveryCategoryPicker categories={preferences.categories} selected={creatorCategories} maximum={3} onChange={setCreatorCategories} label="Public creator categories" />
            <Button type="button" className="mt-4" disabled={creatorMutation.isPending} onClick={() => creatorMutation.mutate()}>
              {creatorMutation.isPending ? 'Saving…' : 'Save creator categories'}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
