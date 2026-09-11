import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commands,
  findCommand,
  parseCommand,
  primaryShortcut,
  spokenCommandHelp,
  spokenCommandHelpParagraph,
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
  assert.deepEqual(shortcuts, ['n', 'r', 'rp', 'b', 'st', 'ct', 'ac', 'fa', 'dp', 'tr', 'bs', 'h', 'a', 'c'])
})

test('rejects unknown commands and suggests close matches', () => {
  assert.equal(parseCommand('missing'), null)
  assert.equal(suggestCommand('neww'), 'new')
  assert.equal(suggestCommand('nothing'), null)
})

test('formats each help command as a descriptive spoken sentence', () => {
  assert.deepEqual(commands.map(spokenCommandHelp), [
    'To record a new income or expense, type N.',
    'To review your most recently saved transactions, type R.',
    'To show a bank-style statement with debit, credit, and running balances, type R P.',
    'To save or download a readable text copy of your ledger, type B.',
    'To change speech, currency, file storage, and appearance, type S T.',
    'To list, rename, archive, or restore categories, type C T.',
    'To add a bank or cash account and track its balance, type A C.',
    'To record a fixed asset and calculate its current book value, type F A.',
    'To record a refundable deposit as an asset, type D P.',
    'To move money between two financial accounts, type T R.',
    'To show bank balances, fixed assets, and deposits, type B S.',
    'To list available actions or explain one action, type H.',
    'To show information about B-Counting, type A.',
    'To clear previous activity from the screen, type C.',
  ])
})

test('combines help into one descriptive paragraph', () => {
  const paragraph = spokenCommandHelpParagraph()

  assert.match(paragraph, /^Here are the things you can do\./)
  assert.match(paragraph, /type R P\./)
  assert.match(paragraph, /After typing a shortcut, press Enter\./)
  assert.equal(paragraph.includes('\n'), false)
})

test('spoken help avoids technical interface jargon', () => {
  const spokenHelp = commands.map(spokenCommandHelp).join(' ').toLowerCase()

  assert.doesNotMatch(spokenHelp, /terminal|command prompt|\bcommand\b/)
})
