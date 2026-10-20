/**
 * End-to-End Headless Browser Test Suite for Pocket Tutor
 * Uses Puppeteer Core with the local Chrome binary and Mock Gemini Server.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import puppeteer from 'puppeteer-core';
import { createMockServer } from './mock-gemini-server.js';

const TEST_PORT = 9001;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

describe('Pocket Tutor E2E Headless Browser Test Suite', () => {
  let serverInstance = null;
  let browser = null;
  let page = null;
  const pageErrors = [];

  before(async () => {
    // 1. Start mock backend server
    const { server } = createMockServer(TEST_PORT);
    serverInstance = server;
    await new Promise(res => server.listen(TEST_PORT, res));

    // 2. Launch headless Chrome
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    });

    page = await browser.newPage();
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      console.error('[Page Error]:', err.message);
    });

    // Point API and WebSocket to mock server
    await page.evaluateOnNewDocument(() => {
      window.__GEMINI_API_BASE__ = 'http://localhost:9001';
      window.__GEMINI_LIVE_WS__ = 'ws://localhost:9001';
    });

    await page.goto(`http://localhost:${TEST_PORT}/index.html`, { waitUntil: 'networkidle0' });
  });

  after(async () => {
    if (browser) await browser.close();
    if (serverInstance) {
      await new Promise(res => serverInstance.close(res));
    }
  });

  test('Page loads without runtime script errors', async () => {
    assert.strictEqual(pageErrors.length, 0, 'No uncaught page errors on initial load');
    const title = await page.title();
    assert.match(title, /Pocket Tutor/i);
  });

  test('Config Modal: Save key and test connection successfully', async () => {
    // Open settings modal
    await page.click('#configBtn');
    await page.waitForSelector('#settingsModal', { visible: true });

    // Enter test API Key
    await page.type('#apiKeyInput', 'AIzaSy_TEST_KEY_12345');

    // Click "⚡ Test API Key"
    await page.click('button[onclick*="testApiConnection"]');
    await page.waitForSelector('#testPingStatus:not(.hidden)', { timeout: 5000 });

    const statusText = await page.$eval('#testPingStatus', el => el.textContent);
    assert.match(statusText, /Success! Model "gemini-3.8-flash" responded/i);

    // Save and close
    await page.click('button[onclick*="saveSettings"]');
    await page.waitForFunction(() => {
      const modal = document.getElementById('settingsModal');
      return modal.style.display === 'none' || modal.classList.contains('hidden');
    });

    // Verify key status indicator turns green
    const dotClass = await page.$eval('#keyStatusDot', el => el.className);
    assert.ok(dotClass.includes('bg-emerald-400'), 'Status dot should be emerald green after saving key');
  });

  test('Agent 1: Research and build micro-learning puzzle pieces', async () => {
    // Enter topic
    await page.type('#topicInput', 'TCP Sliding Window Protocol');

    // Click generate button
    await page.click('#generateBtn');

    // Wait for puzzle piece cards to render
    await page.waitForSelector('#card_piece_1', { timeout: 10000 });

    const cardsCount = await page.$$eval('#cardsContainer > div', els => els.length);
    assert.strictEqual(cardsCount, 3, 'Should render 3 mock puzzle piece cards');

    // Verify card content
    const firstCardText = await page.$eval('#cardsContainer > div:first-child', el => el.textContent);
    assert.match(firstCardText, /The Receive Window/i);
    assert.match(firstCardText, /Core Mental Model/i);
    assert.match(firstCardText, /RFC 793 Specification/i);
  });

  test('Tell Me More: Deep-dive expansion renders sub-pieces inside card', async () => {
    // Click "Tell Me More" on first card
    const firstCardDiveBtn = await page.$('#cardsContainer > div:first-child button[id^="btn_dive_"]');
    assert.ok(firstCardDiveBtn, 'Deep dive button should exist on first card');
    await firstCardDiveBtn.click();

    // Wait for deep dive sub-piece to render
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Window Scale Option (RFC 7323)');
    }, { timeout: 8000 });

    const cardContent = await page.$eval('#cardsContainer > div:first-child', el => el.textContent);
    assert.match(cardContent, /Window Scale Option/i);
    assert.match(cardContent, /Zero-Window Probing/i);
  });

  test('Agent 1: Fundamentals Gap Analysis & Bridge Injection', async () => {
    // Switch to Fundamentals tab
    await page.click('#tabBtn_bridges');
    await page.waitForSelector('#tab_bridges:not(.hidden)');

    // Click "Analyze My Gaps"
    await page.click('button[onclick*="refreshNarrativeAndSuggestions"]');

    // Wait for bridges to populate
    await page.waitForSelector('#bridgesList button[onclick*="injectBridge"]', { timeout: 8000 });
    const bridgeText = await page.$eval('#bridgesList > div:first-child', el => el.textContent);
    assert.match(bridgeText, /Bandwidth-Delay Product/i);
    assert.match(bridgeText, /Why it feels out-of-scope/i);
    assert.match(bridgeText, /Why it is actually fundamental/i);

    // Inject as puzzle piece into active course
    await page.$eval('#bridgesList button[onclick*="injectBridge"]', btn => btn.click());

    // Verify redirect to learn tab and injected card exists
    await page.waitForSelector('#tab_learn:not(.hidden)');
    const learnContent = await page.$eval('#cardsContainer', el => el.textContent);
    assert.match(learnContent, /\[Foundational Bridge\] Bandwidth-Delay Product/i);
  });

  test('Vault & Brain Tab: Persistent Source Ledger & Narrative', async () => {
    // Switch to Vault tab
    await page.click('#tabBtn_vault');
    await page.waitForSelector('#tab_vault:not(.hidden)');

    // Verify Learner Narrative
    const narrativeText = await page.$eval('#vaultNarrativeBox', el => el.textContent);
    assert.match(narrativeText, /Systems Programming/i);

    // Verify Persistent Source Ledger
    const sourceLedgerText = await page.$eval('#vaultSourceLedger', el => el.textContent);
    assert.match(sourceLedgerText, /RFC 793/i);
    assert.match(sourceLedgerText, /RFC 5681/i);

    // Test JSON export serialization
    const exportedJsonStr = await page.evaluate(() => {
      return localStorage.getItem('PT38_VAULT_MIRROR');
    });
    assert.ok(exportedJsonStr, 'Vault JSON must exist in localStorage');
    const parsedVault = JSON.parse(exportedJsonStr);
    assert.ok(parsedVault.courses.length >= 1, 'Vault should contain courses');
  });

  test('Agent 2: Live Voice Session with Dual-Agent Tool Calling Loop', async () => {
    // Return to learn tab
    await page.click('#tabBtn_learn');
    await page.waitForSelector('#tab_learn:not(.hidden)');

    // Start Live Voice session on piece 1
    await page.click('#cardsContainer > div:first-child button[onclick*="startLiveForPiece"]');

    // Verify live session bar displays
    await page.waitForFunction(() => {
      const bar = document.getElementById('liveSessionBar');
      return bar && bar.style.display !== 'none';
    }, { timeout: 5000 });

    // Wait for the mock WebSocket tool call loop (Agent 2 calls Agent 1 ask_research_agent)
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Live Voice Asked Agent 1');
    }, { timeout: 8000 });

    const cardText = await page.$eval('#cardsContainer > div:first-child', el => el.textContent);
    assert.match(cardText, /Live Voice Asked Agent 1/i);
    assert.match(cardText, /maximum window size/i);

    // Test mic toggle
    await page.click('#micToggleBtn');
    let micText = await page.$eval('#micToggleBtn', el => el.textContent);
    assert.match(micText, /Mic Muted/i);

    await page.click('#micToggleBtn');
    micText = await page.$eval('#micToggleBtn', el => el.textContent);
    assert.match(micText, /Mic On/i);

    // End session
    await page.click('button[onclick*="stopLiveSession"]');
    await page.waitForFunction(() => {
      const bar = document.getElementById('liveSessionBar');
      return bar && bar.style.display === 'none';
    });
  });
});
