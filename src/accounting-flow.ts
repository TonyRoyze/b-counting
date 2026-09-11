import type { AccountingRecords } from './accounting-records.ts'
import { normalizeAmount, type FlowResponse } from './transaction-flow.ts'

export type AccountingFlowKind = 'account' | 'asset' | 'deposit' | 'transfer'
type Step = 'name' | 'account-type' | 'currency' | 'opening' | 'date' | 'amount' | 'payment' | 'life' | 'residual' | 'from' | 'to'

export interface AccountingFlowResponse extends FlowResponse {
  records?: AccountingRecords
}

export class AccountingRecordFlow {
  private step: Step
  private readonly draft: Record<string, string> = {}
  private readonly kind: AccountingFlowKind
  private readonly records: AccountingRecords
  private readonly defaultCurrency: string

  constructor(
    kind: AccountingFlowKind,
    records: AccountingRecords,
    defaultCurrency: string,
  ) {
    this.kind = kind
    this.records = records
    this.defaultCurrency = defaultCurrency
    this.step = kind === 'transfer' ? 'from' : 'name'
  }

  start(): AccountingFlowResponse {
    if (this.kind !== 'account' && this.records.accounts.length === 0) {
      return { lines: ['Add a bank or cash account first. Type accounts.'], announcement: 'Add a bank or cash account first.', done: true }
    }
    return this.response([`Add ${label(this.kind)}.`])
  }

  submit(rawInput: string): AccountingFlowResponse {
    const input = rawInput.trim()
    if (input.toLowerCase() === 'cancel') return { lines: ['Cancelled.'], done: true }

    if (this.step === 'name') {
      if (!input || input.length > 60) return this.invalid('Enter a name between 1 and 60 characters.')
      this.draft.name = input
      this.step = this.kind === 'account' ? 'account-type' : 'date'
      return this.response([])
    }
    if (this.step === 'account-type') {
      if (!['Bank', 'Cash'].includes(input)) return this.invalid('Choose Bank or Cash.')
      this.draft.type = input.toLowerCase()
      this.step = 'currency'
      return this.response([])
    }
    if (this.step === 'currency') {
      if (!/^[A-Za-z]{3}$/.test(input)) return this.invalid('Enter a three-letter currency code, such as LKR or USD.')
      this.draft.currency = input.toUpperCase()
      this.step = 'opening'
      return this.response([])
    }
    if (this.step === 'opening') return this.acceptMoney(input, 'openingBalance', () => this.saveAccount())
    if (this.step === 'date') {
      if (!validDate(input)) return this.invalid('Enter a real date as YYYY-MM-DD.')
      this.draft.date = input
      this.step = 'amount'
      return this.response([])
    }
    if (this.step === 'amount') return this.acceptMoney(input, 'amount', () => {
      if (this.kind === 'transfer') return this.saveTransfer()
      this.step = 'payment'
      return this.response([])
    })
    if (this.step === 'payment' || this.step === 'from' || this.step === 'to') {
      const account = this.records.accounts.find((item) => item.name === input)
      if (!account) return this.invalid('Choose a listed account.')
      this.draft[this.step] = account.name
      this.draft.currency = account.currency
      if (this.step === 'from') { this.step = 'to'; return this.response([]) }
      if (this.step === 'to') {
        if (input === this.draft.from) return this.invalid('Choose a different destination account.')
        if (account.currency !== this.draft.currency) return this.invalid('Choose an account using the same currency.')
        this.step = 'date'; return this.response([])
      }
      if (this.kind === 'asset') { this.step = 'life'; return this.response([]) }
      return this.saveDeposit()
    }
    if (this.step === 'life') {
      const years = Number(input)
      if (!Number.isInteger(years) || years < 1 || years > 100) return this.invalid('Enter useful life as a whole number from 1 to 100 years.')
      this.draft.life = String(years)
      this.step = 'residual'
      return this.response([])
    }
    return this.acceptMoney(input, 'residual', () => this.saveAsset())
  }

  cancel(): AccountingFlowResponse { return { lines: ['Cancelled.'], done: true } }

  private acceptMoney(input: string, field: string, next: () => AccountingFlowResponse): AccountingFlowResponse {
    const amount = normalizeAmount(input)
    if (!amount) return this.invalid('Enter a valid amount, such as 1500 or 1500.50.')
    this.draft[field] = amount
    return next()
  }

  private saveAccount(): AccountingFlowResponse {
    if (this.records.accounts.some((account) => account.name.toLowerCase() === this.draft.name?.toLowerCase())) return this.invalid('An account with that name already exists.')
    this.records.accounts.push({ id: id('account'), name: this.draft.name!, type: this.draft.type as 'bank' | 'cash', currency: this.draft.currency!, openingBalance: this.draft.openingBalance! })
    return this.saved(`${this.draft.name} account added.`)
  }

  private saveAsset(): AccountingFlowResponse {
    this.records.assets.push({ id: id('asset'), name: this.draft.name!, purchaseDate: this.draft.date!, cost: this.draft.amount!, currency: this.draft.currency!, paymentAccount: this.draft.payment!, usefulLifeYears: Number(this.draft.life), residualValue: this.draft.residual! })
    return this.saved(`${this.draft.name} fixed asset added.`)
  }

  private saveDeposit(): AccountingFlowResponse {
    this.records.deposits.push({ id: id('deposit'), name: this.draft.name!, paidDate: this.draft.date!, amount: this.draft.amount!, currency: this.draft.currency!, paymentAccount: this.draft.payment!, status: 'active' })
    return this.saved(`${this.draft.name} deposit added.`)
  }

  private saveTransfer(): AccountingFlowResponse {
    this.records.transfers.push({ id: id('transfer'), date: this.draft.date!, fromAccount: this.draft.from!, toAccount: this.draft.to!, amount: this.draft.amount!, currency: this.draft.currency! })
    return this.saved(`Transfer from ${this.draft.from} to ${this.draft.to} recorded.`)
  }

  private saved(message: string): AccountingFlowResponse { return { lines: [message], announcement: message, records: this.records, done: true } }
  private invalid(message: string): AccountingFlowResponse { return { ...this.response([message]), error: true } }

  private response(lines: string[]): AccountingFlowResponse {
    const accountNames = this.records.accounts.map((account) => account.name)
    const prompts: Record<Step, string> = {
      name: `${capitalize(label(this.kind))} name:`, 'account-type': 'Choose account type:', currency: `Currency code (${this.defaultCurrency}):`, opening: 'Opening balance:', date: this.kind === 'transfer' ? 'Transfer date (YYYY-MM-DD):' : 'Date paid or purchased (YYYY-MM-DD):', amount: 'Amount:', payment: 'Choose the payment account:', life: 'Useful life in years:', residual: 'Expected residual value:', from: 'Choose the account money leaves:', to: 'Choose the account money enters:',
    }
    const options = this.step === 'account-type' ? ['Bank', 'Cash'] : ['payment', 'from', 'to'].includes(this.step) ? accountNames : undefined
    return { lines, prompt: prompts[this.step], options }
  }
}

function label(kind: AccountingFlowKind): string { return kind === 'account' ? 'financial account' : kind === 'asset' ? 'fixed asset' : kind === 'deposit' ? 'refundable deposit' : 'account transfer' }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1) }
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function id(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
