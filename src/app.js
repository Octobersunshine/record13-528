const express = require('express');
const compareRoutes = require('./routes/compare');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', compareRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'Bucket Compare API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      compareAll: 'GET /api/compare?primaryPath=...&backupPath=...&prefix=...&algorithm=md5',
      compareSingle: 'GET /api/compare/{key}?primaryPath=...&backupPath=...&algorithm=md5',
      compareBatch: 'POST /api/compare { primaryPath, backupPath, keys: [], algorithm }',
    },
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
