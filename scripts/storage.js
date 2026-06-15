// storage.js
// All interactions with localStorage and the JSON import/export API.
// Nothing here touches the DOM — calling code reads results and reacts.

const DATA_KEY = "ledger_records";
const SETTINGS_KEY = "ledger_settings";

const DEFAULT_SETTINGS = {
  baseCurrency: "USD",
  rates: { USD: 1, EUR: 0.92, GBP: 0.79 },
  categories: ["Food", "Transport", "Health", "Education", "Entertainment", "Other"],
  cap: 0,
  theme: "light",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      rates: { ...DEFAULT_SETTINGS.rates, ...(parsed.rates || {}) },
      categories: Array.isArray(parsed.categories) ? parsed.categories : [...DEFAULT_SETTINGS.categories],
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveData(records) {
  localStorage.setItem(DATA_KEY, JSON.stringify(records));
}

// ---- Import / export -------------------------------------------------------

export function exportJSON(records) {
  return JSON.stringify(records, null, 2);
}

const REQUIRED_FIELDS = ["id", "description", "amount", "category", "date"];

function isValidRecord(r) {
  if (typeof r !== "object" || r === null || Array.isArray(r)) return false;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in r)) return false;
  }
  if (typeof r.amount !== "number" || !Number.isFinite(r.amount)) return false;
  if (typeof r.description !== "string" || typeof r.category !== "string") return false;
  if (typeof r.id !== "string") return false;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return false;
  return true;
}

// Returns { ok: true, data } or { ok: false, error }.
// A malformed file is always rejected whole — never partially loaded.
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON — ${err.message}` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON array of records." };
  }

  for (let i = 0; i < parsed.length; i++) {
    if (!isValidRecord(parsed[i])) {
      return {
        ok: false,
        error: `Record ${i + 1} is missing required fields or has wrong types.`,
      };
    }
  }

  const ids = parsed.map((r) => r.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "File contains duplicate record IDs." };
  }

  return { ok: true, data: parsed };
}
