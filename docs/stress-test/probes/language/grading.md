# language プローブ採点（被験者: sonnet / SPEC のみ / CLI 不可）

CLI check: pass（診断ゼロ）。SPEC 照合レビュー: variant による文脈依存の component 再利用（学習言語選択）が模範的。反復・カウント・跨プロセス再開で spec の空白を的確に踏んだ。

## どう正解したか

- 「学習言語選択」を variant 2 つ（##オンボーディング / ##設定変更）で遷移先だけ差し替えて再利用 — 外部参照上書きに頼らない賢い別解。`push(学習言語選択##設定変更)` の variant 指定遷移も正確。
- 一方向オンボーディングを goto 連鎖で（back 不能を構造で保証）、レッスンを `present(選択式問題, @lesson)` のモードで、中断→再開を `switch(…, @lesson)` の resume-or-create で — いずれも意図どおり。
- 正解/不正解 variant、`[正解] goto(##正解)` のラベル意味論、`exit(@lesson)` による一括破棄も正確。

## 検出された spec の穴

1. **present 製セッションへの `switch(X, @S)` 復帰の合法性が未規定** — @lesson は present で開始、通知・「続きから」は switch で復帰。開始 verb と復帰 verb の対応関係を spec が語らない。
2. **アプリ再起動を跨ぐ frame 木の生存** — 「レッスンを中断してアプリを閉じても再開できる」を switch の resume で表したが、frame 木がプロセスを跨いで生きるかは shitae の意味論の外。中断・復帰の語彙がプロセス生存を前提にするか未規定。
3. **反復・カウント（10 問・3 問）が書けない** — condition label の注記（`[3問目に回答]`）で回避。banking のパスコード variant 連鎖と同根（カウンタ表現）。
4. **同一 component への goto（self-goto）で「次の問題」** — 最上段を同 component で置き直したとき variant・状態がどうなるか未規定。
5. **cross-component の挙動共有機構が無い** — 選択式/入力式の「次へ」分岐 4 回・「×」確認 2 回を複製。部品化（タブバー方式）では解けない「interaction セットの共有」。
6. multi-transition は不使用（5 人中 4 人使用）— この被験者は label 分岐と単遷移で構成し切った。

## 確信度自己申告（座標）

notes 参照 — switch×present の対応・再起動跨ぎの生存・result 連鎖・label のカウンタ代用に「中〜低」。構文基礎は高。
