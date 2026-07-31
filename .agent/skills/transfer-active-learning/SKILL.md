---
name: transfer-active-learning
description: Fine-tuning a pretrained GATv2 antenna surrogate onto larger pixel grids (35x35, 45x45, 55x55) from a 25x25 pretrained checkpoint, and selecting which samples to label using active learning. Covers the normalization contract, weight loading, layer freezing, MC Dropout, Query by Committee, and latent diversity sampling.
---

# Skill: transfer-active-learning

## Description
Fine-tuning a pretrained GATv2 antenna surrogate onto larger pixel grids
(35x35, 45x45, 55x55) from a 25x25 pretrained checkpoint, and selecting which
samples to label using active learning. Covers the normalization contract,
weight loading, layer freezing, MC Dropout, Query by Committee, and latent
diversity sampling.

## Normalization contract (non-negotiable)
On-disk `data.y` is RAW dB. The Dataset z-scores at load using the 25x25
training-split s11_mean/s11_std and preserves `y_raw`. `evaluate()`
de-normalizes with the same statistics. Never recompute statistics from the
fine-tune pool. Every loader construction site passes the statistics. A
load-time assertion (mean approx 0, std approx 1, min > -12) must run before
any training. Violating this silently inflates every dB metric by a factor of
s11_std and corrupts resonance detection.

## Loading pretrained weights
```python
def load_pretrained_gnn(checkpoint_path, device):
    model = AntennaGNN()
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    return model.to(device)
```
The architecture is grid-agnostic: node features are normalized coordinates and
the readout is a mean over nodes, so the same weights accept any N. Only the
target scale ties the head to the 25x25 statistics — hence the contract.

## Layer-freezing strategies
`model.blocks` is a ModuleList of 4 GATv2Block pairs (8 layers). Freezing the
first k pairs means freezing layers `0 .. 2k-1`.
```python
def freeze_early_blocks(model, n_blocks_to_freeze=2):
    for i, layer in enumerate(model.blocks):
        if i < n_blocks_to_freeze * 2:
            for p in layer.parameters():
                p.requires_grad = False
```
Always pass `filter(lambda p: p.requires_grad, model.parameters())` to the
optimizer. Print the trainable/total parameter counts so freezing is visible in
the log.

Expected ordering with correctly scaled targets: lower learning rates (1e-4)
should be competitive with or better than 5e-4, and some freezing should help.
If 5e-4 with no freezing wins by a wide margin, suspect the normalization
contract before believing the result.

## MC Dropout for uncertainty
Wrap the pretrained model, replacing the output-MLP dropout with a
higher-rate module, and copy ALL parameterized layers across.
```python
class AntennaGNNMCDropout(nn.Module):
    def __init__(self, pretrained_model, dropout_p=0.2):
        super().__init__()
        self.blocks = pretrained_model.blocks
        self.dropout = nn.Dropout(dropout_p)
        self.output_mlp = nn.Sequential(
            nn.Linear(256, 512), nn.ReLU(), self.dropout,
            nn.LayerNorm(512), nn.Linear(512, 201))
        # indices 0, 3, 4 are the parameterized layers. Copying only 0 and 3
        # silently discards the final Linear(512, 201) — a real bug in v1.0.
        for i in (0, 3, 4):
            self.output_mlp[i].load_state_dict(
                pretrained_model.output_mlp[i].state_dict())
```
`model.train()` during MC sampling enables the backbone conv dropout as well as
the output dropout. That is intended, but state it in the code comment so it is
not mistaken for a bug.

Uncertainty is computed on NORMALIZED outputs. Do not de-normalize before
taking the standard deviation: in dB space the variance is dominated by the
deep-resonance points, which is a different — and worse — acquisition signal.

## Query by Committee
Train k=3 members on bootstrap resamples of the current labeled set. Committee
members are cheap approximations, not publishable models: fixed epoch count, no
early stopping, no validation. Budget accordingly — the committee is the
dominant cost of the AL arm (3 members x 15 epochs x 7 rounds per seed).
Disagreement is the per-sample variance of member predictions, again in
normalized space.

## Diversity sampling in latent space
Take the pooled graph embedding (pre-output-MLP, 256-d), then greedy
farthest-point selection over the top-scoring candidates. Restrict embedding
computation to the candidate shortlist, not the whole unlabeled pool — a full
pool forward pass per round is wasted compute.

## Hybrid acquisition
Rank-normalize each of {MC std, QBC disagreement} to [0,1], sum, take the top
`3 * round_size` as candidates, then apply diversity selection down to
`round_size`. Record the composition of every acquisition.
