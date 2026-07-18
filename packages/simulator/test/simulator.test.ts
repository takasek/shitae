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

  it('トレースログ: 起動時に初期イベントが1件積まれ、snapshotが現在状態を持つ（toast は全廃）', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    expect(html).not.toContain('showToast');
    expect(html).not.toContain('class="toast"');
    const context = runSimulatorScript(html);
    expect(vm.runInContext('traceLog.length', context)).toBe(1);
    const stackLen = vm.runInContext('traceLog[0].snapshot.stack.length', context);
    expect(stackLen).toBe(1);
  });

  it('トレースログ: push 2回で起動+2件、trace[1]タップで全状態(stack・sharedVariants・overlays)が巻き戻り trace が2件になる', () => {
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
    expect(vm.runInContext('traceLog.length', context)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context)).toBe('結果');

    vm.runInContext('jumpToTrace(1)', context);
    expect(vm.runInContext('traceLog.length', context)).toBe(2);
    expect(vm.runInContext('currentFrame().component', context)).toBe('検索');
    expect(vm.runInContext('stack.length', context)).toBe(2);
  });

  it('イベントログ: effect はイベントログに1件追加されトレースログには入らない', () => {
    const doc = parseOk('# ホーム\n> 押す -> いいねしました\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    const traceLenBefore = vm.runInContext('traceLog.length', context);
    vm.runInContext("applyTransition({ type: 'effect', text: 'いいねしました' })", context);

    expect(vm.runInContext('traceLog.length', context)).toBe(traceLenBefore);
    const eventLog = JSON.parse(vm.runInContext('JSON.stringify(eventLog)', context));
    expect(eventLog.some((e: string) => e.includes('いいねしました'))).toBe(true);
  });

  it('戻るボタン相当の関数(goBack): wall で失敗しイベントログに警告、成功時トレースログに遷移イベントが追記される（back の trace 追記化。旧 pop 仕様は全廃 — Task 7）', () => {
    const doc = parseOk('# ホーム\n> モーダル -> present(モーダル)\n\n# モーダル\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'present', target: { module: 'main', component: 'モーダル', variant: null } })",
      context,
    );
    expect(vm.runInContext('traceLog.length', context)).toBe(2);

    // モーダルは present（wall）で積まれたため goBack() は阻まれ、警告がイベントログへ、trace は変化しない
    vm.runInContext('goBack()', context);
    expect(vm.runInContext('traceLog.length', context)).toBe(2);
    const eventLog = JSON.parse(vm.runInContext('JSON.stringify(eventLog)', context));
    expect(eventLog.some((e: string) => e.includes('壁'))).toBe(true);

    // push（非 wall）した場合は goBack() 成功、トレースログ末尾に back の遷移イベントが追記される（pop しない）
    const doc2 = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html2 = toSimulator(new Map([['main', doc2]]), 'main');
    const context2 = runSimulatorScript(html2);
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context2,
    );
    expect(vm.runInContext('traceLog.length', context2)).toBe(2);
    vm.runInContext('goBack()', context2);
    expect(vm.runInContext('traceLog.length', context2)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context2)).toBe('ホーム');
    const lastLabel = vm.runInContext('traceLog[traceLog.length - 1].label', context2);
    expect(lastLabel).toBe('back → ホーム');
  });

  it('画面内 back() 成功でトレースログに遷移イベントが1件追加される（末尾除去 traceLog.pop() は全廃 — Task 7 受入基準a）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'push', target: { module: 'main', component: '検索', variant: null } })",
      context,
    );
    expect(vm.runInContext('traceLog.length', context)).toBe(2);

    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'back', target: null, session: null })",
      context,
    );
    expect(vm.runInContext('traceLog.length', context)).toBe(3);
    expect(vm.runInContext('currentFrame().component', context)).toBe('ホーム');
  });

  it('back(X) の多段巻き戻しも1イベント追記に一本化され「末尾＝現在地」不変条件が保たれる（Task 7 旧 M1 根治）', () => {
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
    expect(vm.runInContext('traceLog.length', context)).toBe(3);

    // ホームまで2段巻き戻す back(X) は、trace を2件 pop するのでなく1件だけ追記する
    vm.runInContext(
      "applyTransition({ type: 'transition', word: 'back', target: { module: 'main', component: 'ホーム', variant: null }, session: null })",
      context,
    );
    expect(vm.runInContext('traceLog.length', context)).toBe(4);
    expect(vm.runInContext('currentFrame().component', context)).toBe('ホーム');
    expect(vm.runInContext('stack.length', context)).toBe(1);
    const lastEntry = JSON.parse(vm.runInContext('JSON.stringify(traceLog[traceLog.length - 1])', context));
    // 末尾＝現在地: 追記された snapshot の stack もホーム1件に一致する
    expect(lastEntry.snapshot.stack.length).toBe(1);
    expect(lastEntry.snapshot.stack[0].component).toBe('ホーム');
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
    // アサートは素通りする。選んだ choice「だけ」が走ったことを traceLog 件数と
    // stack の中身（[当たり] 側の 景品 frame が積まれていないこと）で縛る。
    expect(vm.runInContext('traceLog.length', context)).toBe(2);
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

  it('操作一覧を scope カテゴリ（variant固有/component common/document common）に正しく分類する', () => {
    const doc = parseOk(
      '> 通知 -> push(受信箱)\n\n' +
        '# ホーム\n> 共通操作 -> push(共通先)\n## 通常\n姿要素\n> 姿操作 -> push(詳細)\n\n' +
        '# 詳細\n本体\n\n# 共通先\n本体\n\n# 受信箱\n本体\n',
    );
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('variant固有');
    expect(appHtml).toContain('component common');
    expect(appHtml).toContain('document common');
    expect(appHtml).toContain('姿操作');
    expect(appHtml).toContain('共通操作');
    expect(appHtml).toContain('通知');
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

  it('scope カテゴリが空なら見出しごと出さない', () => {
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
    // action-category の折り畳み（無関係の既存機能）は残るため graph 専用の details 廃止に絞って縛る
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

    // 左: トレースログ
    const traceIdx = appHtml.indexOf('pane-trace');
    expect(traceIdx).toBeGreaterThan(-1);
    // 中央: 現在の画面 + 遷移マップ
    const centerIdx = appHtml.indexOf('pane-center');
    expect(centerIdx).toBeGreaterThan(-1);
    // 右: イベントログ + gate パネル
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
    const eventLogIdx = eventsSection.indexOf('イベントログ');
    const gatePanelIdx = eventsSection.indexOf('gate-panel');
    expect(eventLogIdx).toBeGreaterThan(-1);
    expect(gatePanelIdx).toBeGreaterThan(-1);
    expect(eventLogIdx).toBeLessThan(gatePanelIdx); // イベントログ上、gate パネル下部
  });

  it('各ペインに見出しと役割説明を持つ（受入基準c・設計者フィードバック「エリアが何を示しているか分からない」への対応）', () => {
    const doc = parseOk('# ホーム\n> 検索へ -> push(検索)\n\n# 検索\n本体\n');
    const html = toSimulator(new Map([['main', doc]]), 'main');
    const context = runSimulatorScript(html);
    const appHtml = vm.runInContext('app.innerHTML', context);
    expect(appHtml).toContain('トレースログ');
    expect(appHtml).toContain('ナビゲーション履歴');
    expect(appHtml).toContain('イベントログ');
    expect(appHtml).toContain('巻き戻し不可');
    expect(appHtml).toContain('遷移マップ');
    expect(appHtml).toContain('閲覧専用');
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
});
