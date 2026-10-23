// Upload Notes page: form handling, client-side validation, file upload,
// and sending the notes to the API.

const LIMITS = { titleMin: 3, titleMax: 100, notesMin: 100, notesMax: 15000, minWords: 20, maxFileBytes: 1024 * 1024 };
const DRAFT_KEY = 'notesDraft';

const SAMPLE_NOTES = {
  title: 'Cellular Respiration – Lecture 7',
  subject: 'Biology',
  notes: `Cellular respiration is the process cells use to convert glucose into usable energy in the form of ATP.
It happens in three main stages: glycolysis, the Krebs cycle (citric acid cycle), and the electron transport chain.
Glycolysis takes place in the cytoplasm and splits one glucose molecule into two pyruvate molecules, producing a net gain of 2 ATP and 2 NADH.
Glycolysis does not require oxygen, so it is considered anaerobic.
The Krebs cycle occurs in the mitochondrial matrix. Each turn produces NADH, FADH2, a small amount of ATP, and releases carbon dioxide as a waste product.
The electron transport chain is located in the inner mitochondrial membrane. NADH and FADH2 donate electrons, which power proton pumps that create a gradient.
ATP synthase uses this proton gradient to make most of the cell's ATP through a process called oxidative phosphorylation.
Oxygen is the final electron acceptor in the chain and combines with hydrogen to form water.
Without oxygen, cells rely on fermentation, which regenerates NAD+ but produces far less ATP than aerobic respiration.`,
};

const form = document.getElementById('notes-form');
const fields = {
  title: document.getElementById('title'),
  subject: document.getElementById('subject'),
  numQuestions: document.getElementById('numQuestions'),
  notes: document.getElementById('notes'),
};
const counter = document.getElementById('notes-counter');
const rangeValue = document.getElementById('numQuestions-value');
const generateBtn = document.getElementById('generate-btn');
const formMessage = document.getElementById('form-message');
const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');

// Fields the user has interacted with (so we don't show errors before they type)
const touched = new Set();

// ---------- Validation ----------

function getFormData() {
  return {
    title: fields.title.value.trim(),
    subject: fields.subject.value,
    questionType: form.querySelector('input[name="questionType"]:checked')?.value || '',
    numQuestions: Number(fields.numQuestions.value),
    notes: fields.notes.value.trim(),
  };
}

/** Returns an object of { fieldName: errorMessage } for anything invalid. */
function validate(data) {
  const errors = {};

  if (!data.title) errors.title = 'Give your notes a title.';
  else if (data.title.length < LIMITS.titleMin) errors.title = `Title must be at least ${LIMITS.titleMin} characters.`;
  else if (data.title.length > LIMITS.titleMax) errors.title = `Title must be ${LIMITS.titleMax} characters or fewer.`;

  if (!data.subject) errors.subject = 'Choose a subject.';

  if (!data.questionType) errors.questionType = 'Choose a question type.';

  if (!Number.isInteger(data.numQuestions) || data.numQuestions < 1 || data.numQuestions > 10) {
    errors.numQuestions = 'Choose between 1 and 10 questions.';
  }

  const words = countWords(data.notes);
  if (!data.notes) errors.notes = 'Paste or upload your notes.';
  else if (data.notes.length < LIMITS.notesMin) {
    errors.notes = `Notes are too short — add at least ${LIMITS.notesMin - data.notes.length} more characters so the AI has enough to work with.`;
  } else if (data.notes.length > LIMITS.notesMax) {
    errors.notes = `Notes are too long — remove ${(data.notes.length - LIMITS.notesMax).toLocaleString()} characters (max ${LIMITS.notesMax.toLocaleString()}).`;
  } else if (words < LIMITS.minWords) {
    errors.notes = `Notes need at least ${LIMITS.minWords} words.`;
  }

  return errors;
}

/** Shows/hides error text under each field. Only shows errors for touched fields unless showAll. */
function renderErrors(errors, { showAll = false } = {}) {
  ['title', 'subject', 'questionType', 'numQuestions', 'notes'].forEach((name) => {
    const errorEl = document.getElementById(`${name}-error`);
    const message = showAll || touched.has(name) ? errors[name] : '';
    errorEl.textContent = message || '';

    const input = fields[name];
    if (input) {
      input.classList.toggle('invalid', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  });
}

function countWords(text) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function updateCounter() {
  const length = fields.notes.value.trim().length;
  const words = countWords(fields.notes.value);
  counter.textContent = `${length.toLocaleString()} / ${LIMITS.notesMax.toLocaleString()} characters · ${words} words`;
  counter.classList.toggle('over', length > LIMITS.notesMax);
  counter.classList.toggle('ok', length >= LIMITS.notesMin && length <= LIMITS.notesMax);
}

// ---------- Draft saving (so notes survive an error page round-trip) ----------

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(getFormData()));
  } catch {
    /* storage unavailable — not critical */
  }
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!draft) return;
    fields.title.value = draft.title || '';
    fields.subject.value = draft.subject || '';
    fields.notes.value = draft.notes || '';
    if (draft.numQuestions) fields.numQuestions.value = draft.numQuestions;
    const radio = form.querySelector(`input[name="questionType"][value="${draft.questionType}"]`);
    if (radio) radio.checked = true;
  } catch {
    /* ignore bad draft */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- File upload ----------

function loadFile(file) {
  if (!file) return;

  const isText = /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/');
  if (!isText) {
    showMessage(formMessage, 'error', `"${file.name}" isn't a text file. Upload a .txt or .md file, or paste your notes.`);
    return;
  }
  if (file.size > LIMITS.maxFileBytes) {
    showMessage(formMessage, 'error', `"${file.name}" is larger than 1 MB. Try splitting it into smaller sections.`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    fields.notes.value = String(reader.result);
    if (!fields.title.value.trim()) fields.title.value = file.name.replace(/\.(txt|md)$/i, '').slice(0, LIMITS.titleMax);
    touched.add('notes');
    onInput();
    showMessage(formMessage, 'success', `Loaded "${file.name}".`);
  };
  reader.onerror = () => showMessage(formMessage, 'error', 'Could not read that file. Try pasting the notes instead.');
  reader.readAsText(file);
}

// ---------- Submit ----------

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.classList.toggle('loading', isLoading);
  generateBtn.querySelector('.btn-label').textContent = isLoading ? 'Generating questions…' : 'Generate Questions';
  form.setAttribute('aria-busy', String(isLoading));
}

async function handleSubmit(event) {
  event.preventDefault();
  formMessage.innerHTML = '';

  const data = getFormData();
  const errors = validate(data);
  renderErrors(errors, { showAll: true });

  if (Object.keys(errors).length) {
    // Move focus to the first problem so keyboard/screen reader users find it
    const first = ['title', 'subject', 'questionType', 'numQuestions', 'notes'].find((f) => errors[f]);
    (fields[first] || form.querySelector('input[name="questionType"]')).focus();
    showMessage(formMessage, 'error', 'Please fix the highlighted fields before generating questions.');
    return;
  }

  setLoading(true);
  saveDraft();

  try {
    const { submission } = await apiRequest('/api/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    clearDraft();
    window.location.href = `generated.html?id=${submission.id}`;
  } catch (error) {
    setLoading(false);
    if (error.code === 'VALIDATION_ERROR' && error.fields) {
      renderErrors(error.fields, { showAll: true });
      showMessage(formMessage, 'error', error.message);
    } else if (error.code === 'TOO_MANY_REQUESTS') {
      // Our own server's limiter — a short inline message is enough
      showMessage(formMessage, 'error', `${error.message} Try again in ${error.retryAfter} seconds.`);
    } else if (isServiceError(error)) {
      goToErrorPage(error);
    } else {
      showMessage(formMessage, 'error', error.message);
    }
  }
}

// ---------- Event listeners ----------

function onInput() {
  updateCounter();
  const errors = validate(getFormData());
  renderErrors(errors);
  // Once everything is valid, the "please fix" banner no longer applies
  if (!Object.keys(errors).length && formMessage.querySelector('.message-error')) formMessage.innerHTML = '';
  saveDraft();
}

form.addEventListener('submit', handleSubmit);
form.addEventListener('input', onInput);
form.addEventListener('change', onInput);

// Mark a field as touched when the user leaves it, then show its error
['title', 'subject', 'notes'].forEach((name) => {
  fields[name].addEventListener('blur', () => {
    touched.add(name);
    renderErrors(validate(getFormData()));
  });
});

fields.numQuestions.addEventListener('input', () => {
  rangeValue.textContent = fields.numQuestions.value;
});

fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0]);
  fileInput.value = ''; // allow re-uploading the same file
});

// Drag and drop onto the textarea
['dragenter', 'dragover'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  })
);
['dragleave', 'drop'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  })
);
dropzone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

document.getElementById('sample-btn').addEventListener('click', () => {
  fields.title.value = SAMPLE_NOTES.title;
  fields.subject.value = SAMPLE_NOTES.subject;
  fields.notes.value = SAMPLE_NOTES.notes;
  ['title', 'subject', 'notes'].forEach((f) => touched.add(f));
  onInput();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (fields.notes.value.trim() && !confirm('Clear your notes and title?')) return;
  form.reset();
  rangeValue.textContent = fields.numQuestions.value;
  touched.clear();
  formMessage.innerHTML = '';
  clearDraft();
  onInput();
  fields.title.focus();
});

// Ctrl/Cmd + Enter submits from the textarea
fields.notes.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
});

// ---------- Init ----------
restoreDraft();
rangeValue.textContent = fields.numQuestions.value;
updateCounter();
