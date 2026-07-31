import json

with open('notebooks/chunk14_active_learning.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

descriptions = {
    '1': "Installs all required libraries for graph data processing (PyTorch Geometric), ML tooling (WandB, UMAP), and visualization.",
    '2': "Clones or updates the `antenna_gnn` repository containing the model architecture and skill definitions.",
    '3': "Mounts Google Drive to access artifacts, checkpoints, and data splits, mapping constants for consistent pathing.",
    '4': "Loads the best transfer strategy configured in Chunk 13 (learning rate, freezing rules) and creates `DataLoader`s. Imports exact freezing and early-stopping routines verbatim to prevent subtle data leakage or architectural mismatches.",
    '5': "Defines the Active Learning loop utilizing MC Dropout for predictive uncertainty and Query-by-Committee for disagreement. Includes `diversity_select` in the latent space to assemble batches without duplicating uncertainty spikes.",
    '6': "Defines the Random Baseline loop as a control mechanism. Uses the identical warm-started fine-tuning procedure but selects unlabeled candidates via uniform random distribution instead of intelligent scoring.",
    '7': "Executes loops for multiple seeds incrementally. Appends evaluation metrics directly to `al_curves.csv` after every round to protect computational budget in case of instance disconnection.",
    '8': "Plots validation S11 and Resonant Frequency MAE curves against the labeled pool budget, complete with standard deviation confidence bands and budget-saving determinations.",
    '9': "Tests the Active Learning strategy on the fully disjoint, held-out test set precisely once (using Seed 1) against the Zero-Shot baseline. Saves the final production-ready model for subsequent evaluations.",
    '10': "Enforces non-overlapping isolation across training/validation/test sets and validates `al_curves.csv` data completeness before proceeding."
}

for cell in nb['cells']:
    if cell['cell_type'] == 'markdown':
        source = cell['source']
        if not source:
            continue
        first_line = source[0]
        if first_line.startswith('## '):
            # Parse the number out of '## X. ...'
            try:
                num = first_line.split(' ')[1].replace('.', '')
                if num in descriptions:
                    # Append the description
                    if len(source) == 1:
                        source[0] = source[0].rstrip('\n') + '\n\n'
                    source.append(descriptions[num] + '\n')
            except Exception as e:
                pass

with open('notebooks/chunk14_active_learning.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)

print("Descriptions added successfully.")
