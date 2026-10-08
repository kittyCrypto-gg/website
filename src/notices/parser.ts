import * as h from "../helpers.ts";
import * as uiFetch from "../uiFetch.ts";
import type { Ntc } from "./types.ts";

function bytesToHex(bytes: readonly number[]): string {
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeId(
    title: string,
    text: string,
    start: string,
    end: string
): Promise<string> {
    const bytes = await h.hashString([title, end, start, text].join("\n"));
    return bytesToHex(bytes);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function parseDate(raw: unknown): Date | null {
    if (typeof raw !== "string") return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isNoticeBody(raw: unknown): raw is uiFetch.NtcJsonBody {
    if (!isRecord(raw)) return false;

    return typeof raw.notice === "string" &&
        typeof raw.start === "string" &&
        typeof raw.end === "string";
}

function isNoticeMap(raw: unknown): raw is uiFetch.NtcJsonMap {
    if (!isRecord(raw)) return false;
    return Object.values(raw).every((item) => isNoticeBody(item));
}

function getSource(
    raw: uiFetch.NtcJson |
        readonly uiFetch.NtcJsonItm[] |
        uiFetch.NtcJsonMap |
        undefined
): readonly uiFetch.NtcJsonItm[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;

    if (isNoticeMap(raw)) {
        return Object.entries(raw).map(([title, item]) => ({
            title,
            notice: item.notice,
            start: item.start,
            end: item.end
        }));
    }

    if ("notices" in raw) return getSource(raw.notices);
    return [];
}

async function makeNotice(
    item: uiFetch.NtcJsonItm
): Promise<Ntc | null> {
    const ttl = typeof item.title === "string" ? item.title.trim() : "";
    const txt = typeof item.notice === "string" ? item.notice.trim() : "";
    const st = typeof item.start === "string" ? item.start.trim() : "";
    const en = typeof item.end === "string" ? item.end.trim() : "";

    if (!ttl || !txt || !st || !en) return null;

    const stDt = parseDate(st);
    const enDt = parseDate(en);
    if (!stDt || !enDt) return null;
    if (enDt.getTime() <= stDt.getTime()) return null;

    return {
        id: await makeId(ttl, txt, st, en),
        ttl,
        txt,
        st,
        en,
        stDt,
        enDt
    };
}

export async function prsNtcs(
    raw: uiFetch.NtcJson
): Promise<readonly Ntc[]> {
    const parsed = await Promise.all(
        getSource(raw).map((item) => makeNotice(item))
    );

    return parsed.filter((item): item is Ntc => item !== null);
}

export function fltActNtcs(
    ntcs: readonly Ntc[],
    now: Date = new Date()
): readonly Ntc[] {
    const nowMs = now.getTime();

    return ntcs.filter((notice) => {
        return nowMs >= notice.stDt.getTime() &&
            nowMs <= notice.enDt.getTime();
    });
}

export async function getActNtcs(): Promise<readonly Ntc[]> {
    const raw = await uiFetch.fetchNtcsData();
    return fltActNtcs(await prsNtcs(raw), new Date());
}
