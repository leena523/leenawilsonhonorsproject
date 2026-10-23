// Generated Questions page: loads a submission and lets the student practice.

const els = {
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty-state'),
  results: document.getElementById('results'),
  message: document.getElementById('page-message'),
  title: document.getElementById('submission-title'),
  meta: document.getElementById('submission-meta'),
  list: document.getElementById('question-list'),
  notes: document.getElementById('original-notes'),
  notesToggle: document.getElementById('notes-toggle'),
  scoreBox: document.getElementById('score-box'),
  score: document.getElementById('score'),
};

let currentSubmission = null;

async function init() {
  const id = new URLSearchParams(window.location.search).get('id');

  try {
    let submissionId = id;

    // No id in the URL → show the most recent submission
    if (!submissionId) {
      const { submissions } = await apiRequest('/api/submissions');
      if (!submissions.length) return showEmpty();
      submissionId = submissions[0].id;
    }

    const { submission } = await apiRequest(`/api/submissions/${encodeURIComponent(submissionId)}`);
    render(submission);
  } catch (error) {
    els.loading.hidden = true;
    if (error.code === 'NOT_FOUND') {
      showEmpty();
      showMessage(els.message, 'error', 'We couldn’t find that set of questions. It may have been deleted.');
    } else {
      showMessage(els.message, 'error', error.message, { actionLabel: 'Try again', onAction: () => location.reload() });
    }
  }
}

function showEmpty() {
  els.loading.hidden = true;
  els.empty.hidden = false;
}

function render(submission) {
  currentSubmission = submission;
  document.title = `${submission.title} – Questions`;
  els.loading.hidden = true;
  els.results.hidden = false;

  els.title.textContent = submission.title;
  els.meta.innerHTML = `
    <span class="badge">${escapeHtml(submission.subject)}</span>
    <span class="badge outline">${escapeHtml(QUESTION_TYPE_LABELS[submission.questionType] || submission.questionType)}</span>
    ${submission.aiSource === 'mock' ? '<span class="badge warn">Mock questions</span>' : ''}
    <span>${submission.questions.length} questions · ${escapeHtml(formatDate(submission.createdAt))}</span>
  `;
  els.notes.textContent = submission.notes;

  els.list.innerHTML = submission.questions.map(renderQuestion).join('');
  updateScore();
}

function renderQuestion(q, index) {
  const typeLabel = QUESTION_TYPE_LABELS[q.type] || q.type;

  if (q.type === 'multiple_choice') {
    const options = q.options
      .map(
        (opt, i) => `
        <li>
          <button type="button" class="option-btn" data-question="${index}" data-correct="${opt === q.answer}">
            <span class="option-letter">${'ABCDEFGH'[i]}</span>
            <span>${escapeHtml(opt)}</span>
          </button>
        </li>`
      )
      .join('');

    return `
      <li class="question-card" data-index="${index}" data-type="multiple_choice">
        <div class="question-top"><span class="q-number">Question ${index + 1}</span><span class="badge outline">${typeLabel}</span></div>
        <p class="question-text">${escapeHtml(q.question)}</p>
        <ul class="options">${options}</ul>
        <div class="feedback" hidden></div>
      </li>`;
  }

  return `
    <li class="question-card" data-index="${index}" data-type="${q.type}">
      <div class="question-top"><span class="q-number">Question ${index + 1}</span><span class="badge outline">${typeLabel}</span></div>
      <p class="question-text">${escapeHtml(q.question)}</p>
      <label class="visually-hidden" for="attempt-${index}">Your answer</label>
      <textarea class="attempt" id="attempt-${index}" placeholder="Type your answer here (optional), then check it…"></textarea>
      <button type="button" class="small-btn reveal-btn" aria-expanded="false">Show answer</button>
      <div class="feedback answer-box" hidden>
        <p><strong>Model answer:</strong> ${escapeHtml(q.answer)}</p>
        ${q.explanation ? `<p class="explanation">${escapeHtml(q.explanation)}</p>` : ''}
      </div>
    </li>`;
}

// ---------- Interactions (one delegated listener for all questions) ----------

els.list.addEventListener('click', (event) => {
  const option = event.target.closest('.option-btn');
  if (option) return answerMultipleChoice(option);

  const reveal = event.target.closest('.reveal-btn');
  if (reveal) return toggleAnswer(reveal.closest('.question-card'));
});

function answerMultipleChoice(button) {
  const card = button.closest('.question-card');
  if (card.classList.contains('answered')) return;

  const q = currentSubmission.questions[Number(card.dataset.index)];
  const isCorrect = button.dataset.correct === 'true';

  card.classList.add('answered', isCorrect ? 'correct' : 'incorrect');
  card.querySelectorAll('.option-btn').forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.correct === 'true') btn.classList.add('right');
  });
  if (!isCorrect) button.classList.add('wrong');

  const feedback = card.querySelector('.feedback');
  feedback.innerHTML = `
    <p><strong>${isCorrect ? '✓ Correct!' : '✗ Not quite.'}</strong> The answer is: ${escapeHtml(q.answer)}</p>
    ${q.explanation ? `<p class="explanation">${escapeHtml(q.explanation)}</p>` : ''}`;
  feedback.hidden = false;

  updateScore();
}

function toggleAnswer(card, forceOpen) {
  const button = card.querySelector('.reveal-btn');
  const box = card.querySelector('.answer-box');
  const open = forceOpen ?? box.hidden;
  box.hidden = !open;
  button.textContent = open ? 'Hide answer' : 'Show answer';
  button.setAttribute('aria-expanded', String(open));
}

function updateScore() {
  const mcCards = els.list.querySelectorAll('[data-type="multiple_choice"]');
  if (!mcCards.length) {
    els.scoreBox.hidden = true;
    return;
  }
  const answered = els.list.querySelectorAll('[data-type="multiple_choice"].answered').length;
  const correct = els.list.querySelectorAll('[data-type="multiple_choice"].correct').length;
  els.scoreBox.hidden = false;
  els.score.textContent = `${correct} / ${mcCards.length}`;
  els.scoreBox.title = `${answered} of ${mcCards.length} multiple-choice questions answered`;
}

// ---------- Toolbar ----------

document.getElementById('reveal-all-btn').addEventListener('click', () => {
  els.list.querySelectorAll('.question-card').forEach((card) => {
    if (card.dataset.type === 'multiple_choice') {
      if (!card.classList.contains('answered')) {
        const correctBtn = card.querySelector('.option-btn[data-correct="true"]');
        answerMultipleChoice(correctBtn);
        card.classList.remove('correct');
        card.classList.add('revealed');
      }
    } else {
      toggleAnswer(card, true);
    }
  });
  updateScore();
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (currentSubmission) render(currentSubmission);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

els.notesToggle.addEventListener('click', () => {
  const open = els.notes.hidden;
  els.notes.hidden = !open;
  els.notesToggle.textContent = open ? 'Hide original notes' : 'Show original notes';
  els.notesToggle.setAttribute('aria-expanded', String(open));
});

document.getElementById('print-btn').addEventListener('click', () => window.print());

init();
