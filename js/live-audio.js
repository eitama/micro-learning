/**
 * Pocket Tutor 3.8 - Agent 2: Live Voice Presenter
 * Manages Gemini Live WebSocket (BidiGenerateContent), Web Audio API (16kHz in, 24kHz out),
 * live microphone streaming, gapless PCM scheduling, barge-in, and tool calling to Agent 1.
 */

export class LiveVoiceSession {
  constructor({ getSettings, onStatusChange, onTranscript, onAgentComm, onResearchQuery }) {
    this.getSettings = getSettings;
    this.onStatusChange = onStatusChange || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onAgentComm = onAgentComm || (() => {});
    this.onResearchQuery = onResearchQuery || (async () => ({ answer: '', source: '' }));

    this.ws = null;
    this.isConnected = false;
    this.isMuted = false;
    this.activeCourse = null;
    this.activePiece = null;

    // Web Audio instances
    this.audioCtx = null;
    this.mediaStream = null;
    this.micSourceNode = null;
    this.processorNode = null;
    this.nextAudioStartTime = 0;
    this.activeAudioSources = [];
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: 24000 });
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  async start({ course, piece }) {
    this.activeCourse = course;
    this.activePiece = piece;

    const settings = this.getSettings();
    if (!settings.apiKey) {
      throw new Error('Gemini API key is required to start Live Voice session.');
    }

    this.initAudioContext();
    this.onStatusChange('connecting', 'Connecting to Gemini Live...');

    const liveModel = settings.liveModel || 'gemini-3.8-live';
    const wsBase = (typeof window !== 'undefined' && window.__GEMINI_LIVE_WS__) || settings.wsBaseUrl || 'wss://generativelanguage.googleapis.com';
    const wsUrl = `${wsBase}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(settings.apiKey)}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        this.onStatusChange('error', `WebSocket creation failed: ${err.message}`);
        return reject(err);
      }

      this.ws.onopen = () => {
        this.onStatusChange('setup', 'Negotiating session & dual-agent tools...');
        this.sendInitialSetup();
      };

      this.ws.onmessage = async (event) => {
        try {
          let messageData = event.data;
          if (messageData instanceof Blob) {
            messageData = await messageData.text();
          }
          const msg = JSON.parse(messageData);
          await this.handleServerMessage(msg);
        } catch (e) {
          console.error('Error handling WebSocket message:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('Gemini Live WebSocket error:', e);
        this.onStatusChange('error', 'Live connection error. Check API key and model access.');
      };

      this.ws.onclose = (e) => {
        this.cleanup();
        this.onStatusChange('closed', 'Voice session ended.');
      };

      // Resolve once connected
      const checkSetup = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkSetup);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        if (!this.isConnected) {
          clearInterval(checkSetup);
          reject(new Error('Connection timed out waiting for setupComplete. Verify your Gemini Live model name in Config.'));
        }
      }, 15000);
    });
  }

  sendInitialSetup() {
    const settings = this.getSettings();
    const liveModel = settings.liveModel || 'gemini-3.8-live';
    const voiceName = settings.voiceName || 'Aoede';

    const systemPrompt = `You are Agent 2 (Live Voice Presenter) for Pocket Tutor 3.8.
Your role: Present micro-learning puzzle pieces in warm, engaging, and spoken-conversational style.
Current Course: "${this.activeCourse?.title || 'General Knowledge'}"
Current Piece: "${this.activePiece?.title || 'Overview'}"
Piece Summary: "${this.activePiece?.summary || ''}"
Key Takeaway: "${this.activePiece?.key_takeaway || ''}"
Backing Official Doc: "${this.activePiece?.backing_source || 'Official specs'}"

CRITICAL INSTRUCTIONS:
1. Speak concisely in short spoken sentences. Do not read entire walls of text. Introduce the puzzle piece clearly.
2. If the user asks a technical question requiring verification, deeper mechanics, or citations, invoke the \`ask_research_agent\` tool to consult Agent 1 (Research Brain).
3. Once Agent 1 returns the grounded facts, weave the answer into your conversational speech naturally.`;

    const setupPayload = {
      setup: {
        model: `models/${liveModel}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'ask_research_agent',
                description: 'Consult Agent 1 (Research Brain) when you need authoritative official documentation details, deep technical mechanics, or verification of facts.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    question: {
                      type: 'STRING',
                      description: 'The specific technical question or topic to research'
                    },
                    context: {
                      type: 'STRING',
                      description: 'Context about what the user asked and what concept is being taught'
                    }
                  },
                  required: ['question']
                }
              }
            ]
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(setupPayload));
  }

  async handleServerMessage(msg) {
    if (msg.setupComplete) {
      this.isConnected = true;
      this.onStatusChange('active', 'Live session active. Presenting puzzle piece...');
      // Start microphone stream
      await this.startMicrophone();
      // Prompt Agent 2 to introduce current piece
      this.sendInitialPrompt();
      return;
    }

    // 1. Tool Call from Agent 2 requesting Agent 1 research
    if (msg.toolCall?.functionCalls?.length) {
      for (const call of msg.toolCall.functionCalls) {
        if (call.name === 'ask_research_agent') {
          await this.handleAskResearchAgentTool(call);
        }
      }
      return;
    }

    // 2. Server Content (Audio / Text)
    if (msg.serverContent) {
      const parts = msg.serverContent.modelTurn?.parts || [];

      for (const part of parts) {
        // Text transcript
        if (part.text) {
          this.onTranscript(part.text);
        }

        // Inline PCM 24kHz audio
        if (part.inlineData?.data) {
          this.playPcmAudioChunk(part.inlineData.data);
        }
      }

      if (msg.serverContent.interrupted) {
        // User barge-in! Stop active audio playback immediately
        this.stopAudioPlayback();
        this.onStatusChange('listening', 'Listening to you...');
      }

      if (msg.serverContent.turnComplete) {
        this.onStatusChange('listening', 'Listening...');
      }
    }
  }

  sendInitialPrompt() {
    const text = `Hi! Please introduce the current puzzle piece ("${this.activePiece?.title || this.activeCourse?.title}") to me in 2-3 warm, conversational sentences and ask if I'd like to dive into the core takeaway or ask a question.`;
    this.sendTextMessage(text);
  }

  async handleAskResearchAgentTool(call) {
    const question = call.args?.question || '';
    const context = call.args?.context || this.activePiece?.title || '';

    this.onStatusChange('researching', `Agent 1 Research Brain consulting official docs...`);
    this.onTranscript(`[Consulting Agent 1 Research Brain: "${question}"]`);

    try {
      const result = await this.onResearchQuery({
        question,
        context,
        activeCourse: this.activeCourse,
        activePiece: this.activePiece
      });

      this.onAgentComm({
        voiceQuestion: question,
        researchAnswer: result.answer,
        sourceConsulted: result.source
      });

      // Send tool response back to WebSocket
      const responsePayload = {
        toolResponse: {
          functionResponses: [
            {
              id: call.id,
              response: {
                output: {
                  answer: result.answer,
                  source: result.source
                }
              }
            }
          ]
        }
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(responsePayload));
      }
      this.onStatusChange('speaking', 'Agent 2 speaking grounded answer...');
    } catch (e) {
      console.error('Failed to get answer from Agent 1:', e);
      const fallbackResponse = {
        toolResponse: {
          functionResponses: [
            {
              id: call.id,
              response: {
                output: {
                  answer: 'Unable to reach official sources at this exact moment, but proceeding based on course context.',
                  source: 'Internal Context'
                }
              }
            }
          ]
        }
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(fallbackResponse));
      }
    }
  }

  sendTextMessage(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        turnComplete: true
      }
    };
    this.ws.send(JSON.stringify(payload));
    this.onStatusChange('speaking', 'Agent 2 thinking & speaking...');
  }

  async startMicrophone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      const audioCtxInput = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      this.micSourceNode = audioCtxInput.createMediaStreamSource(this.mediaStream);

      // Buffer size 4096 gives ~256ms audio chunks
      this.processorNode = audioCtxInput.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (this.isMuted || !this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to 16-bit PCM Int16Array
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const base64Pcm = this.arrayBufferToBase64(pcm16.buffer);

        const realTimePayload = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Pcm
              }
            ]
          }
        };

        this.ws.send(JSON.stringify(realTimePayload));
      };

      this.micSourceNode.connect(this.processorNode);
      this.processorNode.connect(audioCtxInput.destination);
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err);
      this.onTranscript('[Microphone unavailable. You can type directly into the session below.]');
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  playPcmAudioChunk(base64Data) {
    if (!this.audioCtx) this.initAudioContext();
    this.onStatusChange('speaking', 'Agent 2 speaking...');

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    const currentTime = this.audioCtx.currentTime;
    if (this.nextAudioStartTime < currentTime) {
      this.nextAudioStartTime = currentTime;
    }

    source.start(this.nextAudioStartTime);
    this.nextAudioStartTime += audioBuffer.duration;
    this.activeAudioSources.push(source);

    source.onended = () => {
      const idx = this.activeAudioSources.indexOf(source);
      if (idx !== -1) this.activeAudioSources.splice(idx, 1);
    };
  }

  stopAudioPlayback() {
    for (const src of this.activeAudioSources) {
      try { src.stop(); } catch (e) {}
    }
    this.activeAudioSources = [];
    if (this.audioCtx) {
      this.nextAudioStartTime = this.audioCtx.currentTime;
    }
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  cleanup() {
    this.isConnected = false;
    this.stopAudioPlayback();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }

  stop() {
    this.cleanup();
    this.onStatusChange('closed', 'Session stopped.');
  }
}
