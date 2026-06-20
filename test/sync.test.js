const fs = require('fs');
const path = require('path');
const BucketCompareService = require('../src/services/BucketCompareService');
const FileSyncService = require('../src/services/FileSyncService');
const { calculateFileHash } = require('../src/utils/hash');

const testDataDir = path.join(__dirname, 'test-data-sync');
const primaryDir = path.join(testDataDir, 'primary');
const backupDir = path.join(testDataDir, 'backup');

function setupTestData() {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(primaryDir, 'subdir'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'subdir'), { recursive: true });

  fs.writeFileSync(path.join(primaryDir, 'file1.txt'), 'Same content both sides');
  fs.writeFileSync(path.join(backupDir, 'file1.txt'), 'Same content both sides');

  fs.writeFileSync(path.join(primaryDir, 'file2.txt'), 'Primary version - updated');
  fs.writeFileSync(path.join(backupDir, 'file2.txt'), 'Backup version - old');

  fs.writeFileSync(path.join(primaryDir, 'file3.txt'), 'Only in primary');
  fs.writeFileSync(path.join(primaryDir, 'file4.txt'), 'Another primary only');

  fs.writeFileSync(path.join(backupDir, 'file5.txt'), 'Only in backup - should be untouched');

  fs.writeFileSync(path.join(primaryDir, 'subdir', 'deep.txt'), 'Deep nested primary');

  console.log('Test data created');
}

async function runSyncTests() {
  console.log('\n=== Running File Sync Tests ===\n');

  setupTestData();

  console.log('\n--- Test 1: Dry run sync (compare + sync dryRun) ---');
  const service1 = new BucketCompareService(primaryDir, backupDir);
  const result1 = await service1.compareAllFiles({ sync: true, dryRun: true });
  console.log('Sync enabled:', result1.sync.enabled);
  console.log('Dry run:', result1.sync.dryRun);
  console.log('Total to sync:', result1.sync.totalToSync);
  console.log('Succeeded (dry):', result1.sync.succeeded);
  console.log('Sync results count:', result1.sync.results.length);
  result1.sync.results.forEach((r) => {
    console.log(`  - ${r.key}: ${r.action} (dryRun)`);
  });

  console.log('\n--- Test 2: Verify backup unchanged after dry run ---');
  const backupFile2 = await calculateFileHash(path.join(backupDir, 'file2.txt'));
  const primaryFile2 = await calculateFileHash(path.join(primaryDir, 'file2.txt'));
  console.log('Primary file2 hash:', primaryFile2);
  console.log('Backup file2 hash:', backupFile2);
  console.log('Still different after dry run?', backupFile2 !== primaryFile2 ? 'YES ✓' : 'NO ✗');
  console.log('file3 exists in backup?', fs.existsSync(path.join(backupDir, 'file3.txt')) ? 'YES' : 'NO ✓');

  console.log('\n--- Test 3: Real sync (compare + sync) ---');
  const service3 = new BucketCompareService(primaryDir, backupDir);
  const result3 = await service3.compareAllFiles({ sync: true });
  console.log('Sync enabled:', result3.sync.enabled);
  console.log('Dry run:', result3.sync.dryRun);
  console.log('Total to sync:', result3.sync.totalToSync);
  console.log('Succeeded:', result3.sync.succeeded);
  console.log('Failed:', result3.sync.failed);

  console.log('\n--- Test 4: Verify files synced correctly ---');
  const syncedFile2 = await calculateFileHash(path.join(backupDir, 'file2.txt'));
  const expected2 = await calculateFileHash(path.join(primaryDir, 'file2.txt'));
  console.log('file2 synced correctly?', syncedFile2 === expected2 ? 'YES ✓' : 'NO ✗');

  const syncedFile3 = await calculateFileHash(path.join(backupDir, 'file3.txt'));
  const expected3 = await calculateFileHash(path.join(primaryDir, 'file3.txt'));
  console.log('file3 synced correctly?', syncedFile3 === expected3 ? 'YES ✓' : 'NO ✗');

  const syncedDeep = await calculateFileHash(path.join(backupDir, 'subdir', 'deep.txt'));
  const expectedDeep = await calculateFileHash(path.join(primaryDir, 'subdir', 'deep.txt'));
  console.log('subdir/deep.txt synced correctly?', syncedDeep === expectedDeep ? 'YES ✓' : 'NO ✗');

  console.log('\n--- Test 5: Verify summary updated after sync ---');
  console.log('hashMatched after sync:', result3.summary.hashMatched);
  console.log('hashMismatched after sync:', result3.summary.hashMismatched);
  console.log('onlyInPrimary after sync:', result3.summary.onlyInPrimary);
  console.log('All synced files marked as matched?',
    result3.mismatchedFiles.length === 0 && result3.onlyInPrimary.length === 0 ? 'YES ✓' : 'NO ✗'
  );

  console.log('\n--- Test 6: syncMissingOnly mode ---');
  setupTestData();
  const service6 = new BucketCompareService(primaryDir, backupDir);
  const result6 = await service6.compareAllFiles({ sync: true, syncMissingOnly: true });
  console.log('Sync missing only:', result6.sync.syncMissingOnly);
  console.log('Total to sync (should only be missing files):', result6.sync.totalToSync);

  const file2AfterMissingOnly = await calculateFileHash(path.join(backupDir, 'file2.txt'));
  console.log('file2 NOT changed (syncMissingOnly)?',
    file2AfterMissingOnly !== expected2 ? 'YES ✓' : 'NO ✗'
  );
  console.log('file3 created (missing only)?',
    fs.existsSync(path.join(backupDir, 'file3.txt')) ? 'YES ✓' : 'NO ✗'
  );

  console.log('\n--- Test 7: Direct FileSyncService usage ---');
  setupTestData();
  const syncService = new FileSyncService(primaryDir, backupDir);
  const syncResult = await syncService.syncFiles(['file2.txt', 'file3.txt', 'nonexistent.txt']);
  console.log('Total:', syncResult.total);
  console.log('Succeeded:', syncResult.succeeded);
  console.log('Failed:', syncResult.failed);
  console.log('Failed files:', syncResult.results.filter(r => !r.success).map(r => r.key));

  console.log('\n--- Test 8: Compare after full sync shows all matched ---');
  const service8 = new BucketCompareService(primaryDir, backupDir);
  const result8 = await service8.compareAllFiles();
  console.log('All matched after sync?', result8.summary.hashMismatched === 0 ? 'YES ✓' : 'NO ✗');
  console.log('Total matched:', result8.summary.hashMatched);

  console.log('\n=== All sync tests completed ===');
}

runSyncTests().catch(console.error);
