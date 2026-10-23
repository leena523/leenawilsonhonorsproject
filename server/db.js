// Database layer (Milestone 4: persistence)
// Uses Node's built-in SQLite module (node:sqlite), so there is no native
// package to compile. Requires Node.js 22.13+ (or any Node 23/24+).

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;

  -- One row per set of notes a student submits
  CREATE TABLE IF NOT EXISTS submissions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    subject        TEXT    NOT NULL,
    question_type  TEXT    NOT NULL,
    num_questions  INTEGER NOT NULL,
    notes          TEXT    NOT NULL,
    ai_source      TEXT    NOT NULL DEFAULT 'groq',   -- 'groq' or 'mock'
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- The questions the AI generated for a submission
  CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id  INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    type           TEXT    NOT NULL,                  -- multiple_choice | short_answer | conceptual
    question       TEXT    NOT NULL,
    options        TEXT,                              -- JSON array, only for multiple choice
    answer         TEXT    NOT NULL,
    explanation    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_questions_submission ON questions(submission_id);
`);

const insertSubmission = db.prepare(`
  INSERT INTO submissions (title, subject, question_type, num_questions, notes, ai_source)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertQuestion = db.prepare(`
  INSERT INTO questions (submission_id, position, type, question, options, answer, explanation)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/** Saves a submission and its questions in one transaction. Returns the saved submission. */
function createSubmission({ title, subject, questionType, numQuestions, notes, aiSource, questions }) {
  db.exec('BEGIN');
  try {
    const result = insertSubmission.run(title, subject, questionType, numQuestions, notes, aiSource);
    const submissionId = Number(result.lastInsertRowid);

    questions.forEach((q, index) => {
      insertQuestion.run(
        submissionId,
        index + 1,
        q.type,
        q.question,
        q.options ? JSON.stringify(q.options) : null,
        q.answer,
        q.explanation || null
      );
    });

    db.exec('COMMIT');
    return getSubmission(submissionId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Lists past submissions (newest first), optionally filtered by a search term and/or subject. */
function listSubmissions({ search = '', subject = '' } = {}) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(s.title LIKE ? OR s.notes LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (subject) {
    where.push('s.subject = ?');
    params.push(subject);
  }

  const sql = `
    SELECT s.id, s.title, s.subject, s.question_type, s.num_questions, s.ai_source, s.created_at,
           substr(s.notes, 1, 200) AS notes_preview,
           (SELECT COUNT(*) FROM questions q WHERE q.submission_id = s.id) AS question_count
    FROM submissions s
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.created_at DESC, s.id DESC
  `;

  return db.prepare(sql).all(...params).map(toSubmissionSummary);
}

/** Returns one submission with its questions, or null if it doesn't exist. */
function getSubmission(id) {
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  if (!row) return null;

  const questions = db
    .prepare('SELECT * FROM questions WHERE submission_id = ? ORDER BY position')
    .all(id)
    .map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      question: q.question,
      options: q.options ? JSON.parse(q.options) : null,
      answer: q.answer,
      explanation: q.explanation,
    }));

  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    questionType: row.question_type,
    numQuestions: row.num_questions,
    notes: row.notes,
    aiSource: row.ai_source,
    createdAt: toIsoDate(row.created_at),
    questions,
  };
}

/** Deletes a submission (its questions are removed by ON DELETE CASCADE). Returns true if a row was deleted. */
function deleteSubmission(id) {
  const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Distinct subjects the user has submitted notes for (used by the History filter). */
function listSubjects() {
  return db
    .prepare('SELECT DISTINCT subject FROM submissions ORDER BY subject')
    .all()
    .map((r) => r.subject);
}

function toSubmissionSummary(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    questionType: row.question_type,
    numQuestions: row.num_questions,
    aiSource: row.ai_source,
    createdAt: toIsoDate(row.created_at),
    notesPreview: row.notes_preview,
    questionCount: row.question_count,
  };
}

// SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC; convert to ISO so browsers parse it correctly.
function toIsoDate(sqliteDate) {
  return sqliteDate.replace(' ', 'T') + 'Z';
}

module.exports = { createSubmission, listSubmissions, getSubmission, deleteSubmission, listSubjects };
