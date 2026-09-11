import { parseTransactionsFile, serializeTransactions } from './transaction-storage.ts'
import type { Transaction } from './transaction-flow.ts'

export const LEDGER_PATH_KEY = 'b-counting.ledger-path.v1'

export function loadLedgerPath(storage: Pick<Storage, 'getItem'>): string {
  return storage.getItem(LEDGER_PATH_KEY)?.trim() ?? ''
}

export function saveLedgerPath(storage: Pick<Storage, 'setItem'>, path: string): boolean {
  try {
    storage.setItem(LEDGER_PATH_KEY, path.trim())
    return true
  } catch {
    return false
  }
}

export function isDesktopRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core')
  return api.invoke<T>(command, args)
}

export async function chooseLedgerPath(): Promise<string | null> {
  return invoke<string | null>('choose_ledger_file')
}

export async function readLedger(path: string): Promise<Transaction[] | null> {
  const contents = await invoke<string | null>('read_ledger_file', { path })
  return contents === null || contents.trim() === '' ? null : parseTransactionsFile(contents)
}

export async function writeLedger(path: string, transactions: readonly Transaction[]): Promise<void> {
  await invoke('write_ledger_file', { path, contents: serializeTransactions(transactions) })
}

export function downloadLedger(transactions: readonly Transaction[]): void {
  const blob = new Blob([serializeTransactions(transactions)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `b-counting-ledger-${new Date().toISOString().slice(0, 10)}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
