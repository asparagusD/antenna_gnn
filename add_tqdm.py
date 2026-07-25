import json

with open('notebooks/chunk13_transfer_strategy.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Modify cell 9 (which is index 9 in our array since we added markdown cells)
# Wait, index 9 is cell 5 code. Let's find it.
cell_idx = None
for i, cell in enumerate(nb['cells']):
    if cell.get('cell_type') == 'code' and "def evaluate(model, loader):" in ''.join(cell.get('source', [])):
        cell_idx = i
        break

if cell_idx is not None:
    source = ''.join(nb['cells'][cell_idx]['source'])
    
    # Add tqdm import
    if "from tqdm.auto import tqdm" not in source:
        source = source.replace("import torch.nn as nn", "import torch.nn as nn\\nfrom tqdm.auto import tqdm")
    
    # Add tqdm to evaluate loop
    source = source.replace("for batch in loader:", "for batch in tqdm(loader, desc='Evaluating', leave=False):")
    
    # Add tqdm to train loop
    source = source.replace(
        "for batch in loader:",
        "for batch in tqdm(loader, desc=f'Epoch {epoch+1}/{epochs}', leave=False):"
    )
    
    # Write back
    nb['cells'][cell_idx]['source'] = [line + '\\n' for line in source.split('\\n')]
    nb['cells'][cell_idx]['source'][-1] = nb['cells'][cell_idx]['source'][-1].rstrip('\\n')
    
    with open('notebooks/chunk13_transfer_strategy.ipynb', 'w', encoding='utf-8') as f:
        json.dump(nb, f, indent=1)
    
    print(f"Successfully modified cell {cell_idx}")
else:
    print("Could not find the target cell.")
