const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const LATENCY_TARGETS = process.env.LATENCY_TARGET || '3,6,9';
let latencyTarget = process.env.LATENCY_TARGET || '12';

app.use(express.json()); // Middleware to parse JSON request bodies

app.use((req, res, next) => {
  res.setHeader(
    'Cmsd-Dynamic',
    `com.svta-latency="${latencyTarget}"` +
    `,com.svta-latency-targets="${LATENCY_TARGETS}"`
  );

  res.setHeader('Access-Control-Expose-Headers', 'Cmsd-Dynamic');

  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
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
