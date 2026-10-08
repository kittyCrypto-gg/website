declare module "clusterize.js" {
    export default class Clusterize {
        constructor(options: Readonly<{
            scrollId: string;
            contentId: string;
            rows: readonly string[];
        }> & Readonly<Record<string, unknown>>);
        update(rows: readonly string[]): void;
        destroy(clean?: boolean): void;
    }
}
