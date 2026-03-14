/**
 * useTimer — drives the game countdown using requestAnimationFrame.
 * Plays sounds on start and when time runs out.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@/store/gameStore'
import startSoundUrl from '@/assets/sounds/start.mp3'
import stopSoundUrl from '@/assets/sounds/stop.mp3'

function makeAudio(src: string): HTMLAudioElement {
  const audio = new Audio(src)
  audio.preload = 'auto'
  return audio
}

export function useTimer() {
  const { game, tickTimer } = useGameStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startAudioRef = useRef<HTMLAudioElement | null>(null)
  const stopAudioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedStopRef = useRef(false)

  // Lazy-init audio refs
  const getStartAudio = useCallback(() => {
    if (!startAudioRef.current) startAudioRef.current = makeAudio(startSoundUrl)
    return startAudioRef.current
  }, [])

  const getStopAudio = useCallback(() => {
    if (!stopAudioRef.current) stopAudioRef.current = makeAudio(stopSoundUrl)
    return stopAudioRef.current
  }, [])

  const playStart = useCallback(() => {
    try { getStartAudio().play().catch(() => {}) } catch { /* ignore */ }
  }, [getStartAudio])

  const playStop = useCallback(() => {
    try { getStopAudio().play().catch(() => {}) } catch { /* ignore */ }
  }, [getStopAudio])

  // Start interval when playing, clear when not
  useEffect(() => {
    if (game.phase === 'playing') {
      hasPlayedStopRef.current = false
      intervalRef.current = setInterval(() => {
        tickTimer()
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [game.phase, tickTimer])

  // Play stop sound when finished
  useEffect(() => {
    if (game.phase === 'finished' && !hasPlayedStopRef.current) {
      hasPlayedStopRef.current = true
      playStop()
    }
  }, [game.phase, playStop])

  return { playStart, playStop }
}
