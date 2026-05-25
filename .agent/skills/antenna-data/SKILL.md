# Skill: antenna-data

## Description
Use this skill when the task involves loading .mat antenna files, inspecting dataset
structure, computing seed masks, handling functioning vs non-functioning antennas,
or working with S11 spectra and resonant frequency extraction.

## Loading .mat Files
Always use scipy.io.loadmat. Never use h5py unless the file was saved with -v7.3 flag.

```python
import scipy.io as sio
mat = sio.loadmat(path)
pattern = mat['patch_pattern']           # (N, N) int array
s11 = mat['S11_dB'].flatten()            # (201,) float
is_functioning = mat['resonant_freqs'].size > 0
res_freq = float(mat['resonant_freqs'].flatten()[0]) if is_functioning else None
```

## File Discovery (always use glob, never os.listdir)
The raw data lives in nested Batch-*/Mat_Files/ subfolders. Always use glob:

```python
import glob, numpy as np, scipy.io as sio

RAW_PATHS = {
    25: f'{RAW_DATA}/training dataset/25x25/**/Mat_Files/*.mat',
    35: f'{RAW_DATA}/fine-tuning dataset/35x35/**/Mat_Files/*.mat',
    45: f'{RAW_DATA}/fine-tuning dataset/45x45/**/Mat_Files/*.mat',
    55: f'{RAW_DATA}/fine-tuning dataset/55x55/**/Mat_Files/*.mat',
}

def get_files(N):
    return sorted(glob.glob(RAW_PATHS[N], recursive=True))
```

## RAM-Safe Bulk Loading
For >5k files, never load all at once. Use a running accumulator:

```python
BATCH = 5000
files = get_files(N)  # full absolute paths via glob
running_and = None
for start in range(0, len(files), BATCH):
    batch_patterns = np.stack([
        sio.loadmat(f)['patch_pattern']
        for f in files[start:start+BATCH]
    ])
    block = np.all(batch_patterns == 1, axis=0)
    running_and = block if running_and is None else (running_and & block)
```

## Seed Mask Computation
```python
always_metal = None
files = get_files(N)
for start in range(0, len(files), BATCH):
    batch = np.stack([sio.loadmat(f)['patch_pattern']
                      for f in files[start:start+BATCH]])
    block = np.all(batch == 1, axis=0)
    always_metal = block if always_metal is None else (always_metal & block)
np.save(f'{DATA_ROOT}/artifacts/seed_mask_{N}.npy', always_metal)
```

## Seed Centroid
```python
mask = np.load(f'{DATA_ROOT}/artifacts/seed_mask_{N}.npy')
coords = np.argwhere(mask)
centroid = coords.mean(axis=0)  # (row_center, col_center)
```

## Resonant Frequency Extraction from Predicted S11
```python
from scipy.signal import find_peaks
def extract_resonant_freq(s11_db, freq_axis_ghz, threshold_db=-10):
    # find_peaks on inverted S11 (we want dips)
    inverted = -s11_db
    peaks, props = find_peaks(inverted, height=-threshold_db, distance=5)
    if len(peaks) == 0:
        return None
    deepest = peaks[np.argmax(inverted[peaks])]
    return freq_axis_ghz[deepest]
```

## Frequency Axis
The S11 spectrum has 201 points from 1 to 4 GHz:
```python
freq_axis = np.linspace(1.0, 4.0, 201)  # GHz
```