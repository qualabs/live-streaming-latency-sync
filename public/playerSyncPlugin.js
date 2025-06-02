class SyncAdapter {
    constructor(videoElement) {
        this._targetLatency = null;
        this._latencyTargets = null
        this._ready = false;
        this.video = videoElement;

        // Clock Sync against server
        this._clockOffset = 0;
        this._clockSyncronized = false;
        this._clockSyncInProgress = false;
        
        // Clock Sync Internals
        this._clockSyncDateT0 = null;
        setInterval(() => {
            // Sincronize clock every X seconds
            this._clockSyncronized = false;
        }, 5000);
    }
    seek(time) {
        if (!time) return;
        this.video.currentTime = this.video.currentTime - time;
    }
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
    getClientTime(){
        return new Date().getTime() + this._clockOffset
    }
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
    getLiveSyncDifference(){
        const targetLatency = this.getTargetLatency();
        const liveLatency = this.getLatency();
        if (!liveLatency || !targetLatency) return null;
        console.log('Live Latency:', liveLatency);
        console.log('Target Latency:', targetLatency);
        console.log('Latency dif: ', (liveLatency - targetLatency).toFixed(4))
        console.log('Clock Offset:', this._clockOffset);
        return liveLatency - targetLatency;
    }
}

class HlsSyncAdapter extends SyncAdapter {
    constructor(hlsInstance, videoElement) {
        super(videoElement);
        this.hls = hlsInstance;
    }

    async intercept(xhr, url) {
        let parsedUrl = new URL(url);
        let cmcdParam = parsedUrl.searchParams.get('CMCD');
        if (!cmcdParam) return;
    
        let newCmcdParam = cmcdParam + `,ltc=${this.getLatency()},ts=${Date.now()},pt=${this.getPlayheadTime()},pr=${this.getPlaybackRate()}`;
        parsedUrl.searchParams.set('CMCD', newCmcdParam);

        const cmsd = await updateLatency(cmcdParam);
        this.setTargetLatency(cmsd.latency)
        this.setLatencyTargets(cmsd.latencyTargets)
        // TODO: Sincronize client time
        // this.setClock(cmsd.serverTime)
    }
    getBufferLength(){
        return null;
    }
    getPlayheadTime() {
        if (!this.hls.playingDate) return null;
        return this.hls.playingDate.getTime()
    }
}

class ShakaSyncAdapter extends SyncAdapter {
    constructor(shakaInstance, videoElement) {
        super(videoElement);
        this.shaka = shakaInstance;

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
                    const cmsd = await updateLatency(cmcdParam);
                    this.setTargetLatency(cmsd.latency)
                    this.setLatencyTargets(cmsd.latencyTargets)
                    // TODO: Sincronize client time
                    // this.setClock(cmsd.serverTime)
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

class DashSyncAdapter extends SyncAdapter {
    constructor(dashInstance, videoElement) {
        super(videoElement);
        this.dash = dashInstance;

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
                        url: `${window.location.origin}/sync`,
                        method: 'POST',
                    }],
                }
            }
        });

        this.dash.addRequestInterceptor((request) => {
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

            //Clock Sync start
            if (! this._clockSyncronized && !this._clockSyncInProgress) {
                this._clockSyncInProgress = true;
                this._clockSyncDateT0 = new Date().getTime(); // T0
            }
            return Promise.resolve(request);
        });
    
        this.dash.addResponseInterceptor((response) => {
            const cmcsdHeader = response.headers['cmsd-dynamic'];
            if (!cmcsdHeader) return Promise.resolve(response);

            const cmsd = parseCMSDHeader(cmcsdHeader);
            this.setTargetLatency(cmsd.latency);
            this.setLatencyTargets(cmsd.latencyTargets)

            // Set clock
            if (this._clockSyncInProgress) {
                const clockSyncDateT1 = new Date(parseInt(cmsd.serverTime)).getTime();
                const clockSyncDateT2 = new Date().getTime(); // T2
                this._clockOffset = clockSyncDateT1 - ((this._clockSyncDateT0 + clockSyncDateT2) / 2);
                this._clockSyncronized = true;
                this._clockSyncInProgress = false;
                this._clockSyncDateT0 = null;
            }

            // this.setClock(cmsd.serverTime)
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

class DashConfigSyncAdapter extends SyncAdapter {
    constructor(dashInstance, videoElement) {
        super(videoElement);
        this.dash = dashInstance;
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
    
        this.dash.addResponseInterceptor((response) => {
            if (response.request.customData.request.type !== 'CmcdResponse') {
                return Promise.resolve(response);
            }
            const cmcsdHeader = response.headers['cmsd-dynamic'];
            const cmsd = parseCMSDHeader(cmcsdHeader);
            if (!isNaN(cmsd.latency)) {
                this.setTargetLatency(latency);
                this.dash.updateSettings({
                    streaming: {
                        delay: {
                            liveDelay: latency
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
}

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

function startSynchronization(adapter) {
    if (adapter instanceof DashConfigSyncAdapter) {
        return;
    }

    setInterval(() => {
        if (adapter.getPlaying()) {
            const liveSyncDifference = adapter.getLiveSyncDifference();
            if (!liveSyncDifference) return;

            if (Math.abs(liveSyncDifference) < 0.005) {
                adapter.setPlaybackRate(1);
                return;
            }
            if (liveSyncDifference > 0) {
                if (liveSyncDifference <= 0.1) {
                    adapter.setPlaybackRate(1.01);
                } else if (liveSyncDifference <= 0.4) {
                    adapter.setPlaybackRate(1.1);
                } else {
                    adapter.setPlaybackRate(2);
                }
            } else {
                if (liveSyncDifference >= -0.1) {
                    adapter.setPlaybackRate(0.99);
                } else if (liveSyncDifference >= -0.4) {
                    adapter.setPlaybackRate(0.9);
                } else {
                    adapter.setPlaybackRate(0.5);
                }
            }
        }
    }, 100);
}

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

function parseCMSDHeader (cmsdHeader) {
    const latencyMatch = cmsdHeader.match(/com\.svta-latency="([^"]+)"/);
    const latencyTargetsMatch = cmsdHeader.match(/com\.svta-latency-targets="([^"]+)"/);
    const timeMatch = cmsdHeader.match(/com\.svta-time="([^"]+)"/);

    const latency = latencyMatch ? Number(latencyMatch[1]) : null;
    const latencyTargets = latencyTargetsMatch ? latencyTargetsMatch[1] : null;
    const serverTime = timeMatch ? timeMatch[1] : null;   

    return { latency, latencyTargets, serverTime };
}

// TODO configs:
// const defaultConfig = {
//     liveMaxSync: 2,
//     catchUp: {
//         high: 2,
//         medium: 0.4,
//         low: 0.1 
//     },
//     url: `${window.location.origin}/sync`
// };

// function configurePlayerSyncPlugin(customConfig) {
//     return { ...defaultConfig, ...customConfig };
// }


(() => {
    const playerSyncPlugin = {
        createPlayerSyncAdapter,
        startSynchronization,
        updateLatency,
        // configure: configurePlayerSyncPlugin
    };

    if (typeof window !== 'undefined') {
        window.playerSyncPlugin = playerSyncPlugin;
    }
})();