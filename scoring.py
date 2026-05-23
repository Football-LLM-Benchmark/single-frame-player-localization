"""
Scoring for Football Image LLM Benchmark.

Headline (and only) metric on a single frame:
  - GOSPA(c=30 m, p=1, α=2) — Generalized Optimal Sub-Pattern Assignment
    (Rahmathullah et al. 2017). Position-only. Output is in meters; lower
    is better. Decomposes into localization (matched-pair distances) and
    cardinality (FN + FP) components.

Inputs are lists of (x, y) pitch-meter coordinates. Extra attributes
(team, role, jersey, confidence) are ignored — position-only scoring.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np
from scipy.optimize import linear_sum_assignment


Point = tuple[float, float]


# Fixed metric parameters. Headline: GOSPA(c=30 m, p=1, alpha=2).
# These are module-level constants by design — callers should not override
# them. If you need to ablate, edit them here.
C = 30.0
P = 1.0
ALPHA = 2.0


@dataclass
class GospaResult:
    gospa: float
    localization: float
    missed: int
    false: int


def _to_array(points: Iterable[Point]) -> np.ndarray:
    pts = [(float(x), float(y)) for x, y in points]
    if not pts:
        return np.zeros((0, 2), dtype=float)
    return np.asarray(pts, dtype=float)


def _pairwise_dist(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if a.size == 0 or b.size == 0:
        return np.zeros((a.shape[0], b.shape[0]), dtype=float)
    diff = a[:, None, :] - b[None, :, :]
    return np.sqrt((diff * diff).sum(-1))


def gospa(
    predictions: Sequence[Point],
    ground_truth: Sequence[Point],
) -> GospaResult:
    """
    GOSPA (Rahmathullah et al., 2017) at fixed C, P, ALPHA.

    GOSPA(X, Y) = [ min_{assignment γ} (
        Σ_{matched (i,j)} d(x_i, y_j)^P
        + (C^P / ALPHA) * (n_unmatched_X + n_unmatched_Y)
    ) ]^(1/P)

    With C=30 m, P=1, ALPHA=2: linear in distance, output is in meters
    and reads as `Σ d_matched + (C/ALPHA) · n_unmatched`. The matching
    threshold collapses to d <= C: pairs farther than C are never
    matched (matching would cost more than leaving both unmatched).
    """
    X = _to_array(predictions)
    Y = _to_array(ground_truth)
    n_x, n_y = X.shape[0], Y.shape[0]
    cp_over_alpha = (C ** P) / ALPHA

    if n_x == 0 and n_y == 0:
        return GospaResult(0.0, 0.0, 0, 0)

    if n_x == 0 or n_y == 0:
        unmatched = n_x + n_y
        total = cp_over_alpha * unmatched
        return GospaResult(total ** (1.0 / P), 0.0, n_y, n_x)

    d = _pairwise_dist(X, Y)
    # Cost of matching (i, j): d^P, but only if d <= C. Otherwise, forbid
    # the match by setting a cost that exceeds paying both unmatched
    # penalties (2 * cp_over_alpha), so the optimizer strictly prefers
    # leaving both unmatched.
    forbid = 2 * cp_over_alpha + 1.0
    match_cost = np.where(d <= C, d ** P, forbid)

    # Augmented cost matrix: allow rows and columns to be "unmatched" by
    # going to virtual nodes. Shape (n_x + n_y) x (n_x + n_y).
    # Top-left (n_x x n_y): real match costs.
    # Top-right (n_x x n_x): diagonal = cp_over_alpha (X_i unmatched), off-diag = forbid.
    # Bottom-left (n_y x n_y): diagonal = cp_over_alpha (Y_j unmatched), off-diag = forbid.
    # Bottom-right (n_y x n_x): 0 (virtual-to-virtual, free).
    n = n_x + n_y
    M = np.full((n, n), forbid, dtype=float)
    M[:n_x, :n_y] = match_cost
    for i in range(n_x):
        M[i, n_y + i] = cp_over_alpha
    for j in range(n_y):
        M[n_x + j, j] = cp_over_alpha
    M[n_x:, n_y:] = 0.0

    row_ind, col_ind = linear_sum_assignment(M)

    loc_pp = 0.0
    matched = 0
    for r, cc in zip(row_ind, col_ind):
        if r < n_x and cc < n_y and d[r, cc] <= C:
            loc_pp += d[r, cc] ** P
            matched += 1
    missed = n_y - matched
    false = n_x - matched

    total = loc_pp + cp_over_alpha * (missed + false)
    return GospaResult(
        gospa=total ** (1.0 / P),
        localization=loc_pp ** (1.0 / P) if matched else 0.0,
        missed=missed,
        false=false,
    )


def score_frame(
    predictions: Sequence[Point],
    ground_truth: Sequence[Point],
) -> dict:
    """
    Returns a dict with GOSPA(c=30, p=1, α=2) under `gospa`, plus the
    per-frame normalized headline `gospa_normalized` = gospa / max(n_gt, 1).

    Aggregation rule for the leaderboard: mean of `gospa_normalized` over
    manifest frames. Normalizing by n_gt (not max(n_pred, n_gt)) preserves
    false-positive sensitivity. The max(.., 1) covers n_gt=0 frames so an
    empty-pitch frame with `[]` prediction scores 0 and each spurious
    prediction costs 15 m.
    """
    g = gospa(predictions, ground_truth)
    n_gt = len(ground_truth)
    return {
        "gospa": g.gospa,
        "gospa_normalized": g.gospa / max(n_gt, 1),
        "gospa_localization": g.localization,
        "gospa_missed": g.missed,
        "gospa_false": g.false,
    }


if __name__ == "__main__":
    # Synthetic sanity tests for GOSPA(c=30, p=1, alpha=2). Penalty per
    # unmatched point = c/alpha = 15. Matched pairs contribute their raw
    # Euclidean distance (since p=1).
    tests = [
        (
            "perfect match",
            [(0, 0), (10, 5), (-20, 3)],
            [(0, 0), (10, 5), (-20, 3)],
            {"gospa": 0.0, "gospa_missed": 0, "gospa_false": 0},
        ),
        (
            "empty prediction, 3 GT",
            [],
            [(0, 0), (10, 5), (-20, 3)],
            {"gospa": 45.0, "gospa_missed": 3, "gospa_false": 0},  # 15 * 3
        ),
        (
            "3 predictions, empty GT",
            [(0, 0), (10, 5), (-20, 3)],
            [],
            {"gospa": 45.0, "gospa_missed": 0, "gospa_false": 3},
        ),
        (
            "both empty",
            [], [],
            {"gospa": 0.0, "gospa_missed": 0, "gospa_false": 0},
        ),
        (
            "hungarian picks optimal assignment",
            # Greedy in-order would mismatch; Hungarian should pair (0,0)-(0,0)
            # and (1,0)-(1,0) for total distance 0.
            [(0, 0), (1, 0)],
            [(1, 0), (0, 0)],
            {"gospa": 0.0, "gospa_missed": 0, "gospa_false": 0},
        ),
        (
            "one matched + one outlier beyond c=30",
            # (0,0)-(0,0.5) matches at distance 0.5; (50,50) is > 30m from
            # any GT, so it stays unmatched (15m penalty). GT (0,0.5) is
            # matched, no missed.
            [(0, 0), (50, 50)],
            [(0, 0.5)],
            {"gospa": 0.5 + 15.0, "gospa_missed": 0, "gospa_false": 1},
        ),
        (
            "matched within c=30 (was outside old c=5)",
            # 10m apart: under old GOSPA(c=5) this would be "too far" and
            # both points would be unmatched (penalty 2 * 12.5 = 25 in the
            # p=2 sense). With c=30, p=1 they match cleanly at distance 10.
            [(0, 0)],
            [(10, 0)],
            {"gospa": 10.0, "gospa_missed": 0, "gospa_false": 0, "gospa_normalized": 10.0},
        ),
        (
            "normalized: divide by n_gt, not max(n_pred, n_gt)",
            # 3 GT, 1 perfect match + 2 missed -> gospa = 30. n_gt=3.
            # normalized = 30 / 3 = 10.
            [(0, 0)],
            [(0, 0), (10, 10), (-10, -10)],
            {"gospa": 30.0, "gospa_normalized": 10.0},
        ),
        (
            "normalized: empty GT, 2 spurious preds -> 15 per FP",
            # n_gt=0, n_pred=2 -> gospa = 30, denom = max(0,1) = 1 -> 30.
            [(0, 0), (50, 50)],
            [],
            {"gospa": 30.0, "gospa_normalized": 30.0, "gospa_false": 2},
        ),
        (
            "normalized: empty GT, empty preds -> 0",
            [], [],
            {"gospa": 0.0, "gospa_normalized": 0.0},
        ),
    ]

    passed = 0
    for name, preds, gt, expect in tests:
        result = score_frame(preds, gt)
        fail_reasons = []
        for k, v in expect.items():
            actual = result[k]
            if isinstance(v, float):
                ok = abs(actual - v) < 1e-6
            else:
                ok = actual == v
            if not ok:
                fail_reasons.append(f"  {k}: expected {v}, got {actual}")
        status = "PASS" if not fail_reasons else "FAIL"
        if status == "PASS":
            passed += 1
        print(f"[{status}] {name}")
        for r in fail_reasons:
            print(r)
    print(f"\n{passed}/{len(tests)} tests passed")
