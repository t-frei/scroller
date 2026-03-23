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
let currentUtterance = null;

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
    
    // Topic Generator Input
    const topicWrapper = document.createElement('div');
    topicWrapper.className = 'topic-wrapper';
    
    const topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.id = 'new-topic-input';
    topicInput.placeholder = 'Neues Thema (z.B. Rom)...';
    
    const btnGenerate = document.createElement('button');
    btnGenerate.className = 'menu-btn';
    btnGenerate.style.background = '#4CAF50'; // Green button to make it pop
    btnGenerate.style.color = '#fff';
    btnGenerate.textContent = 'Kategorie generieren';
    btnGenerate.addEventListener('click', () => {
        generateSmartCategory(topicInput.value);
    });
    
    topicWrapper.appendChild(topicInput);
    topicWrapper.appendChild(btnGenerate);
    menuContent.appendChild(topicWrapper);

    const divider0 = document.createElement('div');
    divider0.className = 'menu-divider';
    menuContent.appendChild(divider0);

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
    const divider1 = document.createElement('div');
    divider1.className = 'menu-divider';
    menuContent.appendChild(divider1);

    const btnSettings = document.createElement('button');
    btnSettings.className = 'menu-btn settings-btn';
    btnSettings.textContent = 'Einstellungen';
    btnSettings.addEventListener('click', () => {
        modalTitle.textContent = 'Einstellungen';
        menuContent.innerHTML = `
            <div class="settings-group">
                <label>Google Gemini API Key:</label>
                <input type="password" id="gemini-key" value="${localStorage.getItem('gemini_key') || ''}">
                <label>Unsplash Access Key:</label>
                <input type="password" id="unsplash-key" value="${localStorage.getItem('unsplash_key') || ''}">
                <button id="btn-save-keys" class="menu-btn" style="margin-top: 10px;">Speichern</button>
            </div>
            <button id="btn-back-settings" class="menu-btn settings-btn" style="margin-top:20px;">Zurück zum Menü</button>
        `;
        document.getElementById('btn-save-keys').addEventListener('click', () => {
            localStorage.setItem('gemini_key', document.getElementById('gemini-key').value);
            localStorage.setItem('unsplash_key', document.getElementById('unsplash-key').value);
            alert('Gespeichert!');
        });
        document.getElementById('btn-back-settings').addEventListener('click', openMainMenu);
    });
    menuContent.appendChild(btnSettings);

    modalOverlay.classList.remove('hidden');
}

// AI Fact Generation Logik
async function generateSmartCategory(topic) {
    if (!topic || topic.trim() === '') return;
    
    const geminiKey = (localStorage.getItem('gemini_key') || '').trim();
    const unsplashKey = (localStorage.getItem('unsplash_key') || '').trim();
    
    if (!geminiKey || !unsplashKey) {
        alert("Bitte hinterlege zuerst Google Gemini und Unsplash API Keys in den Einstellungen.");
        return;
    }

    modalTitle.textContent = `Generiere "${topic}"...`;
    menuContent.innerHTML = `
        <div class="spinner-container">
            <div class="spinner"></div>
            <div class="loading-text">100 Fakten werden generiert...</div>
        </div>
    `;

    try {
        // 1. Fetch images from Unsplash
        const unsplashRes = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(topic)}&order_by=popular&per_page=30`, {
            headers: { 'Authorization': `Client-ID ${unsplashKey}` }
        });
        if (!unsplashRes.ok) throw new Error("Unsplash API Fehler: Bitte den Key prüfen.");
        const unsplashData = await unsplashRes.json();
        const images = unsplashData.results.map(r => r.urls.regular);
        
        if (images.length === 0) {
            images.push('https://images.unsplash.com/photo-1506744626753-1fa44df31c82'); // minimal fallback
        }

        // 2. Hole verfügbare Modelle dynamisch, falls das API-Konto limitierte Modelle hat
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        const modelsData = await modelsRes.json();
        if (modelsData.error) throw new Error("API Key Fehler: " + modelsData.error.message);
        
        const modelOptions = modelsData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
        const selectedModel = modelOptions.find(m => m.name.includes("gemini-1.5-flash")) || 
                              modelOptions.find(m => m.name.includes("gemini-1.5-pro")) ||
                              modelOptions.find(m => m.name.includes("gemini-pro")) || 
                              modelOptions[0];
                              
        if (!selectedModel) throw new Error("Kein kompatibles Modell für die Text-Generierung gefunden.");

        // 3. Fetch facts from Gemini mit dem gefundenen Modell
        const prompt = `Generate exactly 100 distinct, short, and fascinating facts about '${topic}'. Return ONLY a valid JSON array of strings in English. Extremely important: Do not include markdown formatting like \`\`\`json or extra text, only the raw array [ "fact 1", "fact 2" ].`;
        
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel.name}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        const geminiData = await geminiRes.json();
        if(geminiData.error) throw new Error("Gemini API Fehler: " + geminiData.error.message);
        
        let textContent = geminiData.candidates[0].content.parts[0].text.trim();
        // Remove markdown block if Gemini still returns it
        if (textContent.startsWith("\`\`\`json")) textContent = textContent.replace(/\`\`\`json/g, "");
        if (textContent.startsWith("\`\`\`")) textContent = textContent.replace(/\`\`\`/g, "");
        textContent = textContent.trim();
        
        const factsArray = JSON.parse(textContent);

        // 3. Combine into playlist
        const newCategoryList = factsArray.map((fact, index) => {
            return {
                type: 'ai-slide',
                text: fact,
                image: images[index % images.length] // loop through images
            };
        });

        // 4. Update data and load
        videoData[topic] = newCategoryList;
        currentCategory = topic;
        loadCategory(topic);
        modalOverlay.classList.add('hidden');

    } catch (e) {
        console.error(e);
        modalTitle.textContent = 'Fehler!';
        menuContent.innerHTML = `<p style="color:#ff6b6b">${e.message}</p><button id="btn-back" class="menu-btn" style="margin-top:20px;">Zurück zum Menü</button>`;
        document.getElementById('btn-back').addEventListener('click', openMainMenu);
    }
}

// Scrubbing logik für Videos
progressBar.addEventListener('input', () => {
    isScrubbing = true;
    const wrapper = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if(wrapper) {
        const video = wrapper.querySelector('video.media-content');
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
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    
    container.innerHTML = '';
    progressBar.value = 0;
    stopSpeech();
    
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
            loadAndPlayMedia(index, entry.target);
            preloadMedia(index + 1);
        } else {
            pauseAndUnloadMedia(index, entry.target);
        }
    });
}

// ----- Media Management (Videos + AI Slides) -----

function createMediaElement(item) {
    if (typeof item === 'string') {
        const video = document.createElement('video');
        video.src = item;
        video.loop = true;
        video.playsInline = true;
        video.muted = !globalAudioEnabled;
        video.preload = 'metadata';
        video.className = 'media-content';
        
        video.addEventListener('timeupdate', () => {
            if (!isScrubbing && video.duration && !video.paused) {
                const wrapper = video.closest('.video-wrapper');
                if (wrapper && parseInt(wrapper.dataset.index) === currentlyPlayingIndex) {
                    progressBar.value = (video.currentTime / video.duration) * 100;
                }
            }
        });
        return video;
    } else if (item && item.type === 'ai-slide') {
        const div = document.createElement('div');
        div.className = 'ai-slide media-content';
        div.dataset.type = 'ai-slide';
        div.dataset.text = item.text;
        
        const img = document.createElement('img');
        img.src = item.image;
        
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = item.text;
        
        div.appendChild(img);
        div.appendChild(overlay);
        div.appendChild(textDiv);
        
        return div;
    }
}

function speakText(text) {
    if(!globalAudioEnabled) return;
    window.speechSynthesis.cancel();
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'en-US'; 
    currentUtterance.rate = 0.95; // Slightly slower for better comprehension
    
    if(window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    }
    
    window.speechSynthesis.speak(currentUtterance);
}

function stopSpeech() {
    window.speechSynthesis.cancel();
}

function loadAndPlayMedia(index, wrapper) {
    let media = wrapper.querySelector('.media-content');
    if (!media) {
        media = createMediaElement(videosList[index]);
        wrapper.appendChild(media);
    }
    
    if (media.tagName === 'VIDEO') {
        progressContainer.style.display = 'flex'; // show scrubber
        media.muted = !globalAudioEnabled;
        media.currentTime = 0;
        
        const playPromise = media.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    } else if (media.dataset.type === 'ai-slide') {
        progressContainer.style.display = 'none'; // hide scrubber for slides
        speakText(media.dataset.text);
    }
}

function pauseAndUnloadMedia(index, wrapper) {
    const media = wrapper.querySelector('.media-content');
    if (media) {
        if (media.tagName === 'VIDEO') {
            media.pause();
            media.removeAttribute('src'); 
            media.load();
        } else if (media.dataset.type === 'ai-slide') {
            stopSpeech();
        }
        wrapper.innerHTML = ''; 
    }
}

function preloadMedia(index) {
    if (index >= videosList.length) return;
    
    const wrapper = document.querySelector(`.video-wrapper[data-index="${index}"]`);
    if (wrapper && !wrapper.querySelector('.media-content')) {
        const media = createMediaElement(videosList[index]);
        if(media.tagName === 'VIDEO') media.preload = 'auto';
        wrapper.appendChild(media);
    }
}

// ------ Global Tap Handling ------

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
    const media = wrapper.querySelector('.media-content');
    if (!media) return;

    if (!interactionStarted || !globalAudioEnabled) {
        interactionStarted = true;
        globalAudioEnabled = true;
        document.querySelectorAll('video').forEach(v => v.muted = false);
        
        if (media.tagName === 'VIDEO') {
            media.play();
        } else if (media.dataset.type === 'ai-slide') {
            speakText(media.dataset.text);
        }
        return;
    }

    if (media.tagName === 'VIDEO') {
        if (media.paused) {
            media.play();
            showIndicator('play');
        } else {
            media.pause();
            showIndicator('pause');
        }
    } else if (media.dataset.type === 'ai-slide') {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            showIndicator('play');
        } else if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            showIndicator('pause');
        } else {
            // It finished reading, tap to restart the text
            speakText(media.dataset.text);
            showIndicator('play');
        }
    }
}
