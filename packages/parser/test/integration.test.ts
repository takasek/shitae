import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/index.js';

const battleSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/battle.shitae'), 'utf8');
const ecommerceSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/ecommerce.shitae'), 'utf8');
const musicSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/music.shitae'), 'utf8');
const deliverySrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/delivery.shitae'), 'utf8');
const langlearnSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/langlearn.shitae'), 'utf8');

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

describe('integration: examples/delivery.shitae（singleton・overlay・exit 固定慣用句の実例）', () => {
  it('parses without errors', () => {
    const { diagnostics } = parse(deliverySrc);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('has correct component count', () => {
    const { document } = parse(deliverySrc);
    // ホーム, 店舗詳細, 品目, 品目詳細, カート確認, 住所選択, 支払い, 注文確定,
    // クーポン, サポートチャット, 配達状況バナー, 配達追跡
    expect(document.components).toHaveLength(12);
  });

  it('クーポン は singleton（#!）で 未受取／受取済 の 2 variants を持つ', () => {
    const { document } = parse(deliverySrc);
    const coupon = document.components.find(c => c.name === 'クーポン');
    expect(coupon).toBeDefined();
    expect(coupon!.singleton).toBe(true);
    expect(coupon!.variants.map(v => v.name)).toEqual(['未受取', '受取済']);
  });

  it('クーポン以外の component は singleton でない（既定の #）', () => {
    const { document } = parse(deliverySrc);
    const nonSingletons = document.components.filter(c => c.name !== 'クーポン');
    expect(nonSingletons.every(c => c.singleton === false)).toBe(true);
  });

  it('document common に present(クーポン) の導線を持つ', () => {
    const { document } = parse(deliverySrc);
    const toCoupon = document.common.interactions
      .flatMap(i => i.results)
      .find(r => r.body.kind === 'transition' && r.body.word === 'present'
        && r.body.target?.kind === 'component' && r.body.target.name === 'クーポン');
    expect(toCoupon).toBeDefined();
  });
});

describe('integration: examples/langlearn.shitae（set・singleton タブ・gate 動的解決の実例）', () => {
  it('parses without errors', () => {
    const { diagnostics } = parse(langlearnSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('学習 と ストリークバッジ が singleton（#!）', () => {
    const { document } = parse(langlearnSrc);
    const singletons = document.components.filter(c => c.singleton).map(c => c.name);
    expect(singletons.sort()).toEqual(['ストリークバッジ', '学習']);
  });

  it('set(学習##ハート切れ) / set(学習##通常) の StateWrite を含む', () => {
    const { document } = parse(langlearnSrc);
    const writes = document.components
      .flatMap(c => [...c.common.interactions, ...c.variants.flatMap(v => v.body.interactions)])
      .flatMap(i => i.results)
      .filter(r => r.body.kind === 'state')
      .map(r => (r.body.kind === 'state' ? r.body.target.variant : ''));
    expect(writes.sort()).toEqual(['ハート切れ', '通常']);
  });

  it('document common に presence gate 付き deep link を持つ（ADR-0015 の実例）', () => {
    const { document } = parse(langlearnSrc);
    const gated = document.common.interactions.find(i => i.action.target?.existsGated);
    expect(gated).toBeDefined();
    expect(gated!.action.target!.name).toBe('レッスン開始ボタン');
  });
});
