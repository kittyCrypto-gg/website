import { drawTriangularIdenticon } from "./commitIdenticon.ts";
import { Clusteriser } from "./clusterise.ts";

declare global {
    interface Window {
        frontendClusteriser?: Clusteriser;
        backendClusteriser?: Clusteriser;
        [key: string]: unknown;
    }
}

interface GithubCommit {
    sha: string;
    author: string;
    date: string;
    message: string;
    url: string;
}

type GithubCommitsApiResponse = unknown;

interface GithubCommitsApiCommitAuthor {
    name: string;
    email: string;
    date: string;
}

interface GithubCommitsApiCommit {
    author: GithubCommitsApiCommitAuthor;
    committer: GithubCommitsApiCommitAuthor;
    message: string;
    tree: { sha: string; url: string };
    url: string;
    comment_count: number;
    verification: Record<string, unknown>;
}

interface GithubCommitsApiItem {
    sha: string;
    node_id: string;
    commit: GithubCommitsApiCommit;
    url: string;
    html_url: string;
    comments_url: string;
    author: Record<string, unknown> | null;
    committer: Record<string, unknown> | null;
    parents: { sha: string; url: string; html_url: string }[];
}

/**
 * @param {GithubCommitsApiResponse} value - JSON payload from the GitHub commits API.
 * @returns {value is GithubCommitsApiItem[]} True if the value is an array, indicating it is a valid GitHub commits API response. This type guard function checks if the provided value is an array, which is the expected format for the GitHub commits API response. It does not perform deep validation of the array contents, but it serves as a preliminary check to ensure that the data structure is consistent with what the API should return.
 */
function isGithubCommitsApiArray(value: GithubCommitsApiResponse): value is GithubCommitsApiItem[] {
    return Array.isArray(value);
}

/**
 * @param {unknown} value - Unknown candidate object.
 * @returns {value is GithubCommitsApiItem} True if the value is a valid GitHub commit item with a string "sha" property.
 */
function isGithubCommitItem(value: unknown): value is GithubCommitsApiItem {
    if (typeof value !== "object" || value === null) return false;
    return typeof (value as Record<string, unknown>).sha === "string";
}

/**
 * @param {GithubCommitsApiItem} item - A validated GitHub commits API item.
 * @returns {GithubCommit} Extracted commit fields from the GitHub API payload item.
 */
function extractCommitFields(item: GithubCommitsApiItem): GithubCommit {
    return {
        sha: item.sha,
        author: item.commit.author.name,
        date: item.commit.author.date,
        message: item.commit.message,
        url: item.html_url
    };
}

/**
 * @param {string} owner - GitHub repo owner.
 * @param {string} repo - GitHub repo name.
 * @param {string} branch - Branch name.
 * @returns {Promise<GithubCommit[]>} A promise that resolves to an array of GitHub commits. This function fetches the commit history for a specified GitHub repository and branch using the GitHub API. It constructs the API URL based on the provided owner, repo, and branch parameters, and makes a GET request to retrieve the commit data. The response is then validated and transformed into an array of GithubCommit objects, which contain the commit SHA, author name, date, message, and URL. If any errors occur during the fetch or data processing, they are thrown as exceptions.
 */
async function fetchCommits(owner: string, repo: string, branch: string = "main"): Promise<GithubCommit[]> {
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

    const data: GithubCommitsApiResponse = await (response.json() as Promise<unknown>);
    if (!isGithubCommitsApiArray(data)) throw new Error("GitHub API payload is not an array");

    return data
        .filter(isGithubCommitItem)
        .map((commit) => extractCommitFields(commit));
}

/**
 * @param {readonly GithubCommit[]} commits - Commits to render.
 * @param {string} containerId - DOM id of the container.
 * @param {string} clusteriserInstanceName - Window property name used to store the Clusteriser instance.
 * @returns {Promise<void>} A promise that resolves when the commits have been rendered. This function takes an array of GitHub commits and renders them into a specified container in the DOM. It creates individual commit blocks for each commit, including a triangular identicon, commit message, author, date, SHA, and a link to the commit on GitHub. After rendering the commits as HTML elements, it updates or initializes a Clusteriser instance to efficiently handle the display of potentially large lists of commits. The function ensures that the rendering process is asynchronous and handles any necessary updates to the Clusteriser instance accordingly.
 */
async function renderCommits(commits: readonly GithubCommit[], containerId: string, clusteriserInstanceName: string): Promise<void> {
    const container = document.getElementById(containerId) as HTMLElement;
    container.innerHTML = ""; // Clear previous content

    for (const commit of commits) {
        const div = document.createElement("div");
        div.className = "commit-block";

        const identicon = await drawTriangularIdenticon(commit.sha, 36);

        const identiconWrapper = document.createElement("div");
        identiconWrapper.className = "commit-identicon";
        identiconWrapper.appendChild(identicon);

        const contentWrapper = document.createElement("div");
        contentWrapper.className = "commit-content";
        contentWrapper.innerHTML = `
            <div class="commit-message">${commit.message}</div>
            <div class="commit-meta">
                <span><strong>Author:</strong> ${commit.author}</span><br>
                <span><strong>Date:</strong> ${new Date(commit.date).toLocaleString()}</span><br>
                <span><strong>SHA:</strong> <code>${commit.sha}</code></span><br>
                <a href="${commit.url}" target="_blank">View on GitHub</a>
            </div>
        `;

        div.appendChild(identiconWrapper);
        div.appendChild(contentWrapper);
        container.appendChild(div);
    }

    const rows = Array.from(container.children).map((el) => (el as HTMLElement).outerHTML);

    const existing = window[clusteriserInstanceName] as unknown;

    if (!existing) {
        const created = new Clusteriser(container);
        window[clusteriserInstanceName] = created;
        await created.init();
    }

    const instanceUnknown = window[clusteriserInstanceName] as unknown;
    if (!(instanceUnknown instanceof Clusteriser)) {
        throw new Error(`Invalid Clusteriser instance at window["${clusteriserInstanceName}"]`);
    }
    instanceUnknown.update(rows);
}

// Run on load:
(async () => {
    try {
        const frontendCommits = await fetchCommits("kittyCrypto-gg", "website");
        await renderCommits(frontendCommits, "github-commits-frontend", "frontendClusteriser");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        (document.getElementById("github-commits") as HTMLElement).textContent = "Error: " + message;
    }

    try {
        const backendCommits = await fetchCommits("kittyCrypto-gg", "server");
        await renderCommits(backendCommits, "github-commits-backend", "backendClusteriser");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        (document.getElementById("github-commits") as HTMLElement).textContent = "Error: " + message;
    }
})();