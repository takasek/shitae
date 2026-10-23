# 独立した受取評価

固定版: `1eed5fb0330d8c61206ab8632de8ee1e5085044e`。受取担当は作者の会話・report・補助script・requests/responses・他の評価記録を開いていない。ブラウザー操作は担当外で未実施。

## 保存物から理解した検討

問いは、予約確認中の案内方法の選択を取り消したら破棄し、確定した予約済は画面の開き直しを越えて同じ実行内で保持する設計が妥当か、である。v2は確定通知を追加し、その表示寿命を予約済から分離している。実予約の送信、プロセスを越えた予約データ永続化、施設IDごとの予約は対象外（`author/handoff-brief.md:3-5`）。

v1の8操作、v2の9操作は、施設詳細を開く → 予約確認を開く → オンライン案内を選ぶ → 取消 → 再び確認を開く → 現地案内のまま確定 → 一覧へ戻る → 詳細を開き直す、という経路を残す。v2では確定と一覧へ戻る間に通知を閉じている。scenarioの `steps[].command.operation.host` と `source.span.line` を元モデルの操作行に対応させ、`final.view.timeline` で照合した。すべて `command.branch:null` で、条件付き選択のbranch IDは使っていない。「選んだ分岐」を利用者の選択肢という意味で言えば、オンライン案内の取消と、再入場後の現地案内での確定である。

両版の保存到達点は施設詳細、予約済、確認画面なし、通知なし。共有状態は `singleton-shared`、由来は `dsl`。確認方法は現地案内が初期値であり、保存地点に生存する確認frameはない。v2の通知は確定時のshow後にhideされている（各版 `visit.scenario.json` の `final.view.view.state` / `final.view.timeline`、元モデル `visit.shitae:14-28`、v2 `visit.shitae:30-32`）。

HTMLは静的に読み、埋込みmodelIdとscenarioの同版modelIdの一致、v1に確定通知がなくv2にはあること、外部scriptタグがないことを確認した。HTMLの見え方・GUIでの読込成功はこの評価では主張しない（`asset-checks.json`）。

## 公開CLIによる再開と追加検討

公開入口 `node packages/cli/dist/index.js session <同版visit.shitae> --replay <scenario>` を新processで起動。v1は8操作、v2は9操作を再生し、明示exportしたfinal digestが受取ファイルと一致した。起動後の照会はどちらも施設詳細・予約済・overlayなし。終了コード0、stderr空。証拠は `v1.responses.jsonl`、`v2-continued.responses.jsonl`、`verification.json`。

v2の再開後、今度は予約済の状態から「見学を予約する → オンライン案内を選ぶ → 取り消す → 見学を予約する → オンライン案内を選ぶ → 確定する → 通知を閉じる → 一覧へ戻る → 詳細を見る」を追加した。最初と取消後の再入場は現地案内で、取消は既存の予約済を消さない。今回はオンライン案内で確定し、確認が閉じて通知が現れ、通知だけを閉じても予約済が残り、一覧と開き直した詳細でも予約済が残った。これにより元の未予約からの取消とは異なる、予約済からの再検討を継続できた。結果は `verification.json` の `v2-continued.checks` と状態照会に記録し、受取側の検査で期待値を照合した。

新規保存物は `v2-continued.scenario.json`（18操作）。さらに別processでこれを再生し、保存時final digestが一致、終了コード0、stderr空だった。証拠は `v2-continued-replayed.responses.jsonl`。3つの成功processのPIDは5466、5467、5468（`verification.json`）。v1 scenarioをv2モデルへ渡す負例は終了コード1、標準出力なし、`MODEL_MISMATCH`（`mismatch.stderr.txt`）。版の取り違えを拒否することも確認できた。

## 結論と限界

指定されたモデル・scenario・版・briefと公開CLIの使い方から、何を検討し、どこまで進み、どの選択を経たか説明でき、別processで再開して別の選択を試し保存できた。作者への追加質問は不要だった。既存予約済からも予約確認を開いて確定できるが、この下書きでは実際の重複予約を扱わないため、製品上の欠陥とは判断していない。案内方法を予約結果に永続保存するモデルでもない。

取消直後の未予約保持は作者の保存経路・元モデルから理解した内容であり、今回の追加継続は既に予約済から始まる。未予約からの取消を追加実行して検証したとは扱わない。GUI可読性やGUI再生は親担当の別検証を要する。

## 読んだ資料と追加で必要だった情報

- `author/handoff-brief.md`、`author/shitae-revision.txt`。
- `author/v1/visit.html`、`author/v1/visit.shitae`、`author/v1/visit.scenario.json`。
- `author/v2/visit.html`、`author/v2/visit.shitae`、`author/v2/visit.scenario.json`。
- 公開 `README.md` のCLI/session案内と `docs/design/session-usage.md`。公開文書内の他評価結果へのリンクは開いていない。CLIのquery・dispatch・exportScenario・--replayと、操作後にhandleを取り直す方法が追加で必要だった。
- 作業手順として `/Users/m5/.codex/guides/pfdsl-and-worktree.md` と `shitae-authoring/SKILL.md` を読んだ。モデルの変更は行っていない。

出力は本recipientディレクトリだけ。実行した受取専用のCLI clientは `cli-check.py`、要求・応答は本ディレクトリ内に保存した。製品変更・commit・pushなし。
