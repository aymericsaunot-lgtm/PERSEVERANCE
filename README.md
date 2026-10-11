# Perceverance

A personal app that runs on your phone and your computer and stays in sync:

- **Today**: an almanac front page. The date, sunrise and sunset, the next tide and the swell, a one-line summary of the day, today's tasks, habits, the next eight weeks on one line (beamtimes, deadlines, thesis), reading, surf.
- **Progress**: a level system fed by what you already log, with a daily XP goal on a dial and four attributes: Work, Mind, Body and Discipline.
- **Tasks**: quick capture, areas, due dates, stars. Type `#PhD` in a title to set the area, end with `!` to star it.
- **Papers**: paste a DOI or arXiv ID and the details fill in; To read, Reading, Read; weekly, monthly and yearly counts; tags with real subscripts (MnBi₂Te₄); BibTeX export for the thesis.
- **arXiv watch**: every weekday morning, new cond-mat papers that match your keywords, one tap to add them to your reading list.
- **PhD**: beamtime countdowns, proposal and other deadlines, thesis chapters with progress.
- **Life**: surf forecast (swell, wind, tide, water temperature), sport log, habits.

It is a plain web app (no build step) that you install like a normal app. Data lives in your own free Firebase project, and nothing opens without your password. It works offline and syncs when the connection comes back. It can send notifications to your phone (step 9), and you pick its icon in Settings.

The look is a printed almanac: paper and ink with one orange, Instrument Serif for headlines and numbers, STIX Two for paper titles. Settings, Appearance switches to the Night edition or follows your system.

### Two spaces: Research and Studio

The app has two spaces, and each account shows its own:

- **Research** (yours): everything above.
- **Studio**, for a freelance designer: Today, Projects (lead, brief, design, feedback, delivered, with tasks, hours, revision rounds and the real hourly rate), Clients, Money (quotes and invoices, paid, waiting and overdue, income per month), an overnight fasting timer (12 hours after dinner), Life (habits and sport, boxing by default) and the level system. Bold pastel look: Schibsted Grotesk and DM Mono, colour blocks for projects.

Each account only ever sees its own data; the Firestore rules enforce it. Your account is recorded as Research automatically the first time the new version opens, because it already holds your data. A brand-new account is asked once, on first sign-in, which space it is. Either can switch later in Settings, Space.

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

### 8. Add a second account (Studio)

Do this after the new version is on GitHub.

**a. Create her account.** Firebase console, your project, **Authentication**, tab **Users**, **Add user**. Type her email and a temporary password (6 characters or more), then **Add user**. Her line appears in the table; in the **User UID** column, hover her UID and click the copy icon. Paste it somewhere for a minute. Copy yours the same way from your own line.

**b. Let both accounts into the database.** Firebase console, **Firestore Database**, tab **Rules**. The editor shows the rules you published during setup; your UID is already in them. Select everything in the editor, delete it, and paste this, with the two UIDs in place of the capitals:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == uid
                         && uid in ["YOUR_UID", "HER_UID"];
    }
  }
}
```

Keep the quotes and the comma: `["aB3x9...", "Qp7Lm..."]`. Click **Publish**. If the editor underlines something in red, a quote or the comma is missing. The change applies within a minute.

To check it before anyone signs in, open **Rules Playground** on the left of the editor: simulation type **get**, location `users/HER_UID/meta/settings` (her real UID), turn **Authenticated** on and put her UID as Firebase UID, then **Run**: it should say the read is allowed. Put your UID instead and run again: it should be denied. That is the privacy working: neither of you can read the other's data.

**c. Open the app yourself.** On your computer, open the app's address. If a bar says "A new version is ready", click **Reload**. Your Today page should look as usual. In **Settings**, the **Space** switch shows **Research**: your account is now recorded as yours.

**d. Send her the address and her password.** It is the same address as yours, `https://YOUR-GITHUB-NAME.github.io/dashboard/`. She signs in with her email and the temporary password, sees **Which space is yours?** once, and taps **Studio**. To choose her own password: on the sign-in screen she types her email and taps **Forgot your password?**; the email comes from `noreply@` your Firebase project and sometimes lands in spam. On her phone she can install it like you did (Share, Add to Home Screen on iPhone; Install app in Chrome on Android).

**If something does not work**

| What you see | Why | Fix |
| --- | --- | --- |
| You get "The database refused access" and nothing loads | `YOUR_UID` was not replaced, or one character is wrong | Put your exact UID in the rules, Publish, reload the app |
| She gets "The database refused access", or the logo spins forever | Her UID is wrong, or she signed in before the rules were published | Check her UID in Authentication, Publish, then she closes the app completely and opens it again |
| "Wrong email or password" | Typo, or the account was not created | Check the email in Authentication, Users; set a new password there if needed |
| No Space switch in Settings, no Studio | The phone or browser still runs the previous version | Reload when the banner appears, or close every tab of the app and reopen; on GitHub, check that `js/views/studio/` and `css/studio.css` were uploaded |
| She sees the Research look | Her account ended up as Research | Settings, Space, Studio |

The arXiv watch keeps running for your account only.

### 9. Turn on phone notifications

The app can notify your phone even when it is closed. GitHub sends the notifications: `scripts/notify.py` runs every 10 minutes, which is free in a public repository. Each account gets its own:

- **Research**: a morning brief (today's tasks, the next deadline or beamtime, the surf), deadlines a week and a day before, beamtimes three days before, new arXiv matches, the surf the evening before a good day, habits left in the evening.
- **Studio**: a morning brief (tasks, what is due, money to chase), a project due tomorrow or today, an invoice that turns overdue, a quote waiting a week, the end of the fast, habits left in the evening.

1. **Give GitHub the sending key.** In your Documents folder, next to the project folder, open `perceverance-notifications-key.txt`. In the GitHub repository, go to **Settings, Secrets and variables, Actions, New repository secret**. Name it `VAPID_PRIVATE_KEY` and paste the 43-character line from the file, nothing else. Then delete the file: anyone with this key can send to your phones. The public half is already in `config.js`. The `FIREBASE_SERVICE_ACCOUNT` secret from step 7 is reused. If you skipped step 7, add that secret now (step 7, points 1 and 2).
2. **Run it once.** In the **Actions** tab, choose **Notifications**, then **Run workflow**. After about a minute the run turns green. If there is no **Notifications** workflow, the hidden `.github` folder was not uploaded. Choose **Add file, Create new file**, name it `.github/workflows/notify.yml` and paste that file's content.
3. **Turn them on, on each phone.**
   - **iPhone** (iOS 16.4 or later): notifications only work in the app on the Home Screen. In Safari, open the app's address, then **Share, Add to Home Screen**. Open the app from the Home Screen and go to **Settings, Notifications**. Tap **Turn on**, then **Allow**.
   - **Android**: in Chrome, open the app and go to **Settings, Notifications**. Tap **Turn on**, then **Allow**.
   - **Computer**: the same, in Chrome or Edge.
4. **Send a test.** Tap **Send a test**. One notification appears at once from the phone itself. A second one comes from GitHub within about 10 minutes, and when it arrives everything works.

In **Settings, Notifications**, each kind has its own switch, and you can set the time of the morning brief and the evening one. Times follow the time zone of the phone where you turned notifications on. She does step 3 on her phone, and her notifications only ever come from her own Studio data.

Good to know:

- GitHub can start a scheduled run late when it is busy. A notification can come 5 to 20 minutes after its time, and the end of a fast within about 10 minutes.
- Scheduled workflows pause after 60 days without a commit to the repository, both this one and the arXiv watch. GitHub emails you, and **Enable workflow** in the Actions tab restarts them. Uploading any change also resets the 60 days.
- Signing out turns notifications off on that device. Sign in and tap **Turn on** to get them again.
- The Actions logs are public, like the repository, so the script prints only how many notifications of each kind went out, never their text.
- If a phone stops receiving them, open **Settings, Notifications** on that phone. If it says they are off, tap **Turn on** again. Removing the app from the Home Screen also removes its notifications.
- If the private key is lost or leaked, make a new pair, for example with `npx web-push generate-vapid-keys`. Put the public key in `config.js` (`push.publicKey`) and the private key in the `VAPID_PRIVATE_KEY` secret, then upload. On each phone, turn notifications off and on again.

Check the rules on your computer, without Firebase:

```sh
pip install tzdata
python3 scripts/notify.py --self-test
```

---

## Everyday use

- **XP**: task done 10 (starred 20), deadline submitted 40, beamtime completed 100, thesis progress 6 per chapter point, paper read 30, sport 1 per 2 minutes (up to 60 a session), habit ticked 10, plus 20 when every habit is done that day. Undoing something takes its XP back. Days older than a week are frozen into your data so they keep counting after finished tasks leave the 30-day sync window. Change the daily goal in Progress, How XP works.
- **Add a paper**: paste a DOI, a doi.org link, an arXiv ID or an arXiv link. If the lookup services are unreachable, add it by hand.
- **Counters**: a paper counts the moment you mark it Read. Moving it back clears it from the counts.
- **BibTeX**: Papers, filter to what you need (status, tag, search), then BibTeX. Download a `.bib` file or copy it. Keys look like `Ishizaka2011Giant`.
- **Surf**: Settings, Surf spot. The default is Hendaye with the beach facing NNW (340°); wind counts as offshore when it blows from the opposite side. The quality bars are a rough guide.
- **Backups**: Settings, Your data, Export backup. One JSON file with everything; Import restores it into any account.
- **App icon**: Settings, App icon. There are four designs: Sunset, Tide, P. and Blocks. The app and the browser tab change at once. A phone keeps the icon the app had when it was added, so remove the app from the Home Screen, open the link in the browser, sign in, and add it again; your data stays. Signing in first matters: before sign-in the page shows the default icon. To change a design, edit its SVG in `js/icons.js` (64 by 64) and replace its three PNGs in `icons/` (`<name>-180.png` for iPhone, `-192` and `-512` for Android). To add one, add an entry there and its three PNGs.
- **Fasting** (Studio): after dinner, tap **Dinner done, start 12 h** on Today. The card counts down and shows when she can eat. If she forgot, she types the time dinner ended. In the morning she taps **I ate**. A fast of 12 hours or more earns 15 XP and adds to the streak. The length is in Settings, Fasting.

## Free quota

Firestore's free plan gives 50,000 reads and 20,000 writes per day and 1 GiB of storage. An app like this one typically uses a few thousand reads a day, because only open tasks, the last 30 days of finished tasks and the last year of sport sessions are synced live; everything else stays stored and appears in exports. The notification check adds about 1,000 to 2,000 reads a day for two accounts.

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
icons/                the app icons: three PNG sizes per design, and the browser tab icon
css/app.css           all styles (colours and fonts at the top)
js/main.js            start-up, sign-in, navigation
js/icons.js           the app icon designs, and switching between them
js/push.js            turning notifications on and off on a device
js/store.js           app state and the default settings
js/backend-firebase.js  Firestore sync
js/lib/xp.js          the level system: XP rules, levels, frozen days
js/lib/               also dates, LaTeX and text, paper lookup and BibTeX, surf forecast
js/views/             one file per screen (progress.js is the level system)
js/views/studio/      the Studio space: today, projects, clients, money, fasting, the sheets, the frame
css/studio.css        the Studio look, applied only to Studio accounts
vendor/               Preact and the Firebase SDK, bundled locally
fonts/                Instrument Serif, Instrument Sans, STIX Two, Schibsted Grotesk and DM Mono, with their licences
scripts/arxiv_watch.py  the daily arXiv check
scripts/notify.py     the notifications: what is due, sent with Web Push
.github/workflows/    the GitHub schedules for those two scripts
```

## Services used

- Firebase Authentication and Cloud Firestore (Spark plan) for sign-in and sync.
- Crossref, DataCite and the arXiv API for paper details. Nothing is sent except the identifier you paste.
- rss.arxiv.org for the daily listings.
- Open-Meteo for the marine and wind forecast (free for non-commercial use; data from Météo-France, DWD, ECMWF and NOAA models).
- The push service of each phone's maker (Apple, Google, Mozilla or Microsoft) delivers the notifications. The content is encrypted for your device, so the service cannot read it.
- Fonts: Instrument Serif, Instrument Sans, STIX Two Text, Schibsted Grotesk and DM Mono, all under the SIL Open Font License.
