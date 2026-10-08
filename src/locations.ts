import { locApi } from "./locations/menu.ts";
import type { Opts } from "./locations/shared.ts";
export { locApi } from "./locations/menu.ts";
export function createLocationApi(options: Opts): locApi {
    return new locApi(options);
}
