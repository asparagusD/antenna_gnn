---
name: transfer-active-learning
description: Use this skill when the task involves loading pretrained GNN weights for fine-tuning, designing layer-freezing strategies, implementing MC Dropout uncertainty estimation, building a Query-by-Committee ensemble, or running a pool-based active learning acquisition loop.
---

# Skill: transfer-active-learning

## Description
Use this skill when the task involves loading pretrained GNN weights for
fine-tuning, designing layer-freezing strategies, implementing MC Dropout
uncertainty estimation, building a Query-by-Committee ensemble, or running
a pool-based active learning acquisition loop.

## Loading Pretrained Weights for Fine-Tuning
```python
from model import AntennaGNN

def load_pretrained_gnn(checkpoint_path, device):
    model = AntennaGNN()  # same architecture, same hyperparameters
    ckpt = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(ckpt['model_state'])
    model = model.to(device)
    return model
```
No architecture changes are needed — the model accepts any grid size as-is.

## Layer-Freezing Strategies
Two strategies to compare empirically (see Chunk TL-3):

```python
def freeze_early_blocks(model, n_blocks_to_freeze=2):
    """Freeze the first N of 4 GATv2Block pairs. Early layers likely learn
    generic local pixel-connectivity patterns; later layers likely encode
    more task/scale-specific mapping to S11."""
    for i, block_pair in enumerate(model.blocks):
        if i < n_blocks_to_freeze:
            for layer in block_pair:
                for param in layer.parameters():
                    param.requires_grad = False

def unfreeze_all(model):
    for param in model.parameters():
        param.requires_grad = True
```

Use a lower learning rate for fine-tuning than the original training run
(e.g. 1e-4 instead of 1e-3) regardless of which freezing strategy is used —
this is standard transfer learning practice to avoid catastrophically
overwriting pretrained weights with noisy early gradients from a much
smaller dataset.

## MC Dropout for Uncertainty Estimation
The base AntennaGNN has no dropout layers. Add dropout ONLY in a fine-tuning
variant, and only in the output MLP (adding dropout inside GATv2Block message
passing is more disruptive to pretrained weights):

```python
import torch.nn as nn

class AntennaGNNMCDropout(nn.Module):
    """Wraps a pretrained AntennaGNN, inserting dropout into the output MLP
    for MC Dropout uncertainty estimation during active learning."""
    def __init__(self, pretrained_model, dropout_p=0.2):
        super().__init__()
        self.backbone = pretrained_model  # everything up to readout_proj
        self.dropout = nn.Dropout(dropout_p)
        # Rebuild output_mlp with dropout inserted between layers
        self.output_mlp = nn.Sequential(
            nn.Linear(256, 512), nn.ReLU(), self.dropout,
            nn.LayerNorm(512),
            nn.Linear(512, 201)
        )
        # Copy pretrained output_mlp weights where shapes match
        self.output_mlp[0].load_state_dict(pretrained_model.output_mlp[0].state_dict())
        self.output_mlp[3].load_state_dict(pretrained_model.output_mlp[3].state_dict())

def mc_dropout_predict(model, data, n_passes=20):
    """Run N stochastic forward passes with dropout ACTIVE (train mode for
    dropout only) to estimate predictive uncertainty via prediction variance."""
    model.train()  # enables dropout
    preds = []
    with torch.no_grad():
        for _ in range(n_passes):
            preds.append(model(data).cpu().numpy())
    preds = np.stack(preds)  # (n_passes, batch, 201)
    mean_pred = preds.mean(axis=0)
    uncertainty = preds.std(axis=0).mean(axis=1)  # scalar per sample, averaged over freq points
    return mean_pred, uncertainty
```

## Query by Committee (QBC)
Train a small ensemble on different bootstrap subsets of the current labeled
pool, then measure prediction disagreement on unlabeled candidates:

```python
def train_committee(labeled_dataset, n_members=3, epochs=15, device='cuda'):
    committee = []
    n_samples = len(labeled_dataset)
    for m in range(n_members):
        # Bootstrap resample (sample with replacement)
        indices = np.random.choice(n_samples, n_samples, replace=True)
        bootstrap_subset = torch.utils.data.Subset(labeled_dataset, indices)
        loader = DataLoader(bootstrap_subset, batch_size=32, shuffle=True)
        member = load_pretrained_gnn(f'{DATA_ROOT}/checkpoints/best_model.pt', device)
        optimizer = torch.optim.Adam(member.parameters(), lr=1e-4)
        member.train()
        for epoch in range(epochs):
            for batch in loader:
                batch = batch.to(device)
                optimizer.zero_grad()
                out = member(batch)
                loss = nn.functional.mse_loss(out, batch.y.squeeze(1))
                loss.backward()
                optimizer.step()
        member.eval()
        committee.append(member)
    return committee

def qbc_disagreement(committee, data):
    """Variance across committee member predictions — higher = more disagreement."""
    preds = []
    with torch.no_grad():
        for member in committee:
            preds.append(member(data).cpu().numpy())
    preds = np.stack(preds)  # (n_members, batch, 201)
    disagreement = preds.std(axis=0).mean(axis=1)  # scalar per sample
    return disagreement
```

## Diversity Sampling in Latent Space
Avoid selecting clustered uncertain points by enforcing spread in the 256-dim
embedding space (reuse the EmbeddingGNN pattern from the main promptbook's
Chunk 11):

```python
def diversity_select(candidate_embeddings, candidate_scores, k, already_selected_embeddings=None):
    """Greedy furthest-point selection among the top-scoring candidates,
    to avoid picking many near-duplicate high-uncertainty samples."""
    from scipy.spatial.distance import cdist
    selected_idx = []
    remaining_idx = list(range(len(candidate_embeddings)))
    # Start from the highest-scoring candidate
    first = int(np.argmax(candidate_scores))
    selected_idx.append(first)
    remaining_idx.remove(first)
    selected_embs = [candidate_embeddings[first]]
    if already_selected_embeddings is not None:
        selected_embs = list(already_selected_embeddings) + selected_embs
    while len(selected_idx) < k and remaining_idx:
        remaining_embs = candidate_embeddings[remaining_idx]
        dists = cdist(remaining_embs, np.array(selected_embs)).min(axis=1)
        # Combine distance (diversity) with acquisition score (uncertainty)
        combined = dists * candidate_scores[remaining_idx]
        next_idx = remaining_idx[int(np.argmax(combined))]
        selected_idx.append(next_idx)
        selected_embs.append(candidate_embeddings[next_idx])
        remaining_idx.remove(next_idx)
    return selected_idx

def hybrid_acquisition_score(mc_uncertainty, qbc_disagreement, w_mc=0.5, w_qbc=0.5):
    """Combine MC Dropout and QBC signals into one acquisition score.
    Both inputs should be normalized to [0,1] via min-max scaling first."""
    mc_norm = (mc_uncertainty - mc_uncertainty.min()) / (mc_uncertainty.max() - mc_uncertainty.min() + 1e-8)
    qbc_norm = (qbc_disagreement - qbc_disagreement.min()) / (qbc_disagreement.max() - qbc_disagreement.min() + 1e-8)
    return w_mc * mc_norm + w_qbc * qbc_norm
```
