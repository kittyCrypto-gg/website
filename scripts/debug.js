function setupDebugPanel() {
    if (window.__DEBUG_PANEL__) return window.__DEBUG_PANEL__;

    const debugDiv = document.createElement('div');
    debugDiv.className = 'debug';
    debugDiv.style.fontFamily = 'monospace, monospace';

    function injectDiv() {
        document.body.appendChild(debugDiv);
        debugDiv.classList.remove('visible');
        if (new URLSearchParams(window.location.search).get("debug") === "true") {
            debugDiv.classList.add('visible');
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener('DOMContentLoaded', injectDiv);
    } else {
        injectDiv();
    }

    const EMOJI = {
        log: "📝",
        error: "❌",
        warn: "⚠️",
        info: "ℹ️"
    };
    function format(msg, type = "log") {
        const time = new Date().toLocaleTimeString();
        return `${EMOJI[type] || EMOJI.log} [${time}] ${msg}`;
    }

    const orig = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        clear: console.clear
    };

    // Proxy console methods
    ["log", "error", "warn", "info"].forEach(type => {
        console[type] = function (...args) {
            orig[type].apply(console, args);
            const msg = args.map(a =>
                typeof a === "object" && a !== null
                    ? (a instanceof Error ? (a.stack || a.toString()) : JSON.stringify(a, null, 2))
                    : String(a)
            ).join(" ");
            if (new URLSearchParams(window.location.search).get("debug") === "true") {
                debugDiv.classList.add('visible');
                debugDiv.textContent += (debugDiv.textContent ? "\n" : "") + format(msg, type);
                debugDiv.scrollTop = debugDiv.scrollHeight;
            }
        };
    });

    // Proxy clear
    console.clear = function () {
        orig.clear.apply(console, arguments);
        debugDiv.textContent = "";
    };

    // Catch global errors and rejections!
    window.addEventListener('error', function (event) {
        console.error('Uncaught Error:', event.error ? (event.error.stack || event.error) : event.message);
    });
    window.addEventListener('unhandledrejection', function (event) {
        console.error('Unhandled Promise Rejection:', event.reason);
    });

    window.__DEBUG_PANEL__ = {
        show(msg = "") {
            debugDiv.classList.add('visible');
            debugDiv.textContent = typeof msg === "object" ? JSON.stringify(msg, null, 2) : msg;
        },
        hide() {
            debugDiv.classList.remove('visible');
            debugDiv.textContent = "";
        },
        clear() {
            debugDiv.textContent = "";
        },
        el: debugDiv
    };

    return window.__DEBUG_PANEL__;
}

function propagateDebugParamInLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("debug") !== "true") return;
    document.querySelectorAll('a[href]').forEach(link => {
        let href = link.getAttribute('href');
        if (
            !href ||
            href.startsWith('http') ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            href.includes('debug=true')
        ) return;
        let [base, suffix] = href.split(/([?#].*)/);
        let joiner = suffix && suffix.startsWith('?') ? '&' : '?';
        link.setAttribute('href', base + joiner + 'debug=true' + (suffix || ''));
    });
}

setupDebugPanel();
propagateDebugParamInLinks();