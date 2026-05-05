import { renderCounter } from "./counter"

const VISITS_API_BASE_URL = "https://srv.kittycrow.dev"
const ENCODED_SITE_ORIGIN = encodeURIComponent(window.location.origin)
const DEFAULT_STATS_ENDPOINT = `${VISITS_API_BASE_URL}/visits/stats/${ENCODED_SITE_ORIGIN}`

export interface VisitCounterOptions {
    scope: "overall" | "page"
    metric: "visits" | "uniqueVisitors"
    target?: HTMLElement | string
    page?: string
    durationMs?: number
    endpoint?: string
}

export interface RenderedVisitCounter {
    host: HTMLElement
    value: number
    page?: string
    updatedAt: number
}

interface BaseVisitStats {
    visits: number
    uniqueVisitors: number
    updatedAt: number
}

interface PageVisitStats extends BaseVisitStats {
    page: string
}

let generatedCounterHostIndex = 0

/**
 * Small object check helper.
 *
 * @param {unknown} value Value to check.
 * @param {boolean} acceptArrays Whether arrays should count as records.
 * @returns {value is Record<string, unknown>} True when the value is a record.
 */
function isRecord(
    value: unknown,
    acceptArrays: boolean = false
): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && (acceptArrays || !Array.isArray(value))
}

/**
 * Reads a required numeric field from a record.
 *
 * @param {Record<string, unknown>} source Source record.
 * @param {string} fieldName Field name to read.
 * @returns {number} Parsed numeric value.
 */
function readRequiredNumber(source: Record<string, unknown>, fieldName: string): number {
    const fieldValue = source[fieldName]

    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
        throw new Error(`Visit stats field "${fieldName}" is missing or invalid.`)
    }

    return fieldValue
}

/**
 * Reads a required non-empty string field from a record.
 *
 * @param {Record<string, unknown>} source Source record.
 * @param {string} fieldName Field name to read.
 * @returns {string} Parsed string value.
 */
function readRequiredString(source: Record<string, unknown>, fieldName: string): string {
    const fieldValue = source[fieldName]

    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
        throw new Error(`Visit stats field "${fieldName}" is missing or invalid.`)
    }

    return fieldValue
}

/**
 * Parses the common visit stats payload.
 *
 * @param {unknown} payload Raw response payload.
 * @returns {BaseVisitStats} Parsed stats object.
 */
function parseBaseVisitStats(payload: unknown): BaseVisitStats {
    if (!isRecord(payload)) {
        throw new Error("Visit stats response is not a valid object.")
    }

    return {
        visits: readRequiredNumber(payload, "visits"),
        uniqueVisitors: readRequiredNumber(payload, "uniqueVisitors"),
        updatedAt: readRequiredNumber(payload, "updatedAt")
    }
}

/**
 * Parses the page visit stats payload.
 *
 * @param {unknown} payload Raw response payload.
 * @returns {PageVisitStats} Parsed page stats object.
 */
function parsePageVisitStats(payload: unknown): PageVisitStats {
    if (!isRecord(payload)) {
        throw new Error("Page visit stats response is not a valid object.")
    }

    return {
        ...parseBaseVisitStats(payload),
        page: readRequiredString(payload, "page")
    }
}

/**
 * Resolves the page path for page-scoped requests.
 *
 * @param {VisitCounterOptions} options Counter request options.
 * @returns {string | undefined} Requested page path, or undefined for overall scope.
 */
function resolveRequestedPage(options: VisitCounterOptions): string | undefined {
    if (options.scope !== "page") {
        return undefined
    }

    const explicitPage = options.page?.trim()

    if (explicitPage) {
        return explicitPage
    }

    const currentPath = window.location.pathname.trim()
    const currentSearch = window.location.search.trim()
    const currentPage = `${currentPath}${currentSearch}`

    if (currentPage) {
        return currentPage
    }

    return "/"
}

/**
 * Builds the stats request URL.
 *
 * @param {string} endpoint Base stats endpoint.
 * @param {string | undefined} page Page path for page-scoped requests.
 * @returns {string} Fully qualified request URL.
 */
function buildStatsUrl(endpoint: string, page: string | undefined): string {
    const requestUrl = new URL(endpoint, window.location.href)

    if (page?.trim()) {
        requestUrl.searchParams.set("page", page)
    }

    return requestUrl.toString()
}

/**
 * Fetches visit stats from the backend.
 *
 * @param {VisitCounterOptions} options Counter request options.
 * @returns {Promise<BaseVisitStats | PageVisitStats>} Parsed stats payload.
 */
async function fetchVisitStats(options: VisitCounterOptions): Promise<BaseVisitStats | PageVisitStats> {
    const endpoint = options.endpoint?.trim() || DEFAULT_STATS_ENDPOINT
    const requestedPage = resolveRequestedPage(options)
    const requestUrl = buildStatsUrl(endpoint, requestedPage)
    const response = await fetch(requestUrl)

    if (!response.ok) {
        throw new Error(`Failed to load visit stats from "${requestUrl}" (${response.status}).`)
    }

    const payload: unknown = await response.json()

    if (requestedPage) {
        return parsePageVisitStats(payload)
    }

    return parseBaseVisitStats(payload)
}

/**
 * Resolves a target host element from an element reference or selector.
 *
 * @param {HTMLElement | string | undefined} target Target element or selector.
 * @returns {HTMLElement} Resolved host element.
 */
function resolveTargetElement(target?: HTMLElement | string): HTMLElement {
    if (target instanceof HTMLElement) {
        return target
    }

    const targetSelector = target?.trim()

    if (!targetSelector) {
        return document.body
    }

    const elementById = document.getElementById(targetSelector)

    if (elementById instanceof HTMLElement) {
        return elementById
    }

    const elementBySelector = document.querySelector<HTMLElement>(targetSelector)

    if (elementBySelector instanceof HTMLElement) {
        return elementBySelector
    }

    throw new Error(`Target element "${targetSelector}" was not found.`)
}

/**
 * Generates a unique id for a counter host created by this module.
 *
 * @returns {string} Unique host id.
 */
function getNextCounterHostId(): string {
    generatedCounterHostIndex += 1

    return `visits-counter-${generatedCounterHostIndex}`
}

/**
 * Prepares the element that will host the rendered counter.
 *
 * @param {HTMLElement | string | undefined} target Target element or selector.
 * @returns {HTMLElement} Host element with an id.
 */
function prepareCounterHost(target?: HTMLElement | string): HTMLElement {
    const resolvedTarget = resolveTargetElement(target)

    if (resolvedTarget === document.body) {
        const generatedHost = document.createElement("div")

        generatedHost.id = getNextCounterHostId()
        document.body.appendChild(generatedHost)

        return generatedHost
    }

    if (resolvedTarget.id) {
        return resolvedTarget
    }

    resolvedTarget.id = getNextCounterHostId()

    return resolvedTarget
}

/**
 * Reads the requested metric from a stats payload.
 *
 * @param {VisitCounterOptions["metric"]} metric Metric to read.
 * @param {BaseVisitStats | PageVisitStats} stats Stats payload.
 * @returns {number} Requested counter value.
 */
function readCounterValue(
    metric: VisitCounterOptions["metric"],
    stats: BaseVisitStats | PageVisitStats
): number {
    return metric === "visits" ? stats.visits : stats.uniqueVisitors
}

/**
 * Extracts the page field when available.
 *
 * @param {BaseVisitStats | PageVisitStats} stats Stats payload.
 * @returns {string | undefined} Page path when present.
 */
function readRenderedPage(stats: BaseVisitStats | PageVisitStats): string | undefined {
    if (!("page" in stats)) {
        return undefined
    }

    return stats.page
}

/**
 * Formats a Unix timestamp as YYYY.MM.DD HH:MM:SS using UTC.
 *
 * @param {number} timestampMs Unix timestamp in milliseconds.
 * @returns {string} Formatted timestamp.
 */
export function formatVisitTimestamp(timestampMs: number): string {
    const date = new Date(timestampMs)
    const year = String(date.getUTCFullYear()).padStart(4, "0")
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    const hours = String(date.getUTCHours()).padStart(2, "0")
    const minutes = String(date.getUTCMinutes()).padStart(2, "0")
    const seconds = String(date.getUTCSeconds()).padStart(2, "0")

    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
}

/**
 * Fetches visit stats and renders a counter into the requested target.
 *
 * @param {VisitCounterOptions} options Counter request options.
 * @returns {Promise<RenderedVisitCounter>} Details about the rendered counter.
 */
export async function renderVisits(
    options: VisitCounterOptions
): Promise<RenderedVisitCounter> {
    const stats = await fetchVisitStats(options)
    const counterValue = readCounterValue(options.metric, stats)
    const counterHost = prepareCounterHost(options.target)

    renderCounter({
        elementId: counterHost.id,
        target: counterValue,
        durationMs: options.durationMs
    })

    return {
        host: counterHost,
        value: counterValue,
        page: readRenderedPage(stats),
        updatedAt: stats.updatedAt
    }
}