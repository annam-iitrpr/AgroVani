function wrapPcmAsWav(base64Audio, mimeType = '') {
  const pcm = Buffer.from(base64Audio, 'base64')
  if (pcm.subarray(0, 4).toString() === 'RIFF') {
    return { audio: pcm.toString('base64'), mimeType: 'audio/wav' }
  }

  const sampleRate = Number(mimeType.match(/rate=(\d+)/i)?.[1]) || 24000
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return { audio: Buffer.concat([header, pcm]).toString('base64'), mimeType: 'audio/wav' }
}

export async function generateGeminiSpeech({
  text,
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  voiceName = process.env.GEMINI_TTS_VOICE || 'Kore',
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('Configure GEMINI_API_KEY to enable Gemini-generated speech.')
  if (!String(text || '').trim()) throw new Error('Speech text must not be empty.')

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: String(text).trim() }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
    },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data.error?.message || `Gemini speech request failed (${response.status}).`
    throw new Error(message)
  }

  const part = data.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data || item.inline_data?.data)
  const audioData = part?.inlineData || part?.inline_data
  if (!audioData?.data) throw new Error('Gemini returned no speech audio.')
  return wrapPcmAsWav(audioData.data, audioData.mimeType || audioData.mime_type)
}
