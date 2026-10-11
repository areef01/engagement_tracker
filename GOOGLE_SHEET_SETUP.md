# Connect the checklist to Google Sheets

Once connected, every change on the website (tick, harga, depo, tarikh, new item, new category, bajet) is saved
to a Google Sheet within a second or two, and anyone opening the website sees the same data. You can also edit
the Sheet directly; the website picks it up when you refresh or come back to the tab. Need Excel? In the Sheet:
**File → Download → Microsoft Excel (.xlsx)**.

Takes about 5 minutes, once.

## 1. Create the Sheet

1. Go to [sheets.new](https://sheets.new) and name it e.g. **Majlis Tunang Areef & Amyra**.
2. Leave it empty. The tabs **Kategori**, **Items** and **Settings** are created automatically.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete everything in `Code.gs`, then paste in the whole of [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
3. Click 💾 **Save**.

## 3. Set your passcode

The passcode is what lets someone **save** from the website. Without it, people can only look.

1. In Apps Script, click ⚙️ **Project Settings** (left sidebar).
2. Scroll to **Script Properties → Add script property**.
3. Property: `PASSCODE`, Value: a passcode only you and Amyra know. **Save script properties**.

> Don't write the passcode in `Code.gs` or anywhere in this repo. The repo is public.

## 4. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. ⚙️ next to "Select type" → **Web app**.
3. Description: `checklist`. **Execute as: Me**. **Who has access: Anyone**.
4. Click **Deploy**, then **Authorize access** and pick your Google account.
   Google will warn "Google hasn't verified this app": click **Advanced → Go to (project name) (unsafe)** → **Allow**.
   (It's your own script, so this is expected.)
5. Copy the **Web app URL** (ends in `/exec`).

## 5. Put the URL in the website

In `data/tunang.js`:

```js
sheetUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec',
```

Commit & push.

## 6. First unlock fills the Sheet

1. Open the website. The bottom of the sidebar shows **👀 Mode lihat** and a passcode box.
2. Type the passcode → **Unlock**.
3. The Sheet is empty, so the website fills it with everything you have in this browser.
   Check the Sheet: you'll see the **Kategori** and **Items** tabs.

From now on the sidebar shows **☁️ Saved ke Google Sheet · 3:41 pm** after each change.
Each device needs to unlock once (the passcode is remembered in that browser). **Lock** forgets it.

## Editing the Sheet directly

* **Items** tab: one row per item.
  * **Jenis**: `Biasa` (fixed price in *Harga*), `Makanan` (*Pax* × *RM / pax*), or `Task` (no cost).
  * **Jumlah** is a formula. Don't type in it.
  * **Done** is a checkbox. Dates can be typed as `3/4/2027` (day/month/year).
  * New row: fill **Kategori** (name), **Item**, **Jenis** and the price. Leave **ID** blank; it's filled in for you.
* **Kategori** tab: one row per category (Emoji, Kategori, Tip). Leave **ID** blank for new ones.
* **Settings** tab: **Bajet (RM)**.

Tip: edit either the website or the Sheet at one time, not both at the same moment. The last save wins.

## If you change `Code.gs` later

**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** The URL stays the same.

## Troubleshooting

| Website says | Fix |
|---|---|
| ⚠️ Tak dapat sambung ke Google Sheet | Check `sheetUrl` ends in `/exec` and the deployment's access is **Anyone**. |
| Passcode salah | Check the `PASSCODE` script property (step 3). |
| PASSCODE belum diset | Step 3 wasn't saved. |
| Changes in the Sheet don't show | Refresh the website (it also re-checks every minute and when you return to the tab). |

Preview locally with VS Code **Live Server** or straight from GitHub Pages. Both work, because the Sheet is reached over the internet.
