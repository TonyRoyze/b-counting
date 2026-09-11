import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NewTransactionFlow,
  normalizeAmount,
  speakableAmount,
} from '../src/transaction-flow.ts'

test('normalizes valid monetary amounts without floating-point arithmetic', () => {
  assert.equal(normalizeAmount('1,250.5'), '1250.50')
  assert.equal(normalizeAmount('0004'), '4.00')
  assert.equal(normalizeAmount('0'), null)
  assert.equal(normalizeAmount('-5'), null)
  assert.equal(normalizeAmount('2.999'), null)
})

test('turns exact decimal amounts into natural spoken currency', () => {
  assert.equal(speakableAmount('200.57', 'LKR'), '200 rupees and 57 cents')
  assert.equal(speakableAmount('1.01', 'LKR'), '1 rupee and 1 cent')
  assert.equal(speakableAmount('0.50', 'USD'), '50 cents')
  assert.equal(speakableAmount('2.01', 'GBP'), '2 pounds and 1 penny')
  assert.equal(speakableAmount('10.00', 'EUR'), '10 euros')
})

test('completes a transaction after explicit review', () => {
  const flow = new NewTransactionFlow()

  const start = flow.start()
  assert.match(start.prompt, /transaction type/i)
  assert.deepEqual(start.options, ['Income', 'Expense'])
  assert.match(flow.submit('expense').prompt, /Amount/)
  const amount = flow.submit('1250')
  assert.equal(amount.error, undefined)
  assert.match(amount.announcement, /1,?250 rupees|1250 rupees/)
  const categories = flow.submit('Internet')
  assert.match(categories.prompt, /category/i)
  assert.equal(categories.options.at(-1), 'Add new category…')
  const review = flow.submit('Uncategorized')
  assert.match(review.lines.join(' '), /Uncategorized/)
  assert.deepEqual(review.options, ['Save', 'Edit', 'Cancel'])
  assert.match(review.announcement, /1250 rupees/)

  const saved = flow.submit('Save')
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
  assert.match(invalidType.prompt, /transaction type/i)

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
  const editChoice = flow.submit('edit')
  assert.deepEqual(editChoice.options, ['Type', 'Amount', 'Description', 'Category', 'Date', 'Account', 'Notes'])
  flow.submit('Amount')

  const review = flow.submit('12.50')
  assert.match(review.prompt, /Choose an action/)
  assert.deepEqual(review.options, ['Save', 'Edit', 'Cancel'])
  assert.match(review.lines.join(' '), /12.50 LKR/)
})

test('offers Save, Edit, and Cancel as selectable review actions', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  flow.submit('income')
  flow.submit('100')
  flow.submit('Salary')

  const review = flow.submit('Salary')
  assert.deepEqual(review.options, ['Save', 'Edit', 'Cancel'])

  const edit = flow.submit(review.options[1])
  assert.match(edit.prompt, /Choose what to edit/)
  assert.deepEqual(edit.options, ['Type', 'Amount', 'Description', 'Category', 'Date', 'Account', 'Notes'])
})

test('allows each editable field to be selected from the edit list', () => {
  const fields = ['Type', 'Amount', 'Description', 'Category', 'Date', 'Account', 'Notes']

  for (const field of fields) {
    const flow = new NewTransactionFlow()
    flow.start()
    flow.submit('expense')
    flow.submit('10')
    flow.submit('Bus')
    flow.submit('Transport')
    flow.submit('Edit')

    const response = flow.submit(field)
    assert.match(response.lines.join(' '), new RegExp(`Editing ${field}`, 'i'))
  }
})

test('records a transaction date, account, and optional notes from review', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  flow.submit('expense')
  flow.submit('10')
  flow.submit('Lunch')
  flow.submit('Food')

  flow.submit('Edit')
  flow.submit('Date')
  assert.equal(flow.submit('not-a-date').error, true)
  flow.submit('2026-09-01')
  flow.submit('Edit')
  flow.submit('Account')
  flow.submit('Business card')
  flow.submit('Edit')
  flow.submit('Notes')
  const review = flow.submit('Receipt 42')
  assert.match(review.lines.join(' '), /2026-09-01.*Business card.*Receipt 42/)

  assert.deepEqual(flow.submit('Save').savedDraft, {
    type: 'expense', amount: '10.00', description: 'Lunch', category: 'Food',
    transactionDate: '2026-09-01', account: 'Business card', notes: 'Receipt 42',
  })
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

test('starts an existing transaction at selectable review actions', () => {
  const flow = new NewTransactionFlow(
    'LKR',
    [],
    {},
    {},
    {
      type: 'expense',
      amount: '200.57',
      description: 'Groceries',
      category: 'Food',
    },
    'edit',
  )

  const review = flow.start()
  assert.match(review.lines.join(' '), /Groceries/)
  assert.deepEqual(review.options, ['Save', 'Edit', 'Cancel'])

  const saved = flow.submit('Save')
  assert.equal(saved.done, true)
  assert.match(saved.lines[0], /Changes saved/)
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

test('orders categories by most used while keeping action items last', () => {
  const flow = new NewTransactionFlow(
    'LKR',
    { expense: ['Subscriptions'] },
    { expense: { transport: 2, subscriptions: 5, food: 1 } },
  )
  flow.start()
  flow.submit('Expense')
  flow.submit('20')

  const categories = flow.submit('Bus')
  assert.deepEqual(categories.options.slice(0, 3), [
    'Subscriptions',
    'Transport',
    'Food',
  ])
  assert.deepEqual(categories.options.slice(-2), [
    'Uncategorized',
    'Add new category…',
  ])
})

test('reports newly created category details for immediate persistence', () => {
  const flow = new NewTransactionFlow()
  flow.start()
  flow.submit('Expense')
  flow.submit('20')
  flow.submit('Hosting')
  flow.submit('Add new category…')

  const response = flow.submit('Subscriptions')
  assert.deepEqual(response.createdCategory, {
    name: 'Subscriptions',
    type: 'expense',
  })
})
