# AGENTS.md — Pocket Tutor (`micro-learning`)
## 1. Project Overview
**Pocket Tutor** is a mobile-first, zero-build Progressive Web App (PWA) for personalized micro-learning. It runs 100% client-side on the user's phone via GitHub Pages (`[https://eitama.github.io/micro-learning/](https://eitama.github.io/micro-learning/)`) using a Bring-Your-Own-Key (BYOK) Gemini API architecture.
The user interacts with the app on mobile to learn complex topics through bite-sized cards ("puzzle pieces"), interactive live voice tutoring, on-demand deep dives, and proactive foundational concept recommendations.
---
## 2. Core Product Requirements
1. **Authoritative Research First (Official Sources Priority)**
   - The user describes a topic and what they want to learn.
   - The research agent uses **Google Search Grounding (`google_search`)** to learn the topic, strictly prioritizing official documentation, primary specifications, RFCs, academic papers, and maintainer guides over generic SEO blogs.
2. **Micro-Learning "Puzzle Pieces"**
   - Instructional material is decomposed into 5–7 small, digestible cards ("puzzle pieces") per course.
   - Each piece explains a single concept clearly and concisely without overwhelming detail, accompanied by a one-sentence mental model (`key_takeaway`) and backing source attribution.
3. **Dual-Agent Voice + Backing Research Loop**
   - Supports natural AI speech output and interactive voice/text Q&A.
   - **Agent 2 (Voice Presenter)** is backed by **Agent 1 (Research & Curriculum Architect)**.
   - The two agents communicate via tool calling (`ask_research_agent`): if the Voice Agent needs deeper technical context, concrete examples, or verification to answer a user question, it queries the Research Agent mid-session, receives the grounded answer, and speaks it naturally to the user.
4. **100% Mobile Client-Side Execution (BYOK)**
   - Runs entirely in the mobile browser / installed PWA with zero backend server.
   - The user's Gemini API key is stored strictly in on-device `localStorage`.
   - All generated courses, source registries, Q&A history, and learner narratives are persisted locally on the phone (`localStorage` / `IndexedDB`) with JSON Export/Import support.
5. **"Tell Me More" Deep-Dive Button**
   - Every puzzle piece card includes a **"Tell Me More"** button (plus an optional text input for specific questions about that piece).
   - Triggering it asks Agent 1 to expand that specific puzzle piece into 2–3 deeper, technical sub-pieces rendered directly inside the card.
6. **Persistent Source Ledger & Lookup Guidance**
   - Whenever Agent 1 researches a topic, it stores a structured ledger of **which sources/articles were used**, **why each source was judged useful/authoritative**, and **lookup guidance** detailing what sub-topics or edge cases that page covers.
   - When the user or Voice Agent asks a follow-up question later, Agent 1 inspects this ledger first so it knows where to look.
7. **Behind-the-Scenes Learner Narrative & "Out-of-Scope" Fundamental Bridges**
   - The app records a chronological **Q&A History** (user questions + concise summaries of answers).
   - Behind the scenes, Agent 1 maintains an evolving **Learner Narrative** modeling what the user is ultimately trying to master and how their questions connect.
   - Using this narrative, Agent 1 proactively suggests **"Fundamental Bridges"**—concepts that initially appear out of scope, but are actually foundational prerequisites for what the user is trying to learn. Users can either inject a bridge as a puzzle piece into the current course or launch a dedicated course on it.
---
## 3. Multi-Agent Architecture & Models

| Role | Target Model | Responsibilities & API Capabilities |
| :--- | :--- | :--- |
| **Agent 1: Curriculum, Research & Narrative Brain** | `gemini-3.8-flash` (with `thinkingLevel: "high"`) | Executes grounded research (`tools: [{ google_search: {} }]`), curates the Source Decision Ledger, outputs structured JSON puzzle pieces, generates "Tell Me More" deep dives, updates the Learner Narrative, and answers `ask_research_agent` tool queries from Agent 2. |
| **Agent 2: Live Voice Tutor** | `gemini-3.8-live` | Connects via the Gemini Live API bidirectional WebSocket (`BidiGenerateContent`), streams 24kHz PCM audio output, accepts 16kHz PCM microphone input (barge-in) or text prompts, and invokes the `ask_research_agent` function tool when deeper knowledge is needed. |

> **Note on Model IDs & Fallbacks:** Model IDs are configurable in the UI Settings modal (`PT38_RESEARCH_MODEL`, `PT38_THINKING_LEVEL`, `PT38_LIVE_MODEL`). If an API endpoint rejects `thinkingConfig` or a preview model string, requests should gracefully retry or surface a clear diagnostic error in the UI.
---
## 4. On-Device Data Schema (`localStorage` / `IndexedDB`)
All application state is persisted locally under `PT38_VAULT_MIRROR` (and/or IndexedDB `PocketTutorVaultDB`):
```json
{
  "apiKey": "AIzaSy...",
  "researchModel": "gemini-3.8-flash",
  "thinkingLevel": "high",
  "liveModel": "gemini-3.8-live",
  "voiceName": "Aoede",
  "activeCourseIndex": 0,
  "courses": [
    {
      "id": "course_1729...",
      "topic": "Original user prompt",
      "title": "Course Title",
      "researchDecision": "Why specific official docs were prioritized and what was ignored.",
      "sourceRegistry": [
        {
          "title": "Official Specification / Doc Title",
          "url": "https://...",
          "why_useful": "Why Agent 1 trusted and selected this source",
          "lookup_guidance": "Which specific edge cases or deeper mechanics this URL covers for future follow-ups"
        }
      ],
      "pieces": [
        {
          "id": "piece_1",
          "title": "Puzzle Piece Title",
          "summary": "2-3 concise paragraphs explaining this piece of the puzzle.",
          "key_takeaway": "One-sentence core mental model.",
          "backing_source": "Name of official doc backing this piece",
          "deepDives": [
            {
              "title": "Sub-piece Title",
              "detail": "In-depth technical explanation",
              "source_used": "Source reference"
            }
          ],
          "agentComms": [
            {
              "voiceQuestion": "Question asked by Agent 2 (Voice) to Agent 1 (Research)",
              "researchAnswer": "Authoritative response returned by Agent 1",
              "sourceConsulted": "Source used"
            }
          ]
        }
      ]
    }
  ],
  "qaHistory": [
    {
      "timestamp": "10:15 AM",
      "courseTitle": "Course Title",
      "pieceTitle": "Puzzle Piece Title",
      "question": "User or Voice Agent question",
      "shortAnswer": "1-2 sentence summary of the answer"
    }
  ],
  "learnerNarrative": {
    "summary": "Behind-the-scenes synthesis of what the user is trying to learn, their mental model, and current trajectory.",
    "inferredGoals": ["Goal 1", "Goal 2"],
    "lastUpdated": "Timestamp"
  },
  "fundamentalSuggestions": [
    {
      "id": "bridge_1",
      "courseTitle": "Associated Course",
      "title": "Foundational Concept Title",
      "whySeeminglyOutOfScope": "Why a learner wouldn't initially think to study this",
      "whyActuallyFundamental": "Why mastering this unlocks deep intuition for their actual goal"
    }
  ]
}
```
---
## 5. Architectural & Mobile Constraints
1. **Zero-Build Static Hosting:**
   - Hosted directly from the `main` branch root on GitHub Pages (`index.html` or clean ES modules without requiring a local Node/npm build step on the user's phone).
   - Keep external dependencies minimal (e.g., Tailwind CDN or lightweight vanilla CSS) so the app loads fast on mobile networks.
2. **Mobile Debugging & Resilience:**
   - Because the user tests and operates the app directly on a mobile phone (and inside an installed PWA standalone window without DevTools), **all runtime and network errors must be caught and displayed in an on-screen error banner** (`window.onerror` and `window.onunhandledrejection`).
   - Avoid aggressive Service Worker caching that traps broken builds on the phone; always provide an accessible hard-reload / cache-clear action in the top header.
3. **Gemini API Integration Details:**
   - **Grounding + JSON:** When combining `tools: [{ google_search: {} }]` with structured output requirements, parse JSON resiliently (strip markdown fences, locate outer `{...}` braces) because grounded responses may include conversational preambles or `groundingMetadata` chunks.
   - **WebSocket Audio (`BidiGenerateContent`):**
     - Wait for the server's `setupComplete` frame before sending `clientContent` turns.
     - Decode incoming `inlineData` 24kHz 16-bit mono little-endian PCM chunks and schedule them gaplessly via the Web Audio API (`AudioContext`).
     - Ensure `AudioContext.resume()` is triggered directly inside a user gesture (`click`/`touchend`) to satisfy mobile browser autoplay restrictions (iOS Safari / Android Chrome).
     - Handle `toolCall.functionCalls` (`ask_research_agent`) asynchronously and return `toolResponse.functionResponses` over the open WebSocket.
---
## 6. Current Status & Immediate Tasks for the Next Agent
1. **Audit & Fix `index.html` UI Interactivity:**
   - The initial deployment to `[https://eitama.github.io/micro-learning/](https://eitama.github.io/micro-learning/)` had an unresponsive **Config** button (likely caused by mobile clipboard truncation during paste, DOM/script ordering, or a syntax error halting script parse).
   - Inspect the committed `index.html` in the repository, verify there are no truncated lines or syntax errors, and ensure the Config modal opens reliably on mobile tap.
2. **Verify Model Endpoints & Fallbacks:**
   - Test the `generateContent` call with the configured reasoning model (`gemini-3.8-flash` with `thinkingLevel: "high"`) and `BidiGenerateContent` with `gemini-3.8-live`.
   - Ensure the "⚡ Test API Key" button in the Config modal reports exact HTTP/API errors if a model name or parameter needs adjustment for the user's API key tier.
3. **Modularize Only If Beneficial (Without Breaking Zero-Build):**
   - If keeping everything in a single `index.html` file makes edits error-prone, you may split the JavaScript into clean native ES module files (e.g., `app.js`, `agents.js`, `live-audio.js`, `storage.js`) imported via `<script type="module" src="./app.js"></script>`—as long as it works natively on GitHub Pages with zero build step.