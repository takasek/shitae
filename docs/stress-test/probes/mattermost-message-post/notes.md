# Mattermost message-post probe

## Source and license

一次資料は Mattermost Mobile 公式 GitHub リポジトリの commit [`ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae`](https://github.com/mattermost/mattermost-mobile/tree/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae) に固定した。
対象ファイルは [`detox/e2e/test/products/channels/messaging/message_post.e2e.ts`](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/test/products/channels/messaging/message_post.e2e.ts) で、対象テストは `MM-T4782_1 - should be able to post a message when send button is tapped`（[lines 55-82](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/test/products/channels/messaging/message_post.e2e.ts#L55-L82)）である。
同じ固定 commit の [`LICENSE.txt`](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/LICENSE.txt#L1-L5) は Apache-2.0 を示す。

## Setup and expected trace

テストは `Setup.apiInit(siteOneUrl)` でチャンネルとユーザーを準備し、Server 1 へ接続してログインし、サイドバーにチャンネル名が現れるまで待つ（[lines 33-43](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/test/products/channels/messaging/message_post.e2e.ts#L33-L43)）。このセットアップと `afterAll` のログアウトは、対象フローの抽象化には含めない。

期待 trace は、チャンネル一覧を確認し、チャンネルを開き、空の入力欄に対する無効な送信ボタンを確認し、メッセージを入力して入力済み variant へ進み、有効な送信ボタンを確認して送信する。その後、投稿が一覧に現れ、入力欄が送信内容を保持せず、送信ボタンが再び無効になることを確認して、チャンネル一覧へ戻る（[lines 45-82](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/test/products/channels/messaging/message_post.e2e.ts#L45-L82)）。

## Representation boundary

`mattermost-message-post.shitae` はチャンネル一覧からの `push`、入力による `goto`、送信副作用と送信済み variant への `goto`、`back()` を表現する。送信済み variant の投稿メッセージ、空の入力欄、無効な送信ボタンは、テスト後の画面状態を表す抽象化である。

テストのアサーションは、入力前・入力済み・送信済みの状態差として対応する。一方、Detox の `expect(...).toBeVisible()` / `not.toHaveValue(...)`、要素の test-ID、ランダムなメッセージ値、`Post.apiGetLastPostInChannel` による API 照合は、評価層の事実であり、この DSL の構文には複製しない。test-ID 選択の規約は一次資料の冒頭コメント（[lines 4-8](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/test/products/channels/messaging/message_post.e2e.ts#L4-L8)）に、画面ヘルパーの `postInput`・`sendButton`・`sendButtonDisabled` は [`channel.ts` lines 130-138](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/support/ui/screen/channel.ts#L130-L138) にあり、投稿 API の polling helper は [`post.ts` lines 76-110](https://github.com/mattermost/mattermost-mobile/blob/ebc1f1382bb0334c0f679467bb6cc97fa6b8c0ae/detox/e2e/support/server_api/post.ts#L76-L110) にある。
