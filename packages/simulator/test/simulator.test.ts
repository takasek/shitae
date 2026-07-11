import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { toSimulator } from '../src/simulator.js';

function parseOk(src: string) {
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse error: ${errors[0]!.message}`);
  return document;
}

describe('toSimulator', () => {
  it('returns a complete HTML document', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('embeds simulator data as JSON', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"entryComponent"');
    expect(html).toContain('"ホーム"');
  });

  it('contains script tag with JS runtime', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('<script>');
  });

  it('renders component name in the page', () => {
    const doc = parseOk('# マイページ\nアイコン\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('マイページ');
  });

  it('姿指定なしの遷移入場に備えランタイムが initialVariant を解決する', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"initialVariant":"読込中"');
    expect(html).toContain('initialVariant(');
  });

  it('is self-contained (no external resource links)', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
  });
});
