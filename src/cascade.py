"""Resonator-cascade head, Hungarian matcher, loss and metrics (Chunk 31 onward).

One implementation, imported unchanged by Chunks 31-34. The synthesizer is NOT re-implemented
here: it is synth.synth_db_torch_batched, the function validated against numpy in Chunk 30.
"""
import math

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.nn import functional as F
from scipy.optimize import linear_sum_assignment
from scipy.signal import find_peaks
from sklearn.metrics import roc_auc_score

from synth import synth_db_torch_batched, F_GHZ, EPS2_60

BIN_GHZ = 0.015
TRUE_MODE_S, TRUE_MODE_DEPTH = 0.5, -3.0            # a fitted mode is "true" if s >= 0.5 and depth < -3 dB
DEPTH_BINS = [(-np.inf, -30.0, 'deep'), (-30.0, -20.0, 'mid'), (-20.0, -15.0, 'shallow'), (-15.0, -10.0, 'marginal')]


# ───────────────────────────── spectral features ─────────────────────────────
class SpectralNorm:
    """20 log-eigenvalues + 2 log-areas, standardised on POOL rows with eig_valid == 1.
    Invalid rows become 0 after standardisation and keep the eig_valid flag (23 inputs)."""
    EIG_COLS = [f'eig_{i}' for i in range(20)]
    AREA_COLS = ['area_conn_mm2', 'area_metal_mm2']

    def __init__(self, mean=None, std=None):
        self.mean, self.std = mean, std

    @staticmethod
    def _z(eigs, areas):
        return torch.cat([torch.log(eigs.clamp_min(1e-12)), torch.log(areas.clamp_min(1e-12))], -1)

    def fit(self, eigs, areas, valid):
        z = self._z(eigs, areas)[valid.bool()]
        self.mean, self.std = z.mean(0), z.std(0).clamp_min(1e-6)
        return self

    def __call__(self, eigs, areas, valid):
        z = (self._z(eigs, areas) - self.mean.to(eigs)) / self.std.to(eigs)
        z = torch.where(valid[:, None].bool(), z, torch.zeros_like(z))
        return torch.cat([z, valid[:, None].to(z)], -1)

    def from_frame(self, df):
        """23-d features for the rows of a ch30_eigs-style DataFrame."""
        t = lambda c: torch.tensor(df[c].values, dtype=torch.float32)
        return self(t(self.EIG_COLS), t(self.AREA_COLS), torch.tensor(df['eig_valid'].values))

    def state_dict(self):
        return {'mean': self.mean.cpu().tolist(), 'std': self.std.cpu().tolist(),
                'eig_cols': self.EIG_COLS, 'area_cols': self.AREA_COLS}

    @classmethod
    def from_state(cls, st):
        return cls(torch.tensor(st['mean']), torch.tensor(st['std']))


# ───────────────────────────────── the head ──────────────────────────────────
def _inv_sigmoid(p):
    return math.log(p / (1.0 - p))


class CascadeHead(nn.Module):
    """K resonator queries cross-attending to pixel-node embeddings, with a learned per-head
    feed-distance bias, then the fixed physics synthesizer. See promptbook §2."""

    def __init__(self, K=3, d=128, n_heads=8, n_layers=2, readout_dim=256, spectral_dim=23,
                 use_spectral=True, use_h=False, self_attn=True, order=2, node_dim=128):
        super().__init__()
        self.K, self.d, self.order, self.n_heads = K, d, order, n_heads
        self.use_spectral, self.use_h, self.self_attn = use_spectral, use_h, self_attn
        self.g = nn.Sequential(nn.Linear(readout_dim + (spectral_dim if use_spectral else 0), d), nn.GELU(),
                               nn.Linear(d, d), nn.LayerNorm(d))
        # pixel size enters through a ZERO-initialised projection, so enabling it is an exact warm-start
        self.h_proj = nn.Linear(1, d)
        nn.init.zeros_(self.h_proj.weight); nn.init.zeros_(self.h_proj.bias)
        self.node_in = nn.Sequential(nn.LayerNorm(node_dim), nn.Linear(node_dim, d))
        self.queries = nn.Parameter(torch.randn(K, d) * 0.02)
        self.wg = nn.Linear(d, d)
        self.sa = nn.ModuleList([nn.MultiheadAttention(d, n_heads, batch_first=True) for _ in range(n_layers)])
        self.ca = nn.ModuleList([nn.MultiheadAttention(d, n_heads, batch_first=True) for _ in range(n_layers)])
        self.n_sa = nn.ModuleList([nn.LayerNorm(d) for _ in range(n_layers)])
        self.n_ca = nn.ModuleList([nn.LayerNorm(d) for _ in range(n_layers)])
        self.ff = nn.ModuleList([nn.Sequential(nn.LayerNorm(d), nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
                                 for _ in range(n_layers)])
        # softplus(alpha) = 0.05 per mm at init
        self.alpha = nn.Parameter(torch.full((n_heads,), math.log(math.expm1(0.05))))
        self.out_norm = nn.LayerNorm(d)
        # per-query output heads, so each query can carry its own f0 anchor
        mk = lambda: nn.ModuleList([nn.Linear(d, 1) for _ in range(K)])
        self.f0_head, self.q_head, self.r_head, self.s_head = mk(), mk(), mk(), mk()
        anchors = {3: [1.5, 2.5, 3.5], 4: [1.3, 2.1, 2.9, 3.7]}.get(K, list(np.linspace(1.3, 3.7, K)))
        for k, a in enumerate(anchors):
            nn.init.zeros_(self.f0_head[k].weight)        # start exactly at the anchor
            self.f0_head[k].bias.data.fill_(_inv_sigmoid((a - 0.8) / 3.4))
            self.s_head[k].bias.data.fill_(0.0)           # s = 0.5
        self.base = nn.Linear(d, order + 1)
        nn.init.zeros_(self.base.weight); self.base.bias.data.zero_(); self.base.bias.data[0] = _inv_sigmoid(0.95)

    def forward(self, readout, node_emb, node_mask, d_feed_mm, spectral=None, h_mm=None):
        """readout [B,256]; node_emb [B,N,node_dim] (PIXEL nodes only, padded);
        node_mask [B,N] True for real pixel nodes; d_feed_mm [B,N] (>= 0 for real nodes);
        spectral [B,23] if use_spectral; h_mm [B,1] if use_h."""
        parts = [readout]
        if self.use_spectral:
            assert spectral is not None, 'use_spectral=True needs spectral features'
            parts.append(spectral)
        g = self.g(torch.cat(parts, -1))
        if self.use_h:
            assert h_mm is not None, 'use_h=True needs h_mm'
            g = g + self.h_proj(h_mm)
        B, N = node_mask.shape
        valid = node_mask.bool() & (d_feed_mm >= 0)        # the virtual node (d = -1) can never be attended
        kv = self.node_in(node_emb)
        # ONE float mask: feed-distance bias, -inf at padding / virtual node (no bool+float mixing)
        bias = -F.softplus(self.alpha)[None, :, None] * d_feed_mm.clamp_min(0)[:, None, :]      # [B,H,N]
        bias = bias.masked_fill(~valid[:, None, :], float('-inf'))
        attn_mask = bias[:, :, None, :].expand(B, self.n_heads, self.K, N).reshape(B * self.n_heads, self.K, N)
        q = self.queries[None] + self.wg(g)[:, None]
        for i in range(len(self.ca)):
            if self.self_attn:
                z = self.n_sa[i](q)
                q = q + self.sa[i](z, z, z, need_weights=False)[0]
            z = self.n_ca[i](q)
            q = q + self.ca[i](z, kv, kv, attn_mask=attn_mask.to(z.dtype), need_weights=False)[0]
            q = q + self.ff[i](q)
        q = self.out_norm(q)
        col = lambda heads: torch.cat([h(q[:, k]) for k, h in enumerate(heads)], -1)
        f0 = 0.8 + 3.4 * torch.sigmoid(col(self.f0_head))
        Q = 3.0 * (500.0 / 3.0) ** torch.sigmoid(col(self.q_head))
        rmin = 1e-3 + 0.998 * torch.sigmoid(col(self.r_head))
        s = torch.sigmoid(col(self.s_head))
        coeffs = self.base(g)
        db = synth_db_torch_batched(coeffs, f0, Q, rmin, s, eps2=EPS2_60)
        t = (f0.clamp(1.0, 4.0) - 2.5) / 1.5
        poly = sum(coeffs[:, i:i + 1] * t ** i for i in range(coeffs.shape[1]))
        depth_db = 20.0 * torch.log10((rmin * torch.sigmoid(poly)).clamp_min(1e-6))   # = ch30 target definition
        return dict(f0=f0, Q=Q, rmin=rmin, s=s, coeffs=coeffs, db=db, depth_db=depth_db)


# ───────────────────────────── targets and matching ──────────────────────────
def true_modes(rows):
    """Filter one curve's fitted modes (dict of arrays or DataFrame) to the TRUE modes."""
    s, dep = np.asarray(rows['s'], float), np.asarray(rows['depth_db'], float)
    keep = (s >= TRUE_MODE_S) & (dep < TRUE_MODE_DEPTH)
    return {k: np.asarray(rows[k], float)[keep] for k in ('f0', 'Q', 'depth_db')}


def hungarian_match(out, targets, w_f=3.0, w_d=1.0, w_q=0.5):
    """targets: list (len B) of TRUE-mode dicts (f0, Q, depth_db arrays). Returns, per sample,
    a list of (pred_slot, target_index). Cost: w_f|df0|/bin + w_d|ddepth| + w_q|dlogQ| - log s."""
    f0, dep, lq, s = (out[k].detach().double().cpu().numpy() for k in ('f0', 'depth_db', 'Q', 's'))
    lq = np.log(lq)
    matches = []
    for b, t in enumerate(targets):
        if len(t['f0']) == 0:
            matches.append([]); continue
        C = (w_f * np.abs(f0[b][:, None] - t['f0'][None]) / BIN_GHZ
             + w_d * np.abs(dep[b][:, None] - t['depth_db'][None])
             + w_q * np.abs(lq[b][:, None] - np.log(t['Q'])[None])
             - np.log(s[b][:, None] + 1e-6))
        r, c = linear_sum_assignment(C)
        matches.append([(int(i), int(j)) for i, j in zip(r, c)])
    return matches


def match_by_f0_order(out, targets):
    """Ablation A2: no Hungarian. Slots and true modes are both sorted by f0 and paired in order."""
    f0 = out['f0'].detach().cpu().numpy()
    res = []
    for b, t in enumerate(targets):
        order_p, order_t = np.argsort(f0[b]), np.argsort(t['f0'])
        res.append([(int(order_p[k]), int(order_t[k])) for k in range(min(len(order_p), len(order_t)))])
    return res


# ─────────────────────────────────── loss ────────────────────────────────────
def floor_truth_torch(y, eps2=EPS2_60):
    return 10.0 * torch.log10(torch.pow(10.0, y / 10.0) + eps2)


def schedule(cfg):
    u = min(cfg.get('epoch', 0) / max(cfg.get('ramp', 10), 1), 1.0)
    return 0.1 + 0.9 * u, 1.0 - u * (1.0 - cfg.get('lam_m_end', 0.3))      # lam_c, lam_m


def cascade_loss(out, truth_db, targets, excluded, matches, cfg):
    """truth_db [B,201] RAW dB; targets: list of TRUE-mode dicts; excluded [B] bool
    (fit_mse > 0.17: curve loss only). Returns dict of scalar tensors."""
    dev = out['db'].device
    eps2_loss = cfg.get('eps2_loss')
    if eps2_loss is None:
        curve = (out['db'] - floor_truth_torch(truth_db)).pow(2).mean()
    else:
        # Gradient-safe curve loss: re-floor BOTH prediction and truth at a higher floor (e.g. 1e-4
        # = -40 dB) for the LOSS ONLY. d(dB)/d(rho) peaks at 1/eps, so the -60 dB floor makes the
        # curve-loss gradient ~10x spikier near nulls than a -40 dB floor. The model output, the
        # reported metric and the targets are unchanged.
        rho2 = (torch.pow(10.0, out['db'] / 10.0) - EPS2_60).clamp_min(0.0)
        pred_l = 10.0 * torch.log10(rho2 + eps2_loss)
        curve = (pred_l - floor_truth_torch(truth_db, eps2_loss)).pow(2).mean()
    bi, pi, tf0, tdep, tq, deepest = [], [], [], [], [], []
    for b, pairs in enumerate(matches):
        if excluded[b] or not pairs:
            continue
        t = targets[b]
        jstar = int(np.argmin(t['depth_db']))
        for i, j in pairs:
            bi.append(b); pi.append(i); tf0.append(t['f0'][j]); tdep.append(t['depth_db'][j]); tq.append(t['Q'][j])
            deepest.append(j == jstar and t['depth_db'][j] < -10.0)
    zero = out['db'].new_zeros(())
    if bi:
        bi_t, pi_t = torch.tensor(bi, device=dev), torch.tensor(pi, device=dev)
        T = lambda v: torch.tensor(v, dtype=out['f0'].dtype, device=dev)
        df = (out['f0'][bi_t, pi_t] - T(tf0)) / BIN_GHZ
        dd = out['depth_db'][bi_t, pi_t] - T(tdep)
        dq = torch.log(out['Q'][bi_t, pi_t]) - torch.log(T(tq))
        mode = (F.huber_loss(df, torch.zeros_like(df), delta=1.0, reduction='none') + 0.1 * dd.abs() + 0.5 * dq.abs()).mean()
        dmask = torch.tensor(deepest, device=dev)
        kappa = (cfg.get('kappa', 2.0) * F.relu(dd[dmask]) + F.relu(-dd[dmask])).mean() if dmask.any() else zero
    else:
        mode, kappa = zero, zero
    # presence: every slot of every included sample; matched -> 1 (weight 1), unmatched -> 0 (weight 0.1)
    inc = ~torch.as_tensor(np.asarray(excluded, bool), device=dev)
    tgt = torch.zeros_like(out['s']); w = torch.full_like(out['s'], 0.1)
    for b, pairs in enumerate(matches):
        for i, _ in pairs:
            tgt[b, i] = 1.0; w[b, i] = 1.0
    w = w * inc[:, None].to(w)
    presence = (F.binary_cross_entropy(out['s'].clamp(1e-6, 1 - 1e-6), tgt, reduction='none') * w).sum() / w.sum().clamp_min(1e-6)
    lam_c, lam_m = schedule(cfg)
    total = lam_c * curve + lam_m * mode + cfg.get('lam_p', 1.0) * presence + cfg.get('lam_k', 0.1) * kappa
    return dict(total=total, curve=curve, mode=mode, presence=presence, kappa=kappa)


# ─────────────────────────────────── metrics ─────────────────────────────────
def per_sample_metrics(pred_db, true_db, f0=None, s=None, grid=None):
    """pred_db, true_db: [B,201] numpy (RAW truth). Dip-based diagnostics as in Chunk 29 Cell B:
    the predicted dip nearest the true argmin within +-300 MHz counts as 'the same resonance'."""
    rows = []
    for k in range(len(pred_db)):
        p, y = pred_db[k], true_db[k]
        tmin, pmin = float(y.min()), float(p.min())
        func = tmin < -10.0
        rec = dict(mse=float(np.mean((p - y) ** 2)), mae=float(np.mean(np.abs(p - y))), true_min=tmin, pred_min=pmin,
                   functioning=func, depth_bin=next((l for lo, hi, l in DEPTH_BINS if lo < tmin <= hi), 'nonfunc'))
        if grid is not None:
            rec['grid'] = int(grid[k])
        if func:
            ft = F_GHZ[int(np.argmin(y))]
            pk, _ = find_peaks(-p, prominence=0.3)
            pk = [i for i in pk if abs(F_GHZ[i] - ft) <= 0.30]
            if pk:
                ip = min(pk, key=lambda i: abs(F_GHZ[i] - ft))
                rec.update(missed=False, dip_err_bins=abs(F_GHZ[ip] - ft) / BIN_GHZ, dip_depth_err=float(p[ip] - tmin))
            else:
                rec.update(missed=True)
        if s is not None:
            act = f0[k][s[k] >= 0.5]
            rec['n_active'] = int(len(act))
            rec['duplicate'] = bool(len(act) > 1 and np.min(np.abs(act[:, None] - act[None])[~np.eye(len(act), dtype=bool)]) <= BIN_GHZ)
        rows.append(rec)
    return pd.DataFrame(rows)


def summarize(df):
    """Per-grid and pooled summary of per_sample_metrics output."""
    out = {}
    groups = list(df.groupby('grid')) if 'grid' in df else []
    for key, g in groups + [('POOL', df)]:
        y = g['true_min'].values < -10
        f = g[g['functioning']]
        r = dict(n=len(g), mse=g['mse'].mean(), mae=g['mae'].mean(),
                 auroc=roc_auc_score(y, -g['pred_min']) if 0 < y.sum() < len(y) else np.nan,
                 acc=float(((g['pred_min'].values < -10) == y).mean()))
        if len(f) > 2:
            sl, ic = np.polyfit(f['true_min'], f['pred_min'], 1)
            r['depth_slope'] = sl
            r['depth_r2'] = 1 - np.sum((f['pred_min'] - (sl * f['true_min'] + ic)) ** 2) / np.sum((f['pred_min'] - f['pred_min'].mean()) ** 2)
            r['missed_rate'] = float(f['missed'].mean())
            m = f[~f['missed'].astype(bool)]
            r['within_1bin'] = float((m['dip_err_bins'] <= 1.0).mean()) if len(m) else np.nan
            r['dip_err_bins_median'] = float(m['dip_err_bins'].median()) if len(m) else np.nan
            mb = g[g['depth_bin'] == 'marginal']
            r['marginal_depth_mae'] = float(np.abs(mb['pred_min'] - mb['true_min']).mean()) if len(mb) else np.nan
        if 'n_active' in g:
            r['dup_rate'] = float(g['duplicate'].mean())
            for n in range(5):
                r[f'active_{n}'] = float((g['n_active'] == n).mean())
        out[key] = r
    return out
