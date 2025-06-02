class SyncAdapter {
    constructor(videoElement) {
        this._theTargetDelay = null;
        this.video = videoElement;
    }
    setTargetDelay(delay) {
        this._theTargetDelay = delay;
    }
    getTargetDelay() {
        return this._theTargetDelay;
    }
}

class HlsSyncAdapter extends SyncAdapter {
    constructor(hlsInstance, videoElement) {
        super(videoElement);
        this.hls = hlsInstance;
    }
    seek(time) {
        this.video.currentTime = time;
    }
    setPlaybackRate(rate) {
        this.video.playbackRate = rate;
    }
    getLatency() {
        /*if (this.hls && this.hls.latency !== undefined) {
            return this.hls.latency;
        }*/
        return (new Date().getTime() - this.hls.playingDate?.getTime())/1000
    }
    getCurrentTime() {
        return this.hls.playingDate?.getTime()
    }
}

class ShakaSyncAdapter extends SyncAdapter {
    constructor(shakaInstance, videoElement) {
        super(videoElement);
        this.shaka = shakaInstance;
    }
    seek(time) {
        this.video.currentTime = time;
    }
    setPlaybackRate(rate) {
        this.video.playbackRate = rate;
    }
    getLatency() {
        /*if (this.shaka && this.shaka.getStats) {
            const stats = this.shaka.getStats();
            if (stats && stats.liveLatency) {
                return stats.liveLatency;
            }
        }*/
        return (new Date().getTime() - this.shaka.getPlayheadTimeAsDate()?.getTime()) /1000
    }

    getCurrentTime() {
        return this.shaka.getPlayheadTimeAsDate()?.getTime();
    }
}

class DashSyncAdapter extends SyncAdapter {
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

            const currentTarget = this.getTargetDelay();            
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
            const latency = parseCMSDHeader(cmcsdHeader);
            if (!isNaN(latency)) {
                this.setTargetDelay(latency);
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
    }
    throw new Error('Player not supported: ' + playerType);
}

function getLiveSyncDifference(adapter) {
    const targetLatency = adapter.getTargetDelay();
    if (!targetLatency) {
        return null;
    }
    let liveLatency = adapter.getLatency();
    console.log('Live Latency:', liveLatency);
    console.log('Target Latency:', targetLatency);
    console.log(liveLatency - targetLatency)
    return liveLatency - targetLatency;
}

function startSynchronization(adapter) {
    if (adapter instanceof DashSyncAdapter) {
        return;
    }

    setInterval(() => {
        const liveSyncDifference = getLiveSyncDifference(adapter);
        if (liveSyncDifference === null) {
            return;
        }
        /*if (Math.abs(liveSyncDifference) > 2) {
            adapter.seek(adapter.getCurrentTime() + liveSyncDifference);
            adapter.setPlaybackRate(1);
            return;
        }*/
    }, 1000);

    setInterval(() => {
        const liveSyncDifference = getLiveSyncDifference(adapter);
        if (liveSyncDifference === null) {
            return;
        }
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
    }, 100);
}

async function updateLatency(cmcd, adapter) {
    try {
      const response = await fetch(window.location.origin + `/sync?CMCD=${encodeURIComponent(cmcd)}`);
      const cmsdHeader = response.headers.get('cmsd-dynamic');
      if (!cmsdHeader) return;
      const latency = parseCMSDHeader(cmsdHeader);
    if (!isNaN(latency)) {
        adapter.setTargetDelay(latency);
    }
    } catch (e) { 
      console.error('Error updating latency:', e);
    }
}

function parseCMSDHeader(cmsdHeader) {
    const latencyMatch = cmsdHeader.match(/com\.svta-latency="([^"]+)"/);
    const latency = latencyMatch ? Number(latencyMatch[1]) : null;
    return latency;
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