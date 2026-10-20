# 評価記録の独立レビュー

対象は `e985f4ee58ab76339df5b0f59144e1f1a5da91c8` の checkout と今回の評価記録。実装時の会話・推論を引き継がない別 agent が、要件、最終記録、生成物、旧証拠、仕様の該当箇所から確認した。製品・仕様・原本・既存証拠は編集せず、この報告だけを追加した。ブラウザの再操作は行っていない。

P0–P2 の不足・過大な主張は検出しなかった。保存された再現条件に限った #8/#9/#10 の解消、#13 の単一 agent による入口確認、#12/#11 の限定判断は、記録された一次資料と整合する。人間の学習効果、全分岐、実 I/O、独立 Chrome 再現へ一般化していない点も確認した。

## 解消済みの指摘

- **P3：独立ガイドモデルの再生成入口。** 初回レビューでは案内先に CLI 入口と stdout の保存先がなかった。`README.md:48` に initial / receiver-probe の具体的な check / simulate コマンドが追加され、`:54` に負例の期待 exit 1 / E030 / E028 が追記された。実行対象・保存先は、下記で独立再生成したモデルと一致する。解消済み。
- **P3：再現比較の hash 対象。** 初回レビューでは hash の抽出範囲が不明だった。`compare-replays.py:6` に main 節から遷移マップ以前を空白無変換で抽出する式が追加され、`evidence/replay-comparison.json:7` に比較前像が保存された。保存 observations から前像 4 件を独立に抽出し、前像・hash・2 組の一致をすべて確認した。元の hash も一致し、項目名は `mainDOMSnapshotIdentical` に正確化された。解消済み。

最終時点の未解消指摘はない。

`files.txt` はレビュー報告追加後に親タスクが最終再生成する予定であるため、レビュー途中の削除済みファイル・追加前の報告が一覧に反映されていない点を最終成果物の指摘には算入していない。

## 独立に実行した検証

保存成果物を上書きせず、CLI の出力をメモリに捕捉して比較した。

| 検証 | 結果 |
| --- | --- |
| HEAD / 修正 commit の包含 | HEAD は固定 SHA と一致。`4b56240` / `9f47b1f` / `e92e543` / `3844800` はすべて祖先 |
| 旧ディレクトリ全量保全 | 33 ファイルが `original-sha256.json` の全項目と一致。旧 `source-manifest.json` の 20 項目も一致 |
| 保存 7 モデル | check / mermaid / simulate の 21 呼出しが exit 0。モデル hash と診断文字列は台帳に一致。W103 は 30 / 31 / 9、他 4 本は診断なし |
| 生成物の一致 | 7 Mermaid・7 HTML が今回の保存生成物とバイト一致。保存済み旧 Mermaid 6 本も一致。alias 例には旧 Mermaid がないことを確認 |
| #8 pipe | 新たに 3 回捕捉し、すべて exit 0 / 139,281 bytes / file とバイト一致。SHA256 は `62dab1690386ffb08a14c0fe7448eb44d35d30e7a415f4e3f3ee4ce8772f2bf4` |
| HTML 構文 | simulator の全 11 HTML（原本 7、派生 2、guide 2）が UTF-8 decode、`</html>` 終端、埋込み JavaScript の `node --check` を通過 |
| 派生 2 モデル | 原本・派生 hash と diff を確認。check / mermaid / simulate はすべて exit 0、Mermaid / HTML は保存物とバイト一致。alias 派生は参照 1 行、readable-status は DocumentStatus の alias 3 行だけの変更 |
| guide 課題 | initial / receiver-probe は check exit 0、診断なし。simulate は exit 0、保存 HTML とバイト一致。通常 set 負例は exit 1 / E030、singleton collection 負例は exit 1 / E028、余分な警告なし |
| 限定 VM | 旧 runtime probe は exit 0。全出力が今回の `validation.json.runtimeProbes` と一致 |
| ローカルリンク / 差分 | Markdown のファイルリンクは全参照先が存在。tracked Git 差分は空で、追加は今回ディレクトリだけ |

install/build ログは、新 worktree で frozen lockfile install と全 9 package の build が完了した記録を含む。lockfile の実 hash は記載値と一致する。独立レビューでは通過済み install/build を繰り返していない。

## 一次資料との照合

`browser-observations.json` は 97 件で ID 重複なし。`browser-paths.md` が個別に引用する観察 ID は存在する。alias の Ready / Error / Ready のログ差、Error 中の Missing のみ追加発火、復帰後の 3 effect、inline 2 群の各 New / Save / Format の順序を保存 DOM から確認した。`alias-error.jpg` と `inline-original.jpg` は該当表示と整合する。

Astra の文書 A/B、作業面、比較取消、正規化表示の閉鎖・巻戻しと、Sol の view round trip、通知の hide/show、Error gate、復帰、NoDocument の記録を照合した。画面が一部だけ写る画像について、写っていないラベルを画像単独の証明とは扱わず、対応する保存 DOM を用いた。`sol-proposed-error-detail.jpg` の gate off と `existing-gate-panel.jpg` の DiagramView のみの選択肢は #12 の限定された観測負担と整合する。

recovery の ChangedAgain 後の `dismiss → Conflict` は原モデル 27 行に明記された挙動と一致し、評価者の予測との差として扱われている。Fresh / Saved / NewTargetSaved の操作後の Editing と効果ログも保存 DOM にある。未操作の分岐や実 revision を受入済みとする記述はない。

guide の A 保存済・B 編集中の遠隔更新、戻った後の状態保持、通常編集画面の閲覧への再入場、receiver probe の包含画面だけの variant 変更は DOM と `guide-b-state.jpg` / `receiver-probe.jpg` に整合する。意味論は `docs/SPEC.md:299`、`:317`、`:365`、`:373` と一致する。独立 agent の初案作成過程・読取範囲はその担当の記録に依存し、レビューが過去の操作を再演して確認したものではない。レポートはこの証拠を単一 agent の限定確認として扱っている。

Sol 11 操作と Astra 5 操作のモデル hash・分岐は `scenarios.json` と原モデルに整合し、最終 main の保存 DOM はそれぞれ初回・再試行で一致した。別 Chrome agent の全列再現は未完了と明記され、成功にも製品の再現失敗にも算入されていない。#11 の即時必須性が未成立という判断を、独立再現成功と読み替えていない。

追加のブラウザ環境記録では、評価用 HTML は navigator の値を表示するだけで、simulator を変更していない。環境 JSON と UA JSON は一致し、縮約 UA の `Chrome/155.0.0.0` から exact patch を断定していない。主画像の 768×1034 と環境ページの 1280×720 も区別されている。

## レビューの限界

このレビューは、保存証拠の整合と CLI 出力の独立再生成を確認した。実ブラウザ操作を再実施した結果ではない。過去の入力順、予測の記録時点、独立 agent の参照履歴は担当記録に依存する。全分岐・他 OS・低速 reader・実ファイル保存・IME/VoiceOver・任意数の文書は、評価本体が未確認とする範囲のままである。
