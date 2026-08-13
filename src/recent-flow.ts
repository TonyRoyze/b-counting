import { speakableAmount, type FlowResponse, type Transaction } from './transaction-flow.ts'

type RecentStep = 'list' | 'detail'

export class RecentTransactionsFlow {
  private readonly transactions: readonly Transaction[]
  private readonly labels: readonly string[]
  private step: RecentStep = 'list'

  constructor(transactions: readonly Transaction[], limit = 10) {
    this.transactions = [...transactions]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
    this.labels = this.transactions.map(transactionLabel)
  }

  start(): FlowResponse {
    if (this.transactions.length === 0) {
      return {
        lines: ['There are no saved transactions yet.'],
        announcement: 'There are no saved transactions yet. Ready for your next action.',
        done: true,
      }
    }

    return {
      lines: [`Showing ${this.transactions.length} most recent transactions.`],
      announcement: `${this.transactions.length} recent transactions. The newest is selected.`,
      prompt: 'Choose a transaction to hear its details:',
      options: this.labels,
    }
  }

  submit(rawInput: string): FlowResponse {
    const input = rawInput.trim()

    if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'finish') {
      return this.cancel()
    }

    if (this.step === 'detail') {
      if (input.toLowerCase() === 'back') {
        this.step = 'list'
        return {
          lines: [],
          prompt: 'Choose a transaction to hear its details:',
          options: this.labels,
        }
      }

      return {
        lines: ['Choose Back or Finish.'],
        prompt: 'What would you like to do?',
        options: ['Back', 'Finish'],
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
        error: true,
      }
    }

    this.step = 'detail'
    const details = transactionDetails(transaction)
    return {
      lines: details.visible,
      announcement: details.spoken,
      prompt: 'What would you like to do?',
      options: ['Back', 'Finish'],
    }
  }

  cancel(): FlowResponse {
    return { lines: ['Finished reviewing recent transactions.'], done: true }
  }
}

export function transactionLabel(transaction: Transaction): string {
  const date = formatDate(transaction.createdAt)
  const type = capitalize(transaction.type)
  return `${date} · ${type} · ${transaction.amount} ${transaction.currency} · ${transaction.description}`
}

export function transactionDetails(transaction: Transaction): {
  visible: string[]
  spoken: string
} {
  const type = capitalize(transaction.type)
  const date = formatDate(transaction.createdAt)
  const category = transaction.category ?? 'Uncategorized'

  return {
    visible: [
      `${type} · ${transaction.amount} ${transaction.currency}`,
      transaction.description,
      `Category: ${category}`,
      `Date: ${date}`,
      `Reference: ${transaction.id}`,
    ],
    spoken: `${type} of ${speakableAmount(transaction.amount, transaction.currency)}. ${transaction.description}. Category ${category}. Saved ${date}. Reference ${transaction.id}.`,
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
