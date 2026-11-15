import test from 'node:test'
import assert from 'node:assert/strict'
import { generateGeminiSpeech } from '../backend/src/services/geminiSpeech.js'

test('Gemini speech requests audio output and wraps PCM in a playable WAV container', async () => {
  let request
  const result = await generateGeminiSpeech({
    text: 'Keep the straw dry.',
    apiKey: 'test-key',
    model: 'test-tts',
    voiceName: 'Kore',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.from([1, 2, 3, 4]).toString('base64') } }],
            },
          }],
        }),
      }
    },
  })

  const body = JSON.parse(request.options.body)
  const wav = Buffer.from(result.audio, 'base64')
  assert.match(request.url, /models\/test-tts:generateContent\?key=test-key/)
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO'])
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore')
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4])
})

test('Gemini speech fails explicitly when credentials are missing', async () => {
  await assert.rejects(
    generateGeminiSpeech({ text: 'A spoken advisory', apiKey: '' }),
    /GEMINI_API_KEY/,
  )
})
