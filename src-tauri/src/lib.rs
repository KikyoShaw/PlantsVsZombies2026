use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, sync::Mutex};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const PROFILE_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    wave: u32,
    kills: u32,
    score: u32,
    won: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    version: u32,
    sound: bool,
    #[serde(default)]
    total_runs: u32,
    records: BTreeMap<String, Record>,
}

impl Default for Profile {
    fn default() -> Self {
        Self { version: PROFILE_VERSION, sound: true, total_runs: 0, records: BTreeMap::new() }
    }
}

impl Profile {
    fn validate(&self) -> Result<(), String> {
        if self.version != PROFILE_VERSION {
            return Err("存档版本不兼容".into());
        }
        Ok(())
    }
}

#[tauri::command]
fn load_profile(app: tauri::AppHandle, lock: tauri::State<'_, Mutex<()>>) -> Result<Profile, String> {
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("profile.json");
    match fs::read(&path) {
        Ok(bytes) => {
            let profile: Profile = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            profile.validate()?;
            Ok(profile)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Profile::default()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_profile(app: tauri::AppHandle, lock: tauri::State<'_, Mutex<()>>, profile: Profile) -> Result<(), String> {
    profile.validate()?;
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(&profile).map_err(|e| e.to_string())?;
    // A separate temporary name per process also avoids collisions between app instances.
    let temporary = directory.join(format!("profile.{}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }
        // Keep the original file intact until the complete, flushed replacement is ready.
        fs::rename(&temporary, directory.join("profile.json"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn open_repository(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("https://github.com/KikyoShaw/PlantsVsZombies2026", None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(()))
        .invoke_handler(tauri::generate_handler![load_profile, save_profile, open_repository])
        .run(tauri::generate_context!())
        .expect("failed to start Garden Guard");
}