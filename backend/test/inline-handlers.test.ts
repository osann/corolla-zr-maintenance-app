import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jsArg } from '../../js/util.js';

// Inline on*= handlers run against window, not module scope, so every function they call has to be
// in the Object.assign(window, { … }) list in js/main.js. A missing one fails silently, only when its
// button is clicked, and ESLint can't see it. These read the handlers straight from the source, so
// they also cover templates the browser smoke tests never render.

const ROOT = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');
const FILES = [
  'index.html',
  ...readdirSync(new URL('js/', ROOT))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `js/${f}`),
];

const exposed = new Set(
  read('js/main.js')
    .match(/Object\.assign\(window, \{([^}]*)\}\)/)![1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);

// Every on*="…" attribute value in the HTML and in the modules' template strings.
const handlers = FILES.flatMap((file) =>
  [...read(file).matchAll(/\son[a-z]+="([^"]*)"/g)].map(([, code]) => ({ file, code })),
);

// The functions a handler calls by bare name. Template interpolations run while the HTML is built,
// not when the handler fires, and string literals aren't code, so both are blanked out first.
const KEYWORDS = new Set(['if', 'for', 'while', 'return', 'function', 'typeof', 'new', 'await', 'switch', 'catch']);
function calledNames(code: string): string[] {
  const bare = code.replace(/\$\{[^}]*\}/g, '0').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return [...bare.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(([, name]) => name)
    .filter((name) => !KEYWORDS.has(name));
}

describe('inline handlers', () => {
  it('finds the handlers', () => {
    expect(handlers.length).toBeGreaterThan(100);
  });

  it('only call functions that main.js puts on window', () => {
    const missing = handlers.flatMap(({ file, code }) =>
      calledNames(code)
        .filter((name) => !exposed.has(name))
        .map((name) => `${name} in ${file}`),
    );
    expect(missing).toEqual([]);
  });

  it('leave nothing on window that no handler calls', () => {
    const called = new Set(handlers.flatMap(({ code }) => calledNames(code)));
    expect([...exposed].filter((name) => !called.has(name))).toEqual([]);
  });

  // escAttr() output is decoded back to plain text before the handler runs, so an apostrophe in
  // the value ends the JavaScript string early and the button does nothing. jsArg() is safe.
  it('pass text arguments with jsArg(), not escAttr()', () => {
    const unsafe = handlers.filter(({ code }) => code.includes('escAttr(')).map(({ file, code }) => `${file}: ${code}`);
    expect(unsafe).toEqual([]);
  });
});

describe('jsArg', () => {
  // What the handler sees: the attribute value as the HTML parser decodes it, then evaluated.
  const decodeAttribute = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  const roundTrip = (value: unknown) => new Function(`return ${decodeAttribute(jsArg(value))}`)();

  it.each([["Bob's wash"], ['say "hi"'], ['a & b <c>'], ['back\\slash'], [42], [null]])('round-trips %j', (value) => {
    expect(roundTrip(value)).toEqual(value);
  });

  it('never closes the attribute early', () => {
    expect(jsArg(`"'><img onerror=x>`)).not.toMatch(/["<>]/);
  });
});
