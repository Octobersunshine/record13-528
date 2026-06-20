const http = require('http');
const path = require('path');
const app = require('../src/app');

const testDataDir = path.join(__dirname, 'test-data');
const primaryDir = path.join(testDataDir, 'primary');
const backupDir = path.join(testDataDir, 'backup');

const PORT = 3100;
let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('\n=== Running API Tests ===\n');

  await startServer();

  try {
    console.log('--- Test 1: GET / (root) ---');
    const rootRes = await makeRequest('GET', '/');
    console.log('Status:', rootRes.statusCode);
    console.log('Body:', JSON.stringify(rootRes.body, null, 2));

    console.log('\n--- Test 2: GET /api/health ---');
    const healthRes = await makeRequest('GET', '/api/health');
    console.log('Status:', healthRes.statusCode);
    console.log('Body:', JSON.stringify(healthRes.body, null, 2));

    const primaryPath = primaryDir.replace(/\\/g, '/');
    const backupPath = backupDir.replace(/\\/g, '/');

    console.log('\n--- Test 3: GET /api/compare (all files) ---');
    const compareUrl = `/api/compare?primaryPath=${encodeURIComponent(primaryPath)}&backupPath=${encodeURIComponent(backupPath)}`;
    const compareRes = await makeRequest('GET', compareUrl);
    console.log('Status:', compareRes.statusCode);
    console.log('Summary:', JSON.stringify(compareRes.body.data.summary, null, 2));

    console.log('\n--- Test 4: GET /api/compare/file1.txt (single file) ---');
    const singleUrl = `/api/compare/${encodeURIComponent('file1.txt')}?primaryPath=${encodeURIComponent(primaryPath)}&backupPath=${encodeURIComponent(backupPath)}`;
    const singleRes = await makeRequest('GET', singleUrl);
    console.log('Status:', singleRes.statusCode);
    console.log('Body:', JSON.stringify(singleRes.body, null, 2));

    console.log('\n--- Test 5: POST /api/compare (batch) ---');
    const batchRes = await makeRequest('POST', '/api/compare', {
      primaryPath,
      backupPath,
      keys: ['file1.txt', 'file2.txt', 'nonexistent.txt'],
    });
    console.log('Status:', batchRes.statusCode);
    console.log('Body:', JSON.stringify(batchRes.body.data, null, 2));

    console.log('\n=== All API tests passed ===');
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await stopServer();
  }
}

runApiTests();
