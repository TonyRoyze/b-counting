import './style.css'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  spokenCommandHelp,
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
  type Verbosity,
} from './settings'
import {
  addCustomCategory,
  categoryUsageFor,
  customCategoriesFor,
  loadCategoryCatalog,
  recordCategoryUse,
  saveCategoryCatalog,
  type CategoryCatalog,
} from './categories'
import {
  CategoryManagementFlow,
  type CategoryFlowResponse,
} from './category-flow'
import { RecentTransactionsFlow } from './recent-flow'
import { loadTransactions, saveTransactions } from './transaction-storage'

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
const verbosityInput = requireElement<HTMLSelectElement>('#verbosity')
const speechRateInput = requireElement<HTMLInputElement>('#speech-rate')
const speechRateValue = requireElement<HTMLOutputElement>('#speech-rate-value')
const currencyInput = requireElement<HTMLSelectElement>('#currency')
const appearanceInput = requireElement<HTMLSelectElement>('#appearance')

const commandHistory: string[] = []
const transactions: Transaction[] = loadTransactions(window.localStorage)
let historyIndex = 0
let transactionFlow: NewTransactionFlow | null = null
let categoryFlow: CategoryManagementFlow | null = null
let recentFlow: RecentTransactionsFlow | null = null
let currentFlowResponse: FlowResponse | null = null
let selectedOptionIndex = 0
let settings: AppSettings = loadSettings(window.localStorage)
let categoryCatalog: CategoryCatalog = loadCategoryCatalog(window.localStorage)
let announcementSequence = 0
let announcementTimers: number[] = []

applySettings()

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const rawInput = commandInput.value
  const input = rawInput.trim()

  if (input === '' && !transactionFlow && !categoryFlow && !recentFlow) {
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

  commandHistory.push(input)
  historyIndex = commandHistory.length
  runCommand(input)
  commandInput.focus()
})

commandInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (transactionFlow || categoryFlow || recentFlow)) {
    event.preventDefault()
    const response = transactionFlow?.cancel() ?? categoryFlow?.cancel() ?? recentFlow?.cancel()
    if (response) appendFlowResponse('cancel', response)
    finishFlow()
    announce('Cancelled. Ready for your next action.')
    return
  }

  if (transactionFlow || categoryFlow || recentFlow) {
    if (
      currentFlowResponse?.options &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' ? -1 : 1
      const optionCount = currentFlowResponse.options.length
      selectedOptionIndex = (selectedOptionIndex + direction + optionCount) % optionCount
      renderFlowOptions(currentFlowResponse.options)
      const selected = currentFlowResponse.options[selectedOptionIndex] ?? ''
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
  commandInput.focus()
})

settingsClose.addEventListener('click', closeSettings)

settingsForm.addEventListener('input', () => {
  speechRateValue.value = `${Number(speechRateInput.value).toFixed(1).replace('.0', '')}×`
})

settingsForm.addEventListener('change', () => {
  const wasReadAloud = settings.readAloud
  settings = {
    readAloud: readAloudInput.checked,
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
    speak('Read aloud enabled. Settings saved on this device.')
  }
})

document.addEventListener('keydown', (event) => {
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
    )
    const response = transactionFlow.start()
    appendEntry(input, response.lines)
    showFlowPrompt(response)
    announce(`${response.announcement ?? response.lines.join(' ')} ${response.prompt}`)
    return
  }

  if (parsedCommand.name === 'recent') {
    recentFlow = new RecentTransactionsFlow(transactions)
    const response = recentFlow.start()
    appendEntry(input, response.lines)

    if (response.done) {
      recentFlow = null
      announce(response.announcement ?? response.lines.join(' '))
    } else {
      showFlowPrompt(response)
      announce(`${response.announcement ?? response.lines.join(' ')} ${response.prompt}`)
    }
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
    appendEntry(input, response.lines)
    showFlowPrompt(response)
    announce(`${response.lines.join(' ')} ${response.prompt}`)
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
            `${primaryShortcut(command).padEnd(2)}  ${command.name.padEnd(8)} ${command.description}`,
        ),
        '',
        'Type the short letters and press Enter.',
        'Use Up and Down Arrow to revisit something you entered earlier.',
      ]

  appendEntry(input, lines)
  if (definition) {
    announce(lines.join(' '))
  } else {
    announceOneByOne([
      'Here are the things you can do.',
      ...commands.map(spokenCommandHelp),
      'Type the short letters and press Enter.',
      'Use Up and Down Arrow to revisit something you entered earlier.',
    ])
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
    const transaction = createTransaction(
      response.savedDraft,
      transactions.length + 1,
      settings.currency,
    )
    transactions.push(transaction)
    if (!saveTransactions(window.localStorage, transactions)) {
      appendSystemLine('Warning: this transaction could not be saved for next time.')
    }
    if (transaction.category) {
      categoryCatalog = recordCategoryUse(
        categoryCatalog,
        transaction.category,
        transaction.type,
      )
      persistCategoryCatalog()
    }
    appendSystemLine(`Transaction ID ${transaction.id}.`)
    announce(`${response.announcement ?? response.lines.join(' ')} Transaction ID ${transaction.id}. Ready for your next action.`)
    finishFlow()
    return
  }

  if (response.done) {
    finishFlow()
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    return
  }

  showFlowPrompt(response)
  announce(`${response.announcement ?? response.lines.join(' ')} ${response.prompt}`.trim())
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
  announce(`${response.lines.join(' ')} ${response.prompt}`.trim())
}

function continueRecentFlow(input: string): void {
  if (!recentFlow) return

  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response = recentFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)

  if (response.done) {
    finishFlow()
    announce(`${response.announcement ?? response.lines.join(' ')} Ready for your next action.`)
    return
  }

  showFlowPrompt(response)
  announce(`${response.announcement ?? response.lines.join(' ')} ${response.prompt}`.trim())
}

function appendFlowResponse(input: string, response: FlowResponse): void {
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
  activePrompt.textContent = prompt
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

function finishFlow(): void {
  transactionFlow = null
  categoryFlow = null
  recentFlow = null
  activePrompt.hidden = true
  activePrompt.textContent = ''
  commandLabel.textContent = 'What would you like to do?'
  currentFlowResponse = null
  clearFlowOptions()
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

function announce(message: string): void {
  cancelAnnouncements()
  updateLiveRegion(message)

  speak(message)
}

function announceOneByOne(messages: readonly string[]): void {
  cancelAnnouncements()
  const sequence = announcementSequence

  if (settings.readAloud && 'speechSynthesis' in window) {
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
}

function openSettings(): void {
  syncSettingsForm()
  terminalBody.hidden = true
  settingsPage.hidden = false
  settingsStatus.textContent = ''
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
  verbosityInput.value = settings.verbosity
  speechRateInput.value = String(settings.speechRate)
  speechRateValue.value = `${settings.speechRate.toFixed(1).replace('.0', '')}×`
  currencyInput.value = settings.currency
  appearanceInput.value = settings.appearance

  if (!('speechSynthesis' in window)) {
    readAloudInput.checked = false
    readAloudInput.disabled = true
    readAloudInput.setAttribute('aria-describedby', 'read-aloud-help speech-unavailable')
  }
}

function applySettings(): void {
  document.documentElement.dataset.appearance = settings.appearance
  syncSettingsForm()
}

function speak(message: string): void {
  if (!settings.readAloud || !('speechSynthesis' in window)) {
    return
  }

  window.speechSynthesis.speak(createUtterance(message))
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

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)

  if (!element) {
    throw new Error(`The command interface is missing ${selector}.`)
  }

  return element
}
