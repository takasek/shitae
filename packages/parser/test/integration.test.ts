import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/index.js';

const battleSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/battle.shitae'), 'utf8');
const ecommerceSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/ecommerce.shitae'), 'utf8');
const musicSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/music.shitae'), 'utf8');
const deliverySrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/delivery.shitae'), 'utf8');
const langlearnSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/langlearn.shitae'), 'utf8');
const fleamarketMainSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/fleamarket/main.shitae'), 'utf8');
const fleamarketListingSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/fleamarket/listing.shitae'), 'utf8');
const fleamarketTradeSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/fleamarket/trade.shitae'), 'utf8');
const smarthomeMainSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/smarthome/main.shitae'), 'utf8');
const smarthomeDevicesSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/smarthome/devices.shitae'), 'utf8');
const smarthomeAutomationSrc = readFileSync(join(import.meta.dirname, '../../../docs/examples/smarthome/automation.shitae'), 'utf8');

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
    // 共有シート, 投稿編集, 検索, レビュー詳細, 住所編集
    expect(document.components).toHaveLength(12);
  });

  it('カート は singleton（#!）で 空／商品あり の 2 variants を持つ', () => {
    const { document } = parse(ecommerceSrc);
    const cart = document.components.find(c => c.name === 'カート');
    expect(cart).toBeDefined();
    expect(cart!.singleton).toBe(true);
    expect(cart!.variants.map(v => v.name)).toEqual(['空', '商品あり']);
  });

  it('set(カート##商品あり) / set(カート##空) の StateWrite を含む', () => {
    const { document } = parse(ecommerceSrc);
    const writes = document.components
      .flatMap(c => [...c.common.interactions, ...c.variants.flatMap(v => v.body.interactions)])
      .flatMap(i => i.results)
      .filter(r => r.body.kind === 'state')
      .map(r => (r.body.kind === 'state' ? r.body.target.variant : ''));
    expect(writes.sort()).toEqual(['商品あり', '空']);
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

  it('set(学習##ハート切れ) / set(学習##通常) / set(ストリークバッジ##達成) の StateWrite を含む', () => {
    const { document } = parse(langlearnSrc);
    const writes = document.components
      .flatMap(c => [...c.common.interactions, ...c.variants.flatMap(v => v.body.interactions)])
      .flatMap(i => i.results)
      .filter(r => r.body.kind === 'state')
      .map(r => (r.body.kind === 'state' ? r.body.target.variant : ''));
    expect(writes.sort()).toEqual(['ハート切れ', '通常', '達成']);
  });

  it('document common に presence gate 付き deep link を持つ（ADR-0015 の実例）', () => {
    const { document } = parse(langlearnSrc);
    const gated = document.common.interactions.find(i => i.action.target?.existsGated);
    expect(gated).toBeDefined();
    expect(gated!.action.target!.name).toBe('レッスン開始ボタン');
  });
});

describe('integration: examples/smarthome/*.shitae（モジュール分割・singleton overlay・module 修飾 set の実例。r4 stress-test smarthome プローブより昇格）', () => {
  it('main.shitae は import 2 件 + parse エラーなし', () => {
    const { document, diagnostics } = parse(smarthomeMainSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(document.imports.map(i => i.alias).sort()).toEqual(['automation', 'devices']);
  });

  it('devices.shitae は parse エラーなし・3 つの singleton component を持つ', () => {
    const { document, diagnostics } = parse(smarthomeDevicesSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const singletons = document.components.filter(c => c.singleton).map(c => c.name);
    expect(singletons.sort()).toEqual(['リビングエアコン', 'リビング照明', '寝室ドア鍵']);
  });

  it('automation.shitae は parse エラーなし・@wizard セッションの出口固定慣用句（exit(@wizard) ; push(...)）を持つ', () => {
    const { document, diagnostics } = parse(smarthomeAutomationSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const hasFixedExit = document.components
      .flatMap(c => [...c.common.interactions, ...c.variants.flatMap(v => v.body.interactions)])
      .some(i => i.results.some(r => r.body.kind === 'transition' && r.body.word === 'exit' && r.body.session?.name === 'wizard'));
    expect(hasFixedExit).toBe(true);
  });

  it('main.shitae の起動行は set(セキュリティバナー##在宅) ; show(セキュリティバナー) の分解形（singleton show(X##v) の巻き戻し回避。ADR-0021 B4）', () => {
    const { document } = parse(smarthomeMainSrc);
    const boot = document.components.find(c => c.name === '起動');
    expect(boot).toBeDefined();
    const results = boot!.common.interactions.flatMap(i => i.results);
    expect(results.some(r => r.body.kind === 'state' && r.body.target.variant === '在宅')).toBe(true);
    expect(results.some(r => r.body.kind === 'overlay' && r.body.verb === 'show' && r.body.target.variant === null)).toBe(true);
  });

  it('main.shitae の document common は module 修飾つき set（devices::X##オフライン）を持つ（ADR-0018 レキシカル解決の実例）', () => {
    const { document } = parse(smarthomeMainSrc);
    const writes = document.common.interactions
      .flatMap(i => i.results)
      .filter(r => r.body.kind === 'state')
      .map(r => (r.body.kind === 'state' ? r.body.target : null));
    expect(writes.every(w => w?.module === 'devices')).toBe(true);
    expect(writes).toHaveLength(3);
  });
});

describe('integration: examples/fleamarket/*.shitae（メルカリ風。タブ慣用句・module 修飾の要素行・singleton タブへの set・出口固定慣用句の実例）', () => {
  it('main.shitae は import 2 件 + parse エラーなし', () => {
    const { document, diagnostics } = parse(fleamarketMainSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(document.imports.map(i => i.alias).sort()).toEqual(['listing', 'trade']);
  });

  it('main.shitae の お知らせ は singleton（#!）で 未読なし／未読あり を持ち、document common の set が書き込む', () => {
    const { document } = parse(fleamarketMainSrc);
    const news = document.components.find(c => c.name === 'お知らせ');
    expect(news).toBeDefined();
    expect(news!.singleton).toBe(true);
    expect(news!.variants.map(v => v.name)).toEqual(['未読なし', '未読あり']);
    const write = document.common.interactions
      .flatMap(i => i.results)
      .find(r => r.body.kind === 'state');
    expect(write).toBeDefined();
    expect(write!.body.kind === 'state' && write!.body.target.name).toBe('お知らせ');
  });

  it('main.shitae の ホーム は module 修飾の要素行（*おすすめ: trade::商品カード）を持つ（ADR-0020 の実例）', () => {
    const { document } = parse(fleamarketMainSrc);
    const home = document.components.find(c => c.name === 'ホーム');
    expect(home).toBeDefined();
    const card = home!.common.elements.find(e => e.alias === 'おすすめ');
    expect(card).toBeDefined();
    expect(card!.collection).toBe(true);
    expect(card!.value.kind === 'ref' && card!.value.module).toBe('trade');
    expect(card!.value.kind === 'ref' && card!.value.name).toBe('商品カード');
  });

  it('listing.shitae は parse エラーなし・@listing の出口固定慣用句（exit(@listing)）を複数箇所に持つ', () => {
    const { document, diagnostics } = parse(fleamarketListingSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const exits = document.components
      .flatMap(c => [...c.common.interactions, ...c.variants.flatMap(v => v.body.interactions)])
      .flatMap(i => i.results)
      .filter(r => r.body.kind === 'transition' && r.body.word === 'exit' && r.body.session?.name === 'listing');
    expect(exits.length).toBeGreaterThanOrEqual(3);  // 閉じる・下書き保存・出品完了
  });

  it('trade.shitae は parse エラーなし・取引 が進行 4 variants を持つ', () => {
    const { document, diagnostics } = parse(fleamarketTradeSrc);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const deal = document.components.find(c => c.name === '取引');
    expect(deal).toBeDefined();
    expect(deal!.variants.map(v => v.name)).toEqual(['取引中', '発送済', '評価中', '取引完了']);
  });

  it('trade.shitae の 商品カード は無修飾 push(商品詳細) のデフォルト挙動を持つ（ADR-0018 レキシカル解決の実例）', () => {
    const { document } = parse(fleamarketTradeSrc);
    const card = document.components.find(c => c.name === '商品カード');
    expect(card).toBeDefined();
    const nav = card!.common.interactions
      .flatMap(i => i.results)
      .find(r => r.body.kind === 'transition' && r.body.word === 'push');
    expect(nav).toBeDefined();
    expect(nav!.body.kind === 'transition' && nav!.body.target?.kind === 'component' && nav!.body.target.name).toBe('商品詳細');
    expect(nav!.body.kind === 'transition' && nav!.body.target?.kind === 'component' && nav!.body.target.module).toBe(null);
  });
});
