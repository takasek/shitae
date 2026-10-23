# #69 GUI保存物の追加検証（2026-10-23 JST）

評価 SHA: `e13e3ef20d1f4328efdcc5817dbd3a62d4ebfa92`。

PR #76 のマージ後、[前回評価](../2026-10-23-end-to-end/README.md)で残った「結果途中で保存したGUIファイルの回収・再読込・分岐・再保存・別process再開」を追加検証した。新規の評価記録だけを追加し、前回の記録・製品・SPEC・既存ガイドは変更していない。結果は [report.md](report.md)。[独立レビュー](independent-review.md)は指摘なし。

## 対象版・準備

- 前回評価 SHA `1eed5fb0330d8c61206ab8632de8ee1e5085044e` は今回版の祖先。差分は評価記録とSPEC限定試験スキルの更新で、packages・lockfile・package.jsonの差分はない。
- 登録済みcheckout: `/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae`。新規ブランチ `codex/issue-69-gui-evidence` を更新済み origin/main から作成し固定した。
- macOS 27.0.1 arm64、Node v26.5.0、pnpm 10.33.2。固定lockfileから再install・build（evidence/install.log、build.log）。engineVersionは前回と同じ `683237908597a9e4f75adbb85d54f4a48397f388a4d5d60fb45f9a8b1ad950c7`。
- Codex in-app browser（版番号未取得）で実操作。モデルと保存物を内部関数へ注入せず、実ダウンロードとfile chooserを使った。保存処理の一呼出しが長く待ったが、製品速度とは切り分けていない。
- 同一の親agentが追試。人による受取評価は開始画面を別に用意し、回答・操作の結果が揃うまで未完了とする。AIによる操作やfile chooserの補助を人の理解度と混同しない。

## 対応する保存物

モデルは前回の [module/main.shitae](../2026-10-23-end-to-end/models/module/main.shitae) と同じフォルダの a/b。modelId は `a0aafb42614ce449c93c650b85ff494e37cd660f0c94d63ccd49d63eebd4a845`。今回新規生成した [HTML](evidence/module.html) が対応する。

| 実保存物 | 内容 | GUIで作ったファイル本体 |
| --- | --- | --- |
| [module-ghost-gui](scenarios/module-ghost-gui.scenario.json) | dispatch 5件＋seek 1件。BackFlow結果1、ghost 3地点 | Downloadsの `main.a0aafb42614c.683237908597.scenario (1).json` |
| [module-branched-gui](scenarios/module-branched-gui.scenario.json) | dispatch 6件＋seek 1件。読込後、bのCloseで別経路へ進みghost 0地点 | 同 `.scenario (2).json` |

コピー前の実体を読み、scenario本文を編集せず保存した。SHA256と再生結果は [results.json](evidence/cli-replay/results.json)。ブラウザーの表示記録・画像は evidence/browser/。

## 再実行

同じ版で公式手順のbuildを済ませ、未作成の出力ディレクトリを指定する。

```sh
python3 docs/dogfooding/2026-10-23-gui-followup/tools/verify-gui.py /private/tmp/shitae-gui-recheck-new
```

この小さな検証スクリプトは公開CLIだけを子processとして使う。GUI保存物は入力として保持し、別process再生、現在地・overlay・timeline・cursor・digestを照合する。分岐版は再生後にHideAを実行し、継続記録を新規出力する。既存出力先には書かない。

GUIの再現手順と操作前の期待は [expectations.md](expectations.md)。初期状態から ShowA → Both → Again → BackFlow → ReturnA、記録4を展開し結果1の「この時点から続ける…」→確認の「この時点から続ける」、保存する。新しいHTMLを開き、実ファイル選択で読込、b::NoticeのCloseを選び保存する。a::NoticeのCloseと取り違えない。

## 残る資料不足と人の評価

[archive-inspection.json](evidence/archive-inspection.json) は利用者が示した `shitae-deep-repro-20261023.zip` を直接確認した結果。収録scenarioは15/38/14/38/22 stepで、元レポートの48操作地点・保守版11操作地点のGUI実保存物は含まれない。新規の成功で過去の回収欠落を埋めない。元資料の保存場所が判明するまでは資料不足として残す。

人向けには、既存の見学予約v2のHTMLと対応scenarioを読込んだ画面を用意した。操作列・作者の答え・モデル本文を追加提示せず、画面と履歴からの説明、次の一操作と保存、迷った表示を質問した。開始画面は evidence/browser/human-start.txt。人の回答が得られるまでは受入成功としない。CLIのhandle転記負担（#44）や、モデル一式を受け取って再生成・派生設計を検討する工程は別に残る。
