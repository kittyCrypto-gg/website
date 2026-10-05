import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles/modules/theme-toggle.css', import.meta.url), 'utf8');

test('floating controls stay aligned to the viewport right edge', () => {
  assert.match(css, /right:\s*var\(--theme-toggle-inline-offset\);/);
  assert.doesNotMatch(css, /100%\s*-\s*var\(--frame-width\)/);
});
