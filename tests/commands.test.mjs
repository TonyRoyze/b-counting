import assert from 'node:assert/strict'
import test from 'node:test'
import { findCommand, parseCommand, suggestCommand } from '../src/commands.ts'

test('parses canonical commands and aliases', () => {
  assert.equal(parseCommand(' NEW ')?.name, 'new')
  assert.equal(parseCommand('add')?.name, 'new')
  assert.equal(parseCommand('set')?.name, 'settings')
  assert.equal(parseCommand('? clear')?.arguments[0], 'clear')
  assert.equal(findCommand('n')?.name, 'new')
})

test('rejects unknown commands and suggests close matches', () => {
  assert.equal(parseCommand('missing'), null)
  assert.equal(suggestCommand('neww'), 'new')
  assert.equal(suggestCommand('nothing'), null)
})
