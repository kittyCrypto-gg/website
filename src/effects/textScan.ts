/**
 * Schedules CRT DOM discovery in short, idle-time slices.
 * Unlike a synchronous TreeWalker, a large page cannot monopolise one frame.
 */
export function createTextScan(mark: (node: Node) => void): {
    enqueue(root: Node): void;
    clear(): void;
} {
    const roots: Node[] = [];
    let walker: TreeWalker | null = null;
    let scheduled = false;
    let version = 0;

    const schedule = (): void => {
        if (scheduled) return;
        scheduled = true;
        const expectedVersion = version;

        const work = (): void => {
            if (expectedVersion !== version) return;
            scheduled = false;
            const start = performance.now();
            let visited = 0;

            // Bound the work both by count and elapsed time. One slow style
            // calculation can run over budget, but will not trigger another
            // unbounded scan in the same task.
            while (visited < 80 && performance.now() - start < 2) {
                if (!walker) {
                    const root = roots.shift();
                    if (!root) break;
                    if (!root.isConnected) continue;

                    mark(root);
                    visited += 1;
                    walker = document.createTreeWalker(
                        root,
                        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
                    );
                }

                const node = walker.nextNode();
                if (!node) {
                    walker = null;
                    continue;
                }

                if (node.isConnected) mark(node);
                visited += 1;
            }

            if (walker || roots.length > 0) schedule();
        };

        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(work, { timeout: 200 });
        } else {
            globalThis.setTimeout(work, 16);
        }
    };

    return {
        enqueue(root: Node): void {
            roots.push(root);
            schedule();
        },
        clear(): void {
            version += 1;
            scheduled = false;
            walker = null;
            roots.length = 0;
        }
    };
}
