use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

const MAX_FILES: usize = 10_000;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;

pub struct Export {
    pub directory: PathBuf,
    // Keep extraction alive until text extraction completes, then clean it up.
    _temporary: Option<tempfile::TempDir>,
}

pub fn prepare(path: &Path) -> Result<Export, String> {
    if path.is_dir() {
        return Ok(Export {
            directory: path.to_owned(),
            _temporary: None,
        });
    }
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err("Choose a ZIP chat export or an extracted export folder.".into());
    }
    let file = fs::File::open(path).map_err(|error| format!("Cannot open ZIP: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Cannot read ZIP: {error}"))?;
    if archive.len() > MAX_FILES {
        return Err("ZIP contains too many files (maximum 10,000).".into());
    }
    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
    let mut total = 0_u64;
    let mut chats = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or("ZIP contains a path outside its export folder.")?;
        if entry.is_symlink() {
            return Err("ZIP contains a symbolic link. Export files must be regular files.".into());
        }
        if entry.is_dir() {
            continue;
        }
        let is_chat = enclosed.file_name().is_some_and(|name| name == "_chat.txt");
        let is_receipt = enclosed
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| {
                matches!(
                    ext.to_ascii_lowercase().as_str(),
                    "pdf" | "png" | "jpg" | "jpeg"
                )
            });
        if !is_chat && !is_receipt {
            continue;
        }
        if entry.size() > MAX_FILE_BYTES || total.saturating_add(entry.size()) > MAX_TOTAL_BYTES {
            return Err("Export is too large: each scanned file must be at most 64 MB and extracted receipts at most 512 MB.".into());
        }
        let target = temporary.path().join(enclosed);
        fs::create_dir_all(target.parent().ok_or("Invalid ZIP path.")?)
            .map_err(|error| error.to_string())?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|error| format!("Cannot extract ZIP entry: {error}"))?;
        let copied = io::copy(&mut (&mut entry).take(MAX_FILE_BYTES + 1), &mut output)
            .map_err(|error| format!("Cannot extract ZIP: {error}"))?;
        total = total.saturating_add(copied);
        if copied > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES {
            return Err("Extracted ZIP exceeds the scan size limit.".into());
        }
        if is_chat {
            chats.push(target);
        }
    }
    if chats.len() != 1 {
        return Err(if chats.is_empty() {
            "ZIP must contain a WhatsApp export with _chat.txt and its receipt attachments."
        } else {
            "ZIP contains multiple chats. Choose an export of a single chat."
        }
        .into());
    }
    let directory = chats[0]
        .parent()
        .ok_or("Invalid chat export path.")?
        .to_owned();
    Ok(Export {
        directory,
        _temporary: Some(temporary),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn archive(entries: &[(&str, &[u8])]) -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chat.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        for (name, content) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(content).unwrap();
        }
        writer.finish().unwrap();
        (directory, path)
    }

    #[test]
    fn nested_zip_is_extracted_and_cleaned_up() {
        let (_source, zip) = archive(&[
            ("Chat/_chat.txt", b"paid receipt.pdf"),
            ("Chat/receipt.pdf", b"receipt"),
            ("Chat/movie.mp4", b"ignored"),
        ]);
        let export = prepare(&zip).unwrap();
        assert_eq!(
            fs::read(export.directory.join("receipt.pdf")).unwrap(),
            b"receipt"
        );
        assert!(!export.directory.join("movie.mp4").exists());
        let extracted = export.directory.clone();
        drop(export);
        assert!(!extracted.exists());
        assert!(zip.exists(), "The original archive must be preserved");
    }

    #[test]
    fn invalid_paths_and_missing_or_multiple_chats_are_rejected() {
        for entries in [
            vec![("../escape.txt", b"bad".as_slice())],
            vec![("receipt.pdf", b"receipt".as_slice())],
            vec![
                ("A/_chat.txt", b"a".as_slice()),
                ("B/_chat.txt", b"b".as_slice()),
            ],
        ] {
            let (_source, zip) = archive(&entries);
            assert!(prepare(&zip).is_err());
        }
        let (_source, zip) = archive(&[("_chat.txt", b"chat")]);
        fs::write(&zip, b"not a zip").unwrap();
        assert!(prepare(&zip).err().unwrap().contains("Cannot read ZIP"));
    }
    #[test]
    fn symlinks_and_duplicate_paths_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("link.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        writer
            .add_symlink("receipt.pdf", "../outside", SimpleFileOptions::default())
            .unwrap();
        writer.finish().unwrap();
        assert!(prepare(&path).err().unwrap().contains("symbolic link"));
        let (_source, duplicate) = archive(&[("_chat.txt", b"one"), ("./_chat.txt", b"two")]);
        assert!(prepare(&duplicate).is_err());
    }
}
