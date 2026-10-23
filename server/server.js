// Express REST API (Milestone 3) + static frontend hosting

// Load variables from .env if the file exists (built into Node 20.12+)
try {
  process.loadEnvFile();
} catch {
  /* no .env file — fall back to real environment variables */
}

const path = require('node:path');
const express = require('express');
const db = require('./db');
const { generateQuestions, getAIMode, AIServiceError } = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Same limits the browser checks (public/js/upload.js); the server checks again
// because client-side validation can always be bypassed.
const LIMITS = {
  titleMin: 3,
  titleMax: 100,
  notesMin: 100,
  notesMax: 15000,
  minQuestions: 1,
  maxQuestions: 10,
};
const SUBJECTS = ['Biology', 'Chemistry', 'Computer Science', 'History', 'Mathematics', 'Psychology', 'Statistics', 'Other'];
const QUESTION_TYPES = ['multiple_choice', 'short_answer', 'conceptual', 'mixed'];

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------- API routes ----------------

// Lets the frontend show whether real AI or mock mode is active
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ai: getAIMode() });
});

// Generate questions from notes, save everything, return the saved submission
app.post('/api/generate', generateLimiter, async (req, res, next) => {
  try {
    const { errors, value } = validateGenerateRequest(req.body);
    if (errors) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Please fix the highlighted fields.', fields: errors },
      });
    }

    const { questions, source } = await generateQuestions({
      notes: value.notes,
      subject: value.subject,
      questionType: value.questionType,
      count: value.numQuestions,
    });

    const submission = db.createSubmission({ ...value, aiSource: source, questions });
    res.status(201).json({ submission });
  } catch (err) {
    next(err);
  }
});

// List past submissions: GET /api/submissions?search=cell&subject=Biology
app.get('/api/submissions', (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const subject = String(req.query.subject || '').trim();
  res.json({
    submissions: db.listSubmissions({ search, subject }),
    subjects: db.listSubjects(),
  });
});

// One submission with all its questions
app.get('/api/submissions/:id', (req, res) => {
  const id = parseId(req.params.id);
  const submission = id && db.getSubmission(id);
  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That submission does not exist.' } });
  }
  res.json({ submission });
});

app.delete('/api/submissions/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !db.deleteSubmission(id)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That submission does not exist.' } });
  }
  res.status(204).end();
});

// Unknown API route
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
});

// Unknown page → friendly error page
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', 'error.html'));
});

// ---------------- Error handling ----------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AIServiceError) {
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, retryAfter: err.retryAfter },
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Those notes are too large to send.' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The request body was not valid JSON.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our end.' } });
});

// ---------------- Helpers ----------------

function validateGenerateRequest(body = {}) {
  const errors = {};
  const title = String(body.title ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const questionType = String(body.questionType ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const numQuestions = Number(body.numQuestions);

  if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax) {
    errors.title = `Title must be ${LIMITS.titleMin}–${LIMITS.titleMax} characters.`;
  }
  if (!SUBJECTS.includes(subject)) errors.subject = 'Choose a subject from the list.';
  if (!QUESTION_TYPES.includes(questionType)) errors.questionType = 'Choose a question type.';
  if (!Number.isInteger(numQuestions) || numQuestions < LIMITS.minQuestions || numQuestions > LIMITS.maxQuestions) {
    errors.numQuestions = `Number of questions must be a whole number from ${LIMITS.minQuestions} to ${LIMITS.maxQuestions}.`;
  }
  if (notes.length < LIMITS.notesMin) errors.notes = `Notes must be at least ${LIMITS.notesMin} characters.`;
  else if (notes.length > LIMITS.notesMax) errors.notes = `Notes must be under ${LIMITS.notesMax} characters.`;

  if (Object.keys(errors).length) return { errors };
  return { value: { title, subject, questionType, notes, numQuestions } };
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Simple in-memory limiter so one user can't burn through the Groq free tier.
const recentRequests = new Map(); // ip -> [timestamps]
function generateLimiter(req, res, next) {
  const windowMs = 60_000;
  const max = Number(process.env.GENERATE_LIMIT_PER_MINUTE) || 10;
  const now = Date.now();
  const hits = (recentRequests.get(req.ip) || []).filter((t) => now - t < windowMs);

  if (hits.length >= max) {
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: 'You are generating questions too quickly.', retryAfter },
    });
  }
  hits.push(now);
  recentRequests.set(req.ip, hits);
  next();
}

if (require.main === module) {
  app.listen(PORT, () => {
    const ai = getAIMode();
    console.log(`AI Practice Question Generator running at http://localhost:${PORT}`);
    console.log(ai.mode === 'live' ? `AI: Groq (${ai.model})` : 'AI: mock mode (set GROQ_API_KEY in .env to use Groq)');
  });
}

module.exports = app;
