/**
 * @param {unknown} _ - Unused helper to satisfy TS noUnusedParameters without changing runtime behaviour.
 * @returns {void}
 */
const ignore = (_: unknown): void => { };

/**
 * @returns {void} A banner DOM fragment appended into #banner.
 */
export async function loadBanner(): Promise<void> {
    const container = document.getElementById('banner') as HTMLElement;

    const promptRow = document.createElement('div');
    promptRow.classList.add('row');

    const prompt = document.createElement('span');
    prompt.classList.add('command-line');
    prompt.innerHTML = '<span class="green">kitty@kittycrypto</span><span class="blue">:~</span><span class="teal">$ neofetch</span>';

    promptRow.appendChild(prompt);
    container.appendChild(promptRow);

    const isDark = document.documentElement.classList.contains('dark-mode');
    const asciiPath = isDark ? 'images/miku-dark.txt' : 'images/miku-light.txt';
    const response = await fetch(asciiPath);

    const asciiText = await response.text();
    const asciiLines = asciiText.trim().split('\n');

    const contentRow = document.createElement('div');
    contentRow.classList.add('row', 'content');

    const asciiBlock = document.createElement('div');
    asciiBlock.classList.add('ascii-block');

    asciiLines.forEach((line) => {
        const span = document.createElement('span');
        span.classList.add('ascii-line');
        span.textContent = line;
        asciiBlock.appendChild(span);
        asciiBlock.appendChild(document.createElement('br'));
    });

    const infoBlock = document.createElement('div');
    infoBlock.classList.add('info-block');

    const infoLines = [
        'HatsuneMikuOS V 2.01',
        '----------------------',
        'User: Kitty (she/her)',
        'Host: CRT-iMac (teal)',
        'DE: Nekomimi-kawaii',
        'WM: Miku.Moe',
        'Terminal: YuriGreen Terminal Emulator',
        'Uptime: since 1991',
        'Sbin: bin/viewneko.coffee',
        'Bash: /bin/purr',
        'Battery: 69% (charging by longing)',
        'GPU: NVIDIA RTX 5090 MikuCore 36.3 GiB',
        'Memory: 119.21 GiB DDR5',
        '~* this system purrs for catgirls *~'
    ] as const;

    infoLines.forEach((line, i) => {
        const span = document.createElement('span');
        span.classList.add('info-line');
        if (i === 0) span.classList.add('info-header');
        if (i === infoLines.length - 1) span.classList.add('info-footer');
        span.textContent = line;
        infoBlock.appendChild(span);
        infoBlock.appendChild(document.createElement('br'));
    });

    contentRow.appendChild(asciiBlock);
    contentRow.appendChild(infoBlock);
    container.appendChild(contentRow);

    const cursorRow = document.createElement('div');
    cursorRow.classList.add('row');

    const cursor = document.createElement('span');
    cursor.classList.add('command-line');
    cursor.innerHTML = '<span class="green">kitty@kittycrypto</span><span class="blue">:~</span><span class="teal">$ </span><span class="cursor">█</span>';

    cursorRow.appendChild(cursor);
    container.appendChild(cursorRow);

    await waitForElementHeight(container);
    observeThemeChange();
}

/**
 * @returns True if the UA string matches common mobile devices.
 */
function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * @returns Resolves once the banner has been measured and, if needed, scaled.
 */
export async function scaleBannerToFit(): Promise<void> {
    const wrapper = document.getElementById('banner-wrapper') as HTMLElement;
    const banner = document.getElementById('banner') as HTMLElement;

    wrapBannerForScaling();

    const scaler = banner.parentElement as HTMLElement;
    banner.style.transform = '';
    banner.style.transformOrigin = 'top left';
    scaler.style.height = 'auto';

    const waitUntilReady = async (): Promise<void> => {
        // wait for the banner to be fully rendered
        await (document.readyState === 'complete'
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                window.addEventListener('load', () => resolve());
            }));

        if (needsSafariRepaint()) {
            banner.offsetHeight;
            banner.style.display = 'none';
            banner.offsetHeight;
            banner.style.display = '';
        }

        const rect = banner.getBoundingClientRect();
        const actualHeight = banner.offsetHeight;
        const actualWidth = banner.offsetWidth;
        const fontSize = getComputedStyle(banner).fontSize;
        const lineHeight = getComputedStyle(banner).lineHeight;

        // keep these reads (they can affect layout timing in some browsers)
        ignore(wrapper);
        ignore(rect);
        ignore(actualWidth);
        ignore(fontSize);
        ignore(lineHeight);

        let scaleFactor = 1;

        if (isMobileDevice()) {
            scaleFactor = 0.625;
            banner.style.transform = `scale(${scaleFactor})`;
            banner.style.height = 'auto';
            scaler.style.height = `${Math.floor(actualHeight * scaleFactor)}px`;
            scaler.style.overflow = 'hidden';
        } else {
            banner.style.height = 'auto';
            scaler.style.height = 'auto';
            scaler.style.overflow = 'visible';
        }
    };

    await waitUntilReady();
}

/**
 * Wraps #banner in a .banner-scaler div if not already wrapped.
 */
function wrapBannerForScaling(): void {
    const banner = document.getElementById('banner') as HTMLElement;
    const parent = banner.parentElement as HTMLElement;

    if ((banner.parentElement as HTMLElement).classList.contains('banner-scaler')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'banner-scaler';
    parent.replaceChild(wrapper, banner);
    wrapper.appendChild(banner);
}

/**
 * @returns Resolves after terminal window chrome is created and wired up.
 */
export async function setupTerminalWindow(): Promise<void> {
    const terminalWrapper = document.getElementById('terminal-wrapper') as HTMLElement;

    const windowWrapper = document.createElement('div');
    windowWrapper.id = 'terminal-window';
    windowWrapper.style.position = 'relative';

    const header = document.createElement('div');
    header.id = 'terminal-header';

    const controls = document.createElement('div');
    controls.classList.add('window-controls');

    const closeBtn = document.createElement('span');
    closeBtn.classList.add('btn', 'close');
    closeBtn.textContent = '🔴';

    const toggleViewBtn = document.createElement('span');
    toggleViewBtn.classList.add('btn', 'toggle-view');
    toggleViewBtn.textContent = '🟡';

    const floatBtn = document.createElement('span');
    floatBtn.classList.add('btn', 'float');
    floatBtn.textContent = '🟢';

    closeBtn.addEventListener('click', () => {
        windowWrapper.style.display = 'none';
        terminalWrapper.style.display = 'block';
        localStorage.setItem('terminal-closed', 'true');
        localStorage.removeItem('terminal-minimised');
        icon.style.display = 'inline-block';
    });

    toggleViewBtn.addEventListener('click', () => {
        const isMinimised = terminalWrapper.style.display === 'none';
        if (isMinimised) {
            terminalWrapper.style.display = 'block';
            floatBtn.classList.remove('hidden'); // show float button again
            localStorage.removeItem('terminal-minimised');
        } else {
            windowWrapper.classList.remove('floating');
            Object.assign(windowWrapper.style, {
                position: 'relative',
                zIndex: '',
                width: '100%',
                height: '',
                resize: '',
                overflow: '',
                left: '',
                top: '',
            });
            localStorage.removeItem('terminal-floating');
            terminalWrapper.style.display = 'none';
            floatBtn.classList.add('hidden'); // hide float button when minimised
            localStorage.setItem('terminal-minimised', 'true');
        }
    });

    floatBtn.addEventListener('click', () => {
        const isFloating = windowWrapper.classList.toggle('floating');
        if (isFloating) {
            Object.assign(windowWrapper.style, {
                position: 'absolute',
                zIndex: '9999',
                width: localStorage.getItem('terminal-width') || '50%',
                height: localStorage.getItem('terminal-height') || '',
                resize: 'both',
                overflow: 'auto',
                left: localStorage.getItem('term-icon-x') || '10px',
                top: localStorage.getItem('term-icon-y') || '10px'
            });
            makeTermDragWPrnt(windowWrapper, document.getElementById('banner-wrapper'));
            localStorage.setItem('terminal-floating', 'true');
        } else {
            Object.assign(windowWrapper.style, {
                position: 'relative',
                zIndex: '',
                width: '100%',
                height: '',
                resize: '',
                overflow: '',
                left: '',
                top: ''
            });
            localStorage.removeItem('terminal-floating');
        }
    });

    // Restore floating state
    if (localStorage.getItem('terminal-floating') === 'true') {
        windowWrapper.classList.add('floating');
        Object.assign(windowWrapper.style, {
            position: 'absolute',
            zIndex: '9999',
            width: localStorage.getItem('terminal-width') || '50%',
            height: localStorage.getItem('terminal-height') || '',
            resize: 'both',
            overflow: 'auto',
            left: localStorage.getItem('term-icon-x') || '10px',
            top: localStorage.getItem('term-icon-y') || '10px'
        });
        makeTermDragWPrnt(windowWrapper, document.getElementById('banner-wrapper'));
    } else {
        Object.assign(windowWrapper.style, {
            position: 'relative',
            width: '100%',
            resize: '',
            left: '',
            top: ''
        });
    }

    const title = document.createElement('span');
    title.classList.add('window-title');
    title.textContent = 'YuriGreen Terminal Emulator — /home/kitty/';

    controls.appendChild(closeBtn);
    controls.appendChild(toggleViewBtn);
    controls.appendChild(floatBtn);
    header.appendChild(controls);
    header.appendChild(title);

    const scrollArea = document.createElement('div');
    scrollArea.id = 'terminal-scroll';
    scrollArea.appendChild(terminalWrapper);

    windowWrapper.appendChild(header);
    windowWrapper.appendChild(scrollArea);

    const parent = document.getElementById('banner-wrapper') as HTMLElement;
    parent.insertBefore(windowWrapper, parent.firstChild);

    const icon = document.getElementById('term-icon') as HTMLImageElement;
    icon.src = '/images/terminal.svg';
    icon.alt = 'Terminal icon';
    icon.title = 'Double-click to open terminal';

    icon.addEventListener('dblclick', () => {
        windowWrapper.style.display = 'block';
        terminalWrapper.style.display = 'block';
        icon.style.display = 'none';

        if (localStorage.getItem('terminal-floating') === 'true') {
            windowWrapper.classList.add('floating');
            Object.assign(windowWrapper.style, {
                position: 'absolute',
                zIndex: '9999',
                width: localStorage.getItem('terminal-width') || '50%',
                height: localStorage.getItem('terminal-height') || '',
                resize: 'both',
                overflow: 'auto',
                left: localStorage.getItem('terminal-x') || '10px',
                top: localStorage.getItem('terminal-y') || '10px'
            });
            setTimeout(() => {
                makeTermDragWPrnt(windowWrapper, document.getElementById('banner-wrapper'));
            });
        }

        localStorage.removeItem('terminal-closed');
        localStorage.removeItem('terminal-minimised');
    });

    makeIconDraggable();

    if (localStorage.getItem('terminal-closed') === 'true') {
        windowWrapper.style.display = 'none';
        icon.style.display = 'inline-block';
    }

    if (localStorage.getItem('terminal-minimised') === 'true') {
        terminalWrapper.style.display = 'none';
        floatBtn.classList.add('hidden'); // make sure it’s hidden on load if minimised
    } else {
        floatBtn.classList.remove('hidden');
    }
}

/**
 * Makes #term-icon draggable and persists its position to localStorage.
 */
function makeIconDraggable(): void {
    const icon = document.getElementById('term-icon') as HTMLImageElement;
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    icon.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        offsetX = e.clientX - icon.offsetLeft;
        offsetY = e.clientY - icon.offsetTop;
        icon.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
        localStorage.setItem('term-icon-x', icon.style.left);
        localStorage.setItem('term-icon-y', icon.style.top);
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            icon.style.cursor = 'grab';
        }
    });

    // Restore saved position if available
    const savedX = localStorage.getItem('term-icon-x');
    const savedY = localStorage.getItem('term-icon-y');
    if (savedX && savedY) {
        icon.style.left = savedX;
        icon.style.top = savedY;
    }
}

/**
 * @param {HTMLElement} el - The terminal window wrapper element.
 * @param {Element | null} parent - The bounding parent (passed through unchanged, currently unused).
 * @returns {void}
 */
function makeTermDragWPrnt(el: HTMLElement, parent: Element | null): void {
    ignore(parent);

    const header = el.querySelector<HTMLElement>('#terminal-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    header.addEventListener('mousedown', (e: MouseEvent) => {
        if (!el.classList.contains('floating')) return;
        isDragging = true;
        startX = e.clientX - el.offsetLeft;
        startY = e.clientY - el.offsetTop;
        el.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;

        const x = e.clientX - startX;
        const y = e.clientY - startY;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.transform = 'none';

        localStorage.setItem('terminal-x', el.style.left);
        localStorage.setItem('terminal-y', el.style.top);
        localStorage.setItem('term-icon-x', el.style.left);
        localStorage.setItem('term-icon-y', el.style.top);
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            el.style.cursor = 'default';
            localStorage.setItem('terminal-width', `${el.offsetWidth}px`);
            localStorage.setItem('terminal-height', `${el.offsetHeight}px`);
        }
    });
}

/**
 * Observes class changes on <html> to trigger ASCII art refresh.
 */
function observeThemeChange(): void {
    const target = document.documentElement;
    const observer = new MutationObserver((mutations: MutationRecord[]) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
                void updateAsciiArt();
                break;
            }
        }
    });
    observer.observe(target, { attributes: true });
}

/**
 * @returns {Promise<void>} Resolves after the ASCII block has been refreshed (if present).
 */
async function updateAsciiArt(): Promise<void> {
    const isDark = document.documentElement.classList.contains('dark-mode');
    const asciiPath = isDark ? 'images/miku-dark.txt' : 'images/miku-light.txt';

    const response = await fetch(asciiPath);
    const asciiText = await response.text();
    const asciiLines = asciiText.trim().split('\n');

    const asciiBlock = document.querySelector<HTMLElement>('.ascii-block');
    if (!asciiBlock) return;

    asciiBlock.innerHTML = ''; // clear previous lines
    asciiLines.forEach((line) => {
        const span = document.createElement('span');
        span.classList.add('ascii-line');
        span.textContent = line;
        asciiBlock.appendChild(span);
        asciiBlock.appendChild(document.createElement('br'));
    });
}

/**
 * @param {HTMLElement} el - Element to wait on.
 * @param {number} minHeight - Minimum height in pixels before resolving.
 * @returns {Promise<void>} Resolves once el.offsetHeight >= minHeight, checking on each animation frame.
 */
async function waitForElementHeight(el: HTMLElement, minHeight: number = 100): Promise<void> {
    return new Promise<void>((resolve) => {
        const check = (): void => {
            if (el.offsetHeight >= minHeight) return resolve();
            requestAnimationFrame(check);
        };
        check();
    });
}

/**
 * @returns {boolean} True if the UA suggests Mobile Safari (not Chrome on iOS).
 */
function needsSafariRepaint(): boolean {
    const ua = navigator.userAgent;
    return /iP(hone|od|ad)/i.test(ua) && /Safari/i.test(ua) && !/Chrome/i.test(ua);
}