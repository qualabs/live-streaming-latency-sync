// Basic Usage Guide for playerSyncPlugin.js
//
// This plugin helps synchronize video playback across different players
// by communicating with a server to adjust latency and playback speed.
//
// 1. Include this script in your HTML page *after* the player library
//    (Dash.js, Shaka Player, HLS.js) and the video element are available.
//
// 2. Create a Sync Adapter using the factory function:
//    The `createPlayerSyncAdapter` function takes your player instance
//    and video element, and returns an adapter specific to your player type.
//
//    Parameters:
//    - playerType (string): 'dashjs', 'dashjs-config', 'shaka', or 'hlsjs'
//    - playerInstance: The initialized player object (e.js., dashjs.MediaPlayer().create(), shaka.Player(videoElement), new Hls()).
//    - videoElement: The HTML <video> element.
//
//    Example:
//    const videoElement = document.getElementById('myVideo');
//    const player = dashjs.MediaPlayer().create(); // Or Shaka/HLS instance
//    player.initialize(videoElement, 'your_manifest_url', true);
//    const syncAdapter = window.playerSyncPlugin.createPlayerSyncAdapter('dashjs', player, videoElement);
//
// 3. Start the Synchronization Loop (Optional for dashjs-config):
//    Call `startSynchronization` with the adapter instance. This function
//    starts a periodic process that adjusts the video's playback rate
//    based on the server's latency targets. This is NOT needed for the
//    'dashjs-config' type, as it uses Dash.js's internal catchup logic.
//
//    Example:
//    window.playerSyncPlugin.startSynchronization(syncAdapter);


// Class: SyncAdapter
// This is the abstract base class for all player adapters. 
// It defines the common interface and handles shared logic for synchronization, 
// such as tracking the target latency, latency targets, synchronizing the 
// client's clock with the server, and obtaining basic video metrics 
// (buffer, playback rate).
class SyncAdapter {
    constructor(videoElement) {
        this._targetLatency = null;
        this._latencyTargets = null
        this._ready = false;
        this.video = videoElement;

        // Clock Sync against server, we use the AVG offset to avoid clock drift. 
        this._clockOffset = 0;
        this._clockOffsetArray = []
        this._clockOffsetArrayMaxSize = 10; // Max size of the clock offset array
        this._clockSyncronized = false;
        this._clockSyncInProgress = false;
        
        // Clock Sync Internals
        this._clockSyncDateT0 = null;
        setInterval(() => {
            // Sincronize clock every X seconds
            this._clockSyncronized = false;
        }, 1000);
    }

    // startClockSync(): Initiates a clock synchronization cycle by recording the client's start time (T0).
    startClockSync(){
        if (! this._clockSyncronized && !this._clockSyncInProgress) {
            this._clockSyncInProgress = true;
            this._clockSyncDateT0 = new Date().getTime(); // T0
        }
    }

    // endClockSync(serverTime): Finalizes a clock synchronization cycle. It calculates the offset 
    // using the client's start time (T0), the received server time (T1), and the client's end 
    // time (T2), adds it to an array, and updates the average offset (_clockOffset).
    endClockSync(serverTime) {
        if (serverTime && this._clockSyncInProgress && this._clockSyncDateT0) {
            const clockSyncDateT2 = new Date().getTime(); // T2
            const clockSyncDateT1 = new Date(parseInt(serverTime)).getTime(); //T1
            const newOffset = clockSyncDateT1 - ((this._clockSyncDateT0 + clockSyncDateT2) / 2)
            this._clockOffsetArray.push(newOffset);

            // Removes the first element from the array if Array is full
            if (this._clockOffsetArray.length > this._clockOffsetArrayMaxSize) {
                this._clockOffsetArray.shift(); 
            }

            let offsetSum = 0;
            for (let i = 0; i < this._clockOffsetArray.length; i++) {
                offsetSum += this._clockOffsetArray[i];
            }
            
            this._clockOffset = offsetSum / this._clockOffsetArray.length;
            this._clockSyncronized = true;
            this._clockSyncInProgress = false;
            this._clockSyncDateT0 = null;
            console.log('Clock Syncronized. Offset:', this.getClockOffset())
        }
    }
    
    getClockOffset() {
        return this._clockOffset
    }

    // getBufferAhead(): Calculates and returns the amount of buffer available 
    // ahead of the playhead (in seconds).
    getBufferAhead(){
        let bufferAhead = 0;
        const video = this.video;
        if (video && video.buffered.length > 0) {
            for (let i = 0; i < video.buffered.length; i++) {
                const start = video.buffered.start(i);
                const end = video.buffered.end(i);
                if (start <= video.currentTime && video.currentTime <= end) {
                    bufferAhead = end - video.currentTime;
                    break;
                }
            }
        }
        return bufferAhead;
    }

    getPlaybackRate() {
        return this.video.playbackRate? this.video.playbackRate : 0;
    }

    setPlaybackRate(rate) {
        if (!rate) return;
        this.video.playbackRate = rate;
    }

    setLatencyTargets(latencyTargets) {
        if (!latencyTargets) return;
        this._latencyTargets = latencyTargets;
    }

    setTargetLatency(latency) {
        if (!latency) return;
        this._targetLatency = latency;
    }

    getTargetLatency() {
        return this._targetLatency;
    }

    // getClientTime(): Returns the current client time adjusted by the 
    // server clock offset (Date.now() + _clockOffset).
    getClientTime(){
        return new Date().getTime() + this.getClockOffset()
    }

    // getLatency(): Calculates and returns the current player latency 
    // (difference between the synchronized client time and the video's 
    // playhead time) in seconds.
    getLatency() {
        const pt = this.getPlayheadTime()
        if (!pt) return null;
        return (this.getClientTime() - pt) / 1000
    }

    getPlaying() {
        return !this.video.paused && !this.video.seeking
    }

    getReady() {
        if (this.getPlaying()){
            this._ready = true;
        }
        return this._ready;
    }   

    // getLiveSyncDifference(): Calculates the difference between the current 
    // latency and the target latency.
    getLiveSyncDifference(){
        const targetLatency = this.getTargetLatency();
        const liveLatency = this.getLatency();
        if (!liveLatency || !targetLatency) return null;
        console.log('Live Latency:', liveLatency);
        console.log('Target Latency:', targetLatency);
        console.log('Latency dif: ', (liveLatency - targetLatency).toFixed(4))
        console.log('Clock Offset:', this.getClockOffset());
        return liveLatency - targetLatency;
    }
}

// Class: HlsSyncAdapter
// Purpose: Adapts the synchronization logic for HLS.js. It implements 
// request/response interception to add CMCD (Common Media Client Data) 
// and process CMSD (Common Media Server Data) when HLS.js is configured 
// to send CMCD data.
// Note: This Adapter needs CMCD enabled in the player configuration.
// Inheritance: Extends SyncAdapter.
class HlsSyncAdapter extends SyncAdapter {
    constructor(hlsInstance, videoElement) {
        super(videoElement);
        this.hls = hlsInstance;
    }

    // intercept(xhr, url): Intercepts XHR requests (used by HLS.js). 
    // It appends CMCD parameters (ltc, ts, pt, pr), initiates clock 
    // synchronization, sends data to the server (/sync), and processes 
    // the CMSD response to update the target latency and latency
    // targets, then finalizes clock synchronization.
    //
    // When HLS.js is configured with CMCD v1 enabled (e.g., `cmcd: { enabled: true, version: 1, ... }`),
    // this `intercept` method should be called from the `xhrSetup` callback in the HLS.js config.
    //
    // Example HLS.js setup:
    //   const hls = new Hls({
    //     cmcd: {
    //       enabled: true,
    //       sessionId: 'your-session-id', // Make sure to provide a session ID
    //       contentId: 'your-content-id',
    //       version: 1
    //     },
    //     xhrSetup: function(xhr, url) {
    //       // Ensure syncAdapter is initialized before HLS.js makes requests
    //       if (window.syncAdapter && typeof window.syncAdapter.intercept === 'function') {
    //         // Call intercept asynchronously to avoid blocking HLS.js internal operations
    //         setTimeout(() => {
    //           window.syncAdapter.intercept(xhr, url);
    //         }, 0);
    //       }
    //     }
    //   });
    async intercept(xhr, url) {
        let parsedUrl = new URL(url);
        let cmcdParam = parsedUrl.searchParams.get('CMCD');
        if (!cmcdParam) return;
    
        //TODO: Add CMCD v2 parameters, remove when CMCD v2 is added to hls.js 
        let newCmcdParam = cmcdParam + `,ltc=${this.getLatency()},ts=${Date.now()},pt=${this.getPlayheadTime()},pr=${this.getPlaybackRate()}`;
        parsedUrl.searchParams.set('CMCD', newCmcdParam);
        
        this.startClockSync()
        const cmsd = await updateLatency(newCmcdParam);
        this.endClockSync(cmsd.serverTime)

        this.setTargetLatency(cmsd.latency)
        this.setLatencyTargets(cmsd.latencyTargets)
    }

    getBufferLength(){
        return null;
    }

    getPlayheadTime() {
        if (!this.hls.playingDate) return null;
        return this.hls.playingDate.getTime()
    }
}

// Class: ShakaSyncAdapter
// Purpose: Adapts the synchronization logic for Shaka Player. 
// It uses Shaka Player's network filters to intercept requests and responses.
// Note: This Adapter needs CMCD enabled in Shaka Player's configuration.
// Inheritance: Extends SyncAdapter.
class ShakaSyncAdapter extends SyncAdapter {
    constructor(shakaInstance, videoElement) {
        super(videoElement);
        this.shaka = shakaInstance;

        // Configures registerRequestFilter to add CMCD v2 keys (ts, pt, pr) to request URLs.
        this.shaka.getNetworkingEngine().registerRequestFilter((type, request) => {
            const url = new URL(request.uris[0]);
            const cmcdParam = url.searchParams.get('CMCD');
            if (!cmcdParam) return
            let newCmcdParam = cmcdParam + `,ts=${Date.now()},pt=${this.getPlayheadTime()},pr=${this.getPlaybackRate()}`;
            url.searchParams.set('CMCD', newCmcdParam);
            request.uris[0] = url.toString();
            
        });

        this.shaka.getNetworkingEngine().registerResponseFilter((type, response) => {
            const url = new URL(response.uri);
            const cmcdParam = url.searchParams.get('CMCD');
            if (cmcdParam) {
                // SetTimout in 0 to not block the player thread.
                setTimeout(async ()=>{
                    this.startClockSync();
                    const cmsd = await updateLatency(cmcdParam);
                    this.endClockSync(cmsd.serverTime)
                    this.setTargetLatency(cmsd.latency)
                    this.setLatencyTargets(cmsd.latencyTargets)
                }, 0)
            }
        });        
    }

    getPlayheadTime() {
        const playHeadTime =  this.shaka.getPlayheadTimeAsDate();
        if (!playHeadTime) return null;
        return playHeadTime.getTime();
    }
}

// Class: DashSyncAdapter
// Purpose: Adapts the synchronization logic for Dash.js, utilizing its CMCD v2 
// configuration and its request/response interceptors.
// Note: This adapter will turn on dash.js CMCD v2 implementation
// Inheritance: Extends SyncAdapter.
class DashSyncAdapter extends SyncAdapter {
    constructor(dashInstance, videoElement) {
        super(videoElement);
        this.dash = dashInstance;
        this._syncUrl = `${window.location.origin}/sync`;

        // Configures Dash.js to use CMCD v2 in query and response mode, targeting 
        // the /sync endpoint. It disables Dash.js's internal liveCatchup and 
        // useSuggestedPresentationDelay logic so the plugin can control it.
        this.dash.updateSettings({
            streaming: {
                // Need to disable liveCatchup and use suggested presentation delay
                delay: {
                    useSuggestedPresentationDelay: false
                },
                liveCatchup: {
                    enabled: false, 
                },  
                // Config CMCD v2 to intercept. 
                cmcd: {
                    enabled: true,
                    version: 2,
                    targets: [{
                        enabled: true,
                        cmcdMode: 'response',
                        mode: 'query',
                        url: this._syncUrl,
                        method: 'POST',
                    }],
                }
            }
        });

        // Configures addRequestInterceptor to add CMCD v2 custom keys (com.svta-latency) 
        // to the request URL and initiate clock synchronization.
        this.dash.addRequestInterceptor((request) => {
            // Only apply if the request is a CmcdResponse and the URL starts with the sync URL.
            // This is very important to start the Clock sync only for requests that we know
            // we will have a clock response
            if (request.customData.request.type === 'CmcdResponse' &&
                request.customData.request.url.startsWith(this._syncUrl)
            ) {
                console.log(request)
                const { cmcd } = request;
                if (!cmcd) return Promise.resolve(request);

                //TODO: Add Playhead time, remove this code when CMCD v2 is supported with this key
                cmcd['pt'] = this.getPlayheadTime().toFixed(0);
                request.url += encodeURIComponent(',pt=' + cmcd['pt']);
                
                const latencyTarget = this.getTargetLatency();  
                if (cmcd && latencyTarget) {
                    cmcd['com.svta-latency'] = latencyTarget;
                    request.url += encodeURIComponent(`,com.svta-latency="${cmcd['com.svta-latency']}"`);
                }
                // Clock Sync start
                this.startClockSync()
            }
            return Promise.resolve(request);
        });
    
        // Configures addResponseInterceptor to process the cmsd-dynamic header, 
        // finalize clock synchronization, and update the target latency and latency targets.
        this.dash.addResponseInterceptor((response) => {
            // Only apply if the response is a CmcdResponse and the URL starts with the sync URL.
            // This is very important to end the Clock sync only for requests that we know
            // we will have a clock response
            const request = response.request.customData.request
            if (request.type === 'CmcdResponse' &&
                request.url.startsWith(this._syncUrl)
            ) {            
                const cmcsdHeader = response.headers['cmsd-dynamic'];
                if (!cmcsdHeader) return Promise.resolve(response);

                // Update values and end clock sync
                const cmsd = parseCMSDHeader(cmcsdHeader);
                this.endClockSync(cmsd.serverTime)
                this.setTargetLatency(cmsd.latency);
                this.setLatencyTargets(cmsd.latencyTargets)
            }
            return Promise.resolve(response);
        });     
    }

    getPlayheadTime() {
        if (!this.dash.isReady()) {
            return 0
        }
        return player.getDashAdapter().getAvailabilityStartTime() + (player.time() * 1000);
    }
}

// Class: DashConfigSyncAdapter
// Purpose: A variant of the Dash.js adapter that uses the target latency received 
// from the server (cmsd.latency) to directly configure Dash.js's liveDelay 
// property and enable its internal liveCatchup mechanism. This approach is likely 
// more compatible and effective with LL-DASH. It allows Dash.js to leverage all its 
// internal low-latency optimizations (informed by the LL-DASH elements in the MPD) 
// to achieve the liveDelay specified by the plugin (which, in turn, comes from the server). 
// The plugin delegates the "how to get to" the target latency to the player, which is beneficial for LL-DASH.
// Notes: 
//    - This adapter will turn on dash.js CMCD v2 implementation
//    - startSynchronization will do nothing if this adapter is used as it uses the internal dash.js logic.
// Inheritance: Extends SyncAdapter.
class DashConfigSyncAdapter extends SyncAdapter {
    constructor(dashInstance, videoElement) {
        super(videoElement);
        this.dash = dashInstance;

        //Configures Dash.js to use CMCD v2 response mode, targeting the /sync endpoint.
        this.dash.updateSettings({
            streaming: {         
                cmcd: {
                    enabled: true,
                    version: 2,
                    targets: [{
                        enabled: true,
                        cmcdMode: 'response',
                        mode: 'query',
                        url: `${window.location.origin}/sync`,
                        method: 'POST',
                    }],
                }
            }
        });

        // Configures addRequestInterceptor to add CMCD v2 custom keys (pt, com.svta-latency) to the request URL.
        this.dash.addRequestInterceptor((request) => {
            const { cmcd } = request;
            if (!cmcd) {
                return Promise.resolve(request);
            }

            //TODO: Add Playhead time, remove this code when CMCD v2 is supported with this key
            cmcd['pt'] = this.getPlayheadTime().toFixed(0);
            request.url += encodeURIComponent(',pt=' + cmcd['pt']);

            const currentTarget = this.getTargetLatency();            
            if (cmcd && currentTarget) {
                const customKey = 'com.svta-latency';
                const customKeyValue = currentTarget;
                cmcd[customKey] = customKeyValue;
                request.url += encodeURIComponent(`,${customKey}="${customKeyValue}"`);
            }
            return Promise.resolve(request);
        });
    
        // Configures addResponseInterceptor to process the cmsd-dynamic header, update the 
        // target latency (this.setTargetLatency), and crucially, update Dash.js settings
        // (dash.updateSettings) to set liveDelay and enable liveCatchup.
        this.dash.addResponseInterceptor((response) => {
            if (response.request.customData.request.type !== 'CmcdResponse') {
                return Promise.resolve(response);
            }
            const cmcsdHeader = response.headers['cmsd-dynamic'];
            const cmsd = parseCMSDHeader(cmcsdHeader);
            if (!isNaN(cmsd.latency)) {
                this.setTargetLatency(cmsd.latency);
                this.dash.updateSettings({
                    streaming: {
                        delay: {
                            liveDelay: cmsd.latency
                        },
                        liveCatchup: {
                            enabled: true, 
                        }
                    }
                });
            }
            return Promise.resolve(response);
        });
    }
    
    getPlayheadTime() {
        if (!this.dash.isReady()) {
            return 0
        }
        return player.getDashAdapter().getAvailabilityStartTime() + (player.time() * 1000);
    }
}

// Function: createPlayerSyncAdapter
// Purpose: This is a factory function that creates and returns the appropriate 
// sync adapter instance (HlsSyncAdapter, ShakaSyncAdapter, DashSyncAdapter, 
// or DashConfigSyncAdapter) based on the provided playerType.
function createPlayerSyncAdapter(playerType, playerInstance, videoElement) {
    if (playerType === 'hlsjs') {
        return new HlsSyncAdapter(playerInstance, videoElement);
    } else if (playerType === 'shaka') {
        return new ShakaSyncAdapter(playerInstance, videoElement);
    } else if (playerType === 'dashjs') {
        return new DashSyncAdapter(playerInstance, videoElement);
    } else if (playerType === 'dashjs-config') {
        return new DashConfigSyncAdapter(playerInstance, videoElement);
    }
    throw new Error('Player not supported: ' + playerType);
}

// Default configuration for the synchronization logic
const defaultPlayerSyncConfig = {
    intervalMs: 100, // Interval for checking and adjusting playback, in milliseconds.
    deadZoneSecs: 0.005, // If |liveSyncDifference| is less than this, playback rate is set to 1. In seconds.
    // Rules for speeding up playback when the client is behind the target latency.
    // Sorted by threshold (ascending). 'threshold' is the max liveSyncDifference (in seconds) for this rate.
    catchUpRules: [
        { threshold: 0.1, playbackRate: 1.01 }, // If behind by 0s to 0.1s
        { threshold: 0.4, playbackRate: 1.1 },  // If behind by >0.1s to 0.4s
        { threshold: Infinity, playbackRate: 2.0 } // If behind by >0.4s
    ],
    // Rules for slowing down playback when the client is ahead of the target latency.
    // Sorted by threshold (descending, i.e., from less negative to more negative).
    // 'threshold' is the min liveSyncDifference (in seconds) for this rate.
    slowDownRules: [
        { threshold: -0.1, playbackRate: 0.99 }, // If ahead by 0s to 0.1s (liveSyncDifference is -0.1 to 0)
        { threshold: -0.4, playbackRate: 0.90 }, // If ahead by >0.1s to 0.4s (liveSyncDifference is -0.4 to -0.1)
        { threshold: -Infinity, playbackRate: 0.5 } // If ahead by >0.4s (liveSyncDifference is < -0.4)
    ]
};

// Function: startSynchronization
// Purpose: Initiates the playback synchronization loop for a given adapter. 
// This loop adjusts the video's playback rate (adapter.setPlaybackRate) based 
// on the difference between the current latency and the target 
// latency (adapter.getLiveSyncDifference).
// Parameters:
// - adapter: The sync adapter instance.
// - userConfig (optional): An object to override default synchronization parameters.
//   - intervalMs (number): Interval for sync checks in milliseconds.
//   - deadZoneSecs (number): Latency difference threshold below which no action is taken.
//   - catchUpRules (array): Rules for speeding up. Each rule: { threshold: number, playbackRate: number }.
//   - slowDownRules (array): Rules for slowing down. Each rule: { threshold: number, playbackRate: number }.
function startSynchronization(adapter, userConfig = {}) {
    if (adapter instanceof DashConfigSyncAdapter) {
        console.log('startSynchronization: DashConfigSyncAdapter detected, skipping playback rate adjustments as Dash.js handles catchup.');
        return;
    }

    const config = {
        ...defaultPlayerSyncConfig,
        ...userConfig,
        // Ensure arrays are fully replaced if provided, not shallow merged.
        catchUpRules: userConfig.catchUpRules ? [...userConfig.catchUpRules] : [...defaultPlayerSyncConfig.catchUpRules],
        slowDownRules: userConfig.slowDownRules ? [...userConfig.slowDownRules] : [...defaultPlayerSyncConfig.slowDownRules],
    };

    setInterval(() => {
        if (adapter.getPlaying()) {
            const liveSyncDifference = adapter.getLiveSyncDifference();
            // liveSyncDifference can be null if target latency or playhead time is not available yet.
            if (liveSyncDifference === null || liveSyncDifference === undefined) {
                return;
            }

            if (Math.abs(liveSyncDifference) < config.deadZoneSecs) {
                adapter.setPlaybackRate(1);
                return;
            }

            if (liveSyncDifference > 0) { // Client is behind, speed up
                for (const rule of config.catchUpRules) {
                    if (liveSyncDifference <= rule.threshold) {
                        adapter.setPlaybackRate(rule.playbackRate);
                        return;
                    }
                }
            } else { // Client is ahead (liveSyncDifference < 0), slow down
                for (const rule of config.slowDownRules) {
                    if (liveSyncDifference >= rule.threshold) {
                        adapter.setPlaybackRate(rule.playbackRate);
                        return;
                    }
                }
            }
        }
    }, config.intervalMs);
}

// Function: updateLatency
// Purpose: Internal function that sends CMCD data to the server's /sync endpoint and processes the 
// cmsd-dynamic response header.
async function updateLatency(cmcd) {
    try {
      const response = await fetch(window.location.origin + `/sync?CMCD=${encodeURIComponent(cmcd)}`);
      const cmsdHeader = response.headers.get('cmsd-dynamic');
      if (!cmsdHeader) return;
      return parseCMSDHeader(cmsdHeader);
    } catch (e) { 
      console.error('Error updating latency:', e);
    }
}

// Function: parseCMSDHeader
// Purpose: Internal function that parses the cmsd-dynamic header string to 
// extract values for com.svta-latency, com.svta-latency-targets, and com.svta-time.
function parseCMSDHeader (cmsdHeader) {
    const latencyMatch = cmsdHeader.match(/com\.svta-latency="([^"]+)"/);
    const latencyTargetsMatch = cmsdHeader.match(/com\.svta-latency-targets="([^"]+)"/);
    const timeMatch = cmsdHeader.match(/com\.svta-time="([^"]+)"/);

    const latency = latencyMatch ? Number(latencyMatch[1]) : null;
    const latencyTargets = latencyTargetsMatch ? latencyTargetsMatch[1] : null;
    const serverTime = timeMatch ? timeMatch[1] : null;   

    return { latency, latencyTargets, serverTime };
}

(() => {
    const playerSyncPlugin = {
        createPlayerSyncAdapter,
        startSynchronization,
        // Expose default config for inspection or for users to base their custom configs on.
        getDefaultSyncConfig: () => ({ ...defaultPlayerSyncConfig, 
            catchUpRules: [...defaultPlayerSyncConfig.catchUpRules],
            slowDownRules: [...defaultPlayerSyncConfig.slowDownRules]
        })
    };

    if (typeof window !== 'undefined') {
        window.playerSyncPlugin = playerSyncPlugin;
    }
})();