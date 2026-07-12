import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { libraryKeys, removeFromLibrary, saveToLibrary } from '../lib/library'
import { postKeys } from '../lib/posts'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

export function SaveButton({
  postId,
  saved,
  canSave = true,
  queryKeys = [],
  className,
}: SaveButtonProps) {
  return (
    <SaveButtonState
      key={`${postId}:${saved}`}
      postId={postId}
      saved={saved}
      canSave={canSave}
      queryKeys={queryKeys}
      className={className}
    />
  )
}

type SaveButtonProps = {
  postId: string
  saved: boolean
  canSave?: boolean
  queryKeys?: readonly (readonly unknown[])[]
  className?: string
}

function SaveButtonState({ postId, saved, canSave, queryKeys, className }: Required<Pick<SaveButtonProps, 'postId' | 'saved' | 'canSave' | 'queryKeys'>> & Pick<SaveButtonProps, 'className'>) {
  const queryClient = useQueryClient()
  const [displayedSaved, setDisplayedSaved] = useState(saved)

  const mutation = useMutation<{ saved: boolean }, Error, boolean>({
    mutationFn: async (nextSaved: boolean) => {
      const result = nextSaved ? await saveToLibrary(postId) : await removeFromLibrary(postId)
      return { saved: result.saved }
    },
    onSuccess: async (result) => {
      setDisplayedSaved(result.saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        ...queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ])
    },
    onError: (error) => {
      setDisplayedSaved(saved)
      toast.error(error instanceof Error ? error.message : 'Unable to update your library.')
    },
  })

  if (!canSave && !displayedSaved) return null

  return (
    <Button
      type="button"
      variant={displayedSaved ? 'secondary' : 'ghost'}
      size="icon-sm"
      className={cn(displayedSaved && 'text-primary', className)}
      disabled={mutation.isPending}
      aria-label={displayedSaved ? 'Remove from library' : 'Save to library'}
      title={displayedSaved ? 'Remove from library' : 'Save to library'}
      onClick={() => {
        const nextSaved = !displayedSaved
        setDisplayedSaved(nextSaved)
        mutation.mutate(nextSaved)
      }}
    >
      <Bookmark className={cn(displayedSaved && 'fill-current')} />
    </Button>
  )
}
