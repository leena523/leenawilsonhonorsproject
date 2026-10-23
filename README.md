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

## How to Use

### 1. Install the tools
- **Node.js 22.13 or newer**: download the LTS version from https://nodejs.org. Check your version with `node -v`.
- **Git** (optional, for cloning): https://git-scm.com

### 2. Download the project
```bash
git clone https://github.com/leena523/leenawilsonhonorsproject.git
cd leenawilsonhonorsproject
```
Or click the green **Code** button on GitHub → **Download ZIP**, unzip it, and open the folder in VS Code.

### 3. Install dependencies
In a terminal opened in the project folder:
```bash
npm install
```

### 4. Add your own Groq API key (free)
This app does not include an API key. Each user needs their own.

1. Create a free account at https://console.groq.com and go to **API Keys** → **Create API Key**. Copy the key.
2. Make a copy of `.env.example` and name it `.env` (in the same folder).
3. Open `.env` and paste your key after the equals sign, with no spaces or quotes:
```
   GROQ_API_KEY=gsk_your_key_here
```
4. Save the file. `.env` is listed in `.gitignore`, so your key is never uploaded to GitHub.

**No key?** Skip this step. The app runs in **mock mode** and builds simple practice questions from your notes, so you can still try everything.

### 5. Start the app
```bash
npm start
```
Then open **http://localhost:3000** in your browser. Don't open the HTML files directly or use Live Server, because the pages need the server running.

The terminal shows which mode you're in:
- `AI: Groq (openai/gpt-oss-20b)` means real AI is connected.
- `AI: mock mode` means no key was found.

To stop the server, press **Ctrl+C** in the terminal. If you change `.env`, stop the server and run `npm start` again.
