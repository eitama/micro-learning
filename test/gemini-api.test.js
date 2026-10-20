/**
 * Unit tests for Gemini Agent 1 JSON parsing and error handling
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GeminiAgent1 } from '../js/gemini-api.js';

describe('GeminiAgent1 JSON Parser & Extractor', () => {
  const agent = new GeminiAgent1(() => ({ apiKey: 'mock' }));

  test('Extracts JSON from markdown code fence', () => {
    const raw = 'Here is the curriculum:\n```json\n{"title": "Test Course", "pieces": []}\n```\nHope you like it!';
    const parsed = agent.extractJson(raw);
    assert.strictEqual(parsed.title, 'Test Course');
  });

  test('Extracts JSON without code fences using outermost braces', () => {
    const raw = 'Sure! {"title": "Direct Object", "pieces": [{"id": "p1"}]} has been created.';
    const parsed = agent.extractJson(raw);
    assert.strictEqual(parsed.title, 'Direct Object');
    assert.strictEqual(parsed.pieces.length, 1);
  });

  test('Extracts JSON array from outermost brackets', () => {
    const raw = 'Here are the deep dives: [{"title": "Sub 1"}, {"title": "Sub 2"}] enjoy!';
    const parsed = agent.extractJson(raw);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].title, 'Sub 1');
  });

  test('Throws clean error when no JSON structure can be found', () => {
    const invalid = 'Sorry, I could not find any information.';
    assert.throws(() => {
      agent.extractJson(invalid);
    }, /Unable to parse structured JSON/);
  });
});
