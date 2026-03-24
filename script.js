const VIDEOS_JSON_URL = 'videos.json';
const container = document.getElementById('video-container');
const startScreen = document.getElementById('start-screen');
const folderList = document.getElementById('folder-list');
const playIndicator = document.getElementById('play-indicator');
const pauseIndicator = document.getElementById('pause-indicator');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const btnBurger = document.getElementById('btn-burger');
const modalOverlay = document.getElementById('modal-overlay');
const menuContent = document.getElementById('menu-content');
const modalTitle = document.getElementById('modal-title');

let videoData = {}; // Speichert ALLE anzeigbaren Kategorien
let defaultFolders = {}; 
let customFolders = JSON.parse(localStorage.getItem('scroller_custom_folders')) || {};
let deletedFolders = JSON.parse(localStorage.getItem('scroller_deleted_folders')) || [];
let folderIcons = JSON.parse(localStorage.getItem('scroller_folder_icons')) || {};
let folderUsage = JSON.parse(localStorage.getItem('scroller_folder_usage')) || {};
let unsavedCategories = [];
let noBlurState = localStorage.getItem('scroller_no_blur') === 'true';

let currentCategory = null;
let currentDepth = 'normal';
let videosList = [];
let globalAudioEnabled = false; 
let currentlyPlayingIndex = 0;
let intersectionObserver = null;
let interactionStarted = false;
let isScrubbing = false;
let currentUtterance = null;

// --- Emojis & Settings ---
const defaultIcons = {
    'Motivation': '🔥',
    'Natur': '🌿',
    'Wissen': '🧠',
    'Tiere': '🐶',
    'Autos': '🏎️',
    'default': '📁'
};
function getFolderIcon(name) {
    if (folderIcons[name]) return folderIcons[name];
    for (let key in defaultIcons) {
        if (name.toLowerCase().includes(key.toLowerCase())) return defaultIcons[key];
    }
    return defaultIcons['default'];
}
function setFolderIcon(name, newIcon) {
    folderIcons[name] = newIcon;
    localStorage.setItem('scroller_folder_icons', JSON.stringify(folderIcons));
}

function saveCustomFolders() {
    localStorage.setItem('scroller_custom_folders', JSON.stringify(customFolders));
}
function saveDeletedFolders() {
    localStorage.setItem('scroller_deleted_folders', JSON.stringify(deletedFolders));
}

// ---- Event Listener für UI ----
document.addEventListener('DOMContentLoaded', init);
document.body.addEventListener('click', handleGlobalTap);

progressContainer.addEventListener('pointerdown', e => e.stopPropagation());
progressContainer.addEventListener('click', e => e.stopPropagation());
btnBurger.addEventListener('click', e => {
    e.stopPropagation();
    openMainMenu();
});
modalOverlay.addEventListener('click', e => {
    e.stopPropagation();
    if(e.target === modalOverlay) modalOverlay.classList.add('hidden');
});
document.getElementById('btn-close-modal').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
});

function showPromptModal(title, text, confirmBtnText, onConfirm) {
    modalTitle.textContent = title;
    menuContent.innerHTML = `
        <p style="margin-bottom: 20px; font-size: 0.95rem; color: #ccc;">${text}</p>
        <div style="display:flex; gap: 10px;">
            <button id="btn-prompt-confirm" class="menu-btn" style="background:#4CAF50; color:#fff; flex:1;">${confirmBtnText}</button>
            <button id="btn-prompt-cancel" class="menu-btn settings-btn" style="flex:1;">Abbrechen</button>
        </div>
    `;
    modalOverlay.classList.remove('hidden');
    
    document.getElementById('btn-prompt-confirm').addEventListener('click', () => {
        onConfirm();
        modalOverlay.classList.add('hidden');
    });
    document.getElementById('btn-prompt-cancel').addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
    });
}

// Edit Folder Logic (Modal inside Menu)
function showEditFolderModal(oldName) {
    modalTitle.textContent = `Ordner bearbeiten`;
    menuContent.innerHTML = `
        <div class="settings-group">
            <label>Name:</label>
            <input type="text" id="edit-folder-name" value="${oldName}">
            <label>Icon / Emoji:</label>
            <input type="text" id="edit-folder-icon" value="${getFolderIcon(oldName)}">
            <div style="display:flex; gap: 10px; margin-top: 15px;">
                <button id="btn-save-edit" class="menu-btn" style="background:#4CAF50; color:#fff; flex:1;">Speichern</button>
                <button id="btn-cancel-edit" class="menu-btn settings-btn" style="flex:1;">Abbrechen</button>
            </div>
        </div>
    `;
    
    document.getElementById('btn-save-edit').addEventListener('click', () => {
        const newName = document.getElementById('edit-folder-name').value.trim();
        const newIcon = document.getElementById('edit-folder-icon').value.trim();
        if (!newName) return;
        
        if (newName !== oldName && videoData[newName]) {
            alert("Ein Ordner mit diesem Namen existiert bereits.");
            return;
        }

        // Apply Icon
        if (newIcon) setFolderIcon(newName, newIcon);

        // Apply Name
        if (newName !== oldName) {
            videoData[newName] = videoData[oldName];
            delete videoData[oldName];

            if (customFolders[oldName]) {
                customFolders[newName] = customFolders[oldName];
                delete customFolders[oldName];
            } else if (defaultFolders[oldName]) {
                customFolders[newName] = defaultFolders[oldName];
                if (!deletedFolders.includes(oldName)) {
                    deletedFolders.push(oldName);
                    saveDeletedFolders();
                }
            }
            saveCustomFolders();
            
            // Adjust usage stats
            if (folderUsage[oldName]) {
                folderUsage[newName] = folderUsage[oldName];
                delete folderUsage[oldName];
                localStorage.setItem('scroller_folder_usage', JSON.stringify(folderUsage));
            }

            if (currentCategory === oldName) currentCategory = newName;
        }
        
        openMainMenu();
    });
    document.getElementById('btn-cancel-edit').addEventListener('click', openMainMenu);
}

function deleteFolder(name) {
    if(!confirm(`Möchtest du "${name}" wirklich löschen?`)) return;
    
    delete videoData[name];
    if (customFolders[name]) {
        delete customFolders[name];
        saveCustomFolders();
    }
    if (defaultFolders[name] && !deletedFolders.includes(name)) {
        deletedFolders.push(name);
        saveDeletedFolders();
    }
    
    if (currentCategory === name) {
        container.classList.add('hidden');
        container.innerHTML = '';
        buildStartScreen();
        modalOverlay.classList.add('hidden');
    } else {
        openMainMenu(); 
    }
}


// Main Menu
function openMainMenu() {
    modalTitle.textContent = 'Menü';
    menuContent.innerHTML = '';
    
    const btnHome = document.createElement('button');
    btnHome.className = 'menu-btn settings-btn';
    btnHome.textContent = '🏠 Zurück zur Startseite';
    btnHome.addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
        pauseAndUnloadMedia(currentlyPlayingIndex, document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`));
        container.classList.add('hidden');
        buildStartScreen();
    });
    menuContent.appendChild(btnHome);

    const divider0 = document.createElement('div');
    divider0.className = 'menu-divider';
    menuContent.appendChild(divider0);

    const topicWrapper = document.createElement('div');
    topicWrapper.className = 'topic-wrapper';
    
    const topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.id = 'new-topic-input';
    topicInput.placeholder = 'Neues Thema (z.B. Rom)...';
    
    const depthSelect = document.createElement('select');
    depthSelect.id = 'depth-input';
    depthSelect.className = 'menu-btn settings-btn';
    depthSelect.style.marginBottom = '5px';
    depthSelect.style.padding = '10px';
    depthSelect.style.textAlign = 'left';
    depthSelect.innerHTML = `
        <option value="simple">Verständnis: Einfach / Kinder</option>
        <option value="normal" selected>Verständnis: Normal</option>
        <option value="expert">Verständnis: Experte / Detailliert</option>
    `;
    
    const btnGenerate = document.createElement('button');
    btnGenerate.className = 'menu-btn';
    btnGenerate.style.background = '#4CAF50';
    btnGenerate.style.color = '#fff';
    btnGenerate.textContent = 'Kategorie generieren';
    btnGenerate.addEventListener('click', () => {
        currentDepth = depthSelect.value;
        generateSmartCategory(topicInput.value, currentDepth);
    });
    
    topicWrapper.appendChild(topicInput);
    topicWrapper.appendChild(depthSelect);
    topicWrapper.appendChild(btnGenerate);
    menuContent.appendChild(topicWrapper);

    const divider1 = document.createElement('div');
    divider1.className = 'menu-divider';
    menuContent.appendChild(divider1);

    // Folder Items
    Object.keys(videoData).forEach(cat => {
        const catRow = document.createElement('div');
        catRow.style.display = 'flex';
        catRow.style.gap = '8px';
        catRow.style.marginBottom = '12px';
        
        const btn = document.createElement('button');
        btn.className = 'menu-btn' + (cat === currentCategory ? ' active' : '');
        btn.style.margin = '0';
        btn.style.flex = '1';
        btn.textContent = getFolderIcon(cat) + ' ' + cat;
        btn.addEventListener('click', () => {
            if (cat !== currentCategory) {
                currentCategory = cat;
                loadCategory(cat);
            }
            modalOverlay.classList.add('hidden');
        });
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'menu-btn settings-btn';
        btnEdit.style.width = '45px';
        btnEdit.style.margin = '0';
        btnEdit.textContent = '✏️';
        btnEdit.addEventListener('click', () => showEditFolderModal(cat));
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'menu-btn settings-btn';
        btnDelete.style.width = '45px';
        btnDelete.style.margin = '0';
        btnDelete.textContent = '🗑️';
        btnDelete.addEventListener('click', () => deleteFolder(cat));
        
        catRow.appendChild(btn);
        catRow.appendChild(btnEdit);
        catRow.appendChild(btnDelete);
        
        menuContent.appendChild(catRow);
    });
    
    const divider2 = document.createElement('div');
    divider2.className = 'menu-divider';
    menuContent.appendChild(divider2);

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
                <label style="display:flex; align-items:center; gap:10px; font-size: 0.95rem; margin-top:15px; cursor:pointer;">
                    <input type="checkbox" id="no-blur-toggle" style="width:20px; margin:0;" ${noBlurState ? 'checked' : ''}>
                    Blur-Effekt hinter Fakten ausschalten
                </label>
                <button id="btn-save-keys" class="menu-btn" style="margin-top: 20px;">Speichern</button>
            </div>
            <button id="btn-back-settings" class="menu-btn settings-btn" style="margin-top:10px;">Zurück zum Menü</button>
        `;
        document.getElementById('btn-save-keys').addEventListener('click', () => {
            localStorage.setItem('gemini_key', document.getElementById('gemini-key').value);
            localStorage.setItem('unsplash_key', document.getElementById('unsplash-key').value);
            noBlurState = document.getElementById('no-blur-toggle').checked;
            localStorage.setItem('scroller_no_blur', noBlurState ? 'true' : 'false');
            document.body.classList.toggle('no-blur', noBlurState);
            alert('Gespeichert!');
        });
        document.getElementById('btn-back-settings').addEventListener('click', openMainMenu);
    });
    menuContent.appendChild(btnSettings);

    modalOverlay.classList.remove('hidden');
}

// Start Screen
function buildStartScreen() {
    startScreen.classList.add('visible');
    folderList.innerHTML = '';
    
    const categories = Object.keys(videoData).sort((a,b) => (folderUsage[b]||0) - (folderUsage[a]||0));
    
    if(categories.length === 0) {
        folderList.innerHTML = '<p style="color:#aaa;">Keine Ordner gefunden. Öffne das Menü, um KI-Themen zu generieren.</p>';
    }
    
    categories.forEach((cat, index) => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.style.setProperty('--index', index);
        
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'folder-icon';
        iconWrapper.textContent = getFolderIcon(cat);
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'folder-name';
        nameDiv.textContent = cat;
        
        card.appendChild(iconWrapper);
        card.appendChild(nameDiv);
        
        card.addEventListener('click', () => {
            currentCategory = cat;
            loadCategory(cat);
        });
        
        folderList.appendChild(card);
    });
}


// AI Fact Generation Logik
async function generateSmartCategory(topic, depth, isAppending = false) {
    if (!topic || topic.trim() === '') return;
    
    const geminiKey = (localStorage.getItem('gemini_key') || '').trim();
    const unsplashKey = (localStorage.getItem('unsplash_key') || '').trim();
    
    if (!geminiKey || !unsplashKey) {
        alert("Bitte hinterlege zuerst Google Gemini und Unsplash API Keys in den Einstellungen.");
        return;
    }

    modalTitle.textContent = isAppending ? `Generiere mehr für "${topic}"...` : `Generiere "${topic}"...`;
    menuContent.innerHTML = `
        <div class="spinner-container">
            <div class="spinner"></div>
            <div class="loading-text">20 Fakten werden generiert...</div>
        </div>
    `;

    try {
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        const modelsData = await modelsRes.json();
        if (modelsData.error) throw new Error("API Key Fehler: " + modelsData.error.message);
        
        const modelOptions = modelsData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
        const selectedModel = modelOptions.find(m => m.name.includes("-flash")) || modelOptions.find(m => m.name.includes("-pro")) || modelOptions[0];
                              
        if (!selectedModel) throw new Error("Kein kompatibles Modell für die Text-Generierung gefunden.");

        let existingFacts = "";
        if (isAppending && videoData[topic]) {
            const facts = videoData[topic].filter(i => i.type === 'ai-slide').map(i => i.text);
            if (facts.length > 0) {
                existingFacts = ` DO NOT repeat any of these previously generated facts: ${JSON.stringify(facts)}.`;
            }
        }

        const prompt = `Generate EXACTLY 20 distinct, short, and fascinating facts about '${topic}'. The target audience has '${depth}' understanding, so cater the complexity to them.${existingFacts} Return ONLY a valid JSON array of objects in English with this structure: {"fact": "the text of the fact", "image_query": "specific 1-2 word search keyword for unsplash relating purely to this fact"}. Extremely important: Do not include markdown formatting like \`\`\`json, only output the raw array [ {"fact": "...", "image_query": "..."} ].`;
        
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel.name}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const geminiData = await geminiRes.json();
        if(geminiData.error) throw new Error("Gemini API Fehler: " + geminiData.error.message);
        
        let textContent = geminiData.candidates[0].content.parts[0].text.trim();
        if (textContent.startsWith("\`\`\`json")) textContent = textContent.replace(/\`\`\`json/g, "");
        if (textContent.startsWith("\`\`\`")) textContent = textContent.replace(/\`\`\`/g, "");
        
        const factsArray = JSON.parse(textContent.trim());

        const newSlides = factsArray.map((item) => {
            return {
                type: 'ai-slide',
                text: item.fact,
                imageQuery: item.image_query
            };
        });

        if (isAppending) {
            videoData[topic] = videoData[topic].concat(newSlides);
            customFolders[topic] = videoData[topic]; // Assuming it's already saved if we append
            saveCustomFolders();
            alert(`20 neue Fakten zu "${topic}" generiert!`);
            currentCategory = topic;
            loadCategory(topic);
        } else {
            videoData[topic] = newSlides;
            unsavedCategories.push(topic);
            currentCategory = topic;
            loadCategory(topic);
        }
        modalOverlay.classList.add('hidden');

    } catch (e) {
        console.error(e);
        modalTitle.textContent = 'Fehler!';
        menuContent.innerHTML = `<p style="color:#ff6b6b">${e.message}</p><button id="btn-back" class="menu-btn" style="margin-top:20px;">Zurück zum Menü</button>`;
        document.getElementById('btn-back').addEventListener('click', openMainMenu);
    }
}


// ---- Kernlogik ----
async function init() {
    if(noBlurState) document.body.classList.add('no-blur');

    try {
        const response = await fetch(VIDEOS_JSON_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const jsonVideos = await response.json();
        defaultFolders = jsonVideos;
        
        for (let key in defaultFolders) {
            if (!deletedFolders.includes(key)) videoData[key] = defaultFolders[key];
        }
        for (let key in customFolders) {
            videoData[key] = customFolders[key];
        }
        buildStartScreen();
    } catch (e) {
        console.error('Fehler beim Laden von videos.json:', e);
        for (let key in customFolders) videoData[key] = customFolders[key];
        buildStartScreen();
    }
}

function loadCategory(category) {
    if (!videoData[category] || videoData[category].length === 0) return;
    
    // Usage stats tracking for sorting
    folderUsage[category] = (folderUsage[category] || 0) + 1;
    localStorage.setItem('scroller_folder_usage', JSON.stringify(folderUsage));
    
    startScreen.classList.remove('visible');
    container.classList.remove('hidden');
    
    if (intersectionObserver) intersectionObserver.disconnect();
    
    container.innerHTML = '';
    progressBar.value = 0;
    stopSpeech();
    
    // Filter out previous special slides before mixing
    let normalPosts = videoData[category].filter(i => typeof i === 'string' || (i.type === 'ai-slide'));
    normalPosts = normalPosts.sort(() => Math.random() - 0.5);
    
    // Inject Save Prompt if unsaved, exactly at index 4 (so it's the 5th post)
    if (unsavedCategories.includes(category) && normalPosts.length >= 4) {
        normalPosts.splice(4, 0, { type: 'save-prompt' });
    }
    
    // Inject Generate More Prompt at the very end if it contains ai-slides
    const hasAiSlides = normalPosts.some(i => i.type && i.type === 'ai-slide');
    if (hasAiSlides) {
        normalPosts.push({ type: 'generate-more-prompt' });
    }

    videosList = normalPosts;
    currentlyPlayingIndex = 0;
    
    setupFeed();
    
    requestAnimationFrame(() => {
        container.scrollTo({top: 0, behavior: 'instant'});
    });
}

function setupFeed() {
    videosList.forEach((url, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.dataset.index = i;
        container.appendChild(wrapper);
    });

    const options = { root: container, rootMargin: '0px', threshold: 0.6 };
    intersectionObserver = new IntersectionObserver(handleIntersection, options);
    document.querySelectorAll('.video-wrapper').forEach(w => intersectionObserver.observe(w));
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

// ----- Media Management (Videos + AI Slides + Action Slides) -----

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
                const w = video.closest('.video-wrapper');
                if (w && parseInt(w.dataset.index) === currentlyPlayingIndex) {
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
        img.crossOrigin = "anonymous";
        
        const applyFallback = () => { img.src = `https://picsum.photos/seed/${encodeURIComponent(item.imageQuery || Math.random())}/1080/1920`; };
        const unsplashKey = localStorage.getItem('unsplash_key');
        
        if (item.image) {
            img.src = item.image;
        } else if (unsplashKey && item.imageQuery) {
            img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" fill="gray"></svg>`;
            fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(item.imageQuery)}&orientation=portrait&client_id=${unsplashKey}`)
            .then(r => { if(!r.ok) throw new Error("Unsplash Fetch error"); return r.json(); })
            .then(data => {
                img.src = data.urls.regular;
                item.image = data.urls.regular; 
            }).catch(e => { applyFallback(); });
        } else { applyFallback(); }
        
        img.onerror = () => { img.onerror = null; applyFallback(); };
        
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = item.text;
        
        div.appendChild(img);
        div.appendChild(overlay);
        div.appendChild(textDiv);
        
        return div;
    } else if (item && item.type === 'save-prompt') {
        const div = document.createElement('div');
        div.className = 'feed-action-slide media-content';
        div.dataset.type = 'action';
        // Random background for prompt
        div.style.backgroundImage = `url('https://picsum.photos/seed/${Math.random()}/1080/1920?blur=4')`;
        
        div.innerHTML = `
            <h2>Ordner speichern?<br><span style="font-size:1.2rem;font-weight:400;">Du bist beim 5. Post angekommen.</span></h2>
            <button class="feed-action-btn" id="btn-save-inline">Ordner Speichern</button>
            <button class="feed-action-btn secondary" id="btn-discard-inline">Nur weiter scrollen</button>
        `;
        
        div.querySelector('#btn-save-inline').addEventListener('click', () => {
            customFolders[currentCategory] = videoData[currentCategory];
            saveCustomFolders();
            unsavedCategories = unsavedCategories.filter(c => c !== currentCategory);
            alert(`Ordner "${currentCategory}" gespeichert!`);
            div.querySelector('#btn-save-inline').textContent = 'Gespeichert!';
            div.querySelector('#btn-save-inline').disabled = true;
        });

        // Dummy listener for discard (visually does nothing, user just scrolls passing it)
        div.querySelector('#btn-discard-inline').addEventListener('click', () => {
            alert("Du kannst einfach weiter scrollen!");
        });
        
        return div;
    } else if (item && item.type === 'generate-more-prompt') {
        const div = document.createElement('div');
        div.className = 'feed-action-slide media-content';
        div.dataset.type = 'action';
        div.style.backgroundImage = `url('https://picsum.photos/seed/end/1080/1920?blur=4')`;
        
        div.innerHTML = `
            <h2>Das war's vorerst für ${currentCategory}.</h2>
            <button class="feed-action-btn" id="btn-gen-more">Mehr generieren</button>
            <button class="feed-action-btn secondary" id="btn-go-home">Zur Startseite</button>
        `;
        
        div.querySelector('#btn-gen-more').addEventListener('click', (e) => {
            e.stopPropagation();
            modalOverlay.classList.remove('hidden'); // Show overlay to block clicks during fetch
            generateSmartCategory(currentCategory, currentDepth, true);
        });
        div.querySelector('#btn-go-home').addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.add('hidden');
            pauseAndUnloadMedia(currentlyPlayingIndex, document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`));
            buildStartScreen();
        });
        
        return div;
    }
}

// ... Scrubbing ...
progressBar.addEventListener('input', () => {
    isScrubbing = true;
    const w = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if(w) {
        const video = w.querySelector('video.media-content');
        if(video && video.duration) video.currentTime = (progressBar.value / 100) * video.duration;
    }
});
progressBar.addEventListener('change', () => { isScrubbing = false; });

function speakText(text) {
    if(!globalAudioEnabled) return;
    window.speechSynthesis.cancel();
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'en-US'; 
    currentUtterance.rate = 0.95;
    if(window.speechSynthesis.paused) window.speechSynthesis.resume();
    window.speechSynthesis.speak(currentUtterance);
}

function stopSpeech() { window.speechSynthesis.cancel(); }

function loadAndPlayMedia(index, wrapper) {
    let media = wrapper.querySelector('.media-content');
    if (!media) {
        media = createMediaElement(videosList[index]);
        wrapper.appendChild(media);
    }
    
    if (media.tagName === 'VIDEO') {
        progressContainer.style.display = 'flex'; 
        media.muted = !globalAudioEnabled;
        media.currentTime = 0;
        const playPromise = media.play();
        if (playPromise !== undefined) playPromise.catch(() => {});
    } else if (media.dataset.type === 'ai-slide') {
        progressContainer.style.display = 'none'; 
        if (modalOverlay.classList.contains('hidden')) speakText(media.dataset.text);
    } else if (media.dataset.type === 'action') {
        progressContainer.style.display = 'none'; 
        stopSpeech();
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
    const w = document.querySelector(`.video-wrapper[data-index="${index}"]`);
    if (w && !w.querySelector('.media-content')) {
        const media = createMediaElement(videosList[index]);
        if(media.tagName === 'VIDEO') media.preload = 'auto';
        w.appendChild(media);
    }
}

let indicatorTimeout;
function showIndicator(type) {
    playIndicator.classList.remove('show');
    pauseIndicator.classList.remove('show');
    playIndicator.classList.add('hidden');
    pauseIndicator.classList.add('hidden');
    const ind = type === 'play' ? playIndicator : pauseIndicator;
    ind.classList.remove('hidden');
    void ind.offsetWidth; 
    ind.classList.add('show');
    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
        ind.classList.remove('show');
        setTimeout(() => ind.classList.add('hidden'), 200);
    }, 1000);
}

function handleGlobalTap(e) {
    // Ignore taps on action slides
    if (e.target.closest('.feed-action-slide')) return;

    const w = document.querySelector(`.video-wrapper[data-index="${currentlyPlayingIndex}"]`);
    if (!w) return;
    const media = w.querySelector('.media-content');
    if (!media || media.dataset.type === 'action') return;

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
        if (media.paused) { media.play(); showIndicator('play'); }
        else { media.pause(); showIndicator('pause'); }
    } else if (media.dataset.type === 'ai-slide') {
        if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); showIndicator('play'); }
        else if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); showIndicator('pause'); }
        else { speakText(media.dataset.text); showIndicator('play'); }
    }
}
