# Ledger — Student Finance Tracker

A simple expense tracker I built for my web dev assignment. You log what you spend, set a monthly cap, and search through your records. Everything stays in your browser — no backend, no account needed.

Live site: https://c-chol1.github.io/ledger/

---

## What it does

I built this around a problem I actually have: I lose track of small purchases (food, transport, random stuff) and then wonder where my money went at the end of the month. So the app lets you:

- Add spending records with a description, amount, category, and date
- Set a monthly cap and see how close you are via a progress bar
- Search records using regex (the assignment required it — turned out to be genuinely useful)
- Switch between USD, EUR, and GBP with manual exchange rates
- Export your data as JSON and import it back

---

## Running it locally

ES modules need to be served over HTTP — just opening `index.html` directly won't work.

```bash
# Python (easiest)
python3 -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080`.

---

## File layout

```
ledger/
├── index.html        # the whole app — all sections in one HTML file
├── tests.html        # test suite, open in browser to run
├── seed.json         # 12 sample records you can import to test things
├── styles/
│   └── styles.css
└── scripts/
    ├── main.js       # just boots the app
    ├── state.js      # records in memory — add, edit, delete, sort, stats
    ├── storage.js    # localStorage read/write, import/export, validation
    ├── validators.js # all the regex rules + field validation
    ├── search.js     # compiles user regex safely, filters and highlights
    └── ui.js         # everything DOM-related
```

---

## Data format

Each record looks like this:

```json
{
  "id": "txn_0001",
  "description": "Lunch at cafeteria",
  "amount": 8.50,
  "category": "Food",
  "date": "2026-06-05",
  "createdAt": "2026-06-05T11:32:00.000Z",
  "updatedAt": "2026-06-05T11:32:00.000Z"
}
```

IDs are auto-generated (`txn_0001`, `txn_0002`, ...) with a collision check. Records go to `localStorage` under `ledger_records`, settings under `ledger_settings`.

---

## Regex rules

The assignment asked for at least one regex per validated field. Here's what I used and why.

**Description** — rejects leading/trailing whitespace:
```
/^\S(?:.*\S)?$/
```
A single non-whitespace character at start and end covers single-character inputs too (`"X"` passes, `" X"` fails).

**Double space warning** — non-blocking, just warns:
```
/\s{2}/
```
Doesn't block submission, just flags it. Useful when you accidentally hit space twice.

**Amount** — no leading zeros, max 2 decimal places:
```
/^(0|[1-9]\d*)(\.\d{1,2})?$/
```
`0` is valid (free stuff happens). `01.5` and `12.999` are rejected.

**Date** — YYYY-MM-DD format + calendar check:
```
/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
```
The regex handles format and range, but `2025-02-30` would pass it — so I added a round-trip check with the Date object to catch those.

**Category** — letters, spaces, hyphens only:
```
/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/
```
Allows "Health-Care" but rejects "Food2" or "-Food".

**Duplicate word warning** — uses a back-reference:
```
/\b(\w+)\s+\1\b/i
```
This was the interesting one. `\1` refers back to whatever group 1 captured, so it catches "the the" or "buy buy" as repeated words. Non-blocking warning only.

**Search** — user types their own regex into the search box. I wrap the compile in try/catch so a broken pattern shows an error instead of crashing:
```js
export function compileRegex(pattern, { caseInsensitive = true } = {}) {
  const trimmed = pattern.trim();
  if (!trimmed) return { regex: null, error: "" };
  try {
    return { regex: new RegExp(trimmed, caseInsensitive ? "i" : ""), error: "" };
  } catch (e) {
    return { regex: null, error: `Invalid pattern — ${e.message}` };
  }
}
```

---

## Running the tests

Open `http://localhost:8080/tests.html` in the browser. Each test shows PASS or FAIL inline. No test runner needed.

What's covered:
- all 6 regex rules including edge cases (Feb 30, leading zero, single character)
- `validateField` and `getWarnings`
- `compileRegex` with valid/invalid/empty input
- `highlight` — checks HTML escaping of `<` and `&`
- `filterRecords` — match, no match, null regex
- `importJSON` — valid data, bad JSON, missing fields, duplicate IDs
- `state` — add/update/remove records, total, topCategory, sort asc/desc

---

## Keyboard navigation

Everything works without a mouse. Tab moves forward, Shift+Tab moves back.

- On the nav bar, press Enter or Space to switch sections
- In the records table, Tab into any sort header and press Enter to toggle sort direction
- Press Enter on Edit to open the form pre-filled, Enter on Delete to open the confirm dialog
- Inside the delete dialog, Enter confirms or cancels — Escape also closes it without deleting
- On the form, Enter submits; if there's an error focus jumps to the first broken field
- The skip link at the very top (first Tab from anywhere) jumps straight to the main content

---

## Accessibility

I tried to make this genuinely usable without a mouse:

- Every section has a heading that gets focus when you navigate to it
- Form errors use `role="alert"` so screen readers announce them immediately
- The cap meter is a proper `role="progressbar"` with min/max/now attributes
- The delete dialog uses native `<dialog>` + `showModal()` which handles focus trapping for free
- Skip-to-content link at the top (visible on Tab)
- `prefers-reduced-motion` turns off all animations
- When spending exceeds the cap the status switches to `aria-live="assertive"` so it interrupts the screen reader instead of waiting
- Sort state is tracked with `aria-sort="ascending | descending | none"` on each column header

---

## Importing the sample data

Go to Settings → Your data → Import JSON and pick `seed.json`. It has 12 records across different categories so you can see the dashboard and chart working straight away.

---

## Author

Chol — [c.chol1@alustudent.com](mailto:c.chol1@alustudent.com) · [github.com/c-chol1](https://github.com/c-chol1)
