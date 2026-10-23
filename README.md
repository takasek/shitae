# shitae

**操作して、表示・戻り先・状態の残り方を確かめられる、UIフローの下書き。**

画面を移ったときに何が残り、作業を終了すると何が一緒に閉じるかを、実装前に試せます。状態は名前の付いた状態パターンで表し、データ値や業務条件式は計算しません。

shitae は、これを実装前に確かめるための言語。画面フローを数行のテキストで書けば、`check` が診断し、`simulate` がブラウザでタップして歩ける画面遷移になる。

まずは[予約の例を育てる入門](docs/TUTORIAL.md)で、一覧から戻る操作、状態変更、作業の終了、タブ、通知と共有状態を順に試せます。下書きの定義、実行中の状態、検討用の機能を分けて説明します。

<details>
<summary>作業をまとめて終了する例</summary>

```
# ログイン
ログインボタン
> タップ(ログインボタン) -> present(ホーム, @loggedIn)

# タブバー
> タップ(ホームタブ) -> switch(ホーム, @loggedIn)
> タップ(検索タブ) -> switch(検索, @tabSearch)

# ホーム
タブバー
*記事
> タップ(記事) -> push(記事詳細)
> タップ(ログアウト) -> exit(@loggedIn)   // 開いていたタブ・詳細ごと畳んでログインへ

# 検索
タブバー
検索窓
```

この十数行で「ログアウトすると、検索タブに切り替えて記事詳細を開いていても、全部畳まれてログインへ戻る」まで決まる。ログアウト用の規則を書いたからではない。`exit(@loggedIn)` が、ログイン後に始めた作業を内側の作業ごと終了するためです。

</details>

## 書くのはラフ、検証は厳密

書き手が覚えるのは `#`（画面・部品）`##`（状態）`>`（操作）`->`（結果）と少数の遷移語だけ。未定は自然文で書いてよく、まだ定義していない画面へ遷移しても止まらない。穴があることが、下絵の機能である。

<details>
<summary>技術詳細：内部構造と検査</summary>

処理系は 40 種を超える診断とフレーム木の実行意味論を備え、タブやモーダル、セッションの畳まれ方まで追跡する。重さは書き手ではなく `check` が背負う。書くのは JS、検査は処理系という TypeScript の分担と同じ。

フレーム木の意味論からは、次がすべて規則の追加なしに導出される:

- タブ切替で各タブのスタックが保持される（`switch` の中断と復帰）
- モーダルの中で back しても外へ漏れない（`present` の back barrier）
- ログアウトで開いていたタブ・モーダルが子孫ごと畳まれる（`exit` の子孫破棄）
- deep link やプッシュ通知が「どの画面からでも」発火する（document common）

</details>

## AI の品質ゲート

LLM が書いた画面フローは、`check` で記法・参照・構造の整合性を検査できる。業務要件に合っているかは、人が期待する表示・戻り先・状態の残り方を書き、`simulate` の観測と照合して確かめる。自由文の「保存する」「認証する」などを実サービスとして実行せず、業務上の成功・失敗も自動判定しない。自然文のプロンプトと実装の間に置ける、検証可能な中間表現になる。仕様書（SPEC.md）だけを読んだ agent が検証を通るフローを書けることは、仕様のストレステストで確認済み（`docs/stress-test/`）。これは業務要件の正しさの採点とは区別する。

## パイプラインの中間層

```
自然文の要件 → shitae → Mermaid（図示）/ XState（状態機械）/ Figma・実装
```

shitae は条件式もデータもレイアウトも、意図的に持たない。厳密さが要る段階に来たら、それは shitae の仕事ではない。状態機械なら XState へ、見た目なら Figma へ降りる。出口が決まっている下絵である。

## 使い方

リポジトリのルートで、lockfile に固定された依存を準備し、各 package を build する。

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

### 検査して、二つのモデルをブラウザで開く

まず `check` でモデルと全 import 先を検査する。ここでは単一ファイルの EC と、module 分割されたスマートホームを使う。

```bash
node packages/cli/dist/index.js check docs/examples/ecommerce.shitae
node packages/cli/dist/index.js check docs/examples/smarthome/main.shitae
```

診断は標準エラー出力に出る。`[warning]` だけなら終了コードは 0、`[error]` があれば 1 になる。診断がなければ何も表示しない。error は直してから次へ進み、warning は内容を確認する。`simulate` の生成成功は、この `check` による全 import 先の検査を通ったことを意味しない。

`simulate` は HTML を標準出力へ書く。比較用には毎回新しい保存先を作り、モデルごとに名前を付ける。次は macOS の例（各 `open` は生成コマンドが成功した場合だけ実行する）。

```bash
sim_dir="$(mktemp -d "${TMPDIR:-/tmp}/shitae-sim.XXXXXX")"
node packages/cli/dist/index.js simulate docs/examples/ecommerce.shitae > "$sim_dir/ecommerce.html" &&
  open "$sim_dir/ecommerce.html"
node packages/cli/dist/index.js simulate docs/examples/smarthome/main.shitae > "$sim_dir/smarthome.html" &&
  open "$sim_dir/smarthome.html"
git rev-parse HEAD > "$sim_dir/shitae-revision.txt"
```

ブラウザで EC／スマートホームの画面名を確認してから操作すると、二つを取り違えずに比較できる。macOS 以外では、保存した HTML をブラウザで開く。`make simulate FILE=docs/examples/ecommerce.shitae` は build・生成・macOS でのブラウザ起動をまとめた入口で、毎回 `/tmp/shitae-sim.html` を上書きする。

### 共有する

閲覧する相手には生成済み HTML を渡せばよく、Node.js や元の `.shitae` は不要。編集・再生成する相手には、元モデルと全参照 module を相対配置を保って渡す。隣に `<モデル名>.simconfig.json` を置いている場合はそれも含める。どちらにも生成元の処理系版（上の `shitae-revision.txt` に保存した commit SHA）を添える。

生成 HTML には定義の要素名・操作名・文字列が含まれる（コメントと元ソースの bytes は含まれない）ため、内容を確認して共有範囲を決める。

結果の途中から分岐した記録を渡すときは、なぜその地点から分岐したかを添える。

問い・開始状態・期待する結果・維持する不変条件と、対応する HTML・再生ファイル・処理系版は、[引継ぎの記入形式と具体例](docs/HANDOFF.md)に沿ってまとめる。

### 図示・操作の照会

```bash
node packages/cli/dist/index.js mermaid <file.shitae>  # フロー図（Mermaid）
node packages/cli/dist/index.js session <file.shitae>  # 同じ process で操作を照会・実行
```

`session` は JSON Lines で操作一覧を照会し、分岐を選んで実行し、現在地を確認できる。通常応答は小さな summary と今回の receipt、操作一覧は選択に必要な情報に絞る。action/state/metadata/history/observation の詳細は必要なときだけ照会する。setTestVariant/reset と、同じ Session を使う GUI も提供する。[使用方法・CLI/ブラウザの実測](docs/design/session-usage.md) を参照。

## ドキュメント

- [docs/TUTORIAL.md](docs/TUTORIAL.md) — 一つの例で戻り先と状態の残り方を試す入門
- [docs/SPEC.md](docs/SPEC.md) — 言語仕様。唯一の正
- [docs/AI_GUIDE.md](docs/AI_GUIDE.md) — AI 向けの読み書きガイド
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — 概念語の用語集
- [docs/PRIOR_ART.md](docs/PRIOR_ART.md) — 先行技術と位置づけ
- [docs/examples/](docs/examples/) — 検証済みサンプル（parser 統合テストのフィクスチャを兼ねる）
- [docs/dogfooding/2026-10-13-standalone/](docs/dogfooding/2026-10-13-standalone/) — PFDSLを題材にした実使用の効果・負担・改善候補

## 名前

下絵（したえ）。完成画の前の下描き。uiflow の精神（「見るもの／すること」を繋ぐ）を継ぎ、画面と部品を component に統一し、AI との往復に最適化して再設計した。
