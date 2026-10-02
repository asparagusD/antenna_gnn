"""Shared resonator synthesizer for Chunk 29 reproduction and Chunk 30 targets."""

import time

import numpy as np
from scipy.optimize import least_squares
from scipy.signal import find_peaks

F_GHZ = np.linspace(1.0, 4.0, 201)
T_NORM = (F_GHZ - 2.5) / 1.5
LOGQ_LO, LOGQ_HI = np.log(3.0), np.log(500.0)
F0_LO, F0_HI = 0.8, 4.2
EPS2_60 = 1e-6


def synth_lin_numpy(theta, K, order):
    theta = np.asarray(theta, dtype=float)
    c, p = theta[:order + 1], theta[order + 1:].reshape(K, 4)
    poly = sum(c[i] * T_NORM ** i for i in range(order + 1))
    base = 1.0 / (1.0 + np.exp(-poly))
    rho = base.copy()
    for f0, lq, r, s in p:
        q = np.exp(lq)
        x = 2.0 * q * (F_GHZ - f0) / f0
        b = (1.0 - r) / (1.0 + r)
        a, bb = (b - 1.0) ** 2, (b + 1.0) ** 2
        rho *= 1.0 - s * (1.0 - np.sqrt((a + x * x) / (bb + x * x)))
    return rho, base


def to_db_numpy(rho, eps2=EPS2_60):
    return 10.0 * np.log10(np.asarray(rho) ** 2 + eps2)


def floor_truth_numpy(y, eps2=EPS2_60):
    return 10.0 * np.log10(10.0 ** (np.asarray(y) / 10.0) + eps2)


def synth_db_numpy(theta, K, order, eps2=EPS2_60):
    return to_db_numpy(synth_lin_numpy(theta, K, order)[0], eps2)


def synth_db_torch(theta, K, order, eps2=EPS2_60):
    """Torch equivalent of :func:`synth_db_numpy` for ONE flat parameter vector."""
    c, p = theta[:order + 1], theta[order + 1:].reshape(K, 4)
    return synth_db_torch_batched(c.unsqueeze(0), p[:, 0].unsqueeze(0), p[:, 1].exp().unsqueeze(0),
                                  p[:, 2].unsqueeze(0), p[:, 3].unsqueeze(0), eps2)[0]


def synth_db_torch_batched(coeffs, f0, Q, rmin, s, eps2=EPS2_60, return_linear=False):
    """Batched, differentiable synthesizer used by the cascade head (Chunk 31+).

    coeffs: (B, order+1) baseline polynomial coefficients in T_NORM = (f - 2.5)/1.5
    f0, Q, rmin, s: (B, K) resonator parameters in PHYSICAL units (GHz, -, linear |Gamma|, [0,1])
    Returns S11 in dB, (B, 201); with return_linear=True also (rho, base).
    Identical formula to synth_lin_numpy / to_db_numpy (Chunk 29 Cell A reference).
    """
    import torch

    f = torch.linspace(1.0, 4.0, 201, dtype=coeffs.dtype, device=coeffs.device)
    t = (f - 2.5) / 1.5
    powers = torch.stack([t ** i for i in range(coeffs.shape[1])], dim=0)      # (order+1, 201)
    base = torch.sigmoid(coeffs @ powers)                                       # (B, 201)
    x = 2.0 * Q.unsqueeze(-1) * (f - f0.unsqueeze(-1)) / f0.unsqueeze(-1)       # (B, K, 201)
    b = ((1.0 - rmin) / (1.0 + rmin)).unsqueeze(-1)
    a, bb = (b - 1.0) ** 2, (b + 1.0) ** 2
    factor = 1.0 - s.unsqueeze(-1) * (1.0 - torch.sqrt((a + x * x) / (bb + x * x)))
    rho = base * factor.prod(dim=1)
    db = 10.0 * torch.log10(rho ** 2 + eps2)
    return (db, rho, base) if return_linear else db


def check_numpy_torch_agreement(n=200, K=3, order=2, seed=0, tol_db=1e-6):
    """Random-parameter agreement test in float64; returns the max |numpy - torch| in dB."""
    import torch

    rng = np.random.default_rng(seed)
    worst = 0.0
    for _ in range(n):
        c = rng.normal(0, 1, order + 1); c[0] += 3.0
        p = np.column_stack([rng.uniform(F0_LO, F0_HI, K), rng.uniform(LOGQ_LO, LOGQ_HI, K),
                             rng.uniform(1e-3, 0.999, K), rng.uniform(0, 1, K)])
        theta = np.concatenate([c, p.ravel()])
        ref = synth_db_numpy(theta, K, order)
        got = synth_db_torch(torch.tensor(theta, dtype=torch.float64), K, order).numpy()
        worst = max(worst, float(np.abs(ref - got).max()))
    if worst > tol_db:
        raise AssertionError(f"numpy/torch synthesizers disagree by {worst:.3g} dB (> {tol_db})")
    return worst


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def _q_from_width(yfl, idx):
    level, left, right = yfl[idx] / 2.0, idx, idx
    while left > 0 and yfl[left] < level:
        left -= 1
    while right < len(yfl) - 1 and yfl[right] < level:
        right += 1
    return float(np.clip(F_GHZ[idx] / max(F_GHZ[right] - F_GHZ[left], 0.015), 3.5, 450.0))


def _inits(yfl, K):
    lin = 10.0 ** (yfl / 20.0)
    base0 = float(np.clip(np.percentile(lin, 90), 0.05, 0.995))
    base_db = 20.0 * np.log10(base0)
    peaks, _ = find_peaks(-yfl, prominence=0.3)
    cands = [(float(yfl[i]), int(i), float(F_GHZ[i])) for i in peaks]
    if yfl[0] < yfl[1] and yfl[0] < base_db - 1.0:
        cands.append((float(yfl[0]), 0, 0.9))
    if yfl[-1] < yfl[-2] and yfl[-1] < base_db - 1.0:
        cands.append((float(yfl[-1]), 200, 4.1))
    cands.sort()
    def resonance(v, idx, f0):
        rmin = float(np.clip(10 ** (v / 20.0) / base0, 2e-3, 0.99))
        if f0 < 1.0 or f0 > 4.0:
            rmin = 0.1
        return [float(np.clip(f0, F0_LO + 1e-3, F0_HI - 1e-3)), np.log(_q_from_width(yfl, idx)), rmin, 0.95]
    values = [resonance(*item) for item in cands[:K]]
    spare = [1.6, 2.5, 3.4, 2.0]
    while len(values) < K:
        values.append([spare[len(values) % 4], np.log(20.0), 0.5, 0.02])
    starts = [values]
    gmin = int(np.argmin(yfl))
    if gmin < 3 or gmin > 197:
        alt = [list(v) for v in values]
        for value in alt:
            if value[0] < 1.0 or value[0] > 4.0 or abs(value[0] - F_GHZ[gmin]) < .05:
                value[0] = float(F_GHZ[gmin]); value[2] = float(np.clip(10 ** (yfl[gmin] / 20.0) / base0, 2e-3, .99)); break
        starts.append(alt)
    return base0, starts


def fit_curve_scipy(y_raw, K=3, order=2, eps2=EPS2_60):
    """Chunk 29's bounded multistart trust-region fitter."""
    start = time.perf_counter(); yfl = floor_truth_numpy(y_raw, eps2); base0, starts = _inits(yfl, K)
    lo = [-30.0] * (order + 1) + [F0_LO, LOGQ_LO, 1e-3, 0.0] * K
    hi = [30.0] * (order + 1) + [F0_HI, LOGQ_HI, .999, 1.0] * K
    best = None
    for modes in starts:
        x0 = np.array([_logit(base0)] + [0.0] * order + [v for mode in modes for v in mode])
        x0 = np.clip(x0, np.asarray(lo) + 1e-6, np.asarray(hi) - 1e-6)
        try:
            trial = least_squares(lambda x: synth_db_numpy(x, K, order, eps2) - yfl, x0, bounds=(lo, hi), method='trf', x_scale='jac', max_nfev=1000)
        except Exception:
            continue
        if best is None or trial.cost < best.cost:
            best = trial
    if best is None:
        return dict(ok=False, converged=False, time_s=time.perf_counter() - start)
    # NOTE: identical optimisation path to Chunk 29 Cell A, so its fits reproduce exactly.
    yhat = synth_db_numpy(best.x, K, order, eps2)
    rho, base = synth_lin_numpy(best.x, K, order)
    return dict(ok=True, converged=bool(best.status > 0), theta=best.x, yhat=yhat, base=base,
                fit_mse=float(np.mean((yhat - yfl) ** 2)),
                fit_mse_raw=float(np.mean((yhat - np.asarray(y_raw)) ** 2)),
                time_s=time.perf_counter() - start)


def mode_rows_from_fit(fit, K=3, order=2):
    """Per-resonator target rows from a fit_curve_scipy result.

    depth_db is the resonator's own dip including the baseline at f0:
    20*log10(rmin * base(f0)), with base = sigmoid(poly) taken from synth_lin_numpy
    (NOT 1/(1+exp(+poly)), which is 1 - sigmoid)."""
    p = np.asarray(fit["theta"])[order + 1:].reshape(K, 4)
    rows = []
    for k, (f0, lq, rmin, s) in enumerate(p):
        b_at = float(np.interp(np.clip(f0, 1.0, 4.0), F_GHZ, fit["base"]))
        rows.append(dict(k=k, f0=float(f0), Q=float(np.exp(lq)), rmin=float(rmin), s=float(s),
                         depth_db=float(20.0 * np.log10(max(rmin * b_at, 1e-6)))))
    return rows
