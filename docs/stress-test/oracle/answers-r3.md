# オラクル r3 正解（runtime reduce 実測。2026-07-13）

`run-oracle-r3.mjs` の実行結果。singletons = {クーポン}（S6/S8 除く）。エントリ = ホーム。

| # | 遷移列 | active（共有解決後） | shared | 備考 |
|---|---|---|---|---|
| S1 | present(クーポン); goto(##受取済); dismiss(); present(クーポン) | クーポン##受取済 | クーポン=受取済 | 共有はフレーム死を跨ぐ |
| S2 | present(ホーム,@A); switch(クーポン,@B); goto(##受取済); switch(ホーム,@A); switch(クーポン##未受取,@B) | クーポン##未受取 | クーポン=未受取 | resume 経路でも X##v は共有書換（ADR-0011 設計者確定） |
| S3 | push(クーポン); push(設定); push(クーポン##受取済); back(); back() | クーポン##受取済 | クーポン=受取済 | スタック中段の singleton はスナップショットでない |
| S4 | show(クーポン); push(クーポン##受取済); show(クーポン) | クーポン##受取済 | クーポン=受取済 | overlayVariant=受取済。再 show（省略形）でも initial に戻らない |
| S5 | push(クーポン##通常)[ローカル通常]; push(mod::クーポン) | クーポン##通常 | クーポン=通常 | **モジュール衝突**: 名前キーのため mod::クーポン が存在しない variant で開く（finding R3-4 のライブ証拠） |
| S6 | push(##二); back() | ホーム | 空 | push(##v) = (アクティブ component, v) を現在フレームに積む |
| S7 | present(クーポン,@m); goto(##受取済); exit(@m); present(クーポン) | クーポン##受取済 | クーポン=受取済 | exit 破棄後も共有は残る |
| S8 | push(記事##展開); push(設定); back() [非singleton] | 記事##展開 | 空 | 通常 component は積まれた時点の variant（対照） |

警告: 全ケースなし。

## 事後記録（2026-07-14、Phase 4 反映後）

S5 は ADR-0013（singleton の共有スコープ = 定義ファイル単位・(module, component) キー）の実装で挙動が変わった。修正後の実測: ローカル `push(クーポン##通常)` は共有レジストリを汚染せず、`mod::クーポン` は **initial（##未受取）** で開く——オラクル被験者の予測（`grading-r3.md` S5）と一致。上表の S5 は修正前の bug 挙動の記録として保存する。再現は runtime テスト「r3: singleton のモジュール境界」参照。
