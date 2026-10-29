import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Static accessibility checks over every screen and component (BL-1302). TalkBack reads `accessibilityLabel`;
 * icon-only controls without one are announced as "button" only. Manual checks (TalkBack walk-through, 200 % font
 * scale, contrast) are in docs/phases/PHASE_13_HARDENING.md.
 */
const SRC = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Every JSX element `<Tag …>` (props up to the closing `>` / `/>` of the opening tag). */
function elements(source: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s>]`, 'g');
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(source.slice(m.index, i + 1));
  }
  return out;
}

const all = files(SRC).map((path) => ({ path: relative(SRC, path), source: readFileSync(path, 'utf8') }));

describe('accessibility (static)', () => {
  // A FAB with a visible `label` is read out by that text; icon-only controls need accessibilityLabel.
  it.each([
    ['IconButton', /\baccessibilityLabel=/],
    ['FAB', /\b(label|accessibilityLabel)=/],
  ])('every %s can be read out', (tag, ok) => {
    const missing = all.flatMap(({ path, source }) =>
      elements(source, tag as string)
        .filter((e) => !(ok as RegExp).test(e))
        .map((e) => `${path}: ${e.slice(0, 80)}`),
    );
    expect(missing).toEqual([]);
  });

  it('every TextInput has a label or accessibilityLabel', () => {
    const missing = all.flatMap(({ path, source }) =>
      elements(source, 'TextInput')
        .filter((e) => !/\b(label|accessibilityLabel)=/.test(e))
        .map((e) => `${path}: ${e.slice(0, 80)}`),
    );
    expect(missing).toEqual([]);
  });

  it('touch targets set a minimum height of at least 48 where sizes are set', () => {
    const tooSmall = all.flatMap(({ path, source }) =>
      [...source.matchAll(/minHeight:\s*(\d+)/g)]
        .filter((m) => Number(m[1]) < 48)
        .map((m) => `${path}: minHeight ${m[1]}`),
    );
    expect(tooSmall).toEqual([]);
  });
});
