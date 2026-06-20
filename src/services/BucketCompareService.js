const LocalBucketAdapter = require('../adapters/LocalBucketAdapter');
const CheckpointManager = require('../utils/CheckpointManager');

class BucketCompareService {
  constructor(primaryBucketPath, backupBucketPath, options = {}) {
    this.primaryBucket = new LocalBucketAdapter(primaryBucketPath);
    this.backupBucket = new LocalBucketAdapter(backupBucketPath);
    this.primaryPath = primaryBucketPath;
    this.backupPath = backupBucketPath;
    this.checkpointManager = options.checkpointManager || new CheckpointManager();
    this.onProgress = options.onProgress || null;
  }

  async compareAllFiles(options = {}) {
    const {
      algorithm = 'md5',
      prefix = '',
      useCheckpoint = false,
      resume = true,
      forceRecheck = false,
    } = options;

    const [primaryFiles, backupFiles] = await Promise.all([
      this.primaryBucket.listFiles(prefix),
      this.backupBucket.listFiles(prefix),
    ]);

    const primaryKeys = new Set(primaryFiles.map((f) => f.key));
    const backupKeys = new Set(backupFiles.map((f) => f.key));

    const onlyInPrimary = primaryFiles.filter((f) => !backupKeys.has(f.key)).map((f) => f.key);
    const onlyInBackup = backupFiles.filter((f) => !primaryKeys.has(f.key)).map((f) => f.key);

    const commonKeys = [...primaryKeys].filter((key) => backupKeys.has(key));

    let checkpoint = null;
    let keysToCheck = commonKeys;
    let fromCheckpoint = 0;

    if (useCheckpoint) {
      const taskId = this.checkpointManager.getTaskId(
        this.primaryPath,
        this.backupPath,
        prefix,
        algorithm
      );

      if (!resume || forceRecheck) {
        this.checkpointManager.clear(taskId);
      }

      checkpoint = this.checkpointManager.load(taskId);
      checkpoint.algorithm = algorithm;
      checkpoint.status = 'running';

      if (forceRecheck) {
        checkpoint.checkedFiles = {};
      }

      keysToCheck = this.checkpointManager.getUncheckedKeys(checkpoint, commonKeys);
      fromCheckpoint = this.checkpointManager.getCheckedCount(checkpoint);
    }

    const fileComparisons = [];
    const totalToCheck = commonKeys.length;
    let checkedCount = fromCheckpoint;

    for (const key of commonKeys) {
      let result;

      if (useCheckpoint && this.checkpointManager.isChecked(checkpoint, key)) {
        const cached = checkpoint.checkedFiles[key];
        result = {
          key,
          primarySize: cached.primarySize,
          backupSize: cached.backupSize,
          primaryHash: cached.primaryHash,
          backupHash: cached.backupHash,
          hashMatch: cached.hashMatch,
          fromCache: true,
        };
      } else {
        const primaryFile = primaryFiles.find((f) => f.key === key);
        const backupFile = backupFiles.find((f) => f.key === key);
        const [primaryHash, backupHash] = await Promise.all([
          this.primaryBucket.getFileHash(key, algorithm),
          this.backupBucket.getFileHash(key, algorithm),
        ]);

        result = {
          key,
          primarySize: primaryFile?.size,
          backupSize: backupFile?.size,
          primaryHash,
          backupHash,
          hashMatch: primaryHash === backupHash,
          fromCache: false,
        };

        if (useCheckpoint) {
          this.checkpointManager.recordResult(checkpoint, key, result);
        }

        checkedCount++;
      }

      fileComparisons.push(result);

      if (this.onProgress) {
        this.onProgress({
          checked: checkedCount,
          total: totalToCheck,
          current: key,
          percentage: Math.round((checkedCount / totalToCheck) * 100),
        });
      }
    }

    if (useCheckpoint) {
      checkpoint.status = 'completed';
      this.checkpointManager.flush(checkpoint);
    }

    const matchedFiles = fileComparisons.filter((f) => f.hashMatch).map((f) => f.key);
    const mismatchedFiles = fileComparisons.filter((f) => !f.hashMatch).map((f) => f.key);

    const result = {
      algorithm,
      prefix,
      resumed: useCheckpoint && resume && fromCheckpoint > 0,
      fromCheckpoint,
      newlyChecked: keysToCheck.length,
      summary: {
        totalPrimary: primaryFiles.length,
        totalBackup: backupFiles.length,
        commonFiles: commonKeys.length,
        onlyInPrimary: onlyInPrimary.length,
        onlyInBackup: onlyInBackup.length,
        hashMatched: matchedFiles.length,
        hashMismatched: mismatchedFiles.length,
      },
      onlyInPrimary,
      onlyInBackup,
      matchedFiles,
      mismatchedFiles,
      details: fileComparisons,
    };

    if (useCheckpoint) {
      result.taskId = checkpoint.taskId;
    }

    return result;
  }

  async compareSingleFile(key, options = {}) {
    const { algorithm = 'md5', useCheckpoint = false, forceRecheck = false, prefix = '' } = options;

    let checkpoint = null;
    if (useCheckpoint) {
      const taskId = this.checkpointManager.getTaskId(
        this.primaryPath,
        this.backupPath,
        prefix,
        algorithm
      );
      checkpoint = this.checkpointManager.load(taskId);

      if (!forceRecheck && this.checkpointManager.isChecked(checkpoint, key)) {
        const cached = checkpoint.checkedFiles[key];
        return {
          key,
          algorithm,
          existsInPrimary: cached.existsInPrimary !== undefined ? cached.existsInPrimary : true,
          existsInBackup: cached.existsInBackup !== undefined ? cached.existsInBackup : true,
          primaryHash: cached.primaryHash,
          backupHash: cached.backupHash,
          hashMatch: cached.hashMatch,
          fromCache: true,
          taskId,
        };
      }
    }

    const [primaryExists, backupExists] = await Promise.all([
      this.primaryBucket.fileExists(key),
      this.backupBucket.fileExists(key),
    ]);

    let result;

    if (!primaryExists && !backupExists) {
      result = {
        key,
        algorithm,
        existsInPrimary: false,
        existsInBackup: false,
        hashMatch: false,
      };
    } else if (!primaryExists) {
      const backupHash = await this.backupBucket.getFileHash(key, algorithm);
      result = {
        key,
        algorithm,
        existsInPrimary: false,
        existsInBackup: true,
        backupHash,
        hashMatch: false,
      };
    } else if (!backupExists) {
      const primaryHash = await this.primaryBucket.getFileHash(key, algorithm);
      result = {
        key,
        algorithm,
        existsInPrimary: true,
        existsInBackup: false,
        primaryHash,
        hashMatch: false,
      };
    } else {
      const [primaryHash, backupHash] = await Promise.all([
        this.primaryBucket.getFileHash(key, algorithm),
        this.backupBucket.getFileHash(key, algorithm),
      ]);
      result = {
        key,
        algorithm,
        existsInPrimary: true,
        existsInBackup: true,
        primaryHash,
        backupHash,
        hashMatch: primaryHash === backupHash,
      };
    }

    if (useCheckpoint && checkpoint) {
      this.checkpointManager.recordResult(checkpoint, key, result);
      this.checkpointManager.flush(checkpoint);
      result.taskId = checkpoint.taskId;
    }

    return result;
  }

  getCheckpointManager() {
    return this.checkpointManager;
  }
}

module.exports = BucketCompareService;
