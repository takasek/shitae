# 保存済みモデルの操作前期待

評価者: root Codex agent。新規作成担当とは別。過去の記録を読んでおり初見とは呼ばない。2026-10-20、実行前に記録。

| 対象・問い | 操作前の期待と根拠 |
| --- | --- |
| Astra proposed: A保存後にB編集 | 文書Aで編集→保存[成功]→切替(B)→編集。状態A=保存済、状態B=未保存。Aへ戻ってもAの保存済が残る。モデルの別singletonとSPEC singleton/setが根拠。任意数の文書の実装証明にはしない。 |
| Astra proposed: 図からソースへ | Aで図のみ→ノードからソースへ。作業面A=並列、アクティブ文書はAのまま。フォーカスは自由文effectで実証されない。 |
| Sol proposed: 競合から取消 | Conflict→Review→KeepEditing。Review中は通知非表示、比較のmodal。取消後Splitに戻り通知が再掲示、DocumentStatus=Conflict。SPEC present/dismissとoverlayの独立寿命が根拠。 |
| Sol proposed: 構文復帰 | ParseError→DiagramOnlyではDiagramView=Error、graphがないためNodeDoubleClickは無効。ValidInput後Readyとなり同操作が有効。実行後Split。 |
| Sol proposed: 最後の文書を閉じる | CloseLastDocument後NoDocument、NavigationとStartActionsが残り、RecoveryNotice/NormalizedEdgesは消える。singletonの値そのものはresetされない（モデルにはそのsetがない）。 |
| Sol recovery: 外部版が再変更 | ExternalChange→UseCurrentDiskVersion→ChangedAgain[NewRevision]。採用せずConflictに戻り編集内容を保つeffect。次にSaveAs[Cancelled]でもConflict。実ファイルは扱わない。 |

文書への参照: session-usage 1回（公開CLI要求、保存/再生、選択的照会を確認）、scenario-replay-contract 1回（ghost/途中保存・厳密一致・表示設定除外を確認）、session-provenance 1回（履歴と由来の読取入口）。AI_GUIDE 1回（保存モデル読取前の手順）、SPEC 1回の照会群（singleton、switch、present/dismiss、overlayの期待根拠）。原モデル本文はAstra proposed、Sol proposed/recoveryを各1回。実装コード参照0回。

原本と過去証拠の全hashは evidence/original-hashes.json。評価用コピーのcheck/生成は evidence/model-checks.json。過去verify.pyは旧証拠を上書きするため実行せず、今回の出力先へ直接公開CLIを実行した。

## 比較・最小例の追加期待（実行前）

- Astra current: A保存[成功]→B編集後、Bのvariantは未保存だが共通通知は「Saved.」のまま。通知が何の保存か本文から特定できない。proposedの文書名付き表示と比較する。current本文参照1回を追加。
- alias-member: ReadyではAlias/Named/Undefinedとも有効。公開試験値でDiagramViewをErrorにした後はAlias/Namedが無効、未定義参照Undefinedはラフ記述として有効。SPECのmember gateと未定義参照契約、最小モデル本文から期待。原本文参照1回。
- inline-repro: inline群と名前付き群の双方にNew/Save/Formatが見える。グループは操作そのものを持たない。最小モデル本文から期待。原本文参照1回。
