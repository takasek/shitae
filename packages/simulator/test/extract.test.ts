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
  it('single component no variant', () => {
    const doc = parseOk('# ホーム\nロゴ\n> タップ(ロゴ) -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryModule).toBe('main');
    expect(data.entryComponent).toBe('ホーム');
    const comp = data.modules['main']!.components['ホーム']!;
    expect(comp.commonElements.map((e) => e.name)).toContain('ロゴ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.commonInteractions[0]!.actionText).toContain('タップ');
    expect(comp.variants).toEqual({});
  });

  it('component with variants', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n> タップ(コンテンツ) -> push(次)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['詳細']!;
    expect(Object.keys(comp.variants)).toEqual(['読込中', '表示']);
    expect(comp.variants['読込中']!.elements.map((e) => e.name)).toContain('スピナー');
    expect(comp.variants['表示']!.elements.map((e) => e.name)).toContain('コンテンツ');
    expect(comp.variants['表示']!.interactions).toHaveLength(1);
  });

  it('common elements appear in commonElements', () => {
    const doc = parseOk('# プロフィール\nヘッダ\n> タップ(ヘッダ) -> back()\n## 未フォロー\nフォローボタン\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['プロフィール']!;
    expect(comp.commonElements.map((e) => e.name)).toContain('ヘッダ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.variants['未フォロー']!.elements.map((e) => e.name)).toContain('フォローボタン');
  });

  it('interaction with multiple labeled results → 1 ラベル 1 choice', () => {
    const doc = parseOk('# 保存\n保存\n> タップ(保存) -> [成功] goto(完了) ; [失敗] エラー表示\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['保存']!;
    const interaction = comp.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(0);
    expect(interaction.choices).toHaveLength(2);
    expect(interaction.choices[0]!.label).toBe('成功');
    expect(interaction.choices[0]!.results[0]!.type).toBe('transition');
    expect(interaction.choices[1]!.label).toBe('失敗');
    expect(interaction.choices[1]!.results[0]!.type).toBe('effect');
  });

  it('transition result contains word and target', () => {
    const doc = parseOk('# A\n> タップ -> push(B)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['A']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition') {
      expect(body.word).toBe('push');
      expect(body.target?.kind).toBe('full');
      if (body.target?.kind === 'full') {
        expect(body.target.component).toBe('B');
      }
    }
  });

  it('ラベル継承: 無ラベル result は直前のラベルを引き継ぎ同じ choice にまとまる', () => {
    const doc = parseOk(
      '# A\nX\n> タップ(X) ->\n> [成功] 保存する ; goto(B)\n> [失敗] エラーを表示する\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(0);
    expect(interaction.choices).toHaveLength(2);
    expect(interaction.choices[0]!.label).toBe('成功');
    expect(interaction.choices[0]!.results).toHaveLength(2);
    expect(interaction.choices[0]!.results[0]!.type).toBe('effect');
    expect(interaction.choices[0]!.results[1]!.type).toBe('transition');
    expect(interaction.choices[1]!.label).toBe('失敗');
    expect(interaction.choices[1]!.results).toHaveLength(1);
  });

  it('ラベル継承: 最初のラベルより前の result は prelude（常に成立）', () => {
    const doc = parseOk('# A\nX\n> タップ(X) -> ログを送る ; [成功] goto(B) ; [失敗] エラー\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(1);
    expect(interaction.prelude[0]!.type).toBe('effect');
    expect(interaction.choices).toHaveLength(2);
  });

  it('ラベルなしの複数 result はすべて prelude（分岐ではなく順に全部起こる）', () => {
    const doc = parseOk('# A\nX\n> タップ(X) -> 保存する ; back()\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(2);
    expect(interaction.choices).toHaveLength(0);
  });

  it('shadow 合成: 各姿の interactions は共通と姿固有の mergeInteractions 結果', () => {
    const doc = parseOk(
      '# プロフィール\n戻る\n> タップ(戻る) -> back()\n> 長押し -> メニューを出す\n## 特殊\n> タップ(戻る) -> goto(別画面)\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['プロフィール']!;
    const merged = comp.variants['特殊']!.interactions;
    // 共通の タップ(戻る) は姿固有に shadow され、残るのは 長押し（共通）+ タップ(戻る)（姿固有）
    expect(merged).toHaveLength(2);
    expect(merged[0]!.actionText).toBe('長押し');
    expect(merged[1]!.actionText).toBe('タップ(戻る)');
    const body = merged[1]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition') expect(body.word).toBe('goto');
  });

  it('未定・分岐: 非隣接の同名ラベルは同じ choice に合流する（[成功] A ; [失敗] B ; [成功] C → 2 選択肢）', () => {
    const doc = parseOk(
      '# 保存\n保存\n> タップ(保存) -> [成功] ログを送る ; [失敗] エラー表示 ; [成功] 完了へ進む\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['保存']!.commonInteractions[0]!;
    expect(interaction.choices).toHaveLength(2);
    expect(interaction.choices[0]!.label).toBe('成功');
    expect(interaction.choices[0]!.results).toHaveLength(2);
    expect(interaction.choices[1]!.label).toBe('失敗');
    expect(interaction.choices[1]!.results).toHaveLength(1);
  });

  it('shadow 合成: (行動, 対象) が一致しなければ共通も姿固有も両方残る', () => {
    const doc = parseOk(
      '# A\nX\n> タップ(X) -> back()\n## 姿1\n> 長押し(X) -> goto(B)\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const merged = data.modules['main']!.components['A']!.variants['姿1']!.interactions;
    expect(merged).toHaveLength(2);
  });

  it('初期姿: initialVariant は最初に定義された姿', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['詳細']!.initialVariant).toBe('読込中');
  });

  it('初期姿: 姿を持たない component の initialVariant は null', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['ホーム']!.initialVariant).toBeNull();
  });

  it('overlay: show(X##v) は表示 variant を SimOverlay に保持する', () => {
    const doc = parseOk(
      '# P\n> 再生 -> show(ミニプレイヤー##再生中)\n\n# ミニプレイヤー\n## 再生中\n曲名\n## 一時停止\n再開ボタン\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['P']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('overlay');
    if (body.type === 'overlay') {
      expect(body.component).toBe('ミニプレイヤー');
      expect(body.variant).toBe('再生中');
    }
  });

  it('overlay: show(X)（variant 省略）は variant が null', () => {
    const doc = parseOk('# P\n> 再生 -> show(ミニプレイヤー)\n\n# ミニプレイヤー\n曲名\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['P']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('overlay');
    if (body.type === 'overlay') expect(body.variant).toBeNull();
  });

  it('singleton: `#!` を定義 module 付きで data.singletons に集める（`#` は含めない。ADR-0013）', () => {
    const doc = parseOk('#! クーポン\n## 未受取\n受取ボタン\n\n# 通常\n要素\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.singletons).toEqual([{ module: 'main', name: 'クーポン' }]);
  });

  it('singleton: 別モジュールの同名 component とは素名合流しない（ADR-0013）', () => {
    const subDoc = parseOk('#! クーポン\n## 未受取\n受取ボタン\n');
    const mainDoc = parseOk('import sub as sub\n# クーポン\n## 通常\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['sub', subDoc]]), 'main');
    expect(data.singletons).toEqual([{ module: 'sub', name: 'クーポン' }]);
  });

  it('3階層shadow: variant固有がdocument commonをshadowするとdocCommonInteractionsから消える', () => {
    const doc = parseOk(
      '> タップ(戻る) -> exit(@x)\n> プッシュ通知 -> push(詳細)\n\n# A\n戻る\n## 姿1\n> タップ(戻る) -> back()\n\n# 詳細\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const variant = data.modules['main']!.components['A']!.variants['姿1']!;
    // タップ(戻る) は variant 固有に shadow され消える。プッシュ通知は shadow されず残る
    const texts = variant.docCommonInteractions.map((i) => i.actionText);
    expect(texts).not.toContain('タップ(戻る)');
    expect(texts).toContain('プッシュ通知');
  });

  it('3階層shadow: componentCommonがdocument commonをshadowするとcommonのdocCommonInteractionsから消える', () => {
    const doc = parseOk(
      '> タップ(戻る) -> exit(@x)\n\n# A\n戻る\n> タップ(戻る) -> back()\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['A']!;
    expect(comp.docCommonInteractions.map((i) => i.actionText)).not.toContain('タップ(戻る)');
  });

  it('presence gate: 裸参照 `対象?` は kind=host で判定対象名を保持する', () => {
    const doc = parseOk('# 予約\n投了\n> タップ(投了?) -> goto(##リザルト)\n## リザルト\n終了\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const gate = data.modules['main']!.components['予約']!.commonInteractions[0]!.gate;
    expect(gate).toEqual({ name: '投了', kind: 'host' });
  });

  it('presence gate: member 参照 `対象.要素?` は kind=member で対象 component 名を保持する（module はレキシカルに sourceModule へ解決。ADR-0018）', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n\n# 時間選択\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const gate = data.modules['main']!.components['予約']!.commonInteractions[0]!.gate;
    expect(gate).toEqual({ name: '選択可能', kind: 'member', targetComponent: '日付', module: 'main' });
  });

  it('presence gate: document common の裸参照も kind=host（発火時のアクティブ component で判定。ADR-0015）', () => {
    const doc = parseOk('> 通知(バナー?) -> push(詳細)\n\n# ホーム\n要素\n\n# 詳細\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const gate = data.documentCommon[0]!.gate;
    expect(gate).toEqual({ name: 'バナー', kind: 'host' });
  });

  it('presence gate: 生き残った docCommonInteractions でも kind=host（ADR-0015）', () => {
    const doc = parseOk('> 通知(バナー?) -> push(詳細)\n\n# ホーム\n要素\n\n# 詳細\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const gate = data.modules['main']!.components['ホーム']!.docCommonInteractions[0]!.gate;
    expect(gate).toEqual({ name: 'バナー', kind: 'host' });
  });

  it('document common の要素行は docCommonElements として module に載る（SPEC「document common」）', () => {
    const doc = parseOk('共通バッジ\n> 通知 -> push(詳細)\n\n# ホーム\n要素\n\n# 詳細\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.docCommonElements).toEqual([{ name: '共通バッジ', ref: null }]);
  });

  it('presence gate: `?` の無い行動は gate が null（always-on）', () => {
    const doc = parseOk('# A\n投了\n> タップ(投了) -> back()\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['A']!.commonInteractions[0]!.gate).toBeNull();
  });

  it('document common はアクティブフレームが属するモジュール自身のものが効く（SPEC「document common」モジュール分割）', () => {
    const subDoc = parseOk('サブ共通\n> クリック(サブ共通) -> 効果\n\n# サブ画面\n本文\n');
    const mainDoc = parseOk(
      'import sub as sub\nメイン共通\n> クリック(メイン共通) -> 効果\n\n# ホーム\n要素\n> タップ(要素) -> push(sub::サブ画面)\n',
    );
    const data = extractSimData(
      new Map([
        ['main', mainDoc],
        ['sub', subDoc],
      ]),
      'main',
    );
    const dc = data.modules['sub']!.components['サブ画面']!.docCommonInteractions.map((i) => i.actionText);
    expect(dc).toContain('クリック(サブ共通)');
    expect(dc).not.toContain('クリック(メイン共通)');
  });

  it('gateTargets: member gate の対象を module 付き・重複除去で集める。host は含めない', () => {
    const doc = parseOk(
      '# 予約\n投了\n*日付\n*時間\n> タップ(投了?) -> back()\n> タップ(日付.選択可能?) -> push(A)\n> タップ(時間.選択可能?) -> push(A)\n> タップ(日付.選択可能?) -> push(B)\n\n# 日付\n## 選択可能\n選択可能\n\n# 時間\n## 選択可能\n選択可能\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const sorted = [...data.gateTargets].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted).toEqual([
      { module: 'main', name: '日付' },
      { module: 'main', name: '時間' },
    ]);
  });

  it('entryComponent is first component', () => {
    const doc = parseOk('# ログイン\nID入力\n\n# ホーム\nフィード\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryComponent).toBe('ログイン');
  });
});

describe('ADR-0017: module 参照の正準化（alias → ファイル名）', () => {
  it('transition target の alias が正準モジュール名へ正規化される', () => {
    const subDoc = parseOk('# 支払い\n本文\n');
    const mainDoc = parseOk('import checkout-flow as co\n# ホーム\n> 進む -> push(co::支払い)\n');
    const data = extractSimData(new Map([['main', mainDoc], ['checkout-flow', subDoc]]), 'main');
    const body = data.modules['main']!.components['ホーム']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition' && body.target?.kind === 'full') {
      expect(body.target.module).toBe('checkout-flow');
    }
  });

  it('overlay / set / member gate の alias も正規化される', () => {
    const subDoc = parseOk('#! バナー\n## 表示\n開く\n## 非表示\n中身\n');
    const mainDoc = parseOk(
      'import notifications as n\n# ホーム\nバナー\n> 出す -> show(n::バナー##表示)\n> 書く -> set(n::バナー##非表示)\n> 押す(n::バナー.開く?) -> 進む\n',
    );
    const data = extractSimData(new Map([['main', mainDoc], ['notifications', subDoc]]), 'main');
    const inters = data.modules['main']!.components['ホーム']!.commonInteractions;
    const ov = inters[0]!.prelude[0]!;
    if (ov.type === 'overlay') expect(ov.module).toBe('notifications');
    const st = inters[1]!.prelude[0]!;
    if (st.type === 'state') expect(st.module).toBe('notifications');
    expect(inters[2]!.gate).toEqual({ name: '開く', kind: 'member', targetComponent: 'バナー', module: 'notifications' });
  });

  it('import 表に無い alias は正規化せずそのまま残す（未解決の素通し）', () => {
    const doc = parseOk('# ホーム\n> 進む -> push(unknown::画面)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['ホーム']!.commonInteractions[0]!.prelude[0]!;
    if (body.type === 'transition' && body.target?.kind === 'full') {
      expect(body.target.module).toBe('unknown');
    }
  });

  it('gateTargets は正準化された module で解決される（alias ≠ ファイル名でも定義に届く）', () => {
    const subDoc = parseOk('# 日付\n## 選択可能\n選択可能\n## 満席\n満席\n');
    const mainDoc = parseOk('import calendar-widgets as cal\n# 予約\n*日付\n> タップ(cal::日付.選択可能?) -> 進む\n');
    const data = extractSimData(new Map([['main', mainDoc], ['calendar-widgets', subDoc]]), 'main');
    expect(data.gateTargets).toEqual([{ module: 'calendar-widgets', name: '日付' }]);
  });
});

describe('ADR-0018: 無修飾 component 参照の module 解決はレキシカル（書かれたファイル）基準', () => {
  it('mod で定義された component の無修飾 set は SimStateWrite.module が sourceModule（mod）に解決される', () => {
    const subDoc = parseOk(
      '#! 状態\n## 稼働\n本体\n## 停止\n本体\n\n# ミニ\n## 再生\n曲名\n> タップ(曲名) -> set(状態##停止)\n',
    );
    const mainDoc = parseOk('import mod as mod\n# ホーム\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['mod', subDoc]]), 'main');
    const body = data.modules['mod']!.components['ミニ']!.variants['再生']!.interactions[0]!.prelude[0]!;
    expect(body.type).toBe('state');
    if (body.type === 'state') expect(body.module).toBe('mod');
  });

  it('mod で定義された component の無修飾 show/hide（overlay）は module が sourceModule（mod）に解決される', () => {
    const subDoc = parseOk(
      '# ミニ\n## 再生\n曲名\n> タップ(曲名) -> show(サブ表示)\n\n# サブ表示\n本体\n',
    );
    const mainDoc = parseOk('import mod as mod\n# ホーム\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['mod', subDoc]]), 'main');
    const body = data.modules['mod']!.components['ミニ']!.variants['再生']!.interactions[0]!.prelude[0]!;
    expect(body.type).toBe('overlay');
    if (body.type === 'overlay') expect(body.module).toBe('mod');
  });

  it('mod で定義された component の無修飾 transition target（push）は module が sourceModule（mod）に解決される', () => {
    const subDoc = parseOk(
      '# ミニ\n## 再生\n曲名\n> タップ(曲名) -> push(プレイヤー)\n\n# プレイヤー\n本体\n',
    );
    const mainDoc = parseOk('import mod as mod\n# ホーム\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['mod', subDoc]]), 'main');
    const body = data.modules['mod']!.components['ミニ']!.variants['再生']!.interactions[0]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition' && body.target?.kind === 'full') expect(body.target.module).toBe('mod');
  });

  it('mod で定義された component の無修飾 member gate は module が sourceModule（mod）に解決される', () => {
    const subDoc = parseOk(
      '# ミニ\n## 再生\n*日付\n> タップ(日付.選択可能?) -> 進む\n\n# 日付\n## 選択可能\n選択可能\n',
    );
    const mainDoc = parseOk('import mod as mod\n# ホーム\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['mod', subDoc]]), 'main');
    const gate = data.modules['mod']!.components['ミニ']!.variants['再生']!.interactions[0]!.gate;
    expect(gate).toEqual({ name: '選択可能', kind: 'member', targetComponent: '日付', module: 'mod' });
  });

  it('regression: 単一モジュール（通常画面）の無修飾 transition target はレキシカル基準とアクティブ基準が一致し、module が entry module 自身に解決される（挙動不変）', () => {
    const doc = parseOk('# A\n> 進む -> push(B)\n\n# B\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['A']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition' && body.target?.kind === 'full') expect(body.target.module).toBe('main');
  });

  it('regression: document common の無修飾 member gate は module が entryModule に解決される（挙動不変）', () => {
    const doc = parseOk(
      '*日付\n> 通知(日付.選択可能?) -> push(詳細)\n\n# ホーム\n要素\n\n# 日付\n## 選択可能\n選択可能\n\n# 詳細\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.documentCommon[0]!.gate).toEqual({ name: '選択可能', kind: 'member', targetComponent: '日付', module: 'main' });
  });
});

describe('scope: interaction の有効範囲注釈', () => {
  it('documentCommon 由来の interaction は scope が "document"', () => {
    const doc = parseOk('> 通知 -> push(詳細)\n\n# ホーム\n要素\n\n# 詳細\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.documentCommon[0]!.scope).toBe('document');
  });

  it('component common 由来の interaction は scope が "component"', () => {
    const doc = parseOk('# A\n要素\n> タップ(要素) -> back()\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['A']!.commonInteractions[0]!.scope).toBe('component');
  });

  it('shadow 合成: variant固有の interaction は "variant"、生き残った共通由来は "component"', () => {
    const doc = parseOk(
      '# プロフィール\n戻る\n> タップ(戻る) -> back()\n> 長押し -> メニューを出す\n## 特殊\n> タップ(戻る) -> goto(別画面)\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const merged = data.modules['main']!.components['プロフィール']!.variants['特殊']!.interactions;
    expect(merged[0]!.actionText).toBe('長押し');
    expect(merged[0]!.scope).toBe('component');
    expect(merged[1]!.actionText).toBe('タップ(戻る)');
    expect(merged[1]!.scope).toBe('variant');
  });

  it('3階層shadow: 生き残った docCommonInteractions（component 側）も scope は "document"', () => {
    const doc = parseOk(
      '> タップ(戻る) -> exit(@x)\n> プッシュ通知 -> push(詳細)\n\n# A\n戻る\n> タップ(戻る) -> back()\n\n# 詳細\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['A']!;
    const survivor = comp.docCommonInteractions.find((i) => i.actionText === 'プッシュ通知');
    expect(survivor!.scope).toBe('document');
  });

  it('3階層shadow: variant 側の docCommonInteractions で生き残ったものも scope は "document"', () => {
    const doc = parseOk(
      '> タップ(戻る) -> exit(@x)\n> プッシュ通知 -> push(詳細)\n\n# A\n戻る\n## 姿1\n> タップ(戻る) -> back()\n\n# 詳細\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const variant = data.modules['main']!.components['A']!.variants['姿1']!;
    const survivor = variant.docCommonInteractions.find((i) => i.actionText === 'プッシュ通知');
    expect(survivor!.scope).toBe('document');
  });
});

describe('graph: 遷移グラフの抽出', () => {
  it('nodes: 全 module の全 component を定義順で列挙する', () => {
    const subDoc = parseOk('# サブ1\n本文\n\n# サブ2\n本文\n');
    const mainDoc = parseOk('import sub as sub\n# A\n要素\n\n# B\n要素\n');
    const data = extractSimData(new Map([['main', mainDoc], ['sub', subDoc]]), 'main');
    expect(data.graph.nodes).toEqual([
      { module: 'main', name: 'A' },
      { module: 'main', name: 'B' },
      { module: 'sub', name: 'サブ1' },
      { module: 'sub', name: 'サブ2' },
    ]);
  });

  it('edges: push/goto の transition かつ target.kind==="full" のものを (from,to) 全体キーで重複除去して集める', () => {
    const doc = parseOk('# A\n> タップ -> push(B)\n> ダブルタップ -> goto(B)\n\n# B\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: 'A', variant: null },
        to: { module: 'main', component: 'B', variant: null },
      },
    ]);
  });

  it('edges: cross-module 遷移は正準モジュール名（alias ではなくファイル名）で解決される（ADR-0017）', () => {
    const subDoc = parseOk('# 支払い\n本文\n');
    const mainDoc = parseOk('import checkout-flow as co\n# ホーム\n> 進む -> push(co::支払い)\n');
    const data = extractSimData(new Map([['main', mainDoc], ['checkout-flow', subDoc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: 'ホーム', variant: null },
        to: { module: 'checkout-flow', component: '支払い', variant: null },
      },
    ]);
  });

  it('edges: target.kind==="variant"（##v のみの goto）はエッジにしない', () => {
    const doc = parseOk('#! クーポン\n## 未受取\n> タップ -> goto(##受取済)\n## 受取済\n適用ボタン\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([]);
  });

  it('edges: back/exit はエッジにしない', () => {
    const doc = parseOk('# A\n要素\n> タップ(要素) -> back()\n> 長押し(要素) -> exit(@x)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([]);
  });

  it('edges: 未定義 component への遷移はエッジにしない', () => {
    const doc = parseOk('# A\n> 進む -> push(存在しない)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([]);
  });

  it('edges: documentCommon 由来の遷移は発火元 component が定まらないためエッジにしない', () => {
    const doc = parseOk('> 通知 -> push(詳細)\n\n# ホーム\n要素\n\n# 詳細\n本文\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([]);
  });

  it('edges: variant 固有の遷移は from.variant にその姿を持つ（最細粒度。Task 11）', () => {
    const doc = parseOk(
      '# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n> タップ(コンテンツ) -> push(次)\n\n# 次\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: '詳細', variant: '表示' },
        to: { module: 'main', component: '次', variant: null },
      },
    ]);
  });

  it('edges: 姿を持つ component の common 由来遷移は各 variant から出る（merged 走査。from.variant null の重複は作らない）', () => {
    const doc = parseOk(
      '# 詳細\n> 閉じる -> push(次)\n## 読込中\nスピナー\n## 表示\nコンテンツ\n\n# 次\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: '詳細', variant: '読込中' },
        to: { module: 'main', component: '次', variant: null },
      },
      {
        from: { module: 'main', component: '詳細', variant: '表示' },
        to: { module: 'main', component: '次', variant: null },
      },
    ]);
  });

  it('edges: 明示 variant target（push(X##v)）は to.variant に保持する（初期姿への解決はブラウザ側集約が行う）', () => {
    const doc = parseOk('# A\n> タップ -> push(B##二)\n\n# B\n## 一\n要素\n## 二\n要素\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: 'A', variant: null },
        to: { module: 'main', component: 'B', variant: '二' },
      },
    ]);
  });

  it('edges: 同一 (component, target) でも from.variant が違えば別エッジとして残る（重複除去は from/to 全体キー）', () => {
    const doc = parseOk(
      '# 詳細\n## 読込中\n> 中断 -> push(次)\n## 表示\n> 進む -> push(次)\n\n# 次\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graph.edges).toEqual([
      {
        from: { module: 'main', component: '詳細', variant: '読込中' },
        to: { module: 'main', component: '次', variant: null },
      },
      {
        from: { module: 'main', component: '詳細', variant: '表示' },
        to: { module: 'main', component: '次', variant: null },
      },
    ]);
  });
});

describe('graphConfig: 遷移マップ粒度 config の埋め込み（Task 11）', () => {
  it('config.graph.split が graphConfig.split に反映される', () => {
    const doc = parseOk('# ホーム\n## 通常\n要素\n## 特殊\n要素2\n');
    const data = extractSimData(new Map([['main', doc]]), 'main', {
      graph: { split: [{ module: 'main', component: 'ホーム' }] },
    });
    expect(data.graphConfig).toEqual({ split: [{ module: 'main', component: 'ホーム' }] });
  });

  it('config 省略時は空の split（後方互換）', () => {
    const doc = parseOk('# ホーム\n要素\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.graphConfig).toEqual({ split: [] });
  });

  it('不正な split 要素（module/component が文字列でない）と未知キーは無視される', () => {
    const doc = parseOk('# ホーム\n要素\n');
    const config = {
      graph: { split: [{ module: 'main' }, 42, { module: 'main', component: 'ホーム', extra: true }] },
      unknownKey: 'x',
    } as any;
    const data = extractSimData(new Map([['main', doc]]), 'main', config);
    expect(data.graphConfig).toEqual({ split: [{ module: 'main', component: 'ホーム' }] });
  });
});

describe('elements: 階層表示用の ref 解決（Task 8）', () => {
  it('定義済み component への参照は ref に module・name を保持する（module はレキシカル解決・正準名）', () => {
    const doc = parseOk('# ホーム\nログインフォーム\n\n# ログインフォーム\nID入力\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.name).toBe('ログインフォーム');
    expect(el.ref).toEqual({ module: 'main', name: 'ログインフォーム' });
  });

  it('project 内に定義のない参照は ref が null', () => {
    const doc = parseOk('# ホーム\n存在しない部品\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.name).toBe('存在しない部品');
    expect(el.ref).toBeNull();
  });

  it('collection（{...}）要素は ref が null（参照先は単一 component ではないため）', () => {
    const doc = parseOk('# ホーム\n一覧: { タイトル }\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.name).toBe('一覧');
    expect(el.ref).toBeNull();
  });

  it('cross-module 参照は alias でなく正準モジュール名（定義ファイル名）で ref.module に解決される（ADR-0017/0018）', () => {
    const subDoc = parseOk('# 部品\n本体\n');
    const mainDoc = parseOk('import widgets as w\n# ホーム\nw::部品\n');
    const data = extractSimData(new Map([['main', mainDoc], ['widgets', subDoc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.ref).toEqual({ module: 'widgets', name: '部品' });
  });

  it('alias 付きでも定義済み component に解決すれば ref を持つ（表示名は alias、ref は参照先）', () => {
    const doc = parseOk('# ホーム\nx: ログインフォーム\n\n# ログインフォーム\nID入力\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.name).toBe('x');
    expect(el.ref).toEqual({ module: 'main', name: 'ログインフォーム' });
  });

  it('未定義 component への他モジュール参照も ref が null（定義が無ければ解決しない）', () => {
    const doc = parseOk('import widgets as w\n# ホーム\nw::存在しない\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const el = data.modules['main']!.components['ホーム']!.commonElements[0]!;
    expect(el.ref).toBeNull();
  });
});

describe('interaction: 操作の対象紐付け用 targetName（Task 8）', () => {
  it('action.target を持つ interaction は targetName に対象名を保持する', () => {
    const doc = parseOk('# ホーム\nロゴ\n> タップ(ロゴ) -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['ホーム']!.commonInteractions[0]!;
    expect(inter.targetName).toBe('ロゴ');
  });

  it('対象なしの行動は targetName が null', () => {
    const doc = parseOk('# ホーム\n> タップ -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['ホーム']!.commonInteractions[0]!;
    expect(inter.targetName).toBeNull();
  });

  it('member 参照（対象.member）は targetMember を保持し actionText を 行動(対象.member) の形に復元する（Task 13）', () => {
    const doc = parseOk(
      '# ホーム\nプロフィールカード\n> タップ(プロフィールカード.本体) -> push(編集)\n\n# プロフィールカード\n本体\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['ホーム']!.commonInteractions[0]!;
    expect(inter.targetName).toBe('プロフィールカード');
    expect(inter.targetMember).toBe('本体');
    expect(inter.actionText).toBe('タップ(プロフィールカード.本体)');
  });

  it('member 無しの対象は targetMember が null のまま（既存 actionText 挙動を変えない。Task 13）', () => {
    const doc = parseOk('# ホーム\nロゴ\n> タップ(ロゴ) -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['ホーム']!.commonInteractions[0]!;
    expect(inter.targetMember).toBeNull();
    expect(inter.actionText).toBe('タップ(ロゴ)');
  });

  it('member gate（対象.要素?）も actionText に member を復元する（Task 13）', () => {
    const doc = parseOk(
      '# 予約\n*日付\n> タップ(日付.選択可能?) -> push(時間選択)\n\n# 日付\n## 選択可能\n選択可能\n\n# 時間選択\n本文\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['予約']!.commonInteractions[0]!;
    expect(inter.targetMember).toBe('選択可能');
    expect(inter.actionText).toBe('タップ(日付.選択可能)');
  });

  it('対象なしの行動は targetMember も null（Task 13）', () => {
    const doc = parseOk('# ホーム\n> タップ -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const inter = data.modules['main']!.components['ホーム']!.commonInteractions[0]!;
    expect(inter.targetMember).toBeNull();
  });
});
