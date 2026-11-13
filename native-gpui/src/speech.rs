//! Own only this app's speech process; never stop another application's audio.
use std::process::{Child, Command, Stdio};

#[derive(Default)]
pub struct Speech {
    child: Option<Child>,
    #[cfg(test)]
    pub last_text: Option<String>,
}

impl Speech {
    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn speak_with_voice(&mut self, text: &str, voice: &str) -> Result<(), String> {
        self.stop();
        #[cfg(test)]
        {
            self.last_text = Some(text.to_owned());
        }
        if cfg!(test) || text.is_empty() {
            return Ok(());
        }
        #[cfg(target_os = "macos")]
        {
            self.child = Some(
                Command::new("/usr/bin/say")
                    .args(["-v", voice])
                    .arg("--")
                    .arg(text)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|error| format!("Cannot start spoken feedback: {error}"))?,
            );
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        Err("Spoken feedback currently requires macOS.".into())
    }
}

impl Drop for Speech {
    fn drop(&mut self) {
        self.stop();
    }
}
