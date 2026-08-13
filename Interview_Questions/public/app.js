const API = "/api";
const THEME_KEY = "genai-theme";

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

function el(id) {
  return document.getElementById(id);
}

async function api(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll("#theme-toggle").forEach((btn) => {
    btn.textContent = theme === "light" ? "☾ Dark" : "☀ Light";
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  document.querySelectorAll("#theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(document.body.getAttribute("data-theme") === "light" ? "dark" : "light"));
  });
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

  if (document.body.dataset.page === "browse") {
    renderCategoryRow();
    renderList();
    renderProgress();
  }

  if (document.body.dataset.page === "add") {
    populateCategorySelect();
    populateEditFormIfNeeded();
  }
}

function filteredQuestions() {
  return state.questions.filter((q) => {
    if (state.activeCategory !== "All" && q.category !== state.activeCategory) return false;
    if (state.activeDifficulty && q.difficulty !== state.activeDifficulty) return false;
    if (state.searchTerm) {
      const hay = `${q.question} ${q.concept || ""} ${q.answer || ""}`.toLowerCase();
      if (!hay.includes(state.searchTerm.toLowerCase())) return false;
    }
    return true;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function renderFormattedContent(value) {
  if (!value) return "<em>No content added yet.</em>";
  return String(value).replace(/\n/g, "<br>");
}

function renderCategoryRow() {
  const categoryRow = el("category-row");
  if (!categoryRow) return;
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
    if (e.target.classList.contains("del")) return;
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

function renderList() {
  const listEl = el("card-list");
  const emptyEl = el("empty-state");
  if (!listEl || !emptyEl) return;

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
            <span class="tag cat">${escapeHtml(q.category)}</span>
            <span class="tag diff-${q.difficulty.toLowerCase()}">${escapeHtml(q.difficulty)}</span>
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
            <div class="formatted-block">${renderFormattedContent(q.concept)}</div>
          </div>
          <div class="answer-box">
            <div class="section-label">How to say it in the interview</div>
            <div class="formatted-block">${renderFormattedContent(q.answer)}</div>
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

    card.querySelector(`[data-edit="${q.id}"]`).addEventListener("click", (event) => {
      event.stopPropagation();
      window.location.href = `/add.html?id=${q.id}`;
    });

    card.querySelector(`[data-delete="${q.id}"]`).addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm("Delete this question permanently?")) return;
      await api(`/questions/${q.id}`, { method: "DELETE" });
      await loadAll();
    });
  });
}

function renderProgress() {
  const progressText = el("progress-text");
  const progressPct = el("progress-pct");
  const progressFill = el("progress-fill");
  if (!progressText || !progressPct || !progressFill) return;

  const total = state.questions.length;
  const done = state.questions.filter((q) => state.progress[q.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressText.textContent = `${done} / ${total} mastered`;
  progressPct.textContent = pct + "%";
  progressFill.style.width = pct + "%";
}

function populateCategorySelect() {
  const fieldCategory = el("field-category");
  if (!fieldCategory) return;
  fieldCategory.innerHTML = "";
  state.categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    fieldCategory.appendChild(option);
  });
}

function setupRichEditor(editorId, fontSizeId, colorId) {
  const editor = el(editorId);
  const toolbar = editor ? editor.previousElementSibling : null;
  const fontSizeSelect = el(fontSizeId);
  const colorInput = el(colorId);

  if (!editor || !toolbar || !fontSizeSelect || !colorInput) return;

  toolbar.querySelectorAll(".editor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const command = btn.getAttribute("data-cmd");
      document.execCommand(command, false, null);
      editor.focus();
    });
  });

  fontSizeSelect.addEventListener("change", () => {
    if (fontSizeSelect.value) {
      document.execCommand("fontSize", false, fontSizeSelect.value);
      fontSizeSelect.value = "";
      editor.focus();
    }
  });

  colorInput.addEventListener("input", () => {
    document.execCommand("foreColor", false, colorInput.value);
    editor.focus();
  });

  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}

function populateEditFormIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const editingId = params.get("id");
  const fieldQuestion = el("field-question");
  const fieldDifficulty = el("field-difficulty");
  const fieldCategory = el("field-category");
  const conceptEditor = el("concept-editor");
  const answerEditor = el("answer-editor");
  const formTitle = el("form-title");
  const formError = el("form-error");

  if (!fieldQuestion || !fieldDifficulty || !fieldCategory || !conceptEditor || !answerEditor || !formTitle || !formError) return;

  if (!editingId) {
    state.editingId = null;
    formTitle.textContent = "Add a new question";
    fieldQuestion.value = "";
    fieldDifficulty.value = "Medium";
    fieldCategory.value = state.categories[0] || "";
    conceptEditor.innerHTML = "";
    answerEditor.innerHTML = "";
    formError.textContent = "";
    return;
  }

  const current = state.questions.find((q) => q.id === editingId);
  if (!current) return;

  state.editingId = editingId;
  formTitle.textContent = "Edit question";
  fieldQuestion.value = current.question || "";
  fieldDifficulty.value = current.difficulty || "Medium";
  fieldCategory.value = current.category || state.categories[0] || "";
  conceptEditor.innerHTML = current.concept || "";
  answerEditor.innerHTML = current.answer || "";
  formError.textContent = "";
}

function initBrowsePage() {
  const searchEl = el("search");
  const difficultyEl = el("difficulty-filter");
  const resetBtn = el("reset-btn");
  const exportBtn = el("export-btn");
  const quizBtn = el("quiz-btn");

  if (searchEl) {
    searchEl.addEventListener("input", (event) => {
      state.searchTerm = event.target.value;
      renderList();
    });
  }

  if (difficultyEl) {
    difficultyEl.addEventListener("change", (event) => {
      state.activeDifficulty = event.target.value;
      renderList();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Clear all progress checkmarks? Your questions will stay.")) return;
      state.progress = await api("/progress/reset", { method: "POST" });
      renderList();
      renderProgress();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => window.open(API + "/export", "_blank"));
  }

  if (quizBtn) {
    quizBtn.addEventListener("click", startQuiz);
  }
}

function initAddPage() {
  const fieldQuestion = el("field-question");
  const fieldDifficulty = el("field-difficulty");
  const fieldCategory = el("field-category");
  const saveBtn = el("save-question-btn");
  const newCategoryToggle = el("new-category-toggle");
  const newCategoryRow = el("new-category-row");
  const newCategoryInput = el("new-category-input");
  const cancelCategoryBtn = el("cancel-category-btn");
  const saveCategoryBtn = el("save-category-btn");
  const formError = el("form-error");
  const conceptEditor = el("concept-editor");
  const answerEditor = el("answer-editor");

  if (!fieldQuestion || !fieldDifficulty || !fieldCategory || !saveBtn) return;

  setupRichEditor("concept-editor", "font-size-select", "font-color-input");
  setupRichEditor("answer-editor", "answer-font-size-select", "answer-font-color-input");

  if (newCategoryToggle) {
    newCategoryToggle.addEventListener("click", () => {
      if (newCategoryRow) newCategoryRow.hidden = false;
      if (newCategoryInput) newCategoryInput.focus();
    });
  }

  if (cancelCategoryBtn) {
    cancelCategoryBtn.addEventListener("click", () => {
      if (newCategoryRow) newCategoryRow.hidden = true;
      if (newCategoryInput) newCategoryInput.value = "";
    });
  }

  if (saveCategoryBtn) {
    saveCategoryBtn.addEventListener("click", async () => {
      if (!newCategoryInput) return;
      const name = newCategoryInput.value.trim();
      if (!name) return;
      try {
        state.categories = await api("/categories", { method: "POST", body: JSON.stringify({ name }) });
        populateCategorySelect();
        fieldCategory.value = name;
        if (newCategoryRow) newCategoryRow.hidden = true;
        newCategoryInput.value = "";
        renderCategoryRow();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  saveBtn.addEventListener("click", async () => {
    const payload = {
      category: fieldCategory.value,
      difficulty: fieldDifficulty.value,
      question: fieldQuestion.value.trim(),
      concept: conceptEditor ? conceptEditor.innerHTML.trim() : "",
      answer: answerEditor ? answerEditor.innerHTML.trim() : "",
    };

    try {
      if (state.editingId) {
        await api(`/questions/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/questions", { method: "POST", body: JSON.stringify(payload) });
      }
      window.location.href = "/browse.html";
    } catch (err) {
      if (formError) formError.textContent = err.message;
    }
  });
}

const quizModal = el("quiz-modal");
let quizPool = [];
let quizCurrent = null;

function startQuiz() {
  quizPool = filteredQuestions();
  if (!quizModal) return;
  quizModal.hidden = false;
  pickQuizQuestion();
}

function pickQuizQuestion() {
  const revealWrap = el("quiz-reveal-wrap");
  const answerWrap = el("quiz-answer-wrap");
  const quizQuestion = el("quiz-question");
  const quizConcept = el("quiz-concept");
  const quizAnswer = el("quiz-answer");
  const quizEmpty = el("quiz-empty");
  if (!quizModal || !revealWrap || !answerWrap || !quizQuestion || !quizConcept || !quizAnswer || !quizEmpty) return;

  revealWrap.hidden = false;
  answerWrap.hidden = true;

  if (quizPool.length === 0) {
    quizQuestion.textContent = "—";
    quizEmpty.hidden = false;
    revealWrap.hidden = true;
    return;
  }

  quizEmpty.hidden = true;
  quizCurrent = quizPool[Math.floor(Math.random() * quizPool.length)];
  quizQuestion.textContent = quizCurrent.question;
  quizConcept.innerHTML = renderFormattedContent(quizCurrent.concept);
  quizAnswer.innerHTML = renderFormattedContent(quizCurrent.answer);
}

function initQuiz() {
  const quizClose = el("quiz-close");
  const revealBtn = el("quiz-reveal-btn");
  const nextBtn = el("quiz-next");
  const gotItBtn = el("quiz-got-it");
  const stillLearningBtn = el("quiz-still-learning");
  if (!quizModal) return;

  if (quizClose) quizClose.addEventListener("click", () => (quizModal.hidden = true));
  quizModal.addEventListener("click", (event) => {
    if (event.target === quizModal) quizModal.hidden = true;
  });

  if (revealBtn) revealBtn.addEventListener("click", () => {
    const revealWrap = el("quiz-reveal-wrap");
    const answerWrap = el("quiz-answer-wrap");
    if (revealWrap) revealWrap.hidden = true;
    if (answerWrap) answerWrap.hidden = false;
  });

  if (nextBtn) nextBtn.addEventListener("click", pickQuizQuestion);

  if (gotItBtn) {
    gotItBtn.addEventListener("click", async () => {
      if (!quizCurrent) return;
      state.progress = await api(`/progress/${quizCurrent.id}`, {
        method: "POST",
        body: JSON.stringify({ done: true }),
      });
      renderProgress();
      renderList();
      pickQuizQuestion();
    });
  }

  if (stillLearningBtn) {
    stillLearningBtn.addEventListener("click", async () => {
      if (!quizCurrent) return;
      state.progress = await api(`/progress/${quizCurrent.id}`, {
        method: "POST",
        body: JSON.stringify({ done: false }),
      });
      renderProgress();
      renderList();
      pickQuizQuestion();
    });
  }
}

function initHomePage() {
  return Promise.resolve();
}

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  if (document.body.dataset.page === "home") {
    await initHomePage();
    return;
  }
  if (document.body.dataset.page === "browse") {
    initBrowsePage();
    initQuiz();
  }
  if (document.body.dataset.page === "add") {
    initAddPage();
  }
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    const listEl = el("card-list");
    if (listEl) {
      listEl.innerHTML = '<p style="color:#B4402A">Could not load data from the server. Make sure it is running.</p>';
    }
  }
});
