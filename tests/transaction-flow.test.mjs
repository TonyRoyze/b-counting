import assert from 'node:assert/strict'
import test from 'node:test'
import { NewTransactionFlow, normalizeAmount } from '../src/transaction-flow.ts'

test('normalizes valid monetary amounts without floating-point arithmetic', () => {
  assert.equal(normalizeAmount('1,250.5'), '1250.50')
  assert.equal(normalizeAmount('0004'), '4.00')
  assert.equal(normalizeAmount('0'), null)
  assert.equal(normalizeAmount('-5'), null)
  assert.equal(normalizeAmount('2.999'), null)
})

test('completes a transaction after explicit review', () => {
  const flow = new NewTransactionFlow()

  assert.match(flow.start().prompt, /Transaction type/)
  assert.match(flow.submit('expense').prompt, /Amount/)
  assert.equal(flow.submit('1250').error, undefined)
  const categories = flow.submit('Internet')
  assert.match(categories.prompt, /category/i)
  assert.equal(categories.options.at(-1), 'Add new category…')
  assert.match(flow.submit('Uncategorized').lines.join(' '), /Uncategorized/)

  const saved = flow.submit('save')
  assert.equal(saved.done, true)
  assert.deepEqual(saved.savedDraft, {
    type: 'expense',
    amount: '1250.00',
    description: 'Internet',
    category: '',
  })
})

test('keeps the current step after invalid input', () => {
  const flow = new NewTransactionFlow()
  flow.start()

  const invalidType = flow.submit('other')
  assert.equal(invalidType.error, true)
  assert.match(invalidType.prompt, /Transaction type/)

  flow.submit('income')
  const invalidAmount = flow.submit('-20')
  assert.equal(invalidAmount.error, true)
  assert.match(invalidAmount.prompt, /Amount/)

  flow.submit('20')
  const emptyDescription = flow.submit('')
  assert.equal(emptyDescription.error, true)
  assert.match(emptyDescription.lines.join(' '), /Description is required/)
})

test('edits one field and returns to review', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  flow.submit('expense')
  flow.submit('10')
  flow.submit('Bus')
  flow.submit('Transport')
  flow.submit('edit')
  flow.submit('amount')

  const review = flow.submit('12.50')
  assert.match(review.prompt, /Save this transaction/)
  assert.match(review.lines.join(' '), /12.50 LKR/)
})

test('cancels without producing a transaction', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  const response = flow.submit('cancel')

  assert.equal(response.done, true)
  assert.equal(response.savedDraft, undefined)
})

test('uses the selected currency in review and saved transactions', async () => {
  const { createTransaction } = await import('../src/transaction-flow.ts')
  const flow = new NewTransactionFlow('USD')
  flow.start()
  flow.submit('income')
  flow.submit('50')
  flow.submit('Consulting')

  flow.submit('Add new category…')
  const review = flow.submit('Work')
  assert.match(review.lines.join(' '), /50.00 USD/)

  const saved = flow.submit('save')
  const transaction = createTransaction(saved.savedDraft, 1, 'USD')
  assert.equal(transaction.currency, 'USD')
})

test('offers type-specific categories and creates a custom category last', () => {
  const flow = new NewTransactionFlow('LKR', ['Subscriptions'])
  flow.start()
  flow.submit('expense')
  flow.submit('25')

  const categoryStep = flow.submit('Music')
  assert.deepEqual(categoryStep.options.slice(0, 3), ['Food', 'Housing', 'Utilities'])
  assert.equal(categoryStep.options.includes('Subscriptions'), true)
  assert.deepEqual(categoryStep.options.slice(-2), ['Uncategorized', 'Add new category…'])

  const newCategoryStep = flow.submit(String(categoryStep.options.length))
  assert.match(newCategoryStep.prompt, /New category name/)

  const review = flow.submit('Digital services')
  assert.match(review.lines.join(' '), /Digital services/)
})

test('does not accept arbitrary text before Add new category is selected', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  flow.submit('income')
  flow.submit('100')
  flow.submit('Gift')

  const response = flow.submit('Random')
  assert.equal(response.error, true)
  assert.match(response.lines.join(' '), /listed category/)
  assert.equal(response.options.at(-1), 'Add new category…')
})
