# AI Practice Question Generator

A full-stack web app that turns class notes into practice questions. Students paste or upload notes from any course, choose a question type, and the app uses **Groq** (server-side) to generate multiple-choice, short-answer, or conceptual questions. Every submission and its questions are saved in a **SQLite** database so students can build a study archive.

## Milestones
M1 – Pages: Home, Upload Notes, Generated Questions, History, Error page 
M2 – Forms & interactivity: Upload form (title, subject, question type, number of questions, notes); 
Client-side validation with inline error messages, live character/word counter, focus on first invalid field 
Event handling: clickable multiple-choice answers with instant feedback and score, show/hide model answers, reveal all, reset, print, history search (debounced) + subject filter + delete 
Mock responses: with no API key the server returns mock questions built from the notes, so the whole flow can be demoed | `server/ai.js` (`buildMockQuestions`) |
M3 – Backend & AI: Express REST API; Groq called only from the server, so the API key never reaches the browser; server-side validation; JSON response parsing and clean-up 
M4 – Database & errors: SQLite persistence (`submissions` + `questions` tables); automatic redirect to the error page when the AI is rate-limited, unavailable, misconfigured, or returns bad output; retry countdown; draft notes saved so nothing is lost; reusable message component; 404 page; per-user request limiter 