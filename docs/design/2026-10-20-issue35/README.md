# Issue #35 設計レビュー資料 v3.2

2026-10-20の追加指示により仕様反映・実装へ進んだ。[実装記録と製品生成HTML](implementation/README.md)を参照。以下の設計検討・旧版・評価証拠は実施時点の記録として保持する。

目的は生成HTMLで「履歴を調べる → 過去画面を見る → そこから操作を再開する」を、意図と結果を理解して行えるようにすること。2026-10-20にoriginをfetchし、main `022e8493e4bea272a552a5908abbd844ae5b1569` を固定した。engineは生成HTMLとCLIの証拠に記録する。PFDSL実案件の評価対象版は固定していない。

これは設計提案であり、製品実装・SPEC・既存ガイド・既存モデル・旧証拠を変更しない。issue更新、commit、push、PR作成はしない。人向け受入は未完了のまま。AI確認は人間の使いやすさの証明ではない。

## 最新の入口

前回の使い心地の指摘を受け、説明文・比較用履歴・対応資料を改訂した。[v3.2の案と範囲](v3/README.md)、[改訂UI](v3/standalone-preview.html)、[再現資料](v3/materials/guide.html)、[再試行報告](v3/usability/report.md)、[採用した統一用語](v3/terminology.md)を参照。以下のv1/v2は設計経緯と状態契約の検証資料として残す。

## 入口と三つの設計対象

| 対象 | 独立成果物 | 問い |
| --- | --- | --- |
| A 履歴閲覧・参照・再開の情報と操作 | [A-history.md](A-history.md)、[参照寿命の検討モデルv2](models/v2/history-flow.shitae) | 詳細を開く、画面を見る、実行位置を変える、を事前に区別できるか。結果途中と未来・破棄を誤認しないか |
| B 表示位置と変化の追跡 | [B-position.md](B-position.md) | 詳細や参照を開いても読んでいた位置と焦点を追えるか |
| C 読込要約の範囲と全共有状態への案内 | [C-load-summary.md](C-load-summary.md) | 要約から画面外の共有状態を推定せず、必要時に全状態を確認できるか |

[現状と再現](current-findings.md)、[状態・操作と事前期待](model-expectations.md)、[比較用UI](ui-proposal.html)、[評価記録](evaluation.md)、[独立引継ぎ](review/brief.md)も参照。UI案は架空データの静的検討用。生成HTMLはモデル状態の検討用で、両者を製品実装と扱わない。

## 変更管理と引継ぎ

初版v1では旧設計reviewなし。v2時点では、[独立再確認](review/independent-v2.md)まで完了。既存評価の入口は `../../dogfooding/2026-10-20-end-to-end/README.md` と `../evidence/integrated-use/human-stage1-feedback.md`。案を変えた場合は旧reviewを保持し、変更点と再確認する問いをここへ追記する。

引継ぎ先には目的・問い・版・成果物入口を渡し、作者の会話と正解の操作列は渡さない。再入力・追加照会・質問はreview側の記録を正とする。現行HTMLの再現は今回の固定版から再生成したもの。過去の人のランダムウォークを再演・経路分析したものではない。

## v1内の表示検討改訂

比較用HTML初版で見出しの約80px移動を観測し、旧版を [ui-proposal-v1.html](ui-proposal-v1.html) に保持してviewportとanchor管理を修正した。設計の目的とモデルは変更なし。この改訂時点では旧reviewはまだなく、初回の独立確認が進行中だった。再確認する問いは「表示中の見出しの開閉・参照・復帰で位置が維持されるか」。結果はevaluation.mdに記録した。保存契約の読取で無観測no-op/拒否は未来を破棄しない点をA案に明記した。

## v2：独立確認後の改訂

旧review: [independent-v1.md](review/independent-v1.md)。旧モデル・生成HTML・scenario・7経路証拠は元の場所に保持。旧A案と期待は [review/source-v1](review/source-v1/) に保存した。

変更点は参照の寿命。未来を参照中の別操作で対象が破棄された場合の解除、B/C切替時の旧参照の除去、無効対象の表示解除を派生モデルへ追加し、A案に実行command・reset・読込成功/失敗・拒否の扱いを明記した。模型のコメントも「確定と新しい操作が実行位置を変える」と訂正。UI案の破棄説明へ無観測no-op/拒否の例外を補足した。

再確認する問いは「失効した参照や再開入口が残らないか」「参照を切り替えたとき旧対象が残らないか」「保存契約の例外と表示文言が一致するか」。最終候補は [v2モデル](models/v2/history-flow.shitae)、[v2生成HTML](evidence/v2/model.html)、[v2再開scenario](evidence/v2/resume.scenario.json)、[9経路結果](evidence/v2/model-results.json)。モデル内の「実行位置」は検討対象のUI状態、外側のsimulatorの「現在地」は模型を動かしているSessionの位置であり、別のもの。

引継ぎの入口もv2のHTML/scenarioに更新する。旧scenarioをv2に読み込ませず、同じ問いを新しい模型で記録する。追加質問・照会・再入力は [v1独立記録](review/independent-v1.md) とv2再確認記録へ分ける。独立agentのGUI読込はツール待機で未確認、CLIでの継続・再保存は確認済み。

## 現在の設計状況

三件の対応表と残件は [設計レビュー提出表](review-ready.md)。v2独立確認は指摘対象4検査を通過し、新しい必須修正指摘なし。その後、ユーザーの依頼でv3の利用試行と説明・資料の改訂へ進んだ。製品・SPEC・既存ガイドへの反映は行っていない。

成果物を再実行する場合は新しい出力ディレクトリを用意する。補助scriptは実施記録であり固定出力先を持つため、保存済みevidenceやreviewを上書きせず、コピーして出力先を変更すること。生成HTMLは `node packages/cli/dist/index.js simulate <対象モデル> > <新しいHTML>` で生成できる。source bytesが異なるv1とv2のscenarioは交換しない。
