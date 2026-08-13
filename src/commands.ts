export type CommandName = 'about' | 'clear' | 'help' | 'new' | 'settings'

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
    name: 'settings',
    aliases: ['set'],
    description: 'Change speech, currency, and appearance preferences.',
    usage: 'settings',
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'List commands or explain one command.',
    usage: 'help [command]',
  },
  {
    name: 'about',
    aliases: ['version'],
    description: 'Show information about B-Counting.',
    usage: 'about',
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear the terminal history.',
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
