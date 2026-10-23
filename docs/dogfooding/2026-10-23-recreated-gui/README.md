# GUI48操作・11操作の再作成保存物の検証（2026-10-23 JST）

記録を追加したcheckoutの起点: `6812f2c24db423cf06a30ff7f398a13e62ff3a05`（進行中PR #77）。
保存物を再生した製品 SHA: `0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5`。

利用者から `/Users/m5/Downloads/shitae-gui48-gui11-recreated-20261023.zip` を受領し、#69に残っていた48操作地点・保守版11操作地点の保存物を検証した。**同梱READMEによると、当時のダウンロード原物ではなく、同じ旧版HTMLと操作記録から全操作をGUIでやり直して保存した再作成版である。** 旧原物との同一性と、今回受領した保存物の再生可能性を区別する。

## 受領物と照合

ZIP SHA256は `4cc3c5a624e554c25d332e5906e1741a1d5106e8a0084c809624863e5026f8d7`。全28ファイルを [source-pack/](source-pack/) へbytes無変更で保存した。全件のハッシュと照合結果は [manifest.json](manifest.json)。提供者の説明は [README-ja.md](source-pack/README-ja.md)、操作列は [OPERATIONS-ja.md](source-pack/OPERATIONS-ja.md)。

- 22モデルソースと2HTMLは、既存の `2026-10-23-end-to-end/source-pack/workshop/` に保存した対応版と全件bytes一致。
- 原版48操作の最初の38件は、以前の `handoff-38-gui.scenario.json` とcommand・afterDigest・outputDigestが全件一致。
- 原版/保守版のmodelIdはそれぞれ `88789ce38767530fd605c87247e26ed1a0d5122317222a6f1a10a695561f8a68` / `4414378de007989846245b95fbd8488f675ae52ebb9259485b0915bafb8e433e`。
- engineVersionは両方とも旧版 `278103a97da5319e8f97bb3218d6508b7cfd2a8d3ebd479aed3faf00f75f5116`。現行評価版へ記録のhash・IDを編集して移行することはしていない。

## 正確な旧版での再生

Codexに登録した専用worktreeでpinned commitを確認し、公式READMEの固定lockfile install・buildを実施した。ログは evidence/legacy-install.log と legacy-build.log。製品ソースに変更はない。

| 保存物 | 旧CLI再生・再export | 到達点 | 新process内での継続 |
| --- | --- | --- | --- |
| [原版48](source-pack/exports/r2_1-gui48-recreated-20261023.scenario.json) | exit0、JSON全体一致 | work::進行中一覧。A/B作業なし、A原枠・B代替枠、公共バナーだけ表示 | 公共バナーを閉じる。共有値・現在地を維持しoverlayなし |
| [保守版11](source-pack/exports/refactor-candidate-gui11-recreated-20261023.scenario.json) | exit0、JSON全体一致 | room_a::レビュー##代替枠拒否。確定A原枠を保持 | 選択へ戻る。room_a::枠選択##代替枠へ戻り共有値を維持 |

各記録にはdispatchだけが48件/11件あり、seek・reset・手動試験はない。公開CLIのqueryで状態とmetadata、exportScenarioで保存内容を照合し、その後に新しいactionsからhandleを取得して継続した。結果は [results.json](evidence/replay/results.json)、全要求・応答は対応するevents.json、再export・継続保存物も同フォルダ。

現行CLIでも元モデルと旧scenarioをそのまま渡し、両方ともexit1・stdout空・ENGINE_MISMATCHを確認した。旧版の再生成功と現行版への互換性を混同しない。

## 解消した範囲と残る限界

再作成されたGUI48/11操作の保存実体を受領・保全し、対応する正確な旧版の別processで再生・内容照合・継続できることは確認できた。以前の「提供物に該当ファイルがない」という資料不足は、この再作成版について解消した。

提供者は同版HTMLの公開GUI操作とdownloadイベントで保存したと記載している。本検証は受領ファイルの静的照合とCLI再生であり、こちらが48/11操作を実GUIで再実行したものではない。旧GUI原物は提供者説明では回収不可であり、そのbytes同一性や当時の実保存回収まで証明したとはしない。以前のレポートの「当時未回収・CLI未確認」は履歴として保持する。

48操作地点の画面外に残るRoomsタブは未完了のA/B下書きとは別である。また会員リマインダーは非表示でも共有値Aが残る。通知の非表示は共有値や履歴を消去したことを意味しない。11操作地点も拒否と取消確認からの復帰を試した有限の経路であり、保守版と原版の全状態の同値証明ではない。

人による受取評価は利用者判断で保留。AI用としての利用評価は [2026-10-23-ai-first-use](../2026-10-23-ai-first-use/README.md) と分ける。製品・SPEC・既存ガイドは今回も変更していない。

## 独立レビュー

会話を継承しない別agentがZIP全件・既存資料・59操作の参照行を照合し、旧版再生・再export全体一致・継続・現行版の拒否を別出力先で再実行した。重要な指摘なし。[レビュー](independent-review.md) と [独立出力](evidence/independent-review/) を保存した。

## 再検証

正確なpinned版と現行版をそれぞれ公式手順でbuildし、未作成の出力先を渡す。入力ZIPやscenarioを編集しない。

```sh
python3 docs/dogfooding/2026-10-23-recreated-gui/tools/verify-recreated.py /absolute/legacy/packages/cli/dist/index.js /absolute/current/packages/cli/dist/index.js /private/tmp/shitae-recreated-new-output
```

検証scriptは公開CLIだけを起動し、入力のmanifest、操作件数、到達状態、再export全体一致、継続、現行版の拒否をassertする。既存出力先への上書きは拒否する。
