import json

file_path = 'g:/antenna_gnn/notebooks/chunk_prereq_multigrid_cache.ipynb'
with open(file_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Cell 7 contains the code
source = nb['cells'][7]['source']
new_source = []

for line in source:
    if line == "    subprocess.run(cmd, shell=True, check=True)\n":
        new_source.extend([
            "    import time\n",
            "    proc = subprocess.Popen(cmd, shell=True)\n",
            "    with tqdm(total=count, desc='Copying files') as pbar:\n",
            "        while proc.poll() is None:\n",
            "            current = len(os.listdir(local_dir))\n",
            "            pbar.update(current - pbar.n)\n",
            "            time.sleep(0.5)\n",
            "        # Final update\n",
            "        current = len(os.listdir(local_dir))\n",
            "        pbar.update(current - pbar.n)\n",
            "        \n",
            "    if proc.returncode != 0:\n",
            "        raise RuntimeError(f\"xargs cp failed with code {proc.returncode}\")\n"
        ])
    else:
        new_source.append(line)

nb['cells'][7]['source'] = new_source

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)
