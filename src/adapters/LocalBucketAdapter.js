const fs = require('fs');
const path = require('path');
const { calculateFileHash } = require('../utils/hash');

class LocalBucketAdapter {
  constructor(bucketPath) {
    this.bucketPath = path.resolve(bucketPath);
    if (!fs.existsSync(this.bucketPath)) {
      throw new Error(`Bucket path does not exist: ${this.bucketPath}`);
    }
  }

  async listFiles(prefix = '') {
    const files = [];
    const basePath = path.join(this.bucketPath, prefix);

    if (!fs.existsSync(basePath)) {
      return files;
    }

    const walk = (dir, relativePath = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          files.push({
            key: relPath,
            size: stat.size,
            lastModified: stat.mtime,
          });
        }
      }
    };

    walk(basePath);
    return files;
  }

  async getFileHash(key, algorithm = 'md5') {
    const filePath = path.join(this.bucketPath, key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return calculateFileHash(filePath, algorithm);
  }

  async fileExists(key) {
    const filePath = path.join(this.bucketPath, key);
    return fs.existsSync(filePath);
  }

  getBucketPath() {
    return this.bucketPath;
  }
}

module.exports = LocalBucketAdapter;
