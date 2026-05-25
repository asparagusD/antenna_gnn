# Skill: pyg-graph-construction

## Description
Use this skill when the task involves converting antenna patch patterns into
PyTorch Geometric Data objects, building graph datasets, or working with
edge_index, node features, virtual global nodes, or PyG DataLoaders.

## PyG Data Object for One Antenna
```python
import torch
from torch_geometric.data import Data
import numpy as np

def build_pyg_graph(patch_pattern, s11_db, seed_mask, N):
    # Compute seed centroid
    coords = np.argwhere(seed_mask)
    seed_r, seed_c = coords.mean(axis=0)
    
    # Node features: (N*N + 1) nodes, 5 features each
    node_feats = []
    for i in range(N):
        for j in range(N):
            metal    = float(patch_pattern[i, j])
            x_norm   = j / (N - 1)
            y_norm   = i / (N - 1)
            is_seed  = float(seed_mask[i, j])
            dist_f   = np.sqrt((i - seed_r)**2 + (j - seed_c)**2) / N
            node_feats.append([metal, x_norm, y_norm, is_seed, dist_f])
    
    # Virtual global node (index N*N): all zeros except placeholder
    node_feats.append([0.0, 0.5, 0.5, 0.0, 0.0])
    node_feats = torch.tensor(node_feats, dtype=torch.float)
    
    # 4-connectivity edges
    edge_src, edge_dst, edge_attr = [], [], []
    etype_map = {(1,1):0, (1,0):1, (0,1):2, (0,0):3}
    for i in range(N):
        for j in range(N):
            idx = i * N + j
            m_ij = int(patch_pattern[i, j])
            for (di, dj, direction) in [(0,1,0),(0,-1,1),(-1,0,2),(1,0,3)]:
                ni, nj = i+di, j+dj
                if 0 <= ni < N and 0 <= nj < N:
                    nidx = ni * N + nj
                    m_nb = int(patch_pattern[ni, nj])
                    etype = etype_map[(m_ij, m_nb)]
                    edge_src.append(idx); edge_dst.append(nidx)
                    edge_attr.append([etype, direction])
    
    # Virtual node edges (connect to all metal pixels only)
    global_idx = N * N
    for i in range(N):
        for j in range(N):
            if patch_pattern[i, j] == 1:
                idx = i * N + j
                edge_src += [global_idx, idx]
                edge_dst += [idx, global_idx]
                edge_attr += [[4, 4], [4, 4]]  # virtual edge type
    
    edge_index = torch.tensor([edge_src, edge_dst], dtype=torch.long)
    edge_attr  = torch.tensor(edge_attr, dtype=torch.float)
    
    # Target
    y = torch.tensor(s11_db, dtype=torch.float).unsqueeze(0)  # (1, 201)
    
    return Data(x=node_feats, edge_index=edge_index, edge_attr=edge_attr, y=y)
```

## Dataset Class Pattern (saves to Drive, skips existing)
```python
from torch_geometric.data import Dataset
import os, torch, scipy.io as sio, numpy as np, glob

class AntennaDataset(Dataset):
    def __init__(self, data_root, grid_size, seed_mask, transform=None):
        self.grid_size = grid_size
        self.proc_dir = f'{data_root}/data/processed/{grid_size}x{grid_size}'
        os.makedirs(self.proc_dir, exist_ok=True)
        self.files = get_files(grid_size)  # from antenna-data skill
        super().__init__(data_root, transform)
    
    def len(self): return len(self.files)
    
    def get(self, idx):
        stem = os.path.splitext(os.path.basename(self.files[idx]))[0]
        proc_path = f'{self.proc_dir}/{stem}.pt'
        if os.path.exists(proc_path):
            return torch.load(proc_path)
        mat = sio.loadmat(self.files[idx])
        data = build_pyg_graph(mat['patch_pattern'],
                               mat['S11_dB'].flatten(),
                               self.seed_mask, self.grid_size)
        data.grid_size = self.grid_size
        data.is_functioning = int(mat['resonant_freqs'].size > 0)
        data.pixel_size_mm = 32.375 / self.grid_size
        torch.save(data, proc_path)
        return data
```

## Variable Node Counts in a Batch
PyG handles variable-size graphs automatically via the batch vector.
When batching graphs of size 25×25 (626 nodes) and 55×55 (3026 nodes),
the batch tensor assigns each node to its graph index. This is automatic.
Never manually pad graphs to the same size.

## Metal-Only Global Mean Pool
```python
from torch_geometric.nn import global_mean_pool

def metal_only_pool(x, batch, metal_mask):
    # metal_mask: (total_nodes,) bool tensor, True for metal pixels
    metal_x    = x[metal_mask]
    metal_batch = batch[metal_mask]
    return global_mean_pool(metal_x, metal_batch)
```