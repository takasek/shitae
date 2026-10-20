# 独立再レビュー v2

対象は brief-v2.md の範囲。固定製品版はmain 022e8493e4bea272a552a5908abbd844ae5b1569。v1レビューを保持し、模型v2と追加設計を再確認した。作者補助scriptは使用していない。

## 判定

v1のP2とP3は今回確認した範囲で解消。新たな必須修正指摘なし。設計レビューとして次へ渡せるが、製品実装・人の受入が済んだという判断ではない。

| 対象 | 一次資料・実測 | 結果 |
| --- | --- | --- |
| C参照中の別操作 | models/v2/history-flow.shitae:65、独立CLI | resume→C参照→別操作で実行位置=新経路、未来=破棄、参照=現在。B/C参照overlayなし、Cへ進めるactionなし |
| 参照切替 | models/v2/history-flow.shitae:40-42、独立CLI | B→C→Bで実行位置Bを保持し、対象overlayのみが残る |
| 無効対象 | models/v2/history-flow.shitae:60 と77、独立CLI | BとCの各再開確認で対象が無効を選ぶと、実行位置Bを保持して参照=現在、参照不可を表示。B/C参照overlayなし |
| 寿命規則 | A-history.md:56-60 | 受理command、no-op、拒否、query、表示設定、reset、成功/失敗loadを区別し、失効時の表示解除を明記。A5として観測可能 |
| 破棄説明 | ui-proposal.html:6 | 新しい状態点を作る操作と無観測no-op・拒否の例外を明示し、A案と一致 |
| 常設案内 | C-load-summary.md:15、ui-proposal.html:9-11 | 版の詳細内に入口があり、クリックで案内detailsを開いてscroll/focusするコードを確認 |
| コメント | models/v2/history-flow.shitae:3 | 新規操作と移動確定を列挙し、実体と一致 |

公開CLI4 process、query15（state/actionsを併合）、dispatch11、計26要求。元操作列の再入力0、追加質問0。再現用scriptは independent-check-v2.py、全要求応答は independent-cli-v2.json。モデルcheckは終了コード0・診断なし。今回export/replayの追加往復は不要と判断し、v1の保存確認をv2保存形式の独立検証と称していない。v2 resume自体は4 processでreplay成功した。

## 制限と引継ぎ

今回はCLIと一次資料の確認。GUIはv1で接続不能になったためv2再操作をしていない。常設案内のfocus/scrollが実ブラウザで期待通りかは未確認。UI模型は成功通知が消える製品挙動を再現しておらず、案内先が通知とともに削除されないことは製品実装時に確認する。条件ラベルは外部選択なので、無効条件の自動検出を実証したものではない。

模型は固定代表点であり、確認中の別操作など全ての操作インターリーブを網羅したとは扱わない。A5に残したreset/load/no-op/拒否や、実装の世代/revision照合・参照不変性・複数点/混在・Bの位置追跡・Cの人の完遂評価は未完了。製品コード・SPEC・旧模型・旧証拠・旧reviewは編集していない。
