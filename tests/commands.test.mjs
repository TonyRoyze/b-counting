import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  spokenCommandHelp,
  suggestCommand,
} from '../src/commands.ts'

test('parses canonical commands and aliases', () => {
  assert.equal(parseCommand(' NEW ')?.name, 'new')
  assert.equal(parseCommand('add')?.name, 'new')
  assert.equal(parseCommand('r')?.name, 'recent')
  assert.equal(parseCommand('st')?.name, 'settings')
  assert.equal(parseCommand('a')?.name, 'about')
  assert.equal(parseCommand('c')?.name, 'clear')
  assert.equal(parseCommand('? clear')?.arguments[0], 'clear')
  assert.equal(findCommand('n')?.name, 'new')
})

test('gives every command a unique one or two letter shortcut', () => {
  const shortcuts = commands.map(primaryShortcut)

  assert.equal(shortcuts.every((shortcut) => shortcut.length <= 2), true)
  assert.equal(new Set(shortcuts).size, commands.length)
  assert.deepEqual(shortcuts, ['n', 'r', 'st', 'ct', 'h', 'a', 'c'])
})

test('rejects unknown commands and suggests close matches', () => {
  assert.equal(parseCommand('missing'), null)
  assert.equal(suggestCommand('neww'), 'new')
  assert.equal(suggestCommand('nothing'), null)
})

test('formats each help command as a separate spoken item', () => {
  assert.deepEqual(commands.map(spokenCommandHelp), [
    'new. Type n. Record a new income or expense.',
    'recent. Type r. Review your most recently saved transactions.',
    'settings. Type st. Change speech, currency, and appearance preferences.',
    'categories. Type ct. List, rename, archive, or restore categories.',
    'help. Type h. List available actions or explain one action.',
    'about. Type a. Show information about B-Counting.',
    'clear. Type c. Clear previous activity from the screen.',
  ])
})

test('spoken help avoids technical interface jargon', () => {
  const spokenHelp = commands.map(spokenCommandHelp).join(' ').toLowerCase()

  assert.doesNotMatch(spokenHelp, /terminal|command prompt|\bcommand\b/)
})
