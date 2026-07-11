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

  it('document common を data に含め、常時アクションとして描画する', () => {
    const doc = parseOk('> 通知をタップ -> push(詳細)\n\n# ホーム\nロゴ\n\n# 詳細\n本文\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"documentCommon"');
    expect(html).toContain('通知をタップ');
    expect(html).toContain('handleDocCommon');
  });

  it('switch を transition として扱う（effect 落ちしない）分岐が生成物に含まれる', () => {
    const doc = parseOk('# ホーム\n> タブ -> switch(検索, @s)\n\n# 検索\n欄\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain("word === 'switch'");
    expect(html).toContain('"word":"switch"');
  });

  it('overlay（show/hide）を overlay result body として埋め込み、掲示帯を持つ', () => {
    const doc = parseOk('# P\n> 再生 -> show(ミニプレイヤー)\n> 停止 -> hide(ミニプレイヤー)\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"type":"overlay"');
    expect(html).toContain('"op":"show"');
    expect(html).toContain('overlay-bar');
  });

  it('back(X) は wall を越えない（barrier 停止のロジックを含む）', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    // back(X) 走査ループが wall で break する（runtime 整合）
    expect(html).toContain('if (stack[i].wall) break;');
  });
});
