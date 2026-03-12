#!/usr/bin/env node
/**
 * STT Test Runner
 * 
 * 用法:
 *   node tests/test-runner.js              # 运行所有测试
 *   node tests/test-runner.js --case 001   # 运行指定测试用例
 *   node tests/test-runner.js --add       # 添加新测试用例
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CASES_FILE = path.join(__dirname, 'cases', 'stt-cases.json');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadCases() {
  const data = fs.readFileSync(CASES_FILE, 'utf-8');
  return JSON.parse(data);
}

function saveCases(data) {
  fs.writeFileSync(CASES_FILE, JSON.stringify(data, null, 2));
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
    const pythonPath = process.env.PYTHON_PATH || 'D:\\Program Files\\Python\\Python313\\python.exe';
    const scriptPath = path.join(__dirname, '..', 'src', 'scripts', 'stt.py');
    
    const args = [scriptPath, '--backend', backend, '--model', model, '--language', language];
    
    if (audioPath) {
      args.push('--audio-file', audioPath);
    }
    
    const proc = spawn(pythonPath, args, {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `Process exited with code ${code}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function runSingleTest(testCase) {
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
      testCase.backend || 'auto',
      testCase.model || 'tiny',
      testCase.language || 'zh'
    );
    
    const similarity = calculateSimilarity(result.text || '', testCase.expected);
    
    return {
      id: testCase.id,
      success: similarity >= 80,
      expected: testCase.expected,
      actual: result.text,
      similarity,
      backend: result.backend,
      model: result.model
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

async function runAllTests() {
  const data = loadCases();
  const cases = data.cases;
  
  if (cases.length === 0) {
    console.log('No test cases found. Add test cases using:');
    console.log('  node tests/test-runner.js --add');
    return;
  }
  
  console.log(`\nRunning ${cases.length} test cases...\n`);
  
  const results = [];
  let passed = 0;
  
  for (const testCase of cases) {
    process.stdout.write(`Testing ${testCase.id}... `);
    const result = await runSingleTest(testCase);
    results.push(result);
    
    if (result.success) {
      console.log(`✓ PASS (${result.similarity}%)`);
      passed++;
    } else {
      console.log(`✗ FAIL`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      } else {
        console.log(`  Expected: "${result.expected}"`);
        console.log(`  Actual:   "${result.actual}"`);
        console.log(`  Similarity: ${result.similarity}%`);
      }
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${cases.length} passed`);
  console.log(`${'='.repeat(50)}\n`);
  
  return results;
}

function addTestCase() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const data = loadCases();
  const newId = String(data.cases.length + 1).padStart(3, '0');
  
  console.log('\n=== Add New Test Case ===\n');
  
  rl.question('Audio file name (e.g., test-001.wav): ', (audio) => {
    rl.question('Expected text: ', (expected) => {
      rl.question('Language (default: zh): ', (language) => {
        rl.question('Backend (auto/moonshine/whisper/faster-whisper, default: auto): ', (backend) => {
          rl.question('Model (tiny/base/small, default: tiny): ', (model) => {
            const newCase = {
              id: newId,
              audio: audio,
              expected: expected,
              language: language || 'zh',
              backend: backend || 'auto',
              model: model || 'tiny'
            };
            
            data.cases.push(newCase);
            data.lastUpdated = new Date().toISOString();
            saveCases(data);
            
            console.log(`\n✓ Test case ${newId} added!`);
            console.log(JSON.stringify(newCase, null, 2));
            
            rl.close();
          });
        });
      });
    });
  });
}

function listBackends() {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'D:\\Program Files\\Python\\Python313\\python.exe';
    const scriptPath = path.join(__dirname, '..', 'src', 'scripts', 'stt.py');
    
    const proc = spawn(pythonPath, [scriptPath, '--list-backends'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result.available_backends || []);
      } catch {
        resolve([]);
      }
    });
    
    proc.on('error', () => resolve([]));
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--add')) {
    addTestCase();
    return;
  }
  
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
    files.forEach(f => console.log('  -', f));
    return;
  }
  
  await runAllTests();
}

main().catch(console.error);
