/**
 * Builds a canonical reader path with `story` first and `chapter` second.
 *
 * @param {URL} currentUrl The current browser URL.
 * @returns {string} The canonical path, query string, and hash.
 */
function buildCanonicalReaderPath(currentUrl: URL): string {
    const canonicalParams = new URLSearchParams()
    const story = currentUrl.searchParams.get("story")
    const chapter = currentUrl.searchParams.get("chapter")

    if (story !== null) {
        canonicalParams.append("story", story)
    }

    if (chapter !== null) {
        canonicalParams.append("chapter", chapter)
    }

    const query = canonicalParams.toString()
    const hash = currentUrl.hash

    if (!query) {
        return `${currentUrl.pathname}${hash}`
    }

    return `${currentUrl.pathname}?${query}${hash}`
}

/**
 * Normalises reader page query parameters
 *
 * @returns {void}
 */
function normaliseReaderParams(): void {
    if (typeof window === "undefined") {
        return
    }

    const currentUrl = new URL(window.location.href)

    if (currentUrl.pathname !== "/reader") {
        return
    }

    const canonicalPath = buildCanonicalReaderPath(currentUrl)
    const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`

    if (canonicalPath === currentPath) {
        return
    }

    window.history.replaceState(null, "", canonicalPath)
}

normaliseReaderParams()