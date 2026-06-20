const express = require('express');
const compareRoutes = require('./routes/compare');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', compareRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'Bucket Compare API',
    version: '1.1.0',
    endpoints: {
      health: 'GET /api/health',
      compareAll: 'GET /api/compare?primaryPath=...&backupPath=...&prefix=...&algorithm=md5&useCheckpoint=true&resume=true&forceRecheck=false',
      compareSingle: 'GET /api/compare/{key}?primaryPath=...&backupPath=...&algorithm=md5&useCheckpoint=true&forceRecheck=false',
      compareBatch: 'POST /api/compare { primaryPath, backupPath, keys: [], algorithm, useCheckpoint, resume, forceRecheck }',
      listCheckpoints: 'GET /api/checkpoints',
      generateTaskId: 'GET /api/checkpoints/generate-id?primaryPath=...&backupPath=...&prefix=...&algorithm=md5',
      deleteCheckpoint: 'DELETE /api/checkpoints/{taskId} or POST /api/checkpoints/{taskId}/clear',
    },
    checkpointFeature: {
      description: '断点续传功能：中断后重新运行会自动跳过已校验文件',
      params: {
        useCheckpoint: '是否启用断点续传 (true/false)',
        resume: '是否从上次断点继续 (true/false)',
        forceRecheck: '是否强制重新校验所有文件 (true/false)',
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
