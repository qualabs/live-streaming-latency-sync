import express from 'express';
import parseCMCDQueryToJson from './parseCMCDQueryToJson.js';
import { savePlayerData, getPlayerData, clearAllData } from './datastore.js';

const app = express();


const PORT = process.env.PORT || 3000;
const DEFALUT_LATENCY_TARGETS = process.env.LATENCY_TARGETS || '3,6,9';
const DEFALUT_LATENCY_TARGET = process.env.LATENCY_TARGET || '12';

let latencyTargets = DEFALUT_LATENCY_TARGETS;
let latencyTarget = DEFALUT_LATENCY_TARGET;

app.use(express.json());
app.use('/', express.static('public'));

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/sync', (req, res) => {
  if(! req.query['CMCD']){
    // Check if CMCD parameter is present in the query string
    res.status(400).json({ error: 'Missing CMCD parameter in request query' });
    return;
  }
  
  // Pase CMCD query to JSON
  // console.log("Received CMCD:", req.query['CMCD']);
  const cmcdData = parseCMCDQueryToJson(req.query['CMCD']);
  savePlayerData(cmcdData);

  //CHANGEME: Set the latency target based on the CMCD data and business logic
  // const playerCurrentLatencyTarget = cmcdData['com.svta-latency']
  const CMSDDynamicValue = `com.svta-latency="${latencyTarget}",com.svta-latency-targets="${latencyTargets}"`;
  res.setHeader('Cmsd-Dynamic',CMSDDynamicValue);
  // console.log("Sending CMSD Dynamic Header:", CMSDDynamicValue);
  //CHANGEME: End

  res.status(200).end();
});

app.get('/player-data', (req, res) => {
  // Get player data
  const playerData = getPlayerData();
  res.json(playerData);
  res.status(200).end();
});

app.get('/clear-player-data', (req, res) => {
  // Get player data
  clearAllData();
  res.status(200).end();
});

app.post('/update-latency', (req, res) => {
  // Update latencyTarget and latencyTargets based on request body
  if (req.body.latencyTarget && req.body.latencyTargets) {
    latencyTarget = req.body.latencyTarget;
    latencyTargets = req.body.latencyTargets;
    console.log(`Updated latencyTarget to ${latencyTarget} and latencyTargets to ${latencyTargets}`);
    res.json({ 
      message: 'latencyTarget and latencyTargets updated', 
      latency: latencyTarget, 
      latencyTargets: latencyTargets 
    });
  } else {
    // Handle missing parameters
    res.status(400).json({ error: 'Missing latencyTarget and/or latencyTargets parameter in request body' });
  }
});

app.get('/get-latency', (req, res) => {
  // Get latencyTarget and latencyTargets based on request body
  res.json({ 
    message: 'latencyTarget and latencyTargets updated', 
    latency: latencyTarget, 
    latencyTargets: latencyTargets 
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});