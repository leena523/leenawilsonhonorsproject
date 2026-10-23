// Error page: explains what went wrong based on ?code=... in the URL.

const ERROR_MESSAGES = {
  RATE_LIMITED: {
    icon: '⏳',
    title: 'Too Many Requests',
    text: 'The AI service is rate-limited right now — it has received more requests than it can handle for the moment.',
    tip: 'This usually clears up within a minute. Wait for the timer, then try again.',
  },
  AI_UNAVAILABLE: {
    icon: '☁',
    title: 'AI Service Unavailable',
    text: 'We couldn’t reach the AI service, or it took too long to respond.',
    tip: 'The service may be down briefly. Try again in a few minutes.',
  },
  AI_CONFIG: {
    icon: '⚙',
    title: 'AI Service Not Configured',
    text: 'The server could not sign in to the AI service. The API key may be missing, invalid, or the model may no longer exist.',
    tip: 'If you run this app: check GROQ_API_KEY and GROQ_MODEL in your .env file, then restart the server.',
  },
  AI_BAD_RESPONSE: {
    icon: '?',
    title: 'Unexpected AI Response',
    text: 'The AI replied, but not in a format we could turn into questions.',
    tip: 'Trying again usually works. Clear, well-organized notes help too.',
  },
  NETWORK_ERROR: {
    icon: '⚡',
    title: 'Can’t Reach the Server',
    text: 'Your browser couldn’t connect to the app’s server.',
    tip: 'Check your internet connection. If you’re running it locally, make sure `npm start` is running.',
  },
  NOT_FOUND: {
    icon: '404',
    title: 'Page Not Found',
    text: 'The page you’re looking for doesn’t exist.',
    tip: 'Use the menu on the left to get back on track.',
  },
  SERVER_ERROR: {
    icon: '!',
    title: 'Something Went Wrong',
    text: 'An unexpected error happened on the server.',
    tip: 'Please try again. If it keeps happening, check the server logs.',
  },
};

const params = new URLSearchParams(window.location.search);
// If the server sent this page for an unknown URL there's no ?code, so treat it as 404
const isUnknownPage = !/\/error(\.html)?$/.test(window.location.pathname);
const code = params.get('code') || (isUnknownPage ? 'NOT_FOUND' : 'SERVER_ERROR');
const info = ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR;

document.title = `${info.title} – AI Practice Question Generator`;
document.getElementById('error-icon').textContent = info.icon;
document.getElementById('error-title').textContent = info.title;
document.getElementById('error-text').textContent = info.text;
document.getElementById('error-tip').textContent = info.tip;
document.getElementById('error-code').textContent = `Error code: ${code}`;

// Only mention the saved draft when the user was actually generating questions
if (!params.get('code') || code === 'NOT_FOUND') {
  document.querySelector('.saved-note').hidden = true;
}

// Countdown before retrying when rate-limited
const retryBtn = document.getElementById('retry-btn');
const countdownEl = document.getElementById('countdown');
let secondsLeft = Math.min(Number(params.get('retry')) || 0, 300);

if (secondsLeft > 0) {
  retryBtn.classList.add('disabled');
  retryBtn.setAttribute('aria-disabled', 'true');
  countdownEl.hidden = false;

  const tick = () => {
    if (secondsLeft <= 0) {
      clearInterval(timer);
      countdownEl.textContent = 'You can try again now.';
      retryBtn.classList.remove('disabled');
      retryBtn.removeAttribute('aria-disabled');
      return;
    }
    countdownEl.textContent = `You can try again in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}…`;
    secondsLeft--;
  };
  const timer = setInterval(tick, 1000);
  tick();

  retryBtn.addEventListener('click', (e) => {
    if (retryBtn.classList.contains('disabled')) e.preventDefault();
  });
}
