import json

nb = {
    "cells": [],
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3"
        },
        "language_info": {
            "codemirror_mode": {
                "name": "ipython",
                "version": 3
            },
            "file_extension": ".py",
            "mimetype": "text/x-python",
            "name": "python",
            "nbconvert_exporter": "python",
            "pygments_lexer": "ipython3",
            "version": "3.10.12"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 5
}

def md_cell(source):
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + '\\n' for line in source.split('\\n')]
    }

def code_cell(source):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + '\\n' for line in source.split('\\n')]
    }

cells = []

# Cell 1
cells.append(md_cell("## 1. Install Dependencies"))
cells.append(code_cell("""# Cell 1 - Install dependencies
!pip install scipy numpy matplotlib torch torchvision \\
    torch-geometric umap-learn wandb networkx tqdm pandas -q"""))

# Cell 2
cells.append(md_cell("## 2. Clone Repository"))
cells.append(code_cell("""# Cell 2 - Clone repo (re-clones every session; pulls latest if already exists)
import os
REPO_ROOT = '/content/antenna-gnn'
if not os.path.exists(REPO_ROOT):
    !git clone https://github.com/asparagusD/antenna_gnn.git {REPO_ROOT}
else:
    !git -C {REPO_ROOT} pull --quiet
import sys
sys.path.insert(0, f'{REPO_ROOT}/src')   # makes 'from model import AntennaGNN' work
print(f'Repo ready at {REPO_ROOT}')"""))

# Cell 3
cells.append(md_cell("## 3. Mount Drive and Setup Paths"))
cells.append(code_cell("""# Cell 3 - Mount Drive and set data paths
from google.colab import drive
drive.mount('/content/drive')
DATA_ROOT = '/content/drive/MyDrive/antenna_gnn'
RAW_DATA  = '/content/drive/MyDrive/antenna_dataset'
for d in [f'{DATA_ROOT}/artifacts', f'{DATA_ROOT}/checkpoints',
          f'{DATA_ROOT}/figures',   f'{DATA_ROOT}/splits',
          f'{DATA_ROOT}/data/processed']:
    os.makedirs(d, exist_ok=True)
print(f'Drive mounted. DATA_ROOT={DATA_ROOT}')

import torch
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
assert device.type == 'cuda', 'GPU not available. Go to Runtime → Change runtime type → T4 GPU'"""))

# Cell 4
cells.append(md_cell("## 4. Load Fine-tuning Dataset Subset\\nWe use a small 2,000-sample subset of the fine-tuning pool to quickly compare transfer strategies."))
cells.append(code_cell("""# Cell 4 - Load fine-tuning pool and fixed test set
import json
import torch
from torch.utils.data import Dataset
from torch_geometric.loader import DataLoader
from sklearn.model_selection import train_test_split
import numpy as np

class FinetuneDataset(Dataset):
    def __init__(self, indices, processed_dir_base):
        self.indices = indices
        self.processed_dir_base = processed_dir_base
        
    def __len__(self):
        return len(self.indices)
        
    def __getitem__(self, idx):
        grid_size, sample_idx = self.indices[idx]
        pt_path = f"{self.processed_dir_base}/{grid_size}x{grid_size}/sample_{sample_idx}.pt"
        data = torch.load(pt_path, map_location='cpu', weights_only=False)
        return data

with open(f'{DATA_ROOT}/splits/finetune_pool_indices.json', 'r') as f:
    pool_indices = json.load(f)
with open(f'{DATA_ROOT}/splits/finetune_test_indices.json', 'r') as f:
    test_indices = json.load(f)

# Stratify pool down to 2,000 samples for fast comparison
grid_labels = [str(x[0]) for x in pool_indices]
if len(pool_indices) > 2000:
    subset_pool, _ = train_test_split(pool_indices, train_size=2000, stratify=grid_labels, random_state=42)
else:
    subset_pool = pool_indices

processed_dir = f'{DATA_ROOT}/data/processed_finetune'
train_dataset = FinetuneDataset(subset_pool, processed_dir)
test_dataset = FinetuneDataset(test_indices, processed_dir)

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)

print(f"Original pool size: {len(pool_indices)}")
print(f"Subset pool size: {len(subset_pool)}")
print(f"Test size: {len(test_indices)}")"""))

# Cell 5
cells.append(md_cell("## 5. Zero-Shot Baseline\\nEvaluate the pretrained 25x25 model on the fine-tuning test set without any additional training."))
cells.append(code_cell("""# Cell 5 - Zero-shot baseline
import torch.nn as nn
from scipy.signal import find_peaks
from model import AntennaGNN

def load_pretrained_gnn(checkpoint_path, device):
    model = AntennaGNN() 
    ckpt = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(ckpt['model_state'])
    model = model.to(device)
    return model

def freeze_early_blocks(model, n_blocks_to_freeze=2):
    \"\"\"Freeze the first N of 4 GATv2Block pairs (each pair is 2 layers).\"\"\"
    layers_to_freeze = n_blocks_to_freeze * 2
    for i, layer in enumerate(model.blocks):
        if i < layers_to_freeze:
            for param in layer.parameters():
                param.requires_grad = False

def extract_resonant_freq(s11_db, freq_axis_ghz, threshold_db=-10):
    inverted = -s11_db
    peaks, props = find_peaks(inverted, height=-threshold_db, distance=5)
    if len(peaks) == 0:
        return None
    deepest = peaks[np.argmax(inverted[peaks])]
    return freq_axis_ghz[deepest]

s11_mean = torch.tensor(np.load(f'{DATA_ROOT}/artifacts/s11_mean.npy'), dtype=torch.float32, device=device)
s11_std = torch.tensor(np.load(f'{DATA_ROOT}/artifacts/s11_std.npy'), dtype=torch.float32, device=device)
freq_axis = np.linspace(1.0, 4.0, 201)

def evaluate(model, loader):
    model.eval()
    s11_maes = {35: [], 45: [], 55: []}
    freq_maes = {35: [], 45: [], 55: []}
    class_correct = {35: 0, 45: 0, 55: 0}
    class_total = {35: 0, 45: 0, 55: 0}
    
    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            out_norm = model(batch)
            true_norm = batch.y.squeeze()
            if true_norm.dim() == 1:
                true_norm = true_norm.unsqueeze(0)
            
            out_db = out_norm * s11_std + s11_mean
            true_db = true_norm * s11_std + s11_mean
            
            batch_s11_mae = torch.abs(out_db - true_db).mean(dim=1)
            
            for i in range(len(batch.grid_size)):
                g = batch.grid_size[i].item()
                if g not in s11_maes: continue
                s11_maes[g].append(batch_s11_mae[i].item())
                
                pred_s11 = out_db[i].cpu().numpy()
                true_s11 = true_db[i].cpu().numpy()
                
                pred_res = extract_resonant_freq(pred_s11, freq_axis)
                true_res = extract_resonant_freq(true_s11, freq_axis)
                
                pred_func = pred_res is not None
                true_func = true_res is not None
                
                if pred_func == true_func:
                    class_correct[g] += 1
                class_total[g] += 1
                
                if pred_func and true_func:
                    freq_maes[g].append(abs(pred_res - true_res))
                    
            del batch
            torch.cuda.empty_cache()
            
    res = {}
    for g in [35, 45, 55]:
        res[g] = {
            's11_mae': np.mean(s11_maes[g]) if s11_maes[g] else 0.0,
            'freq_mae': np.mean(freq_maes[g]) if freq_maes[g] else 0.0,
            'class_acc': (class_correct[g] / max(class_total[g], 1)) * 100
        }
    return res

def train_finetune(model, loader, epochs=15, lr=1e-4):
    optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr)
    criterion = nn.MSELoss()
    for epoch in range(epochs):
        model.train()
        for batch in loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            out = model(batch)
            loss = criterion(out, batch.y.squeeze())
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            del batch
            torch.cuda.empty_cache()
    return model

print("Evaluating Zero-Shot Baseline...")
base_model = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
res_zero_shot = evaluate(base_model, test_loader)
print(res_zero_shot)
del base_model
torch.cuda.empty_cache()"""))

# Cell 6
cells.append(md_cell("## 6. Strategy A: Full Fine-tune (lr=1e-4)\\nUnfreeze all layers and train with a small learning rate."))
cells.append(code_cell("""# Cell 6 - Strategy A: full fine-tune, lr=1e-4
print("Running Strategy A: Full fine-tune, lr=1e-4")
model_A = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
model_A = train_finetune(model_A, train_loader, epochs=15, lr=1e-4)
res_A = evaluate(model_A, test_loader)
print(res_A)
del model_A
torch.cuda.empty_cache()"""))

# Cell 7
cells.append(md_cell("## 7. Strategy B: Freeze 2 Blocks (lr=1e-4)\\nFreeze the first 2 block pairs (4 layers) to retain generic connectivity representations, only fine-tuning higher layers."))
cells.append(code_cell("""# Cell 7 - Strategy B: freeze first 2 of 4 GATv2 block pairs, lr=1e-4
print("Running Strategy B: Freeze 2 block pairs, lr=1e-4")
model_B = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
freeze_early_blocks(model_B, n_blocks_to_freeze=2)
model_B = train_finetune(model_B, train_loader, epochs=15, lr=1e-4)
res_B = evaluate(model_B, test_loader)
print(res_B)
del model_B
torch.cuda.empty_cache()"""))

# Cell 8
cells.append(md_cell("## 8. Strategy C: Freeze 3 Blocks (lr=1e-4)\\nFreeze the first 3 block pairs (6 layers), only fine-tuning the very last pair and the MLP head."))
cells.append(code_cell("""# Cell 8 - Strategy C: freeze first 3 of 4 GATv2 block pairs, lr=1e-4
print("Running Strategy C: Freeze 3 block pairs, lr=1e-4")
model_C = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
freeze_early_blocks(model_C, n_blocks_to_freeze=3)
model_C = train_finetune(model_C, train_loader, epochs=15, lr=1e-4)
res_C = evaluate(model_C, test_loader)
print(res_C)
del model_C
torch.cuda.empty_cache()"""))

# Cell 9
cells.append(md_cell("## 9. Strategy D: Full Fine-tune (lr=5e-4)\\nSame as Strategy A but with a higher learning rate to see if 1e-4 was too conservative."))
cells.append(code_cell("""# Cell 9 - Strategy D: full fine-tune, higher lr=5e-4
print("Running Strategy D: Full fine-tune, lr=5e-4")
model_D = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
model_D = train_finetune(model_D, train_loader, epochs=15, lr=5e-4)
res_D = evaluate(model_D, test_loader)
print(res_D)
del model_D
torch.cuda.empty_cache()"""))

# Cell 10
cells.append(md_cell("## 10. Results Comparison & Selection\\nCompare all runs and choose the best performing strategy for Chunk 14."))
cells.append(code_cell("""# Cell 10 - Comparison table and decision
import pandas as pd
import json

strategies = {
    'Zero-shot (no fine-tune)': res_zero_shot,
    'A: Full fine-tune, lr=1e-4': res_A,
    'B: Freeze 2 blocks, lr=1e-4': res_B,
    'C: Freeze 3 blocks, lr=1e-4': res_C,
    'D: Full fine-tune, lr=5e-4': res_D
}

rows = []
for strat, res in strategies.items():
    for g in [35, 45, 55]:
        rows.append({
            'Strategy': strat,
            'Grid Size': f'{g}x{g}',
            'S11 MAE (dB)': res[g]['s11_mae'],
            'Freq MAE (GHz)': res[g]['freq_mae'],
            'Class Acc (%)': res[g]['class_acc']
        })

df = pd.DataFrame(rows)
print(df.to_markdown(index=False))

df.to_csv(f'{DATA_ROOT}/artifacts/transfer_strategy_comparison.csv', index=False)

# Analyze winning strategy automatically for S11 MAE (aggregate)
agg_mae = df.groupby('Strategy')['S11 MAE (dB)'].mean().sort_values()
winning_strat = agg_mae.index[0]
print(f"\\nAutomatically Selected Winning Strategy: {winning_strat}")

if 'A:' in winning_strat:
    config = {'n_blocks_to_freeze': 0, 'lr': 1e-4}
elif 'B:' in winning_strat:
    config = {'n_blocks_to_freeze': 2, 'lr': 1e-4}
elif 'C:' in winning_strat:
    config = {'n_blocks_to_freeze': 3, 'lr': 1e-4}
elif 'D:' in winning_strat:
    config = {'n_blocks_to_freeze': 0, 'lr': 5e-4}
else:
    config = {'n_blocks_to_freeze': 0, 'lr': 1e-4} # default fallback

with open(f'{DATA_ROOT}/artifacts/chosen_transfer_strategy.json', 'w') as f:
    json.dump(config, f, indent=4)"""))

# Cell 11
cells.append(md_cell("""## Decision
The table above compares the strategies across the fine-tune grids. The chosen strategy configuration (learning rate, freezing rules) is saved to `DATA_ROOT/artifacts/chosen_transfer_strategy.json` and will be loaded by Chunk 14 for the active learning loop."""))

nb["cells"] = cells

with open('g:/antenna_gnn/notebooks/chunk13_transfer_strategy.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)
