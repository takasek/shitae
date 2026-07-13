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

  it('overlay: 掲示中 component の表示 variant を overlays に保持し帯に描画する', () => {
    const doc = parseOk(
      '# P\n> 再生 -> show(ミニプレイヤー##再生中)\n\n# ミニプレイヤー\n## 再生中\n曲名\n## 一時停止\n再開ボタン\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    // overlays は component名→{variant,module} の Map（show は上書き。SPEC「オーバーレイ」自己再 show）
    expect(html).toContain("overlays.set(result.component, { variant: result.variant, module: mod })");
    expect(html).toContain('function overlayVariant(');
  });

  it('overlay: 掲示中 component の interaction をクリック操作できる（A8）', () => {
    const doc = parseOk(
      '# P\n> 再生 -> show(ミニプレイヤー##再生中)\n\n# ミニプレイヤー\n## 再生中\n曲名\n> タップ(曲名) -> push(プレイヤー)\n\n# プレイヤー\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('function handleOverlayInteraction(');
    expect(html).toContain('function overlayInteractions(');
    expect(html).toContain('onclick="handleOverlayInteraction(');
  });

  it('singleton: 共有 variant レジストリを持ち、initial variant 解決とは別軸で参照する（ADR-0011）', () => {
    const doc = parseOk(
      '#! クーポン\n## 未受取\n> タップ(受け取る) -> goto(##受取済)\n## 受取済\n適用ボタン\n\n# ホーム\n要素\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('const SINGLETONS = new Set(DATA.singletons)');
    expect(html).toContain('let sharedVariants = new Map()');
    expect(html).toContain('function resolveEntryVariant(');
    expect(html).toContain('function displayVariant(');
  });

  it('singleton: goto(##v) は共有レジストリを書き換える（全所在に即時反映。ADR-0011）', () => {
    const doc = parseOk('#! クーポン\n## 未受取\n> タップ -> goto(##受取済)\n## 受取済\n適用ボタン\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('sharedVariants.set(');
  });

  it('3階層shadow: どの画面でも帯は現在画面でshadowされたdocument commonを除外する', () => {
    const doc = parseOk(
      '> タップ(戻る) -> exit(@x)\n\n# A\n戻る\n> タップ(戻る) -> back()\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('comp.docCommonInteractions');
    expect(html).toContain('comp.variants[variant]?.docCommonInteractions');
  });

  it('presence gate: gate 付き interaction を構造的 presence でフィルタする', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('function gateEnabled(');
    expect(html).toContain('.filter(gateEnabled)');
  });

  it('presence gate 手動トグル: member gate 対象の variant を選ぶ UI を持つ（ADR-0002 Consequence）', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"gateTargets"');
    expect(html).toContain('function setInstanceVariant(');
    expect(html).toContain('gate-panel');
    expect(html).toContain('sharedVariants.set(name, variant)');
  });

  it('presence gate 手動トグル: gate 対象が無ければパネルを出さない', () => {
    const doc = parseOk('# A\n要素\n> タップ(要素) -> back()\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"gateTargets":[]');
  });

  it('back(X) は wall を越えない（barrier 停止のロジックを含む）', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    // back(X) 走査ループが wall で break する（runtime 整合）
    expect(html).toContain('if (stack[i].wall) break;');
  });
});
