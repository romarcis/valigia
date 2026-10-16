// Loopback redirect for Google sign-in on desktop (RFC 8252): listen once on 127.0.0.1 at a free
// port, hand the port to the app, and emit the redirected request path when the browser comes back.
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const PAGE: &str = "<!doctype html><meta charset=utf-8><title>Valigia</title>\
<body style=\"font:18px system-ui;display:grid;place-items:center;height:90vh;color:#16213f\">\
<p>Accesso completato: puoi tornare a <b>Valigia</b> e chiudere questa scheda.</p>";

#[tauri::command]
pub fn oauth_listen(app: AppHandle) -> Result<u16, String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  listener.set_nonblocking(true).map_err(|e| e.to_string())?;
  std::thread::spawn(move || {
    // One request is enough; ignore anything that is not a GET with a query (favicon, probes).
    // Give up after 5 minutes so an abandoned sign-in does not keep the port open.
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    while std::time::Instant::now() < deadline {
      let stream = match listener.accept() {
        Ok((s, _)) => s,
        Err(_) => { std::thread::sleep(Duration::from_millis(200)); continue; }
      };
      let _ = stream.set_nonblocking(false);
      let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
      let mut line = String::new();
      if BufReader::new(&stream).read_line(&mut line).is_err() { continue; }
      let path = line.split_whitespace().nth(1).unwrap_or("").to_string();
      let mut s = stream;
      let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", PAGE.len(), PAGE);
      if path.contains("code=") || path.contains("error=") {
        let _ = app.emit("oauth-redirect", path);
        break;
      }
    }
  });
  Ok(port)
}
