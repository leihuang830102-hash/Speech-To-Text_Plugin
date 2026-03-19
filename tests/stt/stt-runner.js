#!/usr/bin/env node
/**
 * Enhanced STT Test Runner with Reporting
 *
 * Usage:
 *   node tests/stt/stt-runner.js              # Run all STT tests
 *   node tests/stt/stt-runner.js --case 001   # Run specific case
 *   node tests/stt/stt-runner.js --backend whisper  # Test specific backend
 *   node tests/stt/stt-runner.js --compare    # Compare all backends
 *   node tests/stt/stt-runner.js --report     # Generate markdown report
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CASES_FILE = path.join(__dirname, 'cases.json');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const HISTORY_DIR = path.join(RESULTS_DIR, 'history');

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

function loadCases() {
  const data = fs.readFileSync(CASES_FILE, 'utf-8');
  return JSON.parse(data);
}

function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/\s+/g, '');
  const s2 = str2.toLowerCase().replace(/\s+/g, '');

  if (s1 === s2) return 100;

  let matches = 0;
  const maxLen = Math.max(s1.length, s2.length);

  for (let i = 0; i < s1.length; i++) {
    if (s2.includes(s1[i])) matches++;
  }

  return Math.round((matches / maxLen) * 100);
}

async function runTranscription(audioPath, backend = 'auto', model = 'tiny', language = 'zh') {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', '..', 'src', 'scripts', 'stt.py');

    const args = [scriptPath, '--backend', backend, '--model', model, '--language', language];

    if (audioPath) {
      args.push('--audio-file', audioPath);
    }

    const startTime = Date.now();

    const proc = spawn(pythonPath, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, KMP_DUPLICATE_LIB_OK: 'TRUE' },
      shell: true  // Use shell on Windows for proper env var handling
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `Process exited with code ${code}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve({ ...result, duration });
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function runSingleTest(testCase, backendOverride = null) {
  const audioPath = path.join(FIXTURES_DIR, testCase.audio);

  if (!fs.existsSync(audioPath)) {
    return {
      id: testCase.id,
      success: false,
      error: `Audio file not found: ${testCase.audio}`,
      similarity: 0
    };
  }

  try {
    const result = await runTranscription(
      audioPath,
      backendOverride || testCase.backend || 'auto',
      testCase.model || 'tiny',
      testCase.language || 'zh'
    );

    // Handle error response from STT backend
    if (!result.success) {
      return {
        id: testCase.id,
        success: false,
        error: result.error || 'Unknown STT error',
        expected: testCase.expected,
        actual: null,
        similarity: 0,
        backend: result.backend,
        duration: result.duration
      };
    }

    const similarity = calculateSimilarity(result.text || '', testCase.expected);

    return {
      id: testCase.id,
      success: similarity >= 80,
      expected: testCase.expected,
      actual: result.text,
      similarity,
      backend: result.backend,
      model: result.model,
      duration: result.duration
    };
  } catch (error) {
    return {
      id: testCase.id,
      success: false,
      error: error.message,
      similarity: 0
    };
  }
}

async function compareBackends(testCase) {
  const backends = ['whisper', 'faster-whisper']; // moonshine if available
  const results = {};

  for (const backend of backends) {
    try {
      const result = await runSingleTest(testCase, backend);
      results[backend] = result;
    } catch (e) {
      results[backend] = { error: e.message };
    }
  }

  return results;
}

function generateJSONReport(results, metadata = {}) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      avgSimilarity: Math.round(results.reduce((sum, r) => sum + (r.similarity || 0), 0) / results.length),
      totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
    },
    metadata,
    results
  };

  return report;
}

function generateMarkdownReport(report) {
  const lines = [
    `# STT Test Report`,
    ``,
    `**Generated:** ${report.timestamp}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tests | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Pass Rate | ${Math.round(report.summary.passed / report.summary.total * 100)}% |`,
    `| Avg Similarity | ${report.summary.avgSimilarity}% |`,
    `| Total Duration | ${report.summary.totalDuration}ms |`,
    ``,
    `## Test Results`,
    ``,
    `| ID | Status | Similarity | Backend | Duration | Expected | Actual |`,
    `|----|--------|------------|---------|----------|----------|--------|`
  ];

  report.results.forEach(r => {
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    const expected = (r.expected || '').substring(0, 30) + (r.expected?.length > 30 ? '...' : '');
    const actual = (r.actual || r.error || '').substring(0, 30) + ((r.actual || r.error)?.length > 30 ? '...' : '');
    lines.push(`| ${r.id} | ${status} | ${r.similarity}% | ${r.backend || '-'} | ${r.duration || '-'}ms | ${expected} | ${actual} |`);
  });

  lines.push('', '---', `*Report generated by OpenCode TTS Test Runner*`);

  return lines.join('\n');
}

function saveReports(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

  // Save JSON
  const jsonPath = path.join(RESULTS_DIR, 'latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Save to history
  const historyPath = path.join(HISTORY_DIR, `${timestamp}.json`);
  fs.writeFileSync(historyPath, JSON.stringify(report, null, 2));

  // Save Markdown
  const mdReport = generateMarkdownReport(report);
  const mdPath = path.join(RESULTS_DIR, 'latest.md');
  fs.writeFileSync(mdPath, mdReport);

  console.log(`\nReports saved:`);
  console.log(`  - ${jsonPath}`);
  console.log(`  - ${mdPath}`);
  console.log(`  - ${historyPath}`);
}

async function runAllTests(options = {}) {
  const data = loadCases();
  const cases = data.cases;

  if (cases.length === 0) {
    console.log('No test cases found.');
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${cases.length} STT test cases...`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  let passed = 0;

  for (const testCase of cases) {
    process.stdout.write(`Testing ${testCase.id} (${testCase.language})... `);

    let result;
    if (options.compareBackends) {
      const comparisons = await compareBackends(testCase);
      result = Object.values(comparisons).find(r => r.success) || Object.values(comparisons)[0];
      result.comparisons = comparisons;
    } else {
      result = await runSingleTest(testCase, options.backend);
    }

    results.push(result);

    if (result.success) {
      console.log(`✅ PASS (${result.similarity}%, ${result.duration}ms) [${result.backend}]`);
      passed++;
    } else {
      console.log(`❌ FAIL`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      } else {
        console.log(`  Expected: "${result.expected}"`);
        console.log(`  Actual:   "${result.actual}"`);
        console.log(`  Similarity: ${result.similarity}%`);
      }
    }
  }

  const report = generateJSONReport(results, { mode: options.compareBackends ? 'compare' : 'single' });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed}/${cases.length} passed (${Math.round(passed/cases.length*100)}%)`);
  console.log(`Average Similarity: ${report.summary.avgSimilarity}%`);
  console.log(`Total Duration: ${report.summary.totalDuration}ms`);
  console.log(`${'='.repeat(60)}\n`);

  saveReports(report);

  return report;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list-backends')) {
    const backends = await listBackends();
    console.log('\nAvailable STT backends:', backends.join(', '));
    return;
  }

  if (args.includes('--case')) {
    const caseIndex = args.indexOf('--case');
    const caseId = args[caseIndex + 1];

    const data = loadCases();
    const testCase = data.cases.find(c => c.id === caseId);

    if (!testCase) {
      console.log(`Test case ${caseId} not found`);
      process.exit(1);
    }

    const result = await runSingleTest(testCase);
    console.log('\n', JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--fixtures')) {
    const files = fs.readdirSync(FIXTURES_DIR);
    console.log('\nAvailable fixtures:');
    files.filter(f => f.endsWith('.wav')).forEach(f => console.log('  -', f));
    return;
  }

  const options = {
    compareBackends: args.includes('--compare'),
    backend: args.includes('--backend') ? args[args.indexOf('--backend') + 1] : null
  };

  await runAllTests(options);
}

main().catch(console.error);
