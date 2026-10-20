/**
 * Pocket Tutor 3.8 - Main Application Coordinator
 * Zero-build ES module coordinator linking UI, Vault Storage, Agent 1 (Research Brain),
 * and Agent 2 (Live Voice Presenter).
 */

import { vault } from './storage.js';
import { GeminiAgent1 } from './gemini-api.js';
import { LiveVoiceSession } from './live-audio.js';

// Instantiate Agent 1
const agent1 = new GeminiAgent1(() => vault.getSettings());

// Active Voice Session instance
let liveSession = null;
let currentTab = 'learn';

// ==========================================
// 1. Mobile Error & Diagnostic Handling
// ==========================================
window.addEventListener('error', (event) => {
  showGlobalError(`Runtime Error: ${event.message}\nAt: ${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || event.reason || 'Unknown promise error';
  showGlobalError(`Unhandled Rejection: ${reason}`);
});

function showGlobalError(msg) {
  console.error('[PocketTutor Error]', msg);
  const errorBox = document.getElementById('errorBox');
  if (errorBox) {
    errorBox.textContent = `⚠️ ${msg}`;
    errorBox.classList.remove('hidden');
  }
}

function clearGlobalError() {
  const errorBox = document.getElementById('errorBox');
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }
}

function showStatus(text) {
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');
  if (statusBox && statusText) {
    statusText.textContent = text;
    statusBox.classList.remove('hidden');
  }
}

function hideStatus() {
  const statusBox = document.getElementById('statusBox');
  if (statusBox) {
    statusBox.classList.add('hidden');
  }
}

// ==========================================
// 2. Settings & API Key Modal
// ==========================================
export function toggleSettings(forceOpen = null) {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  const isHidden = modal.style.display === 'none' || modal.classList.contains('hidden');
  const shouldOpen = forceOpen !== null ? forceOpen : isHidden;

  if (shouldOpen) {
    const s = vault.getSettings();
    document.getElementById('apiKeyInput').value = s.apiKey || '';
    document.getElementById('researchModelInput').value = s.researchModel;
    document.getElementById('thinkingLevelSelect').value = s.thinkingLevel;
    document.getElementById('liveModelInput').value = s.liveModel;
    document.getElementById('voiceNameSelect').value = s.voiceName;

    const testPingStatus = document.getElementById('testPingStatus');
    if (testPingStatus) {
      testPingStatus.classList.add('hidden');
      testPingStatus.textContent = '';
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
  } else {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}

export function saveSettings() {
  const apiKey = document.getElementById('apiKeyInput').value;
  const researchModel = document.getElementById('researchModelInput').value;
  const thinkingLevel = document.getElementById('thinkingLevelSelect').value;
  const liveModel = document.getElementById('liveModelInput').value;
  const voiceName = document.getElementById('voiceNameSelect').value;

  vault.saveSettings({
    apiKey,
    researchModel,
    thinkingLevel,
    liveModel,
    voiceName
  });

  updateKeyStatusDot();
  toggleSettings(false);
  clearGlobalError();
}

export async function testApiConnection() {
  const testBox = document.getElementById('testPingStatus');
  if (!testBox) return;

  const tempKey = document.getElementById('apiKeyInput').value;
  const tempModel = document.getElementById('researchModelInput').value;
  const tempLevel = document.getElementById('thinkingLevelSelect').value;

  vault.saveSettings({
    apiKey: tempKey,
    researchModel: tempModel,
    thinkingLevel: tempLevel
  });
  updateKeyStatusDot();

  testBox.classList.remove('hidden');
  testBox.className = 'text-xs p-2.5 rounded-xl border bg-slate-800 text-indigo-200 border-indigo-500/50';
  testBox.textContent = 'Testing connection with Gemini 3.8 Flash...';

  const res = await agent1.testConnection();
  if (res.ok) {
    testBox.className = 'text-xs p-2.5 rounded-xl border bg-emerald-950/70 border-emerald-600 text-emerald-200';
    testBox.textContent = res.message;
  } else {
    testBox.className = 'text-xs p-2.5 rounded-xl border bg-red-950/80 border-red-700 text-red-200';
    testBox.textContent = `❌ ${res.message}`;
  }
}

function updateKeyStatusDot() {
  const dot = document.getElementById('keyStatusDot');
  if (!dot) return;
  const { apiKey } = vault.getSettings();
  if (apiKey && apiKey.length > 10) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-red-500 animate-pulse';
  }
}

// ==========================================
// 3. Tab Routing
// ==========================================
export function switchTab(tabName) {
  currentTab = tabName;
  ['learn', 'bridges', 'vault'].forEach(t => {
    const section = document.getElementById(`tab_${t}`);
    const btn = document.getElementById(`tabBtn_${t}`);
    if (section) {
      if (t === tabName) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabName) {
        btn.className = 'py-2 rounded-lg bg-indigo-600 text-white font-bold transition shadow';
      } else {
        btn.className = 'py-2 rounded-lg text-slate-400 hover:text-white transition font-medium';
      }
    }
  });

  if (tabName === 'bridges') {
    renderBridgesTab();
  } else if (tabName === 'vault') {
    renderVaultTab();
  }
}

// ==========================================
// 4. Course Generation & Learn Tab
// ==========================================
export async function generateCurriculum() {
  clearGlobalError();
  const input = document.getElementById('topicInput');
  const topic = input?.value.trim();

  if (!topic) {
    showGlobalError('Please enter a topic or learning goal first.');
    return;
  }

  const { apiKey } = vault.getSettings();
  if (!apiKey) {
    toggleSettings(true);
    showGlobalError('Please enter your Gemini API key in Config to begin.');
    return;
  }

  const btn = document.getElementById('generateBtn');
  if (btn) btn.disabled = true;
  showStatus('Agent 1 (Reasoning Brain) conducting grounded research via Google Search...');

  try {
    const newCourse = await agent1.generateCourse(topic);
    vault.addCourse(newCourse);
    if (input) input.value = '';
    renderLearnTab();

    // In background, update learner narrative and bridge opportunities
    triggerBackgroundNarrativeUpdate();
  } catch (err) {
    showGlobalError(err.message);
  } finally {
    hideStatus();
    if (btn) btn.disabled = false;
  }
}

export function selectCourse(index) {
  vault.setActiveCourseIndex(index);
  renderLearnTab();
}

export function deleteActiveCourse() {
  const active = vault.getActiveCourse();
  if (!active) return;
  if (confirm(`Delete course "${active.title}"?`)) {
    vault.deleteActiveCourse();
    renderLearnTab();
  }
}

function renderLearnTab() {
  const state = vault.getState();
  const activeCourse = vault.getActiveCourse();

  // History / Course switcher pills
  const historyBar = document.getElementById('historyBar');
  if (historyBar) {
    if (state.courses.length > 1) {
      historyBar.classList.remove('hidden');
      historyBar.innerHTML = state.courses.map((c, idx) => {
        const isActive = idx === state.activeCourseIndex;
        return `
          <button onclick="window.selectCourse(${idx})" class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 ${
            isActive
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }">
            ${escapeHtml(c.title || `Course ${idx + 1}`)}
          </button>
        `;
      }).join('');
    } else {
      historyBar.classList.add('hidden');
    }
  }

  // Active Course Header
  const courseHeader = document.getElementById('courseHeader');
  const courseTitle = document.getElementById('courseTitle');
  const courseStrategy = document.getElementById('courseStrategy');
  const cardsContainer = document.getElementById('cardsContainer');

  if (!activeCourse) {
    if (courseHeader) courseHeader.classList.add('hidden');
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="text-center py-12 px-4 space-y-3">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-2xl">
            🧩
          </div>
          <h3 class="font-bold text-sm text-slate-200">No Active Course Yet</h3>
          <p class="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Enter a topic above (e.g. <i>"Rust Borrow Checker"</i>, <i>"WebAudio PCM AudioContext"</i>, or <i>"TCP Sliding Window"</i>). Agent 1 will research primary specs and construct bite-sized puzzle pieces.
          </p>
        </div>
      `;
    }
    return;
  }

  if (courseHeader) {
    courseHeader.classList.remove('hidden');
    courseTitle.textContent = activeCourse.title;
    courseStrategy.textContent = `📋 Official Sources Strategy: ${activeCourse.researchDecision}`;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = (activeCourse.pieces || []).map((piece, pIdx) => {
      const deepDivesHtml = (piece.deepDives || []).map(dd => `
        <div class="mt-2.5 p-3 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-indigo-300">🔍 ${escapeHtml(dd.title)}</span>
            <span class="text-[10px] text-slate-500 font-mono">${escapeHtml(dd.source_used || 'Doc')}</span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(dd.detail)}</p>
        </div>
      `).join('');

      const agentCommsHtml = (piece.agentComms || []).map(ac => `
        <div class="mt-2 p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-700/40 text-xs space-y-1">
          <div class="text-[10px] font-semibold text-emerald-400">🎙️ Live Voice Asked Agent 1:</div>
          <div class="italic text-slate-300">"${escapeHtml(ac.voiceQuestion)}"</div>
          <div class="text-slate-200 mt-1"><span class="text-indigo-400 font-semibold">Agent 1:</span> ${escapeHtml(ac.researchAnswer)}</div>
          <div class="text-[9px] text-slate-500 mt-0.5 font-mono">Source: ${escapeHtml(ac.sourceConsulted || 'Official')}</div>
        </div>
      `).join('');

      return `
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden" id="card_${piece.id}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-xs font-bold text-indigo-300">
                ${pIdx + 1}
              </span>
              <h3 class="text-sm font-bold text-white">${escapeHtml(piece.title)}</h3>
            </div>
            <button onclick="window.startLiveForPiece('${piece.id}')"
              class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 active:scale-95 shrink-0">
              <span>🎙️ Voice Tutor</span>
            </button>
          </div>

          <!-- Summary paragraphs -->
          <div class="text-xs text-slate-300 leading-relaxed space-y-2 whitespace-pre-wrap">
            ${escapeHtml(piece.summary)}
          </div>

          <!-- Core Mental Model / Key Takeaway -->
          ${piece.key_takeaway ? `
            <div class="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-start gap-2">
              <span class="text-sm">💡</span>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Core Mental Model</span>
                <p class="text-xs font-medium text-indigo-100">${escapeHtml(piece.key_takeaway)}</p>
              </div>
            </div>
          ` : ''}

          <!-- Backing Source Attribution -->
          <div class="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
            <span class="truncate">📖 Backed by: <span class="text-slate-400 font-mono">${escapeHtml(piece.backing_source || 'Official Specs')}</span></span>
          </div>

          <!-- Deep Dives Container -->
          ${deepDivesHtml ? `<div class="space-y-1.5">${deepDivesHtml}</div>` : ''}

          <!-- Agent Comms Container -->
          ${agentCommsHtml ? `<div class="space-y-1">${agentCommsHtml}</div>` : ''}

          <!-- Tell Me More Expansion -->
          <div class="pt-1 flex flex-col gap-2">
            <div class="flex gap-2">
              <button onclick="window.requestDeepDive('${piece.id}')"
                id="btn_dive_${piece.id}"
                class="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] border border-slate-700 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1 transition">
                <span>➕ Tell Me More (Deep Dive)</span>
              </button>
              <button onclick="window.toggleQuestionInput('${piece.id}')"
                class="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs">
                💬
              </button>
            </div>

            <!-- Optional specific question input -->
            <div id="q_input_box_${piece.id}" class="hidden flex gap-1.5">
              <input id="custom_q_${piece.id}" type="text" placeholder="Ask a specific technical question about this piece..."
                class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                onkeydown="if(event.key==='Enter') window.requestDeepDive('${piece.id}')" />
              <button onclick="window.requestDeepDive('${piece.id}')"
                class="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold">
                Ask
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

export function toggleQuestionInput(pieceId) {
  const box = document.getElementById(`q_input_box_${pieceId}`);
  if (box) {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      const input = document.getElementById(`custom_q_${pieceId}`);
      if (input) input.focus();
    }
  }
}

export async function requestDeepDive(pieceId) {
  clearGlobalError();
  const activeCourse = vault.getActiveCourse();
  if (!activeCourse) return;
  const piece = activeCourse.pieces.find(p => p.id === pieceId);
  if (!piece) return;

  const customQInput = document.getElementById(`custom_q_${pieceId}`);
  const userQuestion = customQInput ? customQInput.value.trim() : '';

  const btn = document.getElementById(`btn_dive_${pieceId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin mr-1">↻</span> Agent 1 Diving Deeper...`;
  }
  showStatus(`Agent 1 researching deeper mechanics for "${piece.title}"...`);

  try {
    const subPieces = await agent1.generateDeepDive({
      courseTitle: activeCourse.title,
      pieceTitle: piece.title,
      pieceSummary: piece.summary,
      backingSource: piece.backing_source,
      userQuestion
    });

    for (const sp of subPieces) {
      vault.addDeepDive(activeCourse.id, piece.id, sp);
    }

    if (userQuestion) {
      vault.addQaEntry({
        courseTitle: activeCourse.title,
        pieceTitle: piece.title,
        question: userQuestion,
        shortAnswer: subPieces[0]?.detail?.slice(0, 160) + '...'
      });
      if (customQInput) customQInput.value = '';
    }

    renderLearnTab();
    triggerBackgroundNarrativeUpdate();
  } catch (err) {
    showGlobalError(`Deep dive failed: ${err.message}`);
  } finally {
    hideStatus();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>➕ Tell Me More (Deep Dive)</span>`;
    }
  }
}

// ==========================================
// 5. Fundamentals Tab ("Out of Scope" Bridges)
// ==========================================
export async function refreshNarrativeAndSuggestions() {
  clearGlobalError();
  const state = vault.getState();
  if (!state.courses.length && !state.qaHistory.length) {
    showGlobalError('Create at least one course or ask a question first to generate gap insights.');
    return;
  }

  showStatus('Agent 1 analyzing learner narrative & detecting foundational mental bridges...');

  try {
    const analysis = await agent1.analyzeGapsAndBridges({
      courses: state.courses,
      qaHistory: state.qaHistory,
      existingNarrative: state.learnerNarrative
    });

    if (analysis.narrative) {
      vault.updateLearnerNarrative(analysis.narrative);
    }
    if (analysis.bridges) {
      vault.setFundamentalSuggestions(analysis.bridges);
    }

    renderBridgesTab();
  } catch (err) {
    showGlobalError(`Gap analysis error: ${err.message}`);
  } finally {
    hideStatus();
  }
}

function renderBridgesTab() {
  const state = vault.getState();
  const badge = document.getElementById('bridgeBadge');
  if (badge) {
    if (state.fundamentalSuggestions.length > 0) {
      badge.textContent = state.fundamentalSuggestions.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  const bridgesList = document.getElementById('bridgesList');
  if (!bridgesList) return;

  if (!state.fundamentalSuggestions.length) {
    bridgesList.innerHTML = `
      <div class="text-center py-10 px-4 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-950/60 border border-amber-800 flex items-center justify-center text-2xl">
          💡
        </div>
        <h4 class="font-bold text-sm text-slate-200">No Bridges Suggested Yet</h4>
        <p class="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          Tap <b>"Analyze My Gaps"</b> above. Agent 1 will review your learning trajectory and detect counter-intuitive fundamental concepts that unlock deep intuition.
        </p>
      </div>
    `;
    return;
  }

  bridgesList.innerHTML = state.fundamentalSuggestions.map(bridge => `
    <div class="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 shadow-xl space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Foundational Bridge</span>
          <h4 class="text-sm font-bold text-white">${escapeHtml(bridge.title)}</h4>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
          ${escapeHtml(bridge.courseTitle || 'Prerequisite')}
        </span>
      </div>

      <div class="space-y-2 text-xs">
        <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <span class="text-[10px] font-bold text-slate-400 block mb-0.5">Why it feels out-of-scope:</span>
          <p class="text-slate-300">${escapeHtml(bridge.whySeeminglyOutOfScope)}</p>
        </div>

        <div class="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/50">
          <span class="text-[10px] font-bold text-amber-300 block mb-0.5">Why it is actually fundamental:</span>
          <p class="text-amber-100 font-medium">${escapeHtml(bridge.whyActuallyFundamental)}</p>
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <button onclick="window.injectBridge('${bridge.id}')"
          class="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-[0.99] transition">
          ➕ Inject as Puzzle Piece
        </button>
        <button onclick="window.launchBridgeCourse('${escapeHtml(bridge.title)}')"
          class="flex-1 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold active:scale-[0.99] transition">
          🚀 Build Dedicated Course
        </button>
      </div>
    </div>
  `).join('');
}

export function injectBridge(bridgeId) {
  const activeCourse = vault.getActiveCourse();
  if (!activeCourse) {
    showGlobalError('Please create or select an active course before injecting a bridge.');
    return;
  }
  const injected = vault.injectBridgeIntoCourse(bridgeId, activeCourse.id);
  if (injected) {
    switchTab('learn');
    renderLearnTab();
  }
}

export function launchBridgeCourse(topic) {
  switchTab('learn');
  const input = document.getElementById('topicInput');
  if (input) input.value = topic;
  generateCurriculum();
}

async function triggerBackgroundNarrativeUpdate() {
  const state = vault.getState();
  if (!state.courses.length) return;
  try {
    const analysis = await agent1.analyzeGapsAndBridges({
      courses: state.courses,
      qaHistory: state.qaHistory,
      existingNarrative: state.learnerNarrative
    });
    if (analysis.narrative) vault.updateLearnerNarrative(analysis.narrative);
    if (analysis.bridges) vault.setFundamentalSuggestions(analysis.bridges);
    renderBridgesTab();
  } catch (e) {
    console.warn('Background narrative update skipped:', e);
  }
}

// ==========================================
// 6. Vault & Brain Tab
// ==========================================
function renderVaultTab() {
  const state = vault.getState();
  const activeCourse = vault.getActiveCourse();

  // 1. Learner Narrative Box
  const narrativeBox = document.getElementById('vaultNarrativeBox');
  if (narrativeBox) {
    const n = state.learnerNarrative;
    const goalsHtml = (n.inferredGoals || []).map(g => `
      <span class="inline-block px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-[10px] text-indigo-300 mr-1.5 mb-1.5">
        🎯 ${escapeHtml(g)}
      </span>
    `).join('');

    narrativeBox.innerHTML = `
      <p class="text-xs text-slate-200 leading-relaxed">${escapeHtml(n.summary)}</p>
      ${goalsHtml ? `<div class="pt-2">${goalsHtml}</div>` : ''}
      <div class="text-[10px] text-slate-500 pt-1">Last modeled: ${new Date(n.lastUpdated).toLocaleTimeString()}</div>
    `;
  }

  // 2. Source Ledger
  const sourceLedger = document.getElementById('vaultSourceLedger');
  if (sourceLedger) {
    const allSources = [];
    state.courses.forEach(c => {
      (c.sourceRegistry || []).forEach(s => {
        allSources.push({ ...s, courseTitle: c.title });
      });
    });

    if (!allSources.length) {
      sourceLedger.innerHTML = `
        <div class="text-xs text-slate-500 py-3 text-center italic">No official sources recorded in ledger yet.</div>
      `;
    } else {
      sourceLedger.innerHTML = allSources.map(s => `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div class="flex items-start justify-between gap-2">
            <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-indigo-400 hover:underline">
              🔗 ${escapeHtml(s.title || s.url)}
            </a>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
              ${escapeHtml(s.courseTitle)}
            </span>
          </div>
          <div class="text-[11px] text-slate-300">
            <span class="text-slate-500 font-semibold">Why Selected:</span> ${escapeHtml(s.why_useful)}
          </div>
          <div class="text-[11px] text-indigo-200/90 bg-indigo-950/30 p-2 rounded-lg border border-indigo-900/40">
            <span class="text-indigo-400 font-semibold">Lookup Guidance:</span> ${escapeHtml(s.lookup_guidance)}
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Q&A History
  const qaHistoryContainer = document.getElementById('vaultQaHistory');
  if (qaHistoryContainer) {
    if (!state.qaHistory.length) {
      qaHistoryContainer.innerHTML = `
        <div class="text-xs text-slate-500 py-3 text-center italic">No Q&A recorded yet. Voice tutoring and deep dives will populate this list.</div>
      `;
    } else {
      qaHistoryContainer.innerHTML = state.qaHistory.map(q => `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
          <div class="flex justify-between items-center text-[10px] text-slate-500">
            <span>${escapeHtml(q.courseTitle || 'General')} • ${escapeHtml(q.pieceTitle || 'Concept')}</span>
            <span>${escapeHtml(q.timestamp)}</span>
          </div>
          <div class="font-semibold text-slate-200">Q: "${escapeHtml(q.question)}"</div>
          <div class="text-slate-400">A: ${escapeHtml(q.shortAnswer)}</div>
        </div>
      `).join('');
    }
  }
}

export function exportVaultData() {
  const json = vault.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pocket_tutor_vault_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importVaultData() {
  const fileInput = document.getElementById('importFileInput');
  if (!fileInput) return;
  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      vault.importJson(text);
      alert('Vault data imported successfully!');
      renderLearnTab();
      renderVaultTab();
      updateKeyStatusDot();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  fileInput.click();
}

export function resetAllData() {
  if (confirm('Are you sure you want to erase all local courses, notes, and history? (API key will be retained)')) {
    vault.clearAll();
    renderLearnTab();
    renderVaultTab();
    renderBridgesTab();
  }
}

// ==========================================
// 7. Live Voice Session (Agent 2)
// ==========================================
export async function startLiveForPiece(pieceId) {
  clearGlobalError();
  const activeCourse = vault.getActiveCourse();
  if (!activeCourse) return;
  const piece = activeCourse.pieces.find(p => p.id === pieceId);
  if (!piece) return;

  const bar = document.getElementById('liveSessionBar');
  const title = document.getElementById('liveBarTitle');
  const status = document.getElementById('liveBarStatus');

  if (bar) bar.style.display = 'block';
  if (title) title.textContent = `Tutor: ${piece.title}`;
  if (status) status.textContent = 'Connecting Live WebSocket...';

  if (liveSession) {
    liveSession.stop();
  }

  liveSession = new LiveVoiceSession({
    getSettings: () => vault.getSettings(),
    onStatusChange: (code, message) => {
      if (status) status.textContent = message;
      const orb = document.getElementById('liveOrb');
      if (orb) {
        if (code === 'active' || code === 'speaking') {
          orb.className = 'w-3 h-3 rounded-full bg-emerald-400 live-pulse shrink-0';
        } else if (code === 'listening') {
          orb.className = 'w-3 h-3 rounded-full bg-indigo-500 live-pulse shrink-0';
        } else if (code === 'researching') {
          orb.className = 'w-3 h-3 rounded-full bg-amber-400 live-pulse shrink-0';
        } else if (code === 'error') {
          orb.className = 'w-3 h-3 rounded-full bg-red-500 shrink-0';
        }
      }
    },
    onTranscript: (text) => {
      const ticker = document.getElementById('liveTicker');
      if (ticker) {
        ticker.textContent = text;
      }
    },
    onAgentComm: (comm) => {
      vault.addAgentComm(activeCourse.id, piece.id, comm);
      vault.addQaEntry({
        courseTitle: activeCourse.title,
        pieceTitle: piece.title,
        question: comm.voiceQuestion,
        shortAnswer: comm.researchAnswer
      });
      renderLearnTab();
    },
    onResearchQuery: async ({ question, context }) => {
      return await agent1.answerLiveAgentQuery({
        question,
        context,
        activeCourse
      });
    }
  });

  try {
    await liveSession.start({ course: activeCourse, piece });
  } catch (err) {
    showGlobalError(`Live Session failed to start: ${err.message}`);
    if (status) status.textContent = `Failed: ${err.message}`;
  }
}

export function stopLiveSession() {
  if (liveSession) {
    liveSession.stop();
    liveSession = null;
  }
  const bar = document.getElementById('liveSessionBar');
  if (bar) bar.style.display = 'none';
}

export function toggleLiveMic() {
  if (!liveSession) return;
  const isMuted = liveSession.toggleMute();
  const btn = document.getElementById('micToggleBtn');
  if (btn) {
    if (isMuted) {
      btn.className = 'px-3 py-1.5 rounded-xl bg-red-950/80 border border-red-700 text-xs font-semibold text-red-200';
      btn.textContent = '🔇 Mic Muted';
    } else {
      btn.className = 'px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200';
      btn.textContent = '🎤 Mic On';
    }
  }
}

export function sendTextToLiveAgent() {
  const input = document.getElementById('liveTextInput');
  if (!input || !liveSession) return;
  const text = input.value.trim();
  if (!text) return;
  liveSession.sendTextMessage(text);
  input.value = '';
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Expose actions to window for inline onclick attributes
window.toggleSettings = toggleSettings;
window.saveSettings = saveSettings;
window.testApiConnection = testApiConnection;
window.switchTab = switchTab;
window.generateCurriculum = generateCurriculum;
window.selectCourse = selectCourse;
window.deleteActiveCourse = deleteActiveCourse;
window.requestDeepDive = requestDeepDive;
window.toggleQuestionInput = toggleQuestionInput;
window.refreshNarrativeAndSuggestions = refreshNarrativeAndSuggestions;
window.injectBridge = injectBridge;
window.launchBridgeCourse = launchBridgeCourse;
window.exportVaultData = exportVaultData;
window.importVaultData = importVaultData;
window.resetAllData = resetAllData;
window.startLiveForPiece = startLiveForPiece;
window.stopLiveSession = stopLiveSession;
window.toggleLiveMic = toggleLiveMic;
window.sendTextToLiveAgent = sendTextToLiveAgent;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  updateKeyStatusDot();
  renderLearnTab();
});
