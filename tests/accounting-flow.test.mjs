import assert from 'node:assert/strict'
import test from 'node:test'
import { AccountingRecordFlow } from '../src/accounting-flow.ts'
import { emptyAccountingRecords } from '../src/accounting-records.ts'

test('records a bank account through an accessible flow', () => {
  const records = emptyAccountingRecords()
  const flow = new AccountingRecordFlow('account', records, 'LKR')
  flow.start()
  flow.submit('Main bank')
  flow.submit('Bank')
  flow.submit('LKR')
  const saved = flow.submit('1000')
  assert.equal(saved.done, true)
  assert.equal(saved.records.accounts[0].openingBalance, '1000.00')
})

test('requires an account before recording assets', () => {
  const response = new AccountingRecordFlow('asset', emptyAccountingRecords(), 'LKR').start()
  assert.equal(response.done, true)
  assert.match(response.announcement, /account first/i)
})
