export type CommandName =
  | 'about'
  | 'categories'
  | 'clear'
  | 'help'
  | 'new'
  | 'recent'
  | 'settings'

export interface CommandDefinition {
  name: CommandName
  aliases: readonly string[]
  description: string
  usage: string
}

export interface ParsedCommand {
  name: CommandName
  arguments: string[]
}

export const commands: readonly CommandDefinition[] = [
  {
    name: 'new',
    aliases: ['n', 'add'],
    description: 'Record a new income or expense.',
    usage: 'new',
  },
  {
    name: 'recent',
    aliases: ['r', 'history', 'his'],
    description: 'Review your most recently saved transactions.',
    usage: 'recent',
  },
  {
    name: 'settings',
    aliases: ['st', 'set'],
    description: 'Change speech, currency, and appearance preferences.',
    usage: 'settings',
  },
  {
    name: 'categories',
    aliases: ['ct', 'cat'],
    description: 'List, rename, archive, or restore categories.',
    usage: 'categories',
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'List available actions or explain one action.',
    usage: 'help [action]',
  },
  {
    name: 'about',
    aliases: ['a', 'version'],
    description: 'Show information about B-Counting.',
    usage: 'about',
  },
  {
    name: 'clear',
    aliases: ['c', 'cl', 'cls', 'clr'],
    description: 'Clear previous activity from the screen.',
    usage: 'clear',
  },
]

const commandNames = new Map<string, CommandName>(
  commands.flatMap((command) => [
    [command.name, command.name],
    ...command.aliases.map((alias) => [alias, command.name] as const),
  ]),
)

export function parseCommand(input: string): ParsedCommand | null {
  const [commandName = '', ...commandArguments] = input.trim().toLowerCase().split(/\s+/)
  const name = commandNames.get(commandName)

  return name ? { name, arguments: commandArguments } : null
}

export function findCommand(name: string): CommandDefinition | undefined {
  const canonicalName = commandNames.get(name.toLowerCase())
  return commands.find((command) => command.name === canonicalName)
}

export function primaryShortcut(command: CommandDefinition): string {
  return command.aliases.reduce((shortest, alias) =>
    alias.length < shortest.length ? alias : shortest,
  )
}

export function spokenCommandHelp(command: CommandDefinition): string {
  return `${command.name}. Type ${primaryShortcut(command)}. ${command.description}`
}

export function suggestCommand(input: string): CommandName | null {
  const candidate = input.trim().toLowerCase().split(/\s+/)[0] ?? ''

  if (candidate.length < 2) {
    return null
  }

  const suggestion = commands.find(
    (command) => editDistance(candidate, command.name) === 1,
  )

  return suggestion?.name ?? null
}

function editDistance(left: string, right: string): number {
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previousDiagonal = previousRow[0]
    previousRow[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previousAbove = previousRow[rightIndex] ?? 0
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      previousRow[rightIndex] = Math.min(
        previousAbove + 1,
        (previousRow[rightIndex - 1] ?? 0) + 1,
        previousDiagonal + substitutionCost,
      )
      previousDiagonal = previousAbove
    }
  }

  return previousRow[right.length] ?? right.length
}
