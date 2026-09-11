import type { Transaction } from './transaction-flow.ts'

export interface FinancialStatementRow {
  currency: string
  income: string
  expenses: string
  net: string
}

export interface ExpenseCategoryRow {
  category: string
  currency: string
  amount: string
}

export interface FinancialStatement {
  totals: FinancialStatementRow[]
  topExpenseCategories: ExpenseCategoryRow[]
  transactions: StatementTransactionRow[]
  transactionCount: number
}

export interface StatementTransactionRow {
  date: string
  description: string
  currency: string
  debit: string
  credit: string
  balance: string
}

export function financialStatement(transactions: readonly Transaction[]): FinancialStatement {
  const currencies = [...new Set(transactions.map((transaction) => transaction.currency))].sort()
  const totals = currencies.map((currency) => {
    const relevant = transactions.filter((transaction) => transaction.currency === currency)
    const income = sumMinorUnits(relevant.filter((transaction) => transaction.type === 'income'))
    const expenses = sumMinorUnits(relevant.filter((transaction) => transaction.type === 'expense'))
    return {
      currency,
      income: formatMinorUnits(income),
      expenses: formatMinorUnits(expenses),
      net: formatMinorUnits(income - expenses),
    }
  })

  const expensesByCategory = new Map<string, number>()
  for (const transaction of transactions.filter((item) => item.type === 'expense')) {
    const key = `${transaction.currency}\u0000${transaction.category ?? 'Uncategorized'}`
    expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + toMinorUnits(transaction.amount))
  }
  const topExpenseCategories = [...expensesByCategory.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([key, amount]) => {
      const [currency = '', category = 'Uncategorized'] = key.split('\u0000')
      return { category, currency, amount: formatMinorUnits(amount) }
    })

  const balances = new Map<string, number>()
  const transactionRows = [...transactions]
    .sort((left, right) =>
      (left.transactionDate ?? left.createdAt).localeCompare(right.transactionDate ?? right.createdAt),
    )
    .map((transaction) => {
      const amount = toMinorUnits(transaction.amount)
      const change = transaction.type === 'income' ? amount : -amount
      const balance = (balances.get(transaction.currency) ?? 0) + change
      balances.set(transaction.currency, balance)
      return {
        date: statementDate(transaction.transactionDate ?? transaction.createdAt),
        description: transaction.description,
        currency: transaction.currency,
        debit: transaction.type === 'expense' ? formatMinorUnits(amount) : '—',
        credit: transaction.type === 'income' ? formatMinorUnits(amount) : '—',
        balance: formatMinorUnits(balance),
      }
    })

  return {
    totals,
    topExpenseCategories,
    transactions: transactionRows,
    transactionCount: transactions.length,
  }
}

export function spokenFinancialStatement(statement: FinancialStatement): string {
  if (statement.transactionCount === 0) return 'No transactions are available to report.'

  const totals = statement.totals.map(({ currency, income, expenses, net }) =>
    `For ${currency}, total income is ${income}, total expenses are ${expenses}, and the net balance is ${net}.`,
  )
  const categories = statement.topExpenseCategories.length
    ? `The largest expense categories are ${statement.topExpenseCategories
        .map(({ category, amount, currency }) => `${category}, at ${amount} ${currency}`)
        .join('; ')}.`
    : 'There are no recorded expenses.'
  const count = `${statement.transactionCount} transaction${statement.transactionCount === 1 ? '' : 's'} are included.`
  return ['Financial statement.', ...totals, categories, count].join(' ')
}

export function financialSummary(transactions: readonly Transaction[]): string[] {
  if (transactions.length === 0) return ['No transactions are available to report.']
  const statement = financialStatement(transactions)
  const lines = ['Financial summary', '']

  for (const row of statement.totals) {
    lines.push(`${row.currency}: Income ${row.income} · Expenses ${row.expenses} · Net ${row.net}`)
  }

  if (statement.topExpenseCategories.length) {
    lines.push('', 'Top expense categories')
    for (const row of statement.topExpenseCategories) {
      lines.push(`${row.category}: ${row.amount} ${row.currency}`)
    }
  }

  lines.push('', `${statement.transactionCount} transaction${statement.transactionCount === 1 ? '' : 's'} total.`)
  return lines
}

function sumMinorUnits(transactions: readonly Transaction[]): number {
  return transactions.reduce((total, transaction) => total + toMinorUnits(transaction.amount), 0)
}

function toMinorUnits(amount: string): number {
  const [major = '0', minor = '00'] = amount.split('.')
  return Number(major) * 100 + Number(minor.padEnd(2, '0').slice(0, 2))
}

function formatMinorUnits(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const absolute = Math.abs(amount)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

function statementDate(value: string): string {
  return value.slice(0, 10)
}
