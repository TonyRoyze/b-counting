import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultSettings,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  SETTINGS_KEY,
} from '../src/settings.ts'

test('uses safe defaults for missing or malformed settings', () => {
  assert.deepEqual(sanitizeSettings(null), defaultSettings)
  assert.deepEqual(sanitizeSettings({ speechRate: 99, currency: 'BTC' }), defaultSettings)
})

test('accepts supported settings', () => {
  assert.deepEqual(
    sanitizeSettings({
      readAloud: true,
      verbosity: 'detailed',
      speechRate: 1.4,
      currency: 'USD',
      appearance: 'high-contrast',
    }),
    {
      readAloud: true,
      verbosity: 'detailed',
      speechRate: 1.4,
      currency: 'USD',
      appearance: 'high-contrast',
    },
  )
})

test('loads and saves settings through local storage', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  const settings = { ...defaultSettings, readAloud: true }
  assert.equal(saveSettings(storage, settings), true)
  assert.equal(values.has(SETTINGS_KEY), true)
  assert.deepEqual(loadSettings(storage), settings)
})
