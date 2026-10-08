import type { locApi as LocationApi } from "../locations.ts";

export type CommentScope = Readonly<
    | { page: string; slug?: never }
    | { slug: string; page?: never }
>;

export type CommentRecord = Readonly<{
    nick: string;
    ip: string;
    msg: string;
    timestamp: string;
    website?: string;
    location?: string;
}>;

export type CommentSession = Readonly<{
    sessionToken: string | null;
    userIp: string | null;
}>;

export type CommentFormValues = Readonly<{
    nick: string;
    msg: string;
    rawWebsite: string;
    website?: string;
    location: string;
}>;

export type CommentPostOk = Readonly<{ success: true; id: string }>;
export type CommentPostFail = Readonly<{ success: false; error: string | undefined }>;
export type CommentPostRes = CommentPostOk | CommentPostFail;

export type CommentPostInput = Readonly<{
    url: string;
    scope: CommentScope;
    nick: string;
    msg: string;
    ip: string | null;
    sessionToken: string | null;
    website?: string;
    location: string;
    emptyCredentialsAsString?: boolean;
}>;

export type CommentFormControls = Readonly<{
    nickInput: HTMLInputElement;
    textarea: HTMLTextAreaElement;
    websiteInput?: HTMLInputElement | null;
    locationSelect?: HTMLSelectElement | null;
}>;

export type LoadCommentRecordsInput = Readonly<{
    url: string;
    scopeParam: "page" | "slug";
    scopeValue: string;
}>;

export type RenderCommentRecordsInput = Readonly<{
    comments: readonly unknown[];
    box: HTMLElement;
    locationApi?: LocationApi | null;
}>;

export type CommentLocationPickerInput = Readonly<{
    selectElement: HTMLSelectElement;
    flagElement: HTMLElement;
    storageKey?: string;
    placeholderLabel?: string;
    emptyFlagLabel?: string;
}>;
