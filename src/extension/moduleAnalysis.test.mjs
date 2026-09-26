import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeModule } from '../../scripts/module-analysis.mjs';

const computed =
  "import './a.js';\nexport const load = (url) => import(url);\n";

test('computed imports stay forbidden by default', () => {
  assert.throws(() => analyzeModule(computed), /Computed module imports/);
});

test('an allowed loader may import a computed path and keeps its literal imports', () => {
  assert.deepEqual(
    analyzeModule(computed, { allowComputedImports: true }).imports,
    ['./a.js'],
  );
});
