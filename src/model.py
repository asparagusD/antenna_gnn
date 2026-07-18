"""
AntennaGNN — GATv2-based surrogate model for S11 spectrum prediction.

Architecture: 8 GATv2 layers (4 blocks x 2 layers), 8 attention heads,
128 hidden dim. Readout: metal-only global mean pool + virtual node
embedding -> concat -> MLP -> 201-dim S11 spectrum.
"""

import torch
import torch.nn as nn
from torch_geometric.nn import GATv2Conv, global_mean_pool


class GATv2Block(nn.Module):
    def __init__(self, in_channels, out_channels, heads, edge_dim, dropout=0.0):
        super().__init__()
        self.conv = GATv2Conv(
            in_channels, out_channels // heads,
            heads=heads, edge_dim=edge_dim,
            concat=True, dropout=dropout
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


class AntennaGNN(nn.Module):
    def __init__(self, node_feat_dim=5, edge_feat_dim=2,
                 hidden_dim=128, heads=8, edge_dim=16,
                 num_blocks=4, output_dim=201,
                 conv_dropout=0.10, mlp_dropout=0.10,
                 dropout_from_block=2):
        super().__init__()
        self.input_proj = nn.Linear(node_feat_dim, hidden_dim)
        self.edge_proj  = nn.Linear(edge_feat_dim, edge_dim)

        self.blocks = nn.ModuleList()
        for i in range(num_blocks):
            block_dropout = conv_dropout if i >= dropout_from_block else 0.0
            self.blocks.append(nn.ModuleList([
                GATv2Block(hidden_dim, hidden_dim, heads, edge_dim, dropout=block_dropout),
                GATv2Block(hidden_dim, hidden_dim, heads, edge_dim, dropout=block_dropout),
            ]))

        self.readout_proj = nn.Linear(hidden_dim * 2, 256)
        self.output_mlp = nn.Sequential(
            nn.Linear(256, 512),
            nn.ReLU(),
            nn.Dropout(mlp_dropout),
            nn.LayerNorm(512),
            nn.Linear(512, output_dim)
        )

    def forward(self, data):
        x, edge_index, edge_attr = data.x, data.edge_index, data.edge_attr
        batch = data.batch

        x = self.input_proj(x)
        edge_attr = self.edge_proj(edge_attr)

        for block in self.blocks:
            for layer in block:
                x = layer(x, edge_index, edge_attr)

        # Metal-only pooling
        metal_mask = data.x[:, 0] > 0.5
        metal_x = x[metal_mask]
        metal_batch = batch[metal_mask]
        pooled = global_mean_pool(metal_x, metal_batch)

        # Virtual node embedding
        virtual_mask = data.x[:, 3] == -1
        virtual_x = x[virtual_mask]

        combined = torch.cat([pooled, virtual_x], dim=-1)
        out = self.readout_proj(combined)
        out = self.output_mlp(out)
        return out
