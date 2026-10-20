# Pocket Tutor 3.8 (`micro-learning`)

> **Mobile-first, zero-build Progressive Web App (PWA) for personalized micro-learning backed by dual-agent Gemini 3.8 Flash & Live.**

Hosted directly on GitHub Pages: **[https://eitama.github.io/micro-learning/](https://eitama.github.io/micro-learning/)**

---

## 🌟 Key Features

1. **Authoritative Research First (Official Specs & RFCs Priority)**
   - Agent 1 conducts grounded research using Google Search Grounding (`googleSearch`), actively prioritizing RFCs, primary documentation, academic papers, and official maintainer guides over generic SEO blogs.
2. **Bite-Sized "Puzzle Pieces"**
   - Each course is deconstructed into 5–7 digestible concepts with a concise summary, backing source attribution, and a one-sentence core mental model (`key_takeaway`).
3. **Dual-Agent Live Voice & Research Bridge**
   - **Agent 2 (Live Voice Tutor)** presents puzzle pieces conversationally via the Gemini Live bidirectional WebSocket (`BidiGenerateContent`) with 24kHz PCM audio playback and barge-in support.
   - When asked a complex technical question or asked for verification, Agent 2 invokes the `ask_research_agent` tool call to consult **Agent 1 (Research Brain)** mid-session, speaks the grounded answer, and records the interaction in the course notes.
4. **"Tell Me More" On-Demand Deep Dives**
   - Every puzzle piece card includes a "Tell Me More" button (and optional question input) that expands the concept into 2–3 deeper technical sub-pieces breaking down underlying mechanics.
5. **Behind-the-Scenes Learner Narrative & "Out-of-Scope" Fundamental Bridges**
   - Agent 1 continuously maintains an evolving mental model of the learner's journey.
   - Proactively identifies counter-intuitive "Fundamental Bridges"—concepts that initially appear out of scope, but are prerequisite mental models unlocking deep intuition. Bridges can be injected into active courses or launched as dedicated courses.
6. **100% Client-Side & Bring-Your-Own-Key (BYOK)**
   - No backend servers, no tracking, zero telemetry.
   - API keys are stored only in the browser's `localStorage`.
   - Full on-device vault persistence with JSON Export and Import support.

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla JavaScript (Native ES Modules), HTML5, Tailwind CSS (CDN).
- **Audio & Realtime:** Web Audio API (16kHz PCM mic input, 24kHz PCM speaker playback), WebSocket (`BidiGenerateContent`).
- **AI Models:**
  - **Agent 1:** `gemini-3.8-flash` (with `thinkingLevel: "high"` and `googleSearch` grounding).
  - **Agent 2:** `gemini-3.8-live` (Live bidirectional voice streaming).
- **Persistence:** LocalStorage (`PT38_VAULT_MIRROR`) with JSON backup/restore.

---

## 🚀 Running Locally

```bash
# Serve static files on port 8080:
npm run serve

# Or using Python:
python -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) on your desktop or mobile browser.

---

## 🧪 Testing

The test suite includes headless Chrome browser tests (Puppeteer) and unit tests verifying the full dual-agent loop against a local mock Gemini REST & WebSocket server without requiring a real API key:

```bash
npm test
```

### Test Coverage:
- **E2E Headless Chrome:**
  - Page load and runtime script error verification.
  - Config modal API key testing and saving.
  - Agent 1 grounded course generation with official source registry.
  - "Tell Me More" deep dive expansion.
  - Gap analysis & fundamental bridge injection.
  - Vault persistent source ledger and JSON export.
  - Live Voice session WebSocket connection, 24kHz PCM scheduling, and `ask_research_agent` tool calling loop.
- **Unit Tests:**
  - `VaultStorage`: State isolation, persistence, bridge injection, and JSON serialization.
  - `GeminiAgent1`: Markdown fence stripping, bracket/brace JSON extraction, and error resiliency.

---

## 📚 Master Knowledge Base

For complete architectural decisions, API contracts, and maintenance runbooks, see [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md) and [AGENTS.md](AGENTS.md).
