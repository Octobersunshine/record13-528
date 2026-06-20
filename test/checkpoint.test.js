const fs = require('fs');
const path = require('path');
const BucketCompareService = require('../src/services/BucketCompareService');
const CheckpointManager = require('../src/utils/CheckpointManager');

const testDataDir = path.join(__dirname, 'test-data');
const primaryDir = path.join(testDataDir, 'primary');
const backupDir = path.join(testDataDir, 'backup');
const checkpointDir = path.join(__dirname, 'test-checkpoints');

function setupTestData() {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  if (fs.existsSync(checkpointDir)) {
    fs.rmSync(checkpointDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(primaryDir, 'subdir'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'subdir'), { recursive: true });

  fs.writeFileSync(path.join(primaryDir, 'file1.txt'), 'Hello World');
  fs.writeFileSync(path.join(backupDir, 'file1.txt'), 'Hello World');

  fs.writeFileSync(path.join(primaryDir, 'file2.txt'), 'Primary Content');
  fs.writeFileSync(path.join(backupDir, 'file2.txt'), 'Backup Content Different');

  fs.writeFileSync(path.join(primaryDir, 'file3.txt'), 'File 3 content');
  fs.writeFileSync(path.join(backupDir, 'file3.txt'), 'File 3 content');

  fs.writeFileSync(path.join(primaryDir, 'file4.txt'), 'File 4 primary');
  fs.writeFileSync(path.join(backupDir, 'file4.txt'), 'File 4 backup diff');

  fs.writeFileSync(path.join(primaryDir, 'only-primary.txt'), 'Only in primary');
  fs.writeFileSync(path.join(backupDir, 'only-backup.txt'), 'Only in backup');

  fs.writeFileSync(path.join(primaryDir, 'subdir', 'nested.txt'), 'Nested file content');
  fs.writeFileSync(path.join(backupDir, 'subdir', 'nested.txt'), 'Nested file content');

  console.log('Test data created');
}

async function runCheckpointTests() {
  console.log('\n=== Running Checkpoint (断点续传) Tests ===\n');

  setupTestData();

  const checkpointManager = new CheckpointManager({
    checkpointDir,
    autoSaveInterval: 1,
  });

  console.log('\n--- Test 1: First run (no checkpoint) ---');
  const service1 = new BucketCompareService(primaryDir, backupDir, { checkpointManager });
  const result1 = await service1.compareAllFiles({ useCheckpoint: true });
  console.log('Resumed:', result1.resumed);
  console.log('From checkpoint:', result1.fromCheckpoint);
  console.log('Newly checked:', result1.newlyChecked);
  console.log('Cached details count:', result1.details.filter((d) => d.fromCache).length);
  console.log('Total files:', result1.summary.commonFiles);

  console.log('\n--- Test 2: Second run (should resume from checkpoint, all cached) ---');
  const service2 = new BucketCompareService(primaryDir, backupDir, { checkpointManager });
  const result2 = await service2.compareAllFiles({ useCheckpoint: true, resume: true });
  console.log('Resumed:', result2.resumed);
  console.log('From checkpoint:', result2.fromCheckpoint);
  console.log('Newly checked:', result2.newlyChecked);
  const cachedCount = result2.details.filter((d) => d.fromCache).length;
  console.log('Cached details count:', cachedCount, '/', result2.details.length);
  console.log('All from cache?', cachedCount === result2.details.length ? 'YES ✓' : 'NO ✗');

  console.log('\n--- Test 3: forceRecheck=true (should ignore checkpoint) ---');
  const service3 = new BucketCompareService(primaryDir, backupDir, { checkpointManager });
  const result3 = await service3.compareAllFiles({ useCheckpoint: true, forceRecheck: true });
  console.log('Resumed:', result3.resumed);
  console.log('From checkpoint:', result3.fromCheckpoint);
  const forcedCached = result3.details.filter((d) => d.fromCache).length;
  console.log('Cached details count:', forcedCached);
  console.log('No cache used?', forcedCached === 0 ? 'YES ✓' : 'NO ✗');

  console.log('\n--- Test 4: Single file with checkpoint ---');
  const service4 = new BucketCompareService(primaryDir, backupDir, { checkpointManager });
  const single1 = await service4.compareSingleFile('file1.txt', { useCheckpoint: true });
  console.log('First call - fromCache:', single1.fromCache);
  const single2 = await service4.compareSingleFile('file1.txt', { useCheckpoint: true });
  console.log('Second call - fromCache:', single2.fromCache);
  console.log('Single file cache working?', single2.fromCache === true ? 'YES ✓' : 'NO ✗');

  console.log('\n--- Test 5: Resume=false (should start fresh) ---');
  const service5 = new BucketCompareService(primaryDir, backupDir, { checkpointManager });
  const result5 = await service5.compareAllFiles({ useCheckpoint: true, resume: false });
  console.log('Resumed:', result5.resumed);
  console.log('From checkpoint:', result5.fromCheckpoint);
  const freshCached = result5.details.filter((d) => d.fromCache).length;
  console.log('Cached count after fresh start:', freshCached);

  console.log('\n--- Test 6: List all checkpoints ---');
  const allCheckpoints = checkpointManager.listAll();
  console.log('Checkpoint files found:', allCheckpoints.length);
  allCheckpoints.forEach((c) => {
    console.log(`  - ${c.taskId}: ${c.checkedCount} files, status: ${c.status}`);
  });

  console.log('\n=== All checkpoint tests completed ===');
}

runCheckpointTests().catch(console.error);
