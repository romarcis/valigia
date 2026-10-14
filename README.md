# Valigia

Pianificatore di viaggi multi-tappa per Windows e Android (Tauri 2 + React).
Mappa con le tappe, luoghi da vedere (foto e testi da Wikipedia), itinerario giorno per giorno,
l'hotel che hai prenotato come partenza di ogni giornata, spostamenti consigliati.

## AI

Nessun server: ogni utente collega la propria AI dalle Impostazioni.

- **OpenRouter** (consigliato): "Accedi con OpenRouter" (OAuth PKCE, si incolla il codice). Un credito per Claude, GPT, DeepSeek… La ricerca web costa circa 0,5–0,7 cent a ricerca.
- **Gemini** (modello a scelta, predefinito `gemini-3.8-flash`): chiave gratuita da https://aistudio.google.com/apikey. Con la chiave gratuita la ricerca Google funziona solo con `gemini-2.5-flash` / `2.5-flash-lite` (500 al giorno); con i 3.x serve la fatturazione attiva, altrimenti gli spostamenti risultano non verificati.
- **DeepSeek** (`deepseek-flash` / `deepseek-v4-pro`): chiave da https://platform.deepseek.com/api_keys. Senza ricerca web, quindi gli spostamenti risultano non verificati.
- **Endpoint compatibile OpenAI** (OmniRoute, Ollama, LM Studio su `localhost`): senza ricerca web, quindi gli spostamenti risultano non verificati.

Gli abbonamenti Claude Pro/Max e ChatGPT Plus non si possono usare in app di terze parti.

## Hotel e ristoranti: Google Places (facoltativo)

Hotel, B&B e ristoranti si cercano su OpenStreetMap; se l'app è compilata con una chiave Google, prima su Google Places (trova anche le piccole strutture che OpenStreetMap non conosce).
La chiave non sta nel repository né nell'interfaccia: viene compilata nella parte Rust da `GOOGLE_PLACES_KEY` e solo Rust chiama Google.
Si può comunque estrarre dall'eseguibile: in Google Cloud limitala alla sola **Places API (New)** e metti un tetto giornaliero alle richieste.

- Sviluppo: variabile d'ambiente utente `GOOGLE_PLACES_KEY`, poi riavvia `npx tauri dev`.
- Release: secret `GOOGLE_PLACES_KEY` nel repository GitHub (Settings → Secrets → Actions).

Nota: le regole di Google Places chiedono di mostrare i risultati su una mappa Google e di non salvarne i dati (salvo l'ID del luogo); Valigia li mette sulla mappa OpenStreetMap e salva la posizione.

## Sviluppo

```sh
npm install
npm run dev            # solo interfaccia, nel browser
npx tauri dev          # app desktop Windows
node src/util.test.mjs # controllo della logica di date e itinerario
```

## Build

Windows (installer `.msi` / `.exe` in `src-tauri/target/release/bundle/`):

```sh
npx tauri build
```

Android (`.apk` in `src-tauri/gen/android/app/build/outputs/apk/`):

```powershell
$env:JAVA_HOME = "D:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\28.2.13676358"
npx tauri android build --apk --target aarch64
```

L'APK di release viene firmato se esiste `src-tauri/gen/android/keystore.properties` (`keyAlias`, `password`, `storeFile`), che non va mai committato.

### Release su GitHub

Aggiorna `version` in `src-tauri/tauri.conf.json`, poi `git tag v0.2.0 && git push --tags`. La action `.github/workflows/release.yml` crea una release in bozza con gli installer Windows; pubblicala da GitHub.
