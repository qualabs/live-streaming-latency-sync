// In-memory store for player data.
// Structure:
// {
//   "sessionId1": [
//     { serverTimestamp: 1678886400000, latency: 120, playerReportTime: 30500 },
//     { serverTimestamp: 1678886405000, latency: 110, playerReportTime: 31000 }
//     // ... more data points for sessionId1
//   ],
//   "sessionId2": [ /* ... data points for sessionId2 ... */ ]
// }
// - serverTimestamp: The timestamp (in milliseconds) when the data point was saved by the server. Used for timeout.
// - latency: The 'ltc' value from CMCD data.
// - playerReportTime: The 'ts' value from CMCD data, representing the player's media/content timestamp.
let playerDataStore = {};

const DATA_TIMEOUT_MINUTES = 60; // Example: data older than 60 minutes will be removed.
const DATA_TIMEOUT_MS = DATA_TIMEOUT_MINUTES * 60 * 1000;


export function savePlayerData(cmcdData) {
  // Extract required data from the CMCD object.
  let latency, sessionId, playerReportTime, playerPlayHead
  try {
    latency = parseFloat(cmcdData['ltc']); // Latency in milliseconds.
    sessionId = cmcdData['sid']; // Unique session identifier.
    playerReportTime = parseInt(cmcdData['ts']); // Player's media timestamp in milliseconds.
    playerPlayHead = parseInt(cmcdData['pt']); // Player's media timestamp in milliseconds.
  } catch (error) {
    console.warn('Invalid or missing CMCD data fields (sid, ltc, ts). Data not saved. Received:', cmcdData);
    return
  }

  // Get the current timestamp on the server.
  // This will be used to determine the age of data points for pruning.
  const currentServerTimestamp = Date.now();

  // Ensure an array exists in playerDataStore for this sessionId.
  // If this is the first data point for this session, initialize an empty array.
  if (!playerDataStore[sessionId]) {
    playerDataStore[sessionId] = [];
  }

  // Add the new data point to the array for the current session.
  // Each data point includes the server timestamp (for aging),
  // the reported latency, and the player's content timestamp.
  playerDataStore[sessionId].push({
    serverTimestamp: currentServerTimestamp,
    latency: latency,
    playerReportTime: playerReportTime
  });

  // Prune old data points for the *current session*.
  // This keeps the data store from growing indefinitely and ensures data is relevant.
  // It filters the array, keeping only data points whose serverTimestamp is within
  // the DATA_TIMEOUT_MS window from the currentServerTimestamp.
  playerDataStore[sessionId] = playerDataStore[sessionId].filter(dataPoint => {
    return (currentServerTimestamp - dataPoint.serverTimestamp) < DATA_TIMEOUT_MS;
  });

  // Optional: Log the number of data points for the current session after saving and pruning.
  // console.log(`Data saved for session ${sessionId}. Total points for session: ${playerDataStore[sessionId].length}`);
}

export function getPlayerData() {
  // Return the data points for the specified sessionId.
  removeOldData();
  return playerDataStore;
}

export function clearAllData() {
    playerDataStore = {}
}

function removeOldData() {
  const currentTime = Date.now();
  let totalPointsBeforePrune = 0;
  let totalPointsAfterPrune = 0;

  for (const sid in playerDataStore) {
    // Ensure it's an own property and not from the prototype chain.
    if (playerDataStore.hasOwnProperty(sid)) {
      const sessionData = playerDataStore[sid];
      totalPointsBeforePrune += sessionData.length;

      const prunedSessionData = sessionData.filter(
        dataPoint => (currentTime - dataPoint.serverTimestamp) < DATA_TIMEOUT_MS
      );

      if (prunedSessionData.length > 0) {
        playerDataStore[sid] = prunedSessionData;
        totalPointsAfterPrune += prunedSessionData.length;
      } else {
        // Optional: If a session has no data points left after pruning,
        // delete the session key itself to free up memory.
        delete playerDataStore[sid];
      }
    }
  }
}