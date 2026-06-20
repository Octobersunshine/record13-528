const LocalBucketAdapter = require('../adapters/LocalBucketAdapter');

class BucketCompareService {
  constructor(primaryBucketPath, backupBucketPath) {
    this.primaryBucket = new LocalBucketAdapter(primaryBucketPath);
    this.backupBucket = new LocalBucketAdapter(backupBucketPath);
  }

  async compareAllFiles(options = {}) {
    const { algorithm = 'md5', prefix = '' } = options;

    const [primaryFiles, backupFiles] = await Promise.all([
      this.primaryBucket.listFiles(prefix),
      this.backupBucket.listFiles(prefix),
    ]);

    const primaryKeys = new Set(primaryFiles.map((f) => f.key));
    const backupKeys = new Set(backupFiles.map((f) => f.key));

    const onlyInPrimary = primaryFiles.filter((f) => !backupKeys.has(f.key)).map((f) => f.key);
    const onlyInBackup = backupFiles.filter((f) => !primaryKeys.has(f.key)).map((f) => f.key);

    const commonKeys = [...primaryKeys].filter((key) => backupKeys.has(key));

    const fileComparisons = [];
    for (const key of commonKeys) {
      const [primaryHash, backupHash] = await Promise.all([
        this.primaryBucket.getFileHash(key, algorithm),
        this.backupBucket.getFileHash(key, algorithm),
      ]);

      const primaryFile = primaryFiles.find((f) => f.key === key);
      const backupFile = backupFiles.find((f) => f.key === key);

      fileComparisons.push({
        key,
        primarySize: primaryFile?.size,
        backupSize: backupFile?.size,
        primaryHash,
        backupHash,
        hashMatch: primaryHash === backupHash,
      });
    }

    const matchedFiles = fileComparisons.filter((f) => f.hashMatch).map((f) => f.key);
    const mismatchedFiles = fileComparisons.filter((f) => !f.hashMatch).map((f) => f.key);

    return {
      algorithm,
      prefix,
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
  }

  async compareSingleFile(key, options = {}) {
    const { algorithm = 'md5' } = options;

    const [primaryExists, backupExists] = await Promise.all([
      this.primaryBucket.fileExists(key),
      this.backupBucket.fileExists(key),
    ]);

    if (!primaryExists && !backupExists) {
      return {
        key,
        algorithm,
        existsInPrimary: false,
        existsInBackup: false,
        hashMatch: false,
      };
    }

    if (!primaryExists) {
      const backupHash = await this.backupBucket.getFileHash(key, algorithm);
      return {
        key,
        algorithm,
        existsInPrimary: false,
        existsInBackup: true,
        backupHash,
        hashMatch: false,
      };
    }

    if (!backupExists) {
      const primaryHash = await this.primaryBucket.getFileHash(key, algorithm);
      return {
        key,
        algorithm,
        existsInPrimary: true,
        existsInBackup: false,
        primaryHash,
        hashMatch: false,
      };
    }

    const [primaryHash, backupHash] = await Promise.all([
      this.primaryBucket.getFileHash(key, algorithm),
      this.backupBucket.getFileHash(key, algorithm),
    ]);

    return {
      key,
      algorithm,
      existsInPrimary: true,
      existsInBackup: true,
      primaryHash,
      backupHash,
      hashMatch: primaryHash === backupHash,
    };
  }
}

module.exports = BucketCompareService;
