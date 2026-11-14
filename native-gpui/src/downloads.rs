use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

pub fn zip_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Cannot read Downloads: {error}. Choose a ZIP file instead."))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Cannot list Downloads: {error}"))?;
        let path = entry.path();
        if !path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
            || !entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_file()
        {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        files.push((modified, path));
    }
    files.sort_by(|(a_time, a_path), (b_time, b_path)| {
        b_time.cmp(a_time).then_with(|| a_path.cmp(b_path))
    });
    Ok(files.into_iter().map(|(_, path)| path).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_zip_files_and_refreshes_without_scanning_them() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join("Club export.zip"),
            b"not opened during discovery",
        )
        .unwrap();
        fs::write(directory.path().join("New.ZIP"), b"archive").unwrap();
        fs::write(directory.path().join("notes.txt"), b"notes").unwrap();
        fs::create_dir(directory.path().join("folder.zip")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            directory.path().join("New.ZIP"),
            directory.path().join("link.zip"),
        )
        .unwrap();
        let files = zip_files(directory.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert!(
            files
                .iter()
                .any(|file| file.file_name().unwrap() == "Club export.zip")
        );
        fs::remove_file(directory.path().join("New.ZIP")).unwrap();
        assert_eq!(zip_files(directory.path()).unwrap().len(), 1);
        assert!(
            zip_files(&directory.path().join("missing"))
                .err()
                .unwrap()
                .contains("Choose a ZIP")
        );
    }
}
