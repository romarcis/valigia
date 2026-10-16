mod oauth;
mod places;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // Android: native Google sign-in (Credential Manager). Desktop keeps its own loopback flow (oauth.rs).
  #[cfg(mobile)]
  let builder = builder.plugin(tauri_plugin_google_auth::init());
  builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![places::places_available, places::places_autocomplete, places::places_details, places::places_info, oauth::oauth_listen])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
