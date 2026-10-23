// History page: lists saved submissions with search, subject filter, and delete.

const els = {
  list: document.getElementById('history-list'),
  search: document.getElementById('search'),
  subject: document.getElementById('subject-filter'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyText: document.getElementById('empty-text'),
  emptyCta: document.getElementById('empty-cta'),
  count: document.getElementById('result-count'),
  message: document.getElementById('page-message'),
};

let searchTimer = null;

async function loadHistory() {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set('search', els.search.value.trim());
  if (els.subject.value) params.set('subject', els.subject.value);

  els.loading.hidden = false;
  try {
    const { submissions, subjects } = await apiRequest(`/api/submissions?${params}`);
    updateSubjectOptions(subjects);
    render(submissions);
  } catch (error) {
    els.list.innerHTML = '';
    els.count.textContent = '';
    showMessage(els.message, 'error', `Couldn’t load your history. ${error.message}`, {
      actionLabel: 'Try again',
      onAction: loadHistory,
    });
  } finally {
    els.loading.hidden = true;
  }
}

function updateSubjectOptions(subjects) {
  const selected = els.subject.value;
  els.subject.innerHTML =
    '<option value="">All subjects</option>' +
    subjects.map((s) => `<option ${s === selected ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

function render(submissions) {
  const filtering = els.search.value.trim() || els.subject.value;

  els.empty.hidden = submissions.length > 0;
  if (!submissions.length) {
    els.emptyTitle.textContent = filtering ? 'No matches' : 'No submissions yet';
    els.emptyText.textContent = filtering
      ? 'Nothing matches your search. Try a different word or subject.'
      : 'Once you generate questions, they’ll be saved here so you can come back to them.';
    els.emptyCta.hidden = Boolean(filtering);
  }

  els.count.textContent = submissions.length
    ? `${submissions.length} submission${submissions.length === 1 ? '' : 's'}`
    : '';

  els.list.innerHTML = submissions
    .map(
      (s) => `
      <li class="question-card history-item" data-id="${s.id}">
        <div class="history-main">
          <h3><a href="generated.html?id=${s.id}">${escapeHtml(s.title)}</a></h3>
          <p class="meta">
            <span class="badge">${escapeHtml(s.subject)}</span>
            <span class="badge outline">${escapeHtml(QUESTION_TYPE_LABELS[s.questionType] || s.questionType)}</span>
            ${s.aiSource === 'mock' ? '<span class="badge warn">Mock</span>' : ''}
            <span>${s.questionCount} questions · ${escapeHtml(formatDate(s.createdAt))}</span>
          </p>
          <p class="notes-preview">${escapeHtml(s.notesPreview)}${s.notesPreview.length >= 200 ? '…' : ''}</p>
        </div>
        <div class="history-actions">
          <a class="small-btn" href="generated.html?id=${s.id}">View</a>
          <button type="button" class="small-btn danger delete-btn" aria-label="Delete ${escapeHtml(s.title)}">Delete</button>
        </div>
      </li>`
    )
    .join('');
}

async function deleteSubmission(item) {
  const title = item.querySelector('h3').textContent;
  if (!confirm(`Delete "${title}" and its questions? This can't be undone.`)) return;

  const button = item.querySelector('.delete-btn');
  button.disabled = true;
  button.textContent = 'Deleting…';

  try {
    await apiRequest(`/api/submissions/${item.dataset.id}`, { method: 'DELETE' });
    item.classList.add('removing');
    setTimeout(loadHistory, 300); // let the fade-out animation finish
    showMessage(els.message, 'success', `Deleted "${title}".`);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Delete';
    showMessage(els.message, 'error', `Couldn’t delete "${title}". ${error.message}`);
  }
}

// ---------- Events ----------

els.list.addEventListener('click', (event) => {
  const btn = event.target.closest('.delete-btn');
  if (btn) deleteSubmission(btn.closest('.history-item'));
});

// Debounce typing so we don't hit the API on every keystroke
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadHistory, 300);
});

els.subject.addEventListener('change', loadHistory);
document.getElementById('filters').addEventListener('submit', (e) => {
  e.preventDefault();
  loadHistory();
});

loadHistory();
