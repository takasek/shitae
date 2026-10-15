# #11 実装の独立レビュー

2026-10-15。承認済みの [契約](../../scenario-replay-contract.md) と一次コード・最終差分を、実装会話を引き継がない別agentに渡した。編集・commit・push・外部書込みを禁止した。共通処理とCLI/GUI接続は別のreviewerが点検した。

## 共通Session

`review_scenario_core` がscenario/index、metadata/model/views、runtimeと既存契約・関連テストを照合し、Sessionテストと独立probeを実行した。

P2二件を指摘。final.viewの内部schemaを検査せず、壊れた保存物でdispatchが走ってから失敗することと、output/観測値の不一致を同じafterDigestで説明することを再現した。親側で失敗テスト2件を先に追加し、2 failed / 29 passed後に修正。包含とgateの条件付き必須fieldにも残りがあったため、component/inline/unresolved、host/member/inline gateの判別をまとめて検査した。各欠落の失敗テストを先行し、hash失敗時のexport拒否も追加した。

再レビューは、包含reference/value・対象付きgate value欠落がdispatch 0回でSCENARIO_FORMATとなり、未解決/循環包含・未解決member gateの正規保存物は再生できることを確認。不一致pathと異なる期待/実値も確認し、元の二指摘を解消とした。Session 32件・typecheck成功。異realmのplain objectは受理し、Date/Map/class instanceは拒否することも確認。残る指摘なし。

## CLI/GUI接続

`review_scenario_integration` がCLI起動/protocol、生成GUI・イベント接続とテストを点検した。CLI session 8件とGUI scenario 3件を実行し、実CLI A → 生成GUIのVM → 実CLI Bの3 step往復を独立probeで確認。全文scenario一致、旧handle拒否、不一致読込時のlive state/history/actions/handle不変を確認した。

P2一件。遅いfile.text()が後続読込後に完了すると古い状態が最新読込を上書きする競合を再現。親側で読取遅延・重複読込・live command・読取失敗を含むテストを追加し、1 failed / 3 passed後、読取開始から排他するよう修正した。

再レビューは、先行読取待ちの間に後続ファイル読取が始まらず、live操作もstate/history/handleを変更しないこと、読込後の排他解除と次の読込、読取失敗時の状態保持・エラー表示・排他解除を独立probeで確認。GUI scenario 4件成功。元指摘解消、追加指摘なし。

## 証拠の区別

reviewerのGUI確認はVMであり、実ブラウザ操作ではない。親側が [実ブラウザ観察](browser-observation.json)、[CLI→ブラウザ](browser-cli-to-gui.json)、[ブラウザ→新CLI](browser-to-cli.json) を別途記録した。TDDのRed自体をreviewerが全件再実行したとは扱わない。[受入記録](../../scenario-replay-acceptance.md) に実装検証と残る証拠の限界を示す。

同じ統合reviewerが最終の契約・使い方・受入記録と保存物を読戻し、画像では表示checkboxがonであるのにoffのままと書いた不一致を一件指摘した。読込成功後に手動でonへ切り替えてから撮影した時系列に訂正した。4モデルのsidecar bytes/hash・model/step/final、A終了後のB起動時刻、検証件数の合算、GUIの3 stepとghost三件は保存証拠と一致し、他の矛盾はなかった。reviewer自身の実ブラウザ操作とはしていない。
