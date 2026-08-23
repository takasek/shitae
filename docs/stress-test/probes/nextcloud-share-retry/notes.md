# Nextcloud share-retry probe

## Source

出典は [Nextcloud Android issue #14414](https://github.com/nextcloud/android/issues/14414) である。これは 2025-01-15 に開かれた OPEN の本番バグ報告である。

## Preconditions

Android 14、Samsung S21+ 5G stock、アプリ 3.30.7、サーバー 30.0.0、reverse proxy ありの環境を固定する。これは pinned report reproduction であり、現在のリリースの挙動を主張するものではない。

## Expected trace and success criteria

Gallery のファイルを Nextcloud の root または folder へ共有して直接成功することが期待結果である。報告された実際の結果は直後の失敗通知と Uploads の Connection error で、失敗ファイルの再試行は成功する。報告者は初回失敗が 100% 一貫すると述べる。

## Representation gaps

外部イベント、バックグラウンド worker、network preconditions、expected-vs-actual の対比は評価メタデータに属し、shitae のコア DSL はサービス再現や実行結果 assertion を表さない。
