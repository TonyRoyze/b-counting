import type { TransactionType } from './transaction-flow'

export interface CustomCategory {
  name: string
  type: TransactionType
}

export interface CategoryCatalog {
  custom: CustomCategory[]
  usage: Record<string, number>
  archived: string[]
}

interface CategoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const CATEGORIES_KEY = 'b-counting.categories.v1'

export function loadCategoryCatalog(storage: CategoryStorage): CategoryCatalog {
  try {
    const stored = storage.getItem(CATEGORIES_KEY)
    return stored ? sanitizeCategoryCatalog(JSON.parse(stored) as unknown) : emptyCatalog()
  } catch {
    return emptyCatalog()
  }
}

export function saveCategoryCatalog(
  storage: CategoryStorage,
  catalog: CategoryCatalog,
): boolean {
  try {
    storage.setItem(CATEGORIES_KEY, JSON.stringify(catalog))
    return true
  } catch {
    return false
  }
}

export function addCustomCategory(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): CategoryCatalog {
  const normalizedName = name.trim()
  const exists = catalog.custom.some(
    (category) =>
      category.type === type && category.name.toLowerCase() === normalizedName.toLowerCase(),
  )

  if (!normalizedName || exists) {
    return catalog
  }

  return {
    ...catalog,
    custom: [...catalog.custom, { name: normalizedName, type }],
  }
}

export function renameCategory(
  catalog: CategoryCatalog,
  oldName: string,
  newName: string,
  type: TransactionType,
): CategoryCatalog {
  const normalizedName = newName.trim()

  if (!normalizedName || normalizedName.length > 60) {
    return catalog
  }

  const oldKey = categoryKey(oldName, type)
  const newKey = categoryKey(normalizedName, type)
  const customIndex = catalog.custom.findIndex(
    (category) => category.type === type && category.name.toLowerCase() === oldName.toLowerCase(),
  )
  const withoutNewDuplicate = catalog.custom.filter(
    (category, index) =>
      index === customIndex ||
      category.type !== type ||
      category.name.toLowerCase() !== normalizedName.toLowerCase(),
  )
  const custom = customIndex >= 0
    ? withoutNewDuplicate.map((category, index) =>
        index === customIndex ? { ...category, name: normalizedName } : category,
      )
    : [...withoutNewDuplicate, { name: normalizedName, type }]
  const usage = { ...catalog.usage }
  usage[newKey] = (usage[newKey] ?? 0) + (usage[oldKey] ?? 0)
  delete usage[oldKey]

  return {
    custom,
    usage,
    archived: [...new Set([...catalog.archived.filter((key) => key !== newKey), oldKey])],
  }
}

export function archiveCategory(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): CategoryCatalog {
  const key = categoryKey(name, type)
  return catalog.archived.includes(key)
    ? catalog
    : { ...catalog, archived: [...catalog.archived, key] }
}

export function restoreCategory(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): CategoryCatalog {
  const key = categoryKey(name, type)
  return { ...catalog, archived: catalog.archived.filter((item) => item !== key) }
}

export function isCategoryArchived(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): boolean {
  return catalog.archived.includes(categoryKey(name, type))
}

export function archivedCustomCategoriesFor(
  catalog: CategoryCatalog,
  type: TransactionType,
): string[] {
  return catalog.custom
    .filter(
      (category) =>
        category.type === type && isCategoryArchived(catalog, category.name, type),
    )
    .map((category) => category.name)
}

export function recordCategoryUse(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): CategoryCatalog {
  const key = categoryKey(name, type)

  return {
    ...catalog,
    usage: {
      ...catalog.usage,
      [key]: (catalog.usage[key] ?? 0) + 1,
    },
  }
}

export function removeCategoryUse(
  catalog: CategoryCatalog,
  name: string,
  type: TransactionType,
): CategoryCatalog {
  const key = categoryKey(name, type)
  const usage = { ...catalog.usage }
  const nextCount = (usage[key] ?? 0) - 1

  if (nextCount > 0) {
    usage[key] = nextCount
  } else {
    delete usage[key]
  }

  return { ...catalog, usage }
}

export function customCategoriesFor(
  catalog: CategoryCatalog,
  type: TransactionType,
): string[] {
  return catalog.custom
    .filter(
      (category) =>
        category.type === type && !isCategoryArchived(catalog, category.name, type),
    )
    .map((category) => category.name)
}

export function categoryUsageFor(
  catalog: CategoryCatalog,
  type: TransactionType,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(catalog.usage)
      .filter(([key]) => key.startsWith(`${type}:`))
      .map(([key, count]) => [key.slice(type.length + 1), count]),
  )
}

export function sanitizeCategoryCatalog(value: unknown): CategoryCatalog {
  if (!isRecord(value)) {
    return emptyCatalog()
  }

  const custom = Array.isArray(value.custom)
    ? value.custom.filter(isCustomCategory).filter(
        (category, index, categories) =>
          categories.findIndex(
            (item) =>
              item.type === category.type &&
              item.name.toLowerCase() === category.name.toLowerCase(),
          ) === index,
      )
    : []
  const usage: Record<string, number> = {}

  if (isRecord(value.usage)) {
    for (const [key, count] of Object.entries(value.usage)) {
      if (
        /^(income|expense):.+/.test(key) &&
        typeof count === 'number' &&
        Number.isInteger(count) &&
        count >= 0
      ) {
        usage[key] = count
      }
    }
  }

  const archived = Array.isArray(value.archived)
    ? [...new Set(value.archived.filter(
        (key): key is string => typeof key === 'string' && /^(income|expense):.+/.test(key),
      ))]
    : []

  return { custom, usage, archived }
}

function categoryKey(name: string, type: TransactionType): string {
  return `${type}:${name.trim().toLowerCase()}`
}

function emptyCatalog(): CategoryCatalog {
  return { custom: [], usage: {}, archived: [] }
}

function isCustomCategory(value: unknown): value is CustomCategory {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 60 &&
    (value.type === 'income' || value.type === 'expense')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
