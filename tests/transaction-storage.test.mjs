import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadTransactions,
  saveTransactions,
  TRANSACTIONS_KEY,
} from '../src/transaction-storage.ts'

const transaction = {
  id: '20260813-001',
  type: 'expense',
  amount: '200.57',
  currency: 'LKR',
  description: 'Groceries',
  category: 'Food',
  createdAt: '2026-08-13T10:00:00.000Z',
}

test('saves and reloads transactions across sessions', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  assert.equal(saveTransactions(storage, [transaction]), true)
  assert.equal(values.has(TRANSACTIONS_KEY), true)
  assert.deepEqual(loadTransactions(storage), [transaction])
})

test('ignores malformed saved entries without losing valid ones', () => {
  const storage = {
    getItem: () => JSON.stringify([transaction, { id: 'broken' }]),
    setItem: () => undefined,
  }

  assert.deepEqual(loadTransactions(storage), [transaction])
})
