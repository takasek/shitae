# Issue #67 の検証記録

実施日: 2026-10-23 JST。起点: `eefea25`（#64〜#66 の修正を含む）。

## 変更と確認範囲

入口の説明を既存の詳説へ揃え、GLOSSARY に名前の識別単位をまとめた。DSL・API 名・構文・runtime の動作は変更していない。overlay の行は Accepted の ADR-0026 に従う。W105 は診断文のみを変更し、結果列追跡・履歴依存時の保留を維持した。「残っている作業」は文言と説明のみを変更し、`activePath` 外のフレームを数える式を維持した。文書内の fenced code と example フィクスチャは変更していない。

## Red → Green

- checker に包含部品・overlay の定義内操作の診断文を確認するテストを先に追加。変更前は `操作開始時は定義元を作用先と仮定` が診断文に無く失敗（1 failed / 74 passed）。
- GUI に祖先と経路外のフレームを区別するテストを先に追加。変更前は `残っている作業（現在の経路外 0件）` が無く失敗（1 failed / 284 passed）。
- 文言修正後、既存の表示期待値を更新し、checker 75件・simulator 285件が成功。新テストは現在経路の祖先を除外した0件、別経路で2件、子作業への復帰後1件を確認する。既存テストは閲覧による状態非変更、作業終了による件数減少も引き続き確認する。

## 全体検証

- `pnpm -r build`: 成功。
- `pnpm -r typecheck`: 成功。
- `pnpm -r test`: 898件成功（parser 246、runtime 103、resolver 37、checker 75、transpiler-mermaid 35、transpiler-xstate 20、session 43、simulator 285、cli 54）。
- `git diff --check`: 成功。
- 別 agent による読取専用の独立レビュー: Issue 本文・SPEC・ADR-0026と差分を照合し、修正が必要な問題なし。checker と GUI 関連3ファイルの計81テストを独立実行して成功。

## 実ブラウザー

CLI の `check` を通した次のモデルから `simulate` で HTML を生成し、in-app browser で操作した。

```shitae
# Home
> Aへ -> switch(A, @a)
# A
> 子作業へ -> present(Child, @child)
# Child
> Bへ -> switch(B, @b)
# B
> 子作業に復帰 -> switch(Child, @child)
```

「Aへ → 子作業へ」の時点で0件、祖先の Home / A は「現在の経路」と表示。「Bへ」で2件となり A / Child が「現在の経路外で保持」と表示。「子作業に復帰」で1件となり、Bだけが経路外と表示された。展開時の件数の説明と祖先を除外する説明も目視確認した。

これは文言・集計・表示の実装検証であり、人の誤予測が減ったかを確かめる利用評価は実施していない。
