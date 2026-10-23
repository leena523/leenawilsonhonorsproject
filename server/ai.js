// AI integration (Milestone 3): all calls to Groq happen here, on the server,
// so the API key is never sent to the browser.
//
// If GROQ_API_KEY is not set (or USE_MOCK_AI=true) the app uses mock questions
// built from the notes instead, so the full workflow can be demoed offline.

const GROQ_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const REQUEST_TIMEOUT_MS = 45_000;

const QUESTION_TYPES = ['multiple_choice', 'short_answer', 'conceptual'];

/** An error from the AI layer, with a code the frontend uses to pick a helpful message. */
class AIServiceError extends Error {
  constructor(code, message, { status = 503, retryAfter = null } = {}) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;        // RATE_LIMITED | AI_UNAVAILABLE | AI_CONFIG | AI_BAD_RESPONSE
    this.status = status;    // HTTP status our API responds with
    this.retryAfter = retryAfter;
  }
}

function getAIMode() {
  const useMock = process.env.USE_MOCK_AI === 'true' || !process.env.GROQ_API_KEY;
  return {
    mode: useMock ? 'mock' : 'live',
    model: useMock ? 'mock' : process.env.GROQ_MODEL || DEFAULT_MODEL,
  };
}

/**
 * Generates practice questions from notes.
 * @returns {Promise<{questions: Array, source: 'groq'|'mock'}>}
 */
async function generateQuestions({ notes, subject, questionType, count }) {
  // Lets you demo the error page on purpose, e.g. MOCK_AI_ERROR=RATE_LIMITED
  if (process.env.MOCK_AI_ERROR) throw simulatedError(process.env.MOCK_AI_ERROR);

  if (getAIMode().mode === 'mock') {
    await new Promise((r) => setTimeout(r, 600)); // feel like a real request
    return { questions: buildMockQuestions({ notes, questionType, count }), source: 'mock' };
  }

  const questions = await callGroq({ notes, subject, questionType, count });
  return { questions, source: 'groq' };
}

async function callGroq({ notes, subject, questionType, count }) {
  const typeInstruction =
    questionType === 'mixed'
      ? 'Use a mix of multiple_choice, short_answer and conceptual questions.'
      : `Every question must have type "${questionType}".`;

  const systemPrompt = `You are a study assistant that writes practice questions for students.
Write questions ONLY about material that appears in the student's notes. Do not invent facts.
Respond with a single JSON object and nothing else, in exactly this shape:
{
  "questions": [
    {
      "type": "multiple_choice" | "short_answer" | "conceptual",
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string",
      "explanation": "string"
    }
  ]
}
Rules:
- multiple_choice: exactly 4 options; "answer" must be copied exactly from one of the options.
- short_answer: a factual recall question; "answer" is a 1-2 sentence model answer; omit "options".
- conceptual: asks the student to explain why/how or connect ideas; "answer" is a 2-4 sentence model answer; omit "options".
- "explanation" briefly says why the answer is correct, referring to the notes.`;

  const userPrompt = `Subject: ${subject}
Number of questions: ${count}
${typeInstruction}

Student notes:
"""
${notes}
"""`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_completion_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AIServiceError('AI_UNAVAILABLE', 'The AI service took too long to respond.', { status: 504 });
    }
    throw new AIServiceError('AI_UNAVAILABLE', 'Could not reach the AI service.', { status: 503 });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`Groq API error ${response.status}: ${detail.slice(0, 500)}`);

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after'), 10) || 30;
      throw new AIServiceError('RATE_LIMITED', 'The AI service is rate-limited right now.', {
        status: 429,
        retryAfter,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new AIServiceError('AI_CONFIG', 'The server’s AI API key is missing or invalid.', { status: 502 });
    }
    if (response.status === 400 || response.status === 404) {
      throw new AIServiceError('AI_CONFIG', 'The AI request was rejected (check the model name).', { status: 502 });
    }
    throw new AIServiceError('AI_UNAVAILABLE', 'The AI service is temporarily unavailable.', { status: 503 });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return parseQuestions(content, count);
}

/** Parses and cleans up the model's JSON so the rest of the app can trust its shape. */
function parseQuestions(content, maxCount) {
  let parsed;
  try {
    // Some models wrap JSON in ```json fences; strip them just in case.
    const cleaned = String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIServiceError('AI_BAD_RESPONSE', 'The AI returned a response we could not read.', { status: 502 });
  }

  const raw = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(raw)) {
    throw new AIServiceError('AI_BAD_RESPONSE', 'The AI response did not contain any questions.', { status: 502 });
  }

  const questions = raw
    .map(normalizeQuestion)
    .filter(Boolean)
    .slice(0, maxCount);

  if (questions.length === 0) {
    throw new AIServiceError('AI_BAD_RESPONSE', 'The AI response did not contain usable questions.', { status: 502 });
  }
  return questions;
}

function normalizeQuestion(q) {
  if (!q || typeof q.question !== 'string' || !q.question.trim()) return null;

  const type = QUESTION_TYPES.includes(q.type) ? q.type : 'short_answer';
  const answer = String(q.answer ?? '').trim();
  const explanation = q.explanation ? String(q.explanation).trim() : '';

  if (type === 'multiple_choice') {
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
    // Accept answers given as a letter ("B") as well as the option text.
    let correct = options.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (!correct && /^[A-D]$/i.test(answer)) correct = options['ABCD'.indexOf(answer.toUpperCase())];
    if (options.length < 2 || !correct) return null;
    return { type, question: q.question.trim(), options, answer: correct, explanation };
  }

  if (!answer) return null;
  return { type, question: q.question.trim(), options: null, answer, explanation };
}

function simulatedError(code) {
  switch (code) {
    case 'RATE_LIMITED':
      return new AIServiceError('RATE_LIMITED', 'The AI service is rate-limited right now.', { status: 429, retryAfter: 30 });
    case 'AI_CONFIG':
      return new AIServiceError('AI_CONFIG', 'The server’s AI API key is missing or invalid.', { status: 502 });
    case 'AI_BAD_RESPONSE':
      return new AIServiceError('AI_BAD_RESPONSE', 'The AI returned a response we could not read.', { status: 502 });
    default:
      return new AIServiceError('AI_UNAVAILABLE', 'The AI service is temporarily unavailable.', { status: 503 });
  }
}

// ---------- Mock responses (used when no API key is configured) ----------

const STOP_WORDS = new Set(
  'about above after again against because before being below between both could does doing during each from further having here into itself more most other ought same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom why with would your yours also which'.split(' ')
);

function buildMockQuestions({ notes, questionType, count }) {
  const sentences = notes
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 6);

  const keywords = [...new Set(notes.match(/\b[A-Za-z][A-Za-z-]{5,}\b/g) || [])]
    .filter((w) => !STOP_WORDS.has(w.toLowerCase()));

  const pool = sentences.length ? sentences : [notes.slice(0, 200)];
  const questions = [];

  for (let i = 0; i < count; i++) {
    const sentence = pool[i % pool.length];
    const type = questionType === 'mixed' ? QUESTION_TYPES[i % 3] : questionType;

    if (type === 'multiple_choice') {
      const words = sentence.match(/\b[A-Za-z][A-Za-z-]{5,}\b/g) || [];
      const target = words.filter((w) => !STOP_WORDS.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
      // Wrong options: other key terms from the notes that are NOT in this sentence
      const inSentence = new Set(words.map((w) => w.toLowerCase()));
      const candidates = keywords
        .filter((k) => !inSentence.has(k.toLowerCase()))
        .sort((a, b) => b.length - a.length);
      const distractors = candidates.slice(i % Math.max(1, candidates.length - 2), (i % Math.max(1, candidates.length - 2)) + 3);

      if (target && distractors.length === 3) {
        const options = shuffle([target, ...distractors], i);
        questions.push({
          type,
          question: `Fill in the blank: "${sentence.replace(target, '_____')}"`,
          options,
          answer: target,
          explanation: `Your notes say: "${sentence}"`,
        });
        continue;
      }
    }

    if (type === 'conceptual') {
      questions.push({
        type: 'conceptual',
        question: `Explain the idea behind this statement and how it connects to the rest of your notes: "${sentence}"`,
        options: null,
        answer: `A strong answer restates the idea in your own words, explains why it is true, and links it to another concept from the notes. Key point: ${sentence}`,
        explanation: 'Conceptual questions check understanding, not memorization.',
      });
    } else {
      questions.push({
        type: 'short_answer',
        question: `In your own words, what do your notes say about the following? "${truncate(sentence, 80)}"`,
        options: null,
        answer: sentence,
        explanation: 'This comes directly from your notes.',
      });
    }
  }
  return questions;
}

function shuffle(items, seed) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed * 7 + i * 13) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

module.exports = { generateQuestions, getAIMode, AIServiceError, parseQuestions };
