# Test Scripts - OpenCodeTTS

> **Version**: 1.0
> **Created**: 2026-03-19
> **Branch**: feature/keyboard-hotkey-recording

---

## 1. Overview

This document provides automated test scripts for manual test procedures for OpenCodeTTS.

### Test Categories

| Category | Description |
|----------|-------------|
| Unit Tests | Test individual components in isolation |
| Integration Tests | Test component interactions |
| End-to-End Tests | Test complete user workflows |
| Manual Tests | Tests requiring user interaction or hardware |

---

## 2. Test Scripts

### 2.1 Run All STT Tests

**Script**: `tests/stt/run-all-tests.js`
**Description**: Run all STT test cases
**Usage**: `node tests/stt/run-all-tests.js`
**Automation**: Full

**Manual**: No (requires audio input)

---

### 2.2 Run specific test case

**Script**: `tests/stt/run-test.js --case <case_id>`
**Description**: Run a specific STT test case
**Usage**: `node tests/stt/run-test.js --case 001`
**Arguments**:
- `--case <case_id>`: Test case ID (e.g., 001, 002, 003)
**Automation**: Full
**Manual**: No

---

### 2.3 Generate test fixtures
**Script**: `tests/stt/generate-fixtures.js`
**Description**: Generate test audio fixtures using TTS
**Usage**: `node tests/stt/generate-fixtures.js`
**Automation**: Full
**Manual**: No

---

### 2.4 List available backends
**Script**: `tests/stt/list-backends.js`
**Description**: List available STT backends
**Usage**: `node tests/stt/list-backends.js`
**Automation**: Full
**Manual**: No

---

### 2.5 Start Python STT Server
**Script**: `tests/integration/start-stt-server.js`
**Description**: Start the Python STT server
**Usage**: `node tests/integration/start-stt-server.js`
**Prerequisites**: Python installed,**Automation**: Partial
**Manual**: No

**Timeout**: 30000

---

### 2.6 Test WebSocket Connection
**Script**: `tests/integration/test-websocket.js`
**Description**: Test WebSocket connection to STT server
**Prerequisites**: STT server running
**Automation**: Full
**Manual**: No
**Timeout**: 10000

---

## 3. Test Scripts Detail

### 3.1 run-all-tests.js

```javascript
#!/usr/bin/env node
/**
 * OpenCodeTTS - Run all STT tests
 * Usage: node tests/stt/run-all-tests.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TESTS_DIR = path.join(__dirname, 'stt');
const FIXTURES_DIR = path.join(TESTS_DIR, 'fixtures');
const RESULTS_DIR = path.join(TESTS_DIR, 'results');

const cases = JSON.parse(fs.readFileSync(path.join(TESTS_DIR, 'cases.json'), 'utf-8'));

// Audio fixtures
const fixtureFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.wav'))
    .forEach(f => console.log(`  - ${f}`));

// Backend configuration
const DEFAULT_BACKEND = 'faster-whisper';
const DEFAULT_MODEL = 'tiny';
const DEFAULT_LANGUAGE = 'zh';

/**
 * Run a single test
 */
async function runSingleTest(testCase, backend = DEFAULT_BACKEND, model = DEFAULT_MODEL) {
    const audioPath = path.join(FIXTURES_DIR, testCase.audio);

    if (!fs.existsSync(audioPath)) {
        console.error(`Audio fixture not found: ${testCase.audio}`);
        return { success: false, error: `Fixture not found` };
    }

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', '..', 'src', 'scripts', 'stt.py');
        const args = [
            scriptPath,
            '--backend', backend,
            '--model', model,
            '--language', testCase.language || DEFAULT_LANGUAGE,
            '--audio-file', audioPath
        ];

        const proc = spawn('python', args, {
            env: { ...process.env, KMP_DUPLICATE_LIB_OK: 'TRUE' }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Process failed with code ${code}\n${stderr}`));
                return;
            }

            try {
                const result = JSON.parse(stdout.trim());

                // Calculate similarity
                const similarity = calculateSimilarity(result.text, testCase.expected);

                resolve({
                    success: similarity >= 80,
                    expected: testCase.expected,
                    actual: result.text,
                    similarity,
                    backend: result.backend || backend,
                    model: result.model || model,
                    duration: result.duration
                });
            } catch (error) {
                reject(error);
            }
        });

        proc.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Calculate similarity between expected and actual text
 * @param {string} expected
 * @param {string} actual
 * @returns {number} Similarity percentage (0-100)
 */
function calculateSimilarity(expected, actual) {
    const s1 = expected.toLowerCase().replace(/\s+/g, '');
    const s2 = actual.toLowerCase().replace(/\s+/g, '');

    const maxLen = Math.max(s1.length, s2.length);

    // Simple character overlap calculation
    let matches = 0;
    for (let i = 0; i < s1.length; i++) {
        if (s2.includes(s1[i])) {
            matches++;
        }
    }

    return Math.round((matches / maxLen) * 100);
}

/**
 * Run all tests and print report
 */
async function runAllTests() {
    console.log('========================================');
    console.log('OpenCodeTTS - STT Test Runner');
    console.log('========================================\n');

    const results = [];
    const startTime = Date.now();

    for (const testCase of cases.cases) {
        process.stdout.write(`Testing ${testCase.id} (${testCase.language})... `);

        const result = await runSingleTest(testCase);
        results.push(result);

        process.stdout.write(result.success ? 'PASS' : 'FAIL');
        process.stdout.write(`  Similarity: ${result.similarity}%\n`);
        process.stdout.write(`  Duration: ${result.duration}ms\n`);
        process.stdout.write(`  Backend: ${result.backend}\n`);
    }

    // Print summary
    console.log('\n========================================');
    console.log('Summary');
    console.log('========================================');
    console.log(`Total: ${results.length}`);
    console.log(`Passed: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    console.log(`Pass Rate: ${Math.round(results.filter(r => r.success).length / results.length * 100)}%`);
    console.log(`Average Similarity: ${Math.round(results.reduce((sum, r) => sum + r.similarity, 0) / results.length)}%`);
    console.log(`Total Duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`);
    console.log('========================================\n');

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsPath = path.join(RESULTS_DIR, `results-${timestamp}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp,
        summary: {
            total: results.length,
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            avgSimilarity: Math.round(results.reduce((sum, r) => sum + r.similarity, 0) / results.length),
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
        },
        results
    }, null, 2));

    console.log(`\nResults saved to: ${resultsPath}`);
}

// Run all tests
runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});
