/**
 * Reads a cookie by name.
 * @param {string} name
 * @returns {string | null}
 */
function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Sets a cookie for the chat ui bits.
 * @param {string} name
 * @param {string} value
 * @param {number} days
 * @returns {void}
 */
export function setCookie(name: string, value: string, days: number = 365): void {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Restores saved nickname into the input.
 * @returns {void}
 */
export function loadNick(nickEl: HTMLInputElement): void {
    const savedNick = getCookie("nickname");
    if (!savedNick) return;
    nickEl.value = savedNick;
}
