/**
 * Mock Gemini Server for Testing
 * Provides mock REST API (generateContent) with Google Search grounding
 * and mock WebSocket (BidiGenerateContent) with dual-agent tool calling.
 * Also serves static workspace files.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml'
};

export function createMockServer(port = 9001) {
  const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    // Mock Gemini generateContent REST endpoint
    if (req.method === 'POST' && url.pathname.includes(':generateContent')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const prompt = payload.contents?.[0]?.parts?.[0]?.text || '';

          // 1. Connection Ping Test
          if (prompt.includes('Respond with a one-sentence confirmation')) {
            const reply = {
              candidates: [
                {
                  content: {
                    parts: [{ text: "Gemini 3.8 Flash connection active and responding normally." }]
                  }
                }
              ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply));
            return;
          }

          // 2. Course Generation
          if (prompt.includes('Research and build a personalized micro-learning course')) {
            const courseJson = {
              title: "TCP Sliding Window & Flow Control",
              researchDecision: "Prioritized RFC 793 (Transmission Control Protocol) and RFC 5681 (TCP Congestion Control) over generic networking blog posts.",
              sourceRegistry: [
                {
                  title: "RFC 793 - Transmission Control Protocol",
                  url: "https://www.rfc-editor.org/rfc/rfc793",
                  why_useful: "Authoritative primary standard specifying the sequence number and receive window (RCV.WND) mechanics.",
                  lookup_guidance: "Section 3.3 for sequence numbers; Section 3.7 for window management."
                },
                {
                  title: "RFC 5681 - TCP Congestion Control",
                  url: "https://www.rfc-editor.org/rfc/rfc5681",
                  why_useful: "Defines congestion window (cwnd), slow start, and fast retransmit specifications.",
                  lookup_guidance: "Window calculation when handling packet drops and ACK bursts."
                }
              ],
              pieces: [
                {
                  id: "piece_1",
                  title: "The Receive Window (rwnd)",
                  summary: "The receive window advertises how many bytes of buffer space the receiver has available before overflowing.",
                  key_takeaway: "The sender can never have more unacknowledged in-flight bytes than the receiver's advertised window.",
                  backing_source: "RFC 793 Specification"
                },
                {
                  id: "piece_2",
                  title: "Sequence Numbers & In-Flight Bytes",
                  summary: "Each byte transmitted has an explicit 32-bit sequence number. The sliding window moves forward as ACKs arrive.",
                  key_takeaway: "Sliding only occurs when the lowest unacknowledged byte is confirmed by an ACK.",
                  backing_source: "RFC 793 Specification"
                },
                {
                  id: "piece_3",
                  title: "The Congestion Window (cwnd)",
                  summary: "While rwnd protects the receiver, cwnd protects the intermediate network routers from bufferbloat.",
                  key_takeaway: "The effective transmission limit is min(rwnd, cwnd).",
                  backing_source: "RFC 5681 Congestion Spec"
                }
              ]
            };

            const reply = {
              candidates: [
                {
                  content: {
                    parts: [{ text: "```json\n" + JSON.stringify(courseJson, null, 2) + "\n```" }]
                  }
                }
              ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply));
            return;
          }

          // 3. Deep Dive
          if (prompt.includes('requested a deeper technical dive')) {
            const deepDiveJson = [
              {
                title: "Window Scale Option (RFC 7323)",
                detail: "In high-bandwidth-delay products, the 16-bit window field is capped at 65,535 bytes. The scale factor shifts the window value up to 1GB.",
                source_used: "RFC 7323 High Performance TCP"
              },
              {
                title: "Zero-Window Probing & Silly Window Syndrome",
                detail: "If rwnd drops to 0, sender stops transmitting and periodically sends 1-byte probe packets until the receiver buffer frees up.",
                source_used: "RFC 793 Window Maintenance"
              }
            ];

            const reply = {
              candidates: [
                {
                  content: {
                    parts: [{ text: "```json\n" + JSON.stringify(deepDiveJson, null, 2) + "\n```" }]
                  }
                }
              ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply));
            return;
          }

          // 4. Live Agent tool calling response
          if (prompt.includes('Agent 2 (Live Voice Presenter) has paused mid-session')) {
            const toolAnswer = {
              answer: "According to RFC 793, the receiver advertises window size in bytes, preventing buffer overrun.",
              source: "RFC 793 Section 3.7"
            };

            const reply = {
              candidates: [
                {
                  content: {
                    parts: [{ text: "```json\n" + JSON.stringify(toolAnswer, null, 2) + "\n```" }]
                  }
                }
              ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply));
            return;
          }

          // 5. Gap Analysis & Fundamental Bridges
          if (prompt.includes('identify "Fundamental Bridges"')) {
            const gapAnalysis = {
              narrative: {
                summary: "Learner is mastering low-level networking primitives, seeking mechanical intuition for flow and congestion control.",
                inferredGoals: ["Systems Programming", "High-Throughput Network Architecture"]
              },
              bridges: [
                {
                  id: "bridge_test_1",
                  courseTitle: "TCP Sliding Window & Flow Control",
                  title: "Bandwidth-Delay Product (BDP)",
                  whySeeminglyOutOfScope: "It seems like a physics or telecom calculation rather than a software protocol concept.",
                  whyActuallyFundamental: "Without computing BDP, sizing the sliding window causes either starvation or massive packet drops."
                }
              ]
            };

            const reply = {
              candidates: [
                {
                  content: {
                    parts: [{ text: "```json\n" + JSON.stringify(gapAnalysis, null, 2) + "\n```" }]
                  }
                }
              ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply));
            return;
          }

          // Fallback generic
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            candidates: [{ content: { parts: [{ text: "OK" }] } }]
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message } }));
        }
      });
      return;
    }

    // Static file serving from workspace root
    let filePath = path.join(__dirname, '..', url.pathname === '/' ? 'index.html' : url.pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });

  // Attach Mock WebSocket Server on same HTTP server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Client sent Setup frame
        if (msg.setup) {
          ws.send(JSON.stringify({ setupComplete: {} }));
          return;
        }

        // Client sent text turn or audio chunk
        if (msg.clientContent || msg.realtimeInput) {
          // Simulate voice tutor sending an ask_research_agent tool call to Agent 1
          setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
              const toolCallFrame = {
                toolCall: {
                  functionCalls: [
                    {
                      id: "call_mock_1",
                      name: "ask_research_agent",
                      args: {
                        question: "What is the maximum window size according to RFC 793?",
                        context: "The Receive Window"
                      }
                    }
                  ]
                }
              };
              ws.send(JSON.stringify(toolCallFrame));
            }
          }, 300);
          return;
        }

        // Client sent Tool Response back
        if (msg.toolResponse) {
          // Send back modelTurn speaking the answer
          setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
              // Create empty 24kHz PCM chunk (silence) for audio test
              const pcmSilence = Buffer.alloc(480).toString('base64');
              const spokenFrame = {
                serverContent: {
                  modelTurn: {
                    parts: [
                      { text: "Agent 1 confirmed that RFC 793 defines a 16-bit window capped at 65,535 bytes." },
                      { inlineData: { mimeType: "audio/pcm;rate=24000", data: pcmSilence } }
                    ]
                  },
                  turnComplete: true
                }
              };
              ws.send(JSON.stringify(spokenFrame));
            }
          }, 200);
          return;
        }
      } catch (e) {
        console.error('Mock WS error:', e);
      }
    });
  });

  return { server, wss };
}
