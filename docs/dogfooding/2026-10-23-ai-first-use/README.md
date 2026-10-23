# 初見AIによる利用評価（2026-10-23 JST）

評価 SHA: `85f502b69ba66c5629c24524ff74aaa76ee3d196`。

利用者は人による受取評価をまだ行わず、shitaeをAI用として、事前知識のないsubagentに使わせる評価を依頼した。会話を継承しない新しいAIに自然文の目的と公開文書の入口を渡し、作成・検討・保存・変更・他のAIへの引継ぎを試す。

## 評価対象と隔離

固定版は進行中PR #77のhead。製品はmain `e13e3ef20d1f4328efdcc5817dbd3a62d4ebfa92` と同じで、追加はGUI検証記録だけ。既に公式手順でbuild済みのCLIを使い、途中で更新しない。親は進行役と証拠の照合を担当する。

- 作成担当は会話履歴なし。題材は固定の代表備品1件の貸出。取消する入力と確定依頼の残り方を自然文で提示し、表現方法・モデル・操作列の解答を渡さない。
- 公開READMEから始め、必要なAI_GUIDE・SPEC等を読むことは許可する。過去評価、既存の解答モデル、改善候補、処理系実装・テストは読まない。
- 読んだパス、操作前の期待、発見・誤り・再照会・再入力を記録させる。ブラウザーも自分で作ったタブで操作し、内部Session注入で代替しない。
- 受取担当も会話履歴なし。元の人向け課題と同じ、既存の見学予約v2のHTML・scenario・処理系版だけから始める。公開README等は必要時に参照できるが、作者のbrief・report・会話・操作ログ・補助scriptは渡さない。初期推測を保存した後、本人が求めた元モデル1件を追加提供し、公開CLIでの再開・継続・小変更を評価する。新規備品モデルの独立引継ぎまで成功したという主張はしない。
- 同じfilesystemにアクセスでき、共通指示やshitaeに関する履歴メモリが注入される場合があるため、隔離は指示と読取・利用申告による。会話履歴を継承しないことと、知識が完全にゼロであることを同一視しない。公開文書の過去評価要約やリンクが目に入る限界も記録する。完全に知識を消したモデル、人間の初心者、一般的な成功率を測ったとは扱わない。

## 範囲

製品と既存ガイドは修正しない。新しいモデル・HTML・scenario・実行証拠・報告をこのディレクトリに追加する。人による正式評価は保留で、この作業の待機条件にはしない。AI評価が成功しても人向け受入を完了にしない。

最終結果は [report.md](report.md)、各担当の記録は [作者](author/report.md) と [受取側](recipient/report.md)、初期推測は [stage1](recipient/stage1.md)。[独立レビュー](independent-review.md)は指摘なし。完全な保存物索引は [scenario-index.json](evidence/scenario-index.json)。評価中に製品版を変えず、不具合と模型の誤り、意図した制約、利用上の負担を区別する。

## 確認済みの結果と再実行

作者は公開CLIでv1が9 dispatch、v2が8 dispatch。受取側は既存記録に3操作を加えた12 dispatchと、変更後の9 dispatchを記録した。check・同版別process再生・旧scenario拒否を照合済み。独立レビューでも主要4モデルのcheck・再生と2件の旧記録拒否を確認した。実GUIは両担当とも未確認。人による受取評価・CLI負担は保留。

同じ処理系版で公式手順に沿ってbuildし、対応するモデルと保存物を指定する。原模型・保存物のbytesを変えない。

```sh
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-ai-first-use/author/v2/equipment.shitae --replay docs/dogfooding/2026-10-23-ai-first-use/author/v2/confirmed.scenario.json
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-ai-first-use/recipient/changed/visit.shitae --replay docs/dogfooding/2026-10-23-ai-first-use/recipient/changed.scenario.json
```

同じprocessへ `{"id":"inspect","command":"query","select":["state","actions"]}` を送る。既存の担当scriptは既存出力へ保存するため、過去証拠を上書きする再実行はしない。新規出力先と公開CLIを使う。製品や共通テストは変更せず、前回の898テストを今回再実行したとは主張しない。
