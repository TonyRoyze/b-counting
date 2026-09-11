import type { FlowResponse } from './transaction-flow.ts'

const repeatHelp =
  'To hear these choices again, press Control and T.'

export function selectionMessages(
  response: FlowResponse,
  introduction?: string,
  repeated = false,
): string[] {
  const options = response.options ?? []
  const spokenOptions = response.spokenOptions ?? options
  const messages: string[] = []

  if (repeated) {
    messages.push('Here are the choices again.')
  } else if (introduction?.trim()) {
    messages.push(introduction.trim())
  }

  if (response.prompt?.trim()) {
    messages.push(response.prompt.trim())
  }

  if (response.announceOptions === false && !repeated) {
    messages.push('Use the Up and Down Arrow keys to choose, then press Enter.')
    return messages
  }

  messages.push(
    ...spokenOptions.map(
      (option, index) => `Choice ${index + 1} ${option}.`,
    ),
  )
  messages.push('Use the Up and Down Arrows to choose, then press Enter.')
  messages.push(repeatHelp)

  return messages
}
