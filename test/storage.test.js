/**
 * Unit tests for Vault Storage Layer
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock localStorage for Node test environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
};

describe('VaultStorage Unit Tests', async () => {
  const { vault } = await import('../js/storage.js');

  beforeEach(() => {
    localStorage.clear();
    vault.clearAll();
  });

  test('Saves and retrieves settings correctly', () => {
    vault.saveSettings({
      apiKey: 'AIzaSy_12345',
      researchModel: 'gemini-3.8-flash',
      thinkingLevel: 'high',
      liveModel: 'gemini-3.8-live',
      voiceName: 'Puck'
    });

    const s = vault.getSettings();
    assert.strictEqual(s.apiKey, 'AIzaSy_12345');
    assert.strictEqual(s.researchModel, 'gemini-3.8-flash');
    assert.strictEqual(s.thinkingLevel, 'high');
    assert.strictEqual(s.liveModel, 'gemini-3.8-live');
    assert.strictEqual(s.voiceName, 'Puck');
  });

  test('Add course, get active course, and delete course', () => {
    const testCourse = {
      id: 'c_1',
      title: 'Linux epoll Mechanics',
      topic: 'epoll',
      researchDecision: 'RFC & man pages',
      sourceRegistry: [],
      pieces: [
        { id: 'p_1', title: 'Edge Triggered vs Level Triggered', summary: 'Summary', deepDives: [], agentComms: [] }
      ]
    };

    vault.addCourse(testCourse);
    assert.strictEqual(vault.getActiveCourse().id, 'c_1');
    assert.strictEqual(vault.getState().courses.length, 1);

    vault.addDeepDive('c_1', 'p_1', { title: 'EPOLLONESHOT', detail: 'Single notification' });
    const active = vault.getActiveCourse();
    assert.strictEqual(active.pieces[0].deepDives.length, 1);
    assert.strictEqual(active.pieces[0].deepDives[0].title, 'EPOLLONESHOT');

    vault.deleteActiveCourse();
    assert.strictEqual(vault.getActiveCourse(), null);
    assert.strictEqual(vault.getState().courses.length, 0);
  });

  test('Fundamental Bridge injection creates puzzle piece in active course', () => {
    const course = {
      id: 'c_react',
      title: 'React Server Components',
      topic: 'RSC',
      pieces: []
    };
    vault.addCourse(course);

    vault.setFundamentalSuggestions([
      {
        id: 'bridge_http_chunked',
        title: 'HTTP/1.1 Chunked Transfer Encoding',
        whySeeminglyOutOfScope: 'Old HTTP transport detail',
        whyActuallyFundamental: 'RSC streams serialized component chunks over chunked transport.'
      }
    ]);

    assert.strictEqual(vault.getState().fundamentalSuggestions.length, 1);

    const injected = vault.injectBridgeIntoCourse('bridge_http_chunked', 'c_react');
    assert.ok(injected);
    assert.match(injected.title, /HTTP\/1\.1 Chunked Transfer Encoding/i);

    const active = vault.getActiveCourse();
    assert.strictEqual(active.pieces.length, 1);
    assert.strictEqual(vault.getState().fundamentalSuggestions.length, 0);
  });

  test('Export and import vault JSON preserves state', () => {
    vault.saveSettings({ apiKey: 'key_abc' });
    vault.addCourse({ id: 'c_x', title: 'Course X', pieces: [] });
    vault.addQaEntry({ courseTitle: 'Course X', question: 'How?', shortAnswer: 'Like this.' });

    const json = vault.exportJson();
    assert.ok(json.includes('Course X'));

    // Clear and restore
    vault.clearAll();
    assert.strictEqual(vault.getState().courses.length, 0);

    vault.importJson(json);
    assert.strictEqual(vault.getState().courses.length, 1);
    assert.strictEqual(vault.getState().courses[0].title, 'Course X');
    assert.strictEqual(vault.getState().qaHistory.length, 1);
  });
});
