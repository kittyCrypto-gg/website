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
function getLogVisitEndpoint(): string {
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
function getVisitStorageKey(page: string): string {
    return `visitLogged:${getSiteOrigin()}:${page}`
}

/**
 * Checks whether the current page visit has already been logged in this tab session.
 *
 * @param {string} page The page identifier to check.
 * @returns {boolean} True when the page visit was already logged in this session.
 */
function hasVisitBeenLoggedThisSession(page: string): boolean {
    return sessionStorage.getItem(getVisitStorageKey(page)) === "true"
}

/**
 * Marks the current page visit as logged for this tab session.
 *
 * @param {string} page The page identifier to mark.
 * @returns {void}
 */
function markVisitAsLoggedThisSession(page: string): void {
    sessionStorage.setItem(getVisitStorageKey(page), "true")
}

/**
 * Logs the current page visit unless it was already logged in this tab session.
 *
 * @returns {Promise<void>}
 */
async function logCurrentPageVisit(): Promise<void> {
    const page = getCurrentPage()

    if (hasVisitBeenLoggedThisSession(page)) {
        return
    }

    const response = await fetch(getLogVisitEndpoint(), {
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

    markVisitAsLoggedThisSession(page)
}

/**
 * Starts visit logging in browser environments.
 *
 * @returns {void}
 */
function startVisitLogger(): void {
    if (typeof window === "undefined") {
        return
    }

    void logCurrentPageVisit().catch((error: unknown) => {
        console.error("Visit logging failed:", error)
    })
}

startVisitLogger()