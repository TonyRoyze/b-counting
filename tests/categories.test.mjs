import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCustomCategory,
  categoryUsageFor,
  customCategoriesFor,
  loadCategoryCatalog,
  archiveCategory,
  archivedCustomCategoriesFor,
  renameCategory,
  recordCategoryUse,
  restoreCategory,
  saveCategoryCatalog,
} from '../src/categories.ts'

test('persists custom categories across app sessions', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  let catalog = loadCategoryCatalog(storage)
  catalog = addCustomCategory(catalog, 'Subscriptions', 'expense')
  assert.equal(saveCategoryCatalog(storage, catalog), true)

  const reloaded = loadCategoryCatalog(storage)
  assert.deepEqual(customCategoriesFor(reloaded, 'expense'), ['Subscriptions'])
  assert.deepEqual(customCategoriesFor(reloaded, 'income'), [])
})

test('tracks usage independently by transaction type', () => {
  let catalog = loadCategoryCatalog({
    getItem: () => null,
    setItem: () => undefined,
  })

  catalog = recordCategoryUse(catalog, 'Other', 'expense')
  catalog = recordCategoryUse(catalog, 'Other', 'expense')
  catalog = recordCategoryUse(catalog, 'Other', 'income')

  assert.equal(categoryUsageFor(catalog, 'expense').other, 2)
  assert.equal(categoryUsageFor(catalog, 'income').other, 1)
})

test('does not add duplicate custom categories for the same type', () => {
  const empty = { custom: [], usage: {}, archived: [] }
  const once = addCustomCategory(empty, 'Subscriptions', 'expense')
  const twice = addCustomCategory(once, 'subscriptions', 'expense')

  assert.equal(twice.custom.length, 1)
})

test('renames a category while preserving its usage', () => {
  let catalog = { custom: [{ name: 'Subs', type: 'expense' }], usage: { 'expense:subs': 4 }, archived: [] }
  catalog = renameCategory(catalog, 'Subs', 'Subscriptions', 'expense')

  assert.deepEqual(customCategoriesFor(catalog, 'expense'), ['Subscriptions'])
  assert.equal(categoryUsageFor(catalog, 'expense').subscriptions, 4)
})

test('archives and restores categories', () => {
  const catalog = { custom: [{ name: 'Subscriptions', type: 'expense' }], usage: {}, archived: [] }
  const archived = archiveCategory(catalog, 'Subscriptions', 'expense')

  assert.deepEqual(customCategoriesFor(archived, 'expense'), [])
  assert.deepEqual(archivedCustomCategoriesFor(archived, 'expense'), ['Subscriptions'])

  const restored = restoreCategory(archived, 'Subscriptions', 'expense')
  assert.deepEqual(customCategoriesFor(restored, 'expense'), ['Subscriptions'])
})
