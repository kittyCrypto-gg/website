/********** ***********
 * @module visits
 *
 * @description
 * Handles visit counter display and client-side visit count retrieval.
 *
 * @author kitty crow
 * @license MIT
 *
 * @website https://kittycrow.dev
 * @repository
 *
 * @remarks
 * This module is intended for the public-facing visit counter logic. It reads
 * visit data from the backend and updates the counter UI without sending
 * personal page data.
 ********** ***********/

import { renderCounter } from "./counter"

const API = "https://srv.kittycrow.dev"
const ORG = encodeURIComponent(window.location.origin)
const DEF_EP = `${API}/visits/stats/${ORG}`

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

interface BsStat {
    visits: number
    uniqueVisitors: number
    updatedAt: number
}

interface PgStat extends BsStat {
    page: string
}

let hostIx = 0

/**
 * Record-ish check.
 *
 * @param {unknown} val Value to check.
 * @param {boolean} arrOk Whether arrays count as records.
 * @returns {val is Record<string, unknown>} True for object records.
 */
function isRec(
    val: unknown,
    arrOk: boolean = false
): val is Record<string, unknown> {
    return val !== null && typeof val === "object" && (arrOk || !Array.isArray(val))
}

/**
 * Reads a required number.
 *
 * @param {Record<string, unknown>} src Source record.
 * @param {string} key Field key.
 * @returns {number} Numeric field value.
 */
function reqNum(src: Record<string, unknown>, key: string): number {
    const val = src[key]

    if (typeof val !== "number" || !Number.isFinite(val)) {
        throw new Error(`Visit stats field "${key}" is missing or invalid.`)
    }

    return val
}

/**
 * Reads a required string.
 *
 * @param {Record<string, unknown>} src Source record.
 * @param {string} key Field key.
 * @returns {string} String field value.
 */
function reqStr(src: Record<string, unknown>, key: string): string {
    const val = src[key]

    if (typeof val !== "string" || !val.trim()) {
        throw new Error(`Visit stats field "${key}" is missing or invalid.`)
    }

    return val
}

/**
 * Parses base stats.
 *
 * @param {unknown} raw Raw payload.
 * @returns {BsStat} Parsed base stats.
 */
function prsBs(raw: unknown): BsStat {
    if (!isRec(raw)) {
        throw new Error("Visit stats response is not a valid object.")
    }

    return {
        visits: reqNum(raw, "visits"),
        uniqueVisitors: reqNum(raw, "uniqueVisitors"),
        updatedAt: reqNum(raw, "updatedAt")
    }
}

/**
 * Parses page stats.
 *
 * @param {unknown} raw Raw payload.
 * @returns {PgStat} Parsed page stats.
 */
function prsPg(raw: unknown): PgStat {
    if (!isRec(raw)) {
        throw new Error("Page visit stats response is not a valid object.")
    }

    return {
        ...prsBs(raw),
        page: reqStr(raw, "page")
    }
}

/**
 * Resolves the page path.
 *
 * @param {VisitCounterOptions} opt Counter options.
 * @returns {string | undefined} Page path, or undefined.
 */
function getPg(opt: VisitCounterOptions): string | undefined {
    if (opt.scope !== "page") {
        return undefined
    }

    const pg = opt.page?.trim()

    if (pg) {
        return pg
    }

    const path = window.location.pathname.trim()
    const search = window.location.search.trim()
    const cur = `${path}${search}`

    return cur || "/"
}

/**
 * Builds the stats URL.
 *
 * @param {string} ep Base endpoint.
 * @param {string | undefined} pg Page path.
 * @returns {string} Request URL.
 */
function mkUrl(ep: string, pg: string | undefined): string {
    const url = new URL(ep, window.location.href)

    if (pg?.trim()) {
        url.searchParams.set("page", pg)
    }

    return url.toString()
}

/**
 * Fetches stats.
 *
 * @param {VisitCounterOptions} opt Counter options.
 * @returns {Promise<BsStat | PgStat>} Parsed stats.
 */
async function fetStats(opt: VisitCounterOptions): Promise<BsStat | PgStat> {
    const ep = opt.endpoint?.trim() || DEF_EP
    const pg = getPg(opt)
    const url = mkUrl(ep, pg)
    const rsp = await fetch(url)

    if (!rsp.ok) {
        throw new Error(`Failed to load visit stats from "${url}" (${rsp.status}).`)
    }

    const raw: unknown = await rsp.json()

    return pg ? prsPg(raw) : prsBs(raw)
}

/**
 * Resolves the host target.
 *
 * @param {HTMLElement | string | undefined} tgt Target element or selector.
 * @returns {HTMLElement} Resolved target.
 */
function getTgt(tgt?: HTMLElement | string): HTMLElement {
    if (tgt instanceof HTMLElement) {
        return tgt
    }

    const sel = tgt?.trim()

    if (!sel) {
        return document.body
    }

    const byId = document.getElementById(sel)

    if (byId instanceof HTMLElement) {
        return byId
    }

    const bySel = document.querySelector<HTMLElement>(sel)

    if (bySel instanceof HTMLElement) {
        return bySel
    }

    throw new Error(`Target element "${sel}" was not found.`)
}

/**
 * Gets the next generated host id.
 *
 * @returns {string} Unique host id.
 */
function nxtHostId(): string {
    hostIx += 1

    return `visits-counter-${hostIx}`
}

/**
 * Prepares the render host.
 *
 * @param {HTMLElement | string | undefined} tgt Target element or selector.
 * @returns {HTMLElement} Host element.
 */
function prepHost(tgt?: HTMLElement | string): HTMLElement {
    const el = getTgt(tgt)

    if (el === document.body) {
        const host = document.createElement("div")

        host.id = nxtHostId()
        document.body.appendChild(host)

        return host
    }

    if (el.id) {
        return el
    }

    el.id = nxtHostId()

    return el
}

/**
 * Reads the wanted stat value.
 *
 * @param {VisitCounterOptions["metric"]} m Metric key.
 * @param {BsStat | PgStat} stat Stats payload.
 * @returns {number} Counter value.
 */
function getVal(
    m: VisitCounterOptions["metric"],
    stat: BsStat | PgStat
): number {
    return m === "visits" ? stat.visits : stat.uniqueVisitors
}

/**
 * Reads page from page stats.
 *
 * @param {BsStat | PgStat} stat Stats payload.
 * @returns {string | undefined} Page path, if present.
 */
function getRendPg(stat: BsStat | PgStat): string | undefined {
    return "page" in stat ? stat.page : undefined
}

/**
 * Formats a Unix timestamp as YYYY.MM.DD HH:MM:SS using UTC.
 *
 * @param {number} timestampMs Unix timestamp in milliseconds.
 * @returns {string} Formatted timestamp.
 */
export function formatVisitTimestamp(timestampMs: number): string {
    const dt = new Date(timestampMs)
    const yy = String(dt.getUTCFullYear()).padStart(4, "0")
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(dt.getUTCDate()).padStart(2, "0")
    const hh = String(dt.getUTCHours()).padStart(2, "0")
    const mi = String(dt.getUTCMinutes()).padStart(2, "0")
    const ss = String(dt.getUTCSeconds()).padStart(2, "0")

    return `${yy}.${mm}.${dd} ${hh}:${mi}:${ss}`
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
    const stat = await fetStats(options)
    const val = getVal(options.metric, stat)
    const host = prepHost(options.target)

    renderCounter({
        elementId: host.id,
        target: val,
        durationMs: options.durationMs
    })

    return {
        host,
        value: val,
        page: getRendPg(stat),
        updatedAt: stat.updatedAt
    }
}