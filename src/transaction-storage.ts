import type { Transaction } from './transaction-flow.ts'

interface TransactionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const TRANSACTIONS_KEY = 'b-counting.transactions.v1'
export const LEDGER_FILE_HEADER = '# B-Counting ledger v1'

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

/** A human-readable, round-trippable text format suitable for backups and version control. */
export function serializeTransactions(transactions: readonly Transaction[]): string {
  const columns = ['id', 'transactionDate', 'createdAt', 'type', 'amount', 'currency', 'account', 'category', 'description', 'notes']
  const rows = transactions.map((transaction) => [
    transaction.id,
    transaction.transactionDate ?? transaction.createdAt.slice(0, 10),
    transaction.createdAt,
    transaction.type,
    transaction.amount,
    transaction.currency,
    transaction.account ?? 'Cash',
    transaction.category ?? '',
    transaction.description,
    transaction.notes ?? '',
  ].map(escapeField).join('\t'))

  return [LEDGER_FILE_HEADER, columns.join('\t'), ...rows, ''].join('\n')
}

export function parseTransactionsFile(contents: string): Transaction[] {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== LEDGER_FILE_HEADER) {
    throw new Error('This is not a B-Counting ledger file.')
  }

  const columns = lines[1]?.split('\t') ?? []
  const required = ['id', 'createdAt', 'type', 'amount', 'currency', 'category', 'description']
  if (!required.every((column) => columns.includes(column))) {
    throw new Error('The ledger file is missing required columns.')
  }

  return lines.slice(2).filter((line) => line.trim() !== '').map((line, rowIndex) => {
    const fields = splitEscapedFields(line)
    const value = Object.fromEntries(columns.map((column, index) => [column, fields[index] ?? '']))
    const transaction: Transaction = {
      id: value.id,
      createdAt: value.createdAt,
      type: value.type as Transaction['type'],
      amount: value.amount,
      currency: value.currency,
      category: value.category || null,
      description: value.description,
      transactionDate: value.transactionDate || value.createdAt.slice(0, 10),
      account: value.account || 'Cash',
      notes: value.notes || '',
    }

    if (!isTransaction(transaction)) {
      throw new Error(`Ledger row ${rowIndex + 3} is not valid.`)
    }
    return transaction
  })
}

function escapeField(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n').replaceAll('\r', '\\r')
}

function splitEscapedFields(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let escaped = false

  for (const character of line) {
    if (escaped) {
      field += character === 't' ? '\t' : character === 'n' ? '\n' : character === 'r' ? '\r' : character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '\t') {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }
  if (escaped) field += '\\'
  fields.push(field)
  return fields
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
