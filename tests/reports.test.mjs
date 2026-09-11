import assert from 'node:assert/strict'
import test from 'node:test'
import {
  financialStatement,
  financialSummary,
  spokenFinancialStatement,
} from '../src/reports.ts'

const base = {
  id: '20260904-001',
  currency: 'LKR',
  createdAt: '2026-09-04T08:00:00.000Z',
}

test('reports exact income, expense, net, and category totals', () => {
  const report = financialSummary([
    { ...base, type: 'income', amount: '1000.50', description: 'Salary', category: 'Salary' },
    { ...base, id: '20260904-002', type: 'expense', amount: '200.25', description: 'Market', category: 'Food' },
    { ...base, id: '20260904-003', type: 'expense', amount: '50.00', description: 'Bus', category: 'Transport' },
  ])

  assert.match(report.join('\n'), /Income 1000\.50 · Expenses 250\.25 · Net 750\.25/)
  assert.match(report.join('\n'), /Food: 200\.25 LKR/)
  assert.match(report.at(-1), /3 transactions total/)
})

test('keeps currencies separate', () => {
  const report = financialSummary([
    { ...base, type: 'income', amount: '10.00', description: 'Gift', category: null },
    { ...base, id: '20260904-002', currency: 'USD', type: 'expense', amount: '4.00', description: 'Fee', category: null },
  ])

  assert.equal(report.some((line) => line.startsWith('LKR: Income 10.00')), true)
  assert.equal(report.some((line) => line.startsWith('USD: Income 0.00 · Expenses 4.00')), true)
})

test('describes a financial statement in natural language', () => {
  const statement = financialStatement([
    { ...base, type: 'income', amount: '1000.50', description: 'Salary', category: 'Salary' },
    { ...base, id: '20260904-002', type: 'expense', amount: '200.25', description: 'Market', category: 'Food' },
  ])

  assert.equal(statement.totals[0]?.net, '800.25')
  assert.match(
    spokenFinancialStatement(statement),
    /For LKR, total income is 1000\.50, total expenses are 200\.25, and the net balance is 800\.25\./,
  )
  assert.match(spokenFinancialStatement(statement), /largest expense categories are Food/)
})

test('lists transactions with debit, credit, and running balance columns', () => {
  const statement = financialStatement([
    { ...base, type: 'income', amount: '1000.00', description: 'Salary', category: 'Salary' },
    { ...base, id: '20260905-001', createdAt: '2026-09-05T08:00:00.000Z', type: 'expense', amount: '125.50', description: 'Groceries', category: 'Food' },
  ])

  assert.deepEqual(statement.transactions, [
    { date: '2026-09-04', description: 'Salary', currency: 'LKR', debit: '—', credit: '1000.00', balance: '1000.00' },
    { date: '2026-09-05', description: 'Groceries', currency: 'LKR', debit: '125.50', credit: '—', balance: '874.50' },
  ])
})
