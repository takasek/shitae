# 現行UI・既知報告・今回の確認

最新本文・コメントは [#35](evidence/issue35.json) と [#27](evidence/issue27.json) に保存。取得時はいずれもOPEN、コメント0件。#35参照の人の報告は `../evidence/integrated-use/human-stage1-feedback.md`。PR #37の README/report/candidates を読み、AI利用成功と人向け受入を区別した。

| 論点 | 既知の人の報告 | 現行実装で分かること | 今回の再現 |
| --- | --- | --- | --- |
| 詳細と巻戻し | イベントクリックの結果が予測しにくい | 操作見出しはtoggleProvenanceStep、点はseekProvenancePoint | 見出し展開後dispatch10/seek0のまま。結果点を押すとseek1、現在地は記録5、未来5点へ |
| スクロール | 最上部へ戻る | renderがapp.innerHTMLを置換。capture/restorePresentationはdetails/focusのみ | 実ブラウザで履歴scrollTop720から記録5の見出しを展開すると0へ。focusもweb areaへ戻った |
| 過去画面の参照 | 揮発的に画面を見たい | GUIに参照入口なし。Sessionのobservation queryは保持点のstateとhandleなしactionsを返す | 現行GUIのボタンは実際のseek。提案の読取専用表示は未実装 |
| 読込要約 | #37受取人はBをstateと切替で追加確認 | main/overlayの包含とmember gateのsingletonだけ。5件超は折畳み。読込時点を保持する | 今回は実装読取と旧評価の照合。現行のファイル読込は新規再操作していない |
| 情報量 | 用語、module ID、一覧がフラット | 見出し直下にhost/module/配置/件数、破棄参照の全列挙 | 生成HTMLの目視・AXで確認。人の効率や理解は測っていない |

再現手順: `expenses.shitae`（既存s1-revised原本）を今回のCLIで生成 → 領収書照合が完了するを10回 → 左ペインを1ページ下へ → 記録5の見出し展開 → 記録5の結果1点を選択。これはスクロールを発生させる固定手順で、過去の人の操作列ではない。最初の実行時に右ペインへブラウザがスクロールしたため、右のtop値の原因までは今回切り分けていない。左ペインの明示スクロールと展開についてのみ再現を主張する。

一次コード: `packages/simulator/src/gui-session.js:8-12`（展開/seek）、`:24-58`（来歴表示）、`:79-111`（要約）、`:286-299`（表示状態保持）、`packages/simulator/src/simulator.ts:1262-1289`（DOM置換）、`packages/session/src/index.ts:355-365`（observation）、`:443-445`（sharedVariants）、`:470-477`（seek）。診断IDや現行表示を削除するのでなく、詳細へ収める案を検討する。
