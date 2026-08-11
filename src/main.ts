import './style.css'

const form = document.querySelector<HTMLFormElement>('#command-form')
const commandInput = document.querySelector<HTMLInputElement>('#command-input')
const announcer = document.querySelector<HTMLElement>('#announcer')

if (!form || !commandInput || !announcer) {
  throw new Error('The command interface could not be initialized.')
}

form.addEventListener('submit', (event) => {
  event.preventDefault()

  if (commandInput.value.trim() === '') {
    announcer.textContent = 'Enter a command. Type help for available commands.'
    commandInput.focus()
  }
})
