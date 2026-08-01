import json, sys

nb_path = sys.argv[1]
cell_idx = int(sys.argv[2])
nb = json.load(open(nb_path, 'r', encoding='utf-8'))
src = ''.join(nb['cells'][cell_idx]['source'])
sys.stdout.buffer.write(src.encode('utf-8'))
