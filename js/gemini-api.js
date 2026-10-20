/**
 * Pocket Tutor 3.8 - Agent 1: Research & Curriculum Brain
 * Implements grounded research (Google Search), authoritative source filtering,
 * structured puzzle piece generation, deep dives, learner narrative, and gap bridges.
 */

export class GeminiAgent1 {
  constructor(getSettingsFn) {
    this.getSettings = getSettingsFn;
  }

  /**
   * Safe JSON extractor from model output that may contain markdown or search chatter
   */
  extractJson(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Empty response from model');
    }

    // Try finding ```json ... ``` block
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch (e) {
        // Fall through to brace search
      }
    }

    // Search for outermost { ... }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (e) {
        // Fall through
      }
    }

    // Search for outermost [ ... ]
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const candidate = text.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(candidate);
      } catch (e) {
        // Fall through
      }
    }

    throw new Error(`Unable to parse structured JSON from model output. Output preview: ${text.slice(0, 200)}...`);
  }

  /**
   * Low-level caller to Gemini REST API with automatic thinkingConfig fallback
   */
  async callGenerateContent({ prompt, systemInstruction, enableSearch = true, overrideModel = null }) {
    const settings = this.getSettings();
    if (!settings.apiKey) {
      throw new Error('Gemini API Key missing. Please click Config in the top bar to set your key.');
    }

    const model = overrideModel || settings.researchModel || 'gemini-3.8-flash';
    const apiBase = (typeof window !== 'undefined' && window.__GEMINI_API_BASE__) || settings.apiBaseUrl || 'https://generativelanguage.googleapis.com';
    const baseUrl = `${apiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;

    const makePayload = (withThinking = true) => {
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.6
        }
      };

      if (withThinking && settings.thinkingLevel && settings.thinkingLevel !== 'none') {
        payload.generationConfig.thinkingConfig = {
          thinkingLevel: settings.thinkingLevel
        };
      }

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      if (enableSearch) {
        // v1beta Google Search Grounding tool
        payload.tools = [
          { googleSearch: {} }
        ];
      }

      return payload;
    };

    // First attempt (with thinkingConfig if configured)
    let res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makePayload(true))
    });

    // If 400 or parameter error related to thinkingConfig, retry without it
    if (!res.ok) {
      const errText = await res.text();
      const needsThinkingFallback = errText.includes('thinkingConfig') || errText.includes('thinking_config') || errText.includes('Invalid JSON payload');
      
      if (needsThinkingFallback) {
        console.warn('Retrying Gemini call without thinkingConfig...');
        res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(makePayload(false))
        });
      }

      if (!res.ok) {
        const finalErr = await res.text();
        let message = `Gemini API Error (HTTP ${res.status}): `;
        try {
          const parsed = JSON.parse(finalErr);
          message += parsed.error?.message || finalErr;
        } catch {
          message += finalErr;
        }
        throw new Error(message);
      }
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.length) {
      throw new Error('No candidate content returned by Gemini API.');
    }

    // Accumulate all text parts
    const textOutput = candidate.content.parts
      .map(p => p.text || '')
      .join('\n')
      .trim();

    return {
      text: textOutput,
      groundingMetadata: candidate.groundingMetadata || null
    };
  }

  /**
   * Diagnostic API Key & Model ping
   */
  async testConnection() {
    const settings = this.getSettings();
    if (!settings.apiKey) {
      return { ok: false, message: 'Please enter an API Key before testing.' };
    }

    try {
      const res = await this.callGenerateContent({
        prompt: 'Hello! Respond with a one-sentence confirmation that the connection is working.',
        enableSearch: false
      });
      return {
        ok: true,
        message: `Success! Model "${settings.researchModel}" responded:\n"${res.text.slice(0, 120)}..."`
      };
    } catch (e) {
      return {
        ok: false,
        message: e.message
      };
    }
  }

  /**
   * 1. Authoritative Research & Micro-Learning Curriculum Generation
   */
  async generateCourse(userTopic) {
    const systemInstruction = `You are Agent 1 (Research & Curriculum Architect) for Pocket Tutor 3.8.
Your mission is to guide learners through complex technical or conceptual topics using authoritative primary sources.
STRICT SOURCES MANDATE:
- Prioritize official specifications, RFCs, primary documentation, academic papers, and maintainer guides.
- Explicitly avoid generic SEO marketing blogs and superficial tutorials.
- Deconstruct the topic into exactly 5 to 7 bite-sized "puzzle pieces".
- Each puzzle piece must explain a single concept clearly and concisely without overwhelming detail, accompanied by a one-sentence mental model (key_takeaway) and backing source attribution.
- Return ONLY valid JSON wrapped in a \`\`\`json block.`;

    const prompt = `Research and build a personalized micro-learning course for the following topic:
"${userTopic}"

Requirements:
1. Conduct grounded research using official docs and specifications.
2. In your "researchDecision", explain why you prioritized specific authoritative sources and what common misconceptions or low-quality blog simplifications you discarded.
3. In "sourceRegistry", list the primary URLs/docs you used, why each was chosen, and lookup guidance on what specific mechanics or edge cases each covers.
4. In "pieces", create 5 to 7 sequential, bite-sized puzzle pieces explaining the core mental models.

Output format (MUST be strictly valid JSON in \`\`\`json):
{
  "title": "Clear, engaging Course Title",
  "researchDecision": "Detailed 1-2 paragraph rationale of source prioritization.",
  "sourceRegistry": [
    {
      "title": "Title of Official Doc / RFC / Spec",
      "url": "https://...",
      "why_useful": "Why this primary source is trusted and relevant",
      "lookup_guidance": "Specific edge cases or mechanics this document covers for future queries"
    }
  ],
  "pieces": [
    {
      "id": "piece_1",
      "title": "Piece 1 Title",
      "summary": "2 to 3 concise, clear paragraphs explaining this piece of the puzzle.",
      "key_takeaway": "Single sentence core mental model.",
      "backing_source": "Name of official spec or primary doc"
    }
  ]
}`;

    const res = await this.callGenerateContent({
      prompt,
      systemInstruction,
      enableSearch: true
    });

    const parsed = this.extractJson(res.text);

    return {
      id: `course_${Date.now()}`,
      topic: userTopic,
      title: parsed.title || 'Micro-Learning Course',
      researchDecision: parsed.researchDecision || 'Prioritized primary specifications and official documentation.',
      sourceRegistry: Array.isArray(parsed.sourceRegistry) ? parsed.sourceRegistry : [],
      pieces: (parsed.pieces || []).map((p, idx) => ({
        id: p.id || `piece_${idx + 1}`,
        title: p.title || `Concept ${idx + 1}`,
        summary: p.summary || '',
        key_takeaway: p.key_takeaway || '',
        backing_source: p.backing_source || 'Primary Documentation',
        deepDives: [],
        agentComms: []
      }))
    };
  }

  /**
   * 2. "Tell Me More" Deep-Dive Expansion
   */
  async generateDeepDive({ courseTitle, pieceTitle, pieceSummary, backingSource, userQuestion = '' }) {
    const prompt = `You are Agent 1 (Research & Curriculum Architect). The user is reading a puzzle piece and requested a deeper technical dive.

Course: ${courseTitle}
Piece: ${pieceTitle}
Current Summary: ${pieceSummary}
Backing Source: ${backingSource}
${userQuestion ? `Specific User Question: "${userQuestion}"` : 'User clicked "Tell Me More" for deeper mechanics.'}

Generate 2 to 3 deeper, technical sub-pieces breaking down the precise underlying mechanics, protocols, or edge cases.
Cite authoritative primary sources.

Return ONLY valid JSON in \`\`\`json:
[
  {
    "title": "Sub-piece Title",
    "detail": "In-depth technical explanation of the mechanism (2 concise paragraphs).",
    "source_used": "Official doc or spec reference"
  }
]`;

    const res = await this.callGenerateContent({
      prompt,
      enableSearch: true
    });

    const parsed = this.extractJson(res.text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  /**
   * 3. Answering Agent 2 (Live Voice) query via tool calling
   */
  async answerLiveAgentQuery({ question, context, activeCourse }) {
    let sourceRegistrySummary = '';
    if (activeCourse?.sourceRegistry?.length) {
      sourceRegistrySummary = 'Available Source Registry Ledger:\n' +
        activeCourse.sourceRegistry.map(s => `- ${s.title} (${s.url}): ${s.lookup_guidance}`).join('\n');
    }

    const prompt = `You are Agent 1 (Research Brain). Agent 2 (Live Voice Presenter) has paused mid-session to consult you for authoritative technical verification.

Context: ${context || 'Learning Session'}
Question from Voice Agent / User: "${question}"
${sourceRegistrySummary}

Instructions:
- Provide an authoritative, grounded answer based on official specifications and the source ledger.
- Format the answer in 2-3 spoken sentences so Agent 2 can speak it directly and naturally to the user.
- Explicitly state the primary source consulted.

Return valid JSON in \`\`\`json:
{
  "answer": "Concise, grounded 2-3 sentence answer ready to be spoken aloud.",
  "source": "Name of official documentation or specification"
}`;

    const res = await this.callGenerateContent({
      prompt,
      enableSearch: true
    });

    return this.extractJson(res.text);
  }

  /**
   * 4. Learner Narrative & "Out-of-Scope" Fundamental Bridges
   */
  async analyzeGapsAndBridges({ courses, qaHistory, existingNarrative }) {
    const courseTitles = courses.map(c => `"${c.title}" (${c.topic})`).join(', ') || 'None';
    const recentQa = qaHistory.slice(0, 10).map(q => `Q: ${q.question} -> A: ${q.shortAnswer}`).join('\n') || 'None recorded yet.';

    const prompt = `You are Agent 1 (Narrative Brain & Curriculum Architect).
Analyze the learner's journey based on their courses and Q&A history to update their Learner Narrative and identify "Fundamental Bridges".

Courses Explored:
${courseTitles}

Recent Q&A History:
${recentQa}

Previous Learner Narrative:
${existingNarrative?.summary || 'None'}

TASKS:
1. Update the behind-the-scenes "learnerNarrative" modeling what the user is ultimately trying to master and what their mental model looks like.
2. Proactively identify 2 to 3 "Fundamental Bridges"—concepts that initially appear OUT OF SCOPE or counter-intuitive for someone asking these questions, but are actually foundational prerequisites that unlock deep intuitive understanding.

Return valid JSON in \`\`\`json:
{
  "narrative": {
    "summary": "2-3 sentences synthesizing the learner's trajectory and latent mental model.",
    "inferredGoals": ["Primary goal 1", "Latent goal 2"]
  },
  "bridges": [
    {
      "id": "bridge_${Date.now()}_1",
      "courseTitle": "Associated Course",
      "title": "Foundational Concept Title",
      "whySeeminglyOutOfScope": "Why a learner wouldn't initially think to study this or might consider it irrelevant",
      "whyActuallyFundamental": "Why mastering this low-level or adjacent primitive actually unlocks deep intuition"
    }
  ]
}`;

    const res = await this.callGenerateContent({
      prompt,
      enableSearch: false
    });

    return this.extractJson(res.text);
  }
}
