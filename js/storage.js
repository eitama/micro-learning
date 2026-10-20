/**
 * Pocket Tutor 3.8 - Storage & Vault Manager
 * Handles local persistence across localStorage and IndexedDB with JSON Export/Import.
 */

const STORAGE_KEYS = {
  VAULT: 'PT38_VAULT_MIRROR',
  API_KEY: 'PT38_API_KEY',
  RESEARCH_MODEL: 'PT38_RESEARCH_MODEL',
  THINKING_LEVEL: 'PT38_THINKING_LEVEL',
  LIVE_MODEL: 'PT38_LIVE_MODEL',
  VOICE_NAME: 'PT38_VOICE_NAME'
};

const DEFAULT_STATE = {
  apiKey: '',
  researchModel: 'gemini-3.5-flash',
  thinkingLevel: 'high',
  liveModel: 'gemini-3.8-live',
  voiceName: 'Aoede',
  activeCourseIndex: 0,
  courses: [],
  qaHistory: [],
  learnerNarrative: {
    summary: 'New learner profile. Start exploring concepts to build your foundational intuition map.',
    inferredGoals: [],
    lastUpdated: new Date().toISOString()
  },
  fundamentalSuggestions: []
};

class VaultStorage {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.VAULT);
      let loaded = raw ? JSON.parse(raw) : {};

      // Migrate / fallback to individual keys if present
      const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || loaded.apiKey || '';
      const researchModel = localStorage.getItem(STORAGE_KEYS.RESEARCH_MODEL) || loaded.researchModel || DEFAULT_STATE.researchModel;
      const thinkingLevel = localStorage.getItem(STORAGE_KEYS.THINKING_LEVEL) || loaded.thinkingLevel || DEFAULT_STATE.thinkingLevel;
      const liveModel = localStorage.getItem(STORAGE_KEYS.LIVE_MODEL) || loaded.liveModel || DEFAULT_STATE.liveModel;
      const voiceName = localStorage.getItem(STORAGE_KEYS.VOICE_NAME) || loaded.voiceName || DEFAULT_STATE.voiceName;

      return {
        ...DEFAULT_STATE,
        ...loaded,
        apiKey,
        researchModel,
        thinkingLevel,
        liveModel,
        voiceName,
        courses: Array.isArray(loaded.courses) ? [...loaded.courses] : [],
        qaHistory: Array.isArray(loaded.qaHistory) ? [...loaded.qaHistory] : [],
        learnerNarrative: loaded.learnerNarrative ? { ...loaded.learnerNarrative } : { ...DEFAULT_STATE.learnerNarrative },
        fundamentalSuggestions: Array.isArray(loaded.fundamentalSuggestions) ? [...loaded.fundamentalSuggestions] : []
      };
    } catch (e) {
      console.error('Failed to parse vault state from localStorage, using defaults:', e);
      return { ...DEFAULT_STATE };
    }
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.VAULT, JSON.stringify(this.state));
      localStorage.setItem(STORAGE_KEYS.API_KEY, this.state.apiKey || '');
      localStorage.setItem(STORAGE_KEYS.RESEARCH_MODEL, this.state.researchModel);
      localStorage.setItem(STORAGE_KEYS.THINKING_LEVEL, this.state.thinkingLevel);
      localStorage.setItem(STORAGE_KEYS.LIVE_MODEL, this.state.liveModel);
      localStorage.setItem(STORAGE_KEYS.VOICE_NAME, this.state.voiceName);
    } catch (e) {
      console.error('Failed to write vault state to localStorage:', e);
    }
  }

  getState() {
    return this.state;
  }

  getSettings() {
    return {
      apiKey: this.state.apiKey,
      researchModel: this.state.researchModel,
      thinkingLevel: this.state.thinkingLevel,
      liveModel: this.state.liveModel,
      voiceName: this.state.voiceName
    };
  }

  saveSettings({ apiKey, researchModel, thinkingLevel, liveModel, voiceName }) {
    if (apiKey !== undefined) this.state.apiKey = apiKey.trim();
    if (researchModel) this.state.researchModel = researchModel.trim();
    if (thinkingLevel) this.state.thinkingLevel = thinkingLevel;
    if (liveModel) this.state.liveModel = liveModel.trim();
    if (voiceName) this.state.voiceName = voiceName;
    this.persist();
  }

  getActiveCourse() {
    if (!this.state.courses.length) return null;
    const index = Math.min(Math.max(0, this.state.activeCourseIndex), this.state.courses.length - 1);
    return this.state.courses[index] || null;
  }

  setActiveCourseIndex(index) {
    if (index >= 0 && index < this.state.courses.length) {
      this.state.activeCourseIndex = index;
      this.persist();
    }
  }

  addCourse(course) {
    this.state.courses.unshift(course);
    this.state.activeCourseIndex = 0;
    this.persist();
  }

  deleteActiveCourse() {
    if (!this.state.courses.length) return;
    this.state.courses.splice(this.state.activeCourseIndex, 1);
    if (this.state.activeCourseIndex >= this.state.courses.length) {
      this.state.activeCourseIndex = Math.max(0, this.state.courses.length - 1);
    }
    this.persist();
  }

  addDeepDive(courseId, pieceId, deepDive) {
    const course = this.state.courses.find(c => c.id === courseId);
    if (!course) return;
    const piece = course.pieces.find(p => p.id === pieceId);
    if (!piece) return;
    if (!Array.isArray(piece.deepDives)) piece.deepDives = [];
    piece.deepDives.push(deepDive);
    this.persist();
  }

  addAgentComm(courseId, pieceId, comm) {
    const course = this.state.courses.find(c => c.id === courseId);
    if (!course) return;
    const piece = course.pieces.find(p => p.id === pieceId);
    if (!piece) return;
    if (!Array.isArray(piece.agentComms)) piece.agentComms = [];
    piece.agentComms.push(comm);
    this.persist();
  }

  addQaEntry(entry) {
    this.state.qaHistory.unshift({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...entry
    });
    // Keep max 50 entries
    if (this.state.qaHistory.length > 50) {
      this.state.qaHistory = this.state.qaHistory.slice(0, 50);
    }
    this.persist();
  }

  updateLearnerNarrative(narrative) {
    this.state.learnerNarrative = {
      ...this.state.learnerNarrative,
      ...narrative,
      lastUpdated: new Date().toISOString()
    };
    this.persist();
  }

  setFundamentalSuggestions(suggestions) {
    this.state.fundamentalSuggestions = Array.isArray(suggestions) ? suggestions : [];
    this.persist();
  }

  injectBridgeIntoCourse(bridgeId, targetCourseId) {
    const bridge = this.state.fundamentalSuggestions.find(b => b.id === bridgeId);
    if (!bridge) return null;
    const course = this.state.courses.find(c => c.id === targetCourseId) || this.getActiveCourse();
    if (!course) return null;

    const newPiece = {
      id: `piece_bridge_${Date.now()}`,
      title: `[Foundational Bridge] ${bridge.title}`,
      summary: `Why it feels out of scope: ${bridge.whySeeminglyOutOfScope}\n\nWhy it is actually fundamental: ${bridge.whyActuallyFundamental}`,
      key_takeaway: `Mastering ${bridge.title} unlocks intuitive understanding for your learning goals.`,
      backing_source: "Agent 1 Curriculum Synthesis",
      deepDives: [],
      agentComms: []
    };

    course.pieces.push(newPiece);
    // Remove injected bridge from suggestions
    this.state.fundamentalSuggestions = this.state.fundamentalSuggestions.filter(b => b.id !== bridgeId);
    this.persist();
    return newPiece;
  }

  exportJson() {
    return JSON.stringify(this.state, null, 2);
  }

  importJson(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON format');

      this.state = {
        ...DEFAULT_STATE,
        ...parsed,
        apiKey: parsed.apiKey || this.state.apiKey,
        courses: Array.isArray(parsed.courses) ? parsed.courses : [],
        qaHistory: Array.isArray(parsed.qaHistory) ? parsed.qaHistory : [],
        learnerNarrative: parsed.learnerNarrative || DEFAULT_STATE.learnerNarrative,
        fundamentalSuggestions: Array.isArray(parsed.fundamentalSuggestions) ? parsed.fundamentalSuggestions : []
      };
      this.persist();
      return true;
    } catch (e) {
      console.error('Failed to import JSON:', e);
      throw e;
    }
  }

  clearAll() {
    const keepKey = this.state.apiKey;
    this.state = {
      ...DEFAULT_STATE,
      courses: [],
      qaHistory: [],
      learnerNarrative: { ...DEFAULT_STATE.learnerNarrative },
      fundamentalSuggestions: [],
      apiKey: keepKey
    };
    this.persist();
  }
}

export const vault = new VaultStorage();
