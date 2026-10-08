import MediaStyler from "./mediaStyler.tsx";
import { render2Mkup } from "./reactHelpers.tsx";
import type { JSX } from "react";
import type { Clusteriser } from "./clusterise.ts";
import type {
    CommitRepository,
    CommitWorkerRequest,
    CommitWorkerResponse,
    PreparedCommit
} from "./github/workerTypes.ts";
import { escapeHtml } from "./helpers/escape.ts";

declare global {
    interface Window {
        frontendClusteriser?: Clusteriser;
        backendClusteriser?: Clusteriser;
    }
}

const styler = new MediaStyler();
const NO_DESC = "No description given for this commit.";
const WORKER_URL = "/dist/workers/github.js";

function splitMsg(message: string): Readonly<{ summary: string; description: string }> {
    const lines = message.replace(/\r\n?/g, "\n").split("\n");
    const summary = (lines.shift() || "").trim();
    return { summary: summary || message.trim(), description: lines.join("\n").trim() };
}

async function msgHtml(message: string): Promise<string> {
    const { summary, description } = splitMsg(message);
    const safeSummary = escapeHtml(summary);
    const tooltipBody = escapeHtml(description || NO_DESC).replace(/\n/g, "<br />");
    const tooltipMarkup = `
    <tooltip>
      <span class="commit-message-summary" tabindex="0">${safeSummary}</span>
      <content html="true">${tooltipBody}</content>
    </tooltip>
    `.trim();

    return styler.replaceTooltips(tooltipMarkup);
}

function Body(props: { commit: PreparedCommit; messageHtml: string }): JSX.Element {
    const { commit, messageHtml } = props;
    return (
        <div className="commit-content">
            <div className="commit-message" dangerouslySetInnerHTML={{ __html: messageHtml }} />
            <div className="commit-meta">
                <span><strong>Author:</strong> {commit.author}</span>
                <br />
                <span><strong>Date:</strong> {new Date(commit.date).toLocaleString()}</span>
                <br />
                <span><strong>SHA:</strong> <code>{commit.sha}</code></span>
                <br />
                <a href={commit.url} target="_blank" rel="noopener noreferrer">View on GitHub</a>
            </div>
        </div>
    );
}

/** Render a Clusterize row without inserting and then serialising live DOM. */
async function renderRow(commit: PreparedCommit): Promise<string> {
    const messageHtml = await msgHtml(commit.message);
    return render2Mkup(
        <div className="commit-block">
            <div className="commit-identicon" dangerouslySetInnerHTML={{ __html: commit.identiconSvg }} />
            <Body commit={commit} messageHtml={messageHtml} />
        </div>
    );
}

/** Each invocation owns a dedicated module Worker for one repository. */
function fetchPreparedCommits(repo: CommitRepository): Promise<PreparedCommit[]> {
    return new Promise<PreparedCommit[]>((resolve, reject) => {
        const worker = new Worker(WORKER_URL, { type: "module", name: `github-${repo}` });
        const request: CommitWorkerRequest = { repo, branch: "main" };

        const cleanup = (): void => {
            worker.terminate();
        };

        worker.onmessage = (event: MessageEvent<CommitWorkerResponse>): void => {
            cleanup();
            if (event.data.ok) {
                resolve(event.data.commits);
                return;
            }

            reject(new Error(event.data.error));
        };

        worker.onerror = (event: ErrorEvent): void => {
            cleanup();
            reject(new Error(event.message || `GitHub ${repo} worker failed`));
        };

        worker.onmessageerror = (): void => {
            cleanup();
            reject(new Error(`GitHub ${repo} worker response could not be decoded`));
        };

        worker.postMessage(request);
    });
}

/** Clusterize is imported only after the visible section's rows are ready. */
async function renderCommits(
    commits: readonly PreparedCommit[], container: HTMLElement, clusterKey: "frontendClusteriser" | "backendClusteriser"
): Promise<void> {
    const rows = await Promise.all(commits.map(renderRow));
    const { Clusteriser } = await import("./clusterise.ts");

    const existing = window[clusterKey];
    if (existing instanceof Clusteriser) {
        existing.update(rows);
        return;
    }

    const created = new Clusteriser(container, { rows });
    window[clusterKey] = created;
    await created.init();
}

async function bootRepository(
    repo: CommitRepository, targetId: string, clusterKey: "frontendClusteriser" | "backendClusteriser"
): Promise<void> {
    const container = document.getElementById(targetId);
    if (!(container instanceof HTMLElement)) return;

    try {
        const commits = await fetchPreparedCommits(repo);
        await renderCommits(commits, container, clusterKey);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        container.textContent = "Error: " + message;
    }
}

// The two API fetches and all identicon digests run in parallel off the main thread.
// Each panel can complete or fail without waiting for the other repository.
void Promise.all([
    bootRepository("website", "github-commits-frontend", "frontendClusteriser"),
    bootRepository("server", "github-commits-backend", "backendClusteriser")
]);
