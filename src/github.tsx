import { drawTriangularIdenticon } from "./commitIdenticon.ts";
import { Clusteriser } from "./clusterise.ts";
import MediaStyler from "./mediaStyler.tsx";
import { render2Frag } from "./reactHelpers.tsx";
import type { JSX } from "react";
import * as helpers from "./helpers.ts";

declare global {
    interface Window {
        frontendClusteriser?: Clusteriser;
        backendClusteriser?: Clusteriser;
        [key: string]: unknown;
    }
}

interface Commit {
    sha: string;
    author: string;
    date: string;
    message: string;
    url: string;
}

type ApiRes = unknown;

interface ApiAuthor {
    name: string;
    email: string;
    date: string;
}

interface ApiCommit {
    author: ApiAuthor;
    committer: ApiAuthor;
    message: string;
    tree: { sha: string; url: string };
    url: string;
    comment_count: number;
    verification: Record<string, unknown>;
}

interface ApiItem {
    sha: string;
    node_id: string;
    commit: ApiCommit;
    url: string;
    html_url: string;
    comments_url: string;
    author: Record<string, unknown> | null;
    committer: Record<string, unknown> | null;
    parents: { sha: string; url: string; html_url: string }[];
}

type SplitMsg = Readonly<{
    summary: string;
    description: string;
}>;

const styler = new MediaStyler();
const NO_DESC = "No description given for this commit.";

/**
 * Cheap check for the github commits payload shape.
 * not deep or anything, just making sure we got an array first.
 * @param {ApiRes} value
 * @returns {value is ApiItem[]}
 */
function isApiArr(value: ApiRes): value is ApiItem[] {
    return Array.isArray(value);
}

/**
 * Checks one array item enough that we can pull fields out of it.
 * yeah, pretty light touch.
 * @param {unknown} value
 * @returns {value is ApiItem}
 */
function isItem(value: unknown): value is ApiItem {
    if (typeof value !== "object" || value === null) return false;
    return typeof (value as Record<string, unknown>).sha === "string";
}

/**
 * Pulls out the bits this file actually cares about.
 * @param {ApiItem} item
 * @returns {Commit}
 */
function pickCommit(item: ApiItem): Commit {
    return {
        sha: item.sha,
        author: item.commit.author.name,
        date: item.commit.author.date,
        message: item.commit.message,
        url: item.html_url
    };
}

/**
 * Splits commit text into summary + the rest.
 * first line wins, usual git message vibes.
 * @param {string} message
 * @returns {SplitMsg}
 */
function splitMsg(message: string): SplitMsg {
    const lines = message.replace(/\r\n?/g, "\n").split("\n");
    const summary = (lines.shift() || "").trim();
    const description = lines.join("\n").trim();

    return {
        summary: summary || message.trim(),
        description
    };
}

/**
 * Escapes tooltip text and keeps line breaks.
 * tiny helper, but saves repeating the replace bit.
 * @param {string} description
 * @returns {string}
 */
function tipHtml(description: string): string {
    return helpers.escapeHtml(description).replace(/\n/g, "<br />");
}

/**
 * Builds the html used inside the commit message area.
 * summary visible, rest tucked in the tooltip.
 * @param {string} message
 * @returns {Promise<string>}
 */
async function msgHtml(message: string): Promise<string> {
    const { summary, description } = splitMsg(message);
    const safeSummary = helpers.escapeHtml(summary);
    const tooltipText = description || NO_DESC;
    const tooltipBody = tipHtml(tooltipText);

    const tooltipMarkup = `
    <tooltip>
      <span class="commit-message-summary" tabindex="0">${safeSummary}</span>
      <content html="true">${tooltipBody}</content>
    </tooltip>
  `.trim();

    return styler.replaceTooltips(tooltipMarkup);
}

/**
 * The visible commit body bit.
 * @param {{ commit: Commit; messageHtml: string }} props
 * @returns {JSX.Element}
 */
function Body(props: { commit: Commit; messageHtml: string }): JSX.Element {
    const { commit, messageHtml } = props;

    return (
        <div className="commit-content">
            <div
                className="commit-message"
                dangerouslySetInnerHTML={{ __html: messageHtml }}
            />

            <div className="commit-meta">
                <span>
                    <strong>Author:</strong> {commit.author}
                </span>
                <br />
                <span>
                    <strong>Date:</strong> {new Date(commit.date).toLocaleString()}
                </span>
                <br />
                <span>
                    <strong>SHA:</strong> <code>{commit.sha}</code>
                </span>
                <br />
                <a href={commit.url} target="_blank" rel="noopener noreferrer">
                    View on GitHub
                </a>
            </div>
        </div>
    );
}

/**
 * Builds one commit block dom node.
 * identicon gets plugged in later.
 * @param {Commit} commit
 * @returns {Promise<HTMLDivElement>}
 */
async function mkEl(commit: Commit): Promise<HTMLDivElement> {
    const html = await msgHtml(commit.message);

    const frag = render2Frag(
        <div className="commit-block">
            <div className="commit-identicon" />
            <Body commit={commit} messageHtml={html} />
        </div>
    );

    const block = frag.firstElementChild;
    if (!(block instanceof HTMLDivElement)) {
        throw new Error("Failed to build commit element");
    }

    return block;
}

/**
 * Fetches commit history from github for one repo/branch.
 * basic mapping only, nothing fancy.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @returns {Promise<Commit[]>}
 */
async function getCommits(owner: string, repo: string, branch: string = "main"): Promise<Commit[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}`;
    const response = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github+json",
            "User-Agent": "web-client"
        }
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const data: ApiRes = await (response.json() as Promise<unknown>);
    if (!isApiArr(data)) throw new Error("GitHub API payload is not an array");

    return data
        .filter(isItem)
        .map((item) => pickCommit(item));
}

/**
 * Renders a list of commits into a container and wires clusterise up.
 * does the identicons too, so this one does a fair bit.
 * @param {readonly Commit[]} commits
 * @param {string} containerId
 * @param {string} clusterKey
 * @returns {Promise<void>}
 */
async function showCommits(
    commits: readonly Commit[],
    containerId: string,
    clusterKey: string
): Promise<void> {
    const container = document.getElementById(containerId);
    if (!(container instanceof HTMLElement)) {
        throw new Error(`Missing container: ${containerId}`);
    }

    container.innerHTML = "";

    for (const commit of commits) {
        const block = await mkEl(commit);
        const identicon = await drawTriangularIdenticon(commit.sha, 36);

        const identiconWrap = block.querySelector(".commit-identicon");
        if (identiconWrap instanceof HTMLElement) {
            identiconWrap.appendChild(identicon);
        }

        container.appendChild(block);
    }

    const rows = Array.from(container.children).map((el) => (el as HTMLElement).outerHTML);

    const existing = window[clusterKey] as unknown;
    if (!existing) {
        const created = new Clusteriser(container);
        window[clusterKey] = created;
        await created.init();
    }

    const inst = window[clusterKey] as unknown;
    if (!(inst instanceof Clusteriser)) {
        throw new Error(`Invalid Clusteriser instance at window["${clusterKey}"]`);
    }

    inst.update(rows);
}

/**
 * Boots both commit lists.
 * two separate try blocks on purpose so one repo can fail without taking the other down.
 * @returns {Promise<void>}
 */
const boot = async (): Promise<void> => {
    try {
        const frontendCommits = await getCommits("kittyCrypto-gg", "website");
        await showCommits(frontendCommits, "github-commits-frontend", "frontendClusteriser");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const el = document.getElementById("github-commits");
        if (el instanceof HTMLElement) el.textContent = "Error: " + message;
    }

    try {
        const backendCommits = await getCommits("kittyCrypto-gg", "server");
        await showCommits(backendCommits, "github-commits-backend", "backendClusteriser");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const el = document.getElementById("github-commits");
        if (el instanceof HTMLElement) el.textContent = "Error: " + message;
    }
};

void boot();