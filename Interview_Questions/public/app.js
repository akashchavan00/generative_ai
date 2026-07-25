const API = "/api";

let state = {
  questions: [],
  categories: [],
  progress: {},
  stats: { total: 0, done: 0, byCategory: {}, byDifficulty: {} },
  activeCategory: "All",
  activeDifficulty: "",
  searchTerm: "",
  editingId: null,
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function loadAll() {
  const [questions, categories, progress, stats] = await Promise.all([
    api("/questions"),
    api("/categories"),
    api("/progress"),
    api("/stats"),
  ]);
  state.questions = questions;
  state.categories = categories;
  state.progress = progress;
  state.stats = stats;
  renderCategoryRow();
  renderList();
  renderProgress();
  renderSidebarStats();
  populateCategorySelect();
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const el = (id) => document.getElementById(id);
const listEl = el("card-list");
const emptyEl = el("empty-state");
const categoryRow = el("category-row");

// ---------------------------------------------------------------------------
// Category chips + filtering
// ---------------------------------------------------------------------------

function renderCategoryRow() {
  categoryRow.innerHTML = "";

  const counts = {};
  state.questions.forEach((q) => (counts[q.category] = (counts[q.category] || 0) + 1));

  const allChip = makeChip("All", state.questions.length, state.activeCategory === "All");
  categoryRow.appendChild(allChip);

  state.categories.forEach((cat) => {
    const chip = makeChip(cat, counts[cat] || 0, state.activeCategory === cat, true);
    categoryRow.appendChild(chip);
  });
}

function makeChip(name, count, active, deletable) {
  const chip = document.createElement("span");
  chip.className = "chip" + (active ? " active" : "");
  chip.innerHTML = `${name} <span class="count">${count}</span>${deletable ? '<span class="del" title="Delete category">×</span>' : ""}`;

  chip.addEventListener("click", (e) => {
    if (e.target.classList.contains("del")) return; // handled separately
    state.activeCategory = name;
    renderCategoryRow();
    renderList();
  });

  if (deletable) {
    const del = chip.querySelector(".del");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete category "${name}"? This only works if no questions use it.`)) return;
      try {
        state.categories = await api(`/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (state.activeCategory === name) state.activeCategory = "All";
        renderCategoryRow();
        populateCategorySelect();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  return chip;
}

// ---------------------------------------------------------------------------
// Question list rendering
// ---------------------------------------------------------------------------

function filteredQuestions() {
  return state.questions.filter((q) => {
    if (state.activeCategory !== "All" && q.category !== state.activeCategory) return false;
    if (state.activeDifficulty && q.difficulty !== state.activeDifficulty) return false;
    if (state.searchTerm) {
      const hay = `${q.question} ${q.concept} ${q.answer}`.toLowerCase();
      if (!hay.includes(state.searchTerm.toLowerCase())) return false;
    }
    return true;
  });
}

function renderList() {
  listEl.innerHTML = "";
  const items = filteredQuestions();
  emptyEl.style.display = items.length === 0 ? "block" : "none";

  items.forEach((q) => {
    const isDone = !!state.progress[q.id];
    const card = document.createElement("div");
    card.className = "card" + (isDone ? " done" : "");

    card.innerHTML = `
      <div class="card-head" data-id="${q.id}">
        <div class="check-col">
          <input type="checkbox" ${isDone ? "checked" : ""} data-check="${q.id}">
        </div>
        <div class="qmain">
          <div class="qtags">
            <span class="tag cat">${q.category}</span>
            <span class="tag diff-${q.difficulty.toLowerCase()}">${q.difficulty}</span>
          </div>
          <div class="qtext">${escapeHtml(q.question)}</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${q.id}" title="Edit">✎</button>
          <button class="icon-btn danger" data-delete="${q.id}" title="Delete">🗑</button>
        </div>
        <div class="chevron">▾</div>
      </div>
      <div class="card-body">
        <div class="card-body-inner">
          <div class="concept">
            <div class="section-label">The concept</div>
            <div class="formatted-block">${escapeHtml(q.concept) || "<em>No explanation added yet.</em>"}</div>
          </div>
          <div class="answer-box">
            <div class="section-label">How to say it in the interview</div>
            <div class="formatted-block">${q.answer ? escapeHtml(q.answer) : "<em>No answer added yet.</em>"}</div>
          </div>
        </div>
      </div>
    `;

    listEl.appendChild(card);

    const head = card.querySelector(".card-head");
    const body = card.querySelector(".card-body");
    head.addEventListener("click", (e) => {
      if (e.target.closest(".card-actions") || e.target.closest(".check-col")) return;
      const open = card.classList.toggle("open");
      body.style.maxHeight = open ? body.scrollHeight + "px" : "0px";
    });

    card.querySelector(`[data-check="${q.id}"]`).addEventListener("change", async (e) => {
      const done = e.target.checked;
      state.progress = await api(`/progress/${q.id}`, {
        method: "POST",
        body: JSON.stringify({ done }),
      });
      card.classList.toggle("done", done);
      renderProgress();
    });

    card.querySelector(`[data-edit="${q.id}"]`).addEventListener("click", () => openFormForEdit(q));
    card.querySelector(`[data-delete="${q.id}"]`).addEventListener("click", async () => {
      if (!confirm("Delete this question permanently?")) return;
      await api(`/questions/${q.id}`, { method: "DELETE" });
      await loadAll();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Overall progress bar
// ---------------------------------------------------------------------------

function renderProgress() {
  const total = state.questions.length;
  const done = state.questions.filter((q) => state.progress[q.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el("progress-text").textContent = `${done} / ${total} mastered`;
  el("progress-pct").textContent = pct + "%";
  el("progress-fill").style.width = pct + "%";
}

function renderSidebarStats() {
  const total = state.questions.length;
  const done = state.questions.filter((q) => state.progress[q.id]).length;
  const remaining = Math.max(total - done, 0);
  const categories = state.categories.length;
  const tip = total === 0
    ? "Start by adding a question and a polished answer to build your bank."
    : done >= total
      ? "You’ve completed everything. Add a fresh prompt or review your strongest answers."
      : "Pick one question with a short answer and practice saying it out loud."

  el("sidebar-total").textContent = total;
  el("sidebar-mastered").textContent = done;
  el("sidebar-remaining").textContent = remaining;
  el("sidebar-categories").textContent = categories;
  el("sidebar-tip").textContent = tip;
}

// ---------------------------------------------------------------------------
// Add / edit question form
// ---------------------------------------------------------------------------

const formCard = el("form-card");
const formTitle = el("form-title");
const fieldCategory = el("field-category");
const fieldDifficulty = el("field-difficulty");
const fieldQuestion = el("field-question");
const fieldConcept = el("field-concept");
const fieldAnswer = el("field-answer");
const formError = el("form-error");

function populateCategorySelect() {
  fieldCategory.innerHTML = state.categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
}

function openFormForAdd() {
  state.editingId = null;
  formTitle.textContent = "Add a new question";
  fieldQuestion.value = "";
  fieldConcept.value = "";
  fieldAnswer.value = "";
  fieldDifficulty.value = "Medium";
  formError.textContent = "";
  formCard.hidden = false;
  fieldQuestion.focus();
}

function openFormForEdit(q) {
  state.editingId = q.id;
  formTitle.textContent = "Edit question";
  fieldCategory.value = q.category;
  fieldDifficulty.value = q.difficulty;
  fieldQuestion.value = q.question;
  fieldConcept.value = q.concept;
  fieldAnswer.value = q.answer;
  formError.textContent = "";
  formCard.hidden = false;
  formCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm() {
  formCard.hidden = true;
  state.editingId = null;
}

el("add-toggle-btn").addEventListener("click", () => {
  if (formCard.hidden) openFormForAdd();
  else closeForm();
});

el("sidebar-add-btn").addEventListener("click", () => {
  if (formCard.hidden) openFormForAdd();
  else closeForm();
  formCard.scrollIntoView({ behavior: "smooth", block: "start" });
});

el("cancel-question-btn").addEventListener("click", closeForm);

el("save-question-btn").addEventListener("click", async () => {
  const payload = {
    category: fieldCategory.value,
    difficulty: fieldDifficulty.value,
    question: fieldQuestion.value,
    concept: fieldConcept.value,
    answer: fieldAnswer.value,
  };

  try {
    if (state.editingId) {
      await api(`/questions/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/questions", { method: "POST", body: JSON.stringify(payload) });
    }
    closeForm();
    await loadAll();
  } catch (err) {
    formError.textContent = err.message;
  }
});

// ----- inline "add new category" -----

const newCategoryRow = el("new-category-row");
const newCategoryInput = el("new-category-input");

el("new-category-toggle").addEventListener("click", () => {
  newCategoryRow.hidden = false;
  newCategoryInput.focus();
});
el("cancel-category-btn").addEventListener("click", () => {
  newCategoryRow.hidden = true;
  newCategoryInput.value = "";
});
el("save-category-btn").addEventListener("click", async () => {
  const name = newCategoryInput.value.trim();
  if (!name) return;
  try {
    state.categories = await api("/categories", { method: "POST", body: JSON.stringify({ name }) });
    populateCategorySelect();
    fieldCategory.value = name;
    newCategoryRow.hidden = true;
    newCategoryInput.value = "";
    renderCategoryRow();
  } catch (err) {
    alert(err.message);
  }
});

// ---------------------------------------------------------------------------
// Toolbar: search + difficulty filter
// ---------------------------------------------------------------------------

el("search").addEventListener("input", (e) => {
  state.searchTerm = e.target.value;
  renderList();
});

el("difficulty-filter").addEventListener("change", (e) => {
  state.activeDifficulty = e.target.value;
  renderList();
});

// ---------------------------------------------------------------------------
// Reset progress + export
// ---------------------------------------------------------------------------

el("reset-btn").addEventListener("click", async () => {
  if (!confirm("Clear all progress checkmarks? Your questions will stay.")) return;
  state.progress = await api("/progress/reset", { method: "POST" });
  renderList();
  renderProgress();
  renderSidebarStats();
});

el("sidebar-reset-btn").addEventListener("click", async () => {
  if (!confirm("Clear all progress checkmarks? Your questions will stay.")) return;
  state.progress = await api("/progress/reset", { method: "POST" });
  renderList();
  renderProgress();
  renderSidebarStats();
});

el("export-btn").addEventListener("click", () => {
  window.open(API + "/export", "_blank");
});

el("sidebar-export-btn").addEventListener("click", () => {
  window.open(API + "/export", "_blank");
});

// ---------------------------------------------------------------------------
// Quiz mode
// ---------------------------------------------------------------------------

const quizModal = el("quiz-modal");
let quizPool = [];
let quizCurrent = null;

function startQuiz() {
  quizPool = filteredQuestions();
  quizModal.hidden = false;
  pickQuizQuestion();
}

function pickQuizQuestion() {
  el("quiz-reveal-wrap").hidden = false;
  el("quiz-answer-wrap").hidden = true;

  if (quizPool.length === 0) {
    el("quiz-question").textContent = "—";
    el("quiz-empty").hidden = false;
    el("quiz-reveal-wrap").hidden = true;
    return;
  }

  el("quiz-empty").hidden = true;
  quizCurrent = quizPool[Math.floor(Math.random() * quizPool.length)];
  el("quiz-question").textContent = quizCurrent.question;
  el("quiz-concept").textContent = quizCurrent.concept || "No explanation added yet.";
  el("quiz-answer").textContent = quizCurrent.answer || "No answer added yet.";
}

el("quiz-btn").addEventListener("click", startQuiz);
el("sidebar-quiz-btn").addEventListener("click", startQuiz);
el("quiz-close").addEventListener("click", () => (quizModal.hidden = true));
quizModal.addEventListener("click", (e) => {
  if (e.target === quizModal) quizModal.hidden = true;
});

el("quiz-reveal-btn").addEventListener("click", () => {
  el("quiz-reveal-wrap").hidden = true;
  el("quiz-answer-wrap").hidden = false;
});

el("quiz-next").addEventListener("click", pickQuizQuestion);

el("quiz-got-it").addEventListener("click", async () => {
  if (!quizCurrent) return;
  state.progress = await api(`/progress/${quizCurrent.id}`, {
    method: "POST",
    body: JSON.stringify({ done: true }),
  });
  renderProgress();
  renderSidebarStats();
  renderList();
  pickQuizQuestion();
});

el("quiz-still-learning").addEventListener("click", async () => {
  if (!quizCurrent) return;
  state.progress = await api(`/progress/${quizCurrent.id}`, {
    method: "POST",
    body: JSON.stringify({ done: false }),
  });
  renderProgress();
  renderSidebarStats();
  renderList();
  pickQuizQuestion();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadAll().catch((err) => {
  console.error(err);
  listEl.innerHTML = `<p style="color:#B4402A">Could not load data from the server. Make sure it's running (npm start).</p>`;
});
