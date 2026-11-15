'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { apiUrl } from '@/lib/api'
import GeminiVoiceAvatar from '@/components/farmer/GeminiVoiceAvatar'

export default function LiveKitVoiceAgent({ farmId, locale = 'en', context }) {
  const [recording, setRecording] = useState(false)
  const [mode, setMode] = useState('idle')
  const [status, setStatus] = useState('')
  const [reply, setReply] = useState('')
  const [speech, setSpeech] = useState(null)
  const [error, setError] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const audioRef = useRef(null)

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function playSpeech(audio = speech) {
    if (!audio?.data) return
    try {
      audioRef.current?.pause()
      const player = new Audio(`data:${audio.mimeType || 'audio/wav'};base64,${audio.data}`)
      audioRef.current = player
      player.onplay = () => setMode('speaking')
      player.onended = () => {
        setMode('idle')
        setStatus('Gemini advisory complete.')
      }
      player.onerror = () => {
        setMode('idle')
        setError('Gemini returned audio that this browser could not play.')
      }
      await player.play()
    } catch (playError) {
      setMode('idle')
      setError(playError.message || 'Unable to play the Gemini voice response.')
    }
  }

  async function startRecording() {
    if (recording) {
      stopRecording()
      return
    }

    setError('')
    setReply('')
    setSpeech(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice input needs a secure browser context and microphone support.')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      streamRef.current = stream
      chunksRef.current = []
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setError('Voice recording failed. Please try again.')
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecording(false)
        setMode('idle')
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        recorderRef.current = null
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setRecording(false)
        if (!blob.size) {
          setStatus('No speech was recorded. Please try again.')
          setMode('idle')
          return
        }

        setMode('thinking')
        setStatus('Gemini is understanding your question...')
        try {
          const audio = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('Unable to read the voice recording.'))
            reader.readAsDataURL(blob)
          })
          const response = await fetch(apiUrl('/api/assistant/audio'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio,
              mimeType: blob.type || 'audio/webm',
              farmId: farmId || null,
              locale,
              context,
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || !data.reply) throw new Error(data.error || 'Gemini voice assistant error')
          setReply(data.reply)
          if (data.audio) {
            const nextSpeech = { data: data.audio, mimeType: data.audioMimeType || 'audio/wav' }
            setSpeech(nextSpeech)
            setStatus(data.speechProvider === 'gemini' ? 'Gemini answered. Playing its voice response…' : 'Playing voice response…')
            await playSpeech(nextSpeech)
          } else {
            setMode('idle')
            setStatus('Gemini answered. Read the response below.')
            setError(data.speechError || 'Voice audio was not returned.')
          }
        } catch (nextError) {
          setMode('idle')
          setError(nextError.message || 'Gemini could not answer right now. Try again.')
          setStatus('')
        }
      }
      recorder.start()
      setRecording(true)
      setMode('listening')
      setStatus('Listening… Tap again when you finish your question.')
    } catch (nextError) {
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setError(nextError.name === 'NotAllowedError' ? 'Microphone permission was denied.' : nextError.message || 'Unable to start voice recording.')
      setRecording(false)
      setMode('idle')
    }
  }

  useEffect(() => () => {
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onstop = null
      if (recorderRef.current.state === 'recording') recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioRef.current?.pause()
  }, [])

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-col items-center rounded-2xl bg-slate-50 p-4">
        <GeminiVoiceAvatar mode={mode} />
        <p className="mt-2 text-center text-sm font-medium text-slate-700">Your AgroSaathi speaks with Gemini voice</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={startRecording} disabled={mode === 'thinking'} className={recording ? 'glass-btn border-red-200 text-red-700' : 'pill-dark disabled:opacity-60'}>
          {recording ? <><MicOff className="mr-2 h-4 w-4" /> Stop recording</> : <><Mic className="mr-2 h-4 w-4" /> Ask by voice</>}
        </button>
        {speech && !recording && (
          <button type="button" onClick={() => playSpeech()} className="glass-btn">
            <Volume2 className="mr-2 h-4 w-4" /> Play voice again
          </button>
        )}
      </div>
      {status && <p className="mt-2 text-xs font-medium text-slate-500" aria-live="polite">{status}</p>}
      {reply && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{reply}</p>}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-amber-700">{error}</p>}
    </div>
  )
}
