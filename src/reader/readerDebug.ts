import { parseXml, pickFile, readFileText } from "./fileXml.ts";
import { renderXmlDoc } from "./chapterRender.tsx";

window.debug = window.debug || {};

window.debug.pickXml = async function (): Promise<void> {
    const file = await pickFile(".xml,application/xml,text/xml");
    if (!file) return;

    const xmlText = await readFileText(file);
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlText = async function (xmlText: string): Promise<void> {
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlFile = async function (file: File): Promise<void> {
    const xmlText = await readFileText(file);
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

