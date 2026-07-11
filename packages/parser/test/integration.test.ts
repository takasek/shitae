import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/index.js';

const battleSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/battle.shitae'), 'utf8');
const ecommerceSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/ecommerce.shitae'), 'utf8');
const musicSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/music.shitae'), 'utf8');

describe('integration: examples/battle.shitae', () => {
  it('parses without errors', () => {
    const { diagnostics } = parse(battleSrc);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('has correct component count', () => {
    const { document } = parse(battleSrc);
    // スプラッシュ, ログイン, ホーム, マッチング, ランキング, 対戦, 設定, 削除確認, マイページ, プロフィール編集, プロフィールカード, 記事詳細, カード詳細
    expect(document.components).toHaveLength(13);
  });

  it('マッチング has 2 variants', () => {
    const { document } = parse(battleSrc);
    const matching = document.components.find(c => c.name === 'マッチング');
    expect(matching).toBeDefined();
    expect(matching!.variants).toHaveLength(2);
    expect(matching!.variants[0].name).toBe('検索中');
    expect(matching!.variants[1].name).toBe('失敗');
  });

  it('対戦 has common body and 3 variants', () => {
    const { document } = parse(battleSrc);
    const battle = document.components.find(c => c.name === '対戦');
    expect(battle).toBeDefined();
    expect(battle!.common.elements.length).toBeGreaterThan(0);  // 合図, me, opponent
    expect(battle!.variants).toHaveLength(3);  // 開始, 対戦中, リザルト
  });

  it('プロフィールカード has common body and 2 variants', () => {
    const { document } = parse(battleSrc);
    const card = document.components.find(c => c.name === 'プロフィールカード');
    expect(card).toBeDefined();
    expect(card!.variants).toHaveLength(2);  // 未フォロー, フォロー済
  });
});

describe('integration: examples/ecommerce.shitae', () => {
  it('parses without errors', () => {
    const { diagnostics } = parse(ecommerceSrc);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('has correct component count', () => {
    const { document } = parse(ecommerceSrc);
    // スプラッシュ, 商品一覧, 商品詳細, フィルタシート, カート, チェックアウト, 完了,
    // 商品詳細追記, 共有シート, 投稿編集, 検索, レビュー詳細, 住所編集
    expect(document.components).toHaveLength(13);
  });

  it('商品詳細 has 2 variants', () => {
    const { document } = parse(ecommerceSrc);
    const detail = document.components.find(c => c.name === '商品詳細');
    expect(detail).toBeDefined();
    expect(detail!.variants).toHaveLength(2);  // 読込中, 表示
    expect(detail!.variants[0].name).toBe('読込中');
    expect(detail!.variants[1].name).toBe('表示');
  });

  it('チェックアウト has multi-result interaction', () => {
    const { document } = parse(ecommerceSrc);
    const checkout = document.components.find(c => c.name === 'チェックアウト');
    expect(checkout).toBeDefined();
    // タップ(注文確定) -> [成功] ... ; [在庫切れ] ... ; back(カート)
    const interaction = checkout!.common.interactions.find(i =>
      i.action.target?.name === '注文確定' ||
      i.action.text.includes('注文確定') || i.action.text.includes('注文')
    );
    expect(interaction).toBeDefined();
    expect(interaction!.results.length).toBeGreaterThanOrEqual(2);
  });
});

describe('integration: examples/music.shitae（overlay・switch・document common の実例）', () => {
  it('parses without errors', () => {
    const { diagnostics } = parse(musicSrc);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('document common に present(再生画面) のインタラクションを持つ', () => {
    const { document } = parse(musicSrc);
    expect(document.common.interactions.length).toBeGreaterThan(0);
    const dc = document.common.interactions[0];
    expect(dc.results[0].body.kind).toBe('transition');
  });

  it('タブバー部品が switch の interaction を持つ', () => {
    const { document } = parse(musicSrc);
    const tabbar = document.components.find(c => c.name === 'タブバー');
    expect(tabbar).toBeDefined();
    const switchResult = tabbar!.common.interactions
      .flatMap(i => i.results)
      .find(r => r.body.kind === 'transition' && r.body.word === 'switch');
    expect(switchResult).toBeDefined();
  });

  it('再生開始インタラクションが show(ミニプレイヤー) の overlay result を持つ', () => {
    const { document } = parse(musicSrc);
    const overlayResult = document.components
      .flatMap(c => [c.common, ...c.variants.map(v => v.body)])
      .flatMap(b => b.interactions)
      .flatMap(i => i.results)
      .find(r => r.body.kind === 'overlay' && r.body.verb === 'show');
    expect(overlayResult).toBeDefined();
  });

  it('再生画面 has シャッフルON/OFF の 2 variants', () => {
    const { document } = parse(musicSrc);
    const player = document.components.find(c => c.name === '再生画面');
    expect(player).toBeDefined();
    expect(player!.variants).toHaveLength(2);
  });
});
