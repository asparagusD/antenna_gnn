# Project: Antenna GNN Surrogate Model

## What This Project Is
A Graph Attention Network (GATv2) surrogate model that predicts the full S11 spectrum
(201 points, 1–4 GHz) of pixelated microstrip patch antennas from their binary metal
pattern. Grids are 25×25, 35×35, 45×45, and 55×55 pixels. All antennas use an air
substrate. The patch physical size is 32.375mm × 32.375mm for the 25×25 grid.
Physical pixel size = 32.375 / N mm for a grid of size N.

All code runs in Google Colab notebooks. Code lives on GitHub. Large data lives on
Google Drive. Never mix them — GitHub holds no data files, Drive holds no code files.

## Three Path Variables (set in every notebook)
Every notebook defines these three variables before anything else:

  REPO_ROOT = '/content/antenna-gnn'
  DATA_ROOT = '/content/drive/MyDrive/antenna_gnn'
  RAW_DATA  = '/content/drive/MyDrive/antenna_dataset'

REPO_ROOT  — cloned GitHub repo. Code, notebooks, skills, model.py live here.
             Cloned from: https://github.com/asparagusD/antenna_gnn.git
             Re-cloned every session (Colab wipes /content/ on disconnect).

DATA_ROOT  — Google Drive. Artifacts, checkpoints, figures, splits, processed
             graphs live here. Survives session disconnects.

RAW_DATA   — Google Drive. Raw .mat files. Already organized in Batch-* folders.
             Never written to — read only.

Never write to bare /content/ for anything that must persist.

## Dataset Summary
- ~100k samples: 25×25 grid (air substrate)
- ~5k samples:   35×35 grid (air substrate)
- ~7k samples:   45×45 grid (air substrate)
- ~3k samples:   55×55 grid (air substrate)
Total: ~115k .mat files. Exact counts are approximate — do not hardcode them.

## Raw Data Paths on Drive
The raw .mat files live in RAW_DATA on Google Drive, split into two parent folders.
The Batch-* subfolders are simulation artifacts with no semantic meaning.

25×25 (training dataset):
  RAW_DATA/training dataset/25x25/Batch-*/Mat_Files/*.mat

35×35, 45×45, 55×55 (fine-tuning dataset):
  RAW_DATA/fine-tuning dataset/35x35/Batch-*/Mat_Files/*.mat
  RAW_DATA/fine-tuning dataset/45x45/Batch-*/Mat_Files/*.mat
  RAW_DATA/fine-tuning dataset/55x55/Batch-*/Mat_Files/*.mat

NEVER use os.listdir on these folders. ALWAYS use glob with recursive=True:
  import glob
  files_25 = sorted(glob.glob(
      f'{RAW_DATA}/training dataset/25x25/**/Mat_Files/*.mat',
      recursive=True))
  files_35 = sorted(glob.glob(
      f'{RAW_DATA}/fine-tuning dataset/35x35/**/Mat_Files/*.mat',
      recursive=True))
  # same pattern for 45x45 and 55x55

## .mat File Keys
- patch_pattern:   NxN binary array (0=air, 1=metal)
- S11_dB:          (1, 201) float — full S11 spectrum, 1–4 GHz
- VSWR_full:       (1, 201) float — VSWR spectrum
- resonant_freqs:  scalar or empty — resonant frequency in GHz (empty if non-functioning)
- resonant_bws:    scalar or empty — bandwidth
- res_gains:       scalar or empty — peak realized gain (dBi)
- res_effs:        scalar or empty — radiation efficiency

A sample is "functioning" if resonant_freqs is non-empty (S11 dips below -10 dB).

## Functioning Rates by Grid Size
- 25×25: ~53% functioning
- 35×35: ~63% functioning
- 45×45: ~64% functioning
- 55×55: ~48% functioning

## Seed Block (Fixed Always-Metal Region)
Every sample contains a fixed rectangular always-metal "seed block":
- 25×25: rows 8–16, cols 7–15 (centroid ≈ pixel (12, 11))
- 35×35: rows 11–22, cols 11–22
- 45×45: rows 15–28, cols 15–28
- 55×55: rows 18–35, cols 18–35
Precomputed seed masks are stored as:
  DATA_ROOT/artifacts/seed_mask_25.npy  (and _35, _45, _55)
The seed block centroid is used as a proxy for the feed location.

## Node Feature Vector (5 features per pixel node)
[metal, x_norm, y_norm, is_seed, dist_feed]
- metal:     0 or 1 from patch_pattern
- x_norm:    j / (N-1), normalized column position
- y_norm:    i / (N-1), normalized row position
- is_seed:   1 if pixel is in seed block, else 0
- dist_feed: Euclidean distance from seed centroid, normalized by N

## Graph Structure
- Nodes: all N×N pixels + 1 virtual global node (index N*N)
- Edges: 4-connectivity between adjacent pixels (bidirectional)
- Virtual node: connected to all metal pixels only
- Edge features: [etype, direction] where
    etype: 0=metal-metal, 1=metal-air, 2=air-metal, 3=air-air
    direction: 0=right, 1=left, 2=up, 3=down

## GNN Architecture
GATv2 with 8 layers (4 blocks of 2 layers), 8 attention heads, 128 hidden dim.
Virtual global node provides long-range communication.
Output: 201-dim normalized S11 spectrum prediction.
Model defined in: REPO_ROOT/src/model.py

## Normalization
S11 targets are z-score normalized per frequency point.
Stats computed from training split only.
Stored in: DATA_ROOT/artifacts/s11_mean.npy, s11_std.npy

## Physics Constants
- Speed of light: 300 mm/ns = 300 GHz·mm
- Resonance formula (air substrate): f_res (GHz) = 150 / L_eff (mm)
- Resonance threshold: S11 < -10 dB

## Code Conventions
- Python 3.10+
- All imports at the top of each notebook section
- Code paths use REPO_ROOT. Data paths use DATA_ROOT. Raw data paths use RAW_DATA.
- Never hardcode absolute paths — always build from the three root variables
- All random operations use seed=42
- Figures saved at 300 DPI to DATA_ROOT/figures/
- Checkpoints saved to DATA_ROOT/checkpoints/ after every improvement
- Never load more than 10k .mat files into RAM simultaneously
- Use tqdm for all loops over dataset files
- Commit notebooks to GitHub after each chunk passes its completion checks

## GitHub Repo Structure
REPO_ROOT/
├── GEMINI.md
├── .gitignore           (excludes *.pt, *.mat, *.npy, data/, __pycache__)
├── requirements.txt
├── src/
│   └── model.py
├── notebooks/
│   ├── chunk01_data_exploration.ipynb
│   └── ... (one notebook per chunk)
└── .agent/
    └── skills/
        ├── antenna-data/SKILL.md
        ├── pyg-graph-construction/SKILL.md
        ├── colab-training/SKILL.md
        └── gatv2-architecture/SKILL.md

## Drive Folder Structure (DATA_ROOT)
DATA_ROOT/
├── artifacts/           (seed masks, normalization stats, embeddings)
├── checkpoints/         (best_model.pt, mlp_best.pt)
├── figures/             (all output figures)
├── splits/              (train/val/test index JSON files)
└── data/
    └── processed/       (PyG .pt graph files, auto-created during Chunk 5)
        ├── 25x25/
        ├── 35x35/
        ├── 45x45/
        └── 55x55/