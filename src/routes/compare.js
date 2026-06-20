const express = require('express');
const path = require('path');
const fs = require('fs');
const BucketCompareService = require('../services/BucketCompareService');

const router = express.Router();

function getCompareService(req) {
  const primaryPath = req.query.primaryPath || req.body?.primaryPath;
  const backupPath = req.query.backupPath || req.body?.backupPath;

  if (!primaryPath || !backupPath) {
    throw new Error('Both primaryPath and backupPath are required');
  }

  if (!fs.existsSync(primaryPath)) {
    throw new Error(`Primary bucket path does not exist: ${primaryPath}`);
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup bucket path does not exist: ${backupPath}`);
  }

  return new BucketCompareService(primaryPath, backupPath);
}

router.get('/compare', async (req, res) => {
  try {
    const compareService = getCompareService(req);
    const { algorithm = 'md5', prefix = '' } = req.query;

    const result = await compareService.compareAllFiles({ algorithm, prefix });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/compare/:key', async (req, res) => {
  try {
    const compareService = getCompareService(req);
    const { algorithm = 'md5' } = req.query;
    const key = decodeURIComponent(req.params.key);

    const result = await compareService.compareSingleFile(key, { algorithm });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/compare', express.json(), async (req, res) => {
  try {
    const compareService = getCompareService(req);
    const { algorithm = 'md5', prefix = '', keys } = req.body;

    let result;
    if (keys && Array.isArray(keys) && keys.length > 0) {
      const comparisons = [];
      for (const key of keys) {
        const compareResult = await compareService.compareSingleFile(key, { algorithm });
        comparisons.push(compareResult);
      }
      result = {
        algorithm,
        files: comparisons,
        summary: {
          total: comparisons.length,
          matched: comparisons.filter((c) => c.hashMatch).length,
          mismatched: comparisons.filter((c) => !c.hashMatch).length,
        },
      };
    } else {
      result = await compareService.compareAllFiles({ algorithm, prefix });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
