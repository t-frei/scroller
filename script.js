const VIDEOS_JSON_URL = 'videos.json';
const container = document.getElementById('video-container');
const playIndicator = document.getElementById('play-indicator');
const pauseIndicator = document.getElementById('pause-indicator');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const btnBurger = document.getElementById('btn-burger');
const modalOverlay = document.getElementById('modal-overlay');
const menuContent = document.getElementById('menu-content');
const modalTitle = document.getElementById('modal-title');

let videoData = {}; // Speichert die Kategorien
let currentCategory = null;

let videosList = [];
let globalAudioEnabled = false; // Standardmässig stumm
let currentlyPlayingIndex = 0;
let intersectionObserver = null;
let interactionStarted = false;
let isScrubbing = false;

// ---- Event Listener für UI (Modals & Progress & Burger) ----
document.addEventListener('DOMContentLoaded', init);

document.body.addEventListener('click', handleGlobalTap);

// Klicks auf Buttons/Menüs vom GlobalTap isolieren
progressContainer.addEventListener('pointerdown', e => e.stopPropagation());
progressContainer.addEventListener('click', e => e.stopPropagation());
btnBurger.addEventListener('click', e => {
    e.stopPropagation();
    openMainMenu();
});

modalOverlay.addEventListener('click', e => {
    e.stopPropagation();
    if(e.target === modalOverlay) {
        modalOverlay.classList.add('hidden');
    }
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
});

// Main Menu Logik
function openMainMenu() {
    modalTitle.textContent = 'Menü';
    menuContent.innerHTML = '';
    
    // Kategorien als Buttons einfügen
    Object.keys(videoData).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'menu-btn' + (cat === currentCategory ? ' active' : '');
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            if (cat !== currentCategory) {
                currentCategory = cat;
                loadCategory(cat);
            }
            modalOverlay.classList.add('hidden');
        });
        menuContent.appendChild(btn);
    });
    
    // Trennlinie und Settings-Button
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = 'rgba(255,255,255,0.1)';
    divider.style.margin = '15px 0';
    menuContent.appendChild(divider);

    const btnSettings = document.createElement('button');
    btnSettings.className = 'menu-btn settings-btn';
    btnSettings.textContent = 'Einstellungen';
    btnSettings.addEventListener('click', () => {
        modalTitle.textContent = 'Einstellungen';
        menuContent.innerHTML = '<p style="color:#888; font-size:0.9rem; line-height:1.4;">Aktuell gibt es hier keine spezifischen Einstellungen.<br><br>Version 1.2</p>';
    });
    menuContent.appendChild(btnSettings);

    modalOverlay.classList.remove('hidden');
}

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
