import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadTransactions,
  saveTransactions,
  serializeTransactions,
  parseTransactionsFile,
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

test('round trips transactions through the readable text-ledger format', () => {
  const special = { ...transaction, description: 'Food\tand supplies\\weekly\nshop' }
  const contents = serializeTransactions([special])

  assert.match(contents, /^# B-Counting ledger v1\nid\ttransactionDate\tcreatedAt/)
  assert.match(contents, /expense\t200\.57\tLKR\tCash\tFood/)
  assert.deepEqual(parseTransactionsFile(contents), [{
    ...special,
    transactionDate: '2026-08-13',
    account: 'Cash',
    notes: '',
  }])
})

test('rejects unrelated and malformed text files', () => {
  assert.throws(() => parseTransactionsFile('hello'), /not a B-Counting ledger/)
  assert.throws(
    () => parseTransactionsFile('# B-Counting ledger v1\nid\nanything'),
    /missing required columns/,
  )
})

test('ignores malformed saved entries without losing valid ones', () => {
  const storage = {
    getItem: () => JSON.stringify([transaction, { id: 'broken' }]),
    setItem: () => undefined,
  }

  assert.deepEqual(loadTransactions(storage), [transaction])
})
