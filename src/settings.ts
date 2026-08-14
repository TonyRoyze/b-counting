export type Verbosity = 'brief' | 'standard' | 'detailed'
export type Currency = 'LKR' | 'USD' | 'EUR' | 'GBP'
export type Appearance = 'dark' | 'high-contrast'
export type SpeechEngine = 'system' | 'kokoro'
export type KokoroVoice = 'af_heart' | 'af_bella' | 'bf_emma' | 'bm_george'

export interface AppSettings {
  readAloud: boolean
  speechEngine: SpeechEngine
  kokoroVoice: KokoroVoice
  verbosity: Verbosity
  speechRate: number
  currency: Currency
  appearance: Appearance
}

export const SETTINGS_KEY = 'b-counting.settings.v1'

export const defaultSettings: AppSettings = {
  readAloud: false,
  speechEngine: 'system',
  kokoroVoice: 'af_heart',
  verbosity: 'standard',
  speechRate: 1,
  currency: 'LKR',
  appearance: 'dark',
}

interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadSettings(storage: SettingsStorage): AppSettings {
  try {
    const stored = storage.getItem(SETTINGS_KEY)
    return stored ? sanitizeSettings(JSON.parse(stored) as unknown) : { ...defaultSettings }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(storage: SettingsStorage, settings: AppSettings): boolean {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    return { ...defaultSettings }
  }

  return {
    readAloud: typeof value.readAloud === 'boolean' ? value.readAloud : defaultSettings.readAloud,
    speechEngine: isOneOf(value.speechEngine, ['system', 'kokoro'])
      ? value.speechEngine
      : defaultSettings.speechEngine,
    kokoroVoice: isOneOf(value.kokoroVoice, ['af_heart', 'af_bella', 'bf_emma', 'bm_george'])
      ? value.kokoroVoice
      : defaultSettings.kokoroVoice,
    verbosity: isOneOf(value.verbosity, ['brief', 'standard', 'detailed'])
      ? value.verbosity
      : defaultSettings.verbosity,
    speechRate:
      typeof value.speechRate === 'number' && value.speechRate >= 0.5 && value.speechRate <= 2
        ? value.speechRate
        : defaultSettings.speechRate,
    currency: isOneOf(value.currency, ['LKR', 'USD', 'EUR', 'GBP'])
      ? value.currency
      : defaultSettings.currency,
    appearance: isOneOf(value.appearance, ['dark', 'high-contrast'])
      ? value.appearance
      : defaultSettings.appearance,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOneOf<Value extends string>(value: unknown, options: readonly Value[]): value is Value {
  return typeof value === 'string' && options.includes(value as Value)
}
