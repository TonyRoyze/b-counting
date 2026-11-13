use chrono::{Local, NaiveDate, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Income,
    Expense,
}

impl Kind {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Income => "Income",
            Self::Expense => "Expense",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub date: NaiveDate,
    pub kind: Kind,
    pub cents: i64,
    pub currency: String,
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub voucher_number: String,
}

pub fn amount(text: &str) -> Result<i64, String> {
    let text = text.trim();
    let (whole, fraction) = text.split_once('.').unwrap_or((text, ""));
    if whole.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || fraction.len() > 2
        || !fraction.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(
            "Enter a positive amount with at most two decimal places, e.g. 1250.50.".into(),
        );
    }
    let major: i64 = whole.parse().map_err(|_| "Amount is too large.")?;
    let minor: i64 = format!("{fraction:0<2}")
        .parse()
        .map_err(|_| "Invalid amount.")?;
    let result = major
        .checked_mul(100)
        .and_then(|v| v.checked_add(minor))
        .filter(|v| *v > 0 && *v <= 99_999_999_999_999)
        .ok_or("Amount must be between 0.01 and 999,999,999,999.99.")?;
    Ok(result)
}

pub fn money(cents: i128) -> String {
    let absolute = cents.abs();
    let digits = (absolute / 100).to_string();
    let mut grouped = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    format!(
        "{}{grouped}.{:02}",
        if cents < 0 { "−" } else { "" },
        absolute % 100
    )
}

pub fn totals(rows: &[Transaction]) -> BTreeMap<String, (i128, i128)> {
    let mut result = BTreeMap::new();
    for row in rows {
        let entry = result.entry(row.currency.clone()).or_insert((0, 0));
        match row.kind {
            Kind::Income => entry.0 += row.cents as i128,
            Kind::Expense => entry.1 += row.cents as i128,
        }
    }
    result
}

pub struct Ledger {
    pub rows: Vec<Transaction>,
    pub directory: PathBuf,
    // Keep the lock alive for the full session to prevent concurrent lost updates.
    _lock: File,
}

impl Ledger {
    pub fn open(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|e| format!("Cannot create data folder: {e}"))?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("ledger.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock_exclusive()
            .map_err(|_| "This ledger is already open in another app instance.".to_string())?;
        let path = directory.join("ledger.json");
        let rows: Vec<Transaction> = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| {
                format!("Cannot read ledger.json; the original file was preserved: {e}")
            })?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(format!("Cannot open ledger: {e}")),
        };
        let mut ids = std::collections::HashSet::new();
        for row in &rows {
            if amount(&format!("{}.{:02}", row.cents / 100, row.cents % 100)).ok()
                != Some(row.cents)
                || !valid_currency(&row.currency)
                || row.description.trim().is_empty()
                || row.category.len() > 80
                || row.voucher_number.len() > 120
                || row.id.is_empty()
                || !ids.insert(&row.id)
            {
                return Err(
                    "Ledger contains an invalid record; the original file was preserved.".into(),
                );
            }
        }
        Ok(Self {
            rows,
            directory,
            _lock: lock,
        })
    }

    pub fn append(&mut self, row: Transaction) -> Result<(), String> {
        let mut next = self.rows.clone();
        next.push(row);
        let bytes = serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?;
        self.atomic_write("ledger.json", &bytes)?;
        self.rows = next;
        Ok(())
    }

    fn atomic_write(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        let mut temporary =
            tempfile::NamedTempFile::new_in(&self.directory).map_err(|e| e.to_string())?;
        temporary
            .write_all(bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|e| e.to_string())?;
        temporary
            .persist(self.directory.join(name))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn export(&self) -> Result<PathBuf, String> {
        fn escape(value: &str) -> String {
            value
                .replace('\\', "\\\\")
                .replace('\t', "\\t")
                .replace('\n', "\\n")
                .replace('\r', "\\r")
        }
        let mut output = "# B-Counting ledger v1\nid\ttransactionDate\tcreatedAt\ttype\tamount\tcurrency\taccount\tcategory\tdescription\tnotes\tvoucherNumber\n".to_string();
        for row in &self.rows {
            let fields = [
                row.id.clone(),
                row.date.to_string(),
                format!("{}T00:00:00Z", row.date),
                row.kind.label().to_lowercase(),
                format!("{}.{:02}", row.cents / 100, row.cents % 100),
                row.currency.clone(),
                "Cash".into(),
                row.category.clone(),
                row.description.clone(),
                String::new(),
                row.voucher_number.clone(),
            ];
            output.push_str(
                &fields
                    .iter()
                    .map(|s| escape(s))
                    .collect::<Vec<_>>()
                    .join("\t"),
            );
            output.push('\n');
        }
        let name = format!("export-{}.tsv", Utc::now().format("%Y%m%d-%H%M%S-%f"));
        self.atomic_write(&name, output.as_bytes())?;
        Ok(self.directory.join(name))
    }
}

fn valid_currency(value: &str) -> bool {
    value.len() == 3 && value.bytes().all(|c| c.is_ascii_uppercase())
}

pub struct Draft {
    pub step: usize,
    pub row: Transaction,
}

impl Draft {
    pub fn new(kind: Kind) -> Self {
        Self {
            step: 0,
            row: Transaction {
                id: Utc::now().format("%Y%m%d%H%M%S%f").to_string(),
                date: Local::now().date_naive(),
                kind,
                cents: 0,
                currency: "LKR".into(),
                description: String::new(),
                category: String::new(),
                voucher_number: String::new(),
            },
        }
    }
    pub fn prompt(&self) -> String {
        match self.step {
            0 => "Amount · e.g. 1250.50".into(),
            1 => "Description · what was this for?".into(),
            2 => "Category · Enter to leave uncategorized".into(),
            3 => "Currency · Enter for LKR, or a three-letter code".into(),
            4 => format!("Date · Enter for {}, or YYYY-MM-DD", self.row.date),
            5 => "Voucher / receipt number · optional".into(),
            _ => "Review transaction · type save to confirm, or cancel".into(),
        }
    }
    pub fn accept(&mut self, value: &str) -> Result<(), String> {
        let value = value.trim();
        match self.step {
            0 => self.row.cents = amount(value)?,
            1 => {
                if value.is_empty() || value.len() > 240 {
                    return Err("Description must contain 1–240 bytes.".into());
                }
                self.row.description = value.into();
            }
            2 => {
                if value.len() > 80 {
                    return Err("Category must be at most 80 bytes.".into());
                }
                self.row.category = value.into();
            }
            3 => {
                if !value.is_empty() {
                    let code = value.to_uppercase();
                    if !valid_currency(&code) {
                        return Err("Use a three-letter currency code, e.g. LKR or USD.".into());
                    }
                    self.row.currency = code;
                }
            }
            4 => {
                if !value.is_empty() {
                    self.row.date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
                        .map_err(|_| "Enter a valid date in YYYY-MM-DD format.")?;
                }
            }
            5 => {
                if value.len() > 120 {
                    return Err("Voucher / receipt number must be at most 120 bytes.".into());
                }
                self.row.voucher_number = value.into();
            }
            _ => return Err("Type save to confirm or cancel to discard.".into()),
        }
        self.step += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn money_is_exact_and_rejects_invalid_input() {
        assert_eq!(amount("1250.5"), Ok(125050));
        assert_eq!(amount("0.01"), Ok(1));
        for bad in [
            "0",
            "-1",
            "NaN",
            "1.234",
            "1,000",
            "1e3",
            "9999999999999999999999",
        ] {
            assert!(amount(bad).is_err(), "{bad}");
        }
        assert_eq!(money(-123456), "−1,234.56");
    }
    #[test]
    fn draft_requires_validation_and_review() {
        let mut d = Draft::new(Kind::Expense);
        assert!(d.accept("wrong").is_err());
        assert_eq!(d.step, 0);
        for value in ["10.25", "Coffee", "Food", "usd", "2026-10-01", "V-42"] {
            d.accept(value).unwrap();
        }
        assert_eq!(d.step, 6);
        assert_eq!(d.row.currency, "USD");
        assert_eq!(d.row.voucher_number, "V-42");
        assert!(d.accept("anything").is_err());
    }
    #[test]
    fn storage_roundtrip_lock_corruption_and_export() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();
        let mut ledger = Ledger::open(path.clone()).unwrap();
        assert!(Ledger::open(path.clone()).is_err());
        let mut d = Draft::new(Kind::Income);
        for value in [
            "10",
            "Work\twith slash \\ and newline\n",
            "Salary",
            "",
            "",
            "",
        ] {
            d.accept(value).unwrap();
        }
        ledger.append(d.row).unwrap();
        let export = fs::read_to_string(ledger.export().unwrap()).unwrap();
        assert!(export.starts_with("# B-Counting ledger v1\n"));
        assert!(export.contains("Work\\twith slash \\\\ and newline"));
        drop(ledger);
        assert_eq!(Ledger::open(path.clone()).unwrap().rows.len(), 1);
        fs::write(path.join("ledger.json"), b"broken").unwrap();
        assert!(Ledger::open(path.clone()).is_err());
        assert_eq!(fs::read(path.join("ledger.json")).unwrap(), b"broken");
    }
    #[test]
    fn currencies_are_never_combined() {
        let mut first = Draft::new(Kind::Income).row;
        first.cents = 100;
        let mut second = first.clone();
        second.currency = "USD".into();
        second.kind = Kind::Expense;
        let result = totals(&[first, second]);
        assert_eq!(result["LKR"], (100, 0));
        assert_eq!(result["USD"], (0, 100));
    }
    #[test]
    fn failed_save_does_not_change_memory() {
        let dir = tempfile::tempdir().unwrap();
        let mut ledger = Ledger::open(dir.path().to_path_buf()).unwrap();
        fs::create_dir(dir.path().join("ledger.json")).unwrap();
        let mut row = Draft::new(Kind::Income).row;
        row.cents = 100;
        row.description = "Work".into();
        assert!(ledger.append(row).is_err());
        assert!(ledger.rows.is_empty());
    }
}
