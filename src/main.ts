import './style.css'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  suggestCommand,
} from './commands'
import {
  createTransaction,
  expenseCategories,
  incomeCategories,
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

const form = requireElement<HTMLFormElement>('#command-form')
const commandInput = requireElement<HTMLInputElement>('#command-input')
const output = requireElement<HTMLElement>('#terminal-output')
const announcer = requireElement<HTMLElement>('#announcer')
const activePrompt = requireElement<HTMLElement>('#active-prompt')
const promptPath = requireElement<HTMLElement>('#prompt-path')
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
const transactions: Transaction[] = []
const customCategories: string[] = []
let historyIndex = 0
let transactionFlow: NewTransactionFlow | null = null
let currentFlowResponse: FlowResponse | null = null
let selectedOptionIndex = 0
let settings: AppSettings = loadSettings(window.localStorage)

applySettings()

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const rawInput = commandInput.value
  const input = rawInput.trim()

  if (input === '' && !transactionFlow) {
    announce('Enter a command. Type help for available commands.')
    commandInput.focus()
    return
  }

  commandInput.value = ''

  if (transactionFlow) {
    continueTransactionFlow(rawInput)
    commandInput.focus()
    return
  }

  commandHistory.push(input)
  historyIndex = commandHistory.length
  runCommand(input)
  commandInput.focus()
})

commandInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && transactionFlow) {
    event.preventDefault()
    appendFlowResponse('cancel', transactionFlow.cancel())
    finishTransactionFlow()
    announce('New transaction cancelled. Command prompt.')
    return
  }

  if (transactionFlow) {
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
      ? `Command not found. Did you mean “${suggestion}”?`
      : 'Command not found. Type “help” for available commands.'

    appendEntry(input, [message], 'error')
    announce(message)
    return
  }

  if (parsedCommand.name === 'clear') {
    output.replaceChildren()
    announce('Terminal cleared. Command prompt.')
    return
  }

  if (parsedCommand.name === 'new') {
    transactionFlow = new NewTransactionFlow(settings.currency, customCategories)
    const response = transactionFlow.start()
    appendEntry(input, response.lines)
    showFlowPrompt(response)
    announce(`${response.lines.join(' ')} ${response.prompt}`)
    return
  }

  if (parsedCommand.name === 'settings') {
    appendEntry(input, ['Opening settings.'])
    openSettings()
    return
  }

  if (parsedCommand.name === 'about') {
    const lines = [
      'B-Counting 0.1.0',
      'Accessible, command-driven accounting. Your data stays on this device.',
    ]
    appendEntry(input, lines)
    announce(lines.join(' '))
    return
  }

  const requestedCommand = parsedCommand.arguments[0]
  const definition = requestedCommand ? findCommand(requestedCommand) : undefined

  if (requestedCommand && !definition) {
    const message = `No help found for “${requestedCommand}”. Type “help” to list commands.`
    appendEntry(input, [message], 'error')
    announce(message)
    return
  }

  const lines = definition
    ? [
        definition.description,
        `Usage: ${definition.usage}`,
        `Shortcut: ${primaryShortcut(definition)}`,
      ]
    : [
        'Available commands:',
        ...commands.map(
          (command) =>
            `${primaryShortcut(command).padEnd(2)}  ${command.name.padEnd(8)} ${command.description}`,
        ),
        '',
        'Type a shortcut and press Enter.',
        'Use Up and Down Arrow to revisit previous commands.',
      ]

  appendEntry(input, lines)
  announce(definition ? lines.join(' ') : `${commands.length} commands available.`)
}

function continueTransactionFlow(input: string): void {
  if (!transactionFlow) {
    return
  }

  const selectedOption = currentFlowResponse?.options?.[selectedOptionIndex]
  const submittedInput = input.trim() === '' && selectedOption ? selectedOption : input
  const response = transactionFlow.submit(submittedInput)
  appendFlowResponse(submittedInput, response)

  if (response.savedDraft) {
    const transaction = createTransaction(
      response.savedDraft,
      transactions.length + 1,
      settings.currency,
    )
    transactions.push(transaction)
    rememberCustomCategory(transaction.category)
    appendSystemLine(`Transaction ID ${transaction.id}.`)
    announce(`${response.lines.join(' ')} Transaction ID ${transaction.id}. Command prompt.`)
    finishTransactionFlow()
    return
  }

  if (response.done) {
    finishTransactionFlow()
    announce(`${response.lines.join(' ')} Command prompt.`)
    return
  }

  showFlowPrompt(response)
  announce(`${response.lines.join(' ')} ${response.prompt}`.trim())
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
  const step = response.step ?? ''
  activePrompt.hidden = false
  activePrompt.textContent = prompt
  promptPath.textContent = `new ${step}`
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

function finishTransactionFlow(): void {
  transactionFlow = null
  activePrompt.hidden = true
  activePrompt.textContent = ''
  promptPath.textContent = '~'
  commandLabel.textContent = 'Command'
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

function rememberCustomCategory(category: string | null): void {
  if (!category) {
    return
  }

  const predefinedCategories = [...incomeCategories, ...expenseCategories]
  const alreadyExists = [...predefinedCategories, ...customCategories].some(
    (item) => item.toLowerCase() === category.toLowerCase(),
  )

  if (!alreadyExists) {
    customCategories.push(category)
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
  command.textContent = `~ ❯ ${input}`
  entry.append(command)

  const result = document.createElement('pre')
  result.className = tone === 'error' ? 'terminal-result terminal-result--error' : 'terminal-result'
  result.textContent = lines.join('\n')
  entry.append(result)

  output.append(entry)
  form.scrollIntoView({ block: 'nearest' })
}

function announce(message: string): void {
  announcer.textContent = ''
  window.setTimeout(() => {
    announcer.textContent = message
  }, 20)

  speak(message)
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
  announce('Settings closed. Command prompt.')
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

  const spokenMessage = settings.verbosity === 'brief'
    ? (message.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? message)
    : message
  const utterance = new SpeechSynthesisUtterance(spokenMessage)
  utterance.rate = settings.speechRate
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)

  if (!element) {
    throw new Error(`The command interface is missing ${selector}.`)
  }

  return element
}
