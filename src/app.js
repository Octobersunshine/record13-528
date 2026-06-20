const express = require('express');
const compareRoutes = require('./routes/compare');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', compareRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'Bucket Compare API',
    version: '1.2.0',
    endpoints: {
      health: 'GET /api/health',
      compareAll: 'GET /api/compare?primaryPath=...&backupPath=...&prefix=...&algorithm=md5&useCheckpoint=true&resume=true&forceRecheck=false&sync=false&dryRun=false&syncMissingOnly=false',
      compareSingle: 'GET /api/compare/{key}?primaryPath=...&backupPath=...&algorithm=md5&useCheckpoint=true&forceRecheck=false',
      compareBatch: 'POST /api/compare { primaryPath, backupPath, keys: [], algorithm, useCheckpoint, resume, forceRecheck, sync, dryRun, syncMissingOnly }',
      syncMismatched: 'POST /api/sync { primaryPath, backupPath, prefix, algorithm, useCheckpoint, resume, forceRecheck, dryRun, syncMissingOnly }',
      listCheckpoints: 'GET /api/checkpoints',
      generateTaskId: 'GET /api/checkpoints/generate-id?primaryPath=...&backupPath=...&prefix=...&algorithm=md5',
      deleteCheckpoint: 'DELETE /api/checkpoints/{taskId} or POST /api/checkpoints/{taskId}/clear',
    },
    features: {
      checkpoint: {
        description: '断点续传：中断后重新运行自动跳过已校验文件',
        params: {
          useCheckpoint: '是否启用断点续传 (true/false)',
          resume: '是否从上次断点继续 (true/false)',
          forceRecheck: '是否强制重新校验所有文件 (true/false)',
        },
      },
      sync: {
        description: '自动同步：对比后将主桶不一致/缺失文件同步到备桶',
        params: {
          sync: '对比完成后自动同步不一致文件 (true/false)',
          dryRun: '试运行模式，只列出将同步的文件不实际复制 (true/false)',
          syncMissingOnly: '只同步主桶有、备桶没有的文件，不同步哈希不一致的 (true/false)',
        },
      },
    },
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
