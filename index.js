const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const LATENCY_TARGETS = process.env.LATENCY_TARGET || '3,6,9';
const LATENCY_TARGET = process.env.LATENCY_TARGET || '9';

app.use((req, res, next) => {
  res.setHeader(
    'Cmsd-Dynamic',
    `com.svta-latency="${LATENCY_TARGET}"` +
    `,com.svta-latency-targets="${LATENCY_TARGETS}"`
  );

  res.setHeader('Access-Control-Expose-Headers', 'Cmsd-Dynamic');

  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/', (req, res) => {
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
