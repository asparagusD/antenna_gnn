import json

with open('notebooks/chunk13_transfer_strategy.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

for cell in nb.get('cells', []):
    new_source = []
    for line in cell.get('source', []):
        # Replace literal backslash-n with actual newline
        new_source.append(line.replace('\\n', '\n'))
    cell['source'] = new_source

with open('notebooks/chunk13_transfer_strategy.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)

print("Fixed literal \\n characters in chunk13_transfer_strategy.ipynb")
