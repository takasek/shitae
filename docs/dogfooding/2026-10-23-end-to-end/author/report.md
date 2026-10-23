# 初見作成者の評価記録

## 対象と制約

対象checkoutは `/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae`、固定HEADは `1eed5fb0330d8c61206ab8632de8ee1e5085044e`。既存のbuild済み公開CLI `packages/cli/dist/index.js` を使った。製品・ガイド・既存ファイルは変更していない。書込先はこの `author/` だけ。commit/pushなし。ブラウザー操作なし。過去dogfooding・evidenceファイル・不具合報告・処理系実装は読んでいない。session-usage.md自体にある過去評価の説明とリンクは目に入ったが、そのリンク先は開かず今回の判定に用いていない。

依頼で対象版・checkoutが固定されていたため、origin取得後もそのHEADを保持した。最初の `git fetch origin` はsandboxによるFETCH_HEAD書込拒否、同じ操作を承認機構に渡して成功。以後のauthor書込・公開CLI実行は承認済worktree内の操作として昇格経路を使用した。

## 読んだパス

- `/Users/m5/works/shitae/.agents/skills/shitae-authoring/SKILL.md`（ユーザー提示スキル入口）。書く前のAI_GUIDE読取とチェックリストに使用。
- `/Users/m5/.codex/guides/pfdsl-and-worktree.md`（worktree準備規則）。
- 対象checkoutの `README.md`、`docs/AI_GUIDE.md`、`docs/design/session-usage.md`。
- 対象checkoutの `docs/SPEC.md` は見出し検索後、291–330行（通常componentとsingleton）、374–423行（初期状態、session、フレーム木）を読取。
- 対象checkoutの `docs/HANDOFF.md`（期待・対応物・同版再生と修正版の区別）。
- 自分の出力は期待表、元モデル、CLI応答、生成ファイルの存在・サイズを確認した。HTMLの実行実装は読まない。

## 実行前の問い

`expectations.md:5` と同ファイル9–12行をモデル作成・CLI操作の前に保存した。固定の代表施設一件で、取消する入力と確定した予約の寿命を分けた。入力は `v1/visit.shitae:13` の通常確認画面、予約は `v1/visit.shitae:24` のsingleton。v2の小変更は成功通知の追加だけ（`v2/visit.shitae:16`、30–32行）。

## 実行コマンド

以下はいずれも対象checkoutをworkdirとした。出力先prefixは `docs/dogfooding/2026-10-23-end-to-end/author`。

```sh
git fetch origin
git rev-parse HEAD
node packages/cli/dist/index.js check docs/dogfooding/2026-10-23-end-to-end/author/v1/visit.shitae
node packages/cli/dist/index.js simulate docs/dogfooding/2026-10-23-end-to-end/author/v1/visit.shitae
python3 docs/dogfooding/2026-10-23-end-to-end/author/cli-record.py v1
node packages/cli/dist/index.js check docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae
node packages/cli/dist/index.js simulate docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae --replay docs/dogfooding/2026-10-23-end-to-end/author/v1/visit.scenario.json
python3 docs/dogfooding/2026-10-23-end-to-end/author/cli-record.py v2
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/author/v1/visit.shitae --replay docs/dogfooding/2026-10-23-end-to-end/author/v1/visit.scenario.json
node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae --replay docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json
```

CLI記録クライアントは `cli-record.py`。subprocessへJSONLを送り、id/okを照合し、公開queryのactionTextからその時点のhandleを選ぶだけ。処理系内部のimport・独自操作モデル・ブラウザー制御はない。全要求・全応答は各版の `requests.jsonl` / `responses.jsonl`。各操作前に新しいactions queryを行った。条件分岐なし、手動試験なし、seek/resetなし。v1は8 dispatch、v2は通知を閉じる1操作を加え9 dispatch。v1を実行した後にv2の変更を書き、旧記録の拒否を確認してからv2を新規記録した。

check/simulateはstdoutとstderrを各版へ保存。後で終了値を明示的に保存するため、checkだけ同じモデルで一度再実行した（`verification.json`）。simulate成功時のshell終了値は0、HTMLサイズは同ファイルへ保存。同版再生はJSONLのstate/metadata queryを一つ送り、終了値・stdout・stderrを各版の `replay.*` に保存。旧版再生拒否はv2の `old-replay.*` に保存。

## 観測結果と判断

| 期待 | 結果 | 証拠 |
|---|---|---|
| 取消後は詳細、予約は未予約、確認作業を破棄 | 合格。framesは2から1、共有状態未予約 | 両版 `before-cancel.json` / `after-cancel.json` |
| 確認を開き直すと現地案内 | 合格。確認画面は現地案内、共有状態未予約 | 両版 `reopened-confirmation.json` |
| 確定で確認を閉じ、予約済は詳細・一覧・詳細で残る | 合格。確定後と最終地点は詳細、frames1、共有状態予約済 | 両版 `after-confirm.json` / `final.json`、各 `session-summary.txt` |
| v2で成功通知を閉じても画面と予約済を維持 | 合格。overlayは確定通知から空、詳細と予約済は維持 | `v2/after-confirm.json` / `v2/after-hide.json` |
| v1 scenario はv2へ厳密再生できない | 合格。MODEL_MISMATCH、source bytes差異、exit1 | `v2/old-replay.stderr.txt` / `old-replay.exit.txt` |
| 新版で新しいscenarioを記録し同版再生できる | 合格。v1/v2とも別process再生exit0、詳細・予約済 | 両版 `visit.scenario.json` / `replay.stdout.jsonl` / `replay.exit.txt` |
| checkとHTML生成 | 両版check診断なしexit0、HTML生成成功 | `verification.json`、両版 `check.*` / `simulate.stderr.txt` |

この小モデルで、取消する入力と長く残す予約状態を別の構文で表せた。AI_GUIDEの「子自身を変更するためだけにsingleton化すると寿命まで変わる」という説明とSPECの初期状態／共有状態の区別は、この設計判断に直接役立った。状態照会で、確認画面の寿命と予約状態の寿命を別々に確認できた。新機能の必要性や処理系の不具合を示す結果は今回の範囲では得られていない。

負担として、エージェントが同一processのJSONLを扱い、stateの長い構造から共有状態とフレームを読む準備は必要だった。本評価では薄いクライアントを自作した。これを一般利用者の操作時間の改善・悪化と断定しない。ガイドの公開コマンドと応答構造だけで進められ、処理系実装の読取やモデル修正による診断解消は不要だった。

## 引継ぎ成果物と不足

受取側へ渡す入口は `handoff-brief.md`。対応する元モデル・HTML・scenarioをv1/v2へ分離し、`shitae-revision.txt`を添えた。importとsimconfigはない。briefは問い、開始状態、不変条件、版の対応、保存時地点、未確認範囲を含み、会話と操作列は含まない。

作者のCLI検討は完了した。受取側が操作列なしで問いを理解し、GUIで再生・続行できたことは作者の成果とは扱わない。ブラウザーのスクリーンショット、GUIの可読性、別人の再開評価は未添付・未確認（別担当範囲）。通信、日付や人数の値、複数施設IDの予約管理、再起動後の永続保存、二重予約防止、予約済から再度予約する業務要件は対象外。成功通知の非表示以外の分岐、オンライン案内から現地案内へ戻す操作、barrierでのback、手動試験、結果途中からの分岐は未確認。

再現用元モデルは改変せず保存する。生成HTMLだけでは元source bytesを回収できないため、モデル同梱は省略しない。
