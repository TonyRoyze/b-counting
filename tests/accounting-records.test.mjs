import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountBalances,
  currentBookValue,
  emptyAccountingRecords,
  loadAccountingRecords,
  saveAccountingRecords,
} from '../src/accounting-records.ts'

test('calculates account balances from activity and transfers', () => {
  const records = emptyAccountingRecords()
  records.accounts.push(
    { id: 'a1', name: 'Main bank', type: 'bank', currency: 'LKR', openingBalance: '1000.00' },
    { id: 'a2', name: 'Savings', type: 'bank', currency: 'LKR', openingBalance: '0.00' },
  )
  records.assets.push({ id: 'x1', name: 'Laptop', purchaseDate: '2026-01-01', cost: '100.00', currency: 'LKR', paymentAccount: 'Main bank', usefulLifeYears: 5, residualValue: '0.00' })
  records.deposits.push({ id: 'd1', name: 'Rent deposit', paidDate: '2026-01-01', amount: '50.00', currency: 'LKR', paymentAccount: 'Main bank', status: 'active' })
  records.transfers.push({ id: 't1', date: '2026-01-01', fromAccount: 'Main bank', toAccount: 'Savings', amount: '200.00', currency: 'LKR' })
  const transactions = [{ id: '1', type: 'income', amount: '500.00', currency: 'LKR', description: 'Sale', category: null, account: 'Main bank', createdAt: '2026-01-01T00:00:00Z' }]

  const balances = accountBalances(records, transactions)
  assert.equal(balances.get('Main bank'), '1150.00')
  assert.equal(balances.get('Savings'), '200.00')
})

test('calculates straight-line book value down to residual value', () => {
  const asset = { id: 'x1', name: 'Laptop', purchaseDate: '2020-01-01', cost: '1000.00', currency: 'USD', paymentAccount: 'Bank', usefulLifeYears: 5, residualValue: '100.00' }
  assert.equal(currentBookValue(asset, new Date('2030-01-01T00:00:00Z')), '100.00')
})

test('saves and reloads accounting records', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const records = emptyAccountingRecords()
  records.accounts.push({ id: 'a1', name: 'Bank', type: 'bank', currency: 'USD', openingBalance: '25.00' })
  assert.equal(saveAccountingRecords(storage, records), true)
  assert.deepEqual(loadAccountingRecords(storage), records)
})
