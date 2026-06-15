// state.js
// The single source of truth for records while the app is running. CRUD methods
// keep timestamps and ids correct; derived helpers compute stats. Pure data —
// no DOM, no localStorage (storage.js owns that).

let records = [];

export function init(initial = []) {
  records = Array.isArray(initial) ? initial.slice() : [];
  return records;
}

export function getAll() {
  return records.slice();
}

export function getById(id) {
  return records.find((r) => r.id === id) || null;
}

// Sequential, collision-checked id: txn_0001, txn_0002, ...
function nextId() {
  let max = 0;
  for (const r of records) {
    const m = /^txn_(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `txn_${String(max + 1).padStart(4, "0")}`;
}

export function add({ description, amount, category, date }) {
  const now = new Date().toISOString();
  const record = {
    id: nextId(),
    description: description.trim(),
    amount: Number(amount),
    category: category.trim(),
    date,
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  return record;
}

export function update(id, patch) {
  const record = getById(id);
  if (!record) return null;
  if (patch.description != null) record.description = patch.description.trim();
  if (patch.amount != null) record.amount = Number(patch.amount);
  if (patch.category != null) record.category = patch.category.trim();
  if (patch.date != null) record.date = patch.date;
  record.updatedAt = new Date().toISOString();
  return record;
}

export function remove(id) {
  const before = records.length;
  records = records.filter((r) => r.id !== id);
  return records.length < before;
}

// ---- Derived data --------------------------------------------------------

export function total() {
  return records.reduce((sum, r) => sum + r.amount, 0);
}

export function topCategory() {
  if (!records.length) return null;
  const totals = {};
  for (const r of records) totals[r.category] = (totals[r.category] || 0) + r.amount;
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
}

// Spend per day for the last 7 calendar days, oldest first. Used by the chart.
export function lastSevenDays(refDate = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const sum = records
      .filter((r) => r.date === key)
      .reduce((s, r) => s + r.amount, 0);
    days.push({ date: key, total: sum });
  }
  return days;
}

export function sortRecords(list, key, dir = "asc") {
  const sorted = list.slice().sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === "amount") {
      av = Number(av);
      bv = Number(bv);
    } else {
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
    }
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

// ---- Currency ------------------------------------------------------------

// Convert an amount stored in the base currency into a target currency using
// manual rates (rates are expressed as "1 base = N target").
export function convert(amount, baseCurrency, targetCurrency, rates) {
  if (baseCurrency === targetCurrency) return amount;
  const baseRate = rates[baseCurrency] || 1;
  const targetRate = rates[targetCurrency] || 1;
  // amount(base) -> USD-neutral -> target
  return (amount / baseRate) * targetRate;
}
