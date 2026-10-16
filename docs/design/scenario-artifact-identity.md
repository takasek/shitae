# 保存物と版の対応付け

Issue [#24](https://github.com/takasek/shitae/issues/24) の診断と表示。既存の [scenario保存契約](scenario-replay-contract.md) と [操作来歴](session-provenance.md) を使い、scenario形式、digest投影、実行意味、engine hash入力範囲は変更しない。

## 不一致を読んで次の行動を選ぶ

CLIの `session <file> --replay <scenario.json>` とGUIの読込は同じ照合を使う。最初にerror code、短い理由、次の行動を示す。CLIは失敗終了（exit 1）、GUIは読込前のSession・来歴・操作可能性を保持する。

| 照合結果 | 理由の表示 |
| --- | --- |
| ENGINE_MISMATCH | 処理系が異なり、モデルは未照合。sourceが同じとは断定しない |
| MODEL_MISMATCH | エントリの保存時→現在、現在のmodule追加/不足、共通moduleのsource bytes差を列挙する。空白・コメントも対象 |
| 上記の差がなくmodelIdだけ異なる | modelIdの相違を示し、完全な識別情報の確認を促す |

完全一致する保存時のHTMLが残っていれば、そのHTMLとscenarioの組で再開する。任意の古いHTMLでは再開できない。CLIには対応する元モデル一式と処理系が必要で、engine hashだけからcommitは特定できない。変更後のモデル・処理系で検討する場合は新しく記録する。旧版の検討手順は人が選び直すための参照に使う。

完全な期待値（scenario側）と実際値（現在のモデル側）は、CLIのメッセージ末尾とGUIの「完全な期待/実際の識別情報」に残る。ライブラリの `ScenarioError.diagnostic` でも `reasons`、`nextActions`、`modelChecked`、`expected`、`actual` を参照できる。これはエラー用の読取情報で、scenarioの永続fieldではない。双方のengineVersion、modelId、entryModule、sourceBasis、manifestの全module/sourceSha256を保持する。

## 保存前・読込後

GUIにはこのHTMLのentry、modelId/engineVersionの先頭12文字を常時表示し、版の詳細には完全な識別情報を示す。保存名は `<entryの末尾>.<modelIdの先頭12文字>.<engineVersionの先頭12文字>.scenario.json`。ファイル名に使いにくいentryの文字は `_` にする。短縮IDは対応付けの補助で、読込は全識別情報を厳密照合する。同じ短縮IDの別modelIdも拒否する。

保存前は `provenanceSummary.steps` からdispatch・seek・reset・手動試験の件数を表示する。条件選択はdispatchの内訳として操作来歴で読む。読込成功時も同じ種類別件数を示し、step合計を操作件数とは呼ばない。保存には現在までの経路だけでなくghost、破棄済み経路、reset前、手動試験も含む全journalが入る。

scenarioにはモデル本文・DOM・表示設定は含まれない。共有して再開するには対応HTMLとscenario、編集・再生成/CLIには全モデル・参照moduleと対応処理系が必要。simconfigで共有できるのは遷移マップの分割設定であり、checkboxの表示状態は保存しない。読込後は現在のcheckbox等をそのまま使う。

検証と独立受取の結果は [受入記録](evidence/artifact-identity/acceptance.md) を参照。#27全体の統合利用評価と#28のsingleton要約/パス整理は別範囲。
