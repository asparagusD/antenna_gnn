# Antenna GNN: a GATv2 surrogate for pixelated microstrip patch antennas

A graph neural network that predicts the full |S11| spectrum of a pixelated microstrip patch antenna (201 points, 1–4 GHz) directly from its binary metal pattern. A single 587k-parameter model covers five pixel resolutions (12×12, 15×15, 25×25, 35×35, 45×45), replacing a full-wave EM simulation with a forward pass that takes milliseconds.

The work grew out of an undergraduate thesis at the University of Dhaka and is being prepared for IEEE journal submission. The repository is the complete, chronological research log: every experiment is a numbered Colab notebook ("chunk"), and the shared code lives in `src/`.

---

## Contents

- [Headline results](#headline-results)
- [Problem and data](#problem-and-data)
- [Graph representation](#graph-representation)
- [Model](#model)
- [Model lineage](#model-lineage)
- [Baseline: the Gupta et al. CNN](#baseline-the-gupta-et-al-cnn)
- [Research log: every notebook](#research-log-every-notebook)
- [Source modules](#source-modules)
- [Conventions and safeguards](#conventions-and-safeguards)
- [Running the notebooks](#running-the-notebooks)
- [Drive layout and key artifacts](#drive-layout-and-key-artifacts)
- [Known issues and caveats](#known-issues-and-caveats)

---

## Headline results

### GATv2 vs the Gupta et al. CNN, test sets

The GATv2 is one model for all five grids: `ch44_ft15_from4_replay_p100_s0`. Each Gupta CNN (flatten readout, no adaptive pooling) is trained separately on one grid. All values are seed 0, on held-out test sets; **bold marks the lower error**.

| Grid | Test antennas | MAE (dB): GATv2 | MAE (dB): Gupta CNN | MSE (dB²): GATv2 | MSE (dB²): Gupta CNN | CNN parameters |
|---|---:|---:|---:|---:|---:|---:|
| 12×12 | 700 | **0.489** | 0.560 | **1.812** | 2.300 | 42.8 M |
| 15×15 | 637 | **0.506** | 0.674 | **2.106** | 3.109 | 63.5 M |
| 25×25 | 9,983 | 0.389 | **0.380** | 1.391 | **1.293** | 165.9 M |
| 35×35 | 499 | **0.327** | 0.479 | **1.128** | 1.984 | 319.5 M |
| 45×45 | 699 | **0.309** | 0.415 | **1.125** | 1.747 | 524.3 M |

- **Where the GATv2 wins:** 12, 15, 35 and 45. In each case a paired bootstrap on the same test antennas puts the 95% interval entirely in favour of the GATv2 (Chunks 49, 50).
- **Where it doesn't:** at 25×25 the CNN, with 166 M parameters and about 80k training antennas, is slightly better. The GATv2 trained on 25×25 alone reaches MAE 0.374 and MSE 1.318.
- **Parameter count:** the GATv2 has 587k parameters on every grid; the CNN grows with N² (see [baseline](#baseline-the-gupta-et-al-cnn)).
- **35×35 with the extra data:** the GATv2 fine-tuned on the 1,997 extra 35×35 antennas (Chunk 45, `replay35_new100_s0`) reaches MAE 0.322 and MSE 1.105 there, on the same 5,987-antenna training set as the 35×35 CNN.
- **The 25×25 CNN figures are recorded values:** they come from Chunk 36's report, because its checkpoint and per-sample file no longer exist (see [caveats](#known-issues-and-caveats)).

### Other findings

- **Zero-shot vs fine-tuned:** the model trained on 25×25 only transfers poorly to other grids; its 12×12 val MSE is about 3.7 dB². Replay-based fine-tuning recovers accuracy on the new grid while preserving the old ones.
- **Data efficiency, 25×25 (Chunk 37):** the GATv2 reaches its full-data AUROC (within 0.01) with ≤ 5,000 training antennas; the CNN needs about 10,000. Neither model reaches its full-data MAE within 5% at 20,000 antennas.
- **Grid difficulty (Chunk 40):** 45×45 is not significantly easier than 35×35. Skill relative to an average-curve baseline is 0.761, 0.724 and 0.720 on 25, 35 and 45.
- **Error budget (Chunk 28):** MSE is dominated by broadband error, not by deep dips.
- **Extra 35×35 data (Chunks 45, 50):** 1,997 extra 35×35 antennas give only a small gain at 35×35, mostly attributable to longer training. Re-running the 12×12 → 15×15 chain from that model does not improve 12×12 or 15×15.

---

## Problem and data

Each antenna is an N×N binary pixel pattern on a patch about 32.4 mm wide, produced by the MATLAB generator `alternate.m` (V3.1.1) and simulated full-wave. The target is |S11| in dB at 201 points from 1 to 4 GHz (15 MHz spacing). A fixed block of seed pixels around the feed is always metal.

| Grid | Pixel pitch | Antennas | Functioning (LABEL_MIN) | Single band | Dual band | 3+ bands |
|---|---|---:|---:|---:|---:|---:|
| 12×12 | ≈ 2.70 mm | 7,000 | 49.2% | 43.1% | 5.6% | 0.1% |
| 15×15 | ≈ 2.16 mm | 6,367 | 55.6% | 50.2% | 5.1% | 0.2% |
| 25×25 | 1.296 mm | 99,833 | 56.9% | 53.0% | 3.7% | 0.1% |
| 35×35 | 0.925 mm | 4,988 | 63.9% | 61.0% | 2.5% | 0.2% |
| 35×35 extra (Chunk 45) | 0.925 mm | 1,997 | 66.8% | 63.5% | 2.9% | 0.1% |
| 45×45 | 0.720 mm | 6,984 | 65.6% | 62.5% | 2.4% | 0.1% |

All percentages are of all antennas (Chunk 47). Functioning antennas are predominantly single-band: 88% at 12×12 rising to 95% at 35/45. Resonances cluster at 3.5–3.9 GHz; the median first resonance is 3.72–3.75 GHz on 25/35/45 (Chunk 20).

A 55×55 set was simulated as well, but it is **excluded from every headline result since Chunk 28** (quarantined as an appendix).

### Two "functioning" labels

| Label | Definition | Status |
|---|---|---|
| Legacy (`is_functioning`) | the simulator's `resonant_freqs` list is non-empty | historical |
| **`LABEL_MIN`** | the true curve's minimum over 201 points is below −10 dB | **canonical since Chunk 29** |

The two labels disagree almost only on dips clipped at the 1 or 4 GHz band edge. `LABEL_MIN` counts those; the legacy label misses them. The surrogate classifies from its predicted curve, so the label is defined the same way on the true curve.

### Band rule (Chunks 46–48)

A **band** is a true-curve dip below −10 dB with at least 3 dB prominence, at least 150 MHz (10 points) from the next dip.

### Splits

| Grid | Train / pool | Val | Test | Source |
|---|---:|---:|---:|---|
| 12×12 | 5,600 | 700 | 700 | `finetune12_*_indices.json` (Chunk 41) |
| 15×15 | 5,092 | 638 | 637 | `finetune15_*_indices.json` (Chunk 43) |
| 25×25 | 79,866 | 9,984 | 9,983 | `indices.json` (Chunk 5; stratified, seed 42) |
| 35×35 | 3,990 (+1,997 extra) | 499 | 499 | `finetune_*_indices.json` (Chunk 12); extra in `ch45_preprocess_report.json` |
| 45×45 | 5,587 | 698 | 699 | `finetune_*_indices.json` (Chunk 12) |

The 1,997 extra 35×35 antennas are training-only. Chunk 45 de-duplicated them against every existing 35×35 antenna, so none copies a val or test antenna.

---

## Graph representation

Built by the frozen graph builder from Chunk 5 / Chunk 12. Chunks 41, 43 and 45 copy it verbatim and verify it bit-for-bit against existing 35×35 graphs.

- **Nodes:** N² pixel nodes plus one virtual global node (index N²).
- **Node features (5 stored):**
  - metal (0/1)
  - x and y, normalised to [0, 1]
  - is_seed (−1 on the virtual node)
  - distance to the seed centroid / N
- **Sixth feature, added at load time:** `AppendFeedComponentFeature` (`src/feed_component.py`) appends a flag marking pixels in the feed's **8-connected** metal component. The generator draws each pixel at 1.011× its pitch, so diagonal neighbours touch and conduct (Chunk 29).
- **Edges:**
  - 4-connected pixel edges with attributes `[type, direction]`, where type encodes metal/dielectric on each end
  - bidirectional edges between the virtual node and every metal pixel (type 4)
- **Target:** stored in raw dB and z-scored only at load time, with the canonical 25×25 training statistics (`s11_mean.npy`, `s11_std.npy`). Predictions are de-normalised with the same statistics. See the [normalisation contract](#conventions-and-safeguards).

---

## Model

`src/model.py`, `AntennaGNN`:

```
input_proj (Linear 5|6 → 128)       edge_proj (Linear 2 → 16)
        │
4 blocks × 2 GATv2Block   (GATv2Conv, 8 heads × 16, edge_dim 16, LayerNorm, residual, ReLU;
        │                  conv dropout 0.1 from block 2 on)
        ├── mean pool over METAL pixel nodes ──┐
        └── virtual-node embedding ────────────┴─ concat (256) → Linear 256
                                                         → MLP 256→512→201 (dropout 0.1, LayerNorm)
                                                         → |S11| (z-scored), 201 points
```

| Variant | Inputs | Parameters |
|---|---:|---:|
| `best_model.pt` (25×25 base, Chunk 7) | 5 | 587,001 |
| every fine-tuned model since Chunk 30 | 6 | 587,129 |

Because pooling covers metal pixels only and the virtual node connects only to metal, the same weights apply to any grid size.

---

## Model lineage

```
best_model.pt                         Chunk 7   25×25 only (Adam 1e-3, batch 128, patience 20)
   │  + zero 6th input column (exact)
   ▼
backbone_no55.pt                      Chunk 30  fine-tuned on 35+45 with 25×25 replay; gated val MSE ≤ 1.35
   │
   ├──▶ ch42_ft12_replay_p100_s0.pt           Chunk 42  12×12 + replay 25/35/45      ("four-grid model")
   │       │
   │       ▼
   │    ch44_ft15_from4_replay_p100_s0.pt     Chunk 44  15×15 + replay 12/25/35/45   ★ FINAL FIVE-GRID MODEL
   │
   └──▶ ch45_replay35_new100_s0.pt            Chunk 45  + 1,997 extra 35×35 antennas  (25/35/45 only)
           │
           ▼
        ch50_ft12_replay_from45_s0 → ch50_ft15_from4_replay_from45_s0   Chunk 50  (not adopted: no improvement)
```

**Fine-tuning recipe (Chunks 42/44/45/50):**
- **Optimiser:** Adam, lr 1e-4, weight decay 1e-4, batch 64, gradient clipping 1.0.
- **Schedule:** ReduceLROnPlateau (factor 0.5, patience 5); early stopping with patience 10.
- **Replay:** each epoch adds a fresh random draw from every earlier grid, equal in size to the new grid's pool.
- **Selection:** the target grid's val MSE.

The asymmetric-loss and classification-head experiments (Chunks 22–27) are **not** in this lineage. `backbone_no55` uses the plain MSE recipe.

---

## Baseline: the Gupta et al. CNN

Reproduction of the forward CNN in Gupta *et al.*, IEEE TAP 2023, Fig. 4: three convolutional blocks (64/128/256 channels, BatchNorm, LeakyReLU 0.2), then fully connected layers 1000 → 500 → 201 with dropout 0.4. Training uses NAdam (lr 1e-3, batch 256) on raw-dB MSE.

Without adaptive pooling, the first fully connected layer has **256 · N² · 1000** weights, so the model grows with the grid:

| Grid | Total parameters | Share in the first FC layer | Trained in |
|---|---:|---:|---|
| 12×12 | 42,771,473 | 86% | Chunk 42 (`cnn12`) |
| 15×15 | 63,507,473 | 91% | Chunk 44 (`cnn15`) |
| 25×25 | 165,907,473 | 96% | Chunk 36 (`gupta_cnn25`) |
| 35×35 | 319,507,473 | 98% | Chunk 49 (`cnn35`; 5,987 training antennas) |
| 45×45 | 524,307,473 | 99% | Chunk 49 (`cnn45`) |

The adaptive-pooling variant (`cnn_best`, Chunk 3, about 6.2 M parameters at any grid size) was the earlier baseline. On 25×25 test it reached MAE 0.391, against the GNN's 0.374 (Chunk 8).

---

## Research log: every notebook

Notebooks are numbered in the order they were run. Gaps in the numbering (16, 18, 19, 24, 32–34, 38, 39) are chunks that were planned and dropped.

### Phase 1: data, graphs and the 25×25 base model

| Notebook | What it does | Outcome |
|---|---|---|
| `chunk01_data_exploration` | Loads the raw `.mat` files and explores patterns, S11 curves and resonance statistics. | Dataset understood; seed masks derived (pixels metal in every file). |
| `chunk02_graph_construction` | Designs the pixel graph: features, 4-connected edges, virtual node. | Graph spec fixed. |
| `chunk03_cnn_baseline` | Trains an adaptive-pooling CNN baseline on 25×25 (runs on Kaggle). | `cnn_best.pt`. |
| `chunk04-pyg-foundations` | PyTorch Geometric setup and foundations. | Environment verified. |
| `chunk05_build_dataset` | Builds all PyG graphs and the stratified splits (seed 42). | Processed zips, `indices.json`. |
| `chunk06_model_architecture` | CPU shape and parameter checks of `AntennaGNN`. | 587,001 parameters verified. |
| `chunk07_training` | Trains the GATv2 on 25×25 (resumable, W&B). | `best_model.pt`. |
| `chunk08_evaluation` | GNN vs CNN on 25×25 test. | GNN MAE 0.374 vs CNN 0.391. |

### Phase 2: interpretability

| Notebook | What it does | Outcome |
|---|---|---|
| `chunk09_attention_visualization` | GATv2 attention maps on 25×25 antennas. | Attention-map figures (25×25). |
| `chunk10_path_analysis` | Path-length features and counterfactual pixel flips (high- vs low-attention). | Path-length analysis and counterfactual-ablation results. |
| `chunk11_latent_analysis` | UMAP of the 256-d readout, coloured by physics quantities. | UMAP figures of the latent space. |
| `chunk17_path_viz` | Extracts the attention-maximising path from the feed to the patch edge. | Path figures. |

### Phase 3: transfer to 35/45 (and 55)

| Notebook | What it does | Outcome |
|---|---|---|
| `cleanup_v1_artifacts` | Quarantines (never deletes) the v1.0 fine-tune artifacts made under a normalisation defect. | Clean v2.0 workspace. |
| `chunk12_finetune_data_prep` | Graphs, manifest and splits for 35/45/55; defines the normalisation contract. | `finetune_*_indices.json`. |
| `chunk13_transfer_strategy` | Compares freezing depth and learning rates. | **Strategy A** (full fine-tune, lr 1e-4) chosen. |
| `chunk14_active_learning`, `chunk14a_random_arm_and_power` | Simulated active learning and a power analysis of the random arm. | Effect smaller than seed noise; **AL deferred**, no claim made. |
| `chunk15_finetuned_evaluation` | Zero-shot vs fine-tuned vs full-pool ceiling on 35/45/55. | Fine-tuning recovers most of the zero-shot gap. |
| `chunk20_dataset_structure` | Percolation vs self-averaging hypotheses across grids. | Pre-registered rule: **inconclusive**. |
| `chunk_prereq_multigrid_cache` | Local caching of multi-grid graphs. | Faster data loading. |

### Phase 4: the depth-bias investigation

| Notebook | What it does | Outcome |
|---|---|---|
| `chunk21_depth_diagnostics` | Diagnoses the under-prediction of deep resonances (false negatives). | Depth bias confirmed. |
| `chunk22_loss_surgery` | Loss variants on a 2,000-antenna subset. | Weighted MSE (L2) wins on AUROC; the depth criterion still FAILs. |
| `chunk_seed_stability` | Five-seed stability of L0 vs L2. | L2's win is stable. |
| `chunk23_classification_head` | Adds a functioning-classification head. | **Rejected**. |
| `chunk25_asymmetric_loss_sweep` | Asymmetric loss κ sweep at 2k antennas. | κ = 2.0 under a 15% MAE cap. |
| `chunk26_frontier_scaleup` | Repeats the sweep at 4k antennas. | Pre-registered selection κ = 1.5; the effect holds with scale. |
| `chunk27_stratified_reaudit` | Full L0 → κ progression audit. | Keep κ = 1.5. |
| `chunk27b_fnr_reconciliation` | Explains an FNR discrepancy between Chunks 26 and 27. | A permuted bin-label bug, fixed. |
| `chunk28_unified_measurement` | Measures every model on every set in one pass. | MSE is broadband-dominated; **55×55 excluded** from headlines. |

### Phase 5: the resonator-cascade head (a negative result)

| Notebook | What it does | Outcome |
|---|---|---|
| `chunk29_cascade_diagnostics_v2` | Tests whether true curves are representable as resonator products; labels; spectral features. | Representation viable; **`LABEL_MIN` canonical**; 8-connected conductor confirmed. |
| `chunk30_backbone_targets_cache`, `chunk30b_backbone_targets_cache` | `backbone_no55` (v2 gate, with replay), K = 3 mode targets, embedding caches. | Gate passed; `backbone_no55.pt`. |
| `chunk31_head_design` | Cascade head on frozen embeddings (`src/cascade.py`). | **Gate failed** (val MSE ≈ 1.26 vs < 0.50 required); stop and reassess. |

### Phase 6: paper measurements, new grids and the CNN comparison

| Notebook | What it does | Outcome |
|---|---|---|
| `chunk35_classification_metrics` | AUROC, balanced accuracy and macro-F1 at the fixed −10 dB threshold, with bootstrap intervals. | Classification table. |
| `chunk36_gupta_cnn_25x25` | Gupta CNN at 25×25. | Test MSE 1.293, MAE 0.380. |
| `chunk37_data_efficiency` | Nested 5k–40k subsets, GNN vs CNN. | GNN saturates AUROC with fewer antennas. |
| `chunk40_test_mse_per_grid` | Test metrics of `backbone_no55` on 25/35/45; is 45 easier? | 35×35 1.146, 45×45 1.110 dB²; difference not significant. |
| `chunk41_preprocess_12x12`, `chunk43_preprocess_15x15` | Build 12×12 and 15×15 graphs with the frozen builder. | New datasets and splits. |
| `chunk42_train_test_12x12` | Fine-tune, replay, scratch and CNN arms at 12×12. | `ft12_replay` (four-grid model). |
| `chunk44_train_test_15x15` | The same design at 15×15, from the four-grid model. | **Final five-grid model.** |
| `chunk45_replay_finetune_35x35_extra` | Preprocesses 2k extra 35×35 antennas; replay fine-tune. | Small gain, mostly from longer training. |
| `chunk46_s11_prediction_figures` | Single- and dual-band S11 figures per grid (zero-shot vs fine-tuned). | Paper figures. |
| `chunk47_band_distribution` | Band counts per grid. | Table in [Problem and data](#problem-and-data). |
| `chunk48_deep_single_band_figures` | Single-band figures: dip below −15 dB, resonance at 3.5–3.75 GHz; best fine-tuned example per grid. | **Final S11 figures.** |
| `chunk49_gupta_cnn_35x35_45x45` | Gupta CNN at 35/45; scores every table model in one pass. | Completes the GATv2-vs-CNN table. |
| `chunk50_replay_chain_from_ch45` | Re-runs the 12 → 15 chain from the Chunk 45 model. | No improvement; the Chunk 44 model stays final. |

---

## Source modules

| File | Contents | Used by |
|---|---|---|
| `src/model.py` | `AntennaGNN` and `GATv2Block` | every training and evaluation chunk |
| `src/feed_component.py` | `PIXEL_SIZE_MM`, `feed_rc` (the generator's feed pixel, with MATLAB rounding), the 8-connected `feed_component_mask`, `feed_distance_mm`, and the PyG transform `AppendFeedComponentFeature` (5 → 6 features) | Chunk 30 onward |
| `src/spectral.py` | Normalised-Laplacian eigenvalue features (20) of the feed component (Chunk 29 V2) | Chunks 29–31 |
| `src/synth.py` | The resonator synthesiser (numpy, torch and batched differentiable versions), with a numpy/torch agreement check, and the bounded multistart curve fitter | Chunks 29–31 |
| `src/cascade.py` | `CascadeHead` (K resonator queries cross-attending to pixel embeddings), Hungarian matching, cascade loss, metrics and `SpectralNorm` | Chunk 31 |

---

## Conventions and safeguards

These conventions run through every notebook since Chunk 12.

- **Normalisation contract:**
  - Targets are stored on disk in raw dB.
  - They are z-scored at load time with the 25×25 training-split `s11_mean` / `s11_std`, and de-normalised with the same values.
  - The statistics are never recomputed from a fine-tune pool.
  - Breaking this contract is what invalidated v1.0 (see `cleanup_v1_artifacts`).
- **Pre-registration:** questions, gates, selection rules and verdict wording are fixed in the markdown before any result is computed.
- **One test touch:** test sets are scored in a single guarded cell (`TEST_TOUCHES == 1`). Model selection uses validation data only.
- **Reproduction harnesses:**
  - Before training, the notebook must reproduce earlier validation numbers to show the pipeline is unchanged.
  - After the test touch, every earlier test number must reproduce to within 0.005, or the notebook stops.
- **Guards:** each notebook ends with checks that:
  - checkpoints match their SHA-256
  - inputs are unchanged and no earlier file was modified (mtimes)
  - every output carries the chunk's prefix (`chNN_*`)
- **Resumable training queues:** finished runs are skipped. Checkpoints are mirrored to Drive with a forced flush and verified by hash.
- **Statistics:** 95% stratified bootstrap intervals (1,000 resamples, stratified by `LABEL_MIN`). Model comparisons are paired, on the same test antennas.
- **Reproducibility:** deterministic cuDNN, no TF32 or bf16, fixed seeds.

---

## Running the notebooks

The notebooks are written for **Google Colab** with Google Drive mounted. Chunk 3 ran on Kaggle.

1. Put the data on Drive under `MyDrive/antenna_gnn/` (see the layout below).
2. Open a notebook in Colab with a GPU runtime. Each notebook clones this repository, adds `src/` to the path and mounts Drive itself.
3. Run all cells. Long training cells resume across sessions.

**Main dependencies:** `torch`, `torch_geometric`, `numpy`, `scipy`, `pandas`, `pyarrow`, `scikit-learn`, `matplotlib`, `tqdm`, `tabulate`. Interpretability chunks also use `umap-learn` and `networkx`; Chunk 7 uses `wandb`. `requirements.txt` is git-ignored, and each notebook installs what it needs in its first cell.

**GPU notes:** most chunks run on any Colab GPU. The 45×45 Gupta CNN (524 M parameters) needs a 40 GB GPU for a true batch of 256; on smaller GPUs, Chunk 49 falls back to gradient accumulation.

**Using the final model:**

```python
import sys, torch
sys.path.insert(0, 'antenna_gnn/src')
from model import AntennaGNN
from feed_component import AppendFeedComponentFeature

m = AntennaGNN(node_feat_dim=6, edge_feat_dim=2, hidden_dim=128, heads=8,
               edge_dim=16, num_blocks=4, output_dim=201)
ck = torch.load('checkpoints/ch44_ft15_from4_replay_p100_s0.pt', map_location='cpu', weights_only=False)
m.load_state_dict(ck['model_state']); m.eval()

g = AppendFeedComponentFeature()(graph)              # graph: 5-feature PyG Data from the Chunk 5 builder
s11_db = m(batch_of(g)) * s11_std + s11_mean          # de-normalise with the 25×25 statistics
```

---

## Drive layout and key artifacts

```
MyDrive/antenna_gnn/
├── data/processed/processed_{12,15,25,35,45,55}x{N}.zip   PyG graphs (raw-dB targets)
├── data/processed/processed_35x35_extra.zip               Chunk 45's 1,997 extra antennas
├── splits/   indices.json · finetune_{pool,val,test}_indices.json · finetune{12,15}_{pool,val,test}_indices.json
├── artifacts/   s11_mean.npy · s11_std.npy · seed_mask_{N}.npy · chNN_* (runs, curves, metrics, reports)
├── checkpoints/   *.pt
└── figures/   chNN/ …
```

| Checkpoint | Role |
|---|---|
| `best_model.pt` | 25×25 base GATv2; zero-shot reference |
| `backbone_no55.pt` | 25/35/45 backbone (Chunk 30 gate) |
| `ch42_ft12_replay_p100_s0.pt` | four-grid model (12/25/35/45) |
| **`ch44_ft15_from4_replay_p100_s0.pt`** | **final five-grid model** |
| `ch45_replay35_new100_s{0,1}.pt` | 25/35/45 model with the extra 35×35 data |
| `ch42_cnn12_p100_s*.pt`, `ch44_cnn15_p100_s*.pt`, `ch49_cnn{35,45}_p100_s*.pt` | Gupta CNN baselines |
| `ch50_*.pt` | Chunk 50 chain (not adopted) |

---

## Known issues and caveats

- **Missing 25×25 CNN files:** `ch36_gupta_cnn25_best.pt` and `ch36_per_sample.parquet` were deleted. The 25×25 CNN numbers are Chunk 36's recorded values, and 25×25 is the only grid without a paired GATv2-vs-CNN test.
- **45×45 seed-0 CNN batch:** it trained with micro-batch 128 and 2-step gradient accumulation (effective batch 256), so its BatchNorm saw 128-sample statistics. Seed 1 ran at a full 256.
- **`ch49_report.md` parameter label:** it lists the Chunk 45 GATv2 with the CNN's parameter count. The model has 587,129 parameters; its metrics are correct.
- **Single seeds:** the final GATv2 and the table CNNs are seed 0. Where a second seed exists, the conclusions are unchanged (the seed-1 CNNs are worse).
- **Asymmetric-loss models:** the asymmetric loss (κ = 1.5) reduced deep-resonance false negatives, but those models are not part of the final lineage.
- **`chunk30` vs `chunk30b`:** `chunk30b` is the v2 run (replay, two-condition gate) that produced the `backbone_no55.pt` used downstream.

---

## Citation

A paper describing this work is in preparation for an IEEE journal; citation details will be added on publication. Please add a license file before reusing the code.
