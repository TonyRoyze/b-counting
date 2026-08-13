import assert from 'node:assert/strict'
import test from 'node:test'
import { CategoryManagementFlow } from '../src/category-flow.ts'

const catalog = {
  custom: [{ name: 'Subscriptions', type: 'expense' }],
  usage: { 'expense:subscriptions': 3 },
  archived: [],
}

test('renames a category through selectors', () => {
  const flow = new CategoryManagementFlow(catalog)
  assert.equal(flow.start().options[0], 'List categories')
  assert.deepEqual(flow.submit('Rename category').options, ['Income', 'Expense'])
  const categories = flow.submit('Expense')
  assert.equal(categories.options.includes('Subscriptions'), true)
  assert.match(flow.submit('Subscriptions').prompt, /New name/)

  const renamed = flow.submit('Digital services')
  assert.match(renamed.lines.join(' '), /renamed/)
  assert.equal(renamed.catalog.custom.some((item) => item.name === 'Digital services'), true)
})

test('archives and restores a category', () => {
  const archiveFlow = new CategoryManagementFlow(catalog)
  archiveFlow.start()
  archiveFlow.submit('Archive category')
  archiveFlow.submit('Expense')
  const archived = archiveFlow.submit('Subscriptions')
  assert.match(archived.lines.join(' '), /archived/)

  const restoreFlow = new CategoryManagementFlow(archived.catalog)
  restoreFlow.start()
  restoreFlow.submit('Restore category')
  const categories = restoreFlow.submit('Expense')
  assert.deepEqual(categories.options, ['Subscriptions'])
  const restored = restoreFlow.submit('Subscriptions')
  assert.match(restored.lines.join(' '), /restored/)
})
