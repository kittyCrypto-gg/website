/********** ***********
 * @module visitLogger
 *
 * @description
 * Logs lightweight website visit events through a backend endpoint.
 *
 * @author kitty crow
 * @license MIT
 *
 * @website https://kittycrow.dev
 * @repository
 *
 * @remarks
 * This module sends a minimal request only. It does not include personal
 * payload data from the page. The backend may still receive standard request
 * metadata such as the origin, IP address, user agent, and similar transport
 * or browser-provided headers.
 ********** ***********/

const VISITS_API_BASE_URL = "https://srv.kittycrow.dev"

/**
 * Returns the origin of the website running this script.
 *
 * @returns {string} The current website origin.
 */
function getSiteOrigin(): string {
    return window.location.origin
}

/**
 * Builds the public visit logging endpoint for the current website.
 *
 * @returns {string} The visit logging endpoint.
 */
function getLogVep(): string {
    const encodedSiteOrigin = encodeURIComponent(getSiteOrigin())

    return `${VISITS_API_BASE_URL}/visits/log/${encodedSiteOrigin}`
}

/**
 * Returns the current page path including query parameters.
 *
 * @returns {string} The current pathname and search string.
 */
function getCurrentPage(): string {
    return `${window.location.pathname}${window.location.search}`
}

/**
 * Builds the session storage key for a specific page.
 *
 * @param {string} page The page identifier to store.
 * @returns {string} The session storage key.
 */
function getVStrgKey(page: string): string {
    return `visitLogged:${getSiteOrigin()}:${page}`
}

/**
 * Checks whether the current page visit has already been logged in this tab session.
 *
 * @param {string} page The page identifier to check.
 * @returns {boolean} True when the page visit was already logged in this session.
 */
function visitLogged(page: string): boolean {
    return sessionStorage.getItem(getVStrgKey(page)) === "true"
}

/**
 * Marks the current page visit as logged for this tab session.
 *
 * @param {string} page The page identifier to mark.
 * @returns {void}
 */
function markVLogged(page: string): void {
    sessionStorage.setItem(getVStrgKey(page), "true")
}

/**
 * Logs the current page visit unless it was already logged in this tab session.
 *
 * @returns {Promise<void>}
 */
async function logPageV(): Promise<void> {
    const page = getCurrentPage()

    if (visitLogged(page)) {
        return
    }

    const response = await fetch(getLogVep(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            page
        })
    })

    if (!response.ok) {
        throw new Error(`Failed to log visit for page ${page}`)
    }

    markVLogged(page)
}

/**
 * Starts visit logging in browser environments.
 *
 * @returns {void}
 */
function strtVLogger(): void {
    if (typeof window === "undefined") {
        return
    }

    void logPageV().catch((error: unknown) => {
        console.error("Visit logging failed:", error)
    })
}

strtVLogger()