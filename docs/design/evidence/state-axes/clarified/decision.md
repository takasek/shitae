# #25 A 方針の採用記録

2026-10-18。設計者に原モデル→派生モデルの対応と C4 を説明し、Astra の独立検討後、設計者が「Aで進めよう」と指示した。**現在内容の妥当性を各時点で判定するモデルではなく、最後に受け取った構文判定を保持する限定した分析例**として採用する。

## 確認した意味

- `SyntaxStatus` は最後の ParseError / ValidInput の判定結果。初期 Valid は例の開始仮定。外部ファイルの内容を構文解析する機能を持たない。
- `DiskStatus` は未解決の外部競合の有無。`InSync` は競合なしで、source bytes の完全一致や保存済みを意味しない。
- 軸を分けることは、一つの出来事で両軸を更新してはいけないという制約ではない。本例は判定イベントと競合処理の出来事を分けて記述する。
- SaveCopy / ReplaceReviewedDisk は編集中の内容を置換しない。UseDiskVersion は内容を置換するが、新内容の判定結果は受け取っていない。後者から次の判定イベントまで、旧 SyntaxStatus / DiagramView は現在の内容・図の対応を示さない。
- この間、旧 Ready によりノード操作の gate が有効な場合もある。その有効性を新内容への操作の適切さ・実 focus 成功の証拠にしない。旧 Invalid なら Error と無効 gate が残るが、新内容が不正だと断定する根拠でもない。
- Unknown/Pending の導入や、内容置換直後の図操作制御を実装する B 方針は今回採らない。現在内容について各時点で答えるモデルが必要になった場合は別途設計する。

## 設計者が確認した対応

| 出来事 | 原モデルの書込み | 派生モデルの書込みと意味 |
| --- | --- | --- |
| ParseError | DocumentStatus Invalid | SyntaxStatus Invalid。競合を消さない |
| ValidInput | DocumentStatus Valid | SyntaxStatus Valid。競合を解決しない |
| Conflict | DocumentStatus Conflict | DiskStatus Conflict。構文判定を消さない |
| SaveCopy / ReplaceReviewedDisk 成功 | DocumentStatus Valid | DiskStatus InSync。構文の修復を意味しない |
| UseDiskVersion 成功 | DocumentStatus Valid | DiskStatus InSync。新内容の判定は別イベントまで未受領 |

同じ旧 Valid を操作の意味に応じて二つの軸へ分ける意図的な設計変更として確認した。UI を使った人の再検討実施を意味しない。

## 証拠の版と検証

[注釈付きモデル](model/proposed.shitae) は [既存の派生モデル](../model/proposed.shitae) のコメントだけを明確化した別コピー。元ファイル・既存の HTML/scenario・人/agent の旧報告は変更しない。コメント変更でも source-byte の識別は変わるため、新しい記録は別に作り、旧 scenario の書換えや移行は行わない。

検証入口は [verify.mjs](verify.mjs)。旧モデルとの非コメント行一致、既存保存物の旧モデルでの全 export 一致と注釈付きモデルでの拒否、旧 Valid / Invalid の両方からの UseDiskVersion、次の判定による更新を公開 CLI で照合する。結果は [verification.json](verification.json)。既存8組合せの照合は [axes-check.json](axes-check.json)。verification.json の応答は照合に使った共有状態・掲示・ノード操作・現在地へ投影し、scenario は別ファイルに全量保存する。これは CLI と保存証拠の照合で、実ブラウザ/実I/O/人の受取評価ではない。

## 完了範囲と後続

#25 はガイド、例・反例、組合せ検査、再検討の題材という完了単位で扱う。人による意味と対応の確認はこの記録に残す。人間の作者・受取人による利用評価、人向け UI を使った再検討は未実施のまま [#27](https://github.com/takasek/shitae/issues/27)／[#35](https://github.com/takasek/shitae/issues/35) に残す。A 方針の承認を人向け利用評価の成功に置き換えず、#27 全体を完了扱いにしない。

## 独立レビュー

[独立レビュー記録](review.md)。別担当による公開 CLI 再実行、既存証拠と注釈コピーの版、不足を受入済みにしない意味の限定、公開本文の元条件保持を確認。重要指摘なし。
