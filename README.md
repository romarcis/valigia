# Valigia

Pianificatore di viaggi multi-tappa per Windows e Android (Tauri 2 + React).
Mappa con le tappe, luoghi da vedere (foto e testi da Wikipedia), itinerario giorno per giorno,
hotel con voti e prezzi reali (ricerca web con fonti), spostamenti consigliati.

## AI

Nessun server: ogni utente collega la propria AI dalle Impostazioni.

- **OpenRouter** (consigliato): "Accedi con OpenRouter" (OAuth PKCE, si incolla il codice). Un credito per Claude, GPT, DeepSeek… La ricerca web costa circa 0,5–0,7 cent a ricerca.
- **Gemini** (modello a scelta, predefinito `gemini-3.8-flash`): chiave gratuita da https://aistudio.google.com/apikey. Con la chiave gratuita la ricerca Google funziona solo con `gemini-2.5-flash` / `2.5-flash-lite` (500 al giorno); con i 3.x serve la fatturazione attiva, altrimenti hotel e spostamenti risultano non verificati.
- **DeepSeek** (`deepseek-flash` / `deepseek-v4-pro`): chiave da https://platform.deepseek.com/api_keys. Senza ricerca web, quindi hotel e spostamenti risultano non verificati.
- **Endpoint compatibile OpenAI** (OmniRoute, Ollama, LM Studio su `localhost`): senza ricerca web, quindi hotel e spostamenti risultano non verificati.

Gli abbonamenti Claude Pro/Max e ChatGPT Plus non si possono usare in app di terze parti.

## Sviluppo

```sh
npm install
npm run dev            # solo interfaccia, nel browser
npx tauri dev          # app desktop Windows
node src/util.test.mjs # controllo della logica di ordinamento hotel e date
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

L'APK di release va firmato prima di distribuirlo: https://v2.tauri.app/distribute/sign/android/
