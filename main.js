const keys = { transactions: "studentFinanceTracker.transactions", settings: "studentFinanceTracker.settings", editing: "studentFinanceTracker.editingTransactionId" };
const defaults = { currency: "RWF", usdRate: "", eurRate: "", spendingCap: 0 };
const sampleRows = [
  ["Lunch", 3500, "food", "2026-06-19"],
  ["book", 45000, "fees", "2026-06-18"],
];
const get = (id) => document.getElementById(id);

function readData(key, backup) {
  try {
    let saved = localStorage.getItem(key);
    return saved === null ? backup : JSON.parse(saved);
  } catch (error) {
    console.error("Could not read saved data:", error);
    return backup;
  }
}
function validTransaction(item) {
  if (!item || typeof item !== "object" || typeof item.date !== "string") return false;
  let date = new Date(item.date + "T00:00:00Z");
  return typeof item.id === "string" && typeof item.description === "string" &&
    Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 &&
    typeof item.category === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === item.date;
}
let stored = readData(keys.transactions, []);
let transactions = Array.isArray(stored) && stored.every(validTransaction) ? stored : [];
let settings = readData(keys.settings, { ...defaults });
if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = { ...defaults };
function saveData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) {
    console.error("Could not save data:", error);
    showStatus("Unable to save. Check your browser storage and try again.", true);
    return false;
  }
}
function showStatus(message, isError = false) {
  let box = get("settings-status") || get("form-status") || get("search-status");
  if (box) { box.textContent = message; box.classList.toggle("error", isError); }
}
function getRate(currency) {
  if (currency === "USD") return Number(settings.usdRate);
  if (currency === "EUR") return Number(settings.eurRate);
  return 1;
}
function formatMoney(amount) {
  let currency = settings.currency || "RWF", rate = getRate(currency);
  if (currency !== "RWF" && rate > 0) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount) / rate);
  }
  return new Intl.NumberFormat().format(Number(amount)) + " RWF";
}
function updateDashboard() {
  let total = transactions.reduce((sum, item) => sum + Number(item.amount), 0);
  if (get("stat-total")) get("stat-total").textContent = formatMoney(total);
  if (get("stat-count")) get("stat-count").textContent = transactions.length;
  let categoryTotals = {};
  transactions.forEach((item) => {
    categoryTotals[item.category] = (categoryTotals[item.category] || 0) + Number(item.amount);
  });
  let categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
  if (get("stat-top-category")) get("stat-top-category").textContent = categories[0] || "None";

  let cap = Number(settings.spendingCap) || 0;
  if (get("budget-status")) get("budget-status").textContent =
    cap ? `${formatMoney(total)} spent of ${formatMoney(cap)}` : "No budget set";
  if (get("budget-progress")) get("budget-progress").style.width =
    cap ? `${Math.min(total / cap * 100, 100)}%` : "0%";

  let chart = get("chart-bars");
  if (!chart) return;
  chart.replaceChildren();
  let days = [];
  for (let i = 6; i >= 0; i--) {
    let date = new Date();
    date.setDate(date.getDate() - i);
    days.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  }
  let amounts = days.map((day) => transactions
    .filter((item) => item.date === day)
    .reduce((sum, item) => sum + Number(item.amount), 0));
  let biggestDay = Math.max(...amounts, 1);
  amounts.forEach((amount, i) => {
    let bar = document.createElement("div");
    bar.className = "chart-bar"; bar.style.height = `${Math.max(amount / biggestDay * 100, 4)}%`;
    bar.title = `${days[i]}: ${formatMoney(amount)}`;
    bar.setAttribute("aria-label", bar.title); chart.append(bar);
  });
  if (settings.currency !== "RWF" && getRate(settings.currency) <= 0) {
    showStatus(`Add a valid ${settings.currency} exchange rate in Settings.`, true);
  }
}
function editTransaction(id) {
  try { sessionStorage.setItem(keys.editing, id); location.href = "add-expense.html"; }
  catch (error) { console.error("Could not start editing:", error); showStatus("Unable to start editing.", true); }
}
function deleteTransaction(id) {
  let item = transactions.find((transaction) => transaction.id === id);
  if (!item || !confirm(`Delete "${item.description}"?`)) return;
  let next = transactions.filter((transaction) => transaction.id !== id);
  if (saveData(keys.transactions, next)) { transactions = next; updatePage(); }
}
function updateRecords() {
  let body = get("records-tbody");
  if (!body) return;
  let search = get("search-input"), sort = get("sort-select");
  let searchText = search ? search.value.trim().toLowerCase() : "";
  let sortBy = sort ? sort.value : "date-asc";
  let rows = transactions.filter((item) =>
    `${item.description} ${item.category} ${item.date}`.toLowerCase().includes(searchText));
  rows.sort((a, b) => sortBy === "description-asc" ? a.description.localeCompare(b.description)
    : sortBy === "amount-asc" ? Number(a.amount) - Number(b.amount) : a.date.localeCompare(b.date));
  body.replaceChildren();
  if (!rows.length) {
    let cell = body.insertRow().insertCell();
    cell.colSpan = 5; cell.className = "empty-state";
    cell.textContent = searchText ? "No matching transactions." : "No transactions yet. Add one to get started!";
    return;
  }
  rows.forEach((item) => {
    let row = body.insertRow();
    [item.description, formatMoney(item.amount), item.category, item.date]
      .forEach((value) => row.insertCell().textContent = value);
    let actions = row.insertCell();
    [["Edit", () => editTransaction(item.id)], ["Delete", () => deleteTransaction(item.id)]].forEach(([name, action]) => {
      let button = document.createElement("button");
      button.type = "button"; button.className = "secondary"; button.textContent = name;
      button.addEventListener("click", action); actions.append(button, document.createTextNode(" "));
    });
  });
}
function updateCategories() {
  let list = get("cats");
  if (!list) return;
  let categories = [...new Set(transactions.map((item) => item.category))].sort();
  list.replaceChildren();
  categories.forEach((category) => {
    let option = document.createElement("option"); option.value = category; list.append(option);
  });
}
function updatePage() { updateDashboard(); updateRecords(); updateCategories(); }
function checkForm(form) {
  let values = {
    description: form.elements.description.value.trim(), amount: form.elements.amount.value.trim(),
    category: form.elements.category.value.trim(), date: form.elements.date.value
  };
  let rules = {
    description: [values.description !== "" && /^[A-Za-z0-9\s.,!?'"-]+$/.test(values.description), "Enter a valid description."],
    amount: [/^\d+(\.\d{1,2})?$/.test(values.amount) && Number(values.amount) > 0, "Enter an amount above zero (up to 2 decimals)."],
    category: [/^[A-Za-z\s]+$/.test(values.category), "Use letters and spaces for the category."],
    date: [validTransaction({ ...values, id: "check" }), "Choose a valid date."]
  };
  let isValid = true;
  Object.keys(rules).forEach((field) => {
    let errorBox = get(field + "-error");
    if (errorBox) errorBox.textContent = rules[field][0] ? "" : rules[field][1];
    if (!rules[field][0]) isValid = false;
  });
  if (!isValid) return null;
  values.amount = Number(values.amount);
  return values;
}
function setupExpenseForm() {
  let form = get("tx-form");
  if (!form) return;
  let idInput = get("transaction-id"), editingId = sessionStorage.getItem(keys.editing);
  let existing = transactions.find((item) => item.id === editingId);
  if (existing) {
    ["description", "amount", "category", "date"].forEach((field) => { form.elements[field].value = existing[field]; });
    idInput.value = existing.id; get("form-h").textContent = "Edit Transaction";
  } else if (editingId) sessionStorage.removeItem(keys.editing);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    let values = checkForm(form);
    if (!values) return;
    let old = transactions.find((item) => item.id === idInput.value);
    let now = new Date().toISOString(), next;
    if (old) {
      next = transactions.map((item) => item.id === old.id ? { ...item, ...values, updatedAt: now } : item);
    } else {
      values.id = globalThis.crypto?.randomUUID?.() || `txn_${Date.now()}`;
      values.createdAt = now; values.updatedAt = now;
      next = [...transactions, values];
    }
    if (!saveData(keys.transactions, next)) return;
    transactions = next; sessionStorage.removeItem(keys.editing);
    showStatus(old ? "Transaction updated." : "Transaction saved.");
    form.reset(); idInput.value = ""; updatePage();
  });
  let cancel = get("cancel-btn");
  if (cancel) cancel.addEventListener("click", () => {
    sessionStorage.removeItem(keys.editing); location.href = "index.html";
  });
}
function exportTransactions() {
  let file = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
  let url = URL.createObjectURL(file), link = document.createElement("a");
  link.href = url; link.download = "student-finance-transactions.json"; link.click(); URL.revokeObjectURL(url);
  showStatus("Transactions exported.");
}
async function importTransactions(event) {
  let input = event.currentTarget;
  if (!input.files || !input.files[0]) return;
  try {
    let imported = JSON.parse(await input.files[0].text());
    if (!Array.isArray(imported) || !imported.every(validTransaction)) throw new Error("Choose a JSON array of valid transactions.");
    if (saveData(keys.transactions, imported)) { transactions = imported; showStatus("Transactions imported."); updatePage(); }
  } catch (error) {
    console.error("Could not import the selected file:", error); showStatus(`Import failed: ${error.message}`, true);
  }
  input.value = "";
}
function setupSettings() {
  let currency = get("display-currency");
  if (!currency) return;
  currency.value = settings.currency || "RWF";
  get("rate-usd").value = settings.usdRate || ""; get("rate-eur").value = settings.eurRate || "";
  get("cap").value = settings.spendingCap || 0;
  get("save-settings").addEventListener("click", () => {
    let nextSettings = {
      currency: currency.value, usdRate: get("rate-usd").value,
      eurRate: get("rate-eur").value, spendingCap: Number(get("cap").value)
    };
    let rate = nextSettings.currency === "USD" ? Number(nextSettings.usdRate)
      : nextSettings.currency === "EUR" ? Number(nextSettings.eurRate) : 1;
    if (!Number.isFinite(nextSettings.spendingCap) || nextSettings.spendingCap < 0 ||
        (nextSettings.currency !== "RWF" && rate <= 0)) {
      showStatus("Enter a non-negative cap and a positive rate for the selected currency.", true); return;
    }
    if (saveData(keys.settings, nextSettings)) {
      settings = nextSettings; showStatus("Settings saved."); updatePage();
    }
  });
  get("export-btn").addEventListener("click", exportTransactions);
  get("load-sample-btn").addEventListener("click", () => {
    if (!confirm("Replace your transactions with sample data?")) return;
    let now = new Date().toISOString();
    let sampleTransactions = sampleRows.map((item, index) => ({
      ...item, id: `sample_${index + 1}`, createdAt: now, updatedAt: now
    }));
    if (saveData(keys.transactions, sampleTransactions)) {
      transactions = sampleTransactions; showStatus("Sample transactions loaded."); updatePage();
    }
  });
  get("import-file").addEventListener("change", importTransactions);
}

document.addEventListener("DOMContentLoaded", () => {
  updatePage(); setupExpenseForm(); setupSettings();
  if (get("search-input")) get("search-input").addEventListener("input", updateRecords);
  if (get("sort-select")) get("sort-select").addEventListener("change", updateRecords);
});

