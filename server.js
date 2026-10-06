"use strict";

const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const dataDirectory = path.join(__dirname, "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, "student-life-hub.sqlite"));
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const allowedKeys = new Set(["assignments", "attendance", "exams", "studyPlans", "importantLinks", "motivation"]);
const upsertData = database.prepare(`
  INSERT INTO app_data (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`);

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, storage: "sqlite" });
});

app.get("/api/data", (_request, response, next) => {
  try {
    const rows = database.prepare("SELECT key, value FROM app_data").all();
    const savedData = {};
    for (const row of rows) savedData[row.key] = JSON.parse(row.value);
    response.json({ data: savedData });
  } catch (error) {
    next(error);
  }
});

app.put("/api/data/:key", (request, response, next) => {
  try {
    const { key } = request.params;
    if (!allowedKeys.has(key)) {
      response.status(404).json({ error: "Unknown data collection." });
      return;
    }
    const value = request.body && request.body.value;
    const validationError = validateDataset(key, value);
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }
    upsertData.run(key, JSON.stringify(value));
    response.json({ ok: true, key });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});

app.use((request, response, next) => {
  if (/^\/(?:data|server\.js|package(?:-lock)?\.json|README\.md|\.gitignore)(?:\/|$)/i.test(request.path)) {
    response.sendStatus(404);
    return;
  }
  next();
});

app.use(express.static(__dirname, {
  extensions: ["html"],
  dotfiles: "ignore",
  index: "index.html"
}));

app.use((error, _request, response, _next) => {
  console.error("Request failed:", error);
  if (response.headersSent) return;
  const status = error instanceof SyntaxError && "body" in error ? 400 : 500;
  response.status(status).json({ error: status === 400 ? "Invalid JSON request body." : "The server could not complete this request." });
});

function validateDataset(key, value) {
  if (key === "motivation") {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || !Number.isInteger(value.dailyGoal) || value.dailyGoal < 1 || value.dailyGoal > 20
      || !Number.isInteger(value.completed) || value.completed < 0
      || typeof value.goalDate !== "string") {
      return "Motivation data is invalid.";
    }
    return null;
  }
  if (!Array.isArray(value) || value.length > 1000) return "Expected a list of at most 1000 records.";
  const hasText = (record, field, max = 120) => typeof record[field] === "string" && record[field].trim().length > 0 && record[field].length <= max;
  const hasDate = (record, field) => typeof record[field] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record[field]);
  const hasTime = (record, field) => typeof record[field] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(record[field]);
  const common = (record) => record && typeof record === "object" && !Array.isArray(record)
    && typeof record.id === "string" && record.id.length > 0 && record.id.length <= 100;
  const valid = value.every((record) => {
    if (!common(record)) return false;
    if (key === "assignments") return hasText(record, "subject", 45) && hasText(record, "title", 90)
      && hasDate(record, "dueDate") && ["Low", "Medium", "High"].includes(record.priority) && typeof record.completed === "boolean";
    if (key === "attendance") return hasText(record, "subject", 45)
      && Number.isInteger(record.total) && record.total >= 1
      && Number.isInteger(record.attended) && record.attended >= 0 && record.attended <= record.total;
    if (key === "exams") return hasText(record, "subject", 45) && hasDate(record, "date") && hasTime(record, "time");
    if (key === "studyPlans") return hasText(record, "subject", 45) && hasText(record, "task", 90)
      && hasDate(record, "date") && hasTime(record, "time")
      && Number.isInteger(record.duration) && record.duration >= 1 && record.duration <= 1440
      && typeof record.completed === "boolean";
    if (key === "importantLinks") {
      if (!hasText(record, "name", 45) || !hasText(record, "url", 250)) return false;
      try {
        return ["http:", "https:"].includes(new URL(record.url).protocol);
      } catch {
        return false;
      }
    }
    return false;
  });
  return valid ? null : `One or more ${key} records are invalid.`;
}

const server = app.listen(port, host, () => {
  console.log(`Student Life Hub is running at http://${host}:${port}`);
});

function closeServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
