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

  it('document common を data に含め、操作一覧の document common カテゴリへ統合して描画する', () => {
    const doc = parseOk('> 通知をタップ -> push(詳細)\n\n# ホーム\nロゴ\n\n# 詳細\n本文\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"documentCommon"');
    expect(html).toContain('通知をタップ');
    expect(html).toContain('document common');
    const context = runSimulatorScript(html);
    vm.runInContext("handleInteraction('document', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('詳細');
  });

  it('switch を transition として扱う（effect 落ちしない）分岐が生成物に含まれる', () => {
    const doc = parseOk('# ホーム\n> タブ -> switch(検索, @s)\n\n# 検索\n欄\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain("word === 'switch'");
    expect(html).toContain('"word":"switch"');
  });

  it('overlay（show/hide）を overlay result body として埋め込み、掲示中カードとして描画できる', () => {
    const doc = parseOk('# P\n> 再生 -> show(ミニプレイヤー)\n> 停止 -> hide(ミニプレイヤー)\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"type":"overlay"');
    expect(html).toContain('"op":"show"');
    expect(html).toContain('overlay-card');
    expect(html).not.toContain('overlay-bar');
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
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニプレイヤー', module: 'main', variant: '再生中' }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('onclick="handleOverlayInteraction(');
    vm.runInContext("handleOverlayInteraction(0, 'variant', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('プレイヤー');
  });

  it('掲示中カード: 本体と同形（タイトル・variant表示・elements・操作一覧カテゴリ）で描画され、document common カテゴリは持たない', () => {
    const doc = parseOk(
      '> 通知 -> push(受信箱)\n\n' +
        '# ホーム\nロゴ\n> 出す -> show(ミニ)\n\n' +
        '# ミニ\n共通要素\n> 共通操作 -> push(共通先)\n\n' +
        '# 共通先\n本体\n\n# 受信箱\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: null }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('掲示中');
    expect(appHtml).toContain('ミニ');
    expect(appHtml).toContain('共通要素');
    expect(appHtml).toContain('共通操作');
    // document common は本体（ホーム）にのみ現れ、掲示中カードには複製されない
    // （document common の発火判定はアクティブ画面基準 — ADR-0015 — であり掲示中カードの所属ではない）
    expect((appHtml.match(/document common/g) ?? []).length).toBe(1);
  });

  it('掲示中カード: 複数ラベル操作もラベル横並びで選んだ choice だけが実行される（overlay 側の暫定・先頭固定を解消）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 出す -> show(ミニ)\n\n' +
        '# ミニ\n曲名\n> ガチャ ->\n>     [当たり] push(景品)\n>     [ハズレ] push(残念)\n\n' +
        '# 景品\n本体\n\n# 残念\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: null }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('[当たり]');
    expect(appHtml).toContain('[ハズレ]');

    vm.runInContext("handleOverlayInteraction(0, 'component', 0, 1)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('残念');
    const stackComponents = JSON.parse(
      vm.runInContext('JSON.stringify(stack.map(f => f.component))', context),
    );
    expect(stackComponents).not.toContain('景品');
  });

  it('掲示中カード: interaction 実行の遷移相対解決はアクティブフレーム基準のまま（overlay 自身を現在地にしない）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 出す -> show(ミニ##再生)\n\n' +
        '# ミニ\n## 再生\n曲名\n> タップ(曲名) -> push(プレイヤー)\n\n' +
        '# プレイヤー\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: '再生' }); render()",
      context,
    );
    vm.runInContext("handleOverlayInteraction(0, 'variant', 0, 0)", context);
    const stackComponents = JSON.parse(
      vm.runInContext('JSON.stringify(stack.map(f => f.component))', context),
    );
    // アクティブフレーム（ホーム）基準で push されるため、ミニ自身はスタックに積まれない
    expect(stackComponents).toEqual(['ホーム', 'プレイヤー']);
  });

  it('掲示中カードの onclick は component 名を直接埋め込まず表示順インデックスで参照する（名前が \' や " を含んでも onclick 属性を壊さない。旧 handleOverlayInteraction の quote 衝突バグを根治）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 出す -> show(名"前)\n\n' +
        '# 名"前\n曲名\n> タップ(曲名) -> push(プレイヤー)\n\n' +
        '# プレイヤー\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: '名\\\"前', module: 'main', variant: null }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    // 旧バグ: JSON.stringify(name) が二重引用符区切り文字列を吐き onclick="..." の
    // 属性値が途中終端する（onclick="handleOverlayInteraction(" で切れる）
    expect(appHtml).not.toContain('onclick="handleOverlayInteraction("');
    // 新実装: component 名でなく表示順インデックス（数値）で参照するため属性は壊れない
    expect(appHtml).toMatch(/onclick="handleOverlayInteraction\(0,'(variant|component)',\d+,\d+\)"/);
    vm.runInContext("handleOverlayInteraction(0, 'component', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('プレイヤー');
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
    // ADR-0019: gateEnabled が hostCtx を受けるようになったため、Array#filter の
    // (item, index, array) 引数漏れを避けて単項呼び出しに包む（simulator.ts 参照）。
    expect(html).toContain('list.filter((inter) => gateEnabled(inter))');
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

  it('presence gate 手動トグル: gate 対象が無くても見出し・説明は常時表示し、開くと empty state を出す（UX評価3.5、Task 12 受入基準d）', () => {
    const doc = parseOk('# A\n要素\n> タップ(要素) -> back()\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('"gateTargets":[]');
    const context = runSimulatorScript(html);
    const beforeToggleHtml = vm.runInContext('app.innerHTML', context);
    // 対象ゼロでも見出し・説明文は常時表示される（無言の空白をなくす。旧実装は
    // gateTargetsWithVariants.length===0 のとき何も描画せず右ペイン全体が白紙だった）
    expect(beforeToggleHtml).toContain('画面外 component の姿切替（gate 試験用）');
    expect(beforeToggleHtml).toContain('gate-panel-desc');

    vm.runInContext('toggleGatePanel(); render()', context);
    const afterToggleHtml = vm.runInContext('app.innerHTML', context);
    // 開くと「試験対象なし」の empty state が出る（読み込み失敗・レイアウト崩壊との誤解を防ぐ）
    expect(afterToggleHtml).toContain('gate-panel-empty');
    expect(afterToggleHtml).toContain('presence gate');
    expect(afterToggleHtml).toContain('参照先はありません');
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
  // getElementById は id ごとにダミー要素をキャッシュする（同じ id への複数回の呼び出しが
  // 同一オブジェクトを返す——hover プレビューのような render() を経由しない局所 DOM 更新を
  // vm テストから観測できるようにするため）。
  function runSimulatorScript(html: string): vm.Context {
    const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
    if (!m) throw new Error('embedded script not found');
    const elements = new Map<string, { innerHTML: string; textContent: string; classList: { add(): void; remove(): void } }>();
    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) {
            elements.set(id, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} } });
          }
          return elements.get(id);
        },
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

  it('統合ログ: 起動時に初期エントリが1件積まれ、kindがtransitionでsnapshotが現在状態を持つ（toast は全廃）', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('showToast');
    expect(html).not.toContain('class="toast"');
    const context = runSimulatorScript(html);
    expect(vm.runInContext('timeline.length', context)).toBe(1);
    expect(vm.runInContext('timeline[0].kind', context)).toBe('transition');
    const stackLen = vm.runInContext('timeline[0].snapshot.stack.length', context);
    expect(stackLen).toBe(1);
  });

  it('統合ログ: push 2回で起動+2件、timeline[1]タップで全状態(stack・sharedVariants・overlays)が巻き戻る（受入基準b: 未来分は ghost として残り truncate されない）', () => {
    const doc = parseOk(
      '# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n> 結果へ -> push(結果)\n\n# 結果\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '結果', variant: null } })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('cursor', context)).toBe(2);
    expect(vm.runInContext('currentFrame().component', context)).toBe('結果');

    vm.runInContext('jumpToTimeline(1)', context);
    // ghost 巻き戻し: 未来分（結果）は削除されず timeline に残る。現在地は cursor が示す
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('cursor', context)).toBe(1);
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');
    expect(vm.runInContext('stack.length', context)).toBe(2);
  });

  it('ゴースト巻き戻し: 過去へ巻き戻した後、ghost だったエントリをクリックすると redo できる（受入基準c）', () => {
    const doc = parseOk(
      '# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n> 結果へ -> push(結果)\n\n# 結果\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '結果', variant: null } })",
      context,
    );

    vm.runInContext('jumpToTimeline(1)', context); // 検索まで戻る。「結果」は ghost
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');

    vm.runInContext('jumpToTimeline(2)', context); // ghost をクリックして redo
    expect(vm.runInContext('cursor', context)).toBe(2);
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context)).toBe('結果');
    expect(vm.runInContext('stack.length', context)).toBe(3);
  });

  it('ゴースト巻き戻し: ghost 保持中に新しい操作を行うと ghost が消え新エントリが積まれる（受入基準d）', () => {
    const doc = parseOk(
      '# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n> 結果へ -> push(結果)\n\n# 結果\n本体\n\n# 設定\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '結果', variant: null } })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(3);

    vm.runInContext('jumpToTimeline(1)', context); // 検索まで戻る。「結果」は ghost として残る
    expect(vm.runInContext('timeline.length', context)).toBe(3);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '設定', variant: null } })",
      context,
    );
    // ghost だった「結果」は消え、新エントリ「設定」に置き換わる（総数は変わらず3のまま）
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('cursor', context)).toBe(2);
    expect(vm.runInContext('currentFrame().component', context)).toBe('設定');
    const labels = JSON.parse(vm.runInContext('JSON.stringify(timeline.map(e => e.label))', context));
    expect(labels).not.toContain('push → 結果');
    expect(labels[2]).toBe('push → 設定');
  });

  it('統合ログ: effect はkind: event種別で1件追加され、遷移エントリと同じ配列に時系列で並ぶ', () => {
    const doc = parseOk('# ホーム\n> 押す -> いいねしました\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    const lenBefore = vm.runInContext('timeline.length', context);
    vm.runInContext("applyTransition({ type: 'effect', text: 'いいねしました' })", context);

    expect(vm.runInContext('timeline.length', context)).toBe(lenBefore + 1);
    expect(vm.runInContext('timeline[timeline.length - 1].kind', context)).toBe('event');
    const timelineJson = JSON.parse(vm.runInContext('JSON.stringify(timeline)', context));
    expect(timelineJson.some((e: any) => e.label.includes('いいねしました'))).toBe(true);
  });

  it('戻るボタン相当の関数(goBack): wall で失敗しevent種別の警告エントリが追記、成功時にtransition種別の遷移エントリが追記される（back のtimeline追記化。旧pop仕様は全廃 — Task 7）', () => {
    const doc = parseOk('# ホーム\n> モーダル -> present(モーダル)\n\n# モーダル\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: 'モーダル', variant: null } })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(2);

    // モーダルは present（wall）で積まれたため goBack() は阻まれるが、警告は event エントリとして統合ログへ追記される
    vm.runInContext('goBack()', context);
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('timeline[timeline.length - 1].kind', context)).toBe('event');
    const warnLabel = vm.runInContext('timeline[timeline.length - 1].label', context);
    expect(warnLabel).toContain('壁');

    // push（非 wall）した場合は goBack() 成功、統合ログ末尾に back の transition エントリが追記される（pop しない）
    const doc2 = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html2 = toSimulator(new Map([['main', doc2]]), 'main');
    const context2 = runSimulatorScript(html2);
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context2,
    );
    expect(vm.runInContext('timeline.length', context2)).toBe(2);
    vm.runInContext('goBack()', context2);
    expect(vm.runInContext('timeline.length', context2)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context2)).toBe('ホーム');
    const lastEntry = JSON.parse(vm.runInContext('JSON.stringify(timeline[timeline.length - 1])', context2));
    expect(lastEntry.kind).toBe('transition');
    expect(lastEntry.label).toBe('back → ホーム');
  });

  it('画面内 back() 成功で統合ログに transition エントリが1件追加される（末尾除去 traceLog.pop() は全廃 — Task 7 受入基準a）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(2);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'back', target: null, session: null })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context)).toBe('ホーム');
  });

  it('back(X) の多段巻き戻しも1エントリ追記に一本化され「末尾＝現在地」不変条件が保たれる（Task 7 旧 M1 根治）', () => {
    const doc = parseOk(
      '# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n> 詳細へ -> push(詳細)\n\n# 詳細\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '詳細', variant: null } })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(3);

    // ホームまで2段巻き戻す back(X) は、timeline を2件 pop するのでなく1件だけ追記する
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'back', target: { module: 'main', component: 'ホーム', variant: null }, session: null })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(4);
    expect(vm.runInContext('currentFrame().component', context)).toBe('ホーム');
    expect(vm.runInContext('stack.length', context)).toBe(1);
    const lastEntry = JSON.parse(vm.runInContext('JSON.stringify(timeline[timeline.length - 1])', context));
    // 末尾＝現在地: 追記された snapshot の stack もホーム1件に一致する
    expect(lastEntry.kind).toBe('transition');
    expect(lastEntry.snapshot.stack.length).toBe(1);
    expect(lastEntry.snapshot.stack[0].component).toBe('ホーム');
  });

  it('統合ログ: singleton の set による event エントリへ巻き戻すと sharedVariants が復元される（ADR-0014・受入基準e）', () => {
    const doc = parseOk(
      '#! 学習\n## 通常\nボタン\n## ハート切れ\n表示\n\n# 問題\n> 使い切る -> set(学習##ハート切れ)\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'state', component: '学習', module: 'main', variant: 'ハート切れ' })",
      context,
    );
    expect(vm.runInContext('timeline.length', context)).toBe(2);
    expect(vm.runInContext('timeline[1].kind', context)).toBe('event');
    expect(vm.runInContext("sharedVariants.get(skey('main', '学習'))", context)).toBe('ハート切れ');

    // 起動時点（set 前）へ巻き戻すと共有レジストリから消える
    vm.runInContext('jumpToTimeline(0)', context);
    expect(vm.runInContext("sharedVariants.has(skey('main', '学習'))", context)).toBe(false);
  });

  it('統合ログ: show/hide による event エントリへ巻き戻すと overlays が復元される（受入基準e）', () => {
    const doc = parseOk('# P\n> 再生 -> show(ミニプレイヤー)\n> 停止 -> hide(ミニプレイヤー)\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニプレイヤー', module: 'main', variant: null })",
      context,
    );
    expect(vm.runInContext('overlays.size', context)).toBe(1);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'hide', component: 'ミニプレイヤー' })",
      context,
    );
    expect(vm.runInContext('overlays.size', context)).toBe(0);
    expect(vm.runInContext('timeline.length', context)).toBe(3);
    expect(vm.runInContext('timeline[1].kind', context)).toBe('event');
    expect(vm.runInContext('timeline[2].kind', context)).toBe('event');

    vm.runInContext('jumpToTimeline(1)', context); // show 時点へ戻る
    expect(vm.runInContext('overlays.size', context)).toBe(1);
  });

  it('イベントトグル: 「イベントを表示」チェックボックスを持ち、既定でON（event行を表示）（受入基準f）', () => {
    const doc = parseOk('# ホーム\n> 押す -> いいねしました\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('イベントを表示');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('function toggleShowEvents(');
    const context = runSimulatorScript(html);
    expect(vm.runInContext('showEvents', context)).toBe(true);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('checked');
  });

  it('イベントトグル: OFF にすると event 行は非表示になるが transition 行は常時表示、データは保持される（受入基準f）', () => {
    const doc = parseOk(
      '# ホーム\n> 押す -> いいねしました\n> 検索へ -> push(検索)\n\n# 検索\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext("applyTransition({ type: 'effect', text: 'いいねしました' })", context);
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } }); render()",
      context,
    );

    const shownHtml = vm.runInContext('app.innerHTML', context);
    expect(shownHtml).toContain('effect: いいねしました');
    expect(shownHtml).toContain('push → 検索');

    vm.runInContext('toggleShowEvents(); render()', context);
    expect(vm.runInContext('showEvents', context)).toBe(false);
    const hiddenHtml = vm.runInContext('app.innerHTML', context);
    expect(hiddenHtml).not.toContain('effect: いいねしました'); // event 行は非表示
    expect(hiddenHtml).toContain('push → 検索'); // transition 行は常時表示

    // データ自体は保持されている（トグルは表示のみ）
    const kinds = JSON.parse(vm.runInContext('JSON.stringify(timeline.map(e => e.kind))', context));
    expect(kinds).toContain('event');
    expect(vm.runInContext('timeline.length', context)).toBe(3);
  });

  it('イベントトグル: cursor が event エントリを指すときは showEvents OFF でも .current は描画される（現在位置表示を失わない）', () => {
    const doc = parseOk('# ホーム\n> 押す -> いいねしました\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext("applyTransition({ type: 'effect', text: 'いいねしました' }); render()", context);

    expect(vm.runInContext('showEvents', context)).toBe(true);
    const shownHtml = vm.runInContext('app.innerHTML', context);
    expect(shownHtml).toContain('timeline-item-event');
    expect(shownHtml).toContain('current');

    vm.runInContext('toggleShowEvents(); render()', context);
    expect(vm.runInContext('showEvents', context)).toBe(false);
    const hiddenHtml = vm.runInContext('app.innerHTML', context);
    expect(hiddenHtml).toContain('timeline-item-event');
    expect(hiddenHtml).toContain('current');
  });

  it('複数ラベル操作は全ラベルを横並びボタンで提示し、ラベル指定クリックで対応 results だけが走る', () => {
    const doc = parseOk(
      '# ホーム\n> ガチャ ->\n>     [当たり] push(景品)\n>     [ハズレ] push(残念)\n\n# 景品\n本体\n\n# 残念\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('[当たり]');
    expect(appHtml).toContain('[ハズレ]');

    vm.runInContext("handleInteraction('component', 0, 1)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('残念');
    // regression guard: 全 choice が走ってしまう退行では最後の push（残念）が勝ち上の
    // アサートは素通りする。選んだ choice「だけ」が走ったことを timeline 件数と
    // stack の中身（[当たり] 側の 景品 frame が積まれていないこと）で縛る。
    expect(vm.runInContext('timeline.length', context)).toBe(2);
    const stackComponents = JSON.parse(
      vm.runInContext('JSON.stringify(stack.map(f => f.component))', context),
    );
    expect(stackComponents).not.toContain('景品');
  });

  it('ラベル無し操作（choices 空）は [TRUE] ラベル1つのボタンになり prelude のみ実行する', () => {
    const doc = parseOk('# ホーム\n> タップ -> push(次)\n\n# 次\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('[TRUE]');
    vm.runInContext("handleInteraction('component', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('次');
  });

  it('操作一覧: scope はカテゴリ見出しでなく各操作行のバッジで示す（variant固有/component common/document common の3種。Task 8 受入基準d）', () => {
    const doc = parseOk(
      '> 通知 -> push(受信箱)\n\n' +
        '# ホーム\n> 共通操作 -> push(共通先)\n## 通常\n姿要素\n> 姿操作 -> push(詳細)\n\n' +
        '# 詳細\n本体\n\n# 共通先\n本体\n\n# 受信箱\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // カテゴリ <details> ではなく行ごとのバッジ表示
    expect(appHtml).not.toContain('action-category');
    expect(appHtml).toContain('scope-badge');
    expect(appHtml).toContain('variant固有');
    expect(appHtml).toContain('component common');
    expect(appHtml).toContain('document common');
    expect(appHtml).toContain('姿操作');
    expect(appHtml).toContain('共通操作');
    expect(appHtml).toContain('通知');
  });

  it('要素の階層表示: ref を持つ要素は参照先 component の中身（commonElements + 現在 variant）を <details open> で入れ子展開する（Task 8 受入基準a）', () => {
    const doc = parseOk('# ホーム\nログインフォーム\n\n# ログインフォーム\nID入力\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('ログインフォーム');
    expect(appHtml).toMatch(/<details open class="element-hierarchy">/);
    expect(appHtml).toContain('ID入力');
  });

  it('要素の階層表示: variant を持つ参照先は sharedVariants → initialVariant の順で解決した variant の elements を展開する（Task 8）', () => {
    const doc = parseOk(
      '# ホーム\n詳細\n\n# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    // sharedVariants 未設定 → initialVariant（読込中）の中身が展開される
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('スピナー');
    expect(appHtml).not.toContain('コンテンツ');

    // sharedVariants に「表示」を設定すると、展開はそちらへ追随する
    vm.runInContext("sharedVariants.set(skey('main', '詳細'), '表示'); render()", context);
    const afterHtml = vm.runInContext('app.innerHTML', context);
    expect(afterHtml).toContain('コンテンツ');
  });

  it('要素の階層表示: 循環参照は展開経路上の (module,name) 再訪で打ち切り「（循環）」を示す（無限展開しない。Task 8 受入基準b）', () => {
    const doc = parseOk('# A\nB\n\n# B\nA\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    // 循環があっても render() が有限時間で完了し、循環を示す表記が出ること自体がガードの証跡
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('（循環）');
  });

  it('操作の対象紐付け: action.target がトップレベル要素の表示名に一致する操作はその要素行の直下に、不一致・対象なしはフラットリストに出る（Task 8 受入基準c）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n他要素\n> タップ(ロゴ) -> push(設定)\n> 押す -> push(次)\n\n' +
        '# 設定\n本体\n\n# 次\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);

    const logoIdx = appHtml.indexOf('>ロゴ<');
    const attachedIdx = appHtml.indexOf('タップ(ロゴ)');
    const otherElIdx = appHtml.indexOf('>他要素<');
    const flatIdx = appHtml.indexOf('押す');
    // 対象一致（タップ(ロゴ)）は ロゴ 要素行の直下（次の要素行より前）に紐付けて出る
    expect(logoIdx).toBeGreaterThan(-1);
    expect(attachedIdx).toBeGreaterThan(logoIdx);
    expect(attachedIdx).toBeLessThan(otherElIdx);
    // 対象なし（押す）は要素より後のフラットリストに出る
    expect(flatIdx).toBeGreaterThan(otherElIdx);

    vm.runInContext("handleInteraction('component', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('設定');
  });

  it('操作の対象紐付け: onclick は scope 固定キー + gate フィルタ済みリスト内インデックスを参照し、描画とハンドラでずれない（Task 8）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 押す(非表示要素?) -> push(A)\n> タップ(ロゴ) -> push(設定)\n\n' +
        '# 設定\n本体\n\n# A\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // 押す(非表示要素?) は gate off（ホームの実効 body に非表示要素が無い）でフィルタされ、
    // フィルタ済み component リストは [タップ(ロゴ)] のみ——描画された onclick の idx は 0
    expect(appHtml).not.toContain('押す');
    const m = appHtml.match(/onclick="(handleInteraction\('component',\d+,\d+\))"/);
    expect(m).not.toBeNull();
    // 描画された onclick をそのまま実行すると、紐付け表示された タップ(ロゴ) が発火して 設定 へ遷移する
    vm.runInContext(m![1]!, context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('設定');
  });

  it('掲示中カード: 要素の階層展開・対象紐付け・scope バッジが本体と同じ描画経路で効く（Task 8 本体・掲示中共通）', () => {
    const doc = parseOk(
      '# ホーム\nロゴ\n> 出す -> show(ミニ)\n\n' +
        '# ミニ\n曲名\n中身\n> タップ(曲名) -> push(プレイヤー)\n\n' +
        '# 中身\n詳細行\n\n# プレイヤー\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: null }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    const overlayIdx = appHtml.indexOf('overlay-card');
    expect(overlayIdx).toBeGreaterThan(-1);
    const overlaySection = appHtml.slice(overlayIdx);
    // 中身（定義済み component への参照）は掲示中カード内でも入れ子展開される
    expect(overlaySection).toContain('element-hierarchy');
    expect(overlaySection).toContain('詳細行');
    // タップ(曲名) は 曲名 要素行の直下に紐付き、scope バッジを持つ
    const nameIdx = overlaySection.indexOf('>曲名<');
    const attachedIdx = overlaySection.indexOf('タップ(曲名)');
    expect(nameIdx).toBeGreaterThan(-1);
    expect(attachedIdx).toBeGreaterThan(nameIdx);
    expect(overlaySection).toContain('scope-badge');
    // 紐付け表示された操作もクリックで実行できる（アクティブフレーム基準の遷移は不変）
    vm.runInContext("handleOverlayInteraction(0, 'component', 0, 0)", context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('プレイヤー');
  });

  it('choice-chip の onclick は scope を単一引用符の JS 文字列リテラルとして埋め込み onclick 属性を壊さない', () => {
    const doc = parseOk(
      '> 通知 -> push(受信箱)\n\n' +
        '# ホーム\n> 共通操作 -> push(共通先)\n## 通常\n姿要素\n> 姿操作 -> push(詳細)\n\n' +
        '# 詳細\n本体\n\n# 共通先\n本体\n\n# 受信箱\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // JSON.stringify(scope) は "variant" のような二重引用符区切り文字列を吐く。
    // onclick="..." は二重引用符区切り属性のため、途中の " で属性値が切れて壊れる。
    expect(appHtml).not.toContain('onclick="handleInteraction("');
    expect(appHtml).toContain("onclick=\"handleInteraction('variant'");
    expect(appHtml).toContain("onclick=\"handleInteraction('component'");
    expect(appHtml).toContain("onclick=\"handleInteraction('document'");
  });

  it('存在しない scope のバッジ表記は出ない（component 操作だけなら variant固有・document common の文字は現れない）', () => {
    const doc = parseOk('# ホーム\n> 押す -> push(次)\n\n# 次\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).not.toContain('variant固有');
    expect(appHtml).not.toContain('document common');
  });

  it('pendingChoice / choice-panel / handleChoice 機構を廃止した', () => {
    const doc = parseOk('# ホーム\n> 押す -> push(次)\n\n# 次\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('pendingChoice');
    expect(html).not.toContain('choice-panel');
    expect(html).not.toContain('function handleChoice(');
  });

  it('戻れない判定: stack長1またはwallのとき戻るボタンをDOMから消す(disabledでなく非描画)', () => {
    const doc = parseOk('# ホーム\n> モーダル -> present(モーダル)\n\n# モーダル\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('back-btn:disabled');
    const context = runSimulatorScript(html);

    // stack 長 1 の初期状態では戻るボタンが描画されない
    expect(vm.runInContext('app.innerHTML', context)).not.toContain('back-btn');

    // present で wall フレームを積んでも、wall のため戻るボタンは描画されない
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: 'モーダル', variant: null } }); render()",
      context,
    );
    expect(vm.runInContext('stack.length', context)).toBe(2);
    expect(vm.runInContext('app.innerHTML', context)).not.toContain('back-btn');
  });

  it('layoutGraph: entry component を rank 0 とし、エッジに沿って BFS で rank を割り当てる', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const nodes = [
      { module: 'main', name: 'A' },
      { module: 'main', name: 'B' },
      { module: 'main', name: 'C' },
    ];
    const edges = [
      { from: { module: 'main', name: 'A' }, to: { module: 'main', name: 'B' } },
      { from: { module: 'main', name: 'B' }, to: { module: 'main', name: 'C' } },
    ];
    const layout = JSON.parse(
      vm.runInContext(
        `JSON.stringify(layoutGraph(${JSON.stringify(nodes)}, ${JSON.stringify(edges)}, 'main', 'A'))`,
        context,
      ),
    );
    const rankOf = (name: string) => layout.find((n: any) => n.name === name).rank;
    expect(rankOf('A')).toBe(0);
    expect(rankOf('B')).toBe(1);
    expect(rankOf('C')).toBe(2);
  });

  it('layoutGraph: エッジで到達しないノードは最終 rank の次にまとめる', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const nodes = [
      { module: 'main', name: 'A' },
      { module: 'main', name: 'B' },
      { module: 'main', name: 'D' }, // 孤立ノード（エッジで到達しない）
    ];
    const edges = [{ from: { module: 'main', name: 'A' }, to: { module: 'main', name: 'B' } }];
    const layout = JSON.parse(
      vm.runInContext(
        `JSON.stringify(layoutGraph(${JSON.stringify(nodes)}, ${JSON.stringify(edges)}, 'main', 'A'))`,
        context,
      ),
    );
    const rankOf = (name: string) => layout.find((n: any) => n.name === name).rank;
    expect(rankOf('A')).toBe(0);
    expect(rankOf('B')).toBe(1);
    expect(rankOf('D')).toBe(2); // maxRank(=1) の次にまとめる
  });

  it('layoutGraph: rank 内順序を前 rank の隣接ノードの平均位置（barycenter）で 1 パス整列する', () => {
    const doc = parseOk('# A\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    // 定義順は P が Q より先。X(order0)→Q、Y(order1)→P という隣接関係により
    // barycenter 整列後は Q（親 X の位置0）が P（親 Y の位置1）より先に来るはず。
    const nodes = [
      { module: 'main', name: 'A' },
      { module: 'main', name: 'X' },
      { module: 'main', name: 'Y' },
      { module: 'main', name: 'P' },
      { module: 'main', name: 'Q' },
    ];
    const edges = [
      { from: { module: 'main', name: 'A' }, to: { module: 'main', name: 'X' } },
      { from: { module: 'main', name: 'A' }, to: { module: 'main', name: 'Y' } },
      { from: { module: 'main', name: 'Y' }, to: { module: 'main', name: 'P' } },
      { from: { module: 'main', name: 'X' }, to: { module: 'main', name: 'Q' } },
    ];
    const layout = JSON.parse(
      vm.runInContext(
        `JSON.stringify(layoutGraph(${JSON.stringify(nodes)}, ${JSON.stringify(edges)}, 'main', 'A'))`,
        context,
      ),
    );
    const orderOf = (name: string) => layout.find((n: any) => n.name === name).order;
    expect(orderOf('Q')).toBeLessThan(orderOf('P'));
  });

  it('遷移マップ: DATA.graph を dot 風レイヤード SVG として描画する（rect + component 名テキスト）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('<svg');
    expect(appHtml).toContain('ホーム');
    expect(appHtml).toContain('検索');
  });

  it('遷移マップ: ノードの hover 属性は component 名でなく配列インデックスで参照する（quote 衝突を避ける）', () => {
    const doc = parseOk('# 名"前\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // 旧 handleOverlayInteraction 系と同型の壊れ方（属性値が component 名の途中で終端）が起きていないことを保証する
    expect(appHtml).not.toContain('onmouseenter="showNodePreview("');
    expect(appHtml).toMatch(/onmouseenter="showNodePreview\(\d+\)"/);
    expect(appHtml).toContain('onmouseleave="hideNodePreview()"');
  });

  it('遷移マップ: 閲覧専用化のため gotoNode 関数も onclick 属性も存在しない（設計者確定事項 2026-07-19）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('function gotoNode(');
    expect(html).not.toContain('onclick="gotoNode');
    const context = runSimulatorScript(html);
    expect(vm.runInContext("typeof gotoNode", context)).toBe('undefined');
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).not.toMatch(/<g class="graph-node[^"]*" onclick=/);
  });

  it('遷移マップ: 現在の画面.本体に対応するノードがハイライトされ、遷移後に追随する', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // 起動直後は entry component（ホーム）のノードがハイライトされる
    const beforeHtml = vm.runInContext('app.innerHTML', context);
    const nodeTags = [...beforeHtml.matchAll(/<g class="([^"]*)"[^>]*>[\s\S]*?<\/g>/g)];
    const homeTag = nodeTags.find((m) => beforeHtml.slice(m.index, m.index! + m[0].length).includes('ホーム'));
    const searchTag = nodeTags.find((m) => beforeHtml.slice(m.index, m.index! + m[0].length).includes('検索'));
    expect(homeTag![1]).toMatch(/graph-node-current/);
    expect(searchTag![1]).not.toMatch(/graph-node-current/);

    // push(検索) で遷移すると、ハイライトは検索ノードへ追随する
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } }); render()",
      context,
    );
    const afterHtml = vm.runInContext('app.innerHTML', context);
    const afterTags = [...afterHtml.matchAll(/<g class="([^"]*)"[^>]*>[\s\S]*?<\/g>/g)];
    const homeTagAfter = afterTags.find((m) => afterHtml.slice(m.index, m.index! + m[0].length).includes('ホーム'));
    const searchTagAfter = afterTags.find((m) => afterHtml.slice(m.index, m.index! + m[0].length).includes('検索'));
    expect(homeTagAfter![1]).not.toMatch(/graph-node-current/);
    expect(searchTagAfter![1]).toMatch(/graph-node-current/);
  });

  it('遷移マップ: ノード hover でプレビュー領域に module・elements・variant 一覧を表示し、外れたら消える', () => {
    const doc = parseOk('# ホーム\n共通要素\n## 通常\n専用A\n## 特殊\n専用B\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext('showNodePreview(0)', context);
    const previewHtml = vm.runInContext("document.getElementById('graph-preview').innerHTML", context);
    expect(previewHtml).toContain('ホーム');
    expect(previewHtml).toContain('main');
    expect(previewHtml).toContain('共通要素');
    expect(previewHtml).toContain('通常');
    expect(previewHtml).toContain('特殊');

    vm.runInContext('hideNodePreview()', context);
    const afterHide = vm.runInContext("document.getElementById('graph-preview').innerHTML", context);
    expect(afterHide).toBe('');
  });

  it('遷移マップ: <details> 折り畳みを廃止し常時表示になった（設計者確定事項 2026-07-19）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('graphPanelOpen');
    expect(html).not.toContain('ontoggle');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // 要素階層の <details>（element-hierarchy。Task 8）は別機能として残るため graph 専用の details 廃止に絞って縛る
    expect(appHtml).not.toMatch(/<details[^>]*class="graph-panel"/);
    expect(appHtml).not.toContain('graph-panel-toggle');
    // details でなくとも SVG 自体は常に描画されている
    expect(appHtml).toContain('<svg');
  });

  it('3 ペインレイアウト: 全幅グリッドで #app の max-width が廃止され、左トレース・中央画面+マップ・右イベント+gate の構造を持つ（受入基準c）', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('max-width: 480px');
    expect(html).toContain('grid-template-columns');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);

    // 左: スタック + 統合ログ
    const traceIdx = appHtml.indexOf('pane-trace');
    expect(traceIdx).toBeGreaterThan(-1);
    // 中央: 現在の画面 + 遷移マップ
    const centerIdx = appHtml.indexOf('pane-center');
    expect(centerIdx).toBeGreaterThan(-1);
    // 右: gate パネルのみ（Task 10 でイベントログペインを統合ログへ吸収）
    const eventsIdx = appHtml.indexOf('pane-events');
    expect(eventsIdx).toBeGreaterThan(-1);
    // 左→中央→右の順で DOM に現れる
    expect(traceIdx).toBeLessThan(centerIdx);
    expect(centerIdx).toBeLessThan(eventsIdx);

    const centerSection = appHtml.slice(centerIdx, eventsIdx);
    const screenIdx = centerSection.indexOf('現在の画面');
    const graphIdx = centerSection.indexOf('遷移マップ');
    expect(screenIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(-1);
    expect(screenIdx).toBeLessThan(graphIdx); // 中央上=画面、中央下=マップ

    const eventsSection = appHtml.slice(eventsIdx);
    const gatePanelIdx = eventsSection.indexOf('gate-panel');
    expect(gatePanelIdx).toBeGreaterThan(-1);
    // 統合ログは右ペインでなく左ペインにある
    expect(eventsSection).not.toContain('timeline-log');
  });

  it('中央ペイン: 現在の画面と遷移マップが独立スクロール領域に分かれる（Task 9 受入基準a）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    // pane-center 自身は外側スクロールを持たず（.pane の overflow-y: auto を上書き）、
    // grid rows で 2 領域に分割する——画面カードの高さ変化が遷移マップの位置に影響しないため。
    const centerRuleMatch = html.match(/\.pane-center\s*\{[^}]*\}/);
    expect(centerRuleMatch).not.toBeNull();
    expect(centerRuleMatch![0]).toContain('grid-template-rows');
    expect(centerRuleMatch![0]).toMatch(/overflow:\s*hidden/);
    expect(centerRuleMatch![0]).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
    // screen-section と graph-section がそれぞれ自前のスクロール領域を持つ（min-height: 0 で
    // grid item のはみ出しを防ぎ overflow-y: auto を効かせる）
    const screenRuleMatch = html.match(/\.screen-section\s*\{[^}]*\}/);
    const graphRuleMatch = html.match(/\.graph-section\s*\{[^}]*\}/);
    expect(screenRuleMatch).not.toBeNull();
    expect(graphRuleMatch).not.toBeNull();
    expect(screenRuleMatch![0]).toMatch(/overflow-y:\s*auto/);
    expect(screenRuleMatch![0]).toMatch(/min-height:\s*0/);
    expect(graphRuleMatch![0]).toMatch(/overflow-y:\s*auto/);
    expect(graphRuleMatch![0]).toMatch(/min-height:\s*0/);
  });

  it('遷移マップの hover プレビューはペイン内の常時見える位置（sticky）にあり画面外へフレームアウトしない（Task 9 受入基準b）', () => {
    const doc = parseOk('# ホーム\n共通要素\n## 通常\n専用A\n## 特殊\n専用B\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    // #graph-preview は position: sticky（ペイン上部固定）
    const previewRuleMatch = html.match(/\.graph-preview\s*\{[^}]*\}/);
    expect(previewRuleMatch).not.toBeNull();
    expect(previewRuleMatch![0]).toMatch(/position:\s*sticky/);
    // graph-section 内で #graph-preview が SVG（遷移マップ本体）より前に現れる
    // （マップが縦に伸びてもプレビューはペイン上部にとどまる）
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    const graphSectionIdx = appHtml.indexOf('graph-section');
    const graphSection = appHtml.slice(graphSectionIdx);
    const previewIdx = graphSection.indexOf('id="graph-preview"');
    const svgIdx = graphSection.indexOf('<svg');
    expect(previewIdx).toBeGreaterThan(-1);
    expect(svgIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeLessThan(svgIdx);
    // hover プレビューの局所 DOM 更新方式（render() 非経由）は維持される
    expect(html).toContain("document.getElementById('graph-preview')");
  });

  it('遷移マップの hover プレビューは固定高でレイアウトシフトしない（内容の出入りで mouseenter/mouseleave が無限ループするフリッカを根治。UX評価3.3、Task 12 受入基準c）', () => {
    const doc = parseOk('# ホーム\n共通要素\n## 通常\n専用A\n## 特殊\n専用B\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const previewRuleMatch = html.match(/\.graph-preview\s*\{[^}]*\}/);
    expect(previewRuleMatch).not.toBeNull();
    // sticky 配置は維持したまま（Task 9 と両立）、内容が空(1行)⇔4行（title/module/elements/
    // variant）に変わっても高さが変わらないよう、最大内容分の高さをあらかじめ予約する
    // （固定 min-height 方式。旧 min-height: 1em は空状態の1行分しか予約せず、内容表示時に
    // レイアウトが下方向へシフトしてノードがカーソル直下から逃げていた——UX評価3.3の根因）。
    // 予約量を決定的にするため line-height を明示し、min-height は 4行 × line-height 1.4 =
    // 5.6em + 上下 padding 12px（border-box、font-size 11px 基準で約1.1em）≥ 6.7em を要求する。
    expect(previewRuleMatch![0]).not.toMatch(/min-height:\s*1em\b/);
    expect(previewRuleMatch![0]).toMatch(/line-height:\s*1\.4\b/);
    const minHeightMatch = previewRuleMatch![0].match(/min-height:\s*([\d.]+)em\b/);
    expect(minHeightMatch).not.toBeNull();
    expect(parseFloat(minHeightMatch![1]!)).toBeGreaterThanOrEqual(6.7);
    expect(previewRuleMatch![0]).toMatch(/position:\s*sticky/);
  });

  it('各ペインの説明文にオートマトンとしての読み方の注記を持つ（Task 9・ADR-0022）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // スタック: プッシュダウン構成として読める（Task 7 で既出。継続確認）
    expect(appHtml).toContain('プッシュダウン構成として読める');
    // トレースログ: 実行された遷移の列
    expect(appHtml).toContain('実行された遷移の列');
    // 遷移マップ: 状態遷移図として読める
    expect(appHtml).toContain('状態遷移図として読める');
  });

  it('各ペインに見出しと役割説明を持つ（受入基準c・設計者フィードバック「エリアが何を示しているか分からない」への対応）', () => {
    // 右ペインは gate パネルのみ（Task 10）なので、gate 対象を持つ fixture で検証する
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('統合ログ');
    expect(appHtml).toContain('ナビゲーション履歴');
    expect(appHtml).toContain('画面外 component の姿切替');
    expect(appHtml).toContain('gate 試験用');
    expect(appHtml).toContain('遷移マップ');
    expect(appHtml).toContain('閲覧専用');
  });

  it('スタック表示: 統合ログの上に見出し・役割説明付きで新設され、push/present 後に @session・壁マーカー付きで描画される（Task 7 受入基準c）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# ログイン\n本体\n\n# 確認\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // 見出し・役割説明（プッシュダウン構成としての読み方を一言）を持つ
    const beforeHtml = vm.runInContext('app.innerHTML', context);
    expect(beforeHtml).toContain('スタック');
    expect(beforeHtml).toContain('プッシュダウン');
    // 左ペイン（pane-trace）内で「スタック」が「統合ログ」より先に現れる
    const traceIdx = beforeHtml.indexOf('pane-trace');
    const traceSection = beforeHtml.slice(traceIdx);
    expect(traceSection.indexOf('スタック')).toBeLessThan(traceSection.indexOf('統合ログ'));

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'ログイン', variant: null }, session: 'login' }); render()",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: '確認', variant: null } }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('@login');
    expect(appHtml).toContain('▌'); // 壁 frame の記号
    expect((appHtml.match(/class="stack-item[^"]*"/g) ?? []).length).toBe(3);
  });

  it('スタック表示: back 後に縮む（遷移のたび追随。Task 7 受入基準c）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } }); render()",
      context,
    );
    const beforeHtml = vm.runInContext('app.innerHTML', context);
    expect((beforeHtml.match(/class="stack-item[^"]*"/g) ?? []).length).toBe(2);

    vm.runInContext('goBack(); render()', context);
    const afterHtml = vm.runInContext('app.innerHTML', context);
    expect((afterHtml.match(/class="stack-item[^"]*"/g) ?? []).length).toBe(1);
  });

  it('exit 警告改善: 対象セッション不在時に現在のセッション一覧（重複除去・積み順）を含む（Task 7 受入基準d）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# A\n本体\n\n# B\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'A', variant: null }, session: 'a' })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'B', variant: null }, session: 'b' })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'exit', target: null, session: 'missing' })",
      context,
    );
    const timelineJson = JSON.parse(vm.runInContext('JSON.stringify(timeline)', context));
    const warningEntry = timelineJson.find((e: any) => e.label.includes('missing'));
    expect(warningEntry).toBeDefined();
    expect(warningEntry.kind).toBe('event');
    const warning = warningEntry.label;
    expect(warning).toContain('exit(@missing)');
    expect(warning).toContain('@a');
    expect(warning).toContain('@b');
    // 積み順（a が先に push された）を保つ
    expect(warning.indexOf('@a')).toBeLessThan(warning.indexOf('@b'));
  });

  it('exit 警告改善: 現在のセッションがゼロ件なら「なし」と表示する（Task 7 受入基準d）', () => {
    const doc = parseOk('# ホーム\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'exit', target: null, session: 'missing' })",
      context,
    );
    const timelineJson = JSON.parse(vm.runInContext('JSON.stringify(timeline)', context));
    const warning = timelineJson.map((e: any) => e.label).find((l: string) => l.includes('missing'));
    expect(warning).toContain('なし');
  });

  it('dismiss 警告改善: 対象セッション不在時も exit と同じ形式で現在のセッション一覧を含む（Task 7 受入基準d）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# A\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'A', variant: null }, session: 'a' })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'dismiss', target: null, session: 'missing' })",
      context,
    );
    const timelineJson = JSON.parse(vm.runInContext('JSON.stringify(timeline)', context));
    const warning = timelineJson.map((e: any) => e.label).find((l: string) => l.includes('missing'));
    expect(warning).toContain('dismiss(@missing)');
    expect(warning).toContain('@a');
  });

  it('dismiss() 無名: 無名 present(X) 開始フレーム以深だけを破棄する（SPEC「無名dismiss」・UX評価3.2、Task 12 受入基準a）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# A\n本体\n\n# B\n本体\n\n# C\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // 無名 present(A) でセッション開始（present は常に wall=true、session省略で sessionName=null）
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: 'A', variant: null }, session: null })",
      context,
    );
    // 続けて無名 push(B), push(C) を数枚積む
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'B', variant: null }, session: null })",
      context,
    );
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'C', variant: null }, session: null })",
      context,
    );
    // 無名 dismiss()
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'dismiss', target: null, session: null })",
      context,
    );
    const stackComponents = JSON.parse(vm.runInContext('JSON.stringify(stack.map(f => f.component))', context));
    // present(A) 以深（A・B・C）だけが破棄され、A 以前のホームだけが残る
    expect(stackComponents).toEqual(['ホーム']);
  });

  it('dismiss() 無名: 無名セッション不在なら no-op + 警告でスタック不変（root へ崩壊しない。UX評価3.2の再現ケース、Task 12 受入基準b）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# A\n本体\n\n# B\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    // named session @tabHome で push(A)（wall=false・sessionNameあり）
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: 'A', variant: null }, session: 'tabHome' })",
      context,
    );
    // named session @nowPlaying で present(B)（wall=true・sessionNameあり）
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: 'B', variant: null }, session: 'nowPlaying' })",
      context,
    );
    const beforeStack = JSON.parse(vm.runInContext('JSON.stringify(stack.map(f => f.component))', context));
    expect(beforeStack).toEqual(['ホーム', 'A', 'B']);

    // 無名 dismiss()（アクティブパス上に無名セッションは1つも無い）
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'dismiss', target: null, session: null })",
      context,
    );
    const afterStack = JSON.parse(vm.runInContext('JSON.stringify(stack.map(f => f.component))', context));
    expect(afterStack).toEqual(beforeStack); // no-op。起動画面まで崩壊しない

    const timelineJson = JSON.parse(vm.runInContext('JSON.stringify(timeline)', context));
    const warning = timelineJson.map((e: any) => e.label).find((l: string) => l.includes('直近の無名セッション'));
    expect(warning).toBeDefined();
    expect(warning).toContain('@tabHome');
    expect(warning).toContain('@nowPlaying');
  });

  it('gate パネル改名: 画面外 component の姿切替（gate 試験用）という用途が伝わる見出し・説明を持つ（設計者確定事項 2026-07-19）', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('画面外 component の姿切替');
    expect(appHtml).toContain('gate 試験用');
    // 機能（トグル・variant 切替）は現状維持
    expect(html).toContain('function setInstanceVariant(');
    expect(html).toContain('function toggleGatePanel(');
  });

  it('aggregateGraph: split 集合に応じてノード集合が component 1 個 ↔ variant 群に変わり、エッジは粒度に合わせて dedupe される（Task 11 受入基準a）', () => {
    const doc = parseOk(
      '# 詳細\n> 閉じる -> push(次)\n## 読込中\nスピナー\n## 表示\nコンテンツ\n\n# 次\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const unified = JSON.parse(
      vm.runInContext('JSON.stringify(aggregateGraph(DATA.graph.nodes, DATA.graph.edges, new Set()))', context),
    );
    expect(unified.nodes.map((n: any) => n.name)).toEqual(['詳細', '次']);
    // 2 variant 由来の細粒度エッジが統合ノードでは 1 本に dedupe される
    expect(unified.edges).toEqual([
      { from: { module: 'main', name: '詳細' }, to: { module: 'main', name: '次' } },
    ]);
    const split = JSON.parse(
      vm.runInContext(
        "JSON.stringify(aggregateGraph(DATA.graph.nodes, DATA.graph.edges, new Set([skey('main', '詳細')])))",
        context,
      ),
    );
    expect(split.nodes.map((n: any) => n.name)).toEqual(['詳細 ## 読込中', '詳細 ## 表示', '次']);
    expect(split.edges).toEqual([
      { from: { module: 'main', name: '詳細 ## 読込中' }, to: { module: 'main', name: '次' } },
      { from: { module: 'main', name: '詳細 ## 表示' }, to: { module: 'main', name: '次' } },
    ]);
  });

  it('aggregateGraph: to.variant null の split 先は初期姿ノードへ、明示 variant はそのノードへ集約される（Task 11 受入基準b）', () => {
    const doc = parseOk(
      '# ホーム\n> 進む -> push(詳細)\n> 直行 -> push(詳細##表示)\n\n# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const split = JSON.parse(
      vm.runInContext(
        "JSON.stringify(aggregateGraph(DATA.graph.nodes, DATA.graph.edges, new Set([skey('main', '詳細')])))",
        context,
      ),
    );
    expect(split.edges).toEqual([
      { from: { module: 'main', name: 'ホーム' }, to: { module: 'main', name: '詳細 ## 読込中' } },
      { from: { module: 'main', name: 'ホーム' }, to: { module: 'main', name: '詳細 ## 表示' } },
    ]);
  });

  it('aggregateGraph: from.variant null（component common 由来）の split 元は全 variant ノードから出る（Task 11）', () => {
    const doc = parseOk('# ホーム\n本体\n\n# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const result = JSON.parse(
      vm.runInContext(
        "JSON.stringify(aggregateGraph(DATA.graph.nodes, [{ from: { module: 'main', component: '詳細', variant: null }, to: { module: 'main', component: 'ホーム', variant: null } }], new Set([skey('main', '詳細')])))",
        context,
      ),
    );
    expect(result.edges).toEqual([
      { from: { module: 'main', name: '詳細 ## 読込中' }, to: { module: 'main', name: 'ホーム' } },
      { from: { module: 'main', name: '詳細 ## 表示' }, to: { module: 'main', name: 'ホーム' } },
    ]);
  });

  it('遷移マップ: split 時の現在地ハイライトは現在 variant のノードへ付き、姿替えに追随する（Task 11 受入基準c）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n> 切替 -> goto(##特殊)\n## 特殊\n要素2\n');
    const html = toSimulator(
      new Map([['main', doc]]),
      'main',
      { graph: { split: [{ module: 'main', component: 'ホーム' }] } },
    );
    const context = runSimulatorScript(html);
    const beforeHtml = vm.runInContext('app.innerHTML', context);
    const tagsOf = (s: string) => [...s.matchAll(/<g class="([^"]*)"[^>]*>[\s\S]*?<\/g>/g)];
    const before = tagsOf(beforeHtml);
    const normalBefore = before.find((m) => m[0].includes('ホーム ## 通常'));
    const specialBefore = before.find((m) => m[0].includes('ホーム ## 特殊'));
    expect(normalBefore![1]).toMatch(/graph-node-current/);
    expect(specialBefore![1]).not.toMatch(/graph-node-current/);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'goto', target: { kind: 'variant', variant: '特殊' } }); render()",
      context,
    );
    const afterHtml = vm.runInContext('app.innerHTML', context);
    const after = tagsOf(afterHtml);
    const normalAfter = after.find((m) => m[0].includes('ホーム ## 通常'));
    const specialAfter = after.find((m) => m[0].includes('ホーム ## 特殊'));
    expect(normalAfter![1]).not.toMatch(/graph-node-current/);
    expect(specialAfter![1]).toMatch(/graph-node-current/);
  });

  it('初期 config 埋め込み: toSimulator の第 3 引数 graph.split が DATA.graphConfig として埋め込まれ初回描画から split される（Task 11 受入基準d）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const html = toSimulator(
      new Map([['main', doc]]),
      'main',
      { graph: { split: [{ module: 'main', component: 'ホーム' }] } },
    );
    expect(html).toContain('"graphConfig"');
    const context = runSimulatorScript(html);
    expect(vm.runInContext("graphSplit.has(skey('main', 'ホーム'))", context)).toBe(true);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('ホーム ## 通常');
    expect(appHtml).toContain('ホーム ## 特殊');
  });

  it('初期 config 埋め込み: config 省略時は split 空で従来どおり component 粒度（後方互換）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    expect(vm.runInContext('graphSplit.size', context)).toBe(0);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).not.toContain('ホーム ## 通常');
  });

  it('ノードメニュー: variant を持つノードのクリックでメニューが開き、split/統合を切り替えられる（Task 11）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toMatch(/onclick="openGraphMenu\(\d+\)"/);

    vm.runInContext('openGraphMenu(0)', context);
    const menuHtml = vm.runInContext('app.innerHTML', context);
    expect(menuHtml).toContain('variant で分割');
    expect(menuHtml).toContain('閉じる');

    vm.runInContext('toggleGraphSplit(0)', context);
    const splitHtml = vm.runInContext('app.innerHTML', context);
    expect(splitHtml).toContain('ホーム ## 通常');
    expect(splitHtml).toContain('ホーム ## 特殊');
    // 切替後はメニューが閉じる（集約後インデックスが変わるため開いたままにしない）
    expect(vm.runInContext('graphMenu', context)).toBeNull();

    // split 済みノードのメニューは「統合」になり、実行で component 粒度へ戻る
    vm.runInContext('openGraphMenu(0)', context);
    expect(vm.runInContext('app.innerHTML', context)).toContain('統合');
    vm.runInContext('toggleGraphSplit(0)', context);
    const unifiedHtml = vm.runInContext('app.innerHTML', context);
    expect(unifiedHtml).not.toContain('ホーム ## 通常');
  });

  it('ノードメニュー: variant を持たない component のノードには onclick を付けない（メニュー不要。Task 11）', () => {
    const doc = parseOk('# ホーム\n要素\n\n# 詳細\n本文\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).not.toContain('openGraphMenu(');
    // 関数呼び出しでも variant なしは no-op（メニューは開かない）
    vm.runInContext('openGraphMenu(0)', context);
    expect(vm.runInContext('graphMenu', context)).toBeNull();
  });

  it('ノードメニュー: 閉じるでメニューが消える（Task 11）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext('openGraphMenu(0)', context);
    expect(vm.runInContext('app.innerHTML', context)).toContain('graph-menu');
    vm.runInContext('closeGraphMenu()', context);
    expect(vm.runInContext('graphMenu', context)).toBeNull();
    expect(vm.runInContext('app.innerHTML', context)).not.toContain('class="graph-menu"');
  });

  it('ノードメニュー: onclick へは数値インデックスのみを埋め込む（quote を含む component 名でも属性が壊れない）', () => {
    const doc = parseOk('# 名"前\n## a\n要素\n## b\n要素\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).not.toContain('onclick="openGraphMenu("');
    expect(appHtml).toMatch(/onclick="openGraphMenu\(\d+\)"/);
  });

  it('設定を保存: buildSimConfigJson が現在の split 集合を確定形式で出力する（Task 11 形式確定事項）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n\n# 詳細\n本文\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    expect(JSON.parse(vm.runInContext('buildSimConfigJson()', context))).toEqual({ graph: { split: [] } });
    vm.runInContext("graphSplit.add(skey('main', 'ホーム'))", context);
    expect(JSON.parse(vm.runInContext('buildSimConfigJson()', context))).toEqual({
      graph: { split: [{ module: 'main', component: 'ホーム' }] },
    });
  });

  it('設定を保存: 埋め込み config と保存内容がラウンドトリップする（読み込んだ split をそのまま書き出せる）', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const config = { graph: { split: [{ module: 'main', component: 'ホーム' }] } };
    const html = toSimulator(new Map([['main', doc]]), 'main', config);
    const context = runSimulatorScript(html);
    expect(JSON.parse(vm.runInContext('buildSimConfigJson()', context))).toEqual(config);
  });

  it('設定を保存: ボタンが遷移マップ区画にあり、FS Access API（suggestedName・ハンドル保持）とダウンロード fallback を持つ', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('設定を保存');
    expect(appHtml).toContain('onclick="saveGraphConfig()"');
    // FS Access API の実呼び出しは vm では検証できない（Cannot-verify）——構成要素の存在を縛る。
    // ハンドルは初回取得後 JS 変数に保持し、以後は同じファイルへ上書きする
    expect(html).toContain('window.showSaveFilePicker');
    expect(html).toContain('suggestedName');
    expect(html).toContain(".simconfig.json");
    expect(html).toContain('let saveFileHandle');
    // 非対応ブラウザは a[download] での JSON ダウンロード fallback
    expect(html).toContain('.download = ');
  });

  describe('埋め込み部品の interaction 有効化（Task 13、SPEC 116-124・450-461）', () => {
  it('SPEC タブバー慣用句: 画面に「タブバー」要素を置くだけで部品側 switch が実行でき遷移する（受入基準a）', () => {
    const doc = parseOk(
      '# ホーム\nタブバー\n\n' +
        '# タブバー\n> タップ(ホームボタン) -> switch(ホーム, @tabHome)\n> タップ(検索ボタン) -> switch(検索, @tabSearch)\n\n' +
        '# 検索\nタブバー\n検索窓\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    // タブバー要素として置いただけの画面から、部品側の switch 操作が両方見える
    expect(appHtml).toContain('タップ(ホームボタン)');
    expect(appHtml).toContain('タップ(検索ボタン)');
    const idx = appHtml.indexOf('タップ(検索ボタン)');
    const m = appHtml.slice(idx).match(/onclick="(handleNestedInteraction\([^"]+)"/);
    expect(m).not.toBeNull();
    // onclick には部品名などの文字列は埋め込まれず、数値インデックス列 + scope 固定キーのみ
    expect(m![1]).toMatch(/^handleNestedInteraction\(-1,\[\d+\],'(variant|component)',\d+,\d+\)$/);
    vm.runInContext(m![1]!, context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');
  });

  it('入れ子部品の interaction も再帰的に操作可能（2段ネスト。受入基準b）', () => {
    const doc = parseOk(
      '# ホーム\n外側\n\n# 外側\n内側\n\n# 内側\n本体\n> タップ(本体) -> push(次)\n\n# 次\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    const idx = appHtml.indexOf('タップ(本体)');
    expect(idx).toBeGreaterThan(-1);
    const m = appHtml.slice(idx).match(/onclick="(handleNestedInteraction\([^"]+)"/);
    expect(m).not.toBeNull();
    vm.runInContext(m![1]!, context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('次');
  });

  it('循環参照があっても部品 interaction 展開は循環点で止まり無限にも重複にもならない（受入基準b）', () => {
    const doc = parseOk(
      '# A\nB\n> タップ(A自身) -> back()\n\n# B\nA\n> タップ(B自身) -> back()\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('（循環）');
    const countA = (appHtml.match(/タップ\(A自身\)/g) ?? []).length;
    const countB = (appHtml.match(/タップ\(B自身\)/g) ?? []).length;
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('部品の裸 gate は部品自身の表示 variant の実効 body で判定される（overlay の hostCtx 方式を流用。受入基準c）', () => {
    const doc = parseOk(
      '# ホーム\nスイッチ\n\n# スイッチ\n## オン\nランプ\n> タップ(ランプ?) -> back()\n## オフ\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    // 初期姿はオン（最初に定義された姿）→ ランプが存在するため gate は有効
    const before = vm.runInContext('app.innerHTML', context);
    expect(before).toContain('タップ(ランプ)');
    // 部品自身の表示 variant をオフへ切替（ホーム側の variant ではない）→ ランプ不在で gate が無効になる
    vm.runInContext("sharedVariants.set(skey('main', 'スイッチ'), 'オフ'); render()", context);
    const after = vm.runInContext('app.innerHTML', context);
    expect(after).not.toContain('タップ(ランプ)');
  });

  it('cross-module: 部品 interaction の遷移先は定義ファイル基準で正準化済みのまま、実行はアクティブフレーム基準で効く（受入基準e）', () => {
    const widgetsDoc = parseOk('# タブバー\n> タップ(検索ボタン) -> switch(検索, @tabSearch)\n\n# 検索\n検索窓\n');
    const mainDoc = parseOk('import widgets as w\n# ホーム\nw::タブバー\n');
    const html = toSimulator(new Map([['main', mainDoc], ['widgets', widgetsDoc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    const idx = appHtml.indexOf('タップ(検索ボタン)');
    expect(idx).toBeGreaterThan(-1);
    const m = appHtml.slice(idx).match(/onclick="(handleNestedInteraction\([^"]+)"/);
    expect(m).not.toBeNull();
    vm.runInContext(m![1]!, context);
    expect(vm.runInContext('currentFrame().module', context)).toBe('widgets');
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');
  });

  it('掲示中カードにも部品 interaction 展開が同じ機構（renderElementsAndActions 共通化）で乗る', () => {
    const doc = parseOk(
      '# ホーム\n> 出す -> show(ミニ)\n\n# ミニ\nタブバー\n\n# タブバー\n> タップ(検索ボタン) -> push(検索)\n\n# 検索\n本文\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    vm.runInContext(
      "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: null }); render()",
      context,
    );
    const appHtml = vm.runInContext('app.innerHTML', context);
    const overlayIdx = appHtml.indexOf('overlay-card');
    expect(overlayIdx).toBeGreaterThan(-1);
    const overlaySection = appHtml.slice(overlayIdx);
    expect(overlaySection).toContain('タップ(検索ボタン)');
    const m = overlaySection.match(/onclick="(handleNestedInteraction\([^"]+)"/);
    expect(m).not.toBeNull();
    // cardIdx は 0 以上（掲示中カード自身の索引）——本体（-1）とは区別される
    expect(m![1]).toMatch(/^handleNestedInteraction\(\d+,\[\d+\],/);
    vm.runInContext(m![1]!, context);
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');
  });

  describe('外側上書き（SPEC 116-124「対象の指す要素」・受入基準d）', () => {
    it('親の 行動(部品要素.member) が行動一致・member一致なら部品側 interaction を隠す（親が勝つ）', () => {
      const doc = parseOk(
        '# ホーム\nプロフィールカード\n> タップ(プロフィールカード.本体) -> push(編集)\n\n' +
          '# プロフィールカード\n本体\n> タップ(本体) -> push(詳細)\n\n' +
          '# 編集\n本文\n\n# 詳細\n本文\n',
      );
      const html = toSimulator(new Map([['main', doc]]), 'main');
      const context = runSimulatorScript(html);
      const appHtml = vm.runInContext('app.innerHTML', context);
      // 親の上書き（member 復元済みラベル）は表示される
      expect(appHtml).toContain('タップ(プロフィールカード.本体)');
      // 部品側の同一 (行動, 対象) は隠れる——重複表示されない
      expect((appHtml.match(/タップ\(本体\)/g) ?? []).length).toBe(0);
      // クリックすると親の上書き先（編集）へ遷移する（部品側の詳細ではなく）
      const m = appHtml.match(/onclick="(handleInteraction\([^"]+)"/);
      expect(m).not.toBeNull();
      vm.runInContext(m![1]!, context);
      expect(vm.runInContext('currentFrame().component', context)).toBe('編集');
    });

    it('行動文字列が違えば部品側と親側の両方が残る', () => {
      const doc = parseOk(
        '# ホーム\nプロフィールカード\n> 長押し(プロフィールカード.本体) -> push(編集)\n\n' +
          '# プロフィールカード\n本体\n> タップ(本体) -> push(詳細)\n\n' +
          '# 編集\n本文\n\n# 詳細\n本文\n',
      );
      const html = toSimulator(new Map([['main', doc]]), 'main');
      const context = runSimulatorScript(html);
      const appHtml = vm.runInContext('app.innerHTML', context);
      expect(appHtml).toContain('長押し(プロフィールカード.本体)');
      expect(appHtml).toContain('タップ(本体)');
    });

    it('外側上書きは掲示中カードでも同じ機構で効く', () => {
      const doc = parseOk(
        '# ホーム\n> 出す -> show(ミニ)\n\n' +
          '# ミニ\nプロフィールカード\n> タップ(プロフィールカード.本体) -> push(編集)\n\n' +
          '# プロフィールカード\n本体\n> タップ(本体) -> push(詳細)\n\n' +
          '# 編集\n本文\n\n# 詳細\n本文\n',
      );
      const html = toSimulator(new Map([['main', doc]]), 'main');
      const context = runSimulatorScript(html);
      vm.runInContext(
        "applyTransition({ type: 'overlay', op: 'show', component: 'ミニ', module: 'main', variant: null }); render()",
        context,
      );
      const appHtml = vm.runInContext('app.innerHTML', context);
      const overlayIdx = appHtml.indexOf('overlay-card');
      const overlaySection = appHtml.slice(overlayIdx);
      expect(overlaySection).toContain('タップ(プロフィールカード.本体)');
      expect((overlaySection.match(/タップ\(本体\)/g) ?? []).length).toBe(0);
      const m = overlaySection.match(/onclick="(handleOverlayInteraction\([^"]+)"/);
      expect(m).not.toBeNull();
      vm.runInContext(m![1]!, context);
      expect(vm.runInContext('currentFrame().component', context)).toBe('編集');
    });
  });
  });
});
