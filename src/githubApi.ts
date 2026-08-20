export type GitHubRepo = Readonly<{
    fullName: string;
    description: string | null;
    htmlUrl: string;
    isPrivate: boolean;
}>;

const API = "https://api.github.com";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Shared GitHub REST request used by the website and vendored consumers.
 * Keeps the request headers and error handling in one place.
 */
export async function githubJson(path: string): Promise<unknown> {
    const url = new URL(path, API);
    const response = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github+json",
            "User-Agent": "web-client"
        }
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<unknown>;
}

/**
 * Fetches the small repository metadata surface used by static website consumers.
 */
export async function githubRepo(owner: string, repo: string): Promise<GitHubRepo> {
    const data = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (!isRecord(data)) throw new Error("GitHub repository payload is invalid");

    const fullName = data["full_name"];
    const description = data["description"];
    const htmlUrl = data["html_url"];
    const isPrivate = data["private"];

    if (typeof fullName !== "string" || typeof htmlUrl !== "string" || typeof isPrivate !== "boolean") {
        throw new Error("GitHub repository payload is incomplete");
    }
    if (description !== null && typeof description !== "string") {
        throw new Error("GitHub repository description is invalid");
    }

    return {
        fullName,
        description,
        htmlUrl,
        isPrivate
    };
}
