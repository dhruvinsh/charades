/**
 * useTimer — drives the game countdown using setInterval.
 *
 * Plays three contextual sounds via HTML Audio elements:
 *   playStart  — rising arpeggio  (round begins)
 *   playGotIt  — bright chime     (correct guess)
 *   playStop   — descending buzz  (time's up)
 *
 * Falls back silently if audio is unavailable (autoplay policy, etc.).
 */
import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@/store/gameStore'
import startSoundUrl from '@/assets/sounds/start.mp3'
import gotItSoundUrl from '@/assets/sounds/gotit.mp3'
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
  const gotItAudioRef = useRef<HTMLAudioElement | null>(null)
  const stopAudioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedStopRef = useRef(false)

  const getStartAudio = useCallback(() => {
    if (!startAudioRef.current) startAudioRef.current = makeAudio(startSoundUrl)
    return startAudioRef.current
  }, [])

  const getGotItAudio = useCallback(() => {
    if (!gotItAudioRef.current) gotItAudioRef.current = makeAudio(gotItSoundUrl)
    return gotItAudioRef.current
  }, [])

  const getStopAudio = useCallback(() => {
    if (!stopAudioRef.current) stopAudioRef.current = makeAudio(stopSoundUrl)
    return stopAudioRef.current
  }, [])

  const playStart = useCallback(() => {
    try {
      const audio = getStartAudio()
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch { /* ignore */ }
  }, [getStartAudio])

  const playGotIt = useCallback(() => {
    try {
      const audio = getGotItAudio()
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch { /* ignore */ }
  }, [getGotItAudio])

  const playStop = useCallback(() => {
    try {
      const audio = getStopAudio()
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch { /* ignore */ }
  }, [getStopAudio])

  // Start/stop countdown interval based on game phase
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

  // Play stop sound exactly once when the round finishes
  useEffect(() => {
    if (game.phase === 'finished' && !hasPlayedStopRef.current) {
      hasPlayedStopRef.current = true
      playStop()
    }
  }, [game.phase, playStop])

  return { playStart, playGotIt, playStop }
}
