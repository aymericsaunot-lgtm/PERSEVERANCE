# Dashboard

A personal dashboard that runs on your phone and your computer and stays in sync:

- **Jarvis**: your assistant, running on Claude Sonnet 5.5 with your own Anthropic API key. A short briefing every day, and a chat that sees your dashboard and can add, reschedule and complete tasks, tick habits, log sport, add deadlines and remember things about you. Every change it makes can be undone.
- **Progress**: a level system fed by what you already log. Levels are named after the suits (level 9 is Mark IX), with a daily XP goal and four attributes: Work, Mind, Body and Discipline.
- **Today**: the next eight weeks on one line (beamtimes, deadlines, thesis), today's tasks, habits, reading, surf.
- **Tasks**: quick capture, areas, due dates, stars. Type `#PhD` in a title to set the area, end with `!` to star it.
- **Papers**: paste a DOI or arXiv ID and the details fill in; To read, Reading, Read; weekly, monthly and yearly counts; tags with real subscripts (MnBi₂Te₄); BibTeX export for the thesis.
- **arXiv watch**: every weekday morning, new cond-mat papers that match your keywords, one tap to add them to your reading list.
- **PhD**: beamtime countdowns, proposal and other deadlines, thesis chapters with progress.
- **Life**: surf forecast (swell, wind, tide, water temperature), sport log, habits.

It is a plain web app (no build step) that you install like a normal app. Data lives in your own free Firebase project. It works offline and syncs when the connection comes back.

Try it first: run `python3 -m http.server 8000` in this folder and open <http://localhost:8000/?demo>.

---

## Setup (about 15 minutes, free, no card)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and create a project. Google Analytics is not needed.
2. The project starts on the free Spark plan. Keep it there.

### 2. Register the web app

1. On the project overview, add an app and choose **Web** (the `</>` icon). No hosting needed.
2. Firebase shows a `firebaseConfig` object. Copy its six values into `config.js`:

```js
firebase: {
  apiKey: '...',
  authDomain: '...firebaseapp.com',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...',
},
```

These values are meant to be public. What protects your data is step 4.

### 3. Turn on sign-in and create your account

1. Open **Authentication**, click Get started, then **Sign-in method**, and enable **Email/Password**.
2. In **Users**, click **Add user** and enter your email and a password. This is the only account the app will accept.
3. Copy the **User UID** shown next to your email. You need it twice below.

### 4. Create the database and lock it

1. Open **Firestore** (under Databases in the left menu) and create a database. Choose the **Standard** edition, a location in Europe (for example the `eur3` multi-region), and **production mode**. The location cannot be changed later.
2. Open the **Rules** tab, paste the content of `firestore.rules`, replace `YOUR_UID` with your User UID, and click **Publish**.

### 5. Put the app online with GitHub Pages

1. Create a new **public** repository on GitHub, for example `dashboard`.
2. On the repository page, click **uploading an existing file**. Open this `dashboard` folder, select everything inside it (Ctrl+A), and drag it onto the upload page, then **Commit changes**. Drag the contents, not the folder itself, so `index.html` sits at the top of the repository.
3. In the repository, open **Settings, Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the app is live at `https://YOUR-GITHUB-NAME.github.io/dashboard/`.
5. Back in Firebase, **Authentication, Settings, Authorized domains**: add `YOUR-GITHUB-NAME.github.io`.

### 6. Install it

- **iPhone**: open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android**: open it in Chrome, menu, **Install app**.
- **Computer**: in Chrome or Edge, click the install icon at the right of the address bar.

Sign in once on each device. Changes made on one appear on the others within a second.

### 7. Turn on the arXiv watch

The watch is a small Python script (`scripts/arxiv_watch.py`) that GitHub runs for free every weekday at 05:23 UTC, shortly after arXiv publishes the new listings.

1. Firebase: **Project settings, Service accounts**, then **Generate new private key**. A JSON file downloads. Treat it like a password.
2. GitHub repository: **Settings, Secrets and variables, Actions**, then add two repository secrets:
   - `FIREBASE_SERVICE_ACCOUNT`: paste the whole content of the JSON file.
   - `DASHBOARD_UID`: your User UID.
3. Open the **Actions** tab, enable workflows if GitHub asks, choose **arXiv watch**, then **Run workflow** to test it. The log lists what matched.

Keywords and categories come from the app (Papers, arXiv watch), so you never edit the script to change them.

If the Actions tab shows no "arXiv watch" workflow, the hidden `.github` folder was not uploaded. In the repository, choose **Add file, Create new file**, name it `.github/workflows/arxiv-watch.yml`, and paste the content of that file from this folder.

How keywords match:

| You type | It finds |
| --- | --- |
| `MnBi2Te4` | `MnBi$_2$Te$_4$` and MnBi₂Te₄ (LaTeX and subscripts are ignored) |
| `moiré` | moiré, moire and `moir\'e` (accents are ignored) |
| `Rashba crystal` | papers with both words anywhere in the title or abstract |
| `"quantum spin liquid"` | that exact phrase |
| `author:Shen` | papers with an author named Shen |

`BiTeX` is matched literally, so add `BiTeI`, `BiTeBr` and `BiTeCl` as separate keywords if you want all three.

Two things to know about GitHub schedules: times can drift by a few minutes, and in a public repository GitHub pauses scheduled workflows after 60 days without any commit. You get an email; one click on **Enable workflow** in the Actions tab restarts it.

Test the script on your computer without touching Firebase:

```sh
python3 scripts/arxiv_watch.py --dry-run --keywords "MnBi2Te4, Rashba crystal, moiré"
```

### 8. Connect Jarvis

1. Go to <https://console.anthropic.com>, sign in, add a payment method under **Billing**, then open **API keys** and create a key. It starts with `sk-ant-`.
2. Still in the Console, set a monthly **spend limit** in the limits settings. A day of normal use costs a few cents: the briefing is around one cent, a chat message less than that.
3. In the app, open **Settings, Jarvis**, paste the key and tap **Save**. The app checks it with Anthropic without spending anything.
4. Repeat step 3 on each device. The key is stored only in that browser: it is never synced to Firebase, never included in backups, and only ever sent to `api.anthropic.com`.
5. Optional: in **Settings, About you**, tell Jarvis what to call you and what you are working towards. It reads this before every conversation.

What Jarvis sends to Anthropic: your messages, the "About you" text, what it remembers about you, and a summary of the dashboard (open tasks, habits, beamtimes, deadlines, thesis chapters, paper titles, sport sessions, the surf forecast and your level). Nothing else leaves your devices.

---

## Everyday use

- **Jarvis**: tap the orb (bottom right on a phone, Jarvis in the sidebar on a computer). Ask it anything about your day, or tell it what you did: "I surfed 90 minutes this morning", "move the Printify upload to Friday", "remind me the MAX IV report is due on the 3rd". Each change shows as a chip with an undo button. The microphone button dictates; the speaker button in the header reads replies aloud. One conversation per day; the plus button starts a fresh one.
- **Briefing**: written once a day when you first open Today, then shared with your other devices. The refresh button on the tile writes a new one. Turn it off in Settings, Jarvis.
- **Memories**: when you tell Jarvis something worth keeping (a goal, a routine, a preference), it saves it. Settings, What Jarvis remembers lists everything; delete anything there.
- **XP**: task done 10 (starred 20), deadline submitted 40, beamtime completed 100, thesis progress 6 per chapter point, paper read 30, sport 1 per 2 minutes (up to 60 a session), habit ticked 10, plus 20 when every habit is done that day. Undoing something takes its XP back. Days older than a week are frozen into your data so they keep counting after finished tasks leave the 30-day sync window. Change the daily goal in Progress, How XP works.
- **Add a paper**: paste a DOI, a doi.org link, an arXiv ID or an arXiv link. If the lookup services are unreachable, add it by hand.
- **Counters**: a paper counts the moment you mark it Read. Moving it back clears it from the counts.
- **BibTeX**: Papers, filter to what you need (status, tag, search), then BibTeX. Download a `.bib` file or copy it. Keys look like `Ishizaka2011Giant`.
- **Surf**: Settings, Surf spot. The default is Hendaye with the beach facing NNW (340°); wind counts as offshore when it blows from the opposite side. The quality bars are a rough guide.
- **Backups**: Settings, Your data, Export backup. One JSON file with everything; Import restores it into any account.

## Free quota

Firestore's free plan gives 50,000 reads and 20,000 writes per day and 1 GiB of storage. A dashboard like this one typically uses a few thousand reads a day, because only open tasks, the last 30 days of finished tasks and the last year of sport sessions are synced live; everything else stays stored and appears in exports.

## Updating the app

1. Edit the files and upload them to GitHub.
2. Change `VERSION` in `sw.js` and `APP_VERSION` in `js/version.js` to a new value, for example `2026.10.20`.
3. Installed apps show **A new version is ready** on their next launch; tap Reload.

If you add a new file, also add it to the list in `sw.js` so it works offline.

## Files

```
index.html            app shell
config.js             your Firebase keys and the app name
firestore.rules       database rules (paste into Firebase)
sw.js                 offline cache and updates
manifest.webmanifest  install settings and icons
css/app.css           all styles (colours and fonts at the top)
js/main.js            start-up, sign-in, navigation
js/store.js           app state and the default settings
js/backend-firebase.js  Firestore sync
js/backend-demo.js    demo mode, js/demo-data.js holds its sample content
js/lib/jarvis.js      Jarvis: the prompt, the dashboard summary, its tools, the conversation
js/lib/xp.js          the level system: XP rules, levels, frozen days
js/lib/               also dates, LaTeX and text, paper lookup and BibTeX, surf forecast
js/views/             one file per screen (jarvis.js and progress.js are the new ones)
vendor/               Preact, the Firebase SDK and the Anthropic SDK, bundled locally
fonts/                Manrope, Doto, DM Mono and STIX Two, with their licences
scripts/arxiv_watch.py  the daily arXiv check
.github/workflows/    the GitHub schedule for that check
```

## Services used

- Firebase Authentication and Cloud Firestore (Spark plan) for sign-in and sync.
- The Anthropic API (Claude Sonnet 5.5) for Jarvis, billed to your own API key. Only used once you add a key.
- Crossref, DataCite and the arXiv API for paper details. Nothing is sent except the identifier you paste.
- rss.arxiv.org for the daily listings.
- Open-Meteo for the marine and wind forecast (free for non-commercial use; data from Météo-France, DWD, ECMWF and NOAA models).
- Voice dictation uses your browser's built-in speech recognition (in Chrome it goes through Google's servers); reading aloud uses the voices installed on your device.
- Fonts: Manrope, Doto, DM Mono and STIX Two Text, all under the SIL Open Font License.
