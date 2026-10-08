export function parseXml(xmlText: string): Document {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];

    if (!parseError) return xmlDoc;

    const message = parseError.textContent || "Invalid XML";
    throw new Error(message);
}

export function pickFile(accept: string): Promise<File | null> {
    return new Promise<File | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.style.display = "none";

        input.addEventListener(
            "change",
            () => {
                const file = input.files?.[0] ?? null;
                input.remove();
                resolve(file);
            },
            { once: true }
        );

        document.body.appendChild(input);
        input.click();
    });
}

export function readFileText(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsText(file);
    });
}
