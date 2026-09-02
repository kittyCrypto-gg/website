import { build, load } from "../vendor/pages/src/index.ts";

const loaded = await load("pages.config.ts");
const result = await build(loaded);

console.log(`[pages] ${String(result.pages.length)} pages built in ${result.out}`);
