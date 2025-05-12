const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const LATENCY_TARGETS = process.env.LATENCY_TARGET || '3,6,9';
let latencyTarget = process.env.LATENCY_TARGET || '12';

app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Cmsd-Dynamic');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader(
    'Cmsd-Dynamic',
    `com.svta-latency="${latencyTarget}"` +
    `,com.svta-latency-targets="${LATENCY_TARGETS}"`
  );

  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  const queryIndex = req.url.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = decodeURIComponent(req.url.substring(queryIndex + 1));
    const currentLatencyTarget = queryString.match(/com\.svta-latency="([^"]+)"/)[1];
    // Add here custom latency target to the response header.
  }

  res.status(200).end();
});

app.post('/update-latency', (req, res) => {
  const { latency } = req.body;
  if (latency) {
    latencyTarget = latency;
    res.json({ message: 'Latency target updated', latency: latencyTarget });
  } else {
    res.status(400).json({ error: 'Missing latency parameter in request body' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
