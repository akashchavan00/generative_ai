/**
 * GenAI Question Bank — backend server
 * ------------------------------------
 * A small Express API that stores everything in plain JSON files on disk
 * (no database needed). Data survives server restarts and closing the
 * browser, because it lives in /data on your machine, not in memory.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 4000;

const DATA_DIR = path.join(__dirname, "data");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");

const DEFAULT_CATEGORIES = ["Machine Learning", "Deep Learning", "AI", "Gen-AI"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const AI_TOPIC_POOL = [
  "transformers",
  "gradient descent",
  "retrieval augmented generation",
  "attention mechanism",
  "large language model",
  "convolutional neural network",
  "vector embedding",
  "diffusion model",
  "reinforcement learning",
  "prompt engineering",
];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QUESTIONS_FILE)) writeJSON(QUESTIONS_FILE, []);
  if (!fs.existsSync(CATEGORIES_FILE)) writeJSON(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  if (!fs.existsSync(PROGRESS_FILE)) writeJSON(PROGRESS_FILE, {});
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

ensureDataFiles();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/index.html");
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

app.get("/api/categories", (req, res) => {
  res.json(readJSON(CATEGORIES_FILE, []));
});

app.post("/api/categories", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Category name is required." });

  const categories = readJSON(CATEGORIES_FILE, []);
  if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: "That category already exists." });
  }

  categories.push(name);
  writeJSON(CATEGORIES_FILE, categories);
  res.status(201).json(categories);
});

app.delete("/api/categories/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const categories = readJSON(CATEGORIES_FILE, []);
  const questions = readJSON(QUESTIONS_FILE, []);

  const inUse = questions.some((q) => q.category === name);
  if (inUse) {
    return res.status(400).json({
      error: "This category still has questions in it. Move or delete those first.",
    });
  }

  writeJSON(CATEGORIES_FILE, categories.filter((c) => c !== name));
  res.json(readJSON(CATEGORIES_FILE, []));
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

app.get("/api/questions", (req, res) => {
  let questions = readJSON(QUESTIONS_FILE, []);
  const { category, difficulty, search } = req.query;

  if (category) questions = questions.filter((q) => q.category === category);
  if (difficulty) questions = questions.filter((q) => q.difficulty === difficulty);
  if (search) {
    const term = search.toLowerCase();
    questions = questions.filter((q) =>
      `${q.question} ${q.concept} ${q.answer}`.toLowerCase().includes(term)
    );
  }

  // newest first
  questions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(questions);
});

app.post("/api/questions", (req, res) => {
  const { question, concept, answer, category, difficulty } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question text is required." });
  }
  if (!category) {
    return res.status(400).json({ error: "Please choose or create a category." });
  }

  const categories = readJSON(CATEGORIES_FILE, []);
  if (!categories.includes(category)) {
    return res.status(400).json({ error: "Unknown category." });
  }

  const diff = DIFFICULTIES.includes(difficulty) ? difficulty : "Medium";

  const newQuestion = {
    id: crypto.randomUUID(),
    question: question.trim(),
    concept: (concept || "").trim(),
    answer: (answer || "").trim(),
    category,
    difficulty: diff,
    createdAt: new Date().toISOString(),
  };

  const questions = readJSON(QUESTIONS_FILE, []);
  questions.push(newQuestion);
  writeJSON(QUESTIONS_FILE, questions);

  res.status(201).json(newQuestion);
});

app.put("/api/questions/:id", (req, res) => {
  const questions = readJSON(QUESTIONS_FILE, []);
  const idx = questions.findIndex((q) => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Question not found." });

  const { question, concept, answer, category, difficulty } = req.body;

  if (category) {
    const categories = readJSON(CATEGORIES_FILE, []);
    if (!categories.includes(category)) {
      return res.status(400).json({ error: "Unknown category." });
    }
  }

  questions[idx] = {
    ...questions[idx],
    question: question !== undefined ? question.trim() : questions[idx].question,
    concept: concept !== undefined ? concept.trim() : questions[idx].concept,
    answer: answer !== undefined ? answer.trim() : questions[idx].answer,
    category: category || questions[idx].category,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : questions[idx].difficulty,
  };

  writeJSON(QUESTIONS_FILE, questions);
  res.json(questions[idx]);
});

app.delete("/api/questions/:id", (req, res) => {
  const questions = readJSON(QUESTIONS_FILE, []);
  writeJSON(QUESTIONS_FILE, questions.filter((q) => q.id !== req.params.id));

  const progress = readJSON(PROGRESS_FILE, {});
  delete progress[req.params.id];
  writeJSON(PROGRESS_FILE, progress);

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

app.get("/api/progress", (req, res) => {
  res.json(readJSON(PROGRESS_FILE, {}));
});

app.post("/api/progress/:id", (req, res) => {
  const progress = readJSON(PROGRESS_FILE, {});
  progress[req.params.id] = !!req.body.done;
  writeJSON(PROGRESS_FILE, progress);
  res.json(progress);
});

app.post("/api/progress/reset", (req, res) => {
  writeJSON(PROGRESS_FILE, {});
  res.json({});
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

app.get("/api/stats", (req, res) => {
  const questions = readJSON(QUESTIONS_FILE, []);
  const progress = readJSON(PROGRESS_FILE, {});

  const total = questions.length;
  const done = questions.filter((q) => progress[q.id]).length;

  const byCategory = {};
  const byDifficulty = { Easy: { total: 0, done: 0 }, Medium: { total: 0, done: 0 }, Hard: { total: 0, done: 0 } };

  questions.forEach((q) => {
    if (!byCategory[q.category]) byCategory[q.category] = { total: 0, done: 0 };
    byCategory[q.category].total++;
    if (progress[q.id]) byCategory[q.category].done++;

    if (byDifficulty[q.difficulty]) {
      byDifficulty[q.difficulty].total++;
      if (progress[q.id]) byDifficulty[q.difficulty].done++;
    }
  });

  res.json({ total, done, byCategory, byDifficulty });
});

// ---------------------------------------------------------------------------
// Export / backup
// ---------------------------------------------------------------------------

app.get("/api/export", (req, res) => {
  const payload = {
    questions: readJSON(QUESTIONS_FILE, []),
    categories: readJSON(CATEGORIES_FILE, []),
    progress: readJSON(PROGRESS_FILE, {}),
    exportedAt: new Date().toISOString(),
  };
  res.setHeader("Content-Disposition", 'attachment; filename="genai-question-bank-backup.json"');
  res.json(payload);
});

function fallbackTopicResponse(topic) {
  const fallbackMap = {
    transformers: "Transformers are neural networks designed to understand relationships in text and other sequences. They use attention to focus on the most relevant parts of the input, which makes them powerful for language tasks like summarization and chat.",
    "gradient descent": "Gradient descent is an optimization method that helps a model improve by reducing its error step by step. The model adjusts its weights in the direction that lowers loss, making training more accurate over time.",
    "retrieval augmented generation": "Retrieval augmented generation combines a language model with a search step. The system first finds relevant information from a knowledge source, then uses that context to generate a more grounded and accurate answer.",
    "attention mechanism": "Attention helps a model decide which parts of the input matter most. Instead of treating everything equally, it gives more importance to useful signals, improving understanding and generation quality.",
    "large language model": "A large language model is a neural network trained on massive text data. It learns patterns in language so it can generate, summarize, and answer questions in a human-like way.",
    "convolutional neural network": "A convolutional neural network is a model that specializes in visual data. It uses small filters to detect patterns such as edges, textures, and shapes, which makes it effective for image tasks.",
    "vector embedding": "A vector embedding is a compact numerical representation of meaning. Similar ideas are placed closer together in this space, allowing machines to compare, search, and reason about content more effectively.",
    "diffusion model": "A diffusion model learns by gradually adding and removing noise from data. This process helps it generate realistic images or samples by reversing the noise step by step.",
    "reinforcement learning": "Reinforcement learning trains an agent by rewarding good actions and discouraging bad ones. Over time, the agent learns a strategy that maximizes long-term success in a task.",
    "prompt engineering": "Prompt engineering is the practice of crafting clear instructions to guide an AI model. Good prompts improve the quality, structure, and relevance of the model's outputs.",
  };

  return fallbackMap[topic] || `A ${topic} is a key idea in modern AI. It helps systems learn patterns from data and make better predictions or decisions over time.`;
}

app.listen(PORT, () => {
  console.log(`GenAI Question Bank running at http://localhost:${PORT}`);
});
