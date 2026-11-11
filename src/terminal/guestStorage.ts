import { indexedDbGuestRoot } from "./indexedDbRoot.ts";

/**
 * Scoped adapter for upstream WebTree's navigator.storage.getDirectory()
 * dependency. The upstream submodule remains untouched, while the website
 * uses a Safari-compatible, per-origin IndexedDB overlay.
 *
 * WebTree obtains its root promise in its constructor, so restoring the
 * navigator method after launch does not change ongoing persistence.
 */
export async function launchWithGuestStorage<T>(launch: () => Promise<T>): Promise<T> {
    const root = await indexedDbGuestRoot();
    const storage = navigator.storage;
    if (!storage) throw new Error("Browser storage is unavailable");

    const previous = Object.getOwnPropertyDescriptor(storage, "getDirectory");
    Object.defineProperty(storage, "getDirectory", {
        configurable: true,
        value: async () => root
    });

    try {
        return await launch();
    } finally {
        if (previous) Object.defineProperty(storage, "getDirectory", previous);
        else Reflect.deleteProperty(storage, "getDirectory");
    }
}
