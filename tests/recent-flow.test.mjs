import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RecentTransactionsFlow,
  transactionDetails,
} from '../src/recent-flow.ts'

const older = {
  id: '20260812-001',
  type: 'income',
  amount: '500.00',
  currency: 'LKR',
  description: 'Gift',
  category: null,
  createdAt: '2026-08-12T10:00:00.000Z',
}

const newer = {
  id: '20260813-001',
  type: 'expense',
  amount: '200.57',
  currency: 'LKR',
  description: 'Groceries',
  category: 'Food',
  createdAt: '2026-08-13T10:00:00.000Z',
}

test('shows the newest saved transaction first', () => {
  const response = new RecentTransactionsFlow([older, newer]).start()

  assert.equal(response.options.length, 2)
  assert.equal(response.announceOptions, false)
  assert.equal(response.spokenOptions.length, 2)
  assert.match(response.options[0], /Groceries/)
  assert.match(response.options[1], /Gift/)
})

test('shows one transaction details and returns to the list', () => {
  const flow = new RecentTransactionsFlow([newer])
  const list = flow.start()
  const details = flow.submit(list.options[0])

  assert.deepEqual(details.options, ['Edit', 'Remove', 'Back', 'Finish'])
  assert.match(details.announcement, /200 rupees and 57 cents/)
  assert.doesNotMatch(details.announcement, /Category|Account|Notes/)
  assert.match(details.announcement, /Groceries/)

  const back = flow.submit('Back')
  assert.equal(back.options.length, 1)
})

test('returns the selected transaction for editing', () => {
  const flow = new RecentTransactionsFlow([newer])
  const list = flow.start()
  flow.submit(list.options[0])

  const response = flow.submit('Edit')

  assert.equal(response.done, true)
  assert.deepEqual(response.editTransaction, newer)
})

test('requires confirmation before removing a transaction', () => {
  const flow = new RecentTransactionsFlow([newer])
  const list = flow.start()
  flow.submit(list.options[0])

  const confirmation = flow.submit('Remove')
  assert.deepEqual(confirmation.options, ['Remove', 'Keep'])
  assert.equal(confirmation.removedTransactionId, undefined)

  const kept = flow.submit('Keep')
  assert.deepEqual(kept.options, ['Edit', 'Remove', 'Back', 'Finish'])

  flow.submit('Remove')
  const removed = flow.submit('Remove')
  assert.equal(removed.done, true)
  assert.equal(removed.removedTransactionId, newer.id)
})

test('handles an empty history', () => {
  const response = new RecentTransactionsFlow([]).start()
  assert.equal(response.done, true)
  assert.match(response.lines.join(' '), /no saved transactions/i)
})

test('uses everyday language in spoken transaction details', () => {
  const spoken = transactionDetails(newer).spoken.toLowerCase()
  assert.doesNotMatch(spoken, /terminal|command prompt|\bcommand\b/)
})
