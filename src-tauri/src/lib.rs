use std::{fs, io::Write, path::Path};

#[tauri::command]
fn choose_ledger_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Text ledger", &["txt", "tsv"])
        .set_file_name("b-counting-ledger.txt")
        .save_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_ledger_file(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read ledger: {error}")),
    }
}

#[tauri::command]
fn write_ledger_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if path.trim().is_empty() || target.file_name().is_none() {
        return Err("Choose a complete file path.".into());
    }
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if parent != Path::new(".") {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create ledger folder: {error}"))?;
    }

    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Could not prepare ledger save: {error}"))?;
    temporary
        .write_all(contents.as_bytes())
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not write ledger: {error}"))?;
    temporary
        .persist(target)
        .map(|_| ())
        .map_err(|error| format!("Could not finish saving ledger: {}", error.error))
}

#[cfg(test)]
mod tests {
    use super::{read_ledger_file, write_ledger_file};
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    #[test]
    fn writes_and_reads_a_user_selected_ledger_path() {
        let suffix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let directory = std::env::temp_dir().join(format!("b-counting-test-{suffix}"));
        let path = directory.join("ledger.txt");
        let value = "# B-Counting ledger v1\nid\n";

        write_ledger_file(path.to_string_lossy().into_owned(), value.into()).unwrap();
        assert_eq!(read_ledger_file(path.to_string_lossy().into_owned()).unwrap().as_deref(), Some(value));

        fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            choose_ledger_file,
            read_ledger_file,
            write_ledger_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
