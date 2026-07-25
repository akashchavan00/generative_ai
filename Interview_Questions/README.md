# GenAI Question Bank

A self-hosted interview question tracker. Add your own questions, organize
them into categories (Machine Learning, Deep Learning, AI, Gen-AI, or any
custom category you create), mark them off as you master them, and quiz
yourself with a random-question mode. Everything is stored in plain JSON
files on disk, so it survives closing the browser or restarting the app.

## Folder structure

```
genai-question-bank/
├── package.json          # backend dependencies + start script
├── server.js             # Express API + serves the frontend
├── data/                 # <- your data lives here, auto-created if missing
│   ├── questions.json
│   ├── categories.json
│   └── progress.json
└── public/                # frontend (served as static files by server.js)
    ├── index.html
    ├── style.css
    └── app.js
```

## Run it

```bash
cd genai-question-bank
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

The app starts empty except for four default categories (Machine Learning,
Deep Learning, AI, Gen-AI). Use **+ Add question** to start filling it in.

## Features

- **Add / edit / delete questions**, each with a category, difficulty
  (Easy/Medium/Hard), a plain-language concept explanation, and a ready
  interview answer.
- **Add new categories** on the fly, right from the question form. Category
  chips at the top filter the list and show a live count; a category can
  only be deleted once it has no questions left in it.
- **Search** across question, concept, and answer text, plus a difficulty
  filter — combine both with the category chips.
- **Progress tracking**: check off a question once you can answer it
  confidently. A progress bar shows how many of your total questions you've
  mastered. **Reset progress** clears every checkmark without touching your
  questions.
- **Quiz mode**: pulls a random question from whatever's currently filtered,
  hides the answer until you reveal it, and lets you mark "Got it" or "Still
  learning" before moving to the next one.
- **Export backup**: downloads everything (questions, categories, progress)
  as one JSON file, useful before big edits or for moving to another machine.
- All data is stored under `data/` as human-readable JSON — you can back it
  up, edit it by hand, or put it under version control if you want.

## API reference

| Method | Route                     | Purpose                              |
|--------|---------------------------|---------------------------------------|
| GET    | `/api/questions`          | List questions (supports `?category=`, `?difficulty=`, `?search=`) |
| POST   | `/api/questions`          | Add a question |
| PUT    | `/api/questions/:id`      | Edit a question |
| DELETE | `/api/questions/:id`      | Delete a question |
| GET    | `/api/categories`         | List categories |
| POST   | `/api/categories`         | Add a category |
| DELETE | `/api/categories/:name`   | Delete a category (must be unused) |
| GET    | `/api/progress`           | Get progress map `{ questionId: bool }` |
| POST   | `/api/progress/:id`       | Set progress for one question |
| POST   | `/api/progress/reset`     | Clear all progress |
| GET    | `/api/stats`              | Totals, plus breakdown by category/difficulty |
| GET    | `/api/export`             | Download a full JSON backup |
