const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CheckpointManager {
  constructor(options = {}) {
    this.checkpointDir = options.checkpointDir || path.join(process.cwd(), '.checkpoints');
    this.autoSaveInterval = options.autoSaveInterval || 100;
    this.pendingChanges = 0;

    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  _getCheckpointPath(taskId) {
    const safeName = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.checkpointDir, `${safeName}.json`);
  }

  _generateTaskId(primaryPath, backupPath, prefix = '', algorithm = 'md5') {
    const raw = `${primaryPath}||${backupPath}||${prefix}||${algorithm}`;
    return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  }

  getTaskId(primaryPath, backupPath, prefix = '', algorithm = 'md5') {
    return this._generateTaskId(primaryPath, backupPath, prefix, algorithm);
  }

  load(taskId) {
    const checkpointPath = this._getCheckpointPath(taskId);
    if (!fs.existsSync(checkpointPath)) {
      return {
        taskId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        algorithm: 'md5',
        checkedFiles: {},
        status: 'pending',
      };
    }

    try {
      const data = fs.readFileSync(checkpointPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`Failed to parse checkpoint ${checkpointPath}, starting fresh:`, error.message);
      return {
        taskId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        algorithm: 'md5',
        checkedFiles: {},
        status: 'pending',
      };
    }
  }

  save(checkpoint) {
    checkpoint.updatedAt = Date.now();
    const checkpointPath = this._getCheckpointPath(checkpoint.taskId);
    const tempPath = `${checkpointPath}.tmp`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
      fs.renameSync(tempPath, checkpointPath);
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  recordResult(checkpoint, key, result) {
    checkpoint.checkedFiles[key] = {
      ...result,
      checkedAt: Date.now(),
    };
    this.pendingChanges++;

    if (this.pendingChanges >= this.autoSaveInterval) {
      this.save(checkpoint);
      this.pendingChanges = 0;
    }
  }

  isChecked(checkpoint, key) {
    return key in checkpoint.checkedFiles;
  }

  getUncheckedKeys(checkpoint, allKeys) {
    return allKeys.filter((key) => !this.isChecked(checkpoint, key));
  }

  getCheckedCount(checkpoint) {
    return Object.keys(checkpoint.checkedFiles).length;
  }

  flush(checkpoint) {
    if (this.pendingChanges > 0) {
      this.save(checkpoint);
      this.pendingChanges = 0;
    }
  }

  clear(taskId) {
    const checkpointPath = this._getCheckpointPath(taskId);
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
  }

  listAll() {
    if (!fs.existsSync(this.checkpointDir)) {
      return [];
    }

    return fs.readdirSync(this.checkpointDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const data = fs.readFileSync(path.join(this.checkpointDir, f), 'utf-8');
          const checkpoint = JSON.parse(data);
          return {
            taskId: checkpoint.taskId,
            file: f,
            checkedCount: this.getCheckedCount(checkpoint),
            status: checkpoint.status,
            updatedAt: checkpoint.updatedAt,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

module.exports = CheckpointManager;
