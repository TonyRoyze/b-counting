import { speakableAmount, type FlowResponse, type Transaction } from './transaction-flow.ts'

type RecentStep = 'list' | 'detail' | 'remove'

export interface RecentFlowResponse extends FlowResponse {
  editTransaction?: Transaction
  removedTransactionId?: string
}

export class RecentTransactionsFlow {
  private readonly transactions: readonly Transaction[]
  private readonly labels: readonly string[]
  private readonly spokenLabels: readonly string[]
  private step: RecentStep = 'list'
  private selectedTransaction: Transaction | null = null

  constructor(transactions: readonly Transaction[], limit = 10) {
    this.transactions = [...transactions]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
    this.labels = this.transactions.map(transactionLabel)
    this.spokenLabels = this.transactions.map(spokenTransactionLabel)
  }

  start(): RecentFlowResponse {
    if (this.transactions.length === 0) {
      return {
        lines: ['There are no saved transactions yet.'],
        announcement: 'There are no saved transactions yet.',
        done: true,
      }
    }

    return {
      lines: [`Showing ${this.transactions.length} most recent transactions.`],
      announcement: `${this.transactions.length} recent transaction${this.transactions.length === 1 ? '' : 's'}.`,
      prompt: 'Choose a transaction. Use the Arrow keys, then press Enter:',
      options: this.labels,
      spokenOptions: this.spokenLabels,
      announceOptions: false,
    }
  }

  submit(rawInput: string): RecentFlowResponse {
    const input = rawInput.trim()

    if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'finish') {
      return this.cancel()
    }

    if (this.step === 'remove') {
      if (input.toLowerCase() === 'remove') {
        return {
          lines: ['Transaction removed.'],
          announcement: 'Transaction removed.',
          removedTransactionId: this.selectedTransaction?.id,
          done: true,
        }
      }

      if (input.toLowerCase() === 'keep' || input.toLowerCase() === 'back') {
        this.step = 'detail'
        return this.detailResponse()
      }

      return {
        lines: ['Choose Remove or Keep.'],
        prompt: 'Remove this transaction?',
        options: ['Remove', 'Keep'],
        error: true,
      }
    }

    if (this.step === 'detail') {
      if (input.toLowerCase() === 'edit') {
        return {
          lines: ['Editing the selected transaction.'],
          editTransaction: this.selectedTransaction ?? undefined,
          done: true,
        }
      }

      if (input.toLowerCase() === 'remove') {
        this.step = 'remove'
        return {
          lines: ['This will remove the selected transaction.'],
          announcement: 'This will remove the selected transaction.',
          prompt: 'Remove this transaction?',
          options: ['Remove', 'Keep'],
        }
      }

      if (input.toLowerCase() === 'back') {
        this.step = 'list'
        return {
          lines: [],
          prompt: 'Choose a transaction. Use the Arrow keys, then press Enter:',
          options: this.labels,
          spokenOptions: this.spokenLabels,
          announceOptions: false,
        }
      }

      return {
        lines: ['Choose Edit, Remove, Back, or Finish.'],
        prompt: 'What would you like to do?',
        options: ['Edit', 'Remove', 'Back', 'Finish'],
        error: true,
      }
    }

    const index = this.labels.findIndex((label) => label === input)
    const transaction = this.transactions[index]

    if (!transaction) {
      return {
        lines: ['Choose one of the listed transactions.'],
        prompt: 'Choose a transaction to hear its details:',
        options: this.labels,
        spokenOptions: this.spokenLabels,
        announceOptions: false,
        error: true,
      }
    }

    this.selectedTransaction = transaction
    this.step = 'detail'
    return this.detailResponse()
  }

  cancel(): RecentFlowResponse {
    return { lines: ['Finished reviewing recent transactions.'], done: true }
  }

  private detailResponse(): RecentFlowResponse {
    if (!this.selectedTransaction) {
      return this.cancel()
    }

    const details = transactionDetails(this.selectedTransaction)
    return {
      lines: details.visible,
      announcement: details.spoken,
      prompt: 'Choose Edit, Remove, Back, or Finish:',
      options: ['Edit', 'Remove', 'Back', 'Finish'],
      announceOptions: false,
    }
  }
}

export function transactionLabel(transaction: Transaction): string {
  const date = formatDate(transaction.transactionDate ?? transaction.createdAt)
  const type = capitalize(transaction.type)
  return `${date} · ${type} · ${transaction.amount} ${transaction.currency} · ${transaction.description}`
}

export function spokenTransactionLabel(transaction: Transaction): string {
  return `${capitalize(transaction.type)}, ${speakableAmount(transaction.amount, transaction.currency)}, ${transaction.description}`
}

export function transactionDetails(transaction: Transaction): {
  visible: string[]
  spoken: string
} {
  const type = capitalize(transaction.type)
  const date = formatDate(transaction.transactionDate ?? transaction.createdAt)
  const category = transaction.category ?? 'Uncategorized'
  const account = transaction.account ?? 'Cash'
  const notes = transaction.notes?.trim()

  return {
    visible: [
      `${type} · ${transaction.amount} ${transaction.currency}`,
      transaction.description,
      `Category: ${category}`,
      `Account: ${account}`,
      `Date: ${date}`,
      ...(notes ? [`Notes: ${notes}`] : []),
    ],
    spoken: `${type}, ${speakableAmount(transaction.amount, transaction.currency)}, for ${transaction.description}, on ${date}.`,
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
