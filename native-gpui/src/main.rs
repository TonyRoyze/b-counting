mod downloads;
mod input;
mod ledger;
mod receipt_scan;
mod receipt_zip;
mod speech;

use gpui::Focusable;

use chrono::{NaiveDate, Utc};
use gpui::{
    App, Application, Bounds, Context, Entity, KeyBinding, SharedString, TitlebarOptions, Window,
    WindowBounds, WindowOptions, actions, div, prelude::*, px, rgb, size,
};
use input::TextInput;
use ledger::{Draft, Kind, Ledger, Transaction, money, totals};
use std::{fs, path::PathBuf};

const BASE: u32 = 0x282c34;
const PANEL: u32 = 0x21252b;
const LINE: u32 = 0x373e49;
const TEXT: u32 = 0xdce2ee;
const MUTED: u32 = 0x9ca7ba;
const BLUE: u32 = 0x82aaff;
const GREEN: u32 = 0x98c379;
const RED: u32 = 0xe5a0a5;

actions!(
    workspace,
    [
        Submit,
        Cancel,
        FocusCommand,
        PaletteUp,
        PaletteDown,
        RepeatSpeech,
        ReadView,
        StopSpeech,
        ToggleSpeech,
        OpenSettings,
        NewExpense,
        ShowLedger,
        ShowSummary,
        ToggleLeft,
        ToggleRight,
        PanelUp,
        PanelDown,
        PanelFirst,
        PanelLast,
        PanelAccept,
        PanelClose,
        Quit
    ]
);

#[derive(Clone, Copy, PartialEq)]
enum Page {
    Ledger,
    Summary,
    Review,
    ReceiptReview,
    Help,
    Settings,
}
impl Page {
    fn label(self) -> &'static str {
        match self {
            Self::Ledger => "Ledger",
            Self::Summary => "Summary",
            Self::Review => "Uncategorized",
            Self::ReceiptReview => "Receipt review",
            Self::Help => "Command reference",
            Self::Settings => "Settings",
        }
    }
}

const PAGES: [Page; 6] = [
    Page::Ledger,
    Page::Summary,
    Page::Review,
    Page::ReceiptReview,
    Page::Help,
    Page::Settings,
];

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct NativeSettings {
    font_size: u8,
    speech_voice: String,
    scan_model: String,
}
impl Default for NativeSettings {
    fn default() -> Self {
        Self {
            font_size: 14,
            speech_voice: "Alex".into(),
            scan_model: "default".into(),
        }
    }
}
const PANEL_ACTIONS: [&str; 4] = [
    "Record income",
    "Record expense",
    "Export ledger",
    "Open data folder",
];

#[derive(Clone, Copy)]
enum Side {
    Left,
    Right,
}

struct Pane {
    open: bool,
    selected: usize,
    focus: gpui::FocusHandle,
}

struct PaletteCommand {
    label: &'static str,
    command: &'static str,
    hint: &'static str,
    argument: bool,
}

const COMMANDS: &[PaletteCommand] = &[
    PaletteCommand {
        label: "Record income",
        command: "income",
        hint: "Start a guided income entry.",
        argument: false,
    },
    PaletteCommand {
        label: "Record expense",
        command: "expense",
        hint: "Start a guided expense entry.",
        argument: false,
    },
    PaletteCommand {
        label: "Show ledger",
        command: "ledger",
        hint: "Browse transactions. Command Shift R reads a record.",
        argument: false,
    },
    PaletteCommand {
        label: "Show summary",
        command: "summary",
        hint: "Hear income, expenses, and net totals for each currency.",
        argument: false,
    },
    PaletteCommand {
        label: "Review uncategorized",
        command: "review",
        hint: "Browse transactions without a category.",
        argument: false,
    },
    PaletteCommand {
        label: "Review receipts",
        command: "receipts",
        hint: "Open the current receipt review.",
        argument: false,
    },
    PaletteCommand {
        label: "Read current view",
        command: "read",
        hint: "Read the current view aloud.",
        argument: false,
    },
    PaletteCommand {
        label: "Read next transaction",
        command: "read next",
        hint: "Read the next matching transaction.",
        argument: false,
    },
    PaletteCommand {
        label: "Read previous transaction",
        command: "read previous",
        hint: "Read the previous matching transaction.",
        argument: false,
    },
    PaletteCommand {
        label: "Repeat prompt",
        command: "repeat",
        hint: "Repeat the current prompt or message.",
        argument: false,
    },
    PaletteCommand {
        label: "Toggle spoken feedback",
        command: "audio",
        hint: "Turn spoken feedback on or off.",
        argument: false,
    },
    PaletteCommand {
        label: "Stop speech",
        command: "stop",
        hint: "Stop the current announcement.",
        argument: false,
    },
    PaletteCommand {
        label: "Search transactions",
        command: "find",
        hint: "Enter search words at the next prompt.",
        argument: true,
    },
    PaletteCommand {
        label: "List organizations",
        command: "org list",
        hint: "List organizations and the current one.",
        argument: false,
    },
    PaletteCommand {
        label: "Create organization",
        command: "org create",
        hint: "Enter the new organization name at the next prompt.",
        argument: true,
    },
    PaletteCommand {
        label: "Switch organization",
        command: "org use",
        hint: "Choose an organization or enter its name.",
        argument: true,
    },
    PaletteCommand {
        label: "Scan ZIP from Downloads",
        command: "scan-downloads",
        hint: "List ZIP files in Downloads and choose one to scan.",
        argument: false,
    },
    PaletteCommand {
        label: "Upload ZIP and scan",
        command: "scan-zip",
        hint: "Choose a ZIP chat export in the file picker.",
        argument: false,
    },
    PaletteCommand {
        label: "All commands",
        command: "commands",
        hint: "Return to all available commands.",
        argument: false,
    },
    PaletteCommand {
        label: "Scan financial documents",
        command: "scan",
        hint: "Enter the export folder path at the next prompt.",
        argument: true,
    },
    PaletteCommand {
        label: "Import scan report",
        command: "import",
        hint: "Choose the latest report or enter a report path.",
        argument: true,
    },
    PaletteCommand {
        label: "Accept receipt",
        command: "accept",
        hint: "Save the reviewed receipt to the ledger.",
        argument: false,
    },
    PaletteCommand {
        label: "Skip receipt",
        command: "skip",
        hint: "Dismiss the current receipt.",
        argument: false,
    },
    PaletteCommand {
        label: "Next receipt",
        command: "next",
        hint: "Review the next receipt.",
        argument: false,
    },
    PaletteCommand {
        label: "Previous receipt",
        command: "prev",
        hint: "Review the previous receipt.",
        argument: false,
    },
    PaletteCommand {
        label: "Finish receipt review",
        command: "done",
        hint: "Close the receipt review.",
        argument: false,
    },
    PaletteCommand {
        label: "Correct receipt amount",
        command: "amount",
        hint: "Enter the receipt amount at the next prompt.",
        argument: true,
    },
    PaletteCommand {
        label: "Correct receipt date",
        command: "date",
        hint: "Enter YYYY-MM-DD at the next prompt.",
        argument: true,
    },
    PaletteCommand {
        label: "Correct receipt currency",
        command: "currency",
        hint: "Choose a currency or enter its three-letter code.",
        argument: true,
    },
    PaletteCommand {
        label: "Set transaction type",
        command: "kind",
        hint: "Enter income or expense.",
        argument: true,
    },
    PaletteCommand {
        label: "Set category",
        command: "category",
        hint: "Enter a category for this transaction.",
        argument: true,
    },
    PaletteCommand {
        label: "Set voucher / receipt number",
        command: "voucher",
        hint: "Enter a voucher or receipt number (optional).",
        argument: true,
    },
    PaletteCommand {
        label: "Export ledger",
        command: "export",
        hint: "Save a TSV file in the current data folder.",
        argument: false,
    },
    PaletteCommand {
        label: "Open data folder",
        command: "folder",
        hint: "Reveal the current data folder in Finder.",
        argument: false,
    },
    PaletteCommand {
        label: "Command help",
        command: "help",
        hint: "Show command examples and keyboard shortcuts.",
        argument: false,
    },
    PaletteCommand {
        label: "Quit application",
        command: "quit",
        hint: "Close B Counting.",
        argument: false,
    },
];

#[derive(Clone)]
struct PaletteEntry {
    label: String,
    value: String,
    hint: String,
}

impl PaletteCommand {
    fn prompt(&self) -> &'static str {
        match self.command {
            "find" => "Search transactions",
            "org create" => "New organization name",
            "org use" => "Choose an organization or type its name",
            "scan" => "Choose a Downloads ZIP, or enter a ZIP / folder path",
            "import" => "Report path · Enter for the latest report",
            "amount" => "Receipt amount · e.g. 1250.50",
            "date" => "Receipt date · YYYY-MM-DD",
            "currency" => "Receipt currency · three-letter code",
            "kind" => "Transaction type · income or expense",
            "category" => "Ledger category · e.g. Supplies or Donations",
            "voucher" => "Voucher / receipt number · optional",
            _ => "Enter a value",
        }
    }
}

struct CommandResult {
    title: String,
    lines: Vec<String>,
    next: Vec<PaletteEntry>,
}

struct Workspace {
    input: Entity<TextInput>,
    ledger: Option<Ledger>,
    data_root: PathBuf,
    organization: String,
    load_error: Option<String>,
    draft: Option<Draft>,
    page: Page,
    query: String,
    message: String,
    is_error: bool,
    left: Pane,
    right: Pane,
    selected: Option<String>,
    receipt_queue: Vec<ReceiptReviewItem>,
    receipt_index: usize,
    palette_open: bool,
    palette_selected: usize,
    pending_command: Option<&'static PaletteCommand>,
    command_result: Option<CommandResult>,
    scan_busy: bool,
    downloads_dir: Option<PathBuf>,
    download_zips: Vec<PathBuf>,
    downloads_busy: bool,
    option_selected: bool,
    palette_scroll: gpui::ScrollHandle,
    speech: speech::Speech,
    audio_enabled: bool,
    audio_row: usize,
    settings: NativeSettings,
    _input_observer: gpui::Subscription,
}

#[derive(Clone, serde::Deserialize)]
struct ReceiptResult {
    filename: String,
    #[serde(default = "unclear_kind")]
    kind: String,
    #[serde(default, alias = "category")]
    purpose: String,
    #[serde(default)]
    date: Option<String>,
    #[serde(default, alias = "payer")]
    counterparty: Option<String>,
    #[serde(default)]
    amount: Option<f64>,
    #[serde(default)]
    currency: Option<String>,
    #[serde(default)]
    confidence: String,
    #[serde(default)]
    evidence: String,
}

struct ReceiptReviewItem {
    result: ReceiptResult,
    category: String,
    voucher_number: String,
    imported: bool,
    skipped: bool,
}

fn unclear_kind() -> String {
    "unclear".into()
}

#[derive(serde::Deserialize)]
struct ReceiptReport {
    results: Vec<ReceiptResult>,
}

impl ReceiptReport {
    fn load(path: &std::path::Path) -> Result<Self, String> {
        let bytes = fs::read(path).map_err(|error| format!("Cannot read scan report: {error}"))?;
        let report: Self = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Invalid finance scan report: {error}"))?;
        if report.results.is_empty() {
            return Err("This scan report contains no receipt results.".into());
        }
        Ok(report)
    }
}

fn latest_scan_report(directory: &std::path::Path) -> Result<PathBuf, String> {
    let mut reports = fs::read_dir(directory)
        .map_err(|error| format!("Cannot list scan reports: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("finance-scan-") && name.ends_with(".json"))
        })
        .collect::<Vec<_>>();
    reports.sort();
    reports
        .pop()
        .ok_or_else(|| "No finance scan report found. Run scan first.".into())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct OrganizationInfo {
    name: String,
}

fn organization_slug(name: &str) -> Result<String, String> {
    let slug = name
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() || slug.len() > 64 {
        return Err("Use an organization name with 1–64 letters or numbers.".into());
    }
    if name.eq_ignore_ascii_case("default") {
        return Err("'Default' is reserved for your existing ledger.".into());
    }
    Ok(slug)
}

impl Workspace {
    fn new(path: PathBuf, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(TextInput::new);
        window.focus(&input.focus_handle(cx));
        let (ledger, load_error) = match Ledger::open(path.clone()) {
            Ok(ledger) => (Some(ledger), None),
            Err(error) => (None, Some(error)),
        };
        let audio_enabled = fs::read(path.join("spoken-feedback.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok())
            .unwrap_or(true);
        let settings = fs::read(path.join("settings.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let observer = cx.observe(&input, |this, _, cx| {
            this.palette_selected = 0;
            this.option_selected = false;
            this.palette_scroll.scroll_to_item(0);
            cx.notify();
        });
        let mut workspace = Self {
            input,
            ledger,
            data_root: path,
            organization: "Default".into(),
            load_error,
            draft: None,
            page: Page::Ledger,
            query: String::new(),
            message: "Ready.".into(),
            is_error: false,
            left: Pane {
                open: false,
                selected: 0,
                focus: cx.focus_handle(),
            },
            right: Pane {
                open: false,
                selected: 0,
                focus: cx.focus_handle(),
            },
            selected: None,
            receipt_queue: Vec::new(),
            receipt_index: 0,
            palette_open: false,
            palette_selected: 0,
            pending_command: None,
            command_result: None,
            scan_busy: false,
            downloads_dir: if cfg!(test) {
                None
            } else {
                directories::UserDirs::new()
                    .and_then(|dirs| dirs.download_dir().map(std::path::Path::to_owned))
            },
            download_zips: Vec::new(),
            downloads_busy: false,
            option_selected: false,
            palette_scroll: gpui::ScrollHandle::default(),
            speech: speech::Speech::default(),
            audio_enabled,
            audio_row: 0,
            settings,
            _input_observer: observer,
        };
        workspace.announce("Welcome to B Counting. Press Command K to open commands. Command comma opens settings. Control C stops speech.");
        workspace
    }

    fn announce(&mut self, text: &str) {
        if self.audio_enabled
            && let Err(error) = self
                .speech
                .speak_with_voice(text, &self.settings.speech_voice)
        {
            self.message = error;
            self.is_error = true;
        }
    }

    fn set_audio(&mut self, enabled: bool) {
        self.audio_enabled = enabled;
        self.speech.stop();
        self.message = if enabled {
            "Spoken feedback on."
        } else {
            "Spoken feedback off. Press Command Shift A to turn it on."
        }
        .into();
        if let Err(error) = fs::write(
            self.data_root.join("spoken-feedback.json"),
            if enabled { "true" } else { "false" },
        ) {
            self.message
                .push_str(&format!(" Could not save preference: {error}"));
            self.is_error = true;
        }
        // Announce the transition even when switching feedback off.
        if let Err(error) = self
            .speech
            .speak_with_voice(&self.message, &self.settings.speech_voice)
        {
            self.message = error;
            self.is_error = true;
        }
    }

    fn save_settings(&mut self) {
        if let Ok(bytes) = serde_json::to_vec_pretty(&self.settings) {
            if let Err(error) = fs::write(self.data_root.join("settings.json"), bytes) {
                self.message = format!("Could not save settings: {error}");
                self.is_error = true;
            }
        }
    }

    fn settings_view(&self, cx: &mut Context<Self>) -> gpui::Div {
        let choices = [
            (
                "font-size",
                format!(
                    "Font size  {} px   (click to change)",
                    self.settings.font_size
                ),
            ),
            (
                "speech-voice",
                format!(
                    "Speech voice  {}   (click to change)",
                    self.settings.speech_voice
                ),
            ),
            (
                "scan-model",
                format!(
                    "Receipt scan model  {}   (click to change)",
                    self.settings.scan_model
                ),
            ),
        ];
        div().flex_1().p_8().child(
            div()
                .max_w(px(650.))
                .mx_auto()
                .flex()
                .flex_col()
                .gap_4()
                .child(div().text_size(px(24.)).child("Settings"))
                .child(div().text_color(rgb(MUTED)).child(
                    "Choose the text size, macOS voice, and Codex model used for receipt scanning.",
                ))
                .children(choices.into_iter().map(|(id, label)| {
                    div()
                        .id(id)
                        .cursor_pointer()
                        .p_4()
                        .rounded_md()
                        .border_1()
                        .border_color(rgb(LINE))
                        .bg(rgb(PANEL))
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            match id {
                                "font-size" => {
                                    this.settings.font_size = if this.settings.font_size >= 20 {
                                        12
                                    } else {
                                        this.settings.font_size + 2
                                    }
                                }
                                "speech-voice" => {
                                    this.settings.speech_voice =
                                        match this.settings.speech_voice.as_str() {
                                            "Alex" => "Samantha",
                                            "Samantha" => "Victoria",
                                            _ => "Alex",
                                        }
                                        .into()
                                }
                                _ => {
                                    this.settings.scan_model =
                                        if this.settings.scan_model == "default" {
                                            "gpt-5-codex"
                                        } else {
                                            "default"
                                        }
                                        .into()
                                }
                            }
                            this.save_settings();
                            cx.notify();
                        }))
                }))
                .child(
                    div()
                        .text_xs()
                        .text_color(rgb(MUTED))
                        .child("⌘, opens settings · Control C stops speech"),
                ),
        )
    }

    fn visible_rows(&self) -> Vec<&Transaction> {
        self.rows()
            .iter()
            .rev()
            .filter(|row| {
                (self.page != Page::Review || row.category.is_empty())
                    && (self.query.is_empty()
                        || format!(
                            "{} {} {} {} {} {}",
                            row.description,
                            row.category,
                            row.date,
                            row.currency,
                            row.kind.label(),
                            money(row.cents as i128)
                        )
                        .to_lowercase()
                        .contains(&self.query))
            })
            .collect()
    }

    fn view_speech(&self) -> String {
        let heading = format!("{}. Organization {}.", self.page.label(), self.organization);
        match self.page {
            Page::Ledger | Page::Review => {
                let rows = self.visible_rows();
                if rows.is_empty() {
                    return format!(
                        "{heading} No matching transactions. Press Command K and choose Record income or Record expense."
                    );
                }
                let index = self.audio_row.min(rows.len() - 1);
                let row = rows[index];
                format!(
                    "{heading} {} transactions. Transaction {} of {}. {}. {}. {} {}. {}. Category {}. Use read next or read previous in commands to hear another transaction.",
                    rows.len(),
                    index + 1,
                    rows.len(),
                    row.date,
                    row.kind.label(),
                    row.currency,
                    money(row.cents as i128),
                    row.description,
                    if row.category.is_empty() {
                        "Uncategorized"
                    } else {
                        &row.category
                    }
                )
            }
            Page::Summary => {
                let summaries = totals(self.rows());
                if summaries.is_empty() {
                    return format!("{heading} No transactions yet.");
                }
                format!(
                    "{heading} {}",
                    summaries
                        .iter()
                        .map(|(currency, (income, expense))| format!(
                            "{currency}. Income {}. Expenses {}. Net {}.",
                            money(*income),
                            money(*expense),
                            money(income - expense)
                        ))
                        .collect::<Vec<_>>()
                        .join(" ")
                )
            }
            Page::ReceiptReview => match self.receipt_queue.get(self.receipt_index) {
                None => format!("{heading} No receipts to review. Use import or scan in commands."),
                Some(item) => {
                    let result = &item.result;
                    format!(
                        "{heading} Document {} of {}. {}. Status {}. {}. {} {}. Date {}. Category {}. Voucher {}. Evidence {}. Use kind income or kind expense, category VALUE, voucher VALUE, then accept. Use skip, next, or prev to navigate.",
                        self.receipt_index + 1,
                        self.receipt_queue.len(),
                        result.filename,
                        if item.imported {
                            "Imported"
                        } else if item.skipped {
                            "Skipped"
                        } else {
                            "Awaiting review"
                        },
                        result.purpose,
                        result
                            .amount
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "missing amount".into()),
                        result.currency.as_deref().unwrap_or("missing currency"),
                        result.date.as_deref().unwrap_or("missing date"),
                        if item.category.is_empty() {
                            "not set"
                        } else {
                            &item.category
                        },
                        if item.voucher_number.is_empty() {
                            "not set"
                        } else {
                            &item.voucher_number
                        },
                        result.evidence
                    )
                }
            },
            Page::Help => format!(
                "{heading} Press Command K. Type to search commands, use up and down to hear options, then Enter to run. Commands needing a value will ask for it. Command comma opens settings. Control C stops speech. Command R repeats the current prompt. Escape closes commands or cancels an unsaved transaction."
            ),
            Page::Settings => format!(
                "{heading} Use the settings controls to change font size, speech voice, and receipt scan model. Control C stops speech."
            ),
        }
    }

    fn prompt_speech(&self) -> String {
        if let Some(error) = &self.load_error {
            return error.clone();
        }
        if let Some(draft) = &self.draft {
            let review = if draft.step == 6 {
                format!(
                    "{}. {} {}. {}. Category {}. Date {}.",
                    draft.row.kind.label(),
                    draft.row.currency,
                    money(draft.row.cents as i128),
                    draft.row.description,
                    if draft.row.category.is_empty() {
                        "Uncategorized"
                    } else {
                        &draft.row.category
                    },
                    draft.row.date
                )
            } else {
                String::new()
            };
            return format!(
                "{} Step {} of 7. {} {}",
                self.message,
                draft.step + 1,
                review,
                draft.prompt()
            );
        }
        if let Some(command) = self.pending_command {
            return format!(
                "{} {}. {}. Enter submits the value. Escape returns to commands.",
                self.message,
                command.label,
                command.prompt()
            );
        }
        if let Some(result) = &self.command_result {
            return format!(
                "{}. {}. Choose a next step below, or type another command.",
                result.title,
                result.lines.join(". ")
            );
        }
        if self.page == Page::ReceiptReview {
            return format!("{} {}", self.message, self.view_speech());
        }
        self.message.clone()
    }

    fn repeat_speech(&mut self, cx: &App) {
        if self.palette_open
            && self.draft.is_none()
            && self.pending_command.is_none()
            && self.command_result.is_none()
        {
            let matches = self.palette_commands(cx);
            let text = if let Some(command) = matches.get(self.palette_selected) {
                format!(
                    "Search {}. {} matches. {}. {}. Enter to run.",
                    self.input.read(cx).value(),
                    matches.len(),
                    command.label,
                    command.hint
                )
            } else {
                format!(
                    "No matching commands. Current input {}. Enter runs this text.",
                    self.input.read(cx).value()
                )
            };
            self.announce(&text);
        } else {
            let entries = if self.palette_open {
                self.palette_entries(cx)
            } else {
                Vec::new()
            };
            let options = if !self.palette_open {
                String::new()
            } else if let Some(entry) = entries.get(self.palette_selected) {
                format!(
                    "{} options. {}. Use up and down to choose, or type a value.",
                    entries.len(),
                    entry.label
                )
            } else {
                "Type a value and press Enter.".into()
            };
            self.announce(&format!(
                "{} Current input {}. {}",
                self.prompt_speech(),
                self.input.read(cx).value(),
                options
            ));
        }
    }

    fn palette_commands(&self, cx: &App) -> Vec<&'static PaletteCommand> {
        Self::matching_commands(self.input.read(cx).value())
    }

    fn matching_commands(input: &str) -> Vec<&'static PaletteCommand> {
        let query = input.trim().to_lowercase();
        let mut matches: Vec<_> = COMMANDS
            .iter()
            .filter(|command| {
                query.is_empty()
                    || (command.argument && query.starts_with(&format!("{} ", command.command)))
                    || format!("{} {}", command.label, command.command)
                        .to_lowercase()
                        .contains(&query)
            })
            .collect();
        matches.sort_by_key(|command| command.command != query);
        matches
    }

    fn open_palette(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.palette_open = true;
        self.palette_selected = 0;
        self.option_selected = false;
        self.focus(window, cx);
        if self
            .pending_command
            .is_some_and(|command| command.command == "scan")
        {
            self.refresh_downloads(cx);
        }
        if self.draft.is_some() || self.pending_command.is_some() || self.command_result.is_some() {
            self.repeat_speech(cx);
        } else {
            let matches = self.palette_commands(cx);
            self.announce(&format!("Commands. {} options. Type to search, up and down to select, Enter to run, Escape to close. {}", matches.len(), matches.first().map(|c| c.label).unwrap_or("No matching commands. Type a command with its value and press Enter.")));
        }
        cx.notify();
    }

    fn input_options(&self) -> Vec<PaletteEntry> {
        let mut values = Vec::new();
        let mut add = |label: String, value: String| {
            values.push(PaletteEntry {
                label,
                value,
                hint: "Enter to choose".into(),
            })
        };
        if self
            .pending_command
            .is_some_and(|command| command.command == "scan")
        {
            for path in &self.download_zips {
                add(
                    format!(
                        "{} · Downloads",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    path.to_string_lossy().into(),
                );
            }
            add("Choose another ZIP file…".into(), "@choose-zip".into());
            add(
                "Refresh Downloads ZIP list".into(),
                "@refresh-downloads".into(),
            );
            return values;
        }
        if self
            .pending_command
            .is_some_and(|command| command.command == "org use")
        {
            for name in self.organizations() {
                add(name.clone(), name);
            }
        } else if self
            .pending_command
            .is_some_and(|command| command.command == "import")
        {
            add("Latest scan report".into(), String::new());
            if let Some(ledger) = &self.ledger
                && let Ok(entries) = fs::read_dir(&ledger.directory)
            {
                let mut paths: Vec<_> = entries
                    .flatten()
                    .map(|entry| entry.path())
                    .filter(|path| {
                        path.file_name()
                            .and_then(|name| name.to_str())
                            .is_some_and(|name| {
                                name.starts_with("finance-scan-") && name.ends_with(".json")
                            })
                    })
                    .collect();
                paths.sort();
                for path in paths.into_iter().rev() {
                    add(
                        path.file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into(),
                        path.to_string_lossy().into(),
                    );
                }
            }
        } else if self.draft.as_ref().is_some_and(|draft| draft.step == 2) {
            add("Leave uncategorized".into(), String::new());
            let categories: std::collections::BTreeSet<_> = self
                .rows()
                .iter()
                .filter(|row| !row.category.is_empty())
                .map(|row| row.category.clone())
                .collect();
            for category in categories {
                add(category.clone(), category);
            }
        } else if self
            .pending_command
            .is_some_and(|command| command.command == "category")
        {
            let categories: std::collections::BTreeSet<_> = self
                .rows()
                .iter()
                .filter(|row| !row.category.is_empty())
                .map(|row| row.category.clone())
                .collect();
            for category in categories {
                add(category.clone(), category);
            }
        } else if self
            .pending_command
            .is_some_and(|command| command.command == "kind")
        {
            add("Income".into(), "income".into());
            add("Expense".into(), "expense".into());
        } else if self
            .pending_command
            .is_some_and(|command| command.command == "voucher")
        {
            add("Leave blank".into(), String::new());
        } else if self.draft.as_ref().is_some_and(|draft| draft.step == 3)
            || self
                .pending_command
                .is_some_and(|command| command.command == "currency")
        {
            let currencies: std::collections::BTreeSet<_> = ["LKR", "USD", "EUR"]
                .into_iter()
                .map(str::to_owned)
                .chain(self.rows().iter().map(|row| row.currency.clone()))
                .collect();
            if self.draft.is_some() {
                add("LKR (default)".into(), String::new());
            }
            for code in currencies {
                if self.draft.is_none() || code != "LKR" {
                    add(code.clone(), code);
                }
            }
        } else if let Some(draft) = &self.draft {
            if draft.step == 4 {
                add(format!("{} (default date)", draft.row.date), String::new());
            }
            if draft.step == 5 {
                add("Leave voucher number blank".into(), String::new());
            }
            if draft.step == 6 {
                add("Save transaction".into(), "save".into());
                add("Cancel transaction".into(), "cancel".into());
            }
        }
        values
    }

    fn palette_entries(&self, cx: &App) -> Vec<PaletteEntry> {
        if let Some(result) = &self.command_result {
            let query = self.input.read(cx).value().trim().to_lowercase();
            let next: Vec<_> = result
                .next
                .iter()
                .filter(|entry| {
                    query.is_empty()
                        || format!("{} {}", entry.label, entry.value)
                            .to_lowercase()
                            .contains(&query)
                })
                .cloned()
                .collect();
            if !next.is_empty() || query.is_empty() {
                return next;
            }
            return self
                .palette_commands(cx)
                .iter()
                .map(|command| PaletteEntry {
                    label: command.label.into(),
                    value: command.command.into(),
                    hint: command.hint.into(),
                })
                .collect();
        }
        if self.draft.is_none() && self.pending_command.is_none() {
            return self
                .palette_commands(cx)
                .iter()
                .map(|command| PaletteEntry {
                    label: command.label.into(),
                    value: command.command.into(),
                    hint: command.hint.into(),
                })
                .collect();
        }
        let query = self.input.read(cx).value().trim().to_lowercase();
        self.input_options()
            .into_iter()
            .filter(|entry| {
                query.is_empty()
                    || format!("{} {}", entry.label, entry.value)
                        .to_lowercase()
                        .contains(&query)
            })
            .collect()
    }

    fn refresh_prompt(&self, cx: &mut Context<Self>) {
        let prompt = self
            .draft
            .as_ref()
            .map(Draft::prompt)
            .or_else(|| {
                self.pending_command
                    .map(|command| command.prompt().to_owned())
            })
            .unwrap_or_else(|| {
                if self.command_result.is_some() {
                    "Choose a next step or type another command…".into()
                } else {
                    "Type a command…".into()
                }
            });
        self.input
            .update(cx, |input, cx| input.set_placeholder(&prompt, cx));
    }

    fn request_argument(
        &mut self,
        command: &'static PaletteCommand,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.command_result = None;
        self.pending_command = Some(command);
        self.palette_selected = 0;
        self.option_selected = false;
        self.is_error = false;
        self.input.update(cx, |input, cx| input.clear(cx));
        self.refresh_prompt(cx);
        self.message = "Enter the value; the command is added automatically.".into();
        if command.command == "scan" {
            self.refresh_downloads(cx);
        }
        self.repeat_speech(cx);
        self.focus(window, cx);
    }

    fn move_palette(&mut self, direction: isize, cx: &mut Context<Self>) {
        if !self.palette_open {
            return;
        }
        let entries = self.palette_entries(cx);
        self.palette_selected = if !self.option_selected
            && (self.pending_command.is_some()
                || self.draft.is_some()
                || self.command_result.is_some())
        {
            if direction > 0 {
                0
            } else {
                entries.len().saturating_sub(1)
            }
        } else {
            self.palette_selected
                .saturating_add_signed(direction)
                .min(entries.len().saturating_sub(1))
        };
        self.option_selected = true;
        self.palette_scroll.scroll_to_item(self.palette_selected);
        if let Some(entry) = entries.get(self.palette_selected) {
            self.announce(&format!(
                "{}. {}. Option {} of {}.",
                entry.label,
                entry.hint,
                self.palette_selected + 1,
                entries.len()
            ));
        } else {
            self.announce("No options for this input. Type a value and press Enter.");
        }
        cx.notify();
    }

    fn command_palette(&self, cx: &mut Context<Self>) -> gpui::Div {
        let entries = self.palette_entries(cx);
        let selected = self.palette_selected.min(entries.len().saturating_sub(1));
        let draft = self.draft.as_ref();
        let contextual =
            draft.is_some() || self.pending_command.is_some() || self.command_result.is_some();
        let title = draft
            .map(|draft| {
                format!(
                    "Record {} · Step {} of 7",
                    draft.row.kind.label().to_lowercase(),
                    draft.step + 1
                )
            })
            .or_else(|| {
                self.pending_command
                    .map(|command| format!("{} · {}", command.label, command.command))
            })
            .or_else(|| {
                self.command_result
                    .as_ref()
                    .map(|result| result.title.clone())
            })
            .unwrap_or_else(|| "Commands".into());
        let prompt = draft.map(Draft::prompt).or_else(|| {
            self.pending_command
                .map(|command| command.prompt().to_owned())
        });
        div().absolute().inset_0().flex().flex_col().items_center().pt(px(65.)).bg(gpui::rgba(0x101318b0))
            .child(div().w(px(640.)).max_w_full().rounded_lg().border_1().border_color(rgb(LINE)).shadow_lg().bg(rgb(0x2f343e)).overflow_hidden()
                .child(div().px_4().py_3().border_b_1().border_color(rgb(LINE))
                    .child(div().text_xs().text_color(rgb(MUTED)).mb_2().child(title))
                    .when_some(prompt, |view, prompt| view.child(div().mb_3().child(prompt)))
                    .child(div().flex().items_center().gap_2().border_1().border_color(rgb(BLUE)).rounded_sm().px_2().bg(rgb(PANEL))
                        .child(div().flex_1().min_w_0().child(self.input.clone()))))
                .when_some(self.command_result.as_ref(), |view, result| view.child(
                    div().id("command-answer").max_h(px(130.)).overflow_y_scroll().px_4().py_3().border_b_1().border_color(rgb(LINE))
                        .children(result.lines.iter().map(|line| div().py_1().child(line.clone())))
                        .when(!result.next.is_empty(), |view| view.child(div().mt_2().text_xs().text_color(rgb(MUTED)).child("Next steps")))))
                .when(!entries.is_empty(), |view| view.child(div().id("palette-results").max_h(px(220.)).overflow_y_scroll().track_scroll(&self.palette_scroll).p_1()
                    .children(entries.into_iter().enumerate().map(|(index, entry)| {
                        let value = entry.value.clone();
                        div().id(("palette-command", index)).px_3().py_2().rounded_sm().cursor_pointer()
                            .bg(rgb(if index == selected && (!contextual || self.option_selected) { 0x454c59 } else { 0x2f343e }))
                            .hover(|style| style.bg(rgb(0x454c59)))
                            .child(div().flex().justify_between().child(entry.label)
                                .when(!contextual, |view| view.child(div().text_color(rgb(MUTED)).child(entry.value))))
                            .when(index == selected && !contextual, |view| view.child(div().mt_1().text_xs().text_color(rgb(MUTED)).child(entry.hint)))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.input.update(cx, |input, cx| input.set_value(&value, cx));
                                this.option_selected = false;
                                this.palette_selected = 0;
                                this.submit(&Submit, window, cx);
                            }))
                    }))))
                .when_some(draft.filter(|draft| draft.step == 6), |view, draft| view.child(div().px_4().py_3()
                    .child(format!("{} {} · {}", draft.row.currency, money(draft.row.cents as i128), draft.row.description))
                    .child(div().mt_1().text_color(rgb(MUTED)).child(format!("{} · {}", draft.row.category, draft.row.date)))))
                .when(self.command_result.is_none() || self.is_error, |view| view.child(div().px_4().py_2().border_t_1().border_color(rgb(LINE)).text_xs().text_color(rgb(if self.is_error { RED } else { MUTED }))
                    .child(div().max_h(px(70.)).overflow_hidden().child(self.message.clone()))))
                .child(div().px_4().py_2().border_t_1().border_color(rgb(LINE)).text_xs().text_color(rgb(MUTED))
                    .child(if contextual { "↑ ↓ Options   Enter Continue   Esc Back / cancel   ⌘R Repeat   Ctrl+C Stop speech" } else { "↑ ↓ Select   Enter Run   Esc Close   ⌘R Repeat   Ctrl+C Stop speech" })))
    }

    fn refresh_downloads(&mut self, cx: &mut Context<Self>) {
        if self.downloads_busy {
            return;
        }
        let Some(directory) = self.downloads_dir.clone() else {
            self.message =
                "Downloads folder is unavailable. Choose a ZIP file or enter its path.".into();
            return;
        };
        self.downloads_busy = true;
        self.message = "Looking for ZIP files in Downloads…".into();
        let task = cx
            .background_executor()
            .spawn(async move { downloads::zip_files(&directory) });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.downloads_busy = false;
                this.download_zips.clear();
                let message = match result {
                    Ok(files) => {
                        this.download_zips = files;
                        if this.download_zips.is_empty() { "No ZIP files in Downloads. Choose another file or enter its path.".into() }
                        else { format!("{} ZIP files in Downloads, newest first. Choose one below, or enter a ZIP / folder path.", this.download_zips.len()) }
                    }
                    Err(error) => error,
                };
                if this.pending_command.is_some_and(|command| command.command == "scan") {
                    this.message = message;
                    this.palette_selected = 0;
                    this.option_selected = false;
                    this.palette_scroll.scroll_to_item(0);
                    this.repeat_speech(cx);
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn next_step(label: impl Into<String>, value: impl Into<String>) -> PaletteEntry {
        PaletteEntry {
            label: label.into(),
            value: value.into(),
            hint: "Enter to continue".into(),
        }
    }

    fn show_command_result(&mut self, command: &str) {
        let verb = command.split_whitespace().next().unwrap_or("");
        if matches!(
            verb,
            "stop" | "repeat" | "audio" | "quit" | "exit" | "commands" | ""
        ) {
            return;
        }
        let organizations = matches!(verb, "org" | "organization" | "organisations");
        let receipts = matches!(
            verb,
            "scan"
                | "scan-zip"
                | "import"
                | "receipts"
                | "receipt-review"
                | "accept"
                | "skip"
                | "next"
                | "prev"
                | "amount"
                | "date"
                | "currency"
                | "kind"
                | "category"
                | "voucher"
        );
        let title = if self.scan_busy && matches!(verb, "scan" | "scan-zip") {
            "Scanning receipts".to_owned()
        } else if organizations {
            "Organizations".into()
        } else {
            COMMANDS
                .iter()
                .find(|entry| entry.command == command || entry.command == verb)
                .map(|entry| entry.label.to_owned())
                .unwrap_or_else(|| "Command result".into())
        };
        let mut lines = vec![self.message.clone()];
        let mut next = Vec::new();
        if organizations {
            lines = vec![format!("Current organization: {}", self.organization)];
            if !matches!(
                command,
                "org list" | "org" | "organization" | "organisations"
            ) {
                lines.insert(0, self.message.clone());
            }
            for name in self.organizations() {
                lines.push(name.clone());
                if name != self.organization {
                    next.push(Self::next_step(
                        format!("Switch to {name}"),
                        format!("org use {name}"),
                    ));
                }
            }
            next.push(Self::next_step("Create an organization", "org create"));
            next.push(Self::next_step("Show this organization's ledger", "ledger"));
        } else if receipts {
            if !self.scan_busy {
                if self.page == Page::ReceiptReview && !self.receipt_queue.is_empty() {
                    lines.push(self.view_speech());
                    for (label, value) in [
                        ("Accept this document", "accept"),
                        ("Skip this receipt", "skip"),
                        ("Set income or expense", "kind"),
                        ("Set category", "category"),
                        ("Set voucher / receipt number", "voucher"),
                        ("Next receipt", "next"),
                        ("Correct amount", "amount"),
                        ("Correct date", "date"),
                        ("Correct currency", "currency"),
                        ("Finish review", "done"),
                    ] {
                        next.push(Self::next_step(label, value));
                    }
                } else {
                    next.push(Self::next_step("Scan ZIP from Downloads", "scan-downloads"));
                    next.push(Self::next_step("Choose ZIP file and scan", "scan-zip"));
                    next.push(Self::next_step("Import a saved scan", "import"));
                }
            }
        } else if verb == "export" || verb == "folder" {
            next.push(Self::next_step("Open data folder", "folder"));
            next.push(Self::next_step("Show ledger", "ledger"));
        } else {
            if self.page == Page::Summary && !self.is_error {
                lines = totals(self.rows())
                    .iter()
                    .map(|(currency, (income, expense))| {
                        format!(
                            "{currency}: income {}, expenses {}, net {}",
                            money(*income),
                            money(*expense),
                            money(income - expense)
                        )
                    })
                    .collect();
                if lines.is_empty() {
                    lines.push("No transactions yet.".into());
                }
            }
            for (label, value) in [
                ("Record income", "income"),
                ("Record expense", "expense"),
                ("Show summary", "summary"),
                ("Search transactions", "find"),
                ("Read next transaction", "read next"),
                ("Export ledger", "export"),
            ] {
                next.push(Self::next_step(label, value));
            }
        }
        if !self.scan_busy {
            next.push(Self::next_step("All commands", "commands"));
        }
        self.command_result = Some(CommandResult { title, lines, next });
        self.palette_open = true;
    }

    fn pick_scan_zip(&mut self, cx: &mut Context<Self>) {
        if self.scan_busy {
            self.message = "A receipt scan is already running. Wait for its results.".into();
            self.announce(&self.message.clone());
            return;
        }
        self.pending_command = None;
        self.input.update(cx, |input, cx| input.clear(cx));
        self.message = "Choose a ZIP chat export in the file picker.".into();
        self.command_result = Some(CommandResult {
            title: "Choose ZIP export".into(),
            lines: vec![self.message.clone()],
            next: Vec::new(),
        });
        self.palette_open = true;
        self.announce(&self.message.clone());
        let selection = cx.prompt_for_paths(gpui::PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Choose ZIP export to scan".into()),
        });
        cx.spawn(async move |this, cx| {
            let result = selection.await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(Ok(Some(paths))) if !paths.is_empty() => {
                        this.start_scan(paths[0].clone(), cx)
                    }
                    Ok(Ok(_)) => {
                        this.message = "No ZIP selected. Choose another file when ready.".into();
                        this.is_error = false;
                        this.show_command_result("scan-zip");
                    }
                    _ => {
                        this.message =
                            "Could not open the file picker. Use scan and enter the ZIP path."
                                .into();
                        this.is_error = true;
                        this.show_command_result("scan-zip");
                    }
                }
                this.refresh_prompt(cx);
                this.announce(&this.prompt_speech());
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn start_scan(&mut self, source: PathBuf, cx: &mut Context<Self>) {
        if self.scan_busy {
            self.message = "A receipt scan is already running. Wait for its results.".into();
            self.is_error = true;
            return;
        }
        if !source.is_dir()
            && !source
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
        {
            self.message = "Choose a ZIP chat export or an extracted export folder.".into();
            self.is_error = true;
            self.show_command_result("scan-zip");
            return;
        }
        self.scan_busy = true;
        self.is_error = false;
        self.message = format!(
            "Scanning {} locally, then classifying receipts with your signed-in Codex account…",
            source.file_name().unwrap_or_default().to_string_lossy()
        );
        self.show_command_result("scan-zip");
        let output_dir = self.ledger.as_ref().map(|ledger| ledger.directory.clone());
        let organization = self.organization.clone();
        let scan_model = self.settings.scan_model.clone();
        let task = cx.background_executor().spawn(async move {
            let output_dir = output_dir.ok_or_else(|| "Ledger is unavailable.".to_string())?;
            let request = receipt_scan::scan_export(&source)?;
            let report = receipt_scan::classify(&request, &scan_model)?;
            let path = receipt_scan::save_report(&output_dir, &report)?;
            Ok::<_, String>((path, report))
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.scan_busy = false;
                match result {
                    Ok((path, report)) if this.organization == organization => match serde_json::from_value::<ReceiptReport>(report) {
                        Ok(report) => { let count = report.results.len(); this.load_receipt_report(report); this.message = format!("Scan ready: {count} receipts. Review each before accepting."); this.is_error = false; },
                        Err(error) => { this.message = format!("Scan saved to {}, but could not open review: {error}", path.display()); this.is_error = true; },
                    },
                    Ok((path, _)) => { this.message = format!("Scan saved for {organization} at {}. Switch to that organization to import it.", path.display()); this.is_error = false; },
                    Err(error) => { this.message = format!("Receipt scan failed: {error}"); this.is_error = true; },
                }
                if this.draft.is_none() && this.pending_command.is_none() {
                    this.show_command_result("scan-zip");
                    this.refresh_prompt(cx);
                }
                this.announce(&this.prompt_speech());
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn organization_dir(&self, name: &str) -> Result<PathBuf, String> {
        if name.eq_ignore_ascii_case("default") {
            return Ok(self.data_root.clone());
        }
        let slug = organization_slug(name)?;
        Ok(self.data_root.join("organizations").join(slug))
    }

    fn organizations(&self) -> Vec<String> {
        let mut names = vec!["Default".to_string()];
        let root = self.data_root.join("organizations");
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let name = fs::read_to_string(entry.path().join("organization.json"))
                    .ok()
                    .and_then(|value| serde_json::from_str::<OrganizationInfo>(&value).ok())
                    .map(|info| info.name)
                    .or_else(|| entry.file_name().to_str().map(str::to_owned));
                if let Some(name) = name {
                    names.push(name);
                }
            }
        }
        names.sort_by_key(|name| name.to_lowercase());
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        names
    }

    fn use_organization(&mut self, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Organization name cannot be empty.".into());
        }
        if name.eq_ignore_ascii_case(&self.organization) {
            return Ok(());
        }
        let directory = self.organization_dir(name)?;
        if !name.eq_ignore_ascii_case("default") && !directory.join("organization.json").exists() {
            return Err(format!(
                "Organization '{name}' does not exist. Use 'org create {name}' first."
            ));
        }
        let next = Ledger::open(directory)?;
        self.ledger = Some(next);
        self.organization = if name.eq_ignore_ascii_case("default") {
            "Default".into()
        } else {
            name.into()
        };
        self.load_error = None;
        self.query.clear();
        self.selected = None;
        self.page = Page::Ledger;
        Ok(())
    }

    fn create_organization(&mut self, name: &str) -> Result<(), String> {
        let name = name.trim();
        let directory = self.organization_dir(name)?;
        if directory.exists() {
            return Err(format!("An organization named '{name}' already exists."));
        }
        fs::create_dir_all(&directory).map_err(|e| format!("Cannot create organization: {e}"))?;
        let info = serde_json::to_vec_pretty(&OrganizationInfo {
            name: name.to_owned(),
        })
        .map_err(|e| e.to_string())?;
        if let Err(error) = fs::write(directory.join("organization.json"), info) {
            let _ = fs::remove_dir_all(&directory);
            return Err(format!("Cannot save organization: {error}"));
        }
        self.use_organization(name)
    }

    fn rows(&self) -> &[Transaction] {
        self.ledger
            .as_ref()
            .map(|l| l.rows.as_slice())
            .unwrap_or(&[])
    }

    fn load_receipt_report(&mut self, report: ReceiptReport) {
        self.receipt_queue = report
            .results
            .into_iter()
            .map(|result| ReceiptReviewItem {
                result,
                category: String::new(),
                voucher_number: String::new(),
                imported: false,
                skipped: false,
            })
            .collect();
        self.receipt_index = 0;
        self.page = Page::ReceiptReview;
        self.query.clear();
        self.selected = None;
        self.message = format!("{} receipts ready to review.", self.receipt_queue.len());
        self.is_error = false;
    }

    fn advance_receipt(&mut self, direction: isize) {
        if self.receipt_queue.is_empty() {
            return;
        }
        for offset in 1..=self.receipt_queue.len() {
            let index = (self.receipt_index as isize + direction * offset as isize)
                .rem_euclid(self.receipt_queue.len() as isize) as usize;
            let item = &self.receipt_queue[index];
            if !item.imported && !item.skipped {
                self.receipt_index = index;
                return;
            }
        }
        self.message = "All receipts reviewed.".into();
    }

    fn save_receipt(&mut self) -> Result<String, String> {
        let item = self
            .receipt_queue
            .get(self.receipt_index)
            .ok_or("No receipt is selected for review.")?;
        let result = &item.result;
        if item.imported {
            return Err("This receipt is already in the ledger.".into());
        }
        if item.skipped {
            return Err("This receipt was skipped. Use import again to review it.".into());
        }
        let category = item.category.trim();
        if category.is_empty() {
            return Err("Enter a ledger category with 'category VALUE' before accepting.".into());
        }
        if category.len() > 80 {
            return Err("Category must be at most 80 bytes.".into());
        }
        let kind = match result.kind.trim().to_ascii_lowercase().as_str() {
            "income" => Kind::Income,
            "expense" => Kind::Expense,
            _ => {
                return Err(
                    "Set transaction direction with 'kind income' or 'kind expense'.".into(),
                );
            }
        };
        let amount = result
            .amount
            .filter(|value| value.is_finite() && *value > 0.0)
            .ok_or("Receipt amount is missing. Set it with 'amount 1250.00'.")?;
        let cents_f64 = (amount * 100.0).round();
        if !(1.0..=99_999_999_999_999.0).contains(&cents_f64) {
            return Err("Receipt amount must be between 0.01 and 999,999,999,999.99.".into());
        }
        let cents = cents_f64 as i64;
        let date = result
            .date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
            .ok_or("Receipt date is missing or invalid. Set it with 'date YYYY-MM-DD'.")?;
        let currency = result
            .currency
            .as_deref()
            .ok_or("Receipt currency is missing. Set it with 'currency LKR'.")?
            .to_ascii_uppercase();
        if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_uppercase()) {
            return Err(
                "Receipt currency is missing or invalid. Set it with 'currency LKR'.".into(),
            );
        }
        let counterparty = result
            .counterparty
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Unknown counterparty");
        let description = format!(
            "{} · {} · {}",
            result.purpose, counterparty, result.filename
        );
        let mut row = Transaction {
            id: Utc::now().format("%Y%m%d%H%M%S%f").to_string(),
            date,
            kind,
            cents,
            currency: currency.clone(),
            description,
            category: category.into(),
            voucher_number: item.voucher_number.trim().into(),
        };
        row.description = row.description.chars().take(240).collect();
        let already_present = self.rows().iter().any(|existing| {
            existing.date == row.date
                && existing.cents == row.cents
                && existing.currency == row.currency
                && existing.description == row.description
                && existing.kind == row.kind
        });
        if already_present {
            self.receipt_queue[self.receipt_index].imported = true;
            self.advance_receipt(1);
            return Ok("This receipt already matches a ledger entry.".into());
        }
        self.ledger
            .as_mut()
            .ok_or("Ledger is unavailable.")?
            .append(row.clone())?;
        self.receipt_queue[self.receipt_index].imported = true;
        self.advance_receipt(1);
        Ok(format!(
            "Added {} {} {} · {} · {} to the ledger.",
            row.kind.label().to_lowercase(),
            currency,
            money(cents as i128),
            row.category,
            row.voucher_number
        ))
    }

    fn focus(&self, window: &mut Window, cx: &mut Context<Self>) {
        window.focus(&self.input.focus_handle(cx));
        cx.notify();
    }

    fn navigate(&mut self, page: Page, window: &mut Window, cx: &mut Context<Self>) {
        self.command_result = None;
        self.page = page;
        self.audio_row = 0;
        self.query.clear();
        self.selected = None;
        self.palette_open = false;
        self.message = self.view_speech();
        self.focus(window, cx);
        cx.notify();
    }

    fn start(&mut self, kind: Kind, window: &mut Window, cx: &mut Context<Self>) {
        if self.draft.is_some() {
            self.message = "Finish the current transaction, or press Escape to cancel it.".into();
        } else if let Some(error) = &self.load_error {
            self.message = error.clone();
            self.is_error = true;
        } else {
            self.message = format!(
                "New {}. Nothing is saved until you review and confirm.",
                kind.label().to_lowercase()
            );
            self.draft = Some(Draft::new(kind));
            self.is_error = false;
            self.input.update(cx, |input, cx| input.clear(cx));
        }
        self.pending_command = None;
        self.command_result = None;
        self.palette_open = true;
        self.refresh_prompt(cx);
        self.announce(&self.prompt_speech());
        self.focus(window, cx);
        cx.notify();
    }

    fn submit(&mut self, _: &Submit, window: &mut Window, cx: &mut Context<Self>) {
        let mut typed = self.input.read(cx).value().trim().to_owned();
        if self.option_selected
            && (self.draft.is_some()
                || self.pending_command.is_some()
                || self.command_result.is_some())
            && let Some(entry) = self.palette_entries(cx).get(self.palette_selected)
        {
            typed = entry.value.clone();
        }
        if self.command_result.is_some() && typed.is_empty() {
            self.message = "Choose a next step with the arrows, or type another command.".into();
            self.repeat_speech(cx);
            return;
        }
        if self
            .pending_command
            .is_some_and(|command| command.command == "scan")
            && typed == "@refresh-downloads"
        {
            self.input.update(cx, |input, cx| input.clear(cx));
            self.refresh_downloads(cx);
            return;
        }
        if self
            .pending_command
            .is_some_and(|command| command.command == "scan")
            && typed == "@choose-zip"
        {
            self.pending_command = None;
            self.pick_scan_zip(cx);
            return;
        }
        let pending = self.pending_command;
        let value = if let Some(command) = pending {
            if typed.is_empty() && command.command != "import" {
                self.message = "Enter a value or choose an option below.".into();
                self.is_error = true;
                self.announce(&self.prompt_speech());
                cx.notify();
                return;
            }
            format!("{} {}", command.command, typed)
                .trim_end()
                .to_owned()
        } else if self.palette_open
            && self.draft.is_none()
            && !matches!(
                typed.to_lowercase().as_str(),
                "new" | "n" | "recent" | "r" | "s" | "?" | "exit" | "receipt-review"
            )
        {
            let commands = Self::matching_commands(&typed);
            let selected_command = if self.command_result.is_some() {
                commands
                    .iter()
                    .find(|command| command.command == typed)
                    .copied()
                    .or_else(|| commands.first().copied())
            } else {
                commands.get(self.palette_selected).copied()
            };
            if let Some(command) = selected_command {
                if command.argument
                    && !typed
                        .to_lowercase()
                        .starts_with(&format!("{} ", command.command))
                {
                    self.request_argument(command, window, cx);
                    return;
                }
                if command.argument {
                    typed.clone()
                } else {
                    command.command.to_owned()
                }
            } else {
                typed.clone()
            }
        } else {
            typed.clone()
        };
        self.input.update(cx, |input, cx| input.clear(cx));
        self.command_result = None;
        self.is_error = false;
        if let Some(draft) = &mut self.draft {
            if value.eq_ignore_ascii_case("cancel") {
                self.cancel(&Cancel, window, cx);
                return;
            }
            if draft.step == 6 && value.eq_ignore_ascii_case("save") {
                let row = draft.row.clone();
                match self
                    .ledger
                    .as_mut()
                    .ok_or_else(|| "Ledger is unavailable.".to_owned())
                    .and_then(|ledger| ledger.append(row.clone()))
                {
                    Ok(()) => {
                        self.message = format!(
                            "Saved {} · {} {} · {}",
                            row.kind.label().to_lowercase(),
                            row.currency,
                            money(row.cents as i128),
                            row.description
                        );
                        self.draft = None;
                        self.page = Page::Ledger;
                        self.query.clear();
                        self.selected = Some(row.id);
                    }
                    Err(error) => {
                        self.message = format!(
                            "Save failed: {error}. Your draft is still here; type save to retry."
                        );
                        self.is_error = true;
                    }
                }
            } else {
                match draft.accept(&value) {
                    Ok(()) => {
                        self.message = "Press Enter to continue. Escape cancels the draft.".into()
                    }
                    Err(error) => {
                        self.message = error;
                        self.is_error = true;
                    }
                }
            }
        } else {
            let (command, argument) = value.split_once(' ').unwrap_or((&value, ""));
            match command.to_lowercase().as_str() {
                "income" => self.start(Kind::Income, window, cx),
                "new" | "n" | "expense" => self.start(Kind::Expense, window, cx),
                "ledger" | "recent" | "r" => self.navigate(Page::Ledger, window, cx),
                "summary" | "s" => self.navigate(Page::Summary, window, cx),
                "review" => self.navigate(Page::Review, window, cx),
                "receipt-review" | "receipts" => self.navigate(Page::ReceiptReview, window, cx),
                "help" | "?" => self.navigate(Page::Help, window, cx),
                "org" | "organization" | "organisations" => {
                    let (action, name) = argument.split_once(' ').unwrap_or((argument, ""));
                    match action.to_lowercase().as_str() {
                        "list" | "" => {
                            self.message = format!(
                                "Organizations: {}. Current: {}",
                                self.organizations().join(", "),
                                self.organization
                            )
                        }
                        "create" | "new" => match self.create_organization(name) {
                            Ok(()) => {
                                self.message = format!(
                                    "Created and switched to organization '{}'.",
                                    self.organization
                                )
                            }
                            Err(error) => {
                                self.message = error;
                                self.is_error = true;
                            }
                        },
                        "use" | "switch" => match self.use_organization(name) {
                            Ok(()) => {
                                self.message =
                                    format!("Switched to organization '{}'.", self.organization)
                            }
                            Err(error) => {
                                self.message = error;
                                self.is_error = true;
                            }
                        },
                        _ => {
                            self.message =
                                "Use 'org list', 'org create NAME', or 'org use NAME'.".into();
                            self.is_error = true;
                        }
                    }
                }
                "find" => {
                    self.page = Page::Ledger;
                    self.query = argument.trim().to_lowercase();
                    self.audio_row = 0;
                    self.selected = None;
                    self.message = self.view_speech();
                }
                "import" => {
                    let report_path = if argument.trim().is_empty() {
                        self.ledger
                            .as_ref()
                            .and_then(|ledger| latest_scan_report(&ledger.directory).ok())
                    } else {
                        Some(PathBuf::from(argument.trim().trim_matches('"')))
                    };
                    match report_path
                        .ok_or_else(|| {
                            "No finance scan report found. Use import /path/to/finance-scan.json."
                                .to_string()
                        })
                        .and_then(|path| ReceiptReport::load(&path).map(|report| (path, report)))
                    {
                        Ok((path, report)) => {
                            let count = report.results.len();
                            self.load_receipt_report(report);
                            self.message = format!(
                                "Loaded {count} receipts from {}.",
                                path.file_name().unwrap_or_default().to_string_lossy()
                            );
                        }
                        Err(error) => {
                            self.message = error;
                            self.is_error = true;
                        }
                    }
                }
                "accept" => match self.save_receipt() {
                    Ok(message) => {
                        self.message = message;
                        self.is_error = false;
                    }
                    Err(error) => {
                        self.message = error;
                        self.is_error = true;
                    }
                },
                "skip" => {
                    if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                        item.skipped = true;
                        self.message = "Receipt skipped.".into();
                        self.is_error = false;
                        self.advance_receipt(1);
                    } else {
                        self.message = "Import a scan report first.".into();
                        self.is_error = true;
                    }
                }
                "next" => self.advance_receipt(1),
                "prev" | "previous" => self.advance_receipt(-1),
                "amount" => match ledger::amount(argument) {
                    Ok(cents) => {
                        if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                            item.result.amount = Some(cents as f64 / 100.0);
                            self.message = "Amount updated. Review it, then accept.".into();
                            self.is_error = false;
                        } else {
                            self.message = "Import a scan report first.".into();
                            self.is_error = true;
                        }
                    }
                    Err(error) => {
                        self.message = error;
                        self.is_error = true;
                    }
                },
                "date" => match NaiveDate::parse_from_str(argument.trim(), "%Y-%m-%d") {
                    Ok(date) => {
                        if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                            item.result.date = Some(date.to_string());
                            self.message = "Date updated. Review it, then accept.".into();
                            self.is_error = false;
                        } else {
                            self.message = "Import a scan report first.".into();
                            self.is_error = true;
                        }
                    }
                    Err(_) => {
                        self.message = "Use date YYYY-MM-DD.".into();
                        self.is_error = true;
                    }
                },
                "currency" => {
                    let currency = argument.trim().to_ascii_uppercase();
                    if currency.len() == 3 && currency.bytes().all(|byte| byte.is_ascii_uppercase())
                    {
                        if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                            item.result.currency = Some(currency);
                            self.message = "Currency updated.".into();
                            self.is_error = false;
                        }
                    } else {
                        self.message =
                            "Use currency LKR, USD, or another three-letter code.".into();
                        self.is_error = true;
                    }
                }
                "kind" => {
                    let kind = match argument.trim().to_ascii_lowercase().as_str() {
                        "income" => Some("income"),
                        "expense" => Some("expense"),
                        _ => None,
                    };
                    if let (Some(kind), Some(item)) =
                        (kind, self.receipt_queue.get_mut(self.receipt_index))
                    {
                        item.result.kind = kind.into();
                        self.message = format!("Document set to {kind}.");
                        self.is_error = false;
                    } else {
                        self.message =
                            "Use kind income or kind expense after importing a scan.".into();
                        self.is_error = true;
                    }
                }
                "category" => {
                    let category = argument.trim();
                    if category.is_empty() || category.len() > 80 {
                        self.message = "Enter a category of 1–80 bytes.".into();
                        self.is_error = true;
                    } else if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                        item.category = category.into();
                        self.message = "Category set.".into();
                        self.is_error = false;
                    } else {
                        self.message = "Import a scan report first.".into();
                        self.is_error = true;
                    }
                }
                "voucher" => {
                    let voucher = argument.trim();
                    if voucher.len() > 120 {
                        self.message = "Voucher / receipt number must be at most 120 bytes.".into();
                        self.is_error = true;
                    } else if let Some(item) = self.receipt_queue.get_mut(self.receipt_index) {
                        item.voucher_number = voucher.into();
                        self.message = "Voucher / receipt number set.".into();
                        self.is_error = false;
                    } else {
                        self.message = "Import a scan report first.".into();
                        self.is_error = true;
                    }
                }
                "done" => {
                    self.page = Page::Ledger;
                    self.receipt_queue.clear();
                    self.receipt_index = 0;
                    self.message = "Receipt review closed.".into();
                }
                "scan-downloads" => {
                    let command = COMMANDS
                        .iter()
                        .find(|command| command.command == "scan")
                        .unwrap();
                    self.request_argument(command, window, cx);
                    return;
                }
                "scan-zip" => self.pick_scan_zip(cx),
                "scan" => self.start_scan(PathBuf::from(argument.trim().trim_matches('"')), cx),
                "commands" => {
                    self.message = "Choose a command.".into();
                    self.palette_open = true;
                }
                "export" => match self
                    .ledger
                    .as_ref()
                    .ok_or_else(|| "Ledger is unavailable.".to_owned())
                    .and_then(Ledger::export)
                {
                    Ok(path) => self.message = format!("Exported to {}", path.display()),
                    Err(error) => {
                        self.message = format!("Export failed: {error}");
                        self.is_error = true;
                    }
                },
                "folder" => {
                    if let Some(ledger) = &self.ledger {
                        cx.reveal_path(&ledger.directory);
                        self.message = "Opened the data folder in Finder.".into();
                    }
                }
                "audio" => match argument.trim() {
                    "on" => self.set_audio(true),
                    "off" => self.set_audio(false),
                    _ => self.set_audio(!self.audio_enabled),
                },
                "repeat" => self.announce(&self.prompt_speech()),
                "stop" => self.speech.stop(),
                "read" => {
                    match argument.trim() {
                        "next" => {
                            self.audio_row = self
                                .audio_row
                                .saturating_add(1)
                                .min(self.visible_rows().len().saturating_sub(1))
                        }
                        "previous" | "prev" => self.audio_row = self.audio_row.saturating_sub(1),
                        _ => self.audio_row = 0,
                    }
                    self.message = self.view_speech();
                }
                "quit" | "exit" => cx.quit(),
                "" => {}
                _ => {
                    self.message =
                        format!("Unknown command: {command}. Type help to see available commands.");
                    self.is_error = true;
                }
            }
        }
        if !self.is_error {
            self.pending_command = None;
        } else if pending.is_some() {
            self.command_result = None;
            self.input
                .update(cx, |input, cx| input.set_value(&typed, cx));
        }
        if self.draft.is_none() && self.pending_command.is_none() && value != "commands" {
            self.show_command_result(&value);
        }
        self.option_selected = false;
        self.palette_selected = 0;
        self.refresh_prompt(cx);
        self.palette_open = self.draft.is_some()
            || self.pending_command.is_some()
            || self.command_result.is_some()
            || self.is_error
            || value == "commands";
        if value != "stop" {
            if self.draft.is_some()
                || self.pending_command.is_some()
                || self.command_result.is_some()
            {
                self.repeat_speech(cx);
            } else {
                self.announce(&self.prompt_speech());
            }
        }
        self.focus(window, cx);
        cx.notify();
    }

    fn cancel(&mut self, _: &Cancel, window: &mut Window, cx: &mut Context<Self>) {
        if self.command_result.take().is_some() {
            self.input.update(cx, |input, cx| input.clear(cx));
            self.refresh_prompt(cx);
            self.open_palette(window, cx);
            return;
        }
        if self.pending_command.take().is_some() {
            self.input.update(cx, |input, cx| input.clear(cx));
            self.is_error = false;
            self.message = "Choose a command.".into();
            self.refresh_prompt(cx);
            self.open_palette(window, cx);
            return;
        }
        if self.palette_open && self.draft.is_none() {
            self.palette_open = false;
            self.input.update(cx, |input, cx| input.clear(cx));
            self.announce("Commands closed.");
            cx.notify();
            return;
        }
        self.palette_open = false;
        self.message = if self.draft.take().is_some() {
            "Draft cancelled. No transaction was saved."
        } else {
            "Ready."
        }
        .into();
        self.query.clear();
        self.is_error = false;
        self.input.update(cx, |input, cx| input.clear(cx));
        self.refresh_prompt(cx);
        self.announce(&self.message.clone());
        self.focus(window, cx);
        cx.notify();
    }

    fn pane(&self, side: Side) -> &Pane {
        match side {
            Side::Left => &self.left,
            Side::Right => &self.right,
        }
    }

    fn pane_mut(&mut self, side: Side) -> &mut Pane {
        match side {
            Side::Left => &mut self.left,
            Side::Right => &mut self.right,
        }
    }

    fn toggle_pane(&mut self, side: Side, window: &mut Window, cx: &mut Context<Self>) {
        let pane = self.pane_mut(side);
        pane.open = !pane.open;
        if pane.open {
            window.focus(&pane.focus);
        } else if pane.focus.is_focused(window) {
            self.focus(window, cx);
        }
        cx.notify();
    }

    fn move_selection(&mut self, side: Side, direction: isize, cx: &mut Context<Self>) {
        let count = match side {
            Side::Left => PAGES.len(),
            Side::Right => PANEL_ACTIONS.len(),
        };
        let pane = self.pane_mut(side);
        pane.selected = pane
            .selected
            .saturating_add_signed(direction)
            .min(count - 1);
        let label = match side {
            Side::Left => PAGES[self.left.selected].label(),
            Side::Right => PANEL_ACTIONS[self.right.selected],
        };
        self.announce(label);
        cx.notify();
    }

    fn activate_pane(&mut self, side: Side, window: &mut Window, cx: &mut Context<Self>) {
        match side {
            Side::Left => {
                self.navigate(PAGES[self.left.selected], window, cx);
                window.focus(&self.left.focus);
            }
            Side::Right => match self.right.selected {
                0 => self.start(Kind::Income, window, cx),
                1 => self.start(Kind::Expense, window, cx),
                2 => {
                    match self
                        .ledger
                        .as_ref()
                        .ok_or_else(|| "Ledger is unavailable.".to_owned())
                        .and_then(Ledger::export)
                    {
                        Ok(path) => {
                            self.message = format!("Exported to {}", path.display());
                            self.is_error = false;
                        }
                        Err(error) => {
                            self.message = format!("Export failed: {error}");
                            self.is_error = true;
                        }
                    }
                }
                _ => {
                    if let Some(ledger) = &self.ledger {
                        cx.reveal_path(&ledger.directory);
                    }
                }
            },
        }
        cx.notify();
    }

    fn panel(&self, side: Side, window: &Window, cx: &mut Context<Self>) -> impl IntoElement {
        let pane = self.pane(side);
        let focused = pane.focus.is_focused(window);
        let (id, title, shortcut) = match side {
            Side::Left => ("left-panel", "Navigate", "⌘B"),
            Side::Right => ("right-panel", "Actions", "⌘⌥B"),
        };
        let labels: Vec<&str> = match side {
            Side::Left => PAGES.iter().map(|page| page.label()).collect(),
            Side::Right => PANEL_ACTIONS.to_vec(),
        };
        div()
            .id(id)
            .key_context("Panel")
            .track_focus(&pane.focus)
            .w(px(184.))
            .flex_shrink_0()
            .h_full()
            .bg(rgb(PANEL))
            .flex()
            .flex_col()
            .when(matches!(side, Side::Left), |v| v.border_r_1())
            .when(matches!(side, Side::Right), |v| v.border_l_1())
            .border_color(rgb(if focused { BLUE } else { LINE }))
            .on_action(
                cx.listener(move |this, _: &PanelUp, _, cx| this.move_selection(side, -1, cx)),
            )
            .on_action(
                cx.listener(move |this, _: &PanelDown, _, cx| this.move_selection(side, 1, cx)),
            )
            .on_action(
                cx.listener(move |this, _: &PanelFirst, _, cx| this.move_selection(side, -100, cx)),
            )
            .on_action(
                cx.listener(move |this, _: &PanelLast, _, cx| this.move_selection(side, 100, cx)),
            )
            .on_action(cx.listener(move |this, _: &PanelAccept, window, cx| {
                this.activate_pane(side, window, cx)
            }))
            .on_action(cx.listener(move |this, _: &PanelClose, window, cx| {
                this.toggle_pane(side, window, cx)
            }))
            .child(
                div()
                    .h(px(38.))
                    .px_3()
                    .flex()
                    .items_center()
                    .justify_between()
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(title)
                    .child(
                        div()
                            .id((id, 100_usize))
                            .cursor_pointer()
                            .child(shortcut)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.toggle_pane(side, window, cx)
                            })),
                    ),
            )
            .child(
                div()
                    .id((id, 101_usize))
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .p_2()
                    .children(labels.into_iter().enumerate().map(|(i, label)| {
                        let selected = pane.selected == i;
                        div()
                            .id((id, i))
                            .px_2()
                            .py_2()
                            .rounded_sm()
                            .cursor_pointer()
                            .bg(rgb(if selected && focused { 0x303d51 } else { PANEL }))
                            .text_color(rgb(if selected && focused { BLUE } else { TEXT }))
                            .hover(|s| s.bg(rgb(0x303744)))
                            .child(label)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let pane = this.pane_mut(side);
                                pane.selected = i;
                                window.focus(&pane.focus);
                                this.activate_pane(side, window, cx);
                            }))
                    })),
            )
            .child(
                div()
                    .px_3()
                    .py_3()
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child("↑ ↓ Select   Enter Open")
                    .child(div().mt_1().child("Esc Close")),
            )
    }

    fn ledger_view(&self, cx: &mut Context<Self>) -> gpui::Div {
        let rows: Vec<_> = self
            .rows()
            .iter()
            .rev()
            .filter(|row| {
                (self.page != Page::Review || row.category.is_empty())
                    && (self.query.is_empty()
                        || format!(
                            "{} {} {} {} {} {}",
                            row.description,
                            row.category,
                            row.date,
                            row.currency,
                            row.kind.label(),
                            money(row.cents as i128)
                        )
                        .to_lowercase()
                        .contains(&self.query))
            })
            .collect();
        let mut view = div().flex().flex_col().flex_1().min_h_0().child(
            div()
                .flex()
                .px_5()
                .py_2()
                .border_y_1()
                .border_color(rgb(LINE))
                .text_xs()
                .text_color(rgb(MUTED))
                .child(div().w(px(90.)).child("Date"))
                .child(div().flex_1().child("Description / category"))
                .child(div().w(px(60.)).child("Type"))
                .child(div().w(px(140.)).text_right().child("Amount")),
        );
        if rows.is_empty() {
            let (empty_icon, empty_message, empty_hint) = if !self.query.is_empty() {
                ("⌕", "No matches.", "Press esc to clear search.")
            } else if self.page == Page::Review {
                ("✓", "Nothing to review.", "All entries are categorized.")
            } else {
                (
                    "＋",
                    "Ledger is empty.",
                    "Press ⌘K to record income or an expense.",
                )
            };
            view = view.child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .justify_center()
                    .items_center()
                    .p_5()
                    .gap_1()
                    .child(
                        div()
                            .text_size(px(28.))
                            .text_color(rgb(BLUE))
                            .child(empty_icon),
                    )
                    .child(empty_message)
                    .child(div().text_color(rgb(MUTED)).child(empty_hint)),
            );
        } else {
            view = view.child(
                div()
                    .id("transaction-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .children(rows.iter().map(|row| {
                        let id = row.id.clone();
                        div()
                            .id(SharedString::from(format!("row-{id}")))
                            .flex()
                            .items_center()
                            .px_5()
                            .py_3()
                            .border_b_1()
                            .border_color(rgb(0x30353f))
                            .cursor_pointer()
                            .bg(rgb(if self.selected.as_ref() == Some(&id) {
                                0x303d51
                            } else {
                                BASE
                            }))
                            .hover(|s| s.bg(rgb(0x303744)))
                            .child(
                                div()
                                    .w(px(90.))
                                    .text_color(rgb(MUTED))
                                    .child(row.date.to_string()),
                            )
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(div().truncate().child(row.description.clone()))
                                    .child(div().mt_1().text_xs().text_color(rgb(MUTED)).child(
                                        format!(
                                            "{}{}",
                                            if row.category.is_empty() {
                                                "Uncategorized"
                                            } else {
                                                &row.category
                                            },
                                            if row.voucher_number.is_empty() {
                                                String::new()
                                            } else {
                                                format!(" · #{}", row.voucher_number)
                                            }
                                        ),
                                    )),
                            )
                            .child(
                                div()
                                    .w(px(60.))
                                    .text_xs()
                                    .text_color(rgb(MUTED))
                                    .child(row.kind.label()),
                            )
                            .child(
                                div()
                                    .w(px(140.))
                                    .text_right()
                                    .font_family("Menlo")
                                    .text_color(rgb(if row.kind == Kind::Income {
                                        GREEN
                                    } else {
                                        RED
                                    }))
                                    .child(format!(
                                        "{} {}{}",
                                        row.currency,
                                        if row.kind == Kind::Income { "+" } else { "−" },
                                        money(row.cents as i128)
                                    )),
                            )
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.selected = Some(id.clone());
                                this.focus(window, cx);
                                cx.notify();
                            }))
                    })),
            );
        }
        if let Some(row) = self
            .rows()
            .iter()
            .find(|row| Some(&row.id) == self.selected.as_ref())
        {
            view = view.child(
                div()
                    .px_5()
                    .py_3()
                    .bg(rgb(PANEL))
                    .border_t_1()
                    .border_color(rgb(LINE))
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(format!(
                        "Selected: {} · {} · ID {}",
                        row.description, row.date, row.id
                    )),
            );
        }
        view
    }

    fn summary_view(&self) -> gpui::Div {
        let summary = totals(self.rows());
        div()
            .flex()
            .flex_col()
            .gap_5()
            .p_6()
            .child(
                div()
                    .text_color(rgb(MUTED))
                    .child("All recorded transactions. Each currency is reported separately."),
            )
            .when(summary.is_empty(), |view| {
                view.child("Record your first transaction to see a summary.")
            })
            .children(summary.into_iter().map(|(currency, (income, expense))| {
                div()
                    .border_1()
                    .border_color(rgb(LINE))
                    .rounded_sm()
                    .p_5()
                    .child(div().text_color(rgb(BLUE)).child(currency))
                    .child(
                        div().flex().flex_wrap().mt_4().gap_6().children(
                            [
                                ("Income", income, GREEN),
                                ("Expenses", expense, RED),
                                ("Net movement", income - expense, TEXT),
                            ]
                            .map(|(label, value, color)| {
                                div()
                                    .flex_1()
                                    .child(div().text_xs().text_color(rgb(MUTED)).child(label))
                                    .child(
                                        div()
                                            .mt_2()
                                            .text_size(px(24.))
                                            .font_family("Menlo")
                                            .text_color(rgb(color))
                                            .child(money(value)),
                                    )
                            }),
                        ),
                    )
            }))
    }

    fn help_view(&self) -> gpui::Div {
        div()
            .p_6()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div().mb_3().text_color(rgb(MUTED)).child(
                    "Press ⌘K to open commands. Escape closes commands or cancels an entry.",
                ),
            )
            .children(
                [
                    ("income", "Start a guided income entry"),
                    ("expense / new", "Start a guided expense entry · ⌘N"),
                    ("ledger / recent", "Show all transactions · ⌘1"),
                    ("summary", "Show totals by currency · ⌘2"),
                    ("review", "Show uncategorized transactions"),
                    (
                        "scan /path/to/export",
                        "Scan linked receipts, then review the results",
                    ),
                    (
                        "import [report.json]",
                        "Review the latest scan or a report file",
                    ),
                    (
                        "accept / skip / next / prev / done",
                        "Add or dismiss reviewed receipts",
                    ),
                    (
                        "amount / date / currency VALUE",
                        "Correct a receipt before accepting",
                    ),
                    ("org list", "List organizations and show the current one"),
                    ("org create NAME", "Create an organization and switch to it"),
                    (
                        "org use NAME",
                        "Switch to an existing organization's accounts",
                    ),
                    (
                        "find coffee",
                        "Search descriptions, categories, dates, types, and amounts",
                    ),
                    (
                        "export",
                        "Write a B-Counting .tsv ledger in the data folder",
                    ),
                    ("folder", "Reveal the data folder"),
                    (
                        "save / cancel",
                        "Confirm or discard the transaction at review",
                    ),
                    ("⌘K / ⌘⇧P", "Open the command palette"),
                    ("⌘R", "Repeat the current prompt or message"),
                    ("⌘⇧R", "Read the current view aloud"),
                    ("⌘,", "Open settings"),
                    ("Ctrl+C", "Stop speech"),
                    ("⌘⇧A", "Toggle spoken feedback"),
                    (
                        "read next / read previous",
                        "Read matching ledger records one at a time",
                    ),
                    ("⌘B", "Toggle and focus the left navigation panel"),
                    ("⌘⌥B", "Toggle and focus the right actions panel"),
                    ("↑ / ↓", "Select an option in the focused panel"),
                    (
                        "Enter / Esc",
                        "Activate an option / close the focused panel",
                    ),
                    ("quit", "Close the app"),
                ]
                .map(|(command, description)| {
                    div()
                        .flex()
                        .py_2()
                        .border_b_1()
                        .border_color(rgb(LINE))
                        .child(
                            div()
                                .w(px(170.))
                                .font_family("Menlo")
                                .text_color(rgb(BLUE))
                                .child(command),
                        )
                        .child(div().flex_1().child(description))
                }),
            )
    }

    fn receipt_review_view(&self) -> gpui::Div {
        let Some(item) = self.receipt_queue.get(self.receipt_index) else {
            return div()
                .flex_1()
                .flex()
                .flex_col()
                .justify_center()
                .items_center()
                .gap_2()
                .child(div().text_size(px(24.)).text_color(rgb(BLUE)).child("▧"))
                .child("No scan loaded.")
                .child(
                    div()
                        .text_color(rgb(MUTED))
                        .child("Type import to open the latest scan."),
                );
        };
        let result = &item.result;
        let amount = result
            .amount
            .filter(|amount| amount.is_finite() && *amount > 0.0)
            .map(|amount| {
                format!(
                    "{} {}",
                    result
                        .currency
                        .as_deref()
                        .unwrap_or("Currency?")
                        .to_ascii_uppercase(),
                    money((amount * 100.0).round() as i128)
                )
            })
            .unwrap_or_else(|| "Amount not detected".into());
        let date = result.date.as_deref().unwrap_or("Date not detected");
        let counterparty = result
            .counterparty
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or("Counterparty not detected");
        let status = if item.imported {
            "Added to ledger"
        } else if item.skipped {
            "Skipped"
        } else {
            "Needs review"
        };
        let count = format!("{} / {}", self.receipt_index + 1, self.receipt_queue.len());
        div()
            .flex_1()
            .flex()
            .flex_col()
            .justify_center()
            .items_center()
            .gap_3()
            .p_6()
            .child(
                div()
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(format!("{count}  ·  {status}")),
            )
            .child(
                div()
                    .max_w(px(680.))
                    .text_center()
                    .child(result.filename.clone()),
            )
            .child(div().text_size(px(28.)).text_color(rgb(BLUE)).child(amount))
            .child(
                div()
                    .text_color(rgb(MUTED))
                    .child(format!("{}  ·  {counterparty}  ·  {date}", result.kind)),
            )
            .child(div().text_xs().text_color(rgb(MUTED)).child(format!(
                "{}  ·  {} confidence",
                result.purpose, result.confidence
            )))
            .child(div().text_xs().text_color(rgb(MUTED)).child(format!(
                "Category: {}  ·  Voucher: {}",
                if item.category.is_empty() {
                    "enter manually"
                } else {
                    &item.category
                },
                if item.voucher_number.is_empty() {
                    "optional"
                } else {
                    &item.voucher_number
                }
            )))
            .child(
                div()
                    .max_w(px(680.))
                    .text_center()
                    .text_color(rgb(MUTED))
                    .child(result.evidence.clone()),
            )
            .child(
                div()
                    .mt_2()
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child("kind · category · voucher · accept · skip · next · prev · done"),
            )
    }
}

impl Render for Workspace {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .relative()
            .key_context("Workspace")
            .track_focus(&self.input.focus_handle(cx))
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(BASE))
            .text_color(rgb(TEXT))
            .font_family(".SystemUIFont")
            .text_size(px(self.settings.font_size as f32))
            .on_action(cx.listener(Self::submit))
            .on_action(cx.listener(Self::cancel))
            .on_action(
                cx.listener(|this, _: &FocusCommand, window, cx| this.open_palette(window, cx)),
            )
            .on_action(cx.listener(|this, _: &PaletteUp, _, cx| this.move_palette(-1, cx)))
            .on_action(cx.listener(|this, _: &PaletteDown, _, cx| this.move_palette(1, cx)))
            .on_action(cx.listener(|this, _: &RepeatSpeech, _, cx| this.repeat_speech(cx)))
            .on_action(cx.listener(|this, _: &ReadView, _, _| this.announce(&this.view_speech())))
            .on_action(cx.listener(|this, _: &StopSpeech, _, _| this.speech.stop()))
            .on_action(cx.listener(|this, _: &ToggleSpeech, _, cx| {
                this.set_audio(!this.audio_enabled);
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &OpenSettings, window, cx| {
                this.page = Page::Settings;
                this.palette_open = false;
                window.focus(&this.input.focus_handle(cx));
                cx.notify();
            }))
            .on_action(
                cx.listener(|this, _: &NewExpense, window, cx| {
                    this.start(Kind::Expense, window, cx)
                }),
            )
            .on_action(cx.listener(|this, _: &ShowLedger, window, cx| {
                this.navigate(Page::Ledger, window, cx);
                this.announce(&this.view_speech());
            }))
            .on_action(cx.listener(|this, _: &ShowSummary, window, cx| {
                this.navigate(Page::Summary, window, cx);
                this.announce(&this.view_speech());
            }))
            .on_action(cx.listener(|this, _: &ToggleLeft, window, cx| {
                this.toggle_pane(Side::Left, window, cx)
            }))
            .on_action(cx.listener(|this, _: &ToggleRight, window, cx| {
                this.toggle_pane(Side::Right, window, cx)
            }))
            .child(
                div()
                    .h(px(48.))
                    .flex_shrink_0()
                    .px_5()
                    .flex()
                    .items_center()
                    .justify_between()
                    .border_b_1()
                    .border_color(rgb(LINE))
                    .bg(rgb(0x30353f))
                    .child(
                        div()
                            .flex()
                            .gap_4()
                            .items_center()
                            .child("B Counting")
                            .child(
                                div()
                                    .text_color(rgb(MUTED))
                                    .child(self.organization.clone()),
                            ),
                    )
                    .child(
                        div()
                            .id("open-commands")
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .border_1()
                            .border_color(rgb(LINE))
                            .cursor_pointer()
                            .child("Commands   ⌘K")
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_palette(window, cx)),
                            ),
                    ),
            )
            .child(
                div()
                    .h(px(42.))
                    .flex_shrink_0()
                    .px_5()
                    .flex()
                    .items_center()
                    .gap_5()
                    .border_b_1()
                    .border_color(rgb(LINE))
                    .children(
                        [Page::Ledger, Page::Summary, Page::Review]
                            .into_iter()
                            .enumerate()
                            .map(|(i, page)| {
                                div()
                                    .id(("page-tab", i))
                                    .cursor_pointer()
                                    .text_color(rgb(if self.page == page { TEXT } else { MUTED }))
                                    .child(page.label())
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.navigate(page, window, cx);
                                        this.announce(&this.view_speech());
                                    }))
                            }),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .when(self.left.open, |view| {
                        view.child(self.panel(Side::Left, window, cx))
                    })
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .when_some(self.load_error.clone(), |view, error| {
                                view.child(div().m_4().p_4().text_color(rgb(RED)).child(error))
                            })
                            .child(match self.page {
                                Page::Ledger | Page::Review => {
                                    self.ledger_view(cx).into_any_element()
                                }
                                Page::ReceiptReview => {
                                    self.receipt_review_view().into_any_element()
                                }
                                Page::Summary => div()
                                    .id("summary-scroll")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_y_scroll()
                                    .child(self.summary_view())
                                    .into_any_element(),
                                Page::Help => div()
                                    .id("help-scroll")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_y_scroll()
                                    .child(self.help_view())
                                    .into_any_element(),
                                Page::Settings => self.settings_view(cx).into_any_element(),
                            }),
                    )
                    .when(self.right.open, |view| {
                        view.child(self.panel(Side::Right, window, cx))
                    }),
            )
            .child(
                div()
                    .flex_shrink_0()
                    .px_5()
                    .py_2()
                    .flex()
                    .justify_between()
                    .border_t_1()
                    .border_color(rgb(LINE))
                    .bg(rgb(0x30353f))
                    .text_xs()
                    .text_color(rgb(if self.is_error { RED } else { MUTED }))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .child(self.message.clone()),
                    )
                    .child(
                        div()
                            .id("audio-toggle")
                            .cursor_pointer()
                            .child(if self.audio_enabled {
                                "Spoken feedback on   ⌘⇧A"
                            } else {
                                "Spoken feedback off   ⌘⇧A"
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.set_audio(!this.audio_enabled);
                                cx.notify();
                            })),
                    ),
            )
            .when(
                self.palette_open
                    && !self.left.focus.is_focused(window)
                    && !self.right.focus.is_focused(window),
                |view| view.child(self.command_palette(cx)),
            )
    }
}

fn bind_keys(cx: &mut App) {
    input::bind_keys(cx);
    cx.bind_keys([
        KeyBinding::new("enter", Submit, Some("Workspace")),
        KeyBinding::new("escape", Cancel, Some("Workspace")),
        KeyBinding::new("up", PaletteUp, Some("Workspace")),
        KeyBinding::new("down", PaletteDown, Some("Workspace")),
        KeyBinding::new("cmd-r", RepeatSpeech, Some("Workspace")),
        KeyBinding::new("cmd-shift-r", ReadView, Some("Workspace")),
        KeyBinding::new("ctrl-c", StopSpeech, Some("Workspace")),
        KeyBinding::new("cmd-,", OpenSettings, Some("Workspace")),
        KeyBinding::new("cmd-shift-a", ToggleSpeech, Some("Workspace")),
        KeyBinding::new("cmd-k", FocusCommand, Some("Workspace")),
        KeyBinding::new("cmd-shift-p", FocusCommand, Some("Workspace")),
        KeyBinding::new("cmd-n", NewExpense, Some("Workspace")),
        KeyBinding::new("cmd-1", ShowLedger, Some("Workspace")),
        KeyBinding::new("cmd-2", ShowSummary, Some("Workspace")),
        KeyBinding::new("cmd-b", ToggleLeft, Some("Workspace")),
        KeyBinding::new("cmd-alt-b", ToggleRight, Some("Workspace")),
        KeyBinding::new("up", PanelUp, Some("Panel")),
        KeyBinding::new("down", PanelDown, Some("Panel")),
        KeyBinding::new("home", PanelFirst, Some("Panel")),
        KeyBinding::new("end", PanelLast, Some("Panel")),
        KeyBinding::new("enter", PanelAccept, Some("Panel")),
        KeyBinding::new("escape", PanelClose, Some("Panel")),
        KeyBinding::new("cmd-q", Quit, None),
    ]);
}

fn main() {
    let open_commands = std::env::args().any(|argument| argument == "--commands");
    let path = std::env::var_os("BCOUNTING_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            directories::ProjectDirs::from("", "", "b-counting-gpui")
                .expect("Cannot locate the user data directory")
                .data_dir()
                .to_path_buf()
        });
    Application::new().run(move |cx: &mut App| {
        bind_keys(cx);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        let bounds = Bounds::centered(None, size(px(1180.), px(780.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                window_min_size: Some(size(px(820.), px(600.))),
                titlebar: Some(TitlebarOptions {
                    title: Some("B Counting".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            |window, cx| {
                cx.new(|cx| {
                    let mut workspace = Workspace::new(path, window, cx);
                    if open_commands {
                        workspace.open_palette(window, cx);
                    }
                    workspace
                })
            },
        )
        .expect("Cannot open the application window");
        cx.activate(true);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[gpui::test]
    fn downloads_prompt_detects_filters_refreshes_and_scans_selected_path(
        cx: &mut gpui::TestAppContext,
    ) {
        let ledger = tempfile::tempdir().unwrap();
        let downloads = tempfile::tempdir().unwrap();
        let club = downloads.path().join("Club export.zip");
        fs::write(&club, b"invalid ZIP fixture").unwrap();
        fs::write(downloads.path().join("notes.txt"), b"notes").unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            let mut workspace = Workspace::new(ledger.path().to_path_buf(), window, cx);
            workspace.downloads_dir = Some(downloads.path().to_path_buf());
            workspace
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("scan-downloads");
        cx.simulate_keystrokes("enter");
        cx.run_until_parked();
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.pending_command.unwrap().command, "scan");
            assert_eq!(workspace.download_zips, vec![club.clone()]);
            assert!(
                !workspace.scan_busy,
                "Discovery must not start a receipt scan"
            );
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|entry| entry.label.contains("Club export.zip"))
            );
        });
        fs::write(downloads.path().join("Second.ZIP"), b"another fixture").unwrap();
        cx.simulate_input("@refresh-downloads");
        cx.simulate_keystrokes("enter");
        cx.run_until_parked();
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.download_zips.len(), 2)
        });
        cx.simulate_input("Club");
        cx.simulate_keystrokes("down");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.palette_entries(cx).len(), 1);
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Club export.zip")
            );
        });
        cx.simulate_keystrokes("enter");
        cx.run_until_parked();
        view.read_with(cx, |workspace, _| {
            assert!(workspace.is_error && !workspace.scan_busy);
            assert!(
                workspace.message.contains("Cannot read ZIP"),
                "The selected path with spaces must reach ZIP validation"
            );
            assert!(workspace.rows().is_empty());
        });
    }

    #[gpui::test]
    fn organization_answers_stay_open_and_offer_relevant_next_steps(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("org create Club");
        cx.simulate_keystrokes("enter");
        cx.simulate_input("org list");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert!(workspace.palette_open);
            let result = workspace.command_result.as_ref().unwrap();
            assert_eq!(result.title, "Organizations");
            assert!(
                result
                    .lines
                    .iter()
                    .any(|line| line == "Current organization: Club")
            );
            assert!(result.lines.iter().any(|line| line == "Default"));
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|entry| entry.value == "org use Default")
            );
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Current organization: Club")
            );
        });
        cx.simulate_keystrokes("down enter");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.organization, "Default");
            assert!(workspace.palette_open);
        });
        cx.simulate_input("org create");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.pending_command.unwrap().command, "org create");
            assert!(workspace.command_result.is_none());
        });
    }

    #[gpui::test]
    fn scan_prompt_offers_zip_picker_and_invalid_files_show_recovery(
        cx: &mut gpui::TestAppContext,
    ) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("scan");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.pending_command.unwrap().command, "scan");
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|entry| entry.value == "@choose-zip")
            );
        });
        cx.simulate_keystrokes("escape");
        cx.simulate_input("scan /tmp/receipt.txt");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert!(workspace.palette_open && workspace.is_error);
            assert!(!workspace.scan_busy);
            assert!(
                workspace
                    .command_result
                    .as_ref()
                    .unwrap()
                    .lines
                    .iter()
                    .any(|line| line.contains("ZIP chat export"))
            );
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|entry| entry.value == "scan-zip")
            );
        });
    }

    #[gpui::test]
    fn guided_arguments_append_values_retry_and_cancel(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("org create");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.input.read(cx).value(), "");
            assert_eq!(workspace.pending_command.unwrap().command, "org create");
            assert!(
                workspace.palette_entries(cx).is_empty(),
                "A new name has no fixed choices"
            );
        });
        cx.simulate_input("Community Books");
        cx.simulate_keystrokes("enter cmd-k");
        cx.simulate_input("org use");
        cx.simulate_keystrokes("enter cmd-r");
        view.read_with(cx, |workspace, cx| {
            let choices = workspace.palette_entries(cx);
            assert!(choices.iter().any(|choice| choice.value == "Default"));
            assert!(
                choices
                    .iter()
                    .any(|choice| choice.value == "Community Books")
            );
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("2 options")
            );
        });
        cx.simulate_input("Missing organization");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert!(workspace.is_error && workspace.palette_open);
            assert_eq!(workspace.pending_command.unwrap().command, "org use");
            assert_eq!(workspace.input.read(cx).value(), "Missing organization");
            assert_eq!(workspace.organization, "Community Books");
        });
        cx.simulate_keystrokes("cmd-a backspace");
        cx.simulate_input("Default");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.organization, "Default");
            assert!(workspace.pending_command.is_none());
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("find");
        cx.simulate_keystrokes("enter");
        cx.simulate_input("coffee");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| assert_eq!(workspace.query, "coffee"));
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("org create");
        cx.simulate_keystrokes("enter escape");
        view.read_with(cx, |workspace, cx| {
            assert!(workspace.pending_command.is_none() && workspace.palette_open);
            assert_eq!(workspace.input.read(cx).value(), "");
        });
    }

    #[gpui::test]
    fn guided_transaction_choices_require_explicit_save(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-n");
        for value in ["12.50", "Coffee"] {
            cx.simulate_input(value);
            cx.simulate_keystrokes("enter");
        }
        view.read_with(cx, |workspace, cx| {
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|choice| choice.label == "Leave uncategorized")
            );
        });
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.draft.as_ref().unwrap().step, 3);
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|choice| choice.value == "USD")
            );
        });
        // EUR is the first nondefault currency; up selects the explicit default.
        cx.simulate_keystrokes("down down cmd-r");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.speech.last_text.as_ref().unwrap().contains("EUR"))
        });
        cx.simulate_keystrokes("up enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.draft.as_ref().unwrap().row.currency, "LKR");
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|choice| choice.label.contains("default date"))
            );
        });
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.draft.as_ref().unwrap().step, 5);
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|choice| choice.value == "save")
            );
            assert!(
                workspace
                    .palette_entries(cx)
                    .iter()
                    .any(|choice| choice.value == "cancel")
            );
        });
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert!(
                workspace.rows().is_empty(),
                "Blank Enter must not save a transaction"
            );
            assert!(workspace.draft.is_some() && workspace.is_error);
        });
        cx.simulate_keystrokes("down enter");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.rows().len(), 1);
            assert!(workspace.draft.is_none());
            assert_eq!(workspace.rows()[0].description, "Coffee");
        });
    }

    #[gpui::test]
    fn palette_search_selection_arguments_and_escape(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-k down");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.palette_open);
            assert_eq!(workspace.palette_selected, 1);
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Record expense")
            );
        });
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.draft.as_ref().unwrap().row.kind == Kind::Expense);
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Amount")
            );
        });
        cx.simulate_input("invalid");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.is_error);
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("positive amount")
            );
            assert!(workspace.rows().is_empty());
        });
        cx.simulate_keystrokes("escape cmd-k");
        cx.simulate_input("create organization");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.input.read(cx).value(), "");
            assert_eq!(workspace.pending_command.unwrap().command, "org create");
            assert!(workspace.palette_open);
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("organization name")
            );
        });
        cx.simulate_input("Community");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.organization, "Community")
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("summary");
        cx.simulate_keystrokes("cmd-r");
        view.read_with(cx, |workspace, _| {
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Show summary")
            );
        });
        cx.simulate_keystrokes("escape escape");
        view.read_with(cx, |workspace, _| assert!(!workspace.palette_open));
    }

    #[gpui::test]
    fn audio_reads_filtered_records_summary_and_saved_preference(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        for (description, amount) in [("Coffee", "12.50"), ("Bus", "3.25")] {
            cx.simulate_keystrokes("cmd-n");
            for text in [amount, description, "Travel", "USD", "2026-10-01", "save"] {
                cx.simulate_input(text);
                cx.simulate_keystrokes("enter");
            }
        }
        cx.simulate_keystrokes("cmd-shift-r");
        view.read_with(cx, |workspace, _| {
            let spoken = workspace.speech.last_text.as_ref().unwrap();
            assert!(
                spoken.contains("Transaction 1 of 2")
                    && spoken.contains("Bus")
                    && spoken.contains("USD 3.25")
            );
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("read next");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Coffee")
            )
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("find bus");
        cx.simulate_keystrokes("enter cmd-shift-r");
        view.read_with(cx, |workspace, _| {
            let spoken = workspace.speech.last_text.as_ref().unwrap();
            assert!(spoken.contains("Transaction 1 of 1") && spoken.contains("Bus"));
        });
        cx.simulate_keystrokes("cmd-2 cmd-shift-r");
        view.read_with(cx, |workspace, _| {
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Expenses 15.75")
            )
        });
        cx.simulate_keystrokes("cmd-shift-a");
        view.read_with(cx, |workspace, _| assert!(!workspace.audio_enabled));
        assert_eq!(
            fs::read_to_string(directory.path().join("spoken-feedback.json")).unwrap(),
            "false"
        );
        cx.simulate_keystrokes("cmd-shift-r");
        view.read_with(cx, |workspace, _| {
            assert!(
                workspace
                    .speech
                    .last_text
                    .as_ref()
                    .unwrap()
                    .contains("Spoken feedback off")
            )
        });
        cx.simulate_keystrokes("cmd-shift-a");
        view.read_with(cx, |workspace, _| assert!(workspace.audio_enabled));
    }

    #[gpui::test]
    fn panels_focus_navigate_and_close_without_consuming_input(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        view.read_with(cx, |workspace, _| {
            assert!(!workspace.left.open && !workspace.right.open);
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("unfinished command");
        cx.simulate_keystrokes("cmd-b up down enter");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(workspace.left.open && workspace.left.focus.is_focused(window));
            assert!(workspace.page == Page::Summary);
            assert_eq!(workspace.input.read(cx).value(), "unfinished command");
        });
        cx.simulate_keystrokes("end down");
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.left.selected, PAGES.len() - 1)
        });
        cx.simulate_keystrokes("home");
        view.read_with(cx, |workspace, _| assert_eq!(workspace.left.selected, 0));

        cx.simulate_keystrokes("cmd-alt-b down");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(workspace.left.open && workspace.right.open);
            assert!(workspace.right.focus.is_focused(window));
            assert_eq!(workspace.right.selected, 1);
            assert_eq!(workspace.left.selected, 0);
        });
        // Closing an unfocused panel must leave the other panel's focus intact.
        cx.simulate_keystrokes("cmd-b");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(!workspace.left.open && workspace.right.open);
            assert!(workspace.right.focus.is_focused(window));
        });
        cx.simulate_keystrokes("enter");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(workspace.draft.as_ref().unwrap().row.kind == Kind::Expense);
            assert!(workspace.input.focus_handle(cx).is_focused(window));
        });
        cx.simulate_input("12.50");
        cx.simulate_keystrokes("cmd-alt-b cmd-alt-b escape");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(!workspace.right.open);
            assert!(workspace.input.focus_handle(cx).is_focused(window));
            assert_eq!(workspace.input.read(cx).value(), "12.50");
            assert!(
                workspace.draft.is_some(),
                "Panel Escape must not discard a draft"
            );
        });
        cx.simulate_keystrokes("cmd-b cmd-b");
        cx.update(|window, cx| {
            let workspace = view.read(cx);
            assert!(!workspace.left.open);
            assert!(workspace.input.focus_handle(cx).is_focused(window));
        });
        // Command focus may be restored while a panel remains visible.
        cx.simulate_keystrokes("cmd-b cmd-k left backspace");
        view.read_with(cx, |workspace, cx| {
            assert!(workspace.left.open);
            assert_eq!(workspace.input.read(cx).value(), "12.0");
        });
    }

    #[gpui::test]
    fn keyboard_entry_review_save_search_and_cancel(cx: &mut gpui::TestAppContext) {
        let directory = tempfile::tempdir().unwrap();
        cx.update(bind_keys);
        let (view, cx) = cx.add_window_view(|window, cx| {
            Workspace::new(directory.path().to_path_buf(), window, cx)
        });
        cx.simulate_keystrokes("cmd-n");
        view.read_with(cx, |workspace, _| assert!(workspace.draft.is_some()));
        for text in ["12.50", "Café ☕", "Food", "USD", "2026-10-01"] {
            cx.simulate_input(text);
            cx.simulate_keystrokes("enter");
        }
        view.read_with(cx, |workspace, _| {
            assert_eq!(workspace.draft.as_ref().unwrap().step, 5);
            assert!(
                workspace.rows().is_empty(),
                "Review must precede persistence"
            );
        });
        cx.simulate_input("save");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.draft.is_none());
            assert_eq!(workspace.rows().len(), 1);
            assert_eq!(workspace.rows()[0].description, "Café ☕");
            assert_eq!(workspace.rows()[0].cents, 1250);
        });
        cx.simulate_keystrokes("cmd-k");
        cx.simulate_input("find café");
        cx.simulate_keystrokes("enter");
        view.read_with(cx, |workspace, _| assert_eq!(workspace.query, "café"));
        cx.simulate_keystrokes("escape cmd-2");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.page == Page::Summary);
            assert!(workspace.query.is_empty());
        });
        cx.simulate_keystrokes("cmd-n escape");
        view.read_with(cx, |workspace, _| {
            assert!(workspace.draft.is_none());
            assert_eq!(workspace.rows().len(), 1);
        });
    }
}
