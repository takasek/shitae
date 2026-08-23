# Mattermost message-post 採点

## 抽象化できる箇所

- チャンネル一覧からチャンネル画面を開く `push` は、テストの `ChannelScreen.open(...)` に対応する。
- 空欄・入力済み・送信済みの画面差は channel screen の variant として自然に対応する。
- 入力による `goto`、送信副作用、送信済み画面への `goto`、一覧へ戻る `back()` は、テストの操作順に対応する。
- enabled / disabled の送信ボタン状態は、画面 variant ごとの要素として自然に写せる。

## 評価層の境界

可視性アサーション、入力値の一致・非一致、安定した test-ID の選択、ランダムメッセージの生成、`Post.apiGetLastPostInChannel` による API 照合は、実サービスを対象にした評価層の責務である。DSL はそれらを実行可能な assertion やデータモデルとして追加せず、観測された画面状態と遷移だけを記述する。

CLI の `check`、`simulate`、`mermaid` は、それぞれ DSL の静的検査または出力生成を行うだけで、Mattermost アプリを起動せず、実サービスのログイン・投稿・API 照合を再生しない。

この probe では既存の component、variant、`push`、`goto`、副作用記述、`back()` だけで要件を表現できるため、コア構文の追加は提案しない。

## CLI verification (2026-08-24)

`check` は exit 0 で診断なし、`simulate` は exit 0 で HTML stdout 27,137 bytes、`mermaid` は exit 0 で Mermaid stdout 595 bytes だった。stdout は一意な `/tmp` ファイルへ保存して `wc -c` で測定し、生成物はリポジトリに保存していない。
