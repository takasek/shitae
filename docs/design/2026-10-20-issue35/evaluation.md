# 評価記録と証拠の限界

## 実施環境

2026-10-20 JST。最新main `022e8493e4bea272a552a5908abbd844ae5b1569` をfetch後に固定。primaryは未追跡`.agents/`・`.worktrees/`があるため変更しない。元の割当checkoutも旧版detachedのまま保持し、専用worktreeを作成した。Node v26.5.0、pnpm 10.33.2（install出力）、macOS 27.0.1 / 26A434。実ブラウザはChatGPT in-app browser、1280×720。内部エンジン版は取得していない。

依存準備は固定lockfile、[build.log](evidence/build.log)で全packageのDoneを確認。新worktreeはsandboxの書込root外なので、追加資料とbuild等は通常の昇格審査を経由した。pnpm --versionを非昇格で呼んだ際にも作業ディレクトリへの一時ファイル作成が拒否されたため、版は成功したinstall出力を採用した。

## 今回実施した確認

| 種別 | 対象・結果 | 証拠と限界 |
| --- | --- | --- |
| 実ブラウザ・現行製品 | 10回の外部イベントで履歴を作成し、左ペインscrollTop720→詳細展開後0を再現。展開ではseek0、結果点を押した後seek1 | current-expanded.png/txt、current-seek.txt。人の過去経路の再演ではない |
| 実ブラウザ・検討用UI | 初版は記録7の見出し上端449.859→369.859（約80px移動）。版を保存してviewport/anchor管理を修正 | ui-proposal-v1.html、prototype-v1-metrics.json。製品への修正ではない |
| 実ブラウザ・検討用UI修正版 | 表示中の見出しを開閉→参照→確認取消→現在表示へ復帰。左scrollTop434、見出しy373.359が全5測定で一致、復帰focusは参照起点 | proposal-metrics.json、proposal-preview.png/txt。画面外要素へ自動スクロールしてからclickする試行は比較から除外し、測定条件を表示中の見出しに揃えた |
| 実ブラウザ・案内 | 要約の補足から「全共有状態を確認する方法」を開き、CLI要求と必要資料を表示 | summary-guidance.png/txt。人がこの案内だけで完遂した証明ではない |
| 実ブラウザ・検討モデルv1 | 初期表示→詳細を開く→Bの画面を見る。実行の表示は結果2の後、参照の表示は結果1の画面になった | model-preview.png/txt。外側のsimulatorのjournalには模型の2 dispatchが追加される。製品参照の不変性とは別 |
| 公開CLI・モデル | authoring check診断なし、生成HTML。7経路の事前期待と別process replayが成功 | model-check.txt、model-results.json、model-cli.json、7 scenario。モデル自体のdispatchは記録される。製品参照の不変性と混同しない |
| 公開CLI・現行読取契約 | 保存済みAstraモデルを同版で再生、保持点observation query前後のrevision/state/actions/来歴とscenario exportが一致。過去actionsにhandleなし。state.sharedVariantsで画面外の状態B=未保存を確認 | readonly-cli.json、readonly-result.json。既存APIの1点の照会であり、提案UIの実装受入ではない |
| VM/headless | 今回新規のVM/headless検査は実施しない | 旧評価のheadless結果を今回のブラウザ証拠にしない |
| 保存証拠の照合 | 過去の報告・人のフィードバックを読み、今回の観察と分離 | ソース/保存物の一致は描画や人の理解の証明ではない |

補助read-only scriptの初回はBのcomponent名を英語で仮定してassertが失敗した。CLI応答で日本語の実名「状態B」を確認して修正した。製品エラーではない。Cの手順にはmodule+componentの応答を読む必要を明記している。

## モデル自己点検

AI_GUIDEとauthoring skill、ecommerce例を読んで作成。variant参照は##、setはsingletonのみ、presentはdismissで閉じる、未定義の葉は説明用、条件式や新構文なし。show/hideは設計状態の区分を表す。模型のoverlayを製品UIのモーダル採用根拠にしない。画面外の共有状態確認もモデルでは概念表示であり、製品のCLI導線は別に検証した。

## 残る受入

A: 提案GUIの実装とA1〜A4の不変性・移動契約・人の理解。B: 新記録/消えたanchor/filter/reset/狭幅/拡大/キーボード/支援技術/長い参照画面の実装後検証。C: 0件・多数・overlay・member gateの提案文言の実装、現在保存と読込時点の双方で案内を使う人の評価。今回のUI模型はA/B/Cの一部の配置と操作を試すためのもので、全受入を実装したものではない。

独立確認はreview/independent-v1.mdへ。作者の会話は継承させず、briefと成果物入口だけを渡した。共有filesystemはOSで隔離されていない。rootによる初見評価と称しない。PFDSL実案件は既知UI改修待ちであり、本設計の検証には含めない。

## 独立確認後のv2

v1の7経路検査では漏れた「未来参照中の別操作」の反例を独立agentが発見した。一次応答はreview/independent-cli.json末尾で、未来=破棄と参照=Cが同時に残る。rootもその応答・再現scriptを照合した。製品の障害ではなく検討模型と寿命設計の不足として扱い、v1を保持してv2へ分離した。

v2では参照切替・破棄・無効対象の解除を追加。rootの公開CLI9経路と9保存物の別process replayが成功（evidence/v2）。独立agentは作者scriptを使わず、反例・B→C→B・B/C無効対象の4検査を成功させた（review/independent-v2.md、independent-cli-v2.json）。製品のread-only参照や全インターリーブの受入とはしない。

v2 UI模型の移動確認にno-op/拒否の例外を表示し、常設の版詳細から共有状態の案内へ開閉・scroll・focusできることをrootが実ブラウザで確認（proposal-v2-confirm.png/txt、summary-guidance-v2.png/txt）。最終モデルv2自体の新規実ブラウザ操作は未実施、CLIのみ。v1モデルの実ブラウザ証拠をv2へ転用しない。

独立引継ぎはGUIのfilechooser待機約370秒で中断し、再確認で接続不能となった。GUIの読込成功/失敗は未確定。後段でモデル本文を受領しCLIで再開→次操作→保存→別process再生に成功。元操作の再入力0、質問0。v1はquery7/dispatch3/export1、v2再確認はquery15/dispatch11/export0。第一段階のGUI再開未確認はCLI成功で埋めない。作者からの進捗連絡は受けており完全遮断の実験ではないが、会話履歴・正解列・作者scriptを引継ぎ入力にしていない。

rootの模型用の定型検証要求はv1 query54/dispatch31/export7、最終v2 query75/dispatch41/export9。v2は旧scenarioの移行ではなく、初期状態から41 dispatchを新規記録した（自動検査の入力数で、人の再入力負担ではない）。現行読取契約の照会はquery4/export2。利用者の効率改善値は出さない。

終了時に今回のlocalhostサーバーPID 22285を停止し、8875のlistenerがないことをlsofで確認した。最終tracked差分0、新規ファイルは専用設計ディレクトリのみ。最終リンク・HTML終端・JavaScript構文検査はevidence/artifact-validation.jsonに保存。
