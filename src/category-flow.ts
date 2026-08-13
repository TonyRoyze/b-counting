import {
  archiveCategory,
  archivedCustomCategoriesFor,
  customCategoriesFor,
  renameCategory,
  restoreCategory,
  type CategoryCatalog,
} from './categories.ts'
import {
  expenseCategories,
  incomeCategories,
  type FlowResponse,
  type TransactionType,
} from './transaction-flow.ts'

type CategoryStep = 'action' | 'type' | 'category' | 'new-name'
type CategoryAction = 'list' | 'rename' | 'archive' | 'restore'

export interface CategoryFlowResponse extends FlowResponse {
  catalog?: CategoryCatalog
}

const actionOptions = ['List categories', 'Rename category', 'Archive category', 'Restore category', 'Finish'] as const
const typeOptions = ['Income', 'Expense'] as const

export class CategoryManagementFlow {
  private step: CategoryStep = 'action'
  private action: CategoryAction | null = null
  private type: TransactionType | null = null
  private selectedCategory = ''
  private catalog: CategoryCatalog

  constructor(catalog: CategoryCatalog) {
    this.catalog = catalog
  }

  start(): CategoryFlowResponse {
    return this.prompt(['Manage categories. Changes are saved on this device.'])
  }

  submit(rawInput: string): CategoryFlowResponse {
    const input = rawInput.trim()

    if (input.toLowerCase() === 'cancel') {
      return this.cancel()
    }

    switch (this.step) {
      case 'action':
        return this.acceptAction(input)
      case 'type':
        return this.acceptType(input)
      case 'category':
        return this.acceptCategory(input)
      case 'new-name':
        return this.acceptNewName(input)
    }
  }

  cancel(): CategoryFlowResponse {
    return { lines: ['Category management finished.'], done: true }
  }

  private acceptAction(input: string): CategoryFlowResponse {
    const action = input.toLowerCase()

    if (action === 'finish') {
      return this.cancel()
    }

    const actions: Record<string, CategoryAction> = {
      'list categories': 'list',
      'rename category': 'rename',
      'archive category': 'archive',
      'restore category': 'restore',
    }
    this.action = actions[action] ?? null

    if (!this.action) {
      return this.invalid('Choose a listed category action.')
    }

    this.step = 'type'
    return this.prompt([])
  }

  private acceptType(input: string): CategoryFlowResponse {
    const type = input.toLowerCase()

    if (type !== 'income' && type !== 'expense') {
      return this.invalid('Choose Income or Expense.')
    }

    this.type = type

    if (this.action === 'list') {
      const active = this.activeCategories()
      const archived = this.archivedCategories()
      this.reset()
      return this.prompt([
        `${capitalize(type)} categories, ordered by default and usage:`,
        ...(active.length ? active : ['No active categories.']),
        archived.length ? `Archived: ${archived.join(', ')}` : 'Archived: none',
      ])
    }

    const options = this.action === 'restore' ? this.archivedCategories() : this.activeCategories()
    if (options.length === 0) {
      const message = this.action === 'restore'
        ? `No archived ${type} categories.`
        : `No active ${type} categories.`
      this.reset()
      return this.prompt([message])
    }

    this.step = 'category'
    return this.prompt([])
  }

  private acceptCategory(input: string): CategoryFlowResponse {
    const options = this.action === 'restore' ? this.archivedCategories() : this.activeCategories()
    const selected = options.find((option) => option.toLowerCase() === input.toLowerCase())

    if (!selected) {
      return this.invalid('Choose a listed category.')
    }

    this.selectedCategory = selected

    if (this.action === 'rename') {
      this.step = 'new-name'
      return this.prompt([])
    }

    if (!this.type || !this.action) {
      return this.cancel()
    }

    this.catalog = this.action === 'archive'
      ? archiveCategory(this.catalog, selected, this.type)
      : restoreCategory(this.catalog, selected, this.type)
    const message = this.action === 'archive'
      ? `${selected} archived.`
      : `${selected} restored.`
    this.reset()
    return { ...this.prompt([message]), catalog: this.catalog }
  }

  private acceptNewName(input: string): CategoryFlowResponse {
    if (!this.type) {
      return this.cancel()
    }

    if (!input || input.length > 60) {
      return this.invalid('Enter a category name between 1 and 60 characters.')
    }

    if (
      this.activeCategories().some(
        (category) => category.toLowerCase() === input.toLowerCase(),
      )
    ) {
      return this.invalid('That category name already exists.')
    }

    const oldName = this.selectedCategory
    this.catalog = renameCategory(this.catalog, oldName, input, this.type)
    this.reset()
    return {
      ...this.prompt([`${oldName} renamed to ${input}.`]),
      catalog: this.catalog,
    }
  }

  private reset(): void {
    this.step = 'action'
    this.action = null
    this.type = null
    this.selectedCategory = ''
  }

  private activeCategories(): string[] {
    if (!this.type) return []
    const defaults = this.type === 'income' ? [...incomeCategories] : [...expenseCategories]
    return [...defaults, ...customCategoriesFor(this.catalog, this.type)].filter(
      (category) => !this.catalog.archived.includes(`${this.type}:${category.toLowerCase()}`),
    )
  }

  private archivedCategories(): string[] {
    if (!this.type) return []
    const defaults = this.type === 'income' ? [...incomeCategories] : [...expenseCategories]
    const archivedDefaults = defaults.filter((category) =>
      this.catalog.archived.includes(`${this.type}:${category.toLowerCase()}`),
    )
    return [...archivedDefaults, ...archivedCustomCategoriesFor(this.catalog, this.type)]
  }

  private invalid(message: string): CategoryFlowResponse {
    return { ...this.prompt([message]), error: true }
  }

  private prompt(lines: string[]): CategoryFlowResponse {
    const prompts: Record<CategoryStep, string> = {
      action: 'Choose a category action:',
      type: 'Choose transaction type:',
      category: this.action === 'restore' ? 'Choose a category to restore:' : 'Choose a category:',
      'new-name': `New name for ${this.selectedCategory}:`,
    }
    const options = this.step === 'action'
      ? actionOptions
      : this.step === 'type'
        ? typeOptions
        : this.step === 'category'
          ? this.action === 'restore' ? this.archivedCategories() : this.activeCategories()
          : undefined

    return { lines, prompt: prompts[this.step], options }
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
