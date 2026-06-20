const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function calculateFileHash(filePath, algorithm = 'md5') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function calculateBufferHash(buffer, algorithm = 'md5') {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

async function compareFilesByHash(filePath1, filePath2, algorithm = 'md5') {
  const [hash1, hash2] = await Promise.all([
    calculateFileHash(filePath1, algorithm),
    calculateFileHash(filePath2, algorithm),
  ]);

  return {
    algorithm,
    hash1,
    hash2,
    isEqual: hash1 === hash2,
  };
}

module.exports = {
  calculateFileHash,
  calculateBufferHash,
  compareFilesByHash,
};
