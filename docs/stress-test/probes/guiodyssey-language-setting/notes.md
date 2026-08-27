# GUIOdyssey language-setting probe

## Source

出典は [GUIOdyssey 公式リポジトリ](https://github.com/OpenGVLab/GUI-Odyssey) と [GUIOdyssey データセット](https://huggingface.co/datasets/hflqf88888/GUIOdyssey) で、データセットのライセンスは CC BY 4.0 である。

## Preconditions

対象は episode 6991725180034358（Calendar と Setting、Pixel Tablet、15 steps、電話言語を Spanish に変更して検証）である。プローブは設定変更とカレンダー表示確認を別画面の抽象状態として記録する。

## Expected trace and success criteria

端末の表示言語を Spanish に変更し、Calendar の曜日と予定が Spanish で表示されることが成功条件である。

## Representation gaps

OS のロケール伝播と表示文言の assertion は自然言語の効果であり、shitae は locale propagation や表示内容を評価しない。座標・スクリーンショット・実機データは保持しない。
