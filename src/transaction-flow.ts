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

type FlowStep =
  | 'type'
  | 'amount'
  | 'description'
  | 'category'
  | 'new-category'
  | 'review'
  | 'edit'

export interface FlowResponse {
  lines: string[]
  announcement?: string
  prompt?: string
  step?: string
  done?: boolean
  savedDraft?: TransactionDraft
  error?: boolean
  options?: readonly string[]
}

export const incomeCategories = ['Salary', 'Other income'] as const
export const expenseCategories = [
  'Food',
  'Housing',
  'Utilities',
  'Transport',
  'Health',
  'Education',
  'Entertainment',
  'Other expense',
] as const

const uncategorizedOption = 'Uncategorized'
const addCategoryOption = 'Add new category…'
const reviewOptions = ['Save', 'Edit', 'Cancel'] as const

const prompts: Record<FlowStep, string> = {
  type: 'Transaction type (income or expense):',
  amount: 'Amount:',
  description: 'Description:',
  category: 'Choose a category. Use Up and Down Arrow, then press Enter:',
  'new-category': 'New category name:',
  review: 'Choose an action. Use Up and Down Arrow, then press Enter:',
  edit: 'What would you like to edit? (type, amount, description, or category):',
}

export class NewTransactionFlow {
  private step: FlowStep = 'type'
  private draft: TransactionDraft = {}
  private editing = false
  private readonly currency: string
  private readonly customCategories: readonly string[]

  constructor(currency = 'LKR', customCategories: readonly string[] = []) {
    this.currency = currency
    this.customCategories = customCategories
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
      case 'new-category':
        return this.acceptNewCategory(input)
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
    return this.advanceAfterValue(
      'description',
      [`Amount ${amount} ${this.currency}.`],
      `Amount ${speakableAmount(amount, this.currency)}.`,
    )
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
    const options = this.categoryOptions()
    const numberedOption = /^\d+$/.test(input) ? options[Number(input) - 1] : undefined
    const selectedOption = numberedOption ?? options.find(
      (option) => option.toLowerCase() === input.toLowerCase(),
    )

    if (!selectedOption) {
      return this.invalid('Choose a listed category by name or number.')
    }

    if (selectedOption === addCategoryOption) {
      this.step = 'new-category'
      return this.nextPrompt([])
    }

    this.draft.category = selectedOption === uncategorizedOption ? '' : selectedOption
    this.editing = false
    this.step = 'review'
    return this.nextPrompt(
      ['Review:', this.summary()],
      `Review. ${this.spokenSummary()}`,
    )
  }

  private acceptNewCategory(input: string): FlowResponse {
    if (input.length === 0) {
      return this.invalid('Category name is required.')
    }

    if (input.length > 60) {
      return this.invalid('Category must be 60 characters or fewer.')
    }

    const existingCategory = this.categoryOptions().find(
      (category) => category.toLowerCase() === input.toLowerCase(),
    )

    if (existingCategory) {
      return this.invalid('That category already exists. Enter a different name.')
    }

    this.draft.category = input
    this.editing = false
    this.step = 'review'
    return this.nextPrompt(
      ['Category created.', 'Review:', this.summary()],
      `Category created. Review. ${this.spokenSummary()}`,
    )
  }

  private acceptReview(input: string): FlowResponse {
    switch (input.toLowerCase()) {
      case 'save':
      case 'yes':
      case 'y':
        return {
          lines: ['Transaction saved in this session.', this.summary()],
          announcement: `Transaction saved in this session. ${this.spokenSummary()}`,
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

  private spokenSummary(): string {
    const type = capitalize(this.draft.type ?? '')
    const category = this.draft.category || 'Uncategorized'
    return `${type} of ${speakableAmount(this.draft.amount ?? '0.00', this.currency)}. ${this.draft.description}. Category ${category}.`
  }

  private invalid(message: string): FlowResponse {
    return { ...this.nextPrompt([message]), error: true }
  }

  private advanceAfterValue(
    nextStep: FlowStep,
    lines: string[],
    announcement?: string,
  ): FlowResponse {
    if (this.editing) {
      this.editing = false
      this.step = 'review'
      return this.nextPrompt(
        [...lines, 'Updated review:', this.summary()],
        `Updated review. ${this.spokenSummary()}`,
      )
    }

    this.step = nextStep
    return this.nextPrompt(lines, announcement)
  }

  private nextPrompt(lines: string[], announcement?: string): FlowResponse {
    const order: Record<FlowStep, string> = {
      type: 'step 1 of 5',
      amount: 'step 2 of 5',
      description: 'step 3 of 5',
      category: 'step 4 of 5',
      'new-category': 'step 4 of 5',
      review: 'step 5 of 5',
      edit: 'edit',
    }

    return {
      lines,
      announcement,
      prompt: prompts[this.step],
      step: order[this.step],
      options:
        this.step === 'category'
          ? this.categoryOptions()
          : this.step === 'review'
            ? reviewOptions
            : undefined,
    }
  }

  private categoryOptions(): readonly string[] {
    const defaults = this.draft.type === 'income' ? incomeCategories : expenseCategories
    const uniqueCustomCategories = this.customCategories.filter(
      (category, index, categories) =>
        categories.findIndex((item) => item.toLowerCase() === category.toLowerCase()) === index &&
        !defaults.some((item) => item.toLowerCase() === category.toLowerCase()),
    )

    return [...defaults, ...uniqueCustomCategories, uncategorizedOption, addCategoryOption]
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

export function speakableAmount(amount: string, currency: string): string {
  const [major = '0', minor = '00'] = amount.split('.')
  const normalizedMinor = minor.padEnd(2, '0').slice(0, 2)
  const currencyUnits: Record<string, { major: [string, string]; minor: [string, string] }> = {
    LKR: { major: ['rupee', 'rupees'], minor: ['cent', 'cents'] },
    USD: { major: ['dollar', 'dollars'], minor: ['cent', 'cents'] },
    EUR: { major: ['euro', 'euros'], minor: ['cent', 'cents'] },
    GBP: { major: ['pound', 'pounds'], minor: ['penny', 'pence'] },
  }
  const units = currencyUnits[currency]

  if (!units) {
    return `${amount} ${currency}`
  }

  const parts: string[] = []

  if (major !== '0') {
    parts.push(`${major} ${major === '1' ? units.major[0] : units.major[1]}`)
  }

  if (normalizedMinor !== '00') {
    const readableMinor = normalizedMinor.replace(/^0/, '')
    parts.push(
      `${readableMinor} ${readableMinor === '1' ? units.minor[0] : units.minor[1]}`,
    )
  }

  return parts.join(' and ') || `0 ${units.major[1]}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
