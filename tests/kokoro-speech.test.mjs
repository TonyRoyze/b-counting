import assert from 'node:assert/strict'
import test from 'node:test'
import { KokoroSpeechEngine, progressMessage } from '../src/kokoro-speech.ts'

test('reports natural voice download progress in everyday language', () => {
  assert.equal(
    progressMessage({ loaded: 46, total: 92 }),
    'Downloading the natural voice: 50 percent.',
  )
  assert.doesNotMatch(progressMessage({}), /model|onnx|wasm/i)
})

test('loads the model once and plays generated speech', async () => {
  const statuses = []
  const generated = []
  const urls = []
  let loads = 0
  const model = {
    generate: async (text, options) => {
      generated.push({ text, options })
      return { toBlob: () => new Blob(['voice']) }
    },
  }
  const loadModel = async (onProgress) => {
    loads += 1
    onProgress({ loaded: 1, total: 2 })
    return model
  }
  const createAudio = () => ({
    currentTime: 0,
    onended: null,
    onerror: null,
    pause: () => undefined,
    play() {
      queueMicrotask(() => this.onended?.())
      return Promise.resolve()
    },
  })
  const engine = new KokoroSpeechEngine(
    (status) => statuses.push(status),
    loadModel,
    createAudio,
    {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (url) => urls.push(url),
    },
  )

  await engine.speak('Two hundred rupees.', 'af_heart', 1.1)
  await engine.speak('Choice one.', 'af_heart', 1.1)

  assert.equal(loads, 1)
  assert.deepEqual(generated[0], {
    text: 'Two hundred rupees.',
    options: { voice: 'af_heart', speed: 1.1 },
  })
  assert.equal(statuses.at(-1).state, 'ready')
  assert.deepEqual(urls, ['blob:test', 'blob:test'])
})
