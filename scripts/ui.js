// ui.js
// The only module that touches the DOM. It reads from state/search/validators,
// writes to the page, and wires every event. Keeping DOM here is what lets the
// other modules stay pure and testable.

import * as state from "./state.js";
import * as storage from "./storage.js";
import { validateField, validateRecord } from "./validators.js";
import { compileRegex, filterRecords, highlight } from "./search.js";

// Cache elements once.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let settings = storage.loadSettings();
let displayCurrency = settings.baseCurrency;
let sortKey = "date";
let sortDir = "desc";
let search = { regex: null, error: "" };
let caseInsensitive = true;
let pendingDeleteId = null;

// ---- Helpers -------------------------------------------------------------

function persist() {
  storage.saveData(state.getAll());
}

function money(amount, currency = displayCurrency) {
  const converted = state.convert(amount, settings.baseCurrency, currency, settings.rates);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(converted);
  } catch {
    return `${currency} ${converted.toFixed(2)}`;
  }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("toast--show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("toast--show"), 2600);
}

// ---- Navigation ----------------------------------------------------------

function showSection(id) {
  $$(".section").forEach((s) => {
    const active = s.id === id;
    s.hidden = !active;
  });
  $$(".nav__link").forEach((link) => {
    const active = link.dataset.target === id;
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  // Move focus to the section heading for screen-reader context.
  const heading = $(`#${id} h2`);
  if (heading) heading.focus();
}

// ---- Stats + cap + chart -------------------------------------------------

function renderStats() {
  const all = state.getAll();
  $("#stat-count").textContent = all.length;
  $("#stat-total").textContent = money(state.total());
  $("#stat-top").textContent = state.topCategory() || "—";

  renderCap();
  renderChart();
}

function renderCap() {
  const spent = state.total();
  const cap = Number(settings.cap) || 0;
  const fill = $("#cap-fill");
  const status = $("#cap-status");

  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  fill.style.width = `${pct}%`;
  fill.parentElement.setAttribute("aria-valuenow", Math.round(pct));

  // Colour band by proximity to the cap.
  fill.dataset.level = pct >= 100 ? "over" : pct >= 80 ? "near" : "under";

  if (cap <= 0) {
    status.setAttribute("aria-live", "polite");
    status.textContent = "No cap set. Add one in Settings to track your limit.";
    return;
  }
  if (spent > cap) {
    // Exceeded → assertive, it interrupts.
    status.setAttribute("aria-live", "assertive");
    status.textContent = `Over by ${money(spent - cap)} — you've passed your ${money(cap)} cap.`;
  } else {
    // Under → polite, it waits.
    status.setAttribute("aria-live", "polite");
    status.textContent = `${money(cap - spent)} left of your ${money(cap)} cap.`;
  }
}

function renderChart() {
  const days = state.lastSevenDays();
  const max = Math.max(1, ...days.map((d) => d.total));
  const chart = $("#chart");
  chart.innerHTML = "";
  const totalWeek = days.reduce((s, d) => s + d.total, 0);
  chart.setAttribute(
    "aria-label",
    `Spending over the last 7 days, totalling ${money(totalWeek)}.`
  );
  days.forEach((d) => {
    const bar = document.createElement("div");
    bar.className = "chart__bar";
    bar.style.height = `${(d.total / max) * 100}%`;
    const label = new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    });
    bar.title = `${label}: ${money(d.total)}`;
    const cap = document.createElement("span");
    cap.className = "chart__cap";
    cap.textContent = label[0];
    bar.appendChild(cap);
    chart.appendChild(bar);
  });
}

// ---- Records table -------------------------------------------------------

function visibleRecords() {
  const filtered = filterRecords(state.getAll(), search.regex);
  return state.sortRecords(filtered, sortKey, sortDir);
}

function renderRecords() {
  const rows = visibleRecords();
  const body = $("#records-body");
  const empty = $("#records-empty");
  const count = $("#result-count");

  body.innerHTML = "";

  count.textContent =
    rows.length === state.getAll().length
      ? `${rows.length} record${rows.length === 1 ? "" : "s"}`
      : `${rows.length} of ${state.getAll().length} records match`;

  if (!rows.length) {
    empty.hidden = false;
    $("#records-table").hidden = true;
    empty.textContent = state.getAll().length
      ? "No records match this search. Try a simpler pattern."
      : "No spending logged yet. Add your first entry to get started.";
    return;
  }
  empty.hidden = true;
  $("#records-table").hidden = false;

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Date"><span class="cell">${highlight(r.date, search.regex)}</span></td>
      <td data-label="Description"><span class="cell">${highlight(r.description, search.regex)}</span></td>
      <td data-label="Category"><span class="badge">${highlight(r.category, search.regex)}</span></td>
      <td data-label="Amount" class="num">${money(r.amount)}</td>
      <td data-label="Actions" class="row-actions">
        <button class="btn btn--ghost" data-edit="${r.id}" aria-label="Edit ${r.description}">Edit</button>
        <button class="btn btn--danger-ghost" data-delete="${r.id}" aria-label="Delete ${r.description}">Delete</button>
      </td>`;
    body.appendChild(tr);
  }

  // Reflect the current sort on the headers for assistive tech.
  $$("th[data-sort]").forEach((th) => {
    const key = th.dataset.sort;
    th.setAttribute("aria-sort", key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none");
  });
}

// ---- Form (add + edit) ---------------------------------------------------

function setFieldError(field, message) {
  const input = $(`#f-${field}`);
  const err = $(`#e-${field}`);
  err.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function openForm(record = null) {
  $("#entry-form").reset();
  ["description", "amount", "category", "date"].forEach((f) => setFieldError(f, ""));
  $("#w-description").textContent = "";

  if (record) {
    $("#form-title").textContent = "Edit entry";
    $("#f-id").value = record.id;
    $("#f-description").value = record.description;
    $("#f-amount").value = record.amount;
    $("#f-category").value = record.category;
    $("#f-date").value = record.date;
    $("#form-submit").textContent = "Save changes";
  } else {
    $("#form-title").textContent = "Add entry";
    $("#f-id").value = "";
    $("#f-date").value = new Date().toISOString().slice(0, 10);
    $("#form-submit").textContent = "Add entry";
  }
  showSection("form");
  $("#f-description").focus();
}

function liveValidate(field) {
  const msg = validateField(field, $(`#f-${field}`).value);
  setFieldError(field, msg);
  if (field === "description") {
    const { warnings } = validateRecord({ description: $("#f-description").value });
    $("#w-description").textContent = warnings.description || "";
  }
  return !msg;
}

function submitForm(e) {
  e.preventDefault();
  const candidate = {
    description: $("#f-description").value,
    amount: $("#f-amount").value,
    category: $("#f-category").value,
    date: $("#f-date").value,
  };
  const { errors } = validateRecord(candidate);
  ["description", "amount", "category", "date"].forEach((f) =>
    setFieldError(f, errors[f] || "")
  );

  if (Object.keys(errors).length) {
    // Send focus to the first invalid field.
    const firstBad = ["description", "amount", "category", "date"].find((f) => errors[f]);
    $(`#f-${firstBad}`).focus();
    $("#form-status").textContent = "Fix the highlighted fields and try again.";
    return;
  }

  const id = $("#f-id").value;
  if (id) {
    state.update(id, candidate);
    toast("Changes saved");
  } else {
    state.add(candidate);
    toast("Entry added");
  }
  persist();
  ensureCategory(candidate.category);
  $("#form-status").textContent = "";
  refreshAll();
  showSection("records");
}

// Quietly add a brand-new category to settings so it appears in the datalist.
function ensureCategory(category) {
  const clean = category.trim();
  if (clean && !settings.categories.includes(clean)) {
    settings.categories.push(clean);
    storage.saveSettings(settings);
    renderCategoryControls();
  }
}

// ---- Delete (confirm dialog) ---------------------------------------------

function askDelete(id) {
  const record = state.getById(id);
  if (!record) return;
  pendingDeleteId = id;
  $("#confirm-text").textContent = `Delete "${record.description}" (${money(record.amount)})? This can't be undone.`;
  $("#confirm-dialog").showModal();
}

function confirmDelete() {
  if (pendingDeleteId) {
    state.remove(pendingDeleteId);
    persist();
    toast("Entry deleted");
    refreshAll();
  }
  pendingDeleteId = null;
  $("#confirm-dialog").close();
}

// ---- Search + sort -------------------------------------------------------

function runSearch() {
  const result = compileRegex($("#search-input").value, { caseInsensitive });
  search = result;
  $("#search-error").textContent = result.error;
  $("#search-input").setAttribute("aria-invalid", result.error ? "true" : "false");
  renderRecords();
}

function setSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = key === "amount" || key === "date" ? "desc" : "asc";
  }
  renderRecords();
}

// ---- Settings ------------------------------------------------------------

function renderCategoryControls() {
  const list = $("#cat-list");
  list.innerHTML = "";
  settings.categories.forEach((cat) => {
    const li = document.createElement("li");
    li.className = "chip";
    li.innerHTML = `<span>${cat}</span>
      <button class="chip__x" data-remove-cat="${cat}" aria-label="Remove ${cat} category">×</button>`;
    list.appendChild(li);
  });
  // Refresh the datalist used by the form.
  const dl = $("#category-list");
  dl.innerHTML = settings.categories.map((c) => `<option value="${c}"></option>`).join("");
}

function renderRateControls() {
  const wrap = $("#rate-fields");
  wrap.innerHTML = "";
  Object.keys(settings.rates).forEach((code) => {
    const id = `rate-${code}`;
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <label for="${id}">1 ${settings.baseCurrency} = … ${code}</label>
      <input id="${id}" type="text" inputmode="decimal" value="${settings.rates[code]}"
             data-rate="${code}" ${code === settings.baseCurrency ? "disabled" : ""}>`;
    wrap.appendChild(field);
  });
}

function renderSettings() {
  renderCategoryControls();
  // currency selects
  const base = $("#base-currency");
  const disp = $("#display-currency");
  const options = Object.keys(settings.rates)
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
  base.innerHTML = options;
  base.value = settings.baseCurrency;
  disp.innerHTML = options;
  disp.value = displayCurrency;
  const dispRec = $("#display-currency-records");
  dispRec.innerHTML = options;
  dispRec.value = displayCurrency;
  renderRateControls();
  $("#settings-cap").value = settings.cap;
  $("#theme-toggle").setAttribute("aria-pressed", settings.theme === "dark");
  $("#theme-toggle").textContent = settings.theme === "dark" ? "Switch to light" : "Switch to dark";
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

// ---- Import / export -----------------------------------------------------

function exportData() {
  const blob = new Blob([storage.exportJSON(state.getAll())], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "finance-export.json";
  a.click();
  URL.revokeObjectURL(url);
  $("#settings-status").textContent = "Exported your records as finance-export.json.";
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const result = storage.importJSON(String(reader.result));
    if (!result.ok) {
      $("#settings-status").textContent = `Import failed — ${result.error}`;
      return;
    }
    state.init(result.data);
    persist();
    $("#settings-status").textContent = `Imported ${result.data.length} records.`;
    toast("Records imported");
    refreshAll();
  };
  reader.onerror = () => {
    $("#settings-status").textContent = "Couldn't read that file.";
  };
  reader.readAsText(file);
}

// ---- Orchestration -------------------------------------------------------

function refreshAll() {
  renderStats();
  renderRecords();
}

function bindEvents() {
  // nav
  $$(".nav__link").forEach((link) =>
    link.addEventListener("click", () => showSection(link.dataset.target))
  );
  $("#cta-add").addEventListener("click", () => openForm());

  // form
  $("#entry-form").addEventListener("submit", submitForm);
  $("#form-cancel").addEventListener("click", () => showSection("records"));
  ["description", "amount", "category", "date"].forEach((f) =>
    $(`#f-${f}`).addEventListener("blur", () => liveValidate(f))
  );
  $("#f-description").addEventListener("input", () => {
    const { warnings } = validateRecord({ description: $("#f-description").value });
    $("#w-description").textContent = warnings.description || "";
  });

  // records (event delegation for edit/delete)
  $("#records-body").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");
    if (edit) openForm(state.getById(edit.dataset.edit));
    if (del) askDelete(del.dataset.delete);
  });
  $$("th[data-sort]").forEach((th) =>
    th.addEventListener("click", () => setSort(th.dataset.sort))
  );

  // search
  $("#search-input").addEventListener("input", runSearch);
  $("#search-flag").addEventListener("change", (e) => {
    caseInsensitive = e.target.checked;
    runSearch();
  });
  $("#search-clear").addEventListener("click", () => {
    $("#search-input").value = "";
    runSearch();
    $("#search-input").focus();
  });
  $("#display-currency-records").addEventListener("change", (e) => {
    displayCurrency = e.target.value;
    refreshAll();
    renderSettings();
  });

  // delete dialog
  $("#confirm-yes").addEventListener("click", confirmDelete);
  $("#confirm-no").addEventListener("click", () => $("#confirm-dialog").close());

  // settings
  $("#cap-input").addEventListener("change", (e) => {
    settings.cap = Number(e.target.value) || 0;
    storage.saveSettings(settings);
    $("#settings-cap").value = settings.cap;
    renderCap();
  });
  $("#settings-cap").addEventListener("change", (e) => {
    settings.cap = Number(e.target.value) || 0;
    storage.saveSettings(settings);
    $("#cap-input").value = settings.cap;
    renderCap();
  });
  $("#cat-add").addEventListener("click", () => {
    const input = $("#cat-new");
    const msg = validateField("category", input.value);
    $("#cat-error").textContent = msg;
    if (msg) return;
    ensureCategory(input.value);
    input.value = "";
    $("#settings-status").textContent = "Category added.";
  });
  $("#cat-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-cat]");
    if (!btn) return;
    settings.categories = settings.categories.filter((c) => c !== btn.dataset.removeCat);
    storage.saveSettings(settings);
    renderCategoryControls();
    $("#settings-status").textContent = "Category removed.";
  });
  $("#base-currency").addEventListener("change", (e) => {
    settings.baseCurrency = e.target.value;
    storage.saveSettings(settings);
    renderRateControls();
    refreshAll();
  });
  $("#display-currency").addEventListener("change", (e) => {
    displayCurrency = e.target.value;
    $("#display-currency-records").value = displayCurrency;
    refreshAll();
  });
  $("#rate-fields").addEventListener("change", (e) => {
    const input = e.target.closest("[data-rate]");
    if (!input) return;
    const val = Number(input.value);
    if (Number.isFinite(val) && val > 0) {
      settings.rates[input.dataset.rate] = val;
      storage.saveSettings(settings);
      refreshAll();
      $("#settings-status").textContent = "Rate updated.";
    }
  });
  $("#theme-toggle").addEventListener("click", () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    storage.saveSettings(settings);
    applyTheme();
    renderSettings();
  });
  $("#export-btn").addEventListener("click", exportData);
  $("#import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });
  $("#clear-btn").addEventListener("click", () => {
    if (!state.getAll().length) {
      $("#settings-status").textContent = "Nothing to clear.";
      return;
    }
    state.init([]);
    persist();
    refreshAll();
    $("#settings-status").textContent = "All records cleared.";
    toast("Records cleared");
  });
}

export function start() {
  state.init(storage.loadData());
  applyTheme();
  $("#cap-input").value = settings.cap;
  bindEvents();
  renderSettings();
  refreshAll();
  showSection("dashboard");
}
