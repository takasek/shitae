# GUI保存ファイルの再作成版（2026-10-23）

**この2ファイルは当時のダウンロード原物ではありません。保存済みの同じモデル・HTMLと操作記録を使い、2026-10-23に初期状態から全操作をGUIでやり直して、新しく保存した再現品です。**

当時はChromiumの保存完了表示まで確認しましたが、実ファイルの保存先と回収は未確認でした。今回、以前の作業領域とブラウザの3タブは残っておらず、現在のダウンロード履歴・保存先にも該当ファイルがありませんでした。環境の置換・初期化と整合し、旧原物は回収できません。元レポートの「実物回収・CLI再生未確認」は、当時の検証結果として有効です。

## 内容と対応関係

- `exports/r2_1-gui48-recreated-20261023.scenario.json`
  - 原版48操作地点の再現。保存日時: 2026-10-23 08:37:16 UTC。
  - 対応ソース: `models/r2_1/main.shitae` と同フォルダの全11ファイル。
  - 対応GUI: `html/r2_1.html`。
- `exports/refactor-candidate-gui11-recreated-20261023.scenario.json`
  - 保守版11操作地点の再現。保存日時: 2026-10-23 08:38:24 UTC。
  - 対応ソース: `models/refactor_candidate/main.shitae` と同フォルダの全11ファイル。
  - 対応GUI: `html/refactor_candidate.html`。
- 全操作と分岐: `OPERATIONS-ja.md`。

2つは異なるモデルです。元版と保守版のファイルを混ぜず、上記の対応する組で利用してください。HTMLを開いた直後は初期状態です。保存済み地点そのものはscenarioファイルに記録されています。

## 今回確認したこと

- dotのクラウドChromiumで、公開GUIのボタンだけを使い、原版48操作と保守版11操作を初期状態から実行。既存scenarioのGUI読み込み、CLIからの状態生成、内部Sessionへの操作は使っていません。
- 原版は22操作目をaccepted、28操作目をrejected、保守版は9操作目をrejectedにしました。
- 各GUIの通常保存ボタンをクリックし、完了したdownloadイベントが返した実ファイルを回収・コピーしました。scenarioの内容やIDは書き換えていません。
- 両モデルの全ソースハッシュは保存済みの版と一致。HTMLも保存済みのものを無変更で使用しました。
- 原版の最初の38操作は、当時の38操作scenarioとcommand・各操作後digest・出力digestが全件一致しました。
- 原版39–48と保守版1–11は当時の操作記録に従い、次の到達状態をGUI表示と保存ファイルで照合しました。

原版48: 進行中一覧。A/Bとも未完了の変更作業なし。確定枠はAが月曜10時、Bが火曜14時。公共バナーだけが表示され、私的リマインダーバナー・通知詳細は表示されません。

保守版11: Rooms起点の予約A、代替枠を拒否されたレビュー。提案は月曜14時、確定枠は月曜10時のまま。Cancel後の「編集を続ける」で同じレビューに戻っています。

原版48の「画面外1件」は新しいRoomsタブの保持であり、A/Bの未完了変更作業ではありません。また、私的通知の非表示は表示・遷移の寿命についての確認で、診断値や履歴の消去を保証するものではありません。

旧原物がないため、旧GUI保存ファイルとのバイト同一性は確認できません。スクロール位置や折りたたみ状態までの再現も対象外です。

## 版とハッシュ

製品pinned commit: `0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5`

engineVersion: `278103a97da5319e8f97bb3218d6508b7cfd2a8d3ebd479aed3faf00f75f5116`

原版modelId: `88789ce38767530fd605c87247e26ed1a0d5122317222a6f1a10a695561f8a68`

保守版modelId: `4414378de007989846245b95fbd8488f675ae52ebb9259485b0915bafb8e433e`

SHA-256:

- 原版GUI48: `d231ebd15c917fb0095fac35bf935f430b41e6bf3645a2d4301b1486eaa45dd2`
- 保守版GUI11: `b6f8c413877c7fa0077c07517d5dbe829251ad07e469228d6178efbf180f4cf5`
- 原版HTML: `beef718efb854398ea7246d815839ad25089df47a8bf0ce1e0a4b461c08ab14d`
- 保守版HTML: `819a481950a43b5ea6d6d1a8dfd669f49bf99d5d878631e2b30d1feca270a580`

## 公開CLIでの再生方法

上記pinned版のshitae CLIを用意し、CLIの実ファイルをSHITAE_CLIに指定して、展開したフォルダから実行します。製品CLIと依存パッケージはこの配布物に含めません。

```sh
node "$SHITAE_CLI" session models/r2_1/main.shitae --replay exports/r2_1-gui48-recreated-20261023.scenario.json
node "$SHITAE_CLI" session models/refactor_candidate/main.shitae --replay exports/refactor-candidate-gui11-recreated-20261023.scenario.json
```

今回、上記の正確なpinned版ソースからビルドした公開CLIで2ファイルを通常の `session --replay` に読み込み、どちらも終了コード0・公開query成功を確認しました。到達revision/locationは原版48の `work::進行中一覧` と保守版11の `room_a::レビュー##代替枠拒否` です。

さらに別プロセスで再生後に `exportScenario` し、今回回収した各GUIファイルとJSON全体が構造的に一致しました。メタデータ、全操作・digest、最終状態を含みます。旧GUI原物との比較ではありません。
