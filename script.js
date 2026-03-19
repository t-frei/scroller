// Konfiguration
const VIDEOS_JSON_URL = 'videos.json';
const container = document.getElementById('video-container');
const playIndicator = document.getElementById('play-indicator');
const pauseIndicator = document.getElementById('pause-indicator');

let videosList = [];
let globalAudioEnabled = false; // Standardmässig stumm
let currentlyPlayingIndex = 0;
let intersectionObserver = null;
let interactionStarted = false;

// Start: Fetch und Setup
async function init() {
    try {
        const response = await fetch(VIDEOS_JSON_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            // Randomisiere das Array komplett für den Zufallsgenerator
            videosList = data.sort(() => Math.random() - 0.5);
            setupFeed();
        }
    } catch (e) {
        console.error('Fehler beim Laden von videos.json:', e);
    }
}

function setupFeed() {
    // Rendere Wrapper für alle Videos (Lazy Strategy)
    videosList.forEach((url, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.dataset.index = i;
        container.appendChild(wrapper);
    });

    // Observer für Sichtbarkeit (Snap Scrolling)
    const options = {
        root: container,
        rootMargin: '0px',
        threshold: 0.6 // Ab 60% Sichtbarkeit gilt das Video als aktiv
    };

    intersectionObserver = new IntersectionObserver(handleIntersection, options);
    
    // Beobachte alle Wrapper
    document.querySelectorAll('.video-wrapper').forEach(wrapper => {
        intersectionObserver.observe(wrapper);
    });

    // Tap Event für Audio und Play/Pause Toggle
    document.body.addEventListener('click', handleGlobalTap);
}

function handleIntersection(entries) {
    entries.forEach(entry => {
        const index = parseInt(entry.target.dataset.index);
        if (entry.isIntersecting) {
            currentlyPlayingIndex = index;
            loadAndPlayVideo(index, entry.target);
            // Pre-load nächstes Video
            preloadVideo(index + 1);
        } else {
            pauseAndUnloadVideo(index, entry.target);
        }
    });
}

function loadAndPlayVideo(index, wrapper) {
    let video = wrapper.querySelector('video');
    if (!video) {
        video = createVideoElement(videosList[index]);
        wrapper.appendChild(video);
    }
    
    video.muted = !globalAudioEnabled;
    video.currentTime = 0;
    
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.log('Autoplay prevented:', error);
            // Browser zwingt uns, stumm zu starten, wenn keine User-Interaktion stattfand
        });
    }
}

function pauseAndUnloadVideo(index, wrapper) {
    const video = wrapper.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src'); 
        video.load();
        wrapper.innerHTML = ''; // DOM aufräumen für minimalen RAM-Verbrauch
    }
}

function preloadVideo(index) {
    // Falls Video-Liste zu Ende ist, wieder zum Anfang springen (Looping der ganzen Liste, falls gewünscht)
    // Momentan stoppen wir einfach, oder endloses Anhängen (Endlosschleife)
    if (index >= videosList.length) return;
    
    const wrapper = document.querySelector(`.video-wrapper[data-index="${index}"]`);
    if (wrapper && !wrapper.querySelector('video')) {
        const video = createVideoElement(videosList[index]);
        video.preload = 'auto'; // Hintergrund-Preloading erzwingen
        wrapper.appendChild(video);
    }
}

function createVideoElement(src) {
    const video = document.createElement('video');
    video.src = src;
    video.loop = true; // Endlosschleife pro Video
    video.playsInline = true;
    video.muted = !globalAudioEnabled;
    video.preload = 'metadata'; // Spart Bandbreite
    return video;
}

let indicatorTimeout;
function showIndicator(type) {
    playIndicator.classList.remove('show');
    pauseIndicator.classList.remove('show');
    playIndicator.classList.add('hidden');
    pauseIndicator.classList.add('hidden');

    const ind = type === 'play' ? playIndicator : pauseIndicator;
    ind.classList.remove('hidden');
    
    // Force reflow
    void ind.offsetWidth;
    
    ind.classList.add('show');

    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
        ind.classList.remove('show');
        setTimeout(() => ind.classList.add('hidden'), 200); // Warten auf Fade-out Timeout
    }, 1000);
}

function handleGlobalTap(e) {
    const wrapper = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if (!wrapper) return;
    const video = wrapper.querySelector('video');
    if (!video) return;

    if (!interactionStarted || !globalAudioEnabled) {
        // Erster Tap: Aktiviere Ton global, Video spielt weiter.
        interactionStarted = true;
        globalAudioEnabled = true;
        document.querySelectorAll('video').forEach(v => v.muted = false);
        video.play();
        return;
    }

    // Ab dem zweiten Tap: Play / Pause toggle
    if (video.paused) {
        video.play();
        showIndicator('play');
    } else {
        video.pause();
        showIndicator('pause');
    }
}

// Init App
document.addEventListener('DOMContentLoaded', init);
