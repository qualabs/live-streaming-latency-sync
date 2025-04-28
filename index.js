const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const REFERENCE_TIMESTAMP = process.env.REFERENCE_TIMESTAMP || '0';
const REFERENCE_PLAYHEAD = process.env.REFERENCE_PLAYHEAD || '0';
const LATENCY_TARGET = process.env.LATENCY_TARGET || '1000'; // ms, default example

app.use((req, res, next) => {
  const syncKey = `${REFERENCE_PLAYHEAD};${REFERENCE_TIMESTAMP};${LATENCY_TARGET}`;
  res.setHeader('sync-key', syncKey);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
