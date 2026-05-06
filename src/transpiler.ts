import * as esbuild from "esbuild-wasm";

type CodeLanguage = "js" | "jsx" | "ts" | "tsx";

const ESBUILD_WASM_URL = "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.0/esbuild.wasm";
const JSDOC_LEGAL_MARKER = "@__KITTY_JSDOC__";
const SOURCE_IMPORT_EXTENSION_RE = /((?:from\s*|import\s*|import\s*\(\s*)["'])([^"']+)\.(?:ts|tsx|jsx)(["'])/g;
const JSDOC_RE = /\/\*\*[\s\S]*?\*\//g;

let esbuildReady: Promise<void> | null = null;

/**
 * Initialises esbuild once for browser-side transforms.
 *
 * @returns {Promise<void>} Resolves when esbuild is ready.
 */
function initEsbuild(): Promise<void> {
    if (esbuildReady) {
        return esbuildReady;
    }

    esbuildReady = esbuild.initialize({
        wasmURL: ESBUILD_WASM_URL
    });

    return esbuildReady;
}

/**
 * Picks an esbuild loader from a code language.
 *
 * @param {CodeLanguage} language The requested code language.
 * @returns {"js" | "jsx" | "ts" | "tsx"} The esbuild loader.
 */
function getEsbuildLoader(language: CodeLanguage): "js" | "jsx" | "ts" | "tsx" {
    return language;
}

/**
 * Protects JSDoc comments from esbuild comment stripping.
 *
 * @param {string} source The raw source code.
 * @returns {string} Source with JSDoc converted to legal comments.
 */
function protectJsDocs(source: string): string {
    return source.replace(JSDOC_RE, (comment) => {
        return comment.replace(/^\/\*\*/, `/*! ${JSDOC_LEGAL_MARKER}`);
    });
}

/**
 * Restores protected JSDoc comments after esbuild has transformed the source.
 *
 * @param {string} source The transformed source code.
 * @returns {string} Source with JSDoc comments restored.
 */
function restoreJsDocs(source: string): string {
    return source.replaceAll(`/*! ${JSDOC_LEGAL_MARKER}`, "/**");
}

/**
 * Rewrites source import/export specifiers to JavaScript extensions.
 *
 * @param {string} source The transformed source code.
 * @returns {string} Source with .ts, .tsx, and .jsx specifiers rewritten to .js.
 */
function rewriteSourceImportExtensions(source: string): string {
    return source.replace(
        SOURCE_IMPORT_EXTENSION_RE,
        (_match: string, prefix: string, path: string, suffix: string): string => {
            return `${prefix}${path}.js${suffix}`;
        }
    );
}

/**
 * Performs final formatting clean-up on transformed source.
 *
 * @param {string} source The transformed source code.
 * @returns {string} Cleaned source code.
 */
function cleanTranspiledSource(source: string): string {
    return rewriteSourceImportExtensions(restoreJsDocs(source)).trimEnd();
}

/**
 * Transpiles TypeScript-ish or JSX-ish source into JavaScript without type checking.
 *
 * @param {string} source The raw source code.
 * @param {CodeLanguage} sourceLanguage The language the fetched source is written in.
 * @returns {Promise<string>} The transformed JavaScript source.
 */
export async function transpileCodeSource(
    source: string,
    sourceLanguage: CodeLanguage
): Promise<string> {
    await initEsbuild();

    const result = await esbuild.transform(protectJsDocs(source), {
        loader: getEsbuildLoader(sourceLanguage),
        format: "esm",
        target: "esnext",
        minify: false,
        sourcemap: false,
        legalComments: "inline"
    });

    return cleanTranspiledSource(result.code);
}