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
    """Torch equivalent of :func:`synth_db_numpy`, preserving input dtype/device."""
    import torch

    f = torch.linspace(1.0, 4.0, 201, dtype=theta.dtype, device=theta.device)
    t = (f - 2.5) / 1.5
    c, p = theta[:order + 1], theta[order + 1:].reshape(K, 4)
    poly = sum(c[i] * t ** i for i in range(order + 1))
    base = torch.sigmoid(poly)
    rho = base
    for f0, lq, r, s in p:
        q = torch.exp(lq)
        x = 2.0 * q * (f - f0) / f0
        b = (1.0 - r) / (1.0 + r)
        a, bb = (b - 1.0) ** 2, (b + 1.0) ** 2
        rho = rho * (1.0 - s * (1.0 - torch.sqrt((a + x * x) / (bb + x * x))))
    return 10.0 * torch.log10(rho ** 2 + eps2)


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
    yhat = synth_db_numpy(best.x, K, order, eps2)
    return dict(ok=True, converged=bool(best.status > 0), theta=best.x, yhat=yhat,
                fit_mse=float(np.mean((yhat - yfl) ** 2)), time_s=time.perf_counter() - start)
