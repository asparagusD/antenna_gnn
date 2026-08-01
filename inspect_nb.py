import json, sys

nb_path = sys.argv[1]
nb = json.load(open(nb_path, 'r', encoding='utf-8'))
for i, c in enumerate(nb['cells']):
    src = ''.join(c['source'])
    first_line = src.strip().split('\n')[0][:120] if src.strip() else '(empty)'
    print(f"Cell {i}: type={c['cell_type']}, lines={len(c['source'])}, first: {first_line}")
