import assert from 'node:assert/strict'
import test from 'node:test'
import { selectionMessages } from '../src/selection-speech.ts'

const response = {
  lines: [],
  prompt: 'Choose a type:',
  options: ['Income', 'Expense'],
}

test('reads selectable choices as separate spoken items', () => {
  assert.deepEqual(selectionMessages(response, 'Starting.'), [
    'Starting.',
    'Choose a type:',
    'Choice 1 of 2. Income.',
    'Choice 2 of 2. Expense.',
    'Use Up and Down Arrow to choose, then press Enter.',
    'To hear these choices again, on a Mac press the key beside the space bar and T. On other computers, press Control and T.',
  ])
})

test('introduces repeated choices without repeating the previous result', () => {
  const messages = selectionMessages(response, 'Starting.', true)

  assert.equal(messages[0], 'Here are the choices again.')
  assert.doesNotMatch(messages.join(' '), /Starting/)
  assert.match(messages.at(-1), /Control and T/)
})

test('spoken selection guidance avoids specialist interface words', () => {
  const spoken = selectionMessages(response).join(' ').toLowerCase()

  assert.doesNotMatch(spoken, /terminal|command prompt/)
})
