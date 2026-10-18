# 準備記録（作業時点の履歴）

最終的な判断は [acceptance.md](acceptance.md)。人向け評価の継続・再保存依頼は撤回済み。以下の未実施/今後予定という記載は各準備時点の履歴であり、再開指示ではない。

2026-10-18。固定版 `8c86f7cb1412e919554a41d65ff96f68f7e2b1bb`。

- origin fetch 成功。HEAD と origin/main 一致。既存 branch `issue-27-integrated-evaluation` を継続。
- GitHub PR #34: MERGED、merge commit は固定版、mergedAt `2026-10-17T21:39:48Z`。
- `pnpm install --frozen-lockfile` 成功。esbuild の依存 build script は pnpm の既定制限で未実行。
- `pnpm -r build` 全 workspace 成功。
- 独立作者が models/ を作成。作者報告では3入口の check は exit 0・診断なし。親が S1/S2 の simulate を実行し HTML を生成（exit 0）。
- 正規 cua browser inventory に in-app browser が存在。`@playwright/mcp` の取得は行っていない。
- HTML 専用 directory `/private/tmp/shitae-i27-20261018-public` を loopback `127.0.0.1:18727` で配信。作者メモ・モデル・期待表を配信しない。
- 独立計画レビューで不一致時の受取人による行動選択の記録不足を指摘。計画に選択・参照情報・質問・正否の記録を追記。

これらは準備の検証であり、利用評価の完了を示さない。人の受取評価と派生モデルの再検討は未実施。OS による担当間の読取隔離は未実施で、別会話と指示による制限に留まる。

## 人の受取開始前の固定

S1 の実ブラウザ保存物は [browser/s1-explorer.scenario.json](browser/s1-explorer.scenario.json)。別 CLI process で全 export 一致を確認した結果は [browser/s1-explorer-validation.json](browser/s1-explorer-validation.json)。初回回答前の期待は非配信 directory `/private/tmp/shitae-i27-20261018-private/s1-expected-before-human.json` に保存し、SHA-256 は `7a6e857379370afa7d0c79c096035d1a18c7eb42f764dc481e9933ccf4056151`。人向け評価を打ち切ったため [固定時の期待ファイル](browser/s1-expected-before-human.json) を同一 bytes で取り込んだ。この期待と人のランダムウォークを突き合わせた経路分析はしない。期待の根拠はブラウザ保存来歴と別 CLI 照合であり、製品から独立した意味論テストの oracle とは扱わない。

人の受取人へは localhost の案内、HTML、scenario だけを提示した。本文を解析せず表示から説明し、次の一操作と再保存を依頼。回答前に作者の変更要件や期待の答えは渡していない。

## S2 の題材不足と修正

初期 S2 では実ブラウザの手動試験drawerに試験対象がなく、必要な手動試験を実施できなかった。初期モデルは [models/s2-initial/](models/s2-initial/)、初期 CLI fixture は [identity-initial/](identity-initial/) に保持。作者が catalog の備品カードに variant と member presence gate を追加し、CLI check、Session gateTargets、手動試験値と reset の照会を確認。親も修正版 check/HTML生成と不一致 fixture 全6件を再実行した。修正版の実ブラウザ評価は新URL `s2-r1.html` でやり直す。これは製品不具合の修正ではなく、評価用モデルの不足修正。S1 と人への配布物は変更しない。

## 派生モデルの準備と GUI 阻害

[S1 派生版の準備結果](s1-revised-preparation.json) で、変更前 scenario の新モデルへの replay は MODEL_MISMATCH / exit 1。人による再検討はまだ実施していない。追加 GUI 読込検査は [阻害記録](browser/gui-import-limit.md) の通り応答待ちで中断し、未確認として残した。
