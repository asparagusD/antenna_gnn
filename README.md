# Antenna GNN — Graph Attention Surrogate for Microstrip Patch Antennas

<p align="center">
  <b>Predict full S11 spectra of pixelated microstrip patch antennas in milliseconds using a Graph Attention Network.</b>
</p>

---

## Overview

This repository implements a **GATv2-based surrogate model** that predicts the
full **S11 reflection coefficient spectrum** (201 frequency points, 1–4 GHz) of
pixelated microstrip patch antennas directly from their binary metal pattern.
The model replaces expensive full-wave EM simulations (minutes per sample) with
near-instant inference (milliseconds), enabling rapid design-space exploration,
inverse design, and optimization of antenna geometries.

### Key Highlights

| Feature | Detail |
|---|---|
| **Architecture** | GATv2 with 8 layers (4 blocks × 2), 8 attention heads, 128 hidden dim |
| **Input** | Binary N×N pixel grid → graph with 4-connectivity + virtual global node |
| **Output** | 201-point S11 spectrum (dB) over 1–4 GHz |
| **Grid Sizes** | 25×25, 35×35, 45×45, 55×55 pixels |
| **Dataset** | ~115k simulated antennas (air substrate) |
| **Transfer Learning** | Pretrained on 25×25, fine-tuned to larger grids |
| **Active Learning** | MC Dropout, Query by Committee, latent diversity sampling |
| **Cascade Head** | Physics-informed resonator decomposition with Hungarian matching |

---

## Table of Contents

- [Architecture](#architecture)
- [Dataset](#dataset)
- [Graph Representation](#graph-representation)
- [Repository Structure](#repository-structure)
- [Source Modules](#source-modules)
- [Notebook Guide](#notebook-guide)
- [Setup & Installation](#setup--installation)
- [Quick Start](#quick-start)
- [Cascade Resonator Head](#cascade-resonator-head)
- [Transfer & Active Learning](#transfer--active-learning)
- [Results Summary](#results-summary)
- [Citation](#citation)
- [License](#license)

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │       Binary N×N Pixel Grid       │
                    └────────────────┬─────────────────┘
                                     │
                              Graph Construction
                    (4-connectivity + virtual global node)
                                     │
                    ┌────────────────▼─────────────────┐
                    │   Input Projection (5 → 128 dim)  │
                    │   Edge Projection  (2 → 16 dim)   │
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │     4 × GATv2 Blocks (×2 layers)  │
                    │   8 heads, 128 dim, residual +    │
                    │   LayerNorm, selective dropout     │
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │          Dual Readout             │
                    │  Metal-only mean pool + Virtual   │
                    │  node embedding → concat (256d)   │
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │     MLP Head (256 → 512 → 201)    │
                    │     ReLU, Dropout, LayerNorm      │
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │    201-dim S11 Spectrum (dB)       │
                    └──────────────────────────────────┘
```

The **metal-only pooling** ensures the readout focuses on the conducting
structure, while the **virtual global node** — connected to all metal pixels —
provides long-range communication across the graph.

---

## Dataset

The dataset comprises ~115,000 HFSS-simulated pixelated microstrip patch
antennas on an air substrate. The physical patch size is 32.375 mm × 32.375 mm.

| Grid | Samples | Functioning Rate | Pixel Pitch |
|------|---------|-----------------|-------------|
| 25×25 | ~100k | ~53% | 1.295 mm |
| 35×35 | ~5k | ~63% | 0.925 mm |
| 45×45 | ~7k | ~64% | 0.720 mm |
| 55×55 | ~3k | ~48% | 0.589 mm |

Each `.mat` file contains:
- **`patch_pattern`** — N×N binary array (0 = air, 1 = metal)
- **`S11_dB`** — (1, 201) S11 spectrum from 1–4 GHz
- **`resonant_freqs`** — resonant frequency (empty if non-functioning)
- **`resonant_bws`** — bandwidth
- **`res_gains`** — peak realized gain (dBi)
- **`res_effs`** — radiation efficiency
- **`VSWR_full`** — (1, 201) VSWR spectrum

A sample is "functioning" if its S11 dips below **-10 dB** (i.e., `resonant_freqs`
is non-empty).

> [!NOTE]
> Raw data (~115k `.mat` files) is too large for GitHub and is hosted on Google
> Drive. See the [Setup](#setup--installation) section for details.

---

## Graph Representation

Each antenna pixel grid is converted to a PyG graph:

### Nodes
- **N×N pixel nodes** — one per pixel in the grid
- **1 virtual global node** — index N², connected to all metal pixels

### Node Features (5 per pixel)

| Index | Feature | Description |
|-------|---------|-------------|
| 0 | `metal` | 0 (air) or 1 (metal) from `patch_pattern` |
| 1 | `x_norm` | Normalized column position: `j / (N-1)` |
| 2 | `y_norm` | Normalized row position: `i / (N-1)` |
| 3 | `is_seed` | 1 if pixel is in the fixed seed block, else 0 |
| 4 | `dist_feed` | Euclidean distance from seed centroid, normalized by N |

### Edge Features (2 per edge)

| Index | Feature | Values |
|-------|---------|--------|
| 0 | `etype` | 0 = metal↔metal, 1 = metal→air, 2 = air→metal, 3 = air↔air |
| 1 | `direction` | 0 = right, 1 = left, 2 = up, 3 = down |

### Seed Block
Every sample contains a fixed rectangular always-metal region (the feed point
proxy):

| Grid | Seed Block (rows, cols) |
|------|------------------------|
| 25×25 | rows 8–16, cols 7–15 |
| 35×35 | rows 11–22, cols 11–22 |
| 45×45 | rows 15–28, cols 15–28 |
| 55×55 | rows 18–35, cols 18–35 |

---

## Repository Structure

```
antenna_gnn/
├── README.md                  ← you are here
├── GEMINI.md                  ← project rules & conventions
├── .gitignore
├── requirements.txt
│
├── src/                       ← core Python modules
│   ├── model.py               ← AntennaGNN (GATv2 backbone)
│   ├── cascade.py             ← CascadeHead, Hungarian matcher, loss & metrics
│   ├── synth.py               ← differentiable resonator synthesizer
│   ├── spectral.py            ← graph Laplacian eigenvalue features
│   └── feed_component.py      ← feed-connected conductor analysis
│
├── notebooks/                 ← Colab notebooks (47 chunks)
│   ├── chunk01_data_exploration.ipynb
│   ├── chunk02_graph_construction.ipynb
│   ├── ...
│   └── chunk50_replay_chain_from_ch45.ipynb
│
└── .agent/
    └── skills/                ← agent workflow skills
        ├── antenna-data/
        ├── pyg-graph-construction/
        ├── colab-training/
        ├── gatv2-architecture/
        └── transfer-active-learning/
```

### Data on Google Drive (not in this repo)

```
DATA_ROOT/                     ← Google Drive: antenna_gnn/
├── artifacts/                 ← seed masks, normalization stats, embeddings
├── checkpoints/               ← best_model.pt, mlp_best.pt
├── figures/                   ← all output figures
├── splits/                    ← train/val/test index JSON files
└── data/processed/            ← PyG .pt graph files
    ├── 25x25/
    ├── 35x35/
    ├── 45x45/
    └── 55x55/
```

---

## Source Modules

### [`model.py`](src/model.py) — GATv2 Backbone

The core surrogate model. 4 GATv2 blocks (each with 2 layers), residual
connections, LayerNorm, and selective dropout (enabled only in deeper blocks).
Readout concatenates metal-only global mean pooling with the virtual node
embedding, feeding a 2-layer MLP to produce the 201-point S11 prediction.

### [`cascade.py`](src/cascade.py) — Cascade Resonator Head

A physics-informed output head that decomposes the S11 curve into **K learned
resonator modes** plus a polynomial baseline. Uses cross-attention from K
learnable query vectors to pixel-node embeddings with a feed-distance bias.
Includes:
- **`CascadeHead`** — transformer decoder with self-attention + cross-attention
- **`hungarian_match`** — optimal assignment of predicted modes to ground truth
- **`cascade_loss`** — multi-term loss (curve MSE + mode Huber + presence BCE + depth asymmetry)
- **`per_sample_metrics` / `summarize`** — evaluation with dip detection, AUROC, depth calibration

### [`synth.py`](src/synth.py) — Differentiable Resonator Synthesizer

Implements the parametric S11 curve formula: a sigmoid-polynomial baseline
multiplied by K Lorentzian-like resonator dips. Available in both NumPy
(for fitting) and PyTorch (for end-to-end training). Also provides:
- **`fit_curve_scipy`** — multistart trust-region fitter for extracting resonator parameters from raw S11
- **`check_numpy_torch_agreement`** — numerical consistency validation

### [`spectral.py`](src/spectral.py) — Graph Laplacian Features

Computes the top-20 eigenvalues of the normalized Laplacian of the
feed-connected metal component (8-connectivity). These spectral features capture
the topology of the conducting region and serve as auxiliary inputs to the
cascade head.

### [`feed_component.py`](src/feed_component.py) — Feed Conductor Analysis

Identifies the 8-connected metal component containing the feed pixel (as
defined by the MATLAB simulation script `alternate.m`). Provides:
- **`feed_rc`** — feed pixel coordinates per grid size
- **`feed_component_mask`** — binary mask of the feed-connected conductor
- **`feed_distance_mm`** — per-pixel distance from feed in mm
- **`AppendFeedComponentFeature`** — PyG transform to add feed-connectivity as a 6th node feature

---

## Notebook Guide

The project is organized as a sequence of numbered notebook "chunks", each
building on the previous. All notebooks run in **Google Colab** with GPU
acceleration.

### Phase 1 — Data & Baseline (Chunks 1–3)

| Notebook | Description |
|----------|-------------|
| `chunk01` | Data exploration: loading `.mat` files, visualizing patterns and S11 curves, dataset statistics |
| `chunk02` | Graph construction: converting pixel grids to PyG graphs with node/edge features |
| `chunk03` | CNN baseline: a convolutional neural network for comparison with the GNN approach |

### Phase 2 — GNN Foundation (Chunks 4–8)

| Notebook | Description |
|----------|-------------|
| `chunk04` | PyG foundations: learning PyTorch Geometric data structures and message passing |
| `chunk05` | Build dataset: batch processing ~100k samples into PyG `.pt` files on Google Drive |
| `chunk06` | Model architecture: defining and validating the GATv2 model (`model.py`) |
| `chunk07` | Training: full training loop with early stopping, learning rate scheduling, checkpointing |
| `chunk08` | Evaluation: comprehensive metrics, error analysis, per-frequency-bin accuracy |

### Phase 3 — Interpretability (Chunks 9–11)

| Notebook | Description |
|----------|-------------|
| `chunk09` | Attention visualization: extracting and plotting GATv2 attention weights |
| `chunk10` | Path analysis: information flow from feed point through the metal structure |
| `chunk11` | Latent analysis: t-SNE/UMAP of learned embeddings, clustering by antenna behavior |

### Phase 4 — Transfer & Multi-Grid (Chunks 12–15)

| Notebook | Description |
|----------|-------------|
| `chunk12` | Fine-tune data preparation: processing 35×35, 45×45, 55×55 grids |
| `chunk13` | Transfer strategy: layer freezing, learning rate sweeps, normalization contract |
| `chunk14` | Active learning: MC Dropout, Query by Committee, hybrid acquisition |
| `chunk14a` | Random-arm ablation and statistical power analysis |
| `chunk15` | Fine-tuned model evaluation across all grid sizes |

### Phase 5 — Cascade Resonator Model (Chunks 17–31)

| Notebook | Description |
|----------|-------------|
| `chunk17` | Path visualization refinements |
| `chunk20` | Dataset structure analysis for multi-grid training |
| `chunk21` | Depth diagnostics: analyzing prediction errors by resonance depth |
| `chunk22` | Loss surgery: gradient analysis, floor tuning, loss component balancing |
| `chunk23` | Classification head: functioning vs. non-functioning antenna detection |
| `chunk25` | Asymmetric loss sweep: optimizing the depth-dependent loss weighting |
| `chunk26` | Frontier scale-up: larger models, longer training, hyperparameter search |
| `chunk27` | Stratified re-audit of model performance by antenna subpopulation |
| `chunk28` | Unified measurement framework across all grid sizes |
| `chunk29` | Cascade diagnostics: resonator decomposition, dip-level metrics |
| `chunk30` | Backbone targets cache: precomputing spectral features and fit targets |
| `chunk31` | Head design: the full CascadeHead with cross-attention and physics synthesizer |

### Phase 6 — Benchmarks & Refinements (Chunks 35–50)

| Notebook | Description |
|----------|-------------|
| `chunk35` | Classification metrics: AUROC, precision/recall for functioning detection |
| `chunk36` | Gupta CNN baseline for 25×25 (literature comparison) |
| `chunk37` | Data efficiency curves: performance vs. training set size |
| `chunk40` | Test MSE per grid: final error breakdown |
| `chunk41–44` | Preprocessing and training for 12×12 and 15×15 grids |
| `chunk45` | Replay fine-tuning with experience replay for 35×35 |
| `chunk46` | S11 prediction figures for publications |
| `chunk47` | Band distribution analysis |
| `chunk48` | Deep single-band figure generation |
| `chunk49` | Gupta CNN baseline for 35×35 and 45×45 |
| `chunk50` | Replay chain continuation from chunk 45 |

---

## Setup & Installation

### Prerequisites

- Python 3.10+
- Google Colab (recommended) or a local GPU environment
- Google Drive (for data storage)

### 1. Clone the repository

```bash
git clone https://github.com/asparagusD/antenna_gnn.git
cd antenna_gnn
```

### 2. Install dependencies

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install torch-geometric
pip install scipy numpy pandas matplotlib seaborn tqdm scikit-learn h5py
```

### 3. Set up data paths

Every notebook expects three path variables at the top:

```python
REPO_ROOT = '/content/antenna-gnn'          # cloned repo (Colab)
DATA_ROOT = '/content/drive/MyDrive/antenna_gnn'   # processed data, checkpoints
RAW_DATA  = '/content/drive/MyDrive/antenna_dataset'  # raw .mat files
```

### 4. Mount Google Drive (Colab)

```python
from google.colab import drive
drive.mount('/content/drive')
```

---

## Quick Start

### Inference with a pretrained model

```python
import torch
from src.model import AntennaGNN

# Load model
model = AntennaGNN()
ckpt = torch.load('best_model.pt', map_location='cpu', weights_only=False)
model.load_state_dict(ckpt['model_state'])
model.eval()

# Load normalization stats
import numpy as np
s11_mean = np.load('s11_mean.npy')
s11_std  = np.load('s11_std.npy')

# Run inference on a PyG graph
with torch.no_grad():
    pred_normalized = model(graph_data)
    pred_db = pred_normalized.numpy() * s11_std + s11_mean  # de-normalize
```

### Training from scratch

Run the notebooks in order starting from `chunk01`. Each notebook is
self-contained with setup cells that clone the repo and mount Drive.

---

## Cascade Resonator Head

The advanced cascade head (Chunks 29–31) decomposes S11 into physically
meaningful components:

```
S11(f) = baseline(f) × ∏ᵢ resonator_dip(f; f₀ᵢ, Qᵢ, rminᵢ, sᵢ)
```

where:
- **baseline** — sigmoid of a polynomial, capturing the smooth return loss floor
- **f₀** — resonant frequency of each mode
- **Q** — quality factor (sharpness of resonance)
- **rmin** — minimum reflection coefficient at resonance
- **s** — presence probability (0 = inactive slot, 1 = active resonance)

The head uses **cross-attention** from K learnable resonator queries to the GNN's
pixel-node embeddings, with a **feed-distance bias** that naturally focuses
attention near the antenna's feed point. Training uses **Hungarian matching** to
optimally assign predicted modes to ground-truth resonances, enabling the model
to handle antennas with varying numbers of resonances.

---

## Transfer & Active Learning

The GATv2 architecture is **grid-agnostic** — normalized coordinates and
mean-pooling readout allow the same pretrained weights to accept any grid size.

### Transfer Learning Pipeline
1. Pretrain on ~100k 25×25 samples
2. Optionally freeze early GATv2 blocks
3. Fine-tune on smaller datasets of larger grids (35–55 pixels)
4. Maintain the **normalization contract**: always use 25×25 training statistics

### Active Learning Strategies
- **MC Dropout** — epistemic uncertainty via stochastic forward passes
- **Query by Committee** — disagreement among bootstrap-trained ensemble members
- **Hybrid acquisition** — rank-normalized uncertainty + latent diversity sampling
  via farthest-point selection in the 256-d embedding space

---

## Results Summary

| Metric | Description |
|--------|-------------|
| **S11 MSE** | Mean squared error of the full 201-point spectrum (dB²) |
| **Dip localization** | Fraction of functioning antennas with predicted resonance within ±1 frequency bin (15 MHz) of truth |
| **Functioning AUROC** | Classification of functioning (S11 < −10 dB) vs. non-functioning antennas |
| **Depth calibration** | Slope and R² of predicted vs. true minimum S11 |
| **Missed rate** | Fraction of true resonances not detected in prediction |

The GATv2 surrogate significantly outperforms CNN baselines and generalizes
across grid sizes via transfer learning, providing accurate S11 predictions
suitable for rapid antenna design optimization.

---

## Physics Context

- **Speed of light:** c = 300 mm/ns = 300 GHz·mm
- **Resonance formula (air substrate):** f_res (GHz) ≈ 150 / L_eff (mm)
- **Resonance threshold:** S11 < −10 dB
- **Frequency range:** 1–4 GHz (201 uniformly spaced points, Δf = 15 MHz)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

All code is developed in Google Colab notebooks. When contributing:
- Use `seed=42` for all random operations
- Save figures at 300 DPI to `DATA_ROOT/figures/`
- Follow the three-path-variable convention (`REPO_ROOT`, `DATA_ROOT`, `RAW_DATA`)
- Never commit data files (`.pt`, `.mat`, `.npy`) to GitHub

---

## License

Please refer to the repository's license file for usage terms.

---

## Acknowledgments

This project uses:
- [PyTorch Geometric](https://pyg.org/) for graph neural network operations
- [GATv2](https://arxiv.org/abs/2105.14491) (Brody et al., 2022) attention mechanism
- [MATLAB 2025a](https://www.mathworks.com/products/matlab.html) for electromagnetic simulation data generation
