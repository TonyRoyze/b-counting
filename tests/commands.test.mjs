import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  suggestCommand,
} from '../src/commands.ts'

test('parses canonical commands and aliases', () => {
  assert.equal(parseCommand(' NEW ')?.name, 'new')
  assert.equal(parseCommand('add')?.name, 'new')
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
  assert.deepEqual(shortcuts, ['n', 'st', 'h', 'a', 'c'])
})

test('rejects unknown commands and suggests close matches', () => {
  assert.equal(parseCommand('missing'), null)
  assert.equal(suggestCommand('neww'), 'new')
  assert.equal(suggestCommand('nothing'), null)
})
