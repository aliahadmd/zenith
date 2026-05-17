import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { Slider } from '../components/ui/slider'
import type { AudioItemSummary } from '../lib/audio'
import { formatAudioDuration } from '../lib/audio'

type AudioPlayerContextValue = {
  currentItem: AudioItemSummary | null
  isPlaying: boolean
  queue: AudioItemSummary[]
  playItem: (item: AudioItemSummary, queue?: AudioItemSummary[]) => void
  toggle: () => void
  close: () => void
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null)
const FALLBACK_TINT = 'rgba(10, 20, 30, 0.92)'

export function useAudioPlayer() {
  const value = useContext(AudioPlayerContext)
  if (!value) throw new Error('useAudioPlayer must be used inside AudioPlayerProvider')
  return value
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [queue, setQueue] = useState<AudioItemSummary[]>([])
  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playback, setPlayback] = useState({ itemId: '', currentTime: 0, duration: 0 })
  const [volume, setVolumeState] = useState(0.85)
  const [tint, setTint] = useState(FALLBACK_TINT)
  const currentItem = queue[index] ?? null
  const currentTime = playback.itemId === currentItem?.id ? playback.currentTime : 0
  const duration = playback.itemId === currentItem?.id && playback.duration
    ? playback.duration
    : currentItem?.durationSeconds ?? 0
  const playerTint = currentItem?.coverUrl ? tint : FALLBACK_TINT

  const playItem = useCallback((item: AudioItemSummary, nextQueue?: AudioItemSummary[]) => {
    const playableQueue = nextQueue?.length ? nextQueue : [item]
    const nextIndex = Math.max(0, playableQueue.findIndex((candidate) => candidate.id === item.id))
    setQueue(playableQueue)
    setIndex(nextIndex === -1 ? 0 : nextIndex)
    setIsPlaying(true)
  }, [])

  const close = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    setQueue([])
    setIndex(0)
  }, [])

  const toggle = useCallback(() => {
    if (!currentItem?.streamUrl) return
    setIsPlaying((value) => !value)
  }, [currentItem?.streamUrl])

  const seek = useCallback((value: number[]) => {
    const next = value[0] ?? 0
    if (audioRef.current) audioRef.current.currentTime = next
    setPlayback((current) => ({
      itemId: currentItem?.id ?? current.itemId,
      currentTime: next,
      duration: current.duration,
    }))
  }, [currentItem?.id])

  const setVolume = useCallback((value: number[]) => {
    const next = value[0] ?? 0
    setVolumeState(next)
    if (audioRef.current) audioRef.current.volume = next
  }, [])

  const move = useCallback((direction: -1 | 1) => {
    setIndex((current) => {
      if (queue.length === 0) return current
      const next = current + direction
      if (next < 0) return queue.length - 1
      if (next >= queue.length) return 0
      return next
    })
    setIsPlaying(true)
  }, [queue.length])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentItem?.streamUrl) return
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }, [isPlaying, currentItem?.streamUrl])

  useEffect(() => {
    if (!currentItem?.coverUrl) return

    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, 1, 1)
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
        setTint(`rgba(${Math.round(red * 0.38)}, ${Math.round(green * 0.38)}, ${Math.round(blue * 0.38)}, 0.96)`)
      } catch {
        setTint(FALLBACK_TINT)
      }
    }
    image.onerror = () => setTint(FALLBACK_TINT)
    image.src = currentItem.coverUrl
  }, [currentItem?.coverUrl])

  const value = useMemo<AudioPlayerContextValue>(() => ({
    currentItem,
    isPlaying,
    queue,
    playItem,
    toggle,
    close,
  }), [currentItem, isPlaying, queue, playItem, toggle, close])

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        src={currentItem?.streamUrl ?? undefined}
        preload="metadata"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          setPlayback({
            itemId: currentItem?.id ?? '',
            currentTime: audio.currentTime,
            duration: Number.isFinite(audio.duration) ? audio.duration : currentItem?.durationSeconds ?? 0,
          })
        }}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget
          setPlayback({
            itemId: currentItem?.id ?? '',
            currentTime: audio.currentTime,
            duration: Number.isFinite(audio.duration) ? audio.duration : currentItem?.durationSeconds ?? 0,
          })
        }}
        onEnded={() => queue.length > 1 ? move(1) : setIsPlaying(false)}
      />
      {currentItem && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/80 px-3 py-3 backdrop-blur">
          <div
            className="mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl border px-4 py-3 shadow-2xl sm:flex-row sm:items-center"
            style={{ background: `linear-gradient(135deg, ${playerTint}, var(--background))` }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar className="size-11 rounded-xl">
                <AvatarImage src={currentItem.coverUrl ?? undefined} alt={currentItem.title} />
                <AvatarFallback className="rounded-xl">{currentItem.title.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{currentItem.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {currentItem.collection.title} by {currentItem.author.displayName}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-[1.4] flex-col gap-2">
              <div className="flex items-center justify-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(-1)} aria-label="Previous audio">
                  <SkipBack data-icon="inline-start" />
                </Button>
                <Button type="button" size="icon" className="rounded-full" onClick={toggle} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>
                  {isPlaying ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(1)} aria-label="Next audio">
                  <SkipForward data-icon="inline-start" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-10 text-right">{formatAudioDuration(currentTime)}</span>
                <Slider
                  value={[Math.min(currentTime, duration || currentTime)]}
                  min={0}
                  max={duration || currentTime || 1}
                  step={1}
                  onValueChange={seek}
                  aria-label="Seek audio"
                />
                <span className="w-10">{formatAudioDuration(duration || currentItem.durationSeconds)}</span>
              </div>
            </div>

            <div className="hidden min-w-28 items-center gap-2 sm:flex">
              <Volume2 data-icon="inline-start" className="text-muted-foreground" />
              <Slider
                value={[volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={setVolume}
                aria-label="Volume"
              />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close audio player">
              <X data-icon="inline-start" />
            </Button>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  )
}
