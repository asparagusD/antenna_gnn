# Skill: colab-training

## Description
Use this skill when writing PyTorch training loops, validation loops, checkpointing,
learning rate scheduling, or W&B logging for Google Colab. Always apply these
patterns — they are mandatory for disconnect-safety.

## Standard Notebook Header (3 cells, always first)
```python
# Cell 1 — Install dependencies
!pip install scipy numpy matplotlib torch torchvision \
    torch-geometric umap-learn wandb networkx tqdm -q

# Cell 2 — Clone repo (re-clones every session; pulls latest if already exists)
import os
REPO_ROOT = '/content/antenna-gnn'
if not os.path.exists(REPO_ROOT):
    !git clone https://github.com/asparagusD/antenna_gnn.git {REPO_ROOT}
else:
    !git -C {REPO_ROOT} pull --quiet
import sys
sys.path.insert(0, f'{REPO_ROOT}/src')   # makes 'from model import AntennaGNN' work
print(f'Repo ready at {REPO_ROOT}')

# Cell 3 — Mount Drive and set data paths
from google.colab import drive
drive.mount('/content/drive')
DATA_ROOT = '/content/drive/MyDrive/antenna_gnn'
RAW_DATA  = '/content/drive/MyDrive/antenna_dataset'
for d in [f'{DATA_ROOT}/artifacts', f'{DATA_ROOT}/checkpoints',
          f'{DATA_ROOT}/figures',   f'{DATA_ROOT}/splits',
          f'{DATA_ROOT}/data/processed']:
    os.makedirs(d, exist_ok=True)
print(f'Drive mounted. DATA_ROOT={DATA_ROOT}')
```

## Checkpoint-Resume Pattern (mandatory in all training notebooks)
```python
import os, torch

CKPT_PATH = f'{DATA_ROOT}/checkpoints/best_model.pt'
start_epoch = 0
best_val_loss = float('inf')

if os.path.exists(CKPT_PATH):
    ckpt = torch.load(CKPT_PATH, map_location=device)
    model.load_state_dict(ckpt['model_state'])
    optimizer.load_state_dict(ckpt['optimizer_state'])
    scheduler.load_state_dict(ckpt['scheduler_state'])
    start_epoch = ckpt['epoch'] + 1
    best_val_loss = ckpt['val_loss']
    print(f'Resumed from epoch {start_epoch}, val_loss={best_val_loss:.6f}')
else:
    print('Starting fresh training')
```

## Checkpoint Save (call inside epoch loop on improvement)
```python
def save_checkpoint(model, optimizer, scheduler, epoch, val_loss, path):
    torch.save({
        'epoch': epoch,
        'model_state': model.state_dict(),
        'optimizer_state': optimizer.state_dict(),
        'scheduler_state': scheduler.state_dict(),
        'val_loss': val_loss,
    }, path)
```

## Gradient Norm Logging
```python
total_norm = 0.0
for p in model.parameters():
    if p.grad is not None:
        total_norm += p.grad.data.norm(2).item() ** 2
total_norm = total_norm ** 0.5
```

## W&B Setup in Colab
```python
import wandb
wandb.login()  # prompts for API key once
run = wandb.init(
    project='antenna-gnn',
    config=config,           # pass your hyperparameter dict
    resume='allow',          # handles reconnection gracefully
    id=run_id                # use a fixed id so W&B merges disconnected runs
)
```

## GPU Device Check (always include at top of training section)
```python
import torch
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
assert device.type == 'cuda', 'GPU not available. Go to Runtime → Change runtime type → T4 GPU'
```

## Memory-Safe Epoch Loop (move batches to device, delete after use)
```python
for batch in train_loader:
    batch = batch.to(device)
    optimizer.zero_grad()
    out = model(batch)
    loss = criterion(out, batch.y.squeeze(1))
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
    optimizer.step()
    del batch  # free GPU memory immediately
    torch.cuda.empty_cache()
```

## Figure Save Pattern
```python
import matplotlib
matplotlib.use('Agg')  # non-interactive backend for Colab
import matplotlib.pyplot as plt
# ... build figure ...
plt.savefig(f'{DATA_ROOT}/figures/my_figure.png', dpi=300, bbox_inches='tight')
plt.show()  # still shows inline in notebook
```