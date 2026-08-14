import type { KokoroTTS } from 'kokoro-js'
import type { KokoroVoice } from './settings.ts'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

type KokoroModel = Pick<KokoroTTS, 'generate'>
type ModelLoader = (onProgress: (progress: unknown) => void) => Promise<KokoroModel>

interface AudioElementLike {
  currentTime: number
  onended: ((event: Event) => unknown) | null
  onerror: ((event: Event | string) => unknown) | null
  pause(): void
  play(): Promise<void>
}

interface ObjectUrlFactory {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

export type KokoroStatus =
  | { state: 'idle'; message: string }
  | { state: 'loading'; message: string }
  | { state: 'ready'; message: string }
  | { state: 'error'; message: string }

export class KokoroSpeechEngine {
  private readonly onStatus: (status: KokoroStatus) => void
  private readonly loadModel: ModelLoader
  private readonly createAudio: (url: string) => AudioElementLike
  private readonly objectUrls: ObjectUrlFactory
  private modelPromise: Promise<KokoroModel> | null = null
  private activeAudio: AudioElementLike | null = null
  private activeUrl: string | null = null
  private finishPlayback: (() => void) | null = null
  private generation = 0

  constructor(
    onStatus: (status: KokoroStatus) => void,
    loadModel: ModelLoader = defaultModelLoader,
    createAudio: (url: string) => AudioElementLike = (url) =>
      new Audio(url) as unknown as AudioElementLike,
    objectUrls: ObjectUrlFactory = URL,
  ) {
    this.onStatus = onStatus
    this.loadModel = loadModel
    this.createAudio = createAudio
    this.objectUrls = objectUrls
  }

  prepare(): Promise<KokoroModel> {
    if (!this.modelPromise) {
      this.onStatus({
        state: 'loading',
        message: 'Preparing the natural voice. The first download may take a few minutes.',
      })
      this.modelPromise = this.loadModel((progress) => {
        this.onStatus({ state: 'loading', message: progressMessage(progress) })
      })
        .then((model) => {
          this.onStatus({ state: 'ready', message: 'Natural voice is ready.' })
          return model
        })
        .catch((error: unknown) => {
          this.modelPromise = null
          this.onStatus({
            state: 'error',
            message: 'Natural voice could not load. The system voice will be used instead.',
          })
          throw error
        })
    }

    return this.modelPromise
  }

  async speak(text: string, voice: KokoroVoice, speed: number): Promise<void> {
    const generation = this.generation
    const model = await this.prepare()
    if (generation !== this.generation) return

    const result = await model.generate(text, { voice, speed })
    if (generation !== this.generation) return

    const url = this.objectUrls.createObjectURL(result.toBlob())
    const audio = this.createAudio(url)
    this.activeAudio = audio
    this.activeUrl = url

    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        this.finishPlayback = null
        this.releaseAudio()
        resolve()
      }
      this.finishPlayback = finish
      audio.onended = finish
      audio.onerror = () => {
        this.finishPlayback = null
        this.releaseAudio()
        reject(new Error('Natural voice audio could not be played.'))
      }
      audio.play().catch((error: unknown) => {
        this.finishPlayback = null
        this.releaseAudio()
        reject(error)
      })
    })
  }

  cancel(): void {
    this.generation += 1
    this.activeAudio?.pause()
    if (this.activeAudio) this.activeAudio.currentTime = 0
    this.finishPlayback?.()
    this.releaseAudio()
  }

  private releaseAudio(): void {
    if (this.activeUrl) this.objectUrls.revokeObjectURL(this.activeUrl)
    this.activeAudio = null
    this.activeUrl = null
  }
}

export function progressMessage(progress: unknown): string {
  if (!isRecord(progress)) {
    return 'Preparing the natural voice…'
  }

  const loaded = typeof progress.loaded === 'number' ? progress.loaded : 0
  const total = typeof progress.total === 'number' ? progress.total : 0

  if (loaded > 0 && total > 0) {
    const percentage = Math.min(100, Math.round((loaded / total) * 100))
    return `Downloading the natural voice: ${percentage} percent.`
  }

  return 'Preparing the natural voice…'
}

async function defaultModelLoader(
  onProgress: (progress: unknown) => void,
): Promise<KokoroModel> {
  const { KokoroTTS } = await import('kokoro-js')
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: onProgress,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
