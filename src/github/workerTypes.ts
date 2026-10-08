/** Data transferred between the commit tracker and each repository worker. */
export type CommitRepository = "website" | "server";

export type CommitRecord = Readonly<{
    sha: string;
    author: string;
    date: string;
    message: string;
    url: string;
}>;

export type PreparedCommit = CommitRecord & Readonly<{
    identiconSvg: string;
}>;

export type CommitWorkerRequest = Readonly<{
    repo: CommitRepository;
    branch: string;
}>;

export type CommitWorkerResponse =
    | Readonly<{ ok: true; commits: PreparedCommit[] }>
    | Readonly<{ ok: false; error: string }>;
