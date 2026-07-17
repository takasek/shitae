# shitae

**ラフに書けて、遷移が動く。UI フロー記述言語。**

その画面フロー、ログアウトでタブは全部畳まれますか。deep link から back したらどこへ戻りますか。モーダルを重ねて dismiss したら何が閉じますか。

shitae は、これを実装前に確かめるための言語。画面フローを数行のテキストで書けば、`check` が診断し、`simulate` がブラウザでタップして歩ける画面遷移になる。

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

この十数行で「ログアウトすると、検索タブに切り替えて記事詳細を開いていても、全部畳まれてログインへ戻る」まで決まる。`exit(@loggedIn)` がセッションを子孫フレームごと破棄する——規則の追加なしに、フレーム木の意味論から導かれる。

## 書くのはラフ、検証は厳密

書き手が覚えるのは `#`（画面・部品）`##`（状態）`>`（操作）`->`（結果）と少数の遷移語だけ。未定は自然文で書いてよく、まだ定義していない画面へ遷移しても止まらない——穴があることがラフスケッチの機能である。

一方で処理系は 40 超の診断とフレーム木の実行意味論を備え、タブ・モーダル・セッションの畳まれ方まで追跡する。重さは書き手ではなく `check` が背負う。書くのは JS、検査は処理系という TypeScript の分担と同じ。

フレーム木の意味論からは、次がすべて規則の追加なしに導出される:

- タブ切替で各タブのスタックが保持される（`switch` の中断と復帰）
- モーダルの中で back しても外へ漏れない（`present` の back barrier）
- ログアウトで開いていたタブ・モーダルが子孫ごと畳まれる（`exit` の子孫破棄）
- deep link・プッシュ通知が「どの画面からでも」発火する（document common）

## AI の品質ゲート

LLM に画面フローを書かせ、`check` で機械採点し、`simulate` で歩いて確かめる。自然文のプロンプトと実装の間に置ける、検証可能な中間表現。仕様書（SPEC.md）だけを読んだ agent が検証を通るフローを書けることは、仕様のストレステストで確認済み（`docs/stress-test/`）。

## パイプラインの中間層

```
自然文の要件 → shitae → Mermaid（図示）/ XState（状態機械）/ Figma・実装
```

shitae は条件式・データ・レイアウトを意図的に持たない。厳密さが要る段階に来たら、それは shitae の仕事ではない——状態機械なら XState へ、見た目なら Figma へ降りる。出口が決まっている下絵である。

## 使い方

```bash
pnpm install
make build

node packages/cli/dist/index.js check    <file.shitae>   # 診断
node packages/cli/dist/index.js mermaid  <file.shitae>   # フロー図（Mermaid）
make simulate FILE=<file.shitae>                          # ブラウザで歩ける simulator
```

## ドキュメント

- [docs/SPEC.md](docs/SPEC.md) — 言語仕様。唯一の正
- [docs/AI_GUIDE.md](docs/AI_GUIDE.md) — AI 向けの読み書きガイド
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — 概念語の用語集
- [docs/PRIOR_ART.md](docs/PRIOR_ART.md) — 先行技術と位置づけ
- [docs/examples/](docs/examples/) — 検証済みサンプル（parser 統合テストのフィクスチャを兼ねる）

## 名前

下絵（したえ）。完成画の前の下描き。uiflow の精神（「見るもの／すること」を繋ぐ）を継ぎ、画面と部品を component に統一し、AI との往復に最適化して再設計した。
