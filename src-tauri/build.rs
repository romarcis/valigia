fn main() {
  // places.rs compiles the Google Places key in: rebuild when it is set or changed.
  println!("cargo:rerun-if-env-changed=GOOGLE_PLACES_KEY");
  tauri_build::build()
}
