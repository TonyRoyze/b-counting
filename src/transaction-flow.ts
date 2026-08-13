export type TransactionType = 'income' | 'expense'

export interface TransactionDraft {
  type?: TransactionType
  amount?: string
  description?: string
  category?: string
}

export interface Transaction extends Required<Omit<TransactionDraft, 'category'>> {
  id: string
  category: string | null
  currency: string
  createdAt: string
}

type FlowStep = 'type' | 'amount' | 'description' | 'category' | 'review' | 'edit'

export interface FlowResponse {
  lines: string[]
  prompt?: string
  step?: string
  done?: boolean
  savedDraft?: TransactionDraft
  error?: boolean
}

const prompts: Record<FlowStep, string> = {
  type: 'Transaction type (income or expense):',
  amount: 'Amount:',
  description: 'Description:',
  category: 'Category (optional — press Enter to skip):',
  review: 'Save this transaction? (save, edit, or cancel):',
  edit: 'What would you like to edit? (type, amount, description, or category):',
}

export class NewTransactionFlow {
  private step: FlowStep = 'type'
  private draft: TransactionDraft = {}
  private editing = false
  private readonly currency: string

  constructor(currency = 'LKR') {
    this.currency = currency
  }

  start(): FlowResponse {
    return this.nextPrompt(['Starting a new transaction. Type “cancel” at any time to stop.'])
  }

  submit(rawInput: string): FlowResponse {
    const input = rawInput.trim()

    if (input.toLowerCase() === 'cancel') {
      return this.cancel()
    }

    switch (this.step) {
      case 'type':
        return this.acceptType(input)
      case 'amount':
        return this.acceptAmount(input)
      case 'description':
        return this.acceptDescription(input)
      case 'category':
        return this.acceptCategory(input)
      case 'review':
        return this.acceptReview(input)
      case 'edit':
        return this.acceptEdit(input)
    }
  }

  cancel(): FlowResponse {
    return { lines: ['New transaction cancelled.'], done: true }
  }

  private acceptType(input: string): FlowResponse {
    const normalizedType = input.toLowerCase()
    const type = normalizedType === 'i' ? 'income' : normalizedType === 'e' ? 'expense' : normalizedType

    if (type !== 'income' && type !== 'expense') {
      return this.invalid('Enter “income” or “expense”.')
    }

    this.draft.type = type
    return this.advanceAfterValue('amount', [`${capitalize(type)} selected.`])
  }

  private acceptAmount(input: string): FlowResponse {
    const amount = normalizeAmount(input)

    if (!amount) {
      return this.invalid('Enter an amount greater than zero, for example 1250.50.')
    }

    this.draft.amount = amount
    return this.advanceAfterValue('description', [`Amount ${amount}.`])
  }

  private acceptDescription(input: string): FlowResponse {
    if (input.length === 0) {
      return this.invalid('Description is required.')
    }

    if (input.length > 120) {
      return this.invalid('Description must be 120 characters or fewer.')
    }

    this.draft.description = input
    return this.advanceAfterValue('category', [])
  }

  private acceptCategory(input: string): FlowResponse {
    if (input.length > 60) {
      return this.invalid('Category must be 60 characters or fewer.')
    }

    this.draft.category = input
    this.editing = false
    this.step = 'review'
    return this.nextPrompt(['Review:', this.summary()])
  }

  private acceptReview(input: string): FlowResponse {
    switch (input.toLowerCase()) {
      case 'save':
      case 'yes':
      case 'y':
        return {
          lines: ['Transaction saved in this session.', this.summary()],
          savedDraft: { ...this.draft },
          done: true,
        }
      case 'edit':
      case 'e':
        this.step = 'edit'
        return this.nextPrompt([])
      case 'cancel':
      case 'no':
      case 'n':
        return this.cancel()
      default:
        return this.invalid('Enter “save”, “edit”, or “cancel”.')
    }
  }

  private acceptEdit(input: string): FlowResponse {
    const field = input.toLowerCase()

    if (!['type', 'amount', 'description', 'category'].includes(field)) {
      return this.invalid('Enter “type”, “amount”, “description”, or “category”.')
    }

    this.step = field as Exclude<FlowStep, 'review' | 'edit'>
    this.editing = true
    return this.nextPrompt([`Editing ${field}.`])
  }

  private summary(): string {
    const type = capitalize(this.draft.type ?? '')
    const category = this.draft.category || 'Uncategorized'
    return `${type} · ${this.draft.amount} ${this.currency} · ${this.draft.description} · ${category}`
  }

  private invalid(message: string): FlowResponse {
    return { ...this.nextPrompt([message]), error: true }
  }

  private advanceAfterValue(nextStep: FlowStep, lines: string[]): FlowResponse {
    if (this.editing) {
      this.editing = false
      this.step = 'review'
      return this.nextPrompt([...lines, 'Updated review:', this.summary()])
    }

    this.step = nextStep
    return this.nextPrompt(lines)
  }

  private nextPrompt(lines: string[]): FlowResponse {
    const order: Record<FlowStep, string> = {
      type: 'step 1 of 5',
      amount: 'step 2 of 5',
      description: 'step 3 of 5',
      category: 'step 4 of 5',
      review: 'step 5 of 5',
      edit: 'edit',
    }

    return { lines, prompt: prompts[this.step], step: order[this.step] }
  }
}

export function createTransaction(
  draft: TransactionDraft,
  sequence: number,
  currency = 'LKR',
): Transaction {
  if (!draft.type || !draft.amount || !draft.description) {
    throw new Error('Cannot save an incomplete transaction.')
  }

  const now = new Date()
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')

  return {
    type: draft.type,
    amount: draft.amount,
    description: draft.description,
    category: draft.category || null,
    currency,
    id: `${date}-${String(sequence).padStart(3, '0')}`,
    createdAt: now.toISOString(),
  }
}

export function normalizeAmount(input: string): string | null {
  const normalized = input.replaceAll(',', '').trim()

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const [whole = '', fraction = ''] = normalized.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fraction.padEnd(2, '0')

  if (/^0+$/.test(normalizedWhole) && /^0*$/.test(normalizedFraction)) {
    return null
  }

  return `${normalizedWhole}.${normalizedFraction}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
