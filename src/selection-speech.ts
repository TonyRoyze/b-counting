import type { FlowResponse } from './transaction-flow.ts'

const repeatHelp =
  'To hear these choices again, on a Mac press the key beside the space bar and T. On other computers, press Control and T.'

export function selectionMessages(
  response: FlowResponse,
  introduction?: string,
  repeated = false,
): string[] {
  const options = response.options ?? []
  const messages: string[] = []

  if (repeated) {
    messages.push('Here are the choices again.')
  } else if (introduction?.trim()) {
    messages.push(introduction.trim())
  }

  if (response.prompt?.trim()) {
    messages.push(response.prompt.trim())
  }

  messages.push(
    ...options.map(
      (option, index) => `Choice ${index + 1} of ${options.length}. ${option}.`,
    ),
  )
  messages.push('Use Up and Down Arrow to choose, then press Enter.')
  messages.push(repeatHelp)

  return messages
}
