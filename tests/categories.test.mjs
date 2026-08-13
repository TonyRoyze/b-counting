import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCustomCategory,
  categoryUsageFor,
  customCategoriesFor,
  loadCategoryCatalog,
  recordCategoryUse,
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
  const empty = { custom: [], usage: {} }
  const once = addCustomCategory(empty, 'Subscriptions', 'expense')
  const twice = addCustomCategory(once, 'subscriptions', 'expense')

  assert.equal(twice.custom.length, 1)
})
