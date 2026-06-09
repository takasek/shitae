import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { extractSimData } from '../src/extract.js';

function parseOk(src: string) {
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse error: ${errors[0]!.message}`);
  return document;
}

describe('extractSimData', () => {
  it('single component no variation', () => {
    const doc = parseOk('# ホーム\nロゴ\n---\nタップ(ロゴ) -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryModule).toBe('main');
    expect(data.entryComponent).toBe('ホーム');
    const comp = data.modules['main']!.components['ホーム']!;
    expect(comp.commonElements).toContain('ロゴ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.commonInteractions[0]!.actionText).toContain('タップ');
    expect(comp.variations).toEqual({});
  });

  it('component with variations', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n---\n## 表示\nコンテンツ\n---\nタップ(コンテンツ) -> push(次)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['詳細']!;
    expect(Object.keys(comp.variations)).toEqual(['読込中', '表示']);
    expect(comp.variations['読込中']!.elements).toContain('スピナー');
    expect(comp.variations['表示']!.elements).toContain('コンテンツ');
    expect(comp.variations['表示']!.interactions).toHaveLength(1);
  });

  it('common elements appear in commonElements', () => {
    const doc = parseOk('# プロフィール\nヘッダ\n---\nタップ(ヘッダ) -> back()\n## 未フォロー\nフォローボタン\n---\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['プロフィール']!;
    expect(comp.commonElements).toContain('ヘッダ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.variations['未フォロー']!.elements).toContain('フォローボタン');
  });

  it('interaction with multiple results', () => {
    const doc = parseOk('# 保存\n---\nタップ(保存) -> [成功] goto(完了) ; [失敗] エラー表示\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['保存']!;
    const interaction = comp.commonInteractions[0]!;
    expect(interaction.results).toHaveLength(2);
    expect(interaction.results[0]!.label).toBe('成功');
    expect(interaction.results[0]!.body.type).toBe('transition');
    expect(interaction.results[1]!.label).toBe('失敗');
    expect(interaction.results[1]!.body.type).toBe('effect');
  });

  it('transition result contains word and target', () => {
    const doc = parseOk('# A\n---\nタップ -> push(B)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const result = data.modules['main']!.components['A']!.commonInteractions[0]!.results[0]!;
    expect(result.body.type).toBe('transition');
    if (result.body.type === 'transition') {
      expect(result.body.word).toBe('push');
      expect(result.body.target?.component).toBe('B');
    }
  });

  it('entryComponent is first component', () => {
    const doc = parseOk('# ログイン\n---\n\n# ホーム\n---\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryComponent).toBe('ログイン');
  });
});
