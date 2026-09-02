import { definePages } from "./vendor/pages/src/index.ts";

const cleanPage = (name: string) => ({
    from: `${name}.html`,
    route: `/${name}/`,
    legacy: [`${name}.html`],
    baseHref: "/"
});

export default definePages({
    source: ".",
    out: "site",
    copySource: false,
    pages: [
        { from: "index.html", route: "/" },
        cleanPage("about"),
        cleanPage("blog"),
        cleanPage("chat"),
        cleanPage("crtTest"),
        cleanPage("guestbook"),
        cleanPage("reader"),
        cleanPage("resources")
    ],
    copy: [
        { from: "data", to: "data" },
        { from: "dist", to: "dist" },
        { from: "images", to: "images" },
        { from: "styles", to: "styles" },
        { from: "ui", to: "ui" },
        { from: "favicon.ico", to: "favicon.ico" },
        { from: "manifest.json", to: "manifest.json" },
        { from: "robots.txt", to: "robots.txt" }
    ],
    noJekyll: true
});
