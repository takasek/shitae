# 操作前の予想（保存モデル、2026-10-16）
根拠はモデル本文とSPEC singleton/フレーム木/overlay/result-list。処理系ソース未読。
- Astra proposed: A編集→保存[成功]→B編集では状態A=保存済、状態B=未保存。図のみ→ノードからソースへで作業面A=並列。focusはeffect文字列のみ。
- Astra current比較: 保存状態/作業面の所属を本文と照会で比べる。原モデル変更なし。
- Sol proposed: Diagram→NodeDoubleClickでSplit。Conflict→Reviewは通知をhideして比較モーダル。KeepEditingはdismissして通知再表示、DocumentStatus=Conflict。ParseError中graphのgateは無効、ValidInputでReady/Validへ戻る。CloseLastDocumentはNoDocumentでNavigationとStartActionsのみ、通知と正規化overlayをhideする。
- Sol recovery: ExternalChange→ReviewAndSaveHere→ChangedAgain[NewRevision]は通知のeffect後dismissしてConflict、編集内容は保持。再Review→KeepEditingでもConflict。
- scenario: CLI exportは応答のscenarioのみ保存。別processでfresh handle取得。GUI seekの結果途中とghost、分岐の来歴を保存する。表示checkboxは復元対象外。モデル本文なし、破棄経路とreset前の架空effectは共有物に含まれる。
