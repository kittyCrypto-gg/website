import { forceBookmark } from './reader.js';
import * as loader from './loader.js';

class ReadAloudModule {
    #SDK_CDN;
    #buttons;
    #EYE_OPEN_SVG;
    #EYE_CLOSED_SVG;
    #svgCache;
    #VOICES;
    #REGIONS;
    #MENU_HTML;
    #HELP_MODAL;
    #JUMP_VIS_KEY = 'readAloudJumpVisible';
    #SPEECH_RESOURCE_KEY = 'readAloudSpeechResource';
    #regionResolvePromise = null;


    #boundShowMenu;
    #boundReload;
    #boundCloseMenu;
    #boundMenuVis;

    constructor() {
        this.#SDK_CDN =
            'https://kittycrypto.gg/external?src=https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.44.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle.js';

        this.#buttons = {
            play: { icon: '▶️', action: 'Start Read Aloud' },
            pause: { icon: '⏸️', action: 'Pause Read Aloud' },
            stop: { icon: '⏹️', action: 'Stop Read Aloud' },
            next: { icon: '⏩', action: 'Next Paragraph' },
            prev: { icon: '⏪', action: 'Previous Paragraph' },
            restart: { icon: '⏮️', action: 'Restart' },
            config: { icon: '⚙️', action: 'Configure Read Aloud' },
            hide: { icon: '👁️', action: 'Hides Read Aloud menu' },
            info: { icon: 'ℹ️', action: 'Show Info' },
            jump: { icon: '🧭', action: 'Show or hide jump to paragraph' },
            help: { icon: '❓', action: 'Help' }
        };

        this.#EYE_OPEN_SVG = '../images/eyeopen.svg';
        this.#EYE_CLOSED_SVG = '../images/eyeclosed.svg';
        this.#svgCache = new Map();

        this.#VOICES = [
            { name: 'en-US-JennyNeural', locale: 'en-US', description: 'American English (US), Female, Jenny (default)' },
            { name: 'en-US-AriaNeural', locale: 'en-US', description: 'American English (US), Female, Aria' },
            { name: 'en-GB-SoniaNeural', locale: 'en-GB', description: 'British English (UK), Female, Sonia' },
            { name: 'en-GB-LibbyNeural', locale: 'en-GB', description: 'British English (UK), Female, Libby' },
            { name: 'en-AU-NatashaNeural', locale: 'en-AU', description: 'Australian English (AU), Female, Natasha' },
            { name: 'en-CA-ClaraNeural', locale: 'en-CA', description: 'Canadian English (CA), Female, Clara' },
            { name: 'en-IN-NeerjaNeural', locale: 'en-IN', description: 'Indian English (IN), Female, Neerja' },
            { name: 'en-NZ-MollyNeural', locale: 'en-NZ', description: 'New Zealand English (NZ), Female, Molly' },
            { name: 'en-IE-EmilyNeural', locale: 'en-IE', description: 'Irish English (IE), Female, Emily' },
            { name: 'en-ZA-LeahNeural', locale: 'en-ZA', description: 'South African English (ZA), Female, Leah' }
        ];

        this.#REGIONS = [
            'eastus', 'eastus2', 'southcentralus', 'westus2', 'westus3',
            'australiaeast', 'southeastasia', 'northeurope', 'swedencentral',
            'uksouth', 'westeurope', 'centralus', 'northcentralus',
            'westus', 'southafricanorth', 'centralindia', 'eastasia',
            'japaneast', 'japanwest', 'koreacentral', 'canadacentral',
            'francecentral', 'germanywestcentral', 'norwayeast', 'switzerlandnorth',
            'uaenorth', 'brazilsouth'
        ];

        this.#MENU_HTML = `
            <span id="read-aloud-close" class="read-aloud-close-button" title="Close menu">❌</span>
            <div class="read-aloud-header"> Read Aloud </div>
            <div class="read-aloud-controls">
                <div class="read-aloud-fields">
                <button id="read-aloud-region-toggle" title="Set region manually">🌍</button>
                <div class="read-aloud-apikey-wrap">
                    <input id="read-aloud-apikey" type="password" placeholder="Azure Speech API Key" class="read-aloud-control" />
                    <div
                    class="read-aloud-apikey-eye"
                    role="button"
                    tabindex="0"
                    aria-label="Show API key"
                    title="Show API key"
                    ></div>
                </div>
                <div id="read-aloud-region-wrap" class="read-aloud-apikey-wrap" style="display:none">
                    <input
                    id="read-aloud-region-input"
                    type="text"
                    placeholder="Region (e.g. uksouth)"
                    class="read-aloud-control"
                    list="read-aloud-region-list"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    />
                </div>
                <datalist id="read-aloud-region-list">
                    ${this.#REGIONS.map(r => `<option value="${r}"></option>`).join('')}
                </datalist>
                <select id="read-aloud-voice" class="read-aloud-control">
                    ${this.#VOICES.map(v => `<option value="${v.name}">${v.description}</option>`).join('')}
                </select>
                <select id="read-aloud-rate" class="read-aloud-control">
                    ${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => `<option value="${rate}">${rate}x</option>`).join('')}
                </select>
                </div>
                <div class="read-aloud-buttons">
                    <button id="read-aloud-toggle-playpause" title="${this.#buttons.play.action}">${this.#buttons.play.icon}</button>
                    <button id="read-aloud-prev" title="${this.#buttons.prev.action}">${this.#buttons.prev.icon}</button>
                    <button id="read-aloud-next" title="${this.#buttons.next.action}">${this.#buttons.next.icon}</button>
                    <button id="read-aloud-stop" title="${this.#buttons.stop.action}">${this.#buttons.stop.icon}</button>
                    <button id="read-aloud-restart" title="${this.#buttons.restart.action}">${this.#buttons.restart.icon}</button>
                    <button id="read-aloud-info" title="${this.#buttons.info.action}">${this.#buttons.info.icon}</button>
                    <button id="read-aloud-hide" class = "menu-crossed" title="${this.#buttons.hide.action}">${this.#buttons.hide.icon}</button>
                    <button id="read-aloud-config" class = "menu-crossed" title="${this.#buttons.config.action}">${this.#buttons.config.icon}</button>
                    <button id="read-aloud-jump-toggle" class="menu-crossed" title="${this.#buttons.jump.action}">${this.#buttons.jump.icon}</button>
                    <button id="read-aloud-help" title="${this.#buttons.help.action}">${this.#buttons.help.icon}</button>
                    <div class="read-aloud-jump">
                        <input
                            id="read-aloud-jump-input"
                            class="read-aloud-jump-input"
                            type="number"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            min="1"
                            step="1"
                            placeholder="¶ #"
                            title="Paragraph number"
                        />
                        <button id="read-aloud-jump-go" title="Jump to paragraph">✅</button>
                    </div>
                </div>
            </div>
        `;

        this.#HELP_MODAL = `
            <div class="modal-header">
                <h2>Azure Speech Service Read Aloud Help</h2>
                </div>
                <div class="modal-content">
                <ul>
                    <li>To use this feature, you need an Azure Speech API key and region.</li>
                    <li>Get your API key <a href="https://portal.azure.com/" target="_blank" rel="noopener">here</a>.</li>
                    <li>Paste your API key in the field.</li>
                    <li>Select your region and preferred voice.</li>
                    <li>Use the play button to start.</li>
                </ul>
                <p>
                    For further help, see the
                    <a href="https://learn.microsoft.com/en-gb/azure/ai-services/speech-service/" target="_blank" rel="noopener">official docs</a>.
                </p>
                <p class="modal-note">
                    <b>Note:</b> KittyCrypto.gg will <u>NOT</u> store your API key or region server-side. It is saved only in your browser's local storage.<br>
                    See the full implementation on
                    <a href="https://github.com/kittyCrypto-gg/kittycrypto/blob/main/scripts/readAloud.js" target="_blank" rel="noopener">GitHub</a>.
                </p>
                <p class="modal-note">
                    <b>Note:</b> Click anywhere outside this modal to close it.<br>
                    You can also press <kbd>Esc</kbd> to close it.
                </p>
                </div>
        `;

        this.#boundShowMenu = this.showMenu.bind(this);
        this.#boundReload = this.reloadReadAloud.bind(this);
        this.#boundCloseMenu = this.__closeMenu.bind(this);
        this.#boundMenuVis = this.__toggleVis.bind(this);

        window.readAloudState = {
            paused: true,
            pressed: false,
            currentParagraphIndex: 0,
            currentParagraphId: null,
            paragraphs: [],
            synthesizer: null,
            lastSpokenText: '',
            voiceName: this.#VOICES[0].name,
            speechKey: '',
            serviceRegion: '',
            speechRate: 1.0,
            configVisible: false,
            menuVisible: true,
            jumpVisible: true,
            buffer: null,
            currentAudioUrl: null,
            apiKeyVisible: false,
            regionUiVisible: false,
        };

        this.__onControlsDetach = (e) => {
            this.__positionMenu(e.detail.detached);
        };

        window.addEventListener(
            "reader:controls-detached",
            this.__onControlsDetach
        );
    }

    getMenuHndlr() {
        return this.#boundShowMenu;
    }

    getReloadHndlr() {
        return this.#boundReload;
    }

    async __sdkReady() {
        if (window.SpeechSDK) return window.SpeechSDK;
        if (window._speechSDKReadyPromise) return window._speechSDKReadyPromise;

        window._speechSDKReadyPromise = (async () => {
            await loader.loadScript(this.#SDK_CDN);

            if (!window.SpeechSDK) {
                throw new Error('SpeechSDK loaded but not available on window');
            }

            return window.SpeechSDK;
        })().catch(err => {
            window._speechSDKReadyPromise = null;
            throw err;
        });

        return window._speechSDKReadyPromise;
    }

    async __getSvgMarkup(path) {
        const cached = this.#svgCache.get(path);
        if (cached) return cached;

        const res = await fetch(path, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`Failed to load SVG: ${path}`);

        const svg = await res.text();
        this.#svgCache.set(path, svg);
        return svg;
    }

    async __applyApiKeyVisibility(apikeyInput, apikeyEye, visible) {
        if (!apikeyInput || !apikeyEye) return;

        apikeyInput.type = visible ? 'text' : 'password';
        window.readAloudState.apiKeyVisible = visible;

        // Button shows the action it will do next:
        // hidden -> show open eye (press to show)
        // shown  -> show closed eye (press to hide)
        const willShow = !visible;

        apikeyEye.setAttribute('aria-label', willShow ? 'Show API key' : 'Hide API key');
        apikeyEye.setAttribute('title', willShow ? 'Show API key' : 'Hide API key');

        const src = willShow ? this.#EYE_OPEN_SVG : this.#EYE_CLOSED_SVG;

        try {
            apikeyEye.innerHTML = await this.__getSvgMarkup(src);
        } catch (err) {
            // Fallback: still usable even if SVG fails to load
            apikeyEye.textContent = willShow ? '🙊' : '🙈';
        }
    }

    __escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            "'": '&apos;',
            '"': '&quot;'
        }[c]));
    }

    __sleep(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    __readSpeechResource() {
        const raw = localStorage.getItem(this.#SPEECH_RESOURCE_KEY);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;

            const speechKey = typeof parsed.speechKey === 'string' ? parsed.speechKey : '';
            const region = typeof parsed.region === 'string' ? parsed.region : '';
            const regionLocked = typeof parsed.regionLocked === 'boolean' ? parsed.regionLocked : false;

            return { speechKey, region, regionLocked };
        } catch {
            return null;
        }
    }

    __writeSpeechResource(next) {
        const safe = {
            speechKey: String(next?.speechKey || ''),
            region: String(next?.region || ''),
            regionLocked: Boolean(next?.regionLocked),
            updatedAt: Date.now()
        };

        localStorage.setItem(this.#SPEECH_RESOURCE_KEY, JSON.stringify(safe));
    }

    __migrateResource() {
        const already = this.__readSpeechResource();
        if (already) return;

        const legacyKey = localStorage.getItem('readAloudSpeechApiKey') || '';
        const legacyRegion = localStorage.getItem('readAloudSpeechRegion') || '';

        if (!legacyKey && !legacyRegion) return;

        this.__writeSpeechResource({
            speechKey: legacyKey,
            region: legacyRegion,
            regionLocked: legacyRegion !== ''
        });

        localStorage.removeItem('readAloudSpeechApiKey');
        localStorage.removeItem('readAloudSpeechRegion');
    }

    async __probeRegionForKey(speechKey, region) {
        if (!speechKey || !region) return { ok: false, status: 0 };

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3500);

        try {
            const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Ocp-Apim-Subscription-Key': speechKey },
                signal: controller.signal
            });

            return { ok: res.ok, status: res.status };
        } catch {
            return { ok: false, status: 0 };
        } finally {
            window.clearTimeout(timeout);
        }
    }

    async __resolveRegionForKey(speechKey, preferredRegion) {
        const regions = this.#REGIONS.slice();
        const ordered = preferredRegion
            ? [preferredRegion, ...regions.filter(r => r !== preferredRegion)]
            : regions;

        for (const region of ordered) {
            const probe = await this.__probeRegionForKey(speechKey, region);

            if (probe.status === 429) {
                return { region: null, reason: 'rate_limited' };
            }

            if (probe.ok) {
                return { region, reason: 'ok' };
            }

            await this.__sleep(140);
        }

        return { region: null, reason: 'not_found' };
    }

    async __ensureRegionForKey(speechKey, preferredRegion) {
        if (!speechKey) return { region: null, reason: 'no_key' };

        if (this.#regionResolvePromise) return this.#regionResolvePromise;

        this.#regionResolvePromise = (async () => {
            const result = await this.__resolveRegionForKey(speechKey, preferredRegion);
            return result;
        })().finally(() => {
            this.#regionResolvePromise = null;
        });

        return this.#regionResolvePromise;
    }

    __getParagraphPlainText(paragraph) {
        if (!paragraph) return '';

        // Clone so we do not mutate the DOM
        const clone = paragraph.cloneNode(true);

        // Strip reader UI artefacts
        clone.querySelectorAll('.reader-paragraph-num, .bookmark-emoji').forEach(n => n.remove());

        // Prefer textContent so we do not accidentally pull in layout-only text
        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }


    __buildSSML(text, voiceName, rate) {
        const rateMap = {
            0.5: '-50%',
            0.75: '-25%',
            1: '0%',
            1.25: '25%',
            1.5: '50%',
            1.75: '75%',
            2: '100%'
        };
        const prosodyRate = rateMap[rate] || '95%';

        return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
            xmlns:mstts="http://www.w3.org/2001/mstts"
            xml:lang="en-US">
            <voice name="${voiceName}">
                <prosody rate="${prosodyRate}">
                ${this.__escapeXml(text)}
                </prosody>
            </voice>
        </speak>
    `;
    }

    __setRegionUiVisible(visible) {
        const wrap = document.getElementById('read-aloud-region-wrap');
        const btn = document.getElementById('read-aloud-region-toggle');
        const fields = document.querySelector('#read-aloud-menu .read-aloud-fields');
        const apikeyWrap = document.querySelector('#read-aloud-menu .read-aloud-apikey-wrap');
        const regionInput = document.getElementById('read-aloud-region-input');

        if (!wrap || !btn || !fields || !apikeyWrap || !regionInput) return;

        if (visible) {
            wrap.style.display = 'flex';
            wrap.appendChild(btn);
            btn.classList.add('read-aloud-apikey-eye');
            btn.setAttribute('title', 'Hide region input');
            window.readAloudState.regionUiVisible = true;
            regionInput.focus();
            return;
        }

        wrap.style.display = 'none';
        btn.classList.remove('read-aloud-apikey-eye');
        btn.setAttribute('title', 'Set region manually');
        fields.insertBefore(btn, apikeyWrap);
        window.readAloudState.regionUiVisible = false;
    }

    async __handleRuntimeSpeakFailure() {
        const state = window.readAloudState;
        if (!state.speechKey || !state.serviceRegion) return false;

        const stored = this.__readSpeechResource();
        if (!stored?.regionLocked) return false;

        const probe = await this.__probeRegionForKey(state.speechKey, state.serviceRegion);

        if (probe.status === 0) return false;

        if (probe.status === 429) {
            window.alert('Azure region check was rate limited. Please try again in a moment.');
            return true;
        }

        if (probe.ok) return false;

        window.alert(
            'Your Azure Speech region does not work with this API key. Check what you entered. ' +
            'If you clear the region and press Play, the app will try to detect it automatically.'
        );

        this.__toggleCnfg(true);
        this.__setRegionUiVisible(true);
        return true;
    }

    __positionMenu(detached) {
        const menu = document.getElementById("read-aloud-menu");
        if (!menu) return;

        if (!detached) {
            menu.style.top = "0";
            menu.style.bottom = "";
            menu.style.transform = "translateX(-50%)";
            return;
        }

        const updateBottomAnchor = () => {
            const h = menu.offsetHeight;
            menu.style.top = `calc(100vh - ${h}px)`;
            menu.style.bottom = "";
            menu.style.transform = "translateX(-50%)";
        };

        updateBottomAnchor();

        if (!this.__menuResizeObserver) {
            this.__menuResizeObserver = new ResizeObserver(updateBottomAnchor);
            this.__menuResizeObserver.observe(menu);
        }
    }

    showMenu() {
        window.readAloudState.pressed = true;

        const toggleBtn = document.getElementById('read-aloud-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = toggleBtn.getAttribute('data-disable');
            toggleBtn.classList.add('active');
            toggleBtn.removeEventListener('click', this.#boundShowMenu);
            toggleBtn.addEventListener('click', this.#boundCloseMenu);
        }

        const menu = document.getElementById('read-aloud-menu');
        if (!menu) {
            console.error('Read Aloud menu element not found in DOM');
            return;
        }

        if (menu.style.display === 'flex') return;

        menu.innerHTML = this.#MENU_HTML;

        menu.style.display = 'flex';

        this.__migrateResource();

        const menuElements = {
            apikeyInput: document.getElementById('read-aloud-apikey'),
            apikeyEye: document.querySelector('#read-aloud-menu .read-aloud-apikey-eye'),
            //regionDropdown: document.getElementById('read-aloud-region'),
            regionToggleBtn: document.getElementById('read-aloud-region-toggle'),
            regionWrap: document.getElementById('read-aloud-region-wrap'),
            regionInput: document.getElementById('read-aloud-region-input'),
            fieldsWrap: document.querySelector('#read-aloud-menu .read-aloud-fields'),
            apikeyWrap: document.querySelector('#read-aloud-menu .read-aloud-apikey-wrap'),
            voiceDropdown: document.getElementById('read-aloud-voice'),
            rateDropdown: document.getElementById('read-aloud-rate'),
            playPauseBtn: document.getElementById('read-aloud-toggle-playpause'),
            stopBtn: document.getElementById('read-aloud-stop'),
            prevBtn: document.getElementById('read-aloud-prev'),
            nextBtn: document.getElementById('read-aloud-next'),
            restartBtn: document.getElementById('read-aloud-restart'),
            configBtn: document.getElementById('read-aloud-config'),
            hideBtn: document.getElementById('read-aloud-hide'),
            infoBtn: document.getElementById('read-aloud-info'),
            helpBtn: document.getElementById('read-aloud-help'),
            jumpToggleBtn: document.getElementById('read-aloud-jump-toggle'),
            jumpWrap: document.querySelector('.read-aloud-jump'),
            jumpInput: document.getElementById('read-aloud-jump-input'),
            jumpGoBtn: document.getElementById('read-aloud-jump-go')
        };

        const missing = Object.entries(menuElements)
            .filter(([, el]) => !el)
            .map(([key]) => key);

        if (missing.length) {
            console.error('Read Aloud menu elements not found:', missing);
            return;
        }

        const stored = this.__readSpeechResource();
        menuElements.apikeyInput.value = stored?.speechKey || '';
        menuElements.regionInput.value = stored?.region || '';
        menuElements.regionInput.style.paddingRight = '44px';

        const savedJumpVis = localStorage.getItem(this.#JUMP_VIS_KEY);
        const jumpVisible = savedJumpVis == null ? true : savedJumpVis === 'true';
        this.__toggleJump(jumpVisible);

        //menuElements.apikeyInput.value = localStorage.getItem('readAloudSpeechApiKey') || '';

        void this.__applyApiKeyVisibility(
            menuElements.apikeyInput,
            menuElements.apikeyEye,
            !!window.readAloudState.apiKeyVisible
        );

        const toggleApiKeyVisibility = () => {
            const visibleNow = menuElements.apikeyInput.type === 'text';
            void this.__applyApiKeyVisibility(
                menuElements.apikeyInput,
                menuElements.apikeyEye,
                !visibleNow
            );
        };

        menuElements.apikeyEye?.addEventListener('click', toggleApiKeyVisibility);

        menuElements.apikeyEye?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggleApiKeyVisibility();
        });

        this.__toggleCnfg(
            !localStorage.getItem('readAloudConfigMenuHidden') ||
                localStorage.getItem('readAloudConfigMenuHidden') === 'false'
                ? true
                : window.readAloudState.configVisible
        );

        this.__setRegionUiVisible(!!window.readAloudState.regionUiVisible);

        menuElements.regionToggleBtn.addEventListener('click', () => {
            const next = !window.readAloudState.regionUiVisible;
            this.__setRegionUiVisible(next);
        });

        // menuElements.regionInput.addEventListener('input', (e) => {
        //     const raw = String(e.target.value || '').trim().toLowerCase();
        //     this.__saveRegion(raw);
        // });

        menuElements.regionInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const raw = menuElements.regionInput.value.trim().toLowerCase();
            this.__saveRegion(raw);
            this.__setRegionUiVisible(false);
        });

        //menuElements.regionDropdown.value = localStorage.getItem('readAloudSpeechRegion') || this.#REGIONS[0];
        menuElements.voiceDropdown.value = localStorage.getItem('readAloudPreferredVoice') || this.#VOICES[0].name;
        menuElements.rateDropdown.value = this.__getSpeechRate().toString();

        menuElements.apikeyInput.addEventListener('input', e => this.__saveApiKey(e.target.value.trim()));
        //menuElements.regionDropdown.addEventListener('change', e => this.__saveRegion(e.target.value));

        menuElements.playPauseBtn.addEventListener('click', async () => {
            const state = window.readAloudState;

            if (!state.paused) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
                await this.__pause();
                return;
            }

            const speechKey = menuElements.apikeyInput.value.trim();
            const voiceName = menuElements.voiceDropdown.value;

            state.speechKey = speechKey;
            state.voiceName = voiceName;

            if (!speechKey) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
                window.alert('Please enter your Azure Speech API key.');
                return;
            }

            const storedBefore = this.__readSpeechResource();
            const storedKey = storedBefore?.speechKey || '';
            let storedRegion = storedBefore?.region || '';
            let storedRegionLocked = !!storedBefore?.regionLocked;

            if (storedKey !== speechKey) {
                this.__writeSpeechResource({
                    speechKey,
                    region: storedRegion,
                    regionLocked: storedRegionLocked
                });
            }

            const typedRegion = menuElements.regionInput.value.trim().toLowerCase();
            const userEditingRegion = !!state.regionUiVisible;

            if (userEditingRegion && typedRegion === '') {
                storedRegion = '';
                storedRegionLocked = false;
                this.__writeSpeechResource({ speechKey, region: '', regionLocked: false });
            }

            const typedOverride = userEditingRegion && typedRegion !== '' && typedRegion !== storedRegion;
            const hasLockedRegion = typedOverride || (storedRegionLocked && storedRegion !== '');
            const lockedRegion = typedOverride ? typedRegion : storedRegion;

            const canReuseCached = !hasLockedRegion && storedKey === speechKey && storedRegion !== '';

            const regionDetectModalId = 'readaloud-region-detect-modal';
            const regionDetectHtml = `
                <div class="modal-header">
                    <h2>Detecting Azure region…</h2>
                </div>
                <div class="modal-content">
                    <p>Checking regions for your API key. This can take a few seconds.</p>
                    <p class="modal-note">Press <kbd>Esc</kbd> to close this message.</p>
                </div>
            `;

            const shouldDetect = !hasLockedRegion && !canReuseCached;

            let resolved;

            try {
                if (shouldDetect) {
                    this.__openCustomModal(regionDetectHtml, regionDetectModalId);
                    document.documentElement.classList.add('cursor-wait');
                }

                resolved = hasLockedRegion
                    ? { region: lockedRegion, reason: 'locked' }
                    : canReuseCached
                        ? { region: storedRegion, reason: 'cached' }
                        : await this.__ensureRegionForKey(speechKey, storedRegion);
            } finally {
                if (shouldDetect) {
                    this.__closeCustomModal(regionDetectModalId);
                    document.documentElement.classList.remove('cursor-wait');
                }
            }


            if (!resolved.region) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;

                window.alert(
                    resolved.reason === 'rate_limited'
                        ? 'Region check was rate limited. Please use the 🌍 button and enter your region manually, then try again.'
                        : 'Could not find a working region for this key. Please use the 🌍 button and enter your region manually.'
                );

                this.__toggleCnfg(true);
                this.__setRegionUiVisible(true);
                return;
            }

            state.serviceRegion = resolved.region;
            menuElements.regionInput.value = resolved.region;

            this.__writeSpeechResource({
                speechKey,
                region: resolved.region,
                regionLocked: hasLockedRegion
            });

            menuElements.playPauseBtn.textContent = this.#buttons.pause.icon;

            if (!state.paragraphs.length) {
                await this.__readAloud(speechKey, state.serviceRegion, voiceName);
                return;
            }

            await this.__resume();
        });

        menuElements.stopBtn.addEventListener('click', async () => {
            menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
            await this.__clear();
        });

        menuElements.infoBtn.addEventListener('click', () => {
            const info = Object.entries(this.#buttons)
                .map(([, val]) => `${val.icon} — ${val.action}`)
                .join('\n');
            window.alert(`Read Aloud Menu Buttons:\n\n${info}`);
        });

        menuElements.helpBtn.addEventListener('click', () => {
            this.__openCustomModal(this.#HELP_MODAL, 'readaloud-help-modal');
        });

        menuElements.prevBtn.addEventListener('click', async () => {
            await this.__prevParagraph();
        });

        menuElements.nextBtn.addEventListener('click', async () => {
            await this.__nextParagraph();
        });

        menuElements.restartBtn.addEventListener('click', async () => {
            await this.__restartAll();
        });

        menuElements.configBtn.addEventListener('click', () => {
            this.__toggleCnfg();
        });

        menuElements.hideBtn.addEventListener('click', () => {
            this.__toggleVis();
        });

        menuElements.jumpToggleBtn.addEventListener('click', () => {
            this.__toggleJump();
        });

        const doJump = async () => {
            const raw = menuElements.jumpInput.value.trim();
            if (!raw) return;

            const paragraphNumber = Number.parseInt(raw, 10);
            if (!Number.isFinite(paragraphNumber) || paragraphNumber <= 0) return;

            await this.__jumpToParagraphNumber(paragraphNumber);
        };

        menuElements.jumpGoBtn.addEventListener('click', async () => {
            await doJump();
        });

        menuElements.jumpInput.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            await doJump();
        });

        menuElements.rateDropdown.addEventListener('change', async (e) => {
            const rate = parseFloat(e.target.value);
            window.readAloudState.speechRate = rate;
            this.__saveSpeechRate(rate);

            const state = window.readAloudState;
            const idx = state.currentParagraphIndex;

            await this.__clearBuffer(state, idx).catch(err => {
                console.error('[Change Rate] Error clearing Read Aloud buffer:', err);
            });
        });

        menuElements.voiceDropdown.addEventListener('change', async (e) => {
            this.__savePreferredVoice(e.target.value);

            const voiceName = e.target.value;
            window.readAloudState.voiceName = voiceName;

            const state = window.readAloudState;
            const idx = state.currentParagraphIndex;

            await this.__clearBuffer(state, idx).catch(err => {
                console.error('[Change Voice] Error clearing Read Aloud buffer:', err);
            });
        });

        window.readAloudState.speechRate = this.__getSpeechRate();

        this.__enableNav();

        document.getElementById('read-aloud-close')?.addEventListener('click', () => {
            this.#boundCloseMenu();
        });

        const fields = document.querySelector('.read-aloud-fields');
        if (!fields) return;
        fields.style.display = window.readAloudState.configVisible ? 'flex' : 'none';

        // Sync with current floating state
        const controls = document.querySelector(".reader-controls-top");
        this.__positionMenu(
            !!controls && controls.classList.contains("is-detached")
        );
    }

    __enableNav() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('play', async () => {
            await this.__resume();
        });

        navigator.mediaSession.setActionHandler('pause', async () => {
            await this.__pause();
        });

        navigator.mediaSession.setActionHandler('previoustrack', async () => {
            await this.__prevParagraph();
        });

        navigator.mediaSession.setActionHandler('nexttrack', async () => {
            await this.__nextParagraph();
        });
    }

    __toggleCnfg(forceValue = null) {
        const fields = document.querySelector('.read-aloud-fields');
        const configBtn = document.getElementById('read-aloud-config');
        if (!fields) return;

        const newValue = forceValue !== null
            ? !!forceValue
            : !window.readAloudState.configVisible;

        fields.style.display = newValue ? 'flex' : 'none';
        if (configBtn) configBtn.classList.toggle('menu-crossed', newValue);

        window.readAloudState.configVisible = newValue;
        localStorage.setItem('readAloudConfigVisible', String(newValue));
        localStorage.setItem('readAloudConfigMenuHidden', String(!newValue));

        return newValue;
    }

    __toggleJump(forceValue = null) {
        const jumpWrap = document.querySelector('.read-aloud-jump');
        const btn = document.getElementById('read-aloud-jump-toggle');
        if (!jumpWrap || !btn) return;

        const current = window.readAloudState.jumpVisible;
        const newValue = forceValue !== null ? !!forceValue : !current;

        jumpWrap.style.display = newValue ? 'flex' : 'none';

        // Your convention: "menu-crossed" means ON/visible
        btn.classList.toggle('menu-crossed', newValue);

        window.readAloudState.jumpVisible = newValue;
        localStorage.setItem(this.#JUMP_VIS_KEY, String(newValue));

        return newValue;
    }

    __toggleVis() {
        const menu = document.getElementById('read-aloud-menu');
        const toggleBtn = document.getElementById('read-aloud-toggle');
        if (!menu || !toggleBtn) return;

        if (!window.readAloudState.originalMenuDisplay) {
            const computed = window.getComputedStyle(menu).display;
            window.readAloudState.originalMenuDisplay = menu.style.display || computed || 'flex';
        }

        if (window.readAloudState.menuVisible) {
            menu.style.display = 'none';
            window.readAloudState.menuVisible = false;

            toggleBtn.textContent = toggleBtn.getAttribute('data-enable');
            toggleBtn.classList.remove('active');
            toggleBtn.classList.add('menu-eye');

            toggleBtn.removeEventListener('click', this.#boundCloseMenu);
            toggleBtn.addEventListener('click', this.#boundMenuVis);
            return;
        }

        menu.style.display = window.readAloudState.originalMenuDisplay;
        window.readAloudState.menuVisible = true;

        toggleBtn.textContent = toggleBtn.getAttribute('data-disable');
        toggleBtn.classList.add('active');
        toggleBtn.classList.remove('menu-eye');

        toggleBtn.removeEventListener('click', this.#boundMenuVis);
        toggleBtn.addEventListener('click', this.#boundCloseMenu);
    }

    async __restartAll() {
        const state = window.readAloudState;
        state.paused = true;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();

        if (!state.paragraphs.length) return;

        state.currentParagraphIndex = 0;
        state.currentParagraphId = state.paragraphs[0] ? state.paragraphs[0].id : null;

        state.paused = false;
        await this.__speakP(0);
    }

    async __closeMenu() {
        const menu = document.getElementById('read-aloud-menu');
        if (!menu) return;

        const toggleBtn = document.getElementById('read-aloud-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = toggleBtn.getAttribute('data-enable');
            toggleBtn.classList.remove('active');
            toggleBtn.removeEventListener('click', this.#boundCloseMenu);
            toggleBtn.addEventListener('click', this.#boundShowMenu);
        }

        menu.style.display = 'none';

        const playPauseBtn = document.getElementById('read-aloud-toggle-playpause');
        if (playPauseBtn) playPauseBtn.textContent = this.#buttons.play.icon;

        window.readAloudState.pressed = false;

        menu.style.left = '50%';
        menu.style.top = '0';
        menu.style.transform = 'translateX(-50%)';

        await this.__pause();
    }

    async __readAloud(
        speechKey,
        serviceRegion,
        voiceName = this.#VOICES[0].name,
        tag = 'article',
        id = 'reader',
        className = 'reader-container',
        startFromId = null
    ) {
        await this.__sdkReady();

        let selector = tag;
        if (id) selector += `#${id}`;
        if (className) selector += `.${className}`;

        const container = document.querySelector(selector);
        if (!container) {
            console.error(`Element not found: ${selector}`);
            return;
        }

        const paragraphs = Array.from(container.querySelectorAll('.reader-bookmark'));
        if (!paragraphs.length) {
            console.error('No paragraphs found for read aloud.');
            return;
        }

        const startIdx = this.__startIndex(paragraphs, startFromId);

        window.readAloudState.paused = false;
        window.readAloudState.currentParagraphIndex = startIdx;
        window.readAloudState.currentParagraphId = paragraphs[startIdx] ? paragraphs[startIdx].id : null;
        window.readAloudState.paragraphs = paragraphs;
        window.readAloudState.voiceName = voiceName;
        window.readAloudState.speechKey = speechKey;
        window.readAloudState.serviceRegion = serviceRegion;

        await this.__speakP(startIdx);
    }

    __startIndex(paragraphs, startFromId) {
        const idx = paragraphs.findIndex(p => p.id === startFromId);
        if (idx >= 0) return idx;

        const saved = localStorage.getItem('readAloudAudioPosition');
        if (!saved) return 0;

        let savedObj;
        try {
            savedObj = JSON.parse(saved);
        } catch {
            return 0;
        }

        if (!savedObj) return 0;

        const idxSaved = savedObj.paragraphId
            ? paragraphs.findIndex(p => p.id === savedObj.paragraphId)
            : -1;

        if (idxSaved >= 0) return idxSaved;

        if (typeof savedObj.paragraphIndex === 'number' && savedObj.paragraphIndex >= 0 && savedObj.paragraphIndex < paragraphs.length) {
            return savedObj.paragraphIndex;
        }

        return 0;
    }

    async __speakP(idx) {
        const state = window.readAloudState;
        if (state.paused || idx >= state.paragraphs.length) return;

        if (
            state.currentParagraphIndex !== undefined &&
            state.currentParagraphIndex !== idx &&
            state.paragraphs[state.currentParagraphIndex]
        ) {
            this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);
        }

        const paragraph = state.paragraphs[idx];
        this.__highlightP(paragraph);
        this.__scrollToP(paragraph);

        const plainText = this.__getParagraphPlainText(paragraph);
        if (!plainText) {
            await this.__speakP(idx + 1);
            return;
        }

        if ('mediaSession' in navigator) {
            const params = new URLSearchParams(window.location.search);
            const rawStory = params.get('story') || '';
            const chapter = params.get('chapter') || '';

            const storyName = decodeURIComponent(rawStory).split('/').pop() || 'Unknown Story';
            const chapterName = `Chapter ${chapter}`;
            const artist = window.location.origin;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: plainText.slice(0, 60),
                artist,
                album: storyName,
                track: chapterName,
                artwork: []
            });
        }

        if (!state.speechKey || !state.serviceRegion) {
            window.alert('Please enter your Azure Speech API key. The region will be detected automatically, or you can set it with 🌍.');
            return;
        }

        if (typeof SpeechSDK === 'undefined') {
            window.alert('Speech SDK is not loaded. Please check your connection or script includes.');
            return;
        }

        state.currentParagraphIndex = idx;
        state.currentParagraphId = paragraph.id;
        state.lastSpokenText = plainText;

        localStorage.setItem('readAloudAudioPosition', JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        forceBookmark(state.currentParagraphId);

        try {
            let audioData;

            if (state.buffer && state.buffer.idx === idx) {
                audioData = state.buffer.audioData;
                state.buffer = null;
            } else {
                audioData = await this.__bufferPAudio(idx, true);
            }

            if (idx + 1 < state.paragraphs.length) {
                this.__bufferPAudio(idx + 1, false);
            }

            await this.__playAudioBlob(audioData);

            if (!state.paused) {
                await this.__speakP(idx + 1);
            }
        } catch (error) {
            const handled = await this.__handleRuntimeSpeakFailure();
            if (!handled) {
                window.alert('Read Aloud stopped due to a connection issue.');
            }
            await this.__pause();
        }
    }

    async __bufferPAudio(idx, blocking = false) {
        const state = window.readAloudState;
        if (idx >= state.paragraphs.length) return null;

        const paragraph = state.paragraphs[idx];
        const plainText = this.__getParagraphPlainText(paragraph);
        if (!plainText) return null;

        const ssml = this.__buildSSML(plainText, state.voiceName, state.speechRate);

        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(state.speechKey, state.serviceRegion);
        speechConfig.speechSynthesisVoiceName = state.voiceName;
        speechConfig.setProperty(
            SpeechSDK.PropertyId.SpeechSynthesisOutputFormat,
            SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        );

        const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

        return new Promise((resolve, reject) => {
            synthesizer.speakSsmlAsync(
                ssml,
                result => {
                    synthesizer.close();

                    if (result.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                        reject(new Error(result.errorDetails || 'Speech synthesis failed'));
                        return;
                    }

                    if (!blocking) {
                        window.readAloudState.buffer = { idx, audioData: result.audioData };
                    }

                    resolve(result.audioData);
                },
                error => {
                    synthesizer.close();
                    reject(error);
                }
            );
        });
    }

    async __playAudioBlob(audioData) {
        return new Promise((resolve, reject) => {
            const state = window.readAloudState;

            const audioBlob = new Blob([audioData], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            state.currentAudio = audio;
            state.currentAudioUrl = audioUrl;

            let settled = false;

            const cleanup = () => {
                if (state.currentAudio === audio) state.currentAudio = null;

                if (state.currentAudioUrl === audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    state.currentAudioUrl = null;
                } else {
                    URL.revokeObjectURL(audioUrl);
                }
            };

            audio.onpause = () => {
                const wasInterrupted = !audio.ended && !state.paused;
                if (wasInterrupted) this.__pause();
            };

            audio.onended = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            audio.onerror = (e) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(e);
            };

            audio.play().catch(err => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
            });
        });
    }

    async __pause() {
        const state = window.readAloudState;
        state.paused = true;

        if (state.currentAudio) state.currentAudio.pause();

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        await this.__stopAsync();

        localStorage.setItem('readAloudAudioPosition', JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        const playPauseBtn = document.getElementById('read-aloud-toggle-playpause');
        if (!playPauseBtn) return;

        playPauseBtn.textContent = this.#buttons.play.icon;
        playPauseBtn.title = this.#buttons.play.action;
    }

    async __resume() {
        const state = window.readAloudState;
        state.paused = false;

        const idx = state.currentParagraphIndex || 0;
        await this.__speakP(idx);
    }

    async __clear() {
        const state = window.readAloudState;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        state.currentParagraphIndex = 0;
        state.currentParagraphId = state.paragraphs[0] ? state.paragraphs[0].id : null;
        state.paused = true;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        localStorage.removeItem('readAloudAudioPosition');
    }

    async __stopAsync() {
        const state = window.readAloudState;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        if (state.currentAudioUrl) {
            URL.revokeObjectURL(state.currentAudioUrl);
            state.currentAudioUrl = null;
        }

        if (state.synthesizer && typeof state.synthesizer.stopSpeakingAsync === 'function') {
            return new Promise(resolve => {
                state.synthesizer.stopSpeakingAsync(() => {
                    state.synthesizer.close();
                    state.synthesizer = null;
                    resolve();
                });
            });
        }

        if (state.synthesizer && typeof state.synthesizer.close === 'function') {
            state.synthesizer.close();
            state.synthesizer = null;
        }

        return Promise.resolve();
    }

    __highlightP(paragraph) {
        window.readAloudState.paragraphs.forEach(p => {
            p.classList.remove('read-aloud-active', 'read-aloud-fadeout');
        });

        if (!paragraph) return;

        paragraph.classList.add('read-aloud-active');
        paragraph.classList.remove('read-aloud-fadeout');
    }

    __FOHighlight(paragraph) {
        if (!paragraph) return;

        paragraph.classList.add('read-aloud-fadeout');
        setTimeout(() => {
            paragraph.classList.remove('read-aloud-active', 'read-aloud-fadeout');
        }, 600);
    }

    __scrollToP(paragraph) {
        if (!paragraph) return;

        paragraph.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    async __nextParagraph() {
        const state = window.readAloudState;
        if (!state.paragraphs.length) return;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.paused = true;

        let idx = state.currentParagraphIndex;
        if (idx < state.paragraphs.length - 1) idx++;
        else idx = 0;

        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);

        state.paused = false;
        await this.__clearBuffer(state, idx);
    }

    async __prevParagraph() {
        const state = window.readAloudState;
        if (!state.paragraphs.length) return;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.paused = true;

        let idx = state.currentParagraphIndex;
        if (idx > 0) idx--;
        else idx = state.paragraphs.length - 1;

        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);

        state.paused = false;
        await this.__clearBuffer(state, idx);
    }

    async __jumpToParagraphNumber(paragraphNumber) {
        await this.reloadReadAloud();
        const state = window.readAloudState;

        if (!state.paragraphs || state.paragraphs.length === 0) return;

        const idx = paragraphNumber - 1;
        if (idx < 0 || idx >= state.paragraphs.length) return;

        const wasPlaying = !state.paused;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        // Hard stop any active audio
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.buffer = null;

        // Commit navigation state
        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        localStorage.setItem('readAloudAudioPosition', JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);
        forceBookmark(state.currentParagraphId);

        if (!wasPlaying) {
            state.paused = true;
            const playPauseBtn = document.getElementById('read-aloud-toggle-playpause');
            if (playPauseBtn) playPauseBtn.textContent = this.#buttons.play.icon;
            return;
        }

        // Restart audio pipeline from new position
        state.paused = false;
        await this.__speakP(idx);
    }

    async __clearBuffer(state, idx) {
        const pausedState = state.paused;
        state.buffer = null;
        await this.__stopAsync();
        state.paused = pausedState;

        if (state.paused) return;

        const nextIdx = idx == null ? (state.currentParagraphIndex ?? 0) : idx;
        await this.__speakP(nextIdx);
    }

    __savePreferredVoice(voiceName) {
        localStorage.setItem('readAloudPreferredVoice', voiceName);
    }

    __saveApiKey(apiKey) {
        const stored = this.__readSpeechResource();
        const region = stored?.region || '';
        const regionLocked = !!stored?.regionLocked;
        this.__writeSpeechResource({ speechKey: apiKey, region, regionLocked });
        localStorage.setItem('readAloudConfigMenuHidden', String(apiKey !== ''));
    }

    __saveRegion(region) {
        const stored = this.__readSpeechResource();
        const speechKey = stored?.speechKey || '';
        const regionLocked = region !== '';
        this.__writeSpeechResource({ speechKey, region, regionLocked });
    }

    __saveSpeechRate(rate) {
        localStorage.setItem('readAloudSpeechRate', rate);
    }

    __getSpeechRate() {
        return parseFloat(localStorage.getItem('readAloudSpeechRate')) || 1.0;
    }

    __openCustomModal(html, modalId) {
        const overlayId = `modal-overlay-${modalId}`;

        if (document.getElementById(modalId)) return;
        if (document.getElementById(overlayId)) return;

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';

        modal.innerHTML = html;

        document.body.classList.add('no-scroll');

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        window.closeCustomModal = this.__closeCustomModal.bind(this);

        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            this.__closeCustomModal(modalId);
        });

        const handleEscape = (event) => {
            if (event.key !== 'Escape') return;
            this.__closeCustomModal(modalId);
        };

        // store so close can remove the listener
        overlay.__handleEscape = handleEscape;
        document.addEventListener('keydown', handleEscape);
    }

    __closeCustomModal(modalId) {
        const overlayId = `modal-overlay-${modalId}`;

        const modal = document.getElementById(modalId);
        const overlay =
            document.getElementById(overlayId) ||
            (modal ? modal.closest('.modal-overlay') : null);

        if (!overlay) return;

        const handleEscape = overlay.__handleEscape;
        if (handleEscape) document.removeEventListener('keydown', handleEscape);

        overlay.remove();

        const remaining = document.querySelectorAll('.modal-overlay, #modal-overlay').length;
        if (remaining) return;

        document.body.classList.remove('no-scroll');
    }

    async reloadReadAloud() {
        return new Promise((resolve) => {
            const container = document.querySelector('article#reader, main, article');
            if (!container) {
                resolve();
                return;
            }

            const paragraphs = Array.from(container.querySelectorAll('.reader-bookmark'));

            if (paragraphs.length > 0) {
                window.readAloudState.paragraphs = paragraphs;
                window.readAloudState.currentParagraphIndex = 0;
                window.readAloudState.currentParagraphId = paragraphs[0]?.id || null;
            }

            resolve();
        });
    }

}

const RAM = new ReadAloudModule();

export const showMenu = RAM.getMenuHndlr();
export const reload = RAM.getReloadHndlr();