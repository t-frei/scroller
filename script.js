const VIDEOS_JSON_URL = 'videos.json';
const container = document.getElementById('video-container');
const playIndicator = document.getElementById('play-indicator');
const pauseIndicator = document.getElementById('pause-indicator');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const bottomNav = document.getElementById('bottom-nav');
const modalOverlay = document.getElementById('modal-overlay');
const folderList = document.getElementById('folder-list');

let videoData = {}; // Speichert die Kategorien
let currentCategory = null;

let videosList = [];
let globalAudioEnabled = false; // Standardmässig stumm
let currentlyPlayingIndex = 0;
let intersectionObserver = null;
let interactionStarted = false;
let isScrubbing = false;

// ---- Event Listener für UI (Bottom Bar & Modals & Progress) ----
document.addEventListener('DOMContentLoaded', init);

document.body.addEventListener('click', handleGlobalTap);

// Klicks auf Navbar und Menüs vom GlobalTap isolieren
progressContainer.addEventListener('pointerdown', e => e.stopPropagation());
progressContainer.addEventListener('click', e => e.stopPropagation());
bottomNav.addEventListener('click', e => e.stopPropagation());
modalOverlay.addEventListener('click', e => {
    e.stopPropagation();
    if(e.target === modalOverlay) {
        modalOverlay.classList.add('hidden');
    }
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
});

document.getElementById('btn-folders').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Kategorien';
    folderList.innerHTML = '';
    
    Object.keys(videoData).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'folder-btn' + (cat === currentCategory ? ' active' : '');
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            if (cat !== currentCategory) {
                currentCategory = cat;
                loadCategory(cat);
            }
            modalOverlay.classList.add('hidden');
        });
        folderList.appendChild(btn);
    });
    
    modalOverlay.classList.remove('hidden');
});

document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Einstellungen';
    folderList.innerHTML = '<p style="color:#888; font-size:0.9rem; line-height:1.4;">Aktuell gibt es hier keine spezifischen Einstellungen.<br><br>Version 1.0</p>';
    modalOverlay.classList.remove('hidden');
});

// Scrubbing logik
progressBar.addEventListener('input', () => {
    isScrubbing = true;
    const wrapper = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if(wrapper) {
        const video = wrapper.querySelector('video');
        if(video && video.duration) {
            video.currentTime = (progressBar.value / 100) * video.duration;
        }
    }
});

progressBar.addEventListener('change', () => {
    isScrubbing = false;
});

// ---- Kernlogik ----
async function init() {
    try {
        const response = await fetch(VIDEOS_JSON_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        videoData = await response.json();
        
        const categories = Object.keys(videoData);
        if (categories.length > 0) {
            currentCategory = categories[0];
            loadCategory(currentCategory);
        }
    } catch (e) {
        console.error('Fehler beim Laden von videos.json:', e);
    }
}

function loadCategory(category) {
    if (!videoData[category] || videoData[category].length === 0) return;
    
    // Bestehenden Observer aufräumen
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    
    // Alte Videos zerstören
    container.innerHTML = '';
    progressBar.value = 0;
    
    // Array für die neue Kategorie holen und komplett auf Zufall sortieren
    videosList = [...videoData[category]].sort(() => Math.random() - 0.5);
    currentlyPlayingIndex = 0;
    
    setupFeed();
}

function setupFeed() {
    videosList.forEach((url, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.dataset.index = i;
        container.appendChild(wrapper);
    });

    const options = {
        root: container,
        rootMargin: '0px',
        threshold: 0.6
    };

    intersectionObserver = new IntersectionObserver(handleIntersection, options);
    
    document.querySelectorAll('.video-wrapper').forEach(wrapper => {
        intersectionObserver.observe(wrapper);
    });
}

function handleIntersection(entries) {
    entries.forEach(entry => {
        const index = parseInt(entry.target.dataset.index);
        if (entry.isIntersecting) {
            currentlyPlayingIndex = index;
            loadAndPlayVideo(index, entry.target);
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
        playPromise.catch(() => {
            // Auto-play prevented
        });
    }
}

function pauseAndUnloadVideo(index, wrapper) {
    const video = wrapper.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src'); 
        video.load();
        wrapper.innerHTML = ''; 
    }
}

function preloadVideo(index) {
    if (index >= videosList.length) return;
    
    const wrapper = document.querySelector(`.video-wrapper[data-index="${index}"]`);
    if (wrapper && !wrapper.querySelector('video')) {
        const video = createVideoElement(videosList[index]);
        video.preload = 'auto';
        wrapper.appendChild(video);
    }
}

function createVideoElement(src) {
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.playsInline = true;
    video.muted = !globalAudioEnabled;
    video.preload = 'metadata';
    
    video.addEventListener('timeupdate', () => {
        if (!isScrubbing && video.duration && !video.paused) {
            const wrapper = video.closest('.video-wrapper');
            if (wrapper && parseInt(wrapper.dataset.index) === currentlyPlayingIndex) {
                progressBar.value = (video.currentTime / video.duration) * 100;
            }
        }
    });

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
    
    void ind.offsetWidth; // Force reflow
    ind.classList.add('show');

    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
        ind.classList.remove('show');
        setTimeout(() => ind.classList.add('hidden'), 200);
    }, 1000);
}

function handleGlobalTap(e) {
    const wrapper = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if (!wrapper) return;
    const video = wrapper.querySelector('video');
    if (!video) return;

    if (!interactionStarted || !globalAudioEnabled) {
        interactionStarted = true;
        globalAudioEnabled = true;
        document.querySelectorAll('video').forEach(v => v.muted = false);
        video.play();
        return;
    }

    if (video.paused) {
        video.play();
        showIndicator('play');
    } else {
        video.pause();
        showIndicator('pause');
    }
}
