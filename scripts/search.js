// search.js
// Safe regex compilation and the two operations that depend on it: filtering
// records and highlighting matched text for display in HTML.

// Compile a user-supplied pattern. Returns { regex, error }.
// regex is null when the pattern is blank or invalid.
export function compileRegex(pattern, { caseInsensitive = true } = {}) {
  const trimmed = pattern.trim();
  if (!trimmed) return { regex: null, error: "" };
  try {
    return { regex: new RegExp(trimmed, caseInsensitive ? "i" : ""), error: "" };
  } catch (e) {
    return { regex: null, error: `Invalid pattern — ${e.message}` };
  }
}

// Return records where at least one searchable field matches regex.
export function filterRecords(records, regex) {
  if (!regex) return records;
  return records.filter(
    (r) =>
      regex.test(r.description) ||
      regex.test(r.category) ||
      regex.test(r.date) ||
      regex.test(String(r.amount))
  );
}

// Wrap each match in <mark>…</mark>. Text is HTML-escaped before matching
// so raw record values can be passed in safely.
export function highlight(text, regex) {
  const safe = escapeHTML(String(text));
  if (!regex) return safe;
  return safe.replace(regex, (m) => `<mark>${m}</mark>`);
}

function escapeHTML(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
