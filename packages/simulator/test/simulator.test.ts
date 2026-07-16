import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
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
    expect(html).toContain('const SINGLETONS = new Set((DATA.singletons || []).map(s => skey(s.module, s.name)))');
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
    expect(html).toContain('sharedVariants.set(skey(module, name), variant)');
  });

  it('set: state result を singleton の共有レジストリ書き換えとして適用する（ADR-0014）', () => {
    const doc = parseOk(
      '#! 学習\n## 通常\nボタン\n## ハート切れ\n表示\n\n# 問題\n> 使い切る -> set(学習##ハート切れ)\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain("result.type === 'state'");
    expect(html).toContain('"type":"state"');
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

  function embeddedData(html: string): any {
    const m = html.match(/const DATA = (\{[\s\S]*\});\nconst app/);
    if (!m) throw new Error('embedded DATA not found');
    return JSON.parse(m[1]!);
  }

  // 埋め込み JS ランタイムを node:vm で実際に評価し、実行時の関数呼び出しで振る舞いを検証する。
  // 戻り値の context は同一 realm を共有するので、後続の vm.runInContext(code, context) で
  // トップレベルの let/function（overlays・overlayInteractions 等）へアクセスできる。
  function runSimulatorScript(html: string): vm.Context {
    const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
    if (!m) throw new Error('embedded script not found');
    const context = vm.createContext({
      document: {
        getElementById: () => ({ innerHTML: '', textContent: '', classList: { add() {}, remove() {} } }),
      },
      setTimeout: () => 0,
      clearTimeout: () => {},
      console,
    });
    vm.runInContext(m[1]!, context);
    return context;
  }

  it('ADR-0018 / M2: mod 定義の掲示中コンポーネントの無修飾 set は module:"mod" として埋め込まれる（r4 no-op からの挙動変更）', () => {
    const subDoc = parseOk(
      '#! 状態\n## 稼働\n本体\n## 停止\n本体\n\n# ミニ\n## 再生\n曲名\n> タップ(曲名) -> set(状態##停止)\n',
    );
    const mainDoc = parseOk('import mod as mod\n# ホーム\n> 出す -> show(mod::ミニ##再生)\n');
    const html = toSimulator(new Map([['main', mainDoc], ['mod', subDoc]]), 'main');
    const data = embeddedData(html);
    const inter = data.modules['mod'].components['ミニ'].variants['再生'].interactions[0];
    expect(inter.prelude[0]).toEqual({ type: 'state', component: '状態', module: 'mod', variant: '停止' });
  });

  it('ADR-0019: overlay 掲示中 component の裸 gate は掲示中 component 自身の表示 variant の実効 body で判定する（アクティブ画面の body は見ない）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 出す -> show(ミニ##再生)\n\n' +
        '# ミニ\n## 再生\n曲名\n> タップ(曲名?) -> push(プレイヤー)\n## 一時停止\n再開ボタン\n\n' +
        '# プレイヤー\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // アクティブ画面はホーム（曲名を持たない）。ミニを ## 再生（曲名を持つ）で掲示中 → gate on。
    const onActionTexts = JSON.parse(
      vm.runInContext(
        "overlays.set('ミニ', { variant: '再生', module: 'main' }); JSON.stringify(overlayInteractions('ミニ').map(i => i.actionText))",
        context,
      ),
    );
    expect(onActionTexts).toContain('タップ(曲名)');

    // ## 一時停止（曲名を持たない）を掲示中なら gate off。アクティブ画面（ホーム）の body は無関係。
    const offActionTexts = JSON.parse(
      vm.runInContext(
        "overlays.set('ミニ', { variant: '一時停止', module: 'main' }); JSON.stringify(overlayInteractions('ミニ').map(i => i.actionText))",
        context,
      ),
    );
    expect(offActionTexts).not.toContain('タップ(曲名)');
  });

  it('ADR-0019 regression: document common の裸 gate は ADR-0015 どおりアクティブ component の現在 variant で動的解決する（overlay 経路の変更で壊れていない）', () => {
    const doc = parseOk(
      '> 通知タップ(記事リンク?) -> push(記事詳細)\n\n' +
        '# ホーム\nロゴ\n\n' +
        '# 記事一覧\n記事リンク\n\n' +
        '# 記事詳細\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // アクティブ画面がホーム（記事リンクなし）→ gate off
    const homeTexts = JSON.parse(vm.runInContext('JSON.stringify(docCommonInteractions().map(i => i.actionText))', context));
    expect(homeTexts).not.toContain('通知タップ(記事リンク)');

    // goto で記事一覧（記事リンクあり）に移動 → gate on
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'goto', target: { module: 'main', component: '記事一覧', variant: null } })",
      context,
    );
    const listTexts = JSON.parse(vm.runInContext('JSON.stringify(docCommonInteractions().map(i => i.actionText))', context));
    expect(listTexts).toContain('通知タップ(記事リンク)');
  });
});
