export type Verbosity = 'brief' | 'standard' | 'detailed'
export type Currency = 'LKR' | 'USD' | 'EUR' | 'GBP'
export type Appearance = 'dark' | 'high-contrast'

export interface AppSettings {
  readAloud: boolean
  verbosity: Verbosity
  speechRate: number
  currency: Currency
  appearance: Appearance
}

export const SETTINGS_KEY = 'b-counting.settings.v1'

export const defaultSettings: AppSettings = {
  readAloud: false,
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
