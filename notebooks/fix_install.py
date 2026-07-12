import json

file_path = 'g:/antenna_gnn/notebooks/chunk04_pyg_foundations_kaggle.ipynb'
with open(file_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# The install code cell is currently code cell 0, which is at nb['cells'][1]
# We will modify it to verify GPU first, and then install.
install_code = [
    "import torch\n",
    "import os\n",
    "import subprocess\n",
    "import sys\n",
    "\n",
    "device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')\n",
    "assert device.type == 'cuda', 'Please enable GPU (2 T4 GPUs) in Kaggle settings BEFORE installing.'\n",
    "\n",
    "print('Torch version:', torch.__version__)\n",
    "print('CUDA version:', torch.version.cuda)\n",
    "\n",
    "print('\\nInstalling PyTorch Geometric...')\n",
    "subprocess.run([sys.executable, '-m', 'pip', 'install', 'torch-geometric'], check=True)\n",
    "\n",
    "torch_v = torch.__version__.split('+')[0]\n",
    "cuda_v = 'cu' + torch.version.cuda.replace('.', '')\n",
    "wheel_url = f'https://data.pyg.org/whl/torch-{torch_v}+{cuda_v}.html'\n",
    "\n",
    "print(f'\\nInstalling PyG dependencies from {wheel_url}...')\n",
    "subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyg-lib', 'torch-scatter', 'torch-sparse', '-f', wheel_url], check=True)\n",
    "print('\\nInstallation complete! You can proceed to the next cell without restarting.')\n"
]

nb['cells'][1]['source'] = install_code

# Remove the Markdown cell asking to restart (it is nb['cells'][2])
if "RESTART SESSION NOW" in "".join(nb['cells'][2]['source']):
    del nb['cells'][2]

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)
