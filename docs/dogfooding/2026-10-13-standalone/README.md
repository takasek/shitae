# PFDSL standaloneを題材にしたshitaeドッグフーディング

2026-10-13、AstraとSolが独立に行ったUIレビューで、shitaeをどう使い、何が分かり、何に負担がかかったかを保存する。shitaeは表示の所属・寿命・戻り先を具体化し、提案モデル自身の誤りを発見する助けになった。一方、寸法や読みやすさの診断、実ファイル保存の安全性、操作時間の改善を証明するものではない。

## 対象版と保存版

| 項目 | 版 |
| --- | --- |
| 最終PFDSL評価対象 | [`83701fb03e7846fe9582a3ae3b685d624f681902`](https://github.com/takasek/pfdsl/commit/83701fb03e7846fe9582a3ae3b685d624f681902) |
| shitae評価対象 | [`a3ebaedbd5d452c99093a949bbaf94508da43ab4`](https://github.com/takasek/shitae/commit/a3ebaedbd5d452c99093a949bbaf94508da43ab4) |
| 保存作業の起点HEAD / 取得したorigin/main | `a3ebaedbd5d452c99093a949bbaf94508da43ab4` |
| 保存branch | `codex/dogfooding-reports-20261013` |
| レポート保存commit | このファイルを含むcommitをGitHubの履歴から参照。評価対象版とは別の版 |

PFDSLの一次分析・native/webの観察根拠・UI改善提案は、PFDSL側の保存commit `74c5183c59cf989fe9052ca953dced0324410ae9` に保存した[保存索引](https://github.com/takasek/pfdsl/blob/74c5183c59cf989fe9052ca953dced0324410ae9/docs/reviews/standalone/2026-10-13/README.md)・[Astra一次分析](https://github.com/takasek/pfdsl/blob/74c5183c59cf989fe9052ca953dced0324410ae9/docs/reviews/standalone/2026-10-13/astra/review.html)・[Sol一次分析](https://github.com/takasek/pfdsl/blob/74c5183c59cf989fe9052ca953dced0324410ae9/docs/reviews/standalone/2026-10-13/sol/review.md)・[親の比較](https://github.com/takasek/pfdsl/blob/74c5183c59cf989fe9052ca953dced0324410ae9/docs/reviews/standalone/2026-10-13/comparison.html)。同分析をここへ重複コピーしない。

## 両レポート

| 評価者 | レポート | 効果と負担の主な観察 |
| --- | --- | --- |
| Astra | [公開保存版](astra/report.md) | 保存表示の文書帰属、図からソースへの戻り方、正規化結果の寿命を操作列で共有。inlineを書き直す負担、裸gotoのモデル誤り、pipe出力切断 |
| Sol | [効果と負担](sol/shitae-payoff.md) / [改善メモ](sol/shitae-features.md) | 復旧通知の残存による提案モデル自身の二重入口を修正。表示モードと空の状態を点検。alias gate、入れ子状態の確認、葉の警告の負担 |

モデルはAstraの現状・提案・inline最小例、Solの現状・提案・復旧の6本を最終ローカル成果物から同じバイト列で保存した。元のローカル成果物は保持する。AstraはHTMLメモをMarkdownへ再構成し、SolはMarkdownの本文を保ってリンクと保存状況を調整した。[SHA256台帳](evidence/source-manifest.json)は原モデル・Mermaid・選択したsimulator観察の同一性を記録する。HIG本文、私的な絶対パス、PFDSLの画面証拠や一次分析は含めない。

[検証記録](validation.md)は評価時のブラウザ観察と保存時の再検証を分ける。[改善候補対応表](candidates.md)は両メモの重複・統合・保留と新規issueへの対応を記録する。SPECへの転記や機能の採用決定は今回行わない。

## モデルを再実行する

リポジトリrootで固定lockfileの依存を準備しbuildする。指定評価版のCLIではpipe出力が切れるため、simulateは通常ファイルへ直接出す。

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/index.js check docs/dogfooding/2026-10-13-standalone/sol/models/proposed.shitae
node packages/cli/dist/index.js simulate docs/dogfooding/2026-10-13-standalone/sol/models/proposed.shitae > /tmp/shitae-dogfood-proposed.html
python3 docs/dogfooding/2026-10-13-standalone/verify.py
```

HTMLをブラウザで開き、Sol proposedはSplit→Source→Diagram→NodeDoubleClick→Split、Conflict→Review→KeepEditing、ParseError→DiagramOnly→ValidInput→NodeDoubleClick、CloseLastDocumentを試す。Astraは開始画面の「開く」から文書Aを開き、編集→保存[成功]→切替(B)→編集、図のみ→ノードからソースへ、外部変更確認→確認→取消を試す。具体的な操作名は各モデルを参照する。condition labelは手で選び、自由記述effectを実処理の成功と扱わない。

verify.pyはモデルのcheck、保存Mermaidとの一致、通常ファイルのHTML終端・UTF-8・埋込みJS構文、pipe捕捉3回、runtime-probes.mjsの限定VM観察をJSONへ記録する。再実行はevidence/validation.jsonを更新する。macOS以外の出力、通常打鍵・IME・VoiceOver、native保存、任意数の文書、実データ競合の受入は別作業。
