// Google Places (New) for hotels and restaurants that OpenStreetMap does not know.
// The key is compiled in from the GOOGLE_PLACES_KEY environment variable and only used here, in Rust:
// it never reaches the webview or the repository. It can still be dug out of the binary, so restrict it
// to the Places API and cap its daily quota in Google Cloud.
use serde::Serialize;
use serde_json::{json, Value};
use tauri_plugin_http::reqwest::Client;

const KEY: Option<&str> = option_env!("GOOGLE_PLACES_KEY");
const API: &str = "https://places.googleapis.com/v1";

#[derive(Serialize)]
pub struct Suggestion {
  id: String,
  name: String,
  addr: String,
}

#[derive(Serialize)]
pub struct Place {
  id: String,
  name: String,
  addr: String,
  lat: f64,
  lng: f64,
}

fn key() -> Result<&'static str, String> {
  KEY.filter(|k| !k.is_empty()).ok_or_else(|| "no-places-key".into())
}

// Google answers errors as JSON with a message: pass it on, it says what is wrong with the key or quota.
async fn send(req: tauri_plugin_http::reqwest::RequestBuilder) -> Result<Value, String> {
  let res = req.send().await.map_err(|e| e.to_string())?;
  let status = res.status();
  let body: Value = serde_json::from_str(&res.text().await.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  if !status.is_success() {
    return Err(body["error"]["message"].as_str().unwrap_or(status.as_str()).to_string());
  }
  Ok(body)
}

#[tauri::command]
pub fn places_available() -> bool {
  key().is_ok()
}

// Suggestions while typing, only within `radius` metres of the point. One session token per search:
// Google bills the typing and the final details call as one session.
#[tauri::command]
pub async fn places_autocomplete(input: String, lat: f64, lng: f64, radius: f64, lang: String, session: String) -> Result<Vec<Suggestion>, String> {
  let body = json!({
    "input": input,
    "locationRestriction": { "circle": { "center": { "latitude": lat, "longitude": lng }, "radius": radius } },
    "languageCode": lang,
    "sessionToken": session,
  });
  let res = send(Client::new().post(format!("{API}/places:autocomplete")).header("X-Goog-Api-Key", key()?).header("Content-Type", "application/json").body(body.to_string())).await?;
  Ok(res["suggestions"].as_array().into_iter().flatten().filter_map(|s| {
    let p = &s["placePrediction"];
    Some(Suggestion {
      id: p["placeId"].as_str()?.to_string(),
      name: p["structuredFormat"]["mainText"]["text"].as_str().or(p["text"]["text"].as_str())?.to_string(),
      addr: p["structuredFormat"]["secondaryText"]["text"].as_str().unwrap_or("").to_string(),
    })
  }).collect())
}

// The picked suggestion's position (closes the session).
#[tauri::command]
pub async fn places_details(id: String, lang: String, session: String) -> Result<Place, String> {
  let url = format!("{API}/places/{id}?languageCode={lang}&sessionToken={session}");
  let p = send(Client::new().get(url).header("X-Goog-Api-Key", key()?).header("X-Goog-FieldMask", "id,displayName,formattedAddress,location")).await?;
  Ok(Place {
    id: p["id"].as_str().unwrap_or(&id).to_string(),
    name: p["displayName"]["text"].as_str().unwrap_or("").to_string(),
    addr: p["formattedAddress"].as_str().unwrap_or("").to_string(),
    lat: p["location"]["latitude"].as_f64().ok_or("no location")?,
    lng: p["location"]["longitude"].as_f64().ok_or("no location")?,
  })
}
