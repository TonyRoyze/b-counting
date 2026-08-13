import type { Transaction } from './transaction-flow.ts'

interface TransactionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const TRANSACTIONS_KEY = 'b-counting.transactions.v1'

export function loadTransactions(storage: TransactionStorage): Transaction[] {
  try {
    const value = JSON.parse(storage.getItem(TRANSACTIONS_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter(isTransaction) : []
  } catch {
    return []
  }
}

export function saveTransactions(
  storage: TransactionStorage,
  transactions: readonly Transaction[],
): boolean {
  try {
    storage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions))
    return true
  } catch {
    return false
  }
}

function isTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) return false

  return (
    (value.type === 'income' || value.type === 'expense') &&
    typeof value.id === 'string' &&
    typeof value.amount === 'string' &&
    /^\d+\.\d{2}$/.test(value.amount) &&
    typeof value.description === 'string' &&
    (typeof value.category === 'string' || value.category === null) &&
    typeof value.currency === 'string' &&
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
