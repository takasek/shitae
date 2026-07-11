import { describe, it, expect } from 'vitest';
import { toMermaid } from '../src/index.js';
import { parse } from '../../parser/src/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('toMermaid', () => {
  it('flowchart LR ヘッダ', () => {
    const { document } = parse('# ホーム\nロゴ\n');
    expect(toMermaid(document)).toMatch(/^flowchart LR/);
  });

  it('variant なし component → 単一ノード', () => {
    const { document } = parse('# スプラッシュ\nロゴ\n');
    const out = toMermaid(document);
    expect(out).toContain('スプラッシュ["# スプラッシュ"]');
  });

  it('variant あり component → subgraph', () => {
    const { document } = parse('# マッチング\n## 検索中\n案内\n## 失敗\n案内\n');
    const out = toMermaid(document);
    expect(out).toContain('subgraph');
    expect(out).toContain('"# マッチング"');
    expect(out).toContain('"## 検索中"');
    expect(out).toContain('"## 失敗"');
  });

  it('goto → エッジ', () => {
    const { document } = parse('# A\nロゴ\n> 起動 -> goto(B)\n');
    const out = toMermaid(document);
    expect(out).toContain('A -->|"起動"| B');
  });

  it('push → エッジ', () => {
    const { document } = parse('# A\n> タップ(設定) -> push(B)\n');
    const out = toMermaid(document);
    expect(out).toContain('-->|"タップ(設定)"| B');
  });

  it('goto ##姿 → 同 component の variant ノードへのエッジ', () => {
    const { document } = parse('# A\n## x\n> 行動 -> goto(##y)\n## y\n完了\n');
    const out = toMermaid(document);
    expect(out).toContain('A_x -->|"行動"| A_y');
  });

  it('back() target なし → エッジなし', () => {
    const { document } = parse('# A\n要素\n> 戻る -> back()\n');
    const out = toMermaid(document);
    const edges = out.split('\n').filter(l => l.includes('-->'));
    expect(edges).toHaveLength(0);
  });

  it('exit() → エッジなし', () => {
    const { document } = parse('# A\n> 終了 -> exit(@s)\n');
    const out = toMermaid(document);
    const edges = out.split('\n').filter(l => l.includes('-->'));
    expect(edges).toHaveLength(0);
  });

  it('条件ラベルあり → [ラベル]action', () => {
    const { document } = parse('# A\n> 保存 -> [成功] goto(B)\n');
    const out = toMermaid(document);
    expect(out).toContain('"[成功]保存"');
  });

  it('present → エッジ', () => {
    const { document } = parse('# A\n> タップ(設定) -> present(設定, @settings)\n');
    const out = toMermaid(document);
    expect(out).toContain('-->');
    expect(out).toContain('設定');
  });

  it('back(target) → エッジあり', () => {
    const { document } = parse('# A\n> 戻る -> back(B)\n');
    const out = toMermaid(document);
    expect(out).toContain('A -->');
    expect(out).toContain('| B');
  });

  it('dismiss() → エッジなし', () => {
    const { document } = parse('# A\n> 閉じる -> dismiss()\n');
    const out = toMermaid(document);
    const edges = out.split('\n').filter(l => l.includes('-->'));
    expect(edges).toHaveLength(0);
  });

  it('全サンプルが flowchart LR を出力する', () => {
    const root = join(import.meta.dirname, '../../..');
    const battle = readFileSync(join(root, 'docs/examples/battle.shitae'), 'utf8');
    const ecommerce = readFileSync(join(root, 'docs/examples/ecommerce.shitae'), 'utf8');
    const music = readFileSync(join(root, 'docs/examples/music.shitae'), 'utf8');
    for (const src of [battle, ecommerce, music]) {
      const { document } = parse(src);
      const out = toMermaid(document);
      expect(out).toMatch(/^flowchart LR/);
      expect(out.length).toBeGreaterThan(200);
    }
  });

  it('variant ありコンポーネントへの参照 → 最初の variant ノードへのエッジ', () => {
    // push(商品詳細) で 商品詳細 が variant を持つ場合、商品詳細_読込中 へ向く
    const src = '# 商品一覧\n> タップ -> push(商品詳細)\n# 商品詳細\n## 読込中\nスピナー\n## 表示\n画像\n';
    const { document } = parse(src);
    const out = toMermaid(document);
    expect(out).toContain('商品一覧 -->|"タップ"| 商品詳細_読込中');
    expect(out).not.toContain('-->|"タップ"| 商品詳細\n');
  });

  it('cross-module 参照はモジュールプレフィックス付きノード ID になる', () => {
    // goto(auth::Login) → "auth__Login" のような識別可能な ID
    const src = '# A\nロゴ\n> ログイン -> goto(auth::Login)\n';
    const { document } = parse(src);
    const out = toMermaid(document);
    // cross-module の edge は auth__Login (または auth_Login) を参照する
    expect(out).toMatch(/A -->.*auth.*Login/);
  });

  it('sanitizeId: 名前衝突があっても異なるノード ID を生成する', () => {
    // 'Sign In' と 'Sign_In' は sanitize すると同じになる可能性がある
    const src = '# Sign In\nロゴ\n> 進む -> goto(Sign_In)\n# Sign_In\nフォーム\n';
    const { document } = parse(src);
    const out = toMermaid(document);
    // 2つのコンポーネントが定義されているので 2つの別ノードが存在する
    const nodeLines = out.split('\n').filter(l => l.includes('["#'));
    expect(nodeLines).toHaveLength(2);
    // それぞれの ID が異なる
    const ids = nodeLines.map(l => l.trim().split('[')[0].trim());
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('ラベル継承（次のラベルまでスコープ）', () => {
  it('無ラベルの遷移 result が直前のラベルを継承したエッジラベルになる', () => {
    const src =
      '# A\n保存\n> タップ(保存) ->\n>     [成功] 保存する ; goto(B)\n>     [失敗] エラーを表示する\n# B\n完了\n';
    const { document } = parse(src);
    const out = toMermaid(document);
    expect(out).toContain('A -->|"[成功]タップ(保存)"| B');
  });

  it('最初のラベルより前の result はラベルなしのまま', () => {
    const src = '# A\n> タップ ->\n>     goto(B)\n>     [失敗] エラーを表示する\n# B\nx\n';
    const { document } = parse(src);
    const out = toMermaid(document);
    expect(out).toContain('A -->|"タップ"| B');
    expect(out).not.toContain('[失敗]タップ');
  });
});

describe('shadow 合成（姿固有が共通に勝つ）', () => {
  const src = [
    '# M',
    '戻る',
    '> タップ(戻る) -> goto(A)',
    '## 検索中',
    '> タップ(戻る) -> goto(B)',
    '## 失敗',
    '案内',
    '# A',
    'x',
    '# B',
    'y',
  ].join('\n');

  it('shadow した姿からは姿固有エッジだけが出る', () => {
    const out = toMermaid(parse(src).document);
    expect(out).toContain('M_検索中 -->|"タップ(戻る)"| B');
    expect(out).not.toContain('M_検索中 -->|"タップ(戻る)"| A');
  });

  it('shadow していない姿では共通エッジがその姿ノードから出る', () => {
    const out = toMermaid(parse(src).document);
    expect(out).toContain('M_失敗 -->|"タップ(戻る)"| A');
    // 姿を持つ component の共通エッジは幻のベースノード（subgraph 外の未定義 id）からは出ない
    expect(out).not.toMatch(/^ {2}M -->/m);
  });
});
