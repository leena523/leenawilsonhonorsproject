// Shared helpers used by every page.

/** Highlights the current page in the sidebar using <body data-page="...">. */
function highlightActiveNav() {
  const page = document.body.dataset.page;
  const link = page && document.querySelector(`.nav-item[data-page="${page}"]`);
  if (link) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
}

/** An error returned by our API (or a network failure talking to it). */
class ApiError extends Error {
  constructor(code, message, { status = 0, retryAfter = null, fields = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.fields = fields;
  }
}

/** fetch() wrapper: parses JSON and turns failures into ApiError. */
async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Is it running?');
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    const err = data?.error || {};
    throw new ApiError(err.code || 'SERVER_ERROR', err.message || `Request failed (${response.status}).`, {
      status: response.status,
      retryAfter: err.retryAfter,
      fields: err.fields,
    });
  }
  return data;
}

/** Sends the user to the error page with details about what went wrong. */
function goToErrorPage(error) {
  const params = new URLSearchParams({ code: error.code || 'SERVER_ERROR' });
  if (error.retryAfter) params.set('retry', error.retryAfter);
  window.location.href = `error.html?${params}`;
}

/** Errors that mean "the AI/server is down" and deserve the full error page. */
function isServiceError(error) {
  return ['RATE_LIMITED', 'AI_UNAVAILABLE', 'AI_CONFIG', 'AI_BAD_RESPONSE', 'NETWORK_ERROR', 'SERVER_ERROR'].includes(
    error.code
  );
}

/**
 * Message component: shows a dismissible banner inside `container`.
 * type: 'error' | 'success' | 'info'
 */
function showMessage(container, type, text, { actionLabel, onAction } = {}) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = `message message-${type}`;
  box.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const p = document.createElement('p');
  p.textContent = text;
  box.appendChild(p);

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'small-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    actions.appendChild(btn);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'message-close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.textContent = '×';
  close.addEventListener('click', () => box.remove());
  actions.appendChild(close);
  box.appendChild(actions);

  container.appendChild(box);
}

/** Escapes text before putting it into innerHTML (notes and AI output are untrusted). */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const QUESTION_TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  short_answer: 'Short answer',
  conceptual: 'Conceptual',
  mixed: 'Mixed',
};

/** Shows a small banner on pages when the server is running with mock AI. */
async function showAIModeBadge() {
  const slot = document.getElementById('ai-mode');
  if (!slot) return;
  try {
    const { ai } = await apiRequest('/api/health');
    slot.textContent = ai.mode === 'live' ? `AI: Groq · ${ai.model}` : 'AI: mock mode (no API key set)';
    slot.classList.add(ai.mode === 'live' ? 'live' : 'mock');
  } catch {
    slot.textContent = 'Server offline';
    slot.classList.add('offline');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  highlightActiveNav();
  showAIModeBadge();
});
