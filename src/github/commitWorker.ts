import { hashString } from "../helpers.ts";
import type {
    CommitRecord,
    CommitWorkerRequest,
    CommitWorkerResponse,
    PreparedCommit
} from "./workerTypes.ts";

type ApiItem = Readonly<{
    sha: string;
    html_url: string;
    commit: Readonly<{
        author: Readonly<{ name: string; date: string }>;
        message: string;
    }>;
}>;

function isCommit(value: unknown): value is ApiItem {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Partial<ApiItem>;
    return typeof item.sha === "string";
}

function extractCommit(item: ApiItem): CommitRecord {
    return {
        sha: item.sha,
        author: item.commit.author.name,
        date: item.commit.author.date,
        message: item.commit.message,
        url: item.html_url
    };
}

async function getCommits(repo: string, branch: string): Promise<CommitRecord[]> {
    const url = `https://api.github.com/repos/kittyCrypto-gg/${repo}/commits?sha=${encodeURIComponent(branch)}`;
    const response = await fetch(url, {
        headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("GitHub API payload is not an array");

    return data.filter(isCommit).map(extractCommit);
}

function hsl(hue: number, saturation = 80, lightness = 60): string {
    return `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
}

/** Generate the existing recursive identicon geometry without touching the DOM. */
function addTriangles(
    paths: string[], x: number, y: number, size: number,
    depth: number, colours: readonly string[], level = 0
): void {
    if (depth === 0) {
        const height = size * Math.sqrt(3) / 2;
        const points = [`${x},${y}`, `${x + size},${y}`, `${x + size / 2},${y - height}`].join(" ");
        paths.push(`<polygon points="${points}" fill="${colours[level % colours.length]}"></polygon>`);
        return;
    }

    const half = size / 2;
    const height = half * Math.sqrt(3) / 2;
    addTriangles(paths, x, y, half, depth - 1, colours, level + 1);
    addTriangles(paths, x + half, y, half, depth - 1, colours, level + 1);
    addTriangles(paths, x + half / 2, y - height, half, depth - 1, colours, level + 1);
}

async function renderIdenticon(sha: string, size: number): Promise<string> {
    const hash = await hashString(sha);
    const seed = hash[0] + hash[1] * 256;
    const hue = seed % 360;
    const colours = [hsl(hue), hsl(hue + 120), hsl(hue + 240)];
    const background = hsl((hue + 120 * (hash[5] % 3)) % 360, 40, 85);
    const depth = 2 + hash[6] % 4;
    const triangleSize = size * 0.8;
    const paths: string[] = [];

    addTriangles(paths, (size - triangleSize) / 2, size * 0.9, triangleSize, depth, colours);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="border-radius:8px;background:${background}">${paths.join("")}</svg>`;
}

async function prepareCommit(commit: CommitRecord): Promise<PreparedCommit> {
    const identiconSvg = await renderIdenticon(commit.sha, 36);
    return { ...commit, identiconSvg };
}

async function processRepo(request: CommitWorkerRequest): Promise<PreparedCommit[]> {
    const commits = await getCommits(request.repo, request.branch);
    // Each digest is independent; Promise.all keeps the API's original ordering.
    return Promise.all(commits.map(prepareCommit));
}

self.addEventListener("message", (event: MessageEvent<CommitWorkerRequest>) => {
    const request = event.data;
    void processRepo(request)
        .then((commits) => {
            const response: CommitWorkerResponse = { ok: true, commits };
            self.postMessage(response);
        })
        .catch((error: unknown) => {
            const response: CommitWorkerResponse = {
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            };
            self.postMessage(response);
        });
});
