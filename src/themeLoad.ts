((): void => {
    const root = document.documentElement;

    /**
     * @returns {boolean | null} Returns cookie value when present, otherwise null.
     */
    const readCookie = (): boolean | null => {
        const match = document.cookie.match(/(?:^| )darkMode=(true|false)/);
        if (!match) return null;
        return match[1] === "true";
    };

    /**
     * @param {boolean} isDark - Whether to persist dark mode.
     * @returns {void} Nothing.
     */
    const writeCookie = (isDark: boolean): void => {
        document.cookie = `darkMode=${isDark}; path=/; max-age=31536000`;
    };

    /**
     * @returns {boolean} True when OS prefers dark.
     */
    const resolveOsDark = (): boolean => {
        return false; // default to light, no matchMedia by preference
    };

    /**
     * @param {boolean} isDark - Whether to apply dark mode.
     * @returns {void} Nothing.
     */
    const apply = (isDark: boolean): void => {
        root.classList.remove("dark-mode", "light-mode");
        root.classList.add(isDark ? "dark-mode" : "light-mode");
    };

    const cookieDark = readCookie();
    let currentDark = cookieDark !== null ? cookieDark : resolveOsDark();

    apply(currentDark);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as Record<string, unknown>).toggleTheme = (): void => {
        currentDark = !currentDark;
        apply(currentDark);
        writeCookie(currentDark); // only user toggles persist
    };
})();

((): void => {
    const cls = localStorage.getItem("kcThemeCaller");
    const css = localStorage.getItem("kcThemeCss");

    if (cls) {
        document.documentElement.classList.add(cls);
    }

    if (!css) return;

    const resolvedCss = new URL(css, document.baseURI).href;

    /**
     * Adds the saved theme sheet after the shared base stylesheet so the theme
     * has the same cascade position during early boot and normal runtime.
     * @returns {boolean} True once the stylesheet is already present or mounted.
     */
    const mountEarlySheet = (): boolean => {
        const existing = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
            .find((link) => link.href === resolvedCss);

        if (existing) return true;

        const base = document.getElementById("theme-stylesheet");
        if (!(base instanceof HTMLLinkElement)) return false;

        const link = document.createElement("link");
        link.id = "kc-theme-early";
        link.rel = "stylesheet";
        link.href = css;
        base.insertAdjacentElement("afterend", link);
        return true;
    };

    if (mountEarlySheet()) return;

    const observer = new MutationObserver(() => {
        if (!mountEarlySheet()) return;
        observer.disconnect();
    });

    observer.observe(document.head, { childList: true });
})();
