import type { Transaction } from './transaction-flow.ts'

export interface FinancialAccount {
  id: string
  name: string
  type: 'bank' | 'cash'
  currency: string
  openingBalance: string
}

export interface FixedAsset {
  id: string
  name: string
  purchaseDate: string
  cost: string
  currency: string
  paymentAccount: string
  usefulLifeYears: number
  residualValue: string
}

export interface RefundableDeposit {
  id: string
  name: string
  paidDate: string
  amount: string
  currency: string
  paymentAccount: string
  status: 'active' | 'returned' | 'written-off'
}

export interface AccountTransfer {
  id: string
  date: string
  fromAccount: string
  toAccount: string
  amount: string
  currency: string
}

export interface AccountingRecords {
  accounts: FinancialAccount[]
  assets: FixedAsset[]
  deposits: RefundableDeposit[]
  transfers: AccountTransfer[]
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const ACCOUNTING_RECORDS_KEY = 'b-counting.accounting-records.v1'
export const emptyAccountingRecords = (): AccountingRecords => ({
  accounts: [], assets: [], deposits: [], transfers: [],
})

export function loadAccountingRecords(storage: StorageLike): AccountingRecords {
  try {
    const parsed = JSON.parse(storage.getItem(ACCOUNTING_RECORDS_KEY) ?? '{}') as Partial<AccountingRecords>
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts.filter(validAccount) : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets.filter(validAsset) : [],
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits.filter(validDeposit) : [],
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers.filter(validTransfer) : [],
    }
  } catch {
    return emptyAccountingRecords()
  }
}

export function saveAccountingRecords(storage: StorageLike, records: AccountingRecords): boolean {
  try {
    storage.setItem(ACCOUNTING_RECORDS_KEY, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

export function accountBalances(
  records: AccountingRecords,
  transactions: readonly Transaction[],
): Map<string, string> {
  const balances = new Map(records.accounts.map((account) => [account.name, minor(account.openingBalance)]))
  for (const transaction of transactions) {
    const account = transaction.account ?? 'Cash'
    if (!balances.has(account)) continue
    const change = transaction.type === 'income' ? minor(transaction.amount) : -minor(transaction.amount)
    balances.set(account, (balances.get(account) ?? 0) + change)
  }
  for (const asset of records.assets) {
    if (balances.has(asset.paymentAccount)) balances.set(asset.paymentAccount, (balances.get(asset.paymentAccount) ?? 0) - minor(asset.cost))
  }
  for (const deposit of records.deposits) {
    if (balances.has(deposit.paymentAccount)) {
      const change = deposit.status === 'returned' ? 0 : -minor(deposit.amount)
      balances.set(deposit.paymentAccount, (balances.get(deposit.paymentAccount) ?? 0) + change)
    }
  }
  for (const transfer of records.transfers) {
    if (balances.has(transfer.fromAccount)) balances.set(transfer.fromAccount, (balances.get(transfer.fromAccount) ?? 0) - minor(transfer.amount))
    if (balances.has(transfer.toAccount)) balances.set(transfer.toAccount, (balances.get(transfer.toAccount) ?? 0) + minor(transfer.amount))
  }
  return new Map([...balances].map(([name, balance]) => [name, format(balance)]))
}

export function currentBookValue(asset: FixedAsset, asOf = new Date()): string {
  const elapsedYears = Math.max(0, (asOf.getTime() - new Date(`${asset.purchaseDate}T00:00:00`).getTime()) / 31_557_600_000)
  const cost = minor(asset.cost)
  const residual = minor(asset.residualValue)
  const depreciation = Math.min(cost - residual, Math.round(((cost - residual) / asset.usefulLifeYears) * elapsedYears))
  return format(cost - depreciation)
}

function minor(value: string): number {
  const [major = '0', decimals = '00'] = value.split('.')
  return Number(major) * 100 + Number(decimals.padEnd(2, '0').slice(0, 2))
}

function format(value: number): string {
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function validAccount(value: unknown): value is FinancialAccount { return record(value) && typeof value.id === 'string' && typeof value.name === 'string' && (value.type === 'bank' || value.type === 'cash') && typeof value.currency === 'string' && typeof value.openingBalance === 'string' }
function validAsset(value: unknown): value is FixedAsset { return record(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.purchaseDate === 'string' && typeof value.cost === 'string' && typeof value.currency === 'string' && typeof value.paymentAccount === 'string' && typeof value.usefulLifeYears === 'number' && typeof value.residualValue === 'string' }
function validDeposit(value: unknown): value is RefundableDeposit { return record(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.paidDate === 'string' && typeof value.amount === 'string' && typeof value.currency === 'string' && typeof value.paymentAccount === 'string' && (value.status === 'active' || value.status === 'returned' || value.status === 'written-off') }
function validTransfer(value: unknown): value is AccountTransfer { return record(value) && typeof value.id === 'string' && typeof value.date === 'string' && typeof value.fromAccount === 'string' && typeof value.toAccount === 'string' && typeof value.amount === 'string' && typeof value.currency === 'string' }
