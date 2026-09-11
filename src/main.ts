import './style.css'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  spokenCommandHelpParagraph,
  suggestCommand,
} from './commands'
import {
  createTransaction,
  NewTransactionFlow,
  type FlowResponse,
  type Transaction,
} from './transaction-flow'
import {
  loadSettings,
  saveSettings,
  type AppSettings,
  type Appearance,
  type Currency,
  type KokoroVoice,
  type SpeechEngine,
  type Verbosity,
} from './settings'
import {
  addCustomCategory,
  categoryUsageFor,
  customCategoriesFor,
  loadCategoryCatalog,
  recordCategoryUse,
  removeCategoryUse,
  saveCategoryCatalog,
  type CategoryCatalog,
} from './categories'
import {
  CategoryManagementFlow,
  type CategoryFlowResponse,
} from './category-flow'
import { RecentTransactionsFlow } from './recent-flow'
import { loadTransactions, saveTransactions } from './transaction-storage'
import { selectionMessages } from './selection-speech'
import { KokoroSpeechEngine, type KokoroStatus } from './kokoro-speech'
import {
  chooseLedgerPath,
  downloadLedger,
  isDesktopRuntime,
  loadLedgerPath,
  readLedger,
  saveLedgerPath,
  writeLedger,
} from './file-storage'
import { financialStatement, spokenFinancialStatement, type FinancialStatement } from './reports'
import {
  accountBalances,
  currentBookValue,
  loadAccountingRecords,
  saveAccountingRecords,
  type AccountingRecords,
} from './accounting-records'
import {
  AccountingRecordFlow,
  type AccountingFlowKind,
  type AccountingFlowResponse,
} from './accounting-flow'

if ('__TAURI_INTERNALS__' in window) {
  document.documentElement.dataset.runtime = 'tauri'
}

const form = requireElement<HTMLFormElement>('#command-form')
const commandInput = requireElement<HTMLInputElement>('#command-input')
const output = requireElement<HTMLElement>('#terminal-output')
const announcer = requireElement<HTMLElement>('#announcer')
const activePrompt = requireElement<HTMLElement>('#active-prompt')
const commandLabel = requireElement<HTMLLabelElement>('label[for="command-input"]')
const flowOptions = requireElement<HTMLUListElement>('#flow-options')
const terminal = requireElement<HTMLElement>('.terminal')
const terminalBody = requireElement<HTMLElement>('#terminal-body')
const settingsPage = requireElement<HTMLElement>('#settings-page')
const settingsForm = requireElement<HTMLFormElement>('#settings-form')
const settingsClose = requireElement<HTMLButtonElement>('#settings-close')
const settingsStatus = requireElement<HTMLElement>('#settings-status')
const readAloudInput = requireElement<HTMLInputElement>('#read-aloud')
const speechEngineInput = requireElement<HTMLSelectElement>('#speech-engine')
const kokoroVoiceInput = requireElement<HTMLSelectElement>('#kokoro-voice')
const kokoroVoiceRow = requireElement<HTMLElement>('#kokoro-voice-row')
const voiceStatus = requireElement<HTMLElement>('#voice-status')
const verbosityInput = requireElement<HTMLSelectElement>('#verbosity')
const speechRateInput = requireElement<HTMLInputElement>('#speech-rate')
const speechRateValue = requireElement<HTMLOutputElement>('#speech-rate-value')
const currencyInput = requireElement<HTMLSelectElement>('#currency')
const appearanceInput = requireElement<HTMLSelectElement>('#appearance')
const ledgerPathInput = requireElement<HTMLInputElement>('#ledger-path')
const ledgerBrowse = requireElement<HTMLButtonElement>('#ledger-browse')
const ledgerConnect = requireElement<HTMLButtonElement>('#ledger-connect')
const ledgerDownload = requireElement<HTMLButtonElement>('#ledger-download')

const commandHistory: string[] = []
const transactions: Transaction[] = loadTransactions(window.localStorage)
let historyIndex = 0
let transactionFlow: NewTransactionFlow | null = null
let categoryFlow: CategoryManagementFlow | null = null
let recentFlow: RecentTransactionsFlow | null = null
let accountingFlow: AccountingRecordFlow | null = null
let editingTransactionId: string | null = null
let currentFlowResponse: FlowResponse | null = null
let selectedOptionIndex = 0
let settings: AppSettings = loadSettings(window.localStorage)
let categoryCatalog: CategoryCatalog = loadCategoryCatalog(window.localStorage)
let accountingRecords: AccountingRecords = loadAccountingRecords(window.localStorage)
let announcementSequence = 0
let announcementTimers: number[] = []
let naturalSpeechQueue: Promise<void> = Promise.resolve()
let naturalVoiceFailed = false
let ledgerPath = loadLedgerPath(window.localStorage)
let ledgerWriteQueue: Promise<void> = Promise.resolve()
let zoomLevel = loadZoomLevel()
const kokoroSpeech = new KokoroSpeechEngine(updateKokoroStatus)

applyZoom()
applySettings()
if (settings.speechEngine === 'kokoro') prepareNaturalVoice()
void initializeLedger()

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const rawInput = commandInput.value
  const input = rawInput.trim()

  if (input === '' && !transactionFlow && !categoryFlow && !recentFlow && !accountingFlow) {
    announce('Type what you would like to do. Type help to hear your choices.')
    commandInput.focus()
    return
  }

  commandInput.value = ''

  if (transactionFlow) {
    continueTransactionFlow(rawInput)
    commandInput.focus()
    return
  }

  if (categoryFlow) {
    continueCategoryFlow(rawInput)
    commandInput.focus()
    return
  }

  if (recentFlow) {
    continueRecentFlow(rawInput)
    commandInput.focus()
    return
  }

  if (accountingFlow) {
    continueAccountingFlow(rawInput)
    commandInput.focus()
    return
  }

  commandHistory.push(input)
  historyIndex = commandHistory.length
  runCommand(input)
  commandInput.focus()
})

commandInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (transactionFlow || categoryFlow || recentFlow || accountingFlow)) {
    event.preventDefault()
    const response = transactionFlow?.cancel() ?? categoryFlow?.cancel() ?? recentFlow?.cancel() ?? accountingFlow?.cancel()
    if (response) appendFlowResponse('cancel', response)
    finishFlow()
    announce('Cancelled. Ready for your next action.')
    return
  }

  if (transactionFlow || categoryFlow || recentFlow || accountingFlow) {
    if (
      currentFlowResponse?.options &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' ? -1 : 1
      const optionCount = currentFlowResponse.options.length
      selectedOptionIndex = (selectedOptionIndex + direction + optionCount) % optionCount
      renderFlowOptions(currentFlowResponse.options)
      const selected = currentFlowResponse.spokenOptions?.[selectedOptionIndex]
        ?? currentFlowResponse.options[selectedOptionIndex]
        ?? ''
      announce(`${selected}, ${selectedOptionIndex + 1} of ${optionCount}, selected.`)
    }
    return
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return
  }

  event.preventDefault()

  if (event.key === 'ArrowUp' && historyIndex > 0) {
    historyIndex -= 1
  }

  if (event.key === 'ArrowDown' && historyIndex < commandHistory.length) {
    historyIndex += 1
  }

  commandInput.value = commandHistory[historyIndex] ?? ''
  commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length)
})

terminal.addEventListener('click', (event) => {
  if (!settingsPage.hidden) {
    return
  }

  if (event.target instanceof HTMLInputElement) {
    return
  }

  commandInput.focus()
})

flowOptions.addEventListener('click', (event) => {
  const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null
  const index = option ? Number(option.dataset.index) : Number.NaN

  if (!currentFlowResponse?.options || !Number.isInteger(index)) {
    return
  }

  selectedOptionIndex = index
  renderFlowOptions(currentFlowResponse.options)
  const spokenOption = currentFlowResponse.spokenOptions?.[index]
    ?? currentFlowResponse.options[index]
  announce(`${spokenOption}, ${index + 1} of ${currentFlowResponse.options.length}, selected.`)
  commandInput.focus()
})

settingsClose.addEventListener('click', closeSettings)

ledgerBrowse.addEventListener('click', async () => {
  if (!isDesktopRuntime()) {
    downloadLedger(transactions)
    settingsStatus.textContent = 'Text backup downloaded.'
    return
  }

  try {
    const selectedPath = await chooseLedgerPath()
    if (selectedPath) {
      ledgerPathInput.value = selectedPath
      await connectLedger(selectedPath)
    }
  } catch (error) {
    settingsStatus.textContent = errorMessage(error)
  }
})

ledgerConnect.addEventListener('click', async () => {
  try {
    await connectLedger(ledgerPathInput.value)
  } catch (error) {
    settingsStatus.textContent = errorMessage(error)
  }
})

ledgerDownload.addEventListener('click', () => {
  downloadLedger(transactions)
  settingsStatus.textContent = 'Text backup downloaded.'
})

settingsForm.addEventListener('input', () => {
  speechRateValue.value = `${Number(speechRateInput.value).toFixed(1).replace('.0', '')}×`
})

settingsForm.addEventListener('change', () => {
  const wasReadAloud = settings.readAloud
  const previousSpeechEngine = settings.speechEngine
  settings = {
    readAloud: readAloudInput.checked,
    speechEngine: speechEngineInput.value as SpeechEngine,
    kokoroVoice: kokoroVoiceInput.value as KokoroVoice,
    verbosity: verbosityInput.value as Verbosity,
    speechRate: Number(speechRateInput.value),
    currency: currencyInput.value as Currency,
    appearance: appearanceInput.value as Appearance,
  }

  applySettings()
  const saved = saveSettings(window.localStorage, settings)
  const message = saved ? 'Settings saved on this device.' : 'Settings changed, but could not be saved.'
  settingsStatus.textContent = message

  if (!wasReadAloud && settings.readAloud) {
    if (settings.speechEngine === 'kokoro') {
      speakWithSystem('Read aloud enabled. The natural voice is getting ready.')
      prepareNaturalVoice()
    } else {
      speak('Read aloud enabled. Settings saved on this device.')
    }
  } else if (previousSpeechEngine !== settings.speechEngine) {
    cancelAnnouncements()
    if (settings.speechEngine === 'kokoro') {
      naturalVoiceFailed = false
      if (settings.readAloud) {
        speakWithSystem('Natural voice selected. It is getting ready.')
      }
      prepareNaturalVoice()
    } else if (settings.readAloud) {
      speakWithSystem('System voice selected.')
    }
  }
})

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      changeZoom(10)
      return
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      changeZoom(-10)
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      zoomLevel = 100
      applyZoom(true)
      return
    }
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') {
    event.preventDefault()
    repeatCurrentChoices()
    return
  }

  if (event.key === 'Escape' && !settingsPage.hidden) {
    event.preventDefault()
    closeSettings()
  }
})

function runCommand(input: string): void {
  const parsedCommand = parseCommand(input)

  if (!parsedCommand) {
    const suggestion = suggestCommand(input)
    const message = suggestion
      ? `I did not recognize that. Did you mean “${suggestion}”?`
      : 'I did not recognize that. Type “help” to hear your choices.'

    appendEntry(input, [message], 'error')
    announce(message)
    return
  }

  if (parsedCommand.name === 'clear') {
    output.replaceChildren()
    announce('Previous activity cleared. Ready for your next action.')
    return
  }

  if (parsedCommand.name === 'new') {
    transactionFlow = new NewTransactionFlow(
      settings.currency,
      {
        income: customCategoriesFor(categoryCatalog, 'income'),
        expense: customCategoriesFor(categoryCatalog, 'expense'),
      },
      {
        income: categoryUsageFor(categoryCatalog, 'income'),
        expense: categoryUsageFor(categoryCatalog, 'expense'),
      },
      {
        income: categoryCatalog.archived
          .filter((key) => key.startsWith('income:'))
          .map((key) => key.slice('income:'.length)),
        expense: categoryCatalog.archived
          .filter((key) => key.startsWith('expense:'))
          .map((key) => key.slice('expense:'.length)),
      },
      {},
      'new',
      accountingRecords.accounts.map((account) => account.name),
    )
    const response = transactionFlow.start()
    startFlowEntry(input, response)
    showFlowPrompt(response)
    announceFlowResponse(response)
    return
  }

  if (parsedCommand.name === 'recent') {
    recentFlow = new RecentTransactionsFlow(transactions)
    const response = recentFlow.start()
    startFlowEntry(input, response)

    if (response.done) {
      recentFlow = null
      announce(response.announcement ?? response.lines.join(' '))
    } else {
      showFlowPrompt(response)
      announceFlowResponse(response)
    }
    return
  }

  if (parsedCommand.name === 'report') {
    const statement = financialStatement(transactions)
    appendFinancialStatement(input, statement)
    announce(spokenFinancialStatement(statement))
    return
  }

  if (parsedCommand.name === 'backup') {
    if (isDesktopRuntime() && ledgerPath) {
      void persistTransactions(true)
      appendEntry(input, [`Saving text ledger to ${ledgerPath}`])
      return
    }
    downloadLedger(transactions)
    appendEntry(input, ['Text ledger downloaded.'])
    announce('Text ledger downloaded.')
    return
  }

  if (parsedCommand.name === 'settings') {
    appendEntry(input, ['Opening settings.'])
    openSettings()
    return
  }

  if (parsedCommand.name === 'categories') {
    categoryFlow = new CategoryManagementFlow(categoryCatalog)
    const response = categoryFlow.start()
    startFlowEntry(input, response)
    showFlowPrompt(response)
    announceFlowResponse(response)
    return
  }

  const accountingKinds: Partial<Record<typeof parsedCommand.name, AccountingFlowKind>> = {
    accounts: 'account', assets: 'asset', deposits: 'deposit', transfer: 'transfer',
  }
  const accountingKind = accountingKinds[parsedCommand.name]
  if (accountingKind) {
    accountingFlow = new AccountingRecordFlow(accountingKind, accountingRecords, settings.currency)
    const response = accountingFlow.start()
    startFlowEntry(input, response)
    if (response.done) {
      accountingFlow = null
      announce(response.announcement ?? response.lines.join(' '))
    } else {
      showFlowPrompt(response)
      announceFlowResponse(response)
    }
    return
  }

  if (parsedCommand.name === 'balance-sheet') {
    appendBalanceSheet(input)
    return
  }

  if (parsedCommand.name === 'about') {
    const lines = [
      'B-Counting 0.1.0',
      'Accessible, keyboard-driven accounting. Your data stays on this device.',
    ]
    appendEntry(input, lines)
    announce(lines.join(' '))
    return
  }

  const requestedCommand = parsedCommand.arguments[0]
  const definition = requestedCommand ? findCommand(requestedCommand) : undefined

  if (requestedCommand && !definition) {
    const message = `I could not find help for “${requestedCommand}”. Type “help” to hear your choices.`
    appendEntry(input, [message], 'error')
    announce(message)
    return
  }

  const lines = definition
    ? [
        definition.description,
        `Use it like this: ${definition.usage}`,
        `Type: ${primaryShortcut(definition)}`,
      ]
    : [
        'Things you can do:',
        ...commands.map(
          (command) =>
            `${primaryShortcut(command).padEnd(2)}  ${command.name.padEnd(11)} ${command.description}`,
        ),
        '',
        'Type the short letters and press Enter.',
        'Use the Up and Down Arrows to revisit something you entered earlier.',
      ]

  if (definition) {
    appendEntry(input, lines)
    announce(lines.join(' '))
  } else {
    const helpParagraph = spokenCommandHelpParagraph()
    appendHelpTable(input)
    announce(helpParagraph)
  }
}

function continueTransactionFlow(input: string): void {
  if (!transactionFlow) {
    return
  }

  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response = transactionFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)

  if (response.createdCategory) {
    categoryCatalog = addCustomCategory(
      categoryCatalog,
      response.createdCategory.name,
      response.createdCategory.type,
    )
    persistCategoryCatalog()
  }

  if (response.savedDraft) {
    const existingIndex = editingTransactionId
      ? transactions.findIndex((transaction) => transaction.id === editingTransactionId)
      : -1
    const existingTransaction = transactions[existingIndex]
    const transaction = existingTransaction
      ? {
          ...existingTransaction,
          type: response.savedDraft.type ?? existingTransaction.type,
          amount: response.savedDraft.amount ?? existingTransaction.amount,
          description: response.savedDraft.description ?? existingTransaction.description,
          category: response.savedDraft.category || null,
          transactionDate: response.savedDraft.transactionDate ?? existingTransaction.transactionDate,
          account: response.savedDraft.account ?? existingTransaction.account,
          notes: response.savedDraft.notes ?? existingTransaction.notes,
        }
      : createTransaction(
          response.savedDraft,
          nextTransactionSequence(),
          settings.currency,
        )

    if (existingTransaction) {
      transactions[existingIndex] = transaction
      if (existingTransaction.category) {
        categoryCatalog = removeCategoryUse(
          categoryCatalog,
          existingTransaction.category,
          existingTransaction.type,
        )
      }
    } else {
      transactions.push(transaction)
    }

    void persistTransactions()
    if (transaction.category) {
      categoryCatalog = recordCategoryUse(
        categoryCatalog,
        transaction.category,
        transaction.type,
      )
      persistCategoryCatalog()
    }
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    finishFlow()
    return
  }

  if (response.done) {
    finishFlow()
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    return
  }

  showFlowPrompt(response)
  announceFlowResponse(response)
}

function continueCategoryFlow(input: string): void {
  if (!categoryFlow) return

  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response: CategoryFlowResponse = categoryFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)

  if (response.catalog) {
    categoryCatalog = response.catalog
    persistCategoryCatalog()
  }

  if (response.done) {
    finishFlow()
    announce(`${response.lines.join(' ')} Ready for your next action.`)
    return
  }

  showFlowPrompt(response)
  announceFlowResponse(response)
}

function continueRecentFlow(input: string): void {
  if (!recentFlow) return

  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response = recentFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)

  if (response.editTransaction) {
    startTransactionEditor(response.editTransaction)
    return
  }

  if (response.removedTransactionId) {
    const transactionIndex = transactions.findIndex(
      (transaction) => transaction.id === response.removedTransactionId,
    )
    const [removedTransaction] = transactionIndex >= 0
      ? transactions.splice(transactionIndex, 1)
      : []

    if (removedTransaction?.category) {
      categoryCatalog = removeCategoryUse(
        categoryCatalog,
        removedTransaction.category,
        removedTransaction.type,
      )
      persistCategoryCatalog()
    }

    void persistTransactions()
  }

  if (response.done) {
    finishFlow()
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    return
  }

  showFlowPrompt(response)
  announceFlowResponse(response)
}

function continueAccountingFlow(input: string): void {
  if (!accountingFlow) return
  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response: AccountingFlowResponse = accountingFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)
  if (response.records) {
    accountingRecords = response.records
    if (!saveAccountingRecords(window.localStorage, accountingRecords)) {
      appendSystemLine('Warning: accounting records could not be saved on this device.')
    }
  }
  if (response.done) {
    finishFlow()
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    return
  }
  showFlowPrompt(response)
  announceFlowResponse(response)
}

function appendFlowResponse(input: string, response: FlowResponse): void {
  // Guided flows expose only the current step. Keeping completed steps in the
  // accessibility tree makes screen-reader users traverse the whole session
  // again when they review the page.
  output.replaceChildren()

  const entry = document.createElement('section')
  entry.className = 'terminal-entry terminal-entry--flow'

  const answer = document.createElement('p')
  answer.className = 'terminal-command'
  answer.textContent = `  ❯ ${input.trim() || '(skipped)'}`
  entry.append(answer)

  if (response.lines.length > 0) {
    const result = document.createElement('pre')
    result.className = response.error
      ? 'terminal-result terminal-result--error'
      : 'terminal-result'
    result.textContent = response.lines.join('\n')
    entry.append(result)
  }

  output.append(entry)
  form.scrollIntoView({ block: 'nearest' })
}

function appendSystemLine(message: string): void {
  const line = document.createElement('p')
  line.className = 'terminal-system-line'
  line.textContent = message
  output.append(line)
}

function showFlowPrompt(response: FlowResponse): void {
  const prompt = response.prompt ?? ''
  activePrompt.hidden = false
  activePrompt.textContent = response.options
    ? `${prompt}\nPress ⌘/Ctrl+T to hear the choices again.`
    : prompt
  commandLabel.textContent = prompt
  currentFlowResponse = response

  if (response.options) {
    selectedOptionIndex = 0
    renderFlowOptions(response.options)
    commandInput.setAttribute('role', 'combobox')
    commandInput.setAttribute('aria-controls', 'flow-options')
    commandInput.setAttribute('aria-expanded', 'true')
    commandInput.setAttribute('aria-autocomplete', 'none')
  } else {
    clearFlowOptions()
  }
}

function startFlowEntry(input: string, response: FlowResponse): void {
  output.replaceChildren()
  appendEntry(input, response.lines)
}

function finishFlow(): void {
  transactionFlow = null
  categoryFlow = null
  recentFlow = null
  accountingFlow = null
  editingTransactionId = null
  activePrompt.hidden = true
  activePrompt.textContent = ''
  commandLabel.textContent = 'What would you like to do?'
  currentFlowResponse = null
  clearFlowOptions()
}

function startTransactionEditor(transaction: Transaction): void {
  editingTransactionId = transaction.id
  recentFlow = null
  transactionFlow = new NewTransactionFlow(
    transaction.currency,
    {
      income: customCategoriesFor(categoryCatalog, 'income'),
      expense: customCategoriesFor(categoryCatalog, 'expense'),
    },
    {
      income: categoryUsageFor(categoryCatalog, 'income'),
      expense: categoryUsageFor(categoryCatalog, 'expense'),
    },
    {
      income: categoryCatalog.archived
        .filter((key) => key.startsWith('income:'))
        .map((key) => key.slice('income:'.length)),
      expense: categoryCatalog.archived
        .filter((key) => key.startsWith('expense:'))
        .map((key) => key.slice('expense:'.length)),
    },
    {
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      category: transaction.category ?? '',
      transactionDate: transaction.transactionDate,
      account: transaction.account,
      notes: transaction.notes,
    },
    'edit',
    accountingRecords.accounts.map((account) => account.name),
  )
  const response = transactionFlow.start()
  output.replaceChildren()
  appendSystemLine(response.lines.join('\n'))
  showFlowPrompt(response)
  announceFlowResponse(response)
}

function nextTransactionSequence(): number {
  return transactions.reduce((highest, transaction) => {
    const sequence = Number(transaction.id.match(/-(\d+)$/)?.[1] ?? 0)
    return Math.max(highest, sequence)
  }, 0) + 1
}

function renderFlowOptions(options: readonly string[]): void {
  flowOptions.replaceChildren(
    ...options.map((option, index) => {
      const item = document.createElement('li')
      item.id = `flow-option-${index}`
      item.dataset.index = String(index)
      item.className = 'flow-option'
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(index === selectedOptionIndex))
      item.textContent = `${index + 1}. ${option}`
      return item
    }),
  )
  flowOptions.hidden = false
  commandInput.setAttribute('aria-activedescendant', `flow-option-${selectedOptionIndex}`)
}

function clearFlowOptions(): void {
  flowOptions.hidden = true
  flowOptions.replaceChildren()
  commandInput.removeAttribute('role')
  commandInput.removeAttribute('aria-controls')
  commandInput.removeAttribute('aria-expanded')
  commandInput.removeAttribute('aria-autocomplete')
  commandInput.removeAttribute('aria-activedescendant')
}

function persistCategoryCatalog(): void {
  if (!saveCategoryCatalog(window.localStorage, categoryCatalog)) {
    appendSystemLine('Warning: category changes could not be saved on this device.')
  }
}

function appendEntry(
  input: string,
  lines: readonly string[],
  tone: 'normal' | 'error' = 'normal',
): void {
  const entry = document.createElement('section')
  entry.className = 'terminal-entry'

  const command = document.createElement('p')
  command.className = 'terminal-command'
  command.textContent = `❯ ${input}`
  entry.append(command)

  const result = document.createElement('pre')
  result.className = tone === 'error' ? 'terminal-result terminal-result--error' : 'terminal-result'
  result.textContent = lines.join('\n')
  entry.append(result)

  output.append(entry)
  form.scrollIntoView({ block: 'nearest' })
}

function createEntry(input: string): HTMLElement {
  const entry = document.createElement('section')
  entry.className = 'terminal-entry'

  const command = document.createElement('p')
  command.className = 'terminal-command'
  command.textContent = `❯ ${input}`

  entry.append(command)
  output.append(entry)
  return entry
}

function appendHelpTable(input: string): void {
  const entry = createEntry(input)
  const table = createTable(
    'Available actions',
    ['Shortcut', 'Action', 'Description'],
    commands.map((command) => [
      primaryShortcut(command).toUpperCase(),
      command.name,
      command.description,
    ]),
  )
  entry.append(table)
  form.scrollIntoView({ block: 'nearest' })
}

function appendFinancialStatement(input: string, statement: FinancialStatement): void {
  if (statement.transactionCount === 0) {
    appendEntry(input, ['No transactions are available to report.'])
    return
  }

  const entry = createEntry(input)
  const heading = document.createElement('h2')
  heading.className = 'statement-heading'
  heading.textContent = 'Financial statement'
  entry.append(heading)
  entry.append(createTable(
    'Income, expenses, and net balance',
    ['Currency', 'Income', 'Expenses', 'Net balance'],
    statement.totals.map((row) => [row.currency, row.income, row.expenses, row.net]),
  ))
  entry.append(createTable(
    'Transaction activity',
    ['Date', 'Description', 'Currency', 'Debit', 'Credit', 'Balance'],
    statement.transactions.map((row) => [
      row.date,
      row.description,
      row.currency,
      row.debit,
      row.credit,
      row.balance,
    ]),
  ))

  const note = document.createElement('p')
  note.className = 'statement-note'
  note.textContent = `${statement.transactionCount} transaction${statement.transactionCount === 1 ? '' : 's'} included.`
  entry.append(note)
  form.scrollIntoView({ block: 'nearest' })
}

function appendBalanceSheet(input: string): void {
  const entry = createEntry(input)
  const heading = document.createElement('h2')
  heading.className = 'statement-heading'
  heading.textContent = 'Balance sheet'
  entry.append(heading)

  const balances = accountBalances(accountingRecords, transactions)
  entry.append(createTable('Cash and bank accounts', ['Account', 'Type', 'Currency', 'Balance'],
    accountingRecords.accounts.map((account) => [account.name, account.type, account.currency, balances.get(account.name) ?? '0.00'])))
  entry.append(createTable('Fixed assets', ['Asset', 'Purchase date', 'Cost', 'Book value', 'Currency'],
    accountingRecords.assets.map((asset) => [asset.name, asset.purchaseDate, asset.cost, currentBookValue(asset), asset.currency])))
  entry.append(createTable('Refundable deposits', ['Deposit', 'Date paid', 'Amount', 'Currency', 'Status'],
    accountingRecords.deposits.map((deposit) => [deposit.name, deposit.paidDate, deposit.amount, deposit.currency, deposit.status])))

  const message = `${accountingRecords.accounts.length} financial accounts, ${accountingRecords.assets.length} fixed assets, and ${accountingRecords.deposits.length} deposits.`
  announce(`Balance sheet. ${message}`)
}

function createTable(captionText: string, headings: readonly string[], rows: readonly (readonly string[])[]): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'data-table'
  const caption = table.createCaption()
  caption.textContent = captionText
  const headerRow = table.createTHead().insertRow()
  for (const heading of headings) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = heading
    headerRow.append(cell)
  }
  const body = table.createTBody()
  for (const row of rows) {
    const tableRow = body.insertRow()
    row.forEach((value, index) => {
      const cell = index === 0 ? document.createElement('th') : document.createElement('td')
      if (cell instanceof HTMLTableCellElement && index === 0) cell.scope = 'row'
      cell.textContent = value
      tableRow.append(cell)
    })
  }
  return table
}

function announce(message: string): void {
  cancelAnnouncements()
  updateLiveRegion(message)

  speak(message)
}

function announceFlowResponse(response: FlowResponse): void {
  const introduction = response.announcement ?? response.lines.join(' ')

  if (response.options?.length) {
    announceOneByOne(selectionMessages(response, introduction))
    return
  }

  announce(`${introduction} ${response.prompt ?? ''}`.trim())
}

function repeatCurrentChoices(): void {
  if (!currentFlowResponse?.options?.length || !settingsPage.hidden) {
    announce('There are no choices to hear again right now.')
    return
  }

  announceOneByOne(selectionMessages(currentFlowResponse, undefined, true))
}

function announceOneByOne(messages: readonly string[]): void {
  cancelAnnouncements()
  const sequence = announcementSequence

  if (
    settings.readAloud &&
    settings.speechEngine === 'system' &&
    'speechSynthesis' in window
  ) {
    for (const message of messages) {
      const utterance = createUtterance(message, false)
      utterance.addEventListener('start', () => {
        if (sequence === announcementSequence) {
          updateLiveRegion(message)
        }
      })
      window.speechSynthesis.speak(utterance)
    }
    return
  }

  if (settings.readAloud && settings.speechEngine === 'kokoro') {
    for (const message of messages) speak(message, false)
  }

  let delay = 20
  for (const message of messages) {
    const timer = window.setTimeout(() => {
      if (sequence === announcementSequence) {
        updateLiveRegion(message)
      }
    }, delay)
    announcementTimers.push(timer)
    delay += Math.max(1800, message.split(/\s+/).length * 320)
  }
}

function updateLiveRegion(message: string): void {
  announcer.textContent = ''
  const timer = window.setTimeout(() => {
    announcer.textContent = message
  }, 20)
  announcementTimers.push(timer)
}

function cancelAnnouncements(): void {
  announcementSequence += 1
  for (const timer of announcementTimers) {
    window.clearTimeout(timer)
  }
  announcementTimers = []
  window.speechSynthesis?.cancel()
  kokoroSpeech.cancel()
  naturalSpeechQueue = Promise.resolve()
}

function openSettings(): void {
  syncSettingsForm()
  terminalBody.hidden = true
  settingsPage.hidden = false
  settingsClose.focus()
  announce('Settings page. Read results aloud is off by default. Press Escape to close.')
}

function closeSettings(): void {
  window.speechSynthesis?.cancel()
  settingsPage.hidden = true
  terminalBody.hidden = false
  commandInput.focus()
  announce('Settings closed. Ready for your next action.')
}

function syncSettingsForm(): void {
  readAloudInput.checked = settings.readAloud
  speechEngineInput.value = settings.speechEngine
  kokoroVoiceInput.value = settings.kokoroVoice
  kokoroVoiceRow.hidden = settings.speechEngine !== 'kokoro'
  verbosityInput.value = settings.verbosity
  speechRateInput.value = String(settings.speechRate)
  speechRateValue.value = `${settings.speechRate.toFixed(1).replace('.0', '')}×`
  currencyInput.value = settings.currency
  appearanceInput.value = settings.appearance
  ledgerPathInput.value = ledgerPath
  ledgerPathInput.disabled = !isDesktopRuntime()
  ledgerBrowse.hidden = !isDesktopRuntime()
  ledgerConnect.hidden = !isDesktopRuntime()

  if (!('speechSynthesis' in window) && settings.speechEngine === 'system') {
    readAloudInput.checked = false
    readAloudInput.disabled = true
    readAloudInput.setAttribute('aria-describedby', 'read-aloud-help speech-unavailable')
  } else {
    readAloudInput.disabled = false
    readAloudInput.setAttribute('aria-describedby', 'read-aloud-help')
  }
}

function applySettings(): void {
  document.documentElement.dataset.appearance = settings.appearance
  syncSettingsForm()
}

function speak(message: string, applyBriefMode = true): void {
  if (!settings.readAloud) return

  const spokenMessage = formatSpokenMessage(message, applyBriefMode)

  if (settings.speechEngine === 'kokoro' && !naturalVoiceFailed) {
    const sequence = announcementSequence
    naturalSpeechQueue = naturalSpeechQueue.then(async () => {
      if (sequence !== announcementSequence) return

      if (naturalVoiceFailed) {
        speakWithSystem(spokenMessage, false)
        return
      }

      try {
        await kokoroSpeech.speak(spokenMessage, settings.kokoroVoice, settings.speechRate)
      } catch {
        if (sequence !== announcementSequence) return
        naturalVoiceFailed = true
        updateKokoroStatus({
          state: 'error',
          message: 'Natural voice could not speak. The system voice will be used instead.',
        })
        speakWithSystem(spokenMessage, false)
      }
    })
    return
  }

  speakWithSystem(spokenMessage, false)
}

function createUtterance(
  message: string,
  applyBriefMode = true,
): SpeechSynthesisUtterance {
  const spokenMessage = settings.verbosity === 'brief' && applyBriefMode
    ? (message.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? message)
    : message
  const utterance = new SpeechSynthesisUtterance(spokenMessage)
  utterance.rate = settings.speechRate
  return utterance
}

function formatSpokenMessage(message: string, applyBriefMode: boolean): string {
  return settings.verbosity === 'brief' && applyBriefMode
    ? (message.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? message)
    : message
}

function speakWithSystem(message: string, applyBriefMode = true): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.speak(createUtterance(message, applyBriefMode))
}

function prepareNaturalVoice(): void {
  kokoroSpeech.prepare().catch(() => {
    naturalVoiceFailed = true
    if (settings.readAloud) {
      speakWithSystem('Natural voice could not load. The system voice will be used instead.')
    }
  })
}

function updateKokoroStatus(status: KokoroStatus): void {
  voiceStatus.textContent = status.message
  voiceStatus.dataset.state = status.state
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)

  if (!element) {
    throw new Error(`The command interface is missing ${selector}.`)
  }

  return element
}

async function initializeLedger(): Promise<void> {
  if (!isDesktopRuntime() || !ledgerPath) return

  try {
    const stored = await readLedger(ledgerPath)
    if (stored) {
      transactions.splice(0, transactions.length, ...stored)
      saveTransactions(window.localStorage, transactions)
      settingsStatus.textContent = `Loaded ${stored.length} transaction${stored.length === 1 ? '' : 's'} from the connected ledger file.`
    } else {
      await writeLedger(ledgerPath, transactions)
      settingsStatus.textContent = 'The connected ledger file is ready.'
    }
  } catch (error) {
    settingsStatus.textContent = `Ledger warning: ${errorMessage(error)}`
  }
}

async function connectLedger(pathValue: string): Promise<void> {
  const path = pathValue.trim()
  if (!path) throw new Error('Enter or choose a complete text-file location.')

  const stored = await readLedger(path)
  if (stored) {
    transactions.splice(0, transactions.length, ...stored)
    saveTransactions(window.localStorage, transactions)
    settingsStatus.textContent = `Connected and imported ${stored.length} transaction${stored.length === 1 ? '' : 's'}.`
  } else {
    await writeLedger(path, transactions)
    settingsStatus.textContent = `Connected and saved ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}.`
  }

  ledgerPath = path
  ledgerPathInput.value = path
  saveLedgerPath(window.localStorage, path)
  announce(settingsStatus.textContent)
}

async function persistTransactions(announceResult = false): Promise<void> {
  if (!saveTransactions(window.localStorage, transactions)) {
    appendSystemLine('Warning: this change could not be saved on this device.')
  }

  if (!isDesktopRuntime() || !ledgerPath) return
  const snapshot = [...transactions]
  ledgerWriteQueue = ledgerWriteQueue.then(() => writeLedger(ledgerPath, snapshot))
  try {
    await ledgerWriteQueue
    if (announceResult) announce(`Text ledger saved to ${ledgerPath}.`)
  } catch (error) {
    settingsStatus.textContent = `Ledger warning: ${errorMessage(error)}`
    ledgerWriteQueue = Promise.resolve()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function loadZoomLevel(): number {
  const stored = Number(window.localStorage.getItem('b-counting-zoom'))
  return Number.isFinite(stored) && stored >= 75 && stored <= 200 ? stored : 100
}

function changeZoom(change: number): void {
  zoomLevel = Math.min(200, Math.max(75, zoomLevel + change))
  applyZoom(true)
}

function applyZoom(shouldAnnounce = false): void {
  document.documentElement.style.fontSize = `${zoomLevel}%`
  window.localStorage.setItem('b-counting-zoom', String(zoomLevel))
  if (shouldAnnounce) announce(`Zoom ${zoomLevel} percent.`)
}
