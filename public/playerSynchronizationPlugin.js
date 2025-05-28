const CMCD_MODE_QUERY = 'query';
let leaderTimestamp;
let leaderPlayhead;
let playbackRate;

let lastInterval;

let currentTarget = null;

(() => {
    const syncPlayer = (player, config) => {
        if (!leaderTimestamp || !leaderPlayhead || !playbackRate) {
            return;
        }

        const currentTimestamp = Date.now();
        const timeElapsed = (currentTimestamp - leaderTimestamp) / 1000;
        const timeToSeek = leaderPlayhead + timeElapsed * playbackRate;

        const currentRepresentation = player.getCurrentRepresentationForType('video');
        const currentFrameRate = currentRepresentation.frameRate;
        const frameDelay = Math.min(config.frameDelay, currentFrameRate);

        const SEEK_THRESHOLD = config.seekThreshold ?? (currentFrameRate / 100);
        const SYNC_THRESHOLD = (currentFrameRate / 1000) * frameDelay;

        const getPlayersTimeDifference = () => Math.abs(timeToSeek - player.time());

        const playersDifference = getPlayersTimeDifference();
        if (playersDifference > SEEK_THRESHOLD) {
            player.seekToPresentationTime(timeToSeek);
            player.setPlaybackRate(playbackRate);
            if (lastInterval) {
                clearInterval(lastInterval);
                lastInterval = null;
            }
        } else if (playersDifference > SYNC_THRESHOLD) {
            if (lastInterval) {
                return;
            }

            const isAheadOfTheLeader = player.time() > timeToSeek;
            const catchUpRate = Math.max(config.catchUpRate, 1);
            const speedModification = isAheadOfTheLeader ? 1 / catchUpRate : catchUpRate;

            player.setPlaybackRate(speedModification * playbackRate);
            const interval = setInterval(() => {
                lastInterval = interval;
                const currentDifference = getPlayersTimeDifference();
                if (currentDifference <= SYNC_THRESHOLD) {
                    player.setPlaybackRate(playbackRate);
                    lastInterval = null;
                    clearInterval(interval);
                } else if (currentDifference > SEEK_THRESHOLD) {
                    player.seekToPresentationTime(timeToSeek);
                    player.setPlaybackRate(playbackRate);
                    lastInterval = null;
                    clearInterval(interval);
                }
            }, 10);
        }
    };

    const setupCMCD = (player, config) => {
        player.updateSettings({
            streaming: {
                cmcd: {
                    enabled: true,
                    version: 2,
                    targets: [{
                        enabled: true,
                        cmcdMode: 'response',
                        mode: CMCD_MODE_QUERY,
                        //enabledKeys: ['sid', 'cid', 'pr', 'pt', 'ts'],
                        url: config.url,
                        method: 'POST',
                    }],
                    sid: config.id,
                    mode: CMCD_MODE_QUERY,
                }
            }
        });
    };

    const parseCMSDHeader = (response) => {
        const cmsdHeader = response.headers['cmsd-dynamic'];

        if (!cmsdHeader) {
            return null;
        }

        const latencyMatch = cmsdHeader.match(/com\.svta-latency="([^"]+)"/);
        const latencyTargetsMatch = cmsdHeader.match(/com\.svta-latency-targets="([^"]+)"/);

        const latency = latencyMatch ? Number(latencyMatch[1]) : null;
        const latencyTargets = latencyTargetsMatch ? latencyTargetsMatch[1].split(',').map(Number) : null;

        return { latency, latencyTargets };
    };

    const configInterceptors = (player, config) => {
        if (config.globalSync) {
            globalSyncInterceptor(player, config);
        } else if (config.leaderId) {
            watchPartyInterceptor(player, config);
        }
            
    }

    const globalSyncInterceptor = (player) => {
        player.addRequestInterceptor((request) => {
            const { cmcd } = request;
            if (!cmcd) {
                return Promise.resolve(request);
            }
            
            if (cmcd && currentTarget) {
                const customKey = 'com.svta-latency';
                const customKeyValue = currentTarget;
                cmcd[customKey] = customKeyValue;
                request.url += encodeURIComponent(`,${customKey}="${customKeyValue}"`);
            }
            console.log('Sending CMCD:', cmcd);
            return Promise.resolve(request);
        });

        player.addResponseInterceptor((response) => {
            if (response.request.customData.request.type !== 'CmcdResponse') {
                return Promise.resolve(response);
            }

            const cmsdData = parseCMSDHeader(response);
            console.log('Received CMSD:', cmsdData);
            if (cmsdData) {
                const { latency } = cmsdData;
                if (latency) {
                    currentTarget = latency;
                    player.updateSettings({
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
            }
            return Promise.resolve(response);
        });
    }

    const watchPartyInterceptor = (player, config) => {
        player.addRequestInterceptor((request) => {
            const { filteredCmcdData } = request;
            if (filteredCmcdData) {
                filteredCmcdData['synchronization-leader-sid'] = config.leaderId;
            }
            return Promise.resolve(request);
        });

        let firstRun = true;
        player.addResponseInterceptor((response) => {
            if (response.request.customData.request.type === 'CmcdResponse') {
                response.json().then((data) => {
                    if (!data || !data.ts || !data.pt) {
                        return Promise.resolve(response);
                    }
                    const { ts, pt, pr } = data;
                    leaderTimestamp = Number(ts);
                    leaderPlayhead = Number(pt);
                    playbackRate = Number(pr ?? 1);

                    if (firstRun) {
                        syncPlayer(player, config);
                        firstRun = false;
                    }

                    return Promise.resolve(response);
                });
            }
            return Promise.resolve(response);
        });
    }


    window.playerSynchronization = {
        addLeader(player, config) {
            setupCMCD(player, config);
        },
        addFollower(player, config) {
            setupCMCD(player, config);
            configInterceptors(player, config); 
            if (config.globalSync) {
                return;
            }
            setInterval(() => {
                syncPlayer(player, config);
            }, config.syncInterval ?? 5000);

            let seeking = false;
            player.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKED, () => {
                if (!seeking) {
                    syncPlayer(player, config);
                    seeking = true;
                }
            });
        }
    };
})();
