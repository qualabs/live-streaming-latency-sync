class BaseSyncAdapter {
    constructor(videoElement) {
        this._theTargetDelay = null;
        this.video = videoElement;
    }
    setTheTargetDelay(delay) {
        this._theTargetDelay = delay;
    }
    getTheTargetDelay() {
        return this._theTargetDelay;
    }
}

class HlsAdapter extends BaseSyncAdapter {
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
        if (this.hls && this.hls.latency !== undefined) {
            return this.hls.latency;
        }
    }
    getCurrentTime() {
        return this.video.currentTime;
    }
}

class ShakaAdapter extends BaseSyncAdapter {
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
        if (this.shaka && this.shaka.getStats) {
            const stats = this.shaka.getStats();
            if (stats && stats.liveLatency) {
                return stats.liveLatency;
            }
        }
        return 0;
    }
    getCurrentTime() {
        return this.video.currentTime;
    }
}

class DashAdapter extends BaseSyncAdapter {
    constructor(dashInstance, videoElement) {
        super(videoElement);
        this.dash = dashInstance;
    }
    seek(time) {
        this.dash.seek(time);
    }
    setPlaybackRate(rate) {
        this.video.playbackRate = rate;
    }
    getLatency() {
        if (this.dash && this.dash.getCurrentLiveLatency) {
            return this.dash.getCurrentLiveLatency();
        }
        return 0;
    }
    getCurrentTime() {
        if (this.dash && this.dash.time) {
            return this.dash.time();
        }
        return this.video.currentTime;
    }
}

function createPlayerSyncAdapter(playerType, playerInstance, videoElement) {
    if (playerType === 'hls') {
        return new HlsAdapter(playerInstance, videoElement);
    } else if (playerType === 'shaka') {
        return new ShakaAdapter(playerInstance, videoElement);
    } else if (playerType === 'dash') {
        return new DashAdapter(playerInstance, videoElement);
    }
    throw new Error('Tipo de player no soportado');
}

function getLiveSyncDifference(adapter) {
    const targetLatency = adapter.getTheTargetDelay();
    if (!targetLatency) {
        return null;
    }
    let liveLatency = adapter.getLatency();
    return liveLatency - targetLatency;
}

function startLatencySyncInterval(adapter) {
    setInterval(() => {
        const liveSyncDifference = getLiveSyncDifference(adapter);
        if (liveSyncDifference === null) {
            return;
        }
        if (Math.abs(liveSyncDifference) > 2) {
            adapter.seek(adapter.getCurrentTime() + liveSyncDifference);
            adapter.setPlaybackRate(1);
            return;
        }
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
        }
        if (liveSyncDifference < 0) {
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
      const latencyMatch = cmsdHeader.match(/com\.svta-latency="([^"]+)"/);
      if (latencyMatch) {
        const latency = Number(latencyMatch[1]);
        if (!isNaN(latency)) {
          adapter.setTheTargetDelay(latency);
        }
      }
    } catch (e) { 
      console.error('Error updating latency:', e);
    }
}

const playerSyncAdapter = {
    createPlayerSyncAdapter,
    startLatencySyncInterval,
    updateLatency
};

if (typeof window !== 'undefined') {
    window.playerSyncAdapter = playerSyncAdapter;
}