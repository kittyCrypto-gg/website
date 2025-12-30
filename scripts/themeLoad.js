(() => {
  const root = document.documentElement;

  const readCookie = () => {
    const match = document.cookie.match(/(?:^| )darkMode=(true|false)/);
    return match ? match[1] === "true" : null;
  };

  const writeCookie = (isDark) => {
    document.cookie = `darkMode=${isDark}; path=/; max-age=31536000`;
  };

  const resolveOsDark = () => {
    if (!window.matchMedia) return false; // default to light
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const apply = (isDark) => {
    root.classList.remove("dark-mode", "light-mode");
    root.classList.add(isDark ? "dark-mode" : "light-mode");
  };

  const cookieDark = readCookie();
  let currentDark = cookieDark !== null ? cookieDark : resolveOsDark();

  apply(currentDark);

  window.toggleTheme = () => {
    currentDark = !currentDark;
    apply(currentDark);
    writeCookie(currentDark); // only user toggles persist
  };
  
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    mq.addEventListener("change", (e) => {
      const osDark = (e && typeof e.matches === "boolean") ? e.matches : resolveOsDark();

      if (currentDark === osDark) return;

      currentDark = osDark;
      apply(currentDark);
    });
  }
})();
