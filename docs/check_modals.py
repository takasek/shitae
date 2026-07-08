import re

# present した component が、その component 内で goto によって離脱されていないか
# （present で開いたモーダルは dismiss/exit で閉じるべき。goto すると下のモーダルが残る）

def analyze(path):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')

    # present(X) / present(X, @S) の X を集める = モーダルとして開かれるcomponent
    presented = {}  # component名 -> [(行番号, 開いた側)]
    cur_comp = None
    for i, raw in enumerate(lines, 1):
        line = raw.split('//')[0]
        m = re.match(r'^#\s+(\S.*)$', line)
        if m and not line.startswith('##'):
            cur_comp = m.group(1).strip()
        # インタラクション行（行頭 '>'）を剥がす。継続行（'->' なし）も
        # present/goto を含み得るため抽出対象に含める
        line = re.sub(r'^>\s*', '', line)
        for mm in re.finditer(r'\bpresent\s*\(([^)]*)\)', line):
            args = [a.strip() for a in mm.group(1).split(',')]
            target = args[0]
            if target and not target.startswith('@'):
                # ##姿 や module:: は単純化のため component 名部分を取る
                comp = re.sub(r'##.*$', '', target).split('::')[-1].strip()
                presented.setdefault(comp, []).append((i, cur_comp))

    # 各 presented component の定義内で、goto が使われていないか
    # （goto は置き換え＝モーダルを閉じずに中身を差し替えるので、モーダル内では危険）
    issues = []
    cur_comp = None
    for i, raw in enumerate(lines, 1):
        line = raw.split('//')[0]
        m = re.match(r'^#\s+(\S.*)$', line)
        if m and not line.startswith('##'):
            cur_comp = m.group(1).strip()
            continue
        line = re.sub(r'^>\s*', '', line)
        if cur_comp in presented:
            for mm in re.finditer(r'\bgoto\s*\(([^)]*)\)', line):
                arg = mm.group(1).strip()
                # 同一component内の姿替え（##のみ）は問題なし（モーダル内で姿が変わるだけ）
                if arg.startswith('##'):
                    continue
                # 別componentへのgoto = モーダル内から別画面へ置き換え → 危険
                issues.append((i, cur_comp, arg, presented[cur_comp]))
    return presented, issues

for path in ['example-battle.shitae', 'example-ecommerce.shitae']:
    presented, issues = analyze(path)
    print(f"\n===== {path} =====")
    print("present で開かれる component:")
    for c, locs in presented.items():
        print(f"  {c}  ← {[f'L{l}({by})' for l,by in locs]}")
    print(f"\nモーダル内からの別component goto（要注意）: {len(issues)} 件")
    for i, comp, arg, opened in issues:
        print(f"  ⚠ L{i}: モーダル '{comp}' 内で goto({arg}) — dismiss されず下に残る")
        print(f"      （'{comp}' は {[f'L{l}' for l,_ in opened]} で present されている）")
