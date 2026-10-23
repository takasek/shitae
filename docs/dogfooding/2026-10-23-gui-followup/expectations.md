# 実行前の期待

module模型を ShowA→Both→Again→BackFlow→ReturnA と操作し、記録4 BackFlowの最初の結果 push(a::Home) へ確認付きで戻す。期待は a::Home、a::Notice Ready・b::Notice Idle・Controller が掲示中、後の観測点がghostとして残ること。ここをGUIから実ファイル保存し、新しいGUIへ読み込み、Closeでbだけを消す別経路を選び、再保存→別processの公開CLIで再生する。hash・IDの編集や内部Sessionのexportは使わない。

元レポート48/11操作の実保存物は、modelId・engineVersionと操作数で元模型に対応するものだけを採用する。今回のDownloads直下には一致するファイルが無かったため、別の新規記録で過去の欠落を埋めない。
