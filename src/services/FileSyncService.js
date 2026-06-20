const fs = require('fs');
const path = require('path');
const { calculateFileHash } = require('../utils/hash');

class FileSyncService {
  constructor(sourcePath, targetPath, options = {}) {
    this.sourcePath = path.resolve(sourcePath);
    this.targetPath = path.resolve(targetPath);
    this.dryRun = options.dryRun || false;
    this.overwrite = options.overwrite !== undefined ? options.overwrite : true;
    this.checkpointManager = options.checkpointManager || null;
    this.onProgress = options.onProgress || null;
    this.syncCheckpointKey = options.syncCheckpointKey || 'sync';

    if (!fs.existsSync(this.sourcePath)) {
      throw new Error(`Source path does not exist: ${this.sourcePath}`);
    }
  }

  _getTargetFilePath(key) {
    return path.join(this.targetPath, key);
  }

  _getSourceFilePath(key) {
    return path.join(this.sourcePath, key);
  }

  async syncFile(key) {
    const sourceFile = this._getSourceFilePath(key);
    const targetFile = this._getTargetFilePath(key);

    if (!fs.existsSync(sourceFile)) {
      return {
        key,
        success: false,
        reason: 'source_not_found',
        message: `Source file not found: ${key}`,
      };
    }

    const targetExists = fs.existsSync(targetFile);
    if (targetExists && !this.overwrite) {
      return {
        key,
        success: true,
        skipped: true,
        reason: 'target_exists_skip',
        message: 'Target file exists, skip (overwrite=false)',
      };
    }

    if (this.dryRun) {
      return {
        key,
        success: true,
        dryRun: true,
        targetExists,
        action: targetExists ? 'overwrite' : 'create',
        message: `[DRY RUN] Would sync: ${key}`,
      };
    }

    try {
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const sourceStat = fs.statSync(sourceFile);
      const readStream = fs.createReadStream(sourceFile);
      const writeStream = fs.createWriteStream(targetFile);

      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        readStream.on('error', reject);
      });

      fs.utimesSync(targetFile, sourceStat.atime, sourceStat.mtime);

      const sourceHash = await calculateFileHash(sourceFile);
      const targetHash = await calculateFileHash(targetFile);
      const hashMatch = sourceHash === targetHash;

      if (!hashMatch) {
        return {
          key,
          success: false,
          reason: 'hash_mismatch',
          sourceHash,
          targetHash,
          message: 'Sync completed but hash verification failed',
        };
      }

      return {
        key,
        success: true,
        targetExists,
        action: targetExists ? 'overwrite' : 'create',
        sourceHash,
        targetHash,
        size: sourceStat.size,
      };
    } catch (error) {
      return {
        key,
        success: false,
        reason: 'error',
        error: error.message,
        message: `Sync failed: ${error.message}`,
      };
    }
  }

  async syncFiles(keys, options = {}) {
    const { useCheckpoint = false, forceSync = false } = options;
    const results = [];
    let checkpoint = null;
    let fromCheckpoint = 0;

    if (useCheckpoint && this.checkpointManager) {
      const taskId = `${this.syncCheckpointKey}:${this._checksum()}`;
      checkpoint = this.checkpointManager.load(taskId);

      if (!forceSync) {
        const unchecked = this.checkpointManager.getUncheckedKeys(
          checkpoint,
          keys
        );
        fromCheckpoint = keys.length - unchecked.length;
      } else {
        checkpoint.checkedFiles = {};
      }
    }

    const total = keys.length;
    let completed = fromCheckpoint;

    for (const key of keys) {
      let result;

      if (
        useCheckpoint &&
        this.checkpointManager &&
        !forceSync &&
        this.checkpointManager.isChecked(checkpoint, key)
      ) {
        result = { ...checkpoint.checkedFiles[key], fromCache: true };
      } else {
        result = await this.syncFile(key);

        if (useCheckpoint && this.checkpointManager) {
          this.checkpointManager.recordResult(checkpoint, key, result);
        }

        completed++;
      }

      results.push(result);

      if (this.onProgress) {
        this.onProgress({
          completed,
          total,
          current: key,
          percentage: Math.round((completed / total) * 100),
          success: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        });
      }
    }

    if (useCheckpoint && this.checkpointManager) {
      this.checkpointManager.flush(checkpoint);
    }

    const succeeded = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      total,
      succeeded,
      skipped,
      failed,
      fromCheckpoint,
      results,
    };
  }

  _checksum() {
    const crypto = require('crypto');
    return crypto
      .createHash('sha1')
      .update(`${this.sourcePath}||${this.targetPath}`)
      .digest('hex')
      .slice(0, 16);
  }
}

module.exports = FileSyncService;
