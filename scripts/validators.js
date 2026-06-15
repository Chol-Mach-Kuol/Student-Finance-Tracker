// validators.js
// Pure validation logic. No DOM access here — that lives in ui.js.
// Every rule is a named regex so it can be documented in the README catalog
// and asserted against in tests.html.

export const RULES = {
  // 1. Description: no leading/trailing whitespace. \S anchors both ends.
  description: /^\S(?:.*\S)?$/,

  // Helper for the "collapse doubles" requirement — fires if two+ spaces appear.
  doubleSpace: /\s{2}/,

  // 2. Amount: non-negative, no leading zeros, at most 2 decimal places.
  amount: /^(0|[1-9]\d*)(\.\d{1,2})?$/,

  // 3. Date: YYYY-MM-DD with valid month/day ranges (calendar-checked below too).
  date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,

  // 4. Category: letters, with single spaces or hyphens between words.
  category: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,

  // 5. ADVANCED (back-reference): a word immediately repeated, e.g. "the the".
  //    \1 refers back to whatever group 1 captured.
  duplicateWord: /\b(\w+)\s+\1\b/i,
};

// Human-readable messages, written in the interface's voice (active, specific).
const MESSAGES = {
  description: "Enter a description with no leading or trailing spaces.",
  doubleSpace: "Remove the extra spaces between words.",
  amount: "Enter an amount like 12.50 — digits only, up to two decimals.",
  date: "Use the date picker or type a real date as YYYY-MM-DD.",
  category: "Use letters only, with single spaces or hyphens between words.",
};

// A YYYY-MM-DD that passes the regex can still be impossible (e.g. 2025-02-30).
// This confirms the parsed date round-trips to the same string.
function isRealCalendarDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

// Validate a single field. Returns an error string, or "" when valid.
export function validateField(field, raw) {
  const value = raw == null ? "" : String(raw);

  switch (field) {
    case "description": {
      if (!RULES.description.test(value)) return MESSAGES.description;
      if (RULES.doubleSpace.test(value)) return MESSAGES.doubleSpace;
      if (value.length > 80) return "Keep the description under 80 characters.";
      return "";
    }
    case "amount": {
      if (!RULES.amount.test(value)) return MESSAGES.amount;
      return "";
    }
    case "date": {
      if (!RULES.date.test(value)) return MESSAGES.date;
      if (!isRealCalendarDate(value)) return "That date doesn't exist on the calendar.";
      return "";
    }
    case "category": {
      if (!RULES.category.test(value)) return MESSAGES.category;
      return "";
    }
    default:
      return "";
  }
}

// Non-blocking warnings — surfaced but don't stop submission.
export function getWarnings(record) {
  const warnings = {};
  if (record.description && RULES.duplicateWord.test(record.description)) {
    const match = record.description.match(RULES.duplicateWord);
    warnings.description = `Looks like "${match[1]}" is repeated — was that intended?`;
  }
  return warnings;
}

// Validate a whole record. Returns { errors, warnings }.
// errors is empty when the record is safe to save.
export function validateRecord(record) {
  const errors = {};
  for (const field of ["description", "amount", "category", "date"]) {
    const msg = validateField(field, record[field]);
    if (msg) errors[field] = msg;
  }
  return { errors, warnings: getWarnings(record) };
}
