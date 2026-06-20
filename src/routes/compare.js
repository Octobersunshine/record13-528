const express = require('express');
const path = require('path');
const fs = require('fs');
const BucketCompareService = require('../services/BucketCompareService');
const CheckpointManager = require('../utils/CheckpointManager');

const router = express.Router();

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'yes';
  }
  return false;
}

function getCompareService(req) {
  const primaryPath = req.query.primaryPath || req.body?.primaryPath;
  const backupPath = req.query.backupPath || req.body?.backupPath;
  const checkpointDir = req.query.checkpointDir || req.body?.checkpointDir;

  if (!primaryPath || !backupPath) {
    throw new Error('Both primaryPath and backupPath are required');
  }

  if (!fs.existsSync(primaryPath)) {
    throw new Error(`Primary bucket path does not exist: ${primaryPath}`);
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup bucket path does not exist: ${backupPath}`);
  }

  const options = {};
  if (checkpointDir) {
    options.checkpointManager = new CheckpointManager({ checkpointDir });
  }

  return new BucketCompareService(primaryPath, backupPath, options);
}

router.get('/compare', async (req, res) => {
  try {
    const compareService = getCompareService(req);
    const {
      algorithm = 'md5',
      prefix = '',
      useCheckpoint = 'false',
      resume = 'true',
      forceRecheck = 'false',
      sync = 'false',
      dryRun = 'false',
      syncMissingOnly = 'false',
    } = req.query;

    const result = await compareService.compareAllFiles({
      algorithm,
      prefix,
      useCheckpoint: parseBool(useCheckpoint),
      resume: parseBool(resume),
      forceRecheck: parseBool(forceRecheck),
      sync: parseBool(sync),
      dryRun: parseBool(dryRun),
      syncMissingOnly: parseBool(syncMissingOnly),
    });

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
    const {
      algorithm = 'md5',
      useCheckpoint = 'false',
      forceRecheck = 'false',
      prefix = '',
    } = req.query;
    const key = decodeURIComponent(req.params.key);

    const result = await compareService.compareSingleFile(key, {
      algorithm,
      useCheckpoint: parseBool(useCheckpoint),
      forceRecheck: parseBool(forceRecheck),
      prefix,
    });

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
    const {
      algorithm = 'md5',
      prefix = '',
      keys,
      useCheckpoint = false,
      resume = true,
      forceRecheck = false,
      sync = false,
      dryRun = false,
      syncMissingOnly = false,
    } = req.body;

    let result;
    if (keys && Array.isArray(keys) && keys.length > 0) {
      const comparisons = [];
      for (const key of keys) {
        const compareResult = await compareService.compareSingleFile(key, {
          algorithm,
          useCheckpoint: parseBool(useCheckpoint),
          forceRecheck: parseBool(forceRecheck),
          prefix,
        });
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
      result = await compareService.compareAllFiles({
        algorithm,
        prefix,
        useCheckpoint: parseBool(useCheckpoint),
        resume: parseBool(resume),
        forceRecheck: parseBool(forceRecheck),
        sync: parseBool(sync),
        dryRun: parseBool(dryRun),
        syncMissingOnly: parseBool(syncMissingOnly),
      });
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

router.post('/sync', express.json(), async (req, res) => {
  try {
    const compareService = getCompareService(req);
    const {
      algorithm = 'md5',
      prefix = '',
      useCheckpoint = false,
      resume = true,
      forceRecheck = false,
      dryRun = false,
      syncMissingOnly = false,
    } = req.body;

    const syncResult = await compareService.syncMismatchedFiles({
      algorithm,
      prefix,
      useCheckpoint: parseBool(useCheckpoint),
      resume: parseBool(resume),
      forceRecheck: parseBool(forceRecheck),
      dryRun: parseBool(dryRun),
      syncMissingOnly: parseBool(syncMissingOnly),
    });

    res.json({
      success: true,
      data: syncResult,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/checkpoints', (req, res) => {
  try {
    const checkpointDir = req.query.checkpointDir;
    const options = checkpointDir ? { checkpointDir } : {};
    const checkpointManager = new CheckpointManager(options);
    const checkpoints = checkpointManager.listAll();

    res.json({
      success: true,
      data: checkpoints,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete('/checkpoints/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const checkpointDir = req.query.checkpointDir || req.body?.checkpointDir;
    const options = checkpointDir ? { checkpointDir } : {};
    const checkpointManager = new CheckpointManager(options);
    checkpointManager.clear(taskId);

    res.json({
      success: true,
      data: { taskId, deleted: true },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/checkpoints/:taskId/clear', (req, res) => {
  try {
    const { taskId } = req.params;
    const checkpointDir = req.query.checkpointDir || req.body?.checkpointDir;
    const options = checkpointDir ? { checkpointDir } : {};
    const checkpointManager = new CheckpointManager(options);
    checkpointManager.clear(taskId);

    res.json({
      success: true,
      data: { taskId, cleared: true },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/checkpoints/generate-id', (req, res) => {
  try {
    const { primaryPath, backupPath, prefix = '', algorithm = 'md5', checkpointDir } = req.query;

    if (!primaryPath || !backupPath) {
      throw new Error('Both primaryPath and backupPath are required');
    }

    const options = checkpointDir ? { checkpointDir } : {};
    const checkpointManager = new CheckpointManager(options);
    const taskId = checkpointManager.getTaskId(primaryPath, backupPath, prefix, algorithm);

    res.json({
      success: true,
      data: { taskId, primaryPath, backupPath, prefix, algorithm },
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
