import type { PresenceRuntimeState } from "./presence/model.ts";
import { PresenceLoadingCard } from "./presence/view.tsx";
import { getPresenceMounts, getPresenceRefreshInterval, clearPresenceRefreshTimer, clearPresenceClockTimer, renderIntoPresenceMounts, synchronisePresenceClock, observePresenceVisibility } from "./presence/runtime.tsx";

(() => {
    const mounts = getPresenceMounts();
    if (mounts.length === 0) return;

    const refreshIntervalMs = getPresenceRefreshInterval(mounts);
    const runtimeState: PresenceRuntimeState = {
        hasLoadedOnce: false,
        isRefreshing: false,
        lastRenderedAt: 0,
        visibleMounts: new Set<HTMLElement>(),
        latestSnapshot: null
    };

    clearPresenceRefreshTimer();
    clearPresenceClockTimer();

    renderIntoPresenceMounts(
        mounts,
        <PresenceLoadingCard message="Contacting the live presence endpoint." />
    );

    document.addEventListener("visibilitychange", () => {
        synchronisePresenceClock(mounts, runtimeState);
    });

    observePresenceVisibility(mounts, refreshIntervalMs, runtimeState);
})();