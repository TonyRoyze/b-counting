# B Counting · Native

A standalone Rust + GPUI accounting app with a regular macOS window, simple Ledger/Summary/Uncategorized navigation, and a floating command palette inspired by Zed. Built-in spoken feedback supports keyboard use without needing to see the screen. It runs independently of the existing Tauri app.

## Run on macOS

Install a current stable Rust toolchain and the Xcode command-line tools, then run from the repository root:

```sh
cargo run --manifest-path native-gpui/Cargo.toml --locked
```

The first build downloads and compiles GPUI's dependencies. GPUI is pinned to **0.2.2**. Its `runtime_shaders` feature compiles Metal shaders at launch, avoiding a separate Metal compiler download. The implementation uses the [official GPUI API and examples](https://github.com/zed-industries/zed/tree/main/crates/gpui).

For an optimized binary:

```sh
cargo build --manifest-path native-gpui/Cargo.toml --release --locked
./native-gpui/target/release/b-counting-gpui
```

macOS is the initial target. Linux and Windows behavior and packaging have not been verified.

## Use

Press **⌘K** or **⌘⇧P** to open commands. To launch with commands already open, run `cargo run --manifest-path native-gpui/Cargo.toml --locked -- --commands`. Type to filter, use **↑ / ↓** to select, and **Enter** to run. The selected command scrolls into view. **Escape** closes the palette. Commands needing a name, search term, or path change to a fresh input prompt. Enter just the value and press Enter; the app appends it to the selected command and runs it. Invalid values stay in that prompt for correction. Escape returns to command selection. Options appear below the current input when available: organizations, existing categories, currencies, date defaults, report files, and transaction Save/Cancel. Use the arrows and Enter or click an option; you can also type a custom value. The transaction review still requires an explicit Save choice or `save`, so a blank Enter never saves. Commands that return an answer keep the palette open: the result appears below the prompt followed by relevant next steps. For example, `org list` shows the current organization and the available names, then offers switching, creating an organization, and viewing its ledger. Enter another command to continue, or press Escape to return to the full command list. You can also type the full command directly.

Spoken feedback is **on by default** on macOS. The app announces its startup instructions, palette options when navigating, each transaction prompt, validation errors, the full review before saving, and the save result. During entry, **⌘R** repeats the prompt and current input; while searching commands it reads the match count and selected option. The preference is saved in `spoken-feedback.json` in the app's data directory. Speech uses macOS `/usr/bin/say`, with no model download or network service. Each new announcement interrupts this app's previous speech. Closing the app stops its speech.

| Audio shortcut / command | Behavior |
| --- | --- |
| **⌘R** | Repeat the current prompt or selected command |
| **⌘⇧R** | Read the current view |
| **Ctrl+C** | Stop speech |
| **⌘,** | Open native settings (font size, speech voice, receipt scan model) |
| **⌘⇧A**, `audio` | Toggle spoken feedback |
| `audio on` / `audio off` | Set spoken feedback explicitly |
| `read` | Read the first matching transaction, summary, receipt, or help |
| `read next` / `read previous` | Read matching ledger records one at a time |
| `repeat` / `stop` | Repeat the current prompt / stop speech |

Ledger announcements include date, type, amount, currency, description, and category. Summaries read separate totals for every currency. Receipt announcements include review status, missing values, classification, evidence, and available review commands. **⌘⇧R** reads the currently selected audio record; `read` resets to the first. Speech is separate from VoiceOver and can be turned off if another screen reader is in use. This is keyboard control with spoken output; microphone recognition is not included.

| Command | Behavior |
| --- | --- |
| `income` | Record income |
| `expense`, `new`, `n` | Record an expense |
| `ledger`, `recent`, `r` | Show the ledger |
| `summary`, `s` | Show income, expenses, and net movement per currency |
| `find coffee` | Search transaction descriptions, categories, dates, types, and displayed amounts |
| `review` | Show uncategorized records |
| `org list` | List organizations and show the current one |
| `org create NAME` | Create a separate set of accounts and switch to it |
| `org use NAME` | Switch to an existing organization's accounts |
| `scan-downloads` | List Downloads ZIP files, newest first, and choose one to scan |
| `scan-zip` | Open the native file picker to choose a ZIP chat export and scan it |
| `scan /path/to/export.zip` | Scan a ZIP or extracted folder and open the in-app review |
| `import [report.json]` | Open the latest scan or a chosen report for review |
| `accept` / `skip` / `next` / `prev` / `done` | Review each receipt and add chosen fees to the ledger |
| `export` | Write a B-Counting TSV file to the data directory |
| `folder` | Reveal the data directory in Finder |
| `help`, `?` | Show the command reference |
| `quit`, `exit` | Close the application |

Entry asks for amount, description, optional category, currency (default LKR), and date (default today), then shows a review. Type `save` at review to persist it. Escape or `cancel` discards the draft. Closing the app also discards an unsaved draft. An unsuccessful save leaves the draft available to retry.

Both panels start closed. **⌘B** toggles the left navigation panel; **⌘⌥B** toggles the right actions panel. Opening either panel transfers keyboard focus to it. **↑ / ↓** selects options (stopping at the first/last option), **Home / End** jumps to the first/last option, and **Enter** activates the selected option. The left panel contains Ledger, Summary, Uncategorized, and Command reference; the right contains Record income, Record expense, Export ledger, and Open data folder.

**Escape** closes the focused panel and returns focus to the command input without clearing typed text or cancelling an in-progress transaction. Toggling a focused panel closed does the same; closing an unfocused panel preserves the other control's focus. Both panels can stay open independently. Selections are remembered when panels close. Left-panel navigation keeps focus in that panel; starting a transaction from the right panel focuses the command input. A blue divider and selected row identify the focused panel. The toolbar also offers mouse toggles.

Other shortcuts: **⌘N** new expense, **⌘1** ledger, **⌘2** summary, **⌘K** / **⌘⇧P** open commands while leaving panels open, **Escape** in the command input cancels/clears search, **⌘Q** quit. Text editing supports selection, clipboard, Unicode grapheme navigation, and native IME composition.

## Data

The app starts with an empty ledger; it never adds sample financial records. The existing data directory is the `Default` organization, so existing records remain available. New organizations live in `~/Library/Application Support/b-counting-gpui/organizations/<name>/ledger.json` on macOS, with their display name stored alongside the ledger. Switch organizations with `org use NAME`; each has its own independent transactions and summaries. It does not read or modify the existing Tauri/web app's data.

To use another directory, including an isolated test workspace:

```sh
BCOUNTING_DATA_DIR=/tmp/my-native-books cargo run --manifest-path native-gpui/Cargo.toml --locked
```

Amounts use integer cents, with two decimal places for every currency. Summaries use separate totals per currency and do not convert currencies. Writes use a synced temporary file and atomic replacement. A session-wide file lock prevents two instances from overwriting each other's changes. Unreadable or invalid ledgers produce an error and disable entry rather than replacing the original file.

`export` writes a timestamped UTF-8 TSV using the existing app's `# B-Counting ledger v1` format, including escaped tabs, newlines, and backslashes. Exported accounts default to Cash; creation timestamps use midnight UTC on the transaction date because this initial native schema stores the transaction date, not a separate creation timestamp.

Choose **Scan ZIP from Downloads** (or type `scan-downloads`) to automatically list ZIP files in the system Downloads folder, newest first. The regular `scan` prompt also loads this list. Use arrow keys to hear file names and Enter to scan the selected file, or type to filter. The list refreshes whenever the scan prompt opens; **Refresh Downloads ZIP list** updates it while open. Finding files does not scan them until you choose one. Files outside Downloads can still be selected with the file picker or a path.

Choose **Upload ZIP and scan** in commands (or type `scan-zip`) to select a WhatsApp export ZIP with the native file picker. The `scan` prompt also offers **Choose ZIP file…**, and accepts a ZIP path or an extracted export folder. Archives containing a single chat inside a parent folder are supported. ZIP extraction happens in a temporary directory that is removed after text extraction; the original ZIP is preserved. Only the chat and supported receipt files are extracted. Unsafe paths, symbolic links, duplicate output paths, multiple chats, and invalid archives are rejected. ZIPs may contain up to 10,000 entries, with a maximum of 64 MB per scanned file and 512 MB of extracted chat/receipts. PDFs and images in attachment subfolders are supported.

`scan /path/to/WhatsApp-export` reads `_chat.txt`, extracts text from linked PDFs with Poppler (`pdftotext`) and OCRs images with Tesseract. Scanned PDFs also need Poppler's `pdftoppm`. The app starts the local Codex app-server using the existing Codex CLI sign-in to classify the extracted documents as income, expense, or unclear. This uses Codex plan access rather than an OpenAI API key or Cloudflare account; model use is subject to the limits and availability of your ChatGPT/Codex plan. Install and sign in to the Codex CLI before scanning. The report is saved as `finance-scan-*.json` in the current organization's data folder and opens in the review page. For each document, check the detected amount, date, direction, and purpose. Enter `kind income` or `kind expense`, then set your ledger category with `category VALUE`; add a voucher/receipt number with `voucher VALUE` when you have one. Correct extracted values with `amount VALUE`, `date YYYY-MM-DD`, or `currency CODE`. Use `accept` to add the entry, `skip` to dismiss it, or `done` to close review. Direction and category must be set before accepting. Import a saved report later with `import` (latest report) or `import /path/to/report.json`. The app checks for an identical ledger entry to avoid importing the same document twice. Voucher numbers are stored on the transaction and included in TSV exports.

## Scope

This is a working first native version, not full feature parity. It supports recording, browsing, searching, summaries, and export. Editing/deleting records, account/asset/deposit management, category management, microphone input, and production packaging are not implemented. Receipt report import and built-in macOS speech are supported. `review` lists uncategorized records; it does not modify them. VoiceOver and other assistive-technology support have **not** been validated; built-in speech and keyboard access do not establish full screen-reader accessibility. Testing with blind users and VoiceOver remains necessary.

## Verify

```sh
cargo fmt --manifest-path native-gpui/Cargo.toml --check
cargo test --manifest-path native-gpui/Cargo.toml --locked
cargo clippy --manifest-path native-gpui/Cargo.toml --all-targets --locked -- -D warnings
```

Tests cover command answers and next-step execution, ZIP extraction, nested linked attachments, cleanup, invalid archives, path traversal, and symbolic links, command filtering/selection, automatic argument composition and retry, contextual options, explicit transaction review confirmation, argument prompts, spoken validation errors, filtered-record reading, summaries, saved speech preferences, exact amounts, draft validation, currency separation, persistence, locking, corrupt files, failed writes, keyboard-driven entry/navigation, independent panel toggles, focus transfer, arrow-key selection, and draft preservation when closing panels.
