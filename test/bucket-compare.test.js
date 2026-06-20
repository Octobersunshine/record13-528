const fs = require('fs');
const path = require('path');
const BucketCompareService = require('../src/services/BucketCompareService');

const testDataDir = path.join(__dirname, 'test-data');
const primaryDir = path.join(testDataDir, 'primary');
const backupDir = path.join(testDataDir, 'backup');

function setupTestData() {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(primaryDir, 'subdir'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'subdir'), { recursive: true });

  fs.writeFileSync(path.join(primaryDir, 'file1.txt'), 'Hello World');
  fs.writeFileSync(path.join(backupDir, 'file1.txt'), 'Hello World');

  fs.writeFileSync(path.join(primaryDir, 'file2.txt'), 'Primary Content');
  fs.writeFileSync(path.join(backupDir, 'file2.txt'), 'Backup Content Different');

  fs.writeFileSync(path.join(primaryDir, 'only-primary.txt'), 'Only in primary');

  fs.writeFileSync(path.join(backupDir, 'only-backup.txt'), 'Only in backup');

  fs.writeFileSync(path.join(primaryDir, 'subdir', 'nested.txt'), 'Nested file content');
  fs.writeFileSync(path.join(backupDir, 'subdir', 'nested.txt'), 'Nested file content');

  console.log('Test data created successfully');
  console.log(`Primary: ${primaryDir}`);
  console.log(`Backup: ${backupDir}`);
}

async function runTests() {
  console.log('\n=== Running Bucket Compare Tests ===\n');

  setupTestData();

  const compareService = new BucketCompareService(primaryDir, backupDir);

  console.log('\n--- Test 1: Compare all files ---');
  const allResult = await compareService.compareAllFiles();
  console.log('Summary:', JSON.stringify(allResult.summary, null, 2));
  console.log('Matched files:', allResult.matchedFiles);
  console.log('Mismatched files:', allResult.mismatchedFiles);
  console.log('Only in primary:', allResult.onlyInPrimary);
  console.log('Only in backup:', allResult.onlyInBackup);

  console.log('\n--- Test 2: Compare single file (matched) ---');
  const singleMatch = await compareService.compareSingleFile('file1.txt');
  console.log('file1.txt:', JSON.stringify(singleMatch, null, 2));

  console.log('\n--- Test 3: Compare single file (mismatched) ---');
  const singleMismatch = await compareService.compareSingleFile('file2.txt');
  console.log('file2.txt:', JSON.stringify(singleMismatch, null, 2));

  console.log('\n--- Test 4: Compare single file (only in primary) ---');
  const onlyPrimary = await compareService.compareSingleFile('only-primary.txt');
  console.log('only-primary.txt:', JSON.stringify(onlyPrimary, null, 2));

  console.log('\n--- Test 5: Compare with prefix ---');
  const prefixResult = await compareService.compareAllFiles({ prefix: 'subdir' });
  console.log('subdir summary:', JSON.stringify(prefixResult.summary, null, 2));

  console.log('\n--- Test 6: Compare with SHA256 ---');
  const sha256Result = await compareService.compareSingleFile('file1.txt', { algorithm: 'sha256' });
  console.log('file1.txt SHA256:', JSON.stringify(sha256Result, null, 2));

  console.log('\n=== All tests completed ===');
}

runTests().catch(console.error);
