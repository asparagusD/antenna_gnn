# Skill: gatv2-architecture

## Description
Use this skill when building, modifying, debugging, or extending the GATv2 surrogate
model for antenna S11 prediction. Contains the authoritative architecture spec.

## Architecture Specification
- Input node features: 5 (metal, x_norm, y_norm, is_seed, dist_feed)
- Input edge features: 2 (etype, direction) → projected to edge_dim=16
- Hidden dim: 128
- Attention heads: 8 (16 dims per head → 8×16 = 128 output dim)
- Layers: 8 GATv2 layers organized as 4 blocks of 2 layers each
- Residual connections: within each block (after every 2 layers)
- Readout: metal-only global mean pool + virtual node embedding → concat → Linear → 256
- Output MLP: 256 → 512 → ReLU → LayerNorm → 201

## GATv2Block
```python
import torch.nn as nn
from torch_geometric.nn import GATv2Conv

class GATv2Block(nn.Module):
    def __init__(self, in_channels, out_channels, heads, edge_dim):
        super().__init__()
        self.conv = GATv2Conv(
            in_channels, out_channels // heads,
            heads=heads, edge_dim=edge_dim,
            concat=True, dropout=0.0
        )
        self.norm = nn.LayerNorm(out_channels)
        self.residual_proj = (nn.Linear(in_channels, out_channels)
                              if in_channels != out_channels else nn.Identity())
        self.act = nn.ReLU()
    
    def forward(self, x, edge_index, edge_attr):
        out = self.conv(x, edge_index, edge_attr=edge_attr)
        out = self.norm(out)
        out = self.act(out + self.residual_proj(x))
        return out
```

## AntennaGNN (full model)
```python
from torch_geometric.nn import global_mean_pool
import torch, torch.nn as nn

class AntennaGNN(nn.Module):
    def __init__(self, node_feat_dim=5, edge_feat_dim=2,
                 hidden_dim=128, heads=8, edge_dim=16,
                 num_blocks=4, output_dim=201):
        super().__init__()
        self.input_proj = nn.Linear(node_feat_dim, hidden_dim)
        self.edge_proj   = nn.Linear(edge_feat_dim, edge_dim)
        
        self.blocks = nn.ModuleList()
        for i in range(num_blocks):
            # 2 GATv2 layers per block
            self.blocks.append(nn.ModuleList([
                GATv2Block(hidden_dim, hidden_dim, heads, edge_dim),
                GATv2Block(hidden_dim, hidden_dim, heads, edge_dim),
            ]))
        
        self.readout_proj = nn.Linear(hidden_dim * 2, 256)
        self.output_mlp = nn.Sequential(
            nn.Linear(256, 512), nn.ReLU(),
            nn.LayerNorm(512),
            nn.Linear(512, output_dim)
        )
    
    def forward(self, data):
        x, edge_index, edge_attr = data.x, data.edge_index, data.edge_attr
        batch = data.batch
        N_nodes = data.num_nodes  # per-graph; use batch for pooling
        
        x = self.input_proj(x)
        edge_attr = self.edge_proj(edge_attr)
        
        for block in self.blocks:
            for layer in block:
                x = layer(x, edge_index, edge_attr)
        
        # Identify metal nodes (feature index 0 of original input = metal)
        # Note: after projection x is transformed; use data.x[:,0] for mask
        metal_mask = data.x[:, 0].bool()
        virtual_mask = ~metal_mask  # crude; refine if needed
        
        # Metal-only pooling
        metal_x = x[metal_mask]
        metal_batch = batch[metal_mask]
        pooled = global_mean_pool(metal_x, metal_batch)  # (B, hidden_dim)
        
        # Virtual node: last node per graph (index N*N per graph)
        # Identify virtual nodes: is_seed=0, metal=0, x_norm=0.5, y_norm=0.5
        # Easier: tag virtual nodes with a flag in data.x during graph construction
        # Use data.x[:,3]==-1 as virtual node flag (set is_seed=-1 for virtual node)
        virtual_x = x[data.x[:, 3] == -1]  # (B, hidden_dim)
        
        combined = torch.cat([pooled, virtual_x], dim=-1)  # (B, 2*hidden_dim)
        out = self.readout_proj(combined)
        out = self.output_mlp(out)
        return out  # (B, 201)
```

## Virtual Node Flag Convention
When building the graph, set is_seed = -1 for the virtual global node
(not 0) so it can be uniquely identified after batching:
  node_feats.append([0.0, 0.5, 0.5, -1.0, 0.0])  # virtual node

## Attention Weight Extraction
```python
# Modify GATv2Block to optionally return attention weights:
def forward(self, x, edge_index, edge_attr, return_attention=False):
    if return_attention:
        out, (attn_edge_index, attn_weights) = self.conv(
            x, edge_index, edge_attr=edge_attr,
            return_attention_weights=True
        )
    else:
        out = self.conv(x, edge_index, edge_attr=edge_attr)
    # ... rest of forward
```