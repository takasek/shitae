# music プローブ採点（被験者: sonnet / SPEC のみ / CLI 不可）

CLI check: pass（診断ゼロ）。SPEC 照合レビュー: タブ慣用句を正確に適用し、messenger が複製で逃げたタブバーを**部品化 + 部品側デフォルト挙動**の正攻法で解決した（被験者間の対比が spec の誘導不足の証拠）。

## どう正解したか

- `# タブバー` を共有部品として定義し switch 群を部品側に持たせ、各画面は要素 `タブバー` を置くだけ — 「部品定義側の挙動はデフォルト」の模範適用。
- `present(ホーム, @tabHome)` の anchor frame、シャッフル ON/OFF の variant トグル、`# ミニプレイヤー` 部品への挙動集約はいずれも正攻法。
- 検索・ライブラリの中身を要件外で膨らませない自制も適切。

## 検出された spec の穴

1. **`exit(@nowPlaying) ; push(アルバム詳細)`** — multi-transition、4/4 人目（確信度 低と申告）。「閉じてから進む」は全プローブ共通の頻出形。
2. **exit と dismiss の同義性（named session 指定時）が読み取れない** — spec の mismatch 節は push↔dismiss・present↔back をねじれに挙げる一方、ログイン後フローの正典例は present で開いて exit で閉じる。被験者は「named なら同義」と解釈して exit に統一。**runtime 実測（oracle-q6）: この正典例に R001「ねじれ」警告が出る — 実装が spec の例と矛盾**（→ S21）。
3. **bare name と component 名の衝突** — タブのボタンを「ホーム」と書くと画面「ホーム」への参照に化ける。リネームで回避し、「component 名と一致する bare name への警告」を提案（→ S22）。
4. **グローバル×条件付き可視性の軸が無い** — ミニプレイヤー「再生中のみ表示」は document common + 自然文注記へ回避。video の PiP と同根（overlay 表現力ギャップ）。document common に「特定 component だけ除外」も書けない。
5. 前方参照（document common がファイル末尾定義の component を参照）の可否が未明記。

## 確信度自己申告（座標）

高: component/variant・collection・push/goto/back・present+@S・switch。中: exit（dismiss との同義性）。低: multi-transition・document common によるグローバル要素表現。
