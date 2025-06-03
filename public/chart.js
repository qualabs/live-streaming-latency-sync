function setupMetrics(){
    setInterval(function () {
        if (window.syncAdapter && window.syncAdapter.getReady()){ 
            document.querySelector('#clientTime').innerHTML = new Date();
            document.querySelector('#clientSyncTime').innerHTML = window.syncAdapter.getClientTime().toFixed(0);
            document.querySelector('#clientSyncOffset').innerHTML = window.syncAdapter.getClockOffset().toFixed(2);
            document.querySelector('#playheadTime').innerHTML = new Date(window.syncAdapter.getPlayheadTime());
            document.querySelector('#playheadTimeUNIX').innerHTML = window.syncAdapter.getPlayheadTime()?.toFixed(0);                
            document.querySelector('#liveLatency').innerHTML =  window.syncAdapter.getLatency()?.toFixed(2) + 's';
            document.querySelector('#bufferLength').innerHTML = window.syncAdapter.getBufferAhead()?.toFixed(2) + 's';
            document.querySelector('#playbackRate').innerHTML = window.syncAdapter.getPlaybackRate()?.toFixed(2)+'x';
        }
    }, 100);
}            
    
function setupChart(chartId) {
    const data = {
        datasets: [
            { label: 'Live delay', borderColor: '#3944bc', backgroundColor: '#3944bc' },
            { label: 'Buffer level', borderColor: '#d0312d', backgroundColor: '#d0312d' },
            { label: 'Playback rate', borderColor: '#3cb043', backgroundColor: '#3cb043' }
        ]
    };
    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
                y: { min: 0, ticks: { stepSize: 0.5 }, title: { display: true, text: 'Value in Seconds' } },
                x: { title: { display: true, text: 'Time (s)' } }
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Live Data Metrics' }
            }
        }
    };
    const chart = new Chart(document.getElementById(chartId), config);

    setInterval(() => {
        if (window.syncAdapter && window.syncAdapter.getReady()) {
            const labels = chart.data.labels;
            const datasets = chart.data.datasets;

            if (labels.length > 30) labels.shift();
            labels.push((labels.length + 1).toString());

            if (datasets[0].data.length > 30) datasets[0].data.shift();
            datasets[0].data.push(window.syncAdapter.getLatency()?.toFixed(2));

            if (datasets[1].data.length > 30) datasets[1].data.shift();
            datasets[1].data.push(window.syncAdapter.getBufferAhead()?.toFixed(2));

            if (datasets[2].data.length > 30) datasets[2].data.shift();
            datasets[2].data.push(window.syncAdapter.getPlaybackRate()?.toFixed(2));

            chart.update();
        }
    }, 1000);
}