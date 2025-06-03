# Global playback synchronization for HLS and MPEG-DASH live content

This project demonstrates global synchronization for live media playback using CMCD v2 and CMSD. 

It includes:
- A **server** built with Node.js and Express to manage the latency adjustments and Clock reference using CMCD v2 and CMSD as interface with the players
- A webpage to configure the server parameters and monitor the latency across players
- A Javascript plugin for video players that uses CMCD v2 to report latency and the server and adjust the palyer latency based on the CMSD data from the server 
- A demo using **Dash.js** with the Javascritp plugin.
- A demo using **Shaka Player** with the Javascritp plugin.
- A demo using **HLS.js** with the Javascritp plugin.

## How it works

### Server Synchronization
The server recevies all CMCD v2 informaation form the players and decides the best latency target.
- **Sync endpoint**: The player sends CMCD v2 information to a server endpoint `/sync`. With this information the server is able to make desitions on the global sync target based on the playead, buffer and other CMCD v2 keys reported by the players.
- **CMSD Custom keys**: For each response, the server sets CMCSD headers (`Cmsd-Dynamic`) and send custom keys to communicate latency(`com.svta-latency`) in seconds, an array of latency targets in seconds (`com.svta-latency-targets`) and the reference Clock to the client as UNIX timestamp (`com.svta-time`). 
- **Customization**: Diffrent algorihtms could be implemented to set the latency target/s (see the customization chapter).

### Client Synchronization
The clients run a custom synchronization plugin to ensure synchronized media playback:
- **CMSD Headers Parsing**: The client reads the `Cmsd-Dynamic` headers sent by the server to extract latency, latency targets, and reference clock.
- **Clock Syncronization**: The plugin messure the offset between the local clock and the server clock to adjust the reference clock used for the syncronization.
- **Global Sync Function**: The plugin adjusts playback rate based on the latency values received from the server. 
- **Customization**: Diffrent algorihtms could be implemented based on the latency messrue, bitrate lader and buffer status (see the customization chapter).
 
## How to Run

### Prerequisites
- **Docker** and **Docker Compose** (Optional)
- **Node.js** (Tested in v20.11.1)

### Running with Docker
1. (Optional) Copy the `.env-example` file and rename it to `.env`. Update the variables as needed.

2. Build and start the services using Docker Compose:
   ```bash
   docker-compose up
   ```

3. Access the demos and server webpage configuration:
   - [http://localhost:3000](http://localhost:3000)

### Running with Node.js
1. Navigate to the `root` directory and install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm run start
   ```
3. Open the [the demo site](http://localhost:3000)` in your browser to test the sync service.

## Server API
Endpoint: `/update-latency`

The server exposes an endpoint to dynamically update the latency target. To set the latency you can use [the update latency site](http://localhost:3000/update-latency) or a curl command:

### Example:
```bash
curl -X POST http://localhost:3000/update-latency \
-H "Content-Type: application/json" \
-d '{"latencyTarget": "6", "latencyTargets": "3,6,9", "disableClockSync": false}'
```

### Environment Variables
The server uses the following environment variables:

- `PORT`: Defines the port the server listens on (default: `3000`).
- `LATENCY_TARGETS`: Specifies a list of latency targets for clients (e.g., `3,8,12`).
- `LATENCY_TARGET`: Sets the default latency target (e.g., `12`).
- `DISABLE_CLOCK_SYNC`: Sets the default Clock Sync configuration (default: `false`)

Example .env file:
```bash
PORT=3000
LATENCY_TARGETS=3,8,12
LATENCY_TARGET=12
DISABLE_CLOCK_SYNC=false
```

## playerSyncPlugin.js Usage
This plugin helps synchronize video playback across different players
by communicating with a server to adjust latency and playback speed.

1. Include this script in your HTML page *after* the player library
   (Dash.js, Shaka Player, HLS.js) and the video element are available.
2. Create a Sync Adapter using the factory function:
   The `createPlayerSyncAdapter` function takes your player instance
   and video element, and returns an adapter specific to your player type.
   Parameters:
   - playerType (string): `dashjs`, `dashjs-config`, `shaka`, or `hlsjs`
   - playerInstance: The initialized player object (e.js., dashjs.MediaPlayer().create(), shaka.Player(videoElement), new Hls()).
   - videoElement: The HTML `<video>` element.
   
   Example:
   ```Javascript
   const videoElement = document.getElementById('myVideo');
   const player = dashjs.MediaPlayer().create(); // Or Shaka/HLS instance
   player.initialize(videoElement, 'your_manifest_url', true);
   const syncAdapter = window.playerSyncPlugin.createPlayerSyncAdapter('dashjs', player, videoElement);
   ```

3. Start the Synchronization Loop (Optional for dashjs-config):
   Call `startSynchronization` with the adapter instance. This function
   starts a periodic process that adjusts the video's playback rate
   based on the server's latency targets. This is **NOT** needed for the
   `dashjs-config` type, as it uses Dash.js's internal catchup logic.
   
   Example:
   ```Javascript
   window.playerSyncPlugin.startSynchronization(syncAdapter);
   ```

## Customizations

### Custom Glogal Latency Target Logic
In the `/sync` route, there is a placeholder to implement custom logic for setting the latency target based on the CMCD data and business requirements. This is marked with the following comment in the code:

```javascript
//CHANGEME: Set the latency target based on the CMCD data, content configuration and other business rules
```

### Custom Syncronization Algorithms
Write your custom syncronization algoritmb based on the structure of the `startSynchronization` function and using all the adapters methods available.

Example:
```Javascript
function startMyCustomSynchronization(adapter, config = {}) {
    // Dont use DashConfigSyncAdapter as it uses Dash.js's internal catchup logic
    if (adapter instanceof DashConfigSyncAdapter) {
        console.log("Sincronización personalizada no necesaria para DashConfigSyncAdapter.");
        return;
    }

    setInterval(() => {
        // TODO: Replace with your logic
    }, 100);
```