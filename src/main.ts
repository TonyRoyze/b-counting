import './style.css'
import { commands, findCommand, parseCommand, suggestCommand } from './commands'

const form = requireElement<HTMLFormElement>('#command-form')
const commandInput = requireElement<HTMLInputElement>('#command-input')
const output = requireElement<HTMLElement>('#terminal-output')
const announcer = requireElement<HTMLElement>('#announcer')

const commandHistory: string[] = []
let historyIndex = 0

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const input = commandInput.value.trim()

  if (input === '') {
    announce('Enter a command. Type help for available commands.')
    commandInput.focus()
    return
  }

  commandHistory.push(input)
  historyIndex = commandHistory.length
  commandInput.value = ''
  runCommand(input)
  commandInput.focus()
})

commandInput.addEventListener('keydown', (event) => {
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

document.querySelector('.terminal')?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLInputElement) {
    return
  }

  commandInput.focus()
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
    ? [definition.description, `Usage: ${definition.usage}`]
    : [
        'Available commands:',
        ...commands.map((command) => `${command.name.padEnd(8)} ${command.description}`),
        '',
        'Use Up and Down Arrow to revisit previous commands.',
      ]

  appendEntry(input, lines)
  announce(definition ? lines.join(' ') : `${commands.length} commands available.`)
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
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)

  if (!element) {
    throw new Error(`The command interface is missing ${selector}.`)
  }

  return element
}
