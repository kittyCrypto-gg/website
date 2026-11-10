/**
 * Minimal File System Access-shaped directory backed by IndexedDB.
 * Used by the website mikuOS guest because iOS Safari does not reliably
 * implement OPFS createWritable() on the document thread.
 *
 * This does not change the immutable .thistle.base; only .mikuos overlay
 * files are stored here. Never delete native OPFS data during migration.
 */
interface StoredEntry {
    path: string;
    kind: "file" | "directory";
    data?: Blob;
}

const DB_NAME = "kittycrypto-mikuos-overlay-v1";
const STORE = "entries";

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) {
                request.result.createObjectStore(STORE, { keyPath: "path" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
}

async function readEntry(db: IDBDatabase, path: string): Promise<StoredEntry | undefined> {
    const tx = db.transaction(STORE, "readonly");
    return requestResult(tx.objectStore(STORE).get(path)) as Promise<StoredEntry | undefined>;
}

async function writeEntry(db: IDBDatabase, entry: StoredEntry): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
}

async function deleteEntry(db: IDBDatabase, path: string, recursive: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            const key = String(entry.key);
            if (key === path || (recursive && key.startsWith(path + "/"))) entry.delete();
            entry.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB delete aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
}

function missing(path: string): Error {
    return Object.assign(new Error("Missing browser overlay entry: " + path),
        { name: "NotFoundError" });
}

function mismatched(path: string): Error {
    return Object.assign(new Error("Browser overlay entry has wrong type: " + path),
        { name: "TypeMismatchError" });
}

function child(parent: string, name: string): string {
    if (!name || name === "." || name === ".." || name.includes("/")) {
        throw new TypeError("Invalid browser overlay filename");
    }
    return parent === "/" ? "/" + name : parent + "/" + name;
}

class IndexedFile {
    readonly kind = "file" as const;
    constructor(readonly name: string, private readonly path: string,
        private readonly db: IDBDatabase) {}

    async getFile(): Promise<File> {
        const entry = await readEntry(this.db, this.path);
        if (!entry) throw missing(this.path);
        if (entry.kind !== "file") throw mismatched(this.path);
        return new File([entry.data ?? new Blob()], this.name);
    }

    async createWritable(): Promise<{
        write(bytes: Uint8Array | string): Promise<void>;
        close(): Promise<void>;
    }> {
        let pending = new Blob();
        return {
            async write(bytes: Uint8Array | string): Promise<void> {
                pending = typeof bytes === "string"
                    ? new Blob([bytes])
                    : new Blob([Uint8Array.from(bytes)]);
            },
            close: async (): Promise<void> => {
                await writeEntry(this.db, { path: this.path, kind: "file", data: pending });
            }
        };
    }
}

export class IndexedDirectory {
    readonly kind = "directory" as const;
    readonly name: string;
    constructor(private readonly db: IDBDatabase, readonly path = "/") {
        this.name = path === "/" ? "" : path.split("/").at(-1) ?? "";
    }

    async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<IndexedDirectory> {
        const path = child(this.path, name);
        const entry = await readEntry(this.db, path);
        if (entry?.kind === "file") throw mismatched(path);
        if (!entry && !options.create) throw missing(path);
        if (!entry) await writeEntry(this.db, { path, kind: "directory" });
        return new IndexedDirectory(this.db, path);
    }

    async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<IndexedFile> {
        const path = child(this.path, name);
        const entry = await readEntry(this.db, path);
        if (entry?.kind === "directory") throw mismatched(path);
        if (!entry && !options.create) throw missing(path);
        if (!entry) await writeEntry(this.db, { path, kind: "file", data: new Blob() });
        return new IndexedFile(name, path, this.db);
    }

    async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
        const path = child(this.path, name);
        const entry = await readEntry(this.db, path);
        if (!entry) throw missing(path);
        await deleteEntry(this.db, path, options.recursive === true);
    }

    async *entries(): AsyncIterableIterator<[string, IndexedDirectory | IndexedFile]> {
        const tx = this.db.transaction(STORE, "readonly");
        const records = await requestResult(tx.objectStore(STORE).getAll()) as StoredEntry[];
        for (const record of records) {
            if (!record.path.startsWith(this.path === "/" ? "/" : this.path + "/")) continue;
            const relative = record.path.slice(this.path === "/" ? 1 : this.path.length + 1);
            if (relative.includes("/")) continue;
            yield [relative, record.kind === "directory"
                ? new IndexedDirectory(this.db, record.path)
                : new IndexedFile(relative, record.path, this.db)];
        }
    }
}

interface NativeDirectory {
    getDirectoryHandle(name: string): Promise<NativeDirectory>;
    getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
}

async function nativeFile(root: NativeDirectory, path: string): Promise<File> {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error("Invalid native overlay path");
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return (await dir.getFileHandle(name)).getFile();
}

async function copyNativeFile(root: NativeDirectory, dest: IndexedDirectory, path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) return;
    let dir = dest;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    const blob = await nativeFile(root, path);
    const out = await dir.getFileHandle(name, { create: true });
    const writer = await out.createWritable();
    await writer.write(new Uint8Array(await blob.arrayBuffer()));
    await writer.close();
}

/** Import a pre-existing OPFS overlay, leaving the original untouched. */
async function importNativeOverlay(root: IndexedDirectory): Promise<void> {
    const target = await root.getDirectoryHandle(".mikuos", { create: true });
    try {
        await target.getFileHandle(".thistle-overlay.json");
        return;
    } catch (error) {
        if ((error as { name?: string }).name !== "NotFoundError") throw error;
    }

    let native: NativeDirectory;
    try {
        const opfs = await navigator.storage.getDirectory();
        native = await opfs.getDirectoryHandle(".mikuos");
    } catch {
        return;
    }

    let raw: string;
    try {
        raw = await (await nativeFile(native, ".thistle-overlay.json")).text();
    } catch {
        return;
    }

    const manifest = JSON.parse(raw) as {
        entries?: Array<{ p: string; k: string; base?: boolean }>;
    };
    if (!Array.isArray(manifest.entries)) return;

    // Write all payloads before publishing the manifest. If migration fails,
    // the original OPFS overlay remains available without being cleared.
    for (const entry of manifest.entries) {
        if (entry.k !== "f" || entry.base) continue;
        await copyNativeFile(native, target, "data" + entry.p);
    }
    const file = await target.getFileHandle(".thistle-overlay.json", { create: true });
    const writer = await file.createWritable();
    await writer.write(raw);
    await writer.close();
}

export async function indexedDbGuestRoot(): Promise<IndexedDirectory> {
    const db = await openDatabase();
    const root = new IndexedDirectory(db);
    try {
        await importNativeOverlay(root);
    } catch (error) {
        console.warn("[mikuOS] Existing OPFS overlay could not be imported; original data was left untouched.", error);
    }
    return root;
}
