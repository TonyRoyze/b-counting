# Implemented features (previous version)

This file records the capabilities present before the project was reset. It is an inventory, not a promise that these features are still in the codebase.

## Command interface and accessibility

- Keyboard driven terminal style interface with a command prompt and command history navigation using the up and down arrow keys.
- Command help, command aliases and shortcuts, suggestions for unknown commands, and spoken command guidance.
- Interactive flows with selectable options, arrow key navigation, spoken option announcements, and Escape to cancel.
- Screen reader announcements through a live region and keyboard accessible controls.

## Transactions

- Guided creation of income and expense transactions, including amount, description, date, category, and confirmation.
- Amount normalization and currency aware spoken amounts.
- Transaction editing and cancellation, plus a recent transaction flow to review and select existing entries.
- Default income and expense categories, custom category creation and renaming, and category archive and restore.
- Category usage tracking that maintains category references for existing transactions.
- Transaction data saved in browser local storage, with validation when loading saved data.

## Accounting records

- Financial accounts and balances.
- Fixed asset records and book value calculations over time.
- Refundable deposit records.
- Transfers between accounts.
- Guided flows for recording accounts, assets, deposits, and transfers.

## Reports

- Financial statement summaries based on recorded transactions.
- Income and expense totals with expense breakdowns by category.
- Spoken report summaries and a financial summary view.

## Speech and preferences

- Optional read aloud for results and choices, with system speech or a local Kokoro natural voice engine.
- Selectable Kokoro voices, speech rate, and brief, standard, or detailed spoken output.
- Currency preference (LKR, USD, EUR, GBP).
- Dark and high contrast appearance settings.
- Settings persisted in local storage.

## Ledger files

- Configurable ledger text file location for desktop use.
- Import existing ledger files and write transaction changes to the selected ledger.
- Downloadable ledger backup in browser use.

## Desktop application

- Tauri desktop application configuration, with macOS app and DMG bundle targets and platform icon assets.
