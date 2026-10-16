# 共有する設計検討
目的: 文書編集UIの外部変更への対応と、図からソースへ戻る動線を検討する。
問い: 比較を取り消した後の通知と編集の関係は適切か。図へ切り替えた後、ソースへ戻れるか。どの途中経過からこの検討に至ったか。
固定処理系: bbd99d4a772e9a74532840c6656477699abfb054。Node v26.5.0 / pnpm 10.33.2。再build/更新不要。
閲覧用: evidence/sol-proposed.html。
保存物: scenarios/sol-cli-diverged.scenario.json。
編集・再生成用: models/sol-original/proposed.shitae。全モデルはこの一枚（importなし）、simconfigなし。共有HTML/モデルと同一bytes。
公開CLI: リポジトリrootの packages/cli/dist/index.js。公開利用説明はREADME.md と docs/design/session-usage.md。
架空の代表文書だけを使う。条件は手選択、自由文effectは実I/Oではない。
