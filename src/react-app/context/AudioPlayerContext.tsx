import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
const FALLBACK_THEME = {
  bgStart: 'rgb(11, 18, 28)',
  bgEnd: 'rgb(6, 10, 16)',
  foreground: 'rgb(248, 250, 252)',
  muted: 'rgba(248, 250, 252, 0.72)',
  border: 'rgba(248, 250, 252, 0.16)',
  chrome: 'rgba(248, 250, 252, 0.14)',
  control: 'rgb(248, 250, 252)',
  controlForeground: 'rgb(15, 23, 42)',
  track: 'rgba(248, 250, 252, 0.24)',
}

type PlayerTheme = typeof FALLBACK_THEME

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function mixChannel(value: number, target: number, weight: number) {
  return clampChannel(value * (1 - weight) + target * weight)
}

function rgb(red: number, green: number, blue: number) {
  return `rgb(${clampChannel(red)}, ${clampChannel(green)}, ${clampChannel(blue)})`
}

function rgba(red: number, green: number, blue: number, alpha: number) {
  return `rgba(${clampChannel(red)}, ${clampChannel(green)}, ${clampChannel(blue)}, ${alpha})`
}

function relativeLuminance(red: number, green: number, blue: number) {
  const values = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * values[0]) + (0.7152 * values[1]) + (0.0722 * values[2])
}

function themeFromCoverColor(red: number, green: number, blue: number): PlayerTheme {
  const luminance = relativeLuminance(red, green, blue)
  const useDarkForeground = luminance > 0.58

  if (useDarkForeground) {
    const bgStart = [
      mixChannel(red, 255, 0.76),
      mixChannel(green, 255, 0.76),
      mixChannel(blue, 255, 0.76),
    ] as const
    const bgEnd = [
      mixChannel(red, 255, 0.9),
      mixChannel(green, 255, 0.9),
      mixChannel(blue, 255, 0.9),
    ] as const

    return {
      bgStart: rgb(...bgStart),
      bgEnd: rgb(...bgEnd),
      foreground: 'rgb(15, 23, 42)',
      muted: 'rgba(15, 23, 42, 0.68)',
      border: 'rgba(15, 23, 42, 0.14)',
      chrome: 'rgba(15, 23, 42, 0.1)',
      control: 'rgb(15, 23, 42)',
      controlForeground: 'rgb(248, 250, 252)',
      track: 'rgba(15, 23, 42, 0.2)',
    }
  }

  const bgStart = [
    mixChannel(red, 0, 0.36),
    mixChannel(green, 0, 0.36),
    mixChannel(blue, 0, 0.36),
  ] as const
  const bgEnd = [
    mixChannel(red, 0, 0.64),
    mixChannel(green, 0, 0.64),
    mixChannel(blue, 0, 0.64),
  ] as const

  return {
    bgStart: rgb(...bgStart),
    bgEnd: rgb(...bgEnd),
    foreground: 'rgb(248, 250, 252)',
    muted: 'rgba(248, 250, 252, 0.74)',
    border: 'rgba(248, 250, 252, 0.16)',
    chrome: rgba(mixChannel(red, 255, 0.24), mixChannel(green, 255, 0.24), mixChannel(blue, 255, 0.24), 0.16),
    control: 'rgb(248, 250, 252)',
    controlForeground: 'rgb(15, 23, 42)',
    track: 'rgba(248, 250, 252, 0.24)',
  }
}

function playerThemeStyle(theme: PlayerTheme): CSSProperties {
  return {
    '--player-bg-start': theme.bgStart,
    '--player-bg-end': theme.bgEnd,
    '--player-fg': theme.foreground,
    '--player-muted': theme.muted,
    '--player-border': theme.border,
    '--player-chrome': theme.chrome,
    '--player-control': theme.control,
    '--player-control-fg': theme.controlForeground,
    '--primary': theme.control,
    '--primary-foreground': theme.controlForeground,
    '--input': theme.track,
    background: 'linear-gradient(135deg, var(--player-bg-start), var(--player-bg-end))',
    color: 'var(--player-fg)',
    borderColor: 'var(--player-border)',
  } as CSSProperties
}

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
  const [coverTheme, setCoverTheme] = useState<PlayerTheme>(FALLBACK_THEME)
  const currentItem = queue[index] ?? null
  const currentTime = playback.itemId === currentItem?.id ? playback.currentTime : 0
  const duration = playback.itemId === currentItem?.id && playback.duration
    ? playback.duration
    : currentItem?.durationSeconds ?? 0
  const playerTheme = currentItem?.coverUrl ? coverTheme : FALLBACK_THEME

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
        setCoverTheme(themeFromCoverColor(red, green, blue))
      } catch {
        setCoverTheme(FALLBACK_THEME)
      }
    }
    image.onerror = () => setCoverTheme(FALLBACK_THEME)
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
            style={playerThemeStyle(playerTheme)}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar className="size-11 rounded-xl">
                <AvatarImage src={currentItem.coverUrl ?? undefined} alt={currentItem.title} />
                <AvatarFallback className="rounded-xl">{currentItem.title.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{currentItem.title}</p>
                <p className="truncate text-xs text-[var(--player-muted)]">
                  {currentItem.collection.title} by {currentItem.author.displayName}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-[1.4] flex-col gap-2">
              <div className="flex items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-[var(--player-fg)] hover:bg-[var(--player-chrome)] hover:text-[var(--player-fg)]"
                  onClick={() => move(-1)}
                  aria-label="Previous audio"
                >
                  <SkipBack data-icon="inline-start" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full bg-[var(--player-control)] text-[var(--player-control-fg)] hover:bg-[var(--player-control)]/90"
                  onClick={toggle}
                  aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                >
                  {isPlaying ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-[var(--player-fg)] hover:bg-[var(--player-chrome)] hover:text-[var(--player-fg)]"
                  onClick={() => move(1)}
                  aria-label="Next audio"
                >
                  <SkipForward data-icon="inline-start" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--player-muted)]">
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
              <Volume2 data-icon="inline-start" className="text-[var(--player-muted)]" />
              <Slider
                value={[volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={setVolume}
                aria-label="Volume"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-[var(--player-fg)] hover:bg-[var(--player-chrome)] hover:text-[var(--player-fg)]"
              onClick={close}
              aria-label="Close audio player"
            >
              <X data-icon="inline-start" />
            </Button>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  )
}
