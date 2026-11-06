"""Band and functioning rules (Chunk 51) on synthetic curves."""
import numpy as np
import pytest

from antenna_export.bands import band_indices, count_bands, is_functioning

IDX = np.arange(201)


def curve(*dips, base=-2.0, width=3.0):
    """Baseline with Gaussian dips given as (index, depth_db)."""
    y = np.full(201, base)
    for i, depth in dips:
        y = y + (depth - base) * np.exp(-0.5 * ((IDX - i) / width) ** 2)
    return y


def test_flat_curve_has_no_band_and_does_not_function():
    y = np.full(201, -5.0)
    assert count_bands(y) == 0 and not is_functioning(y)


def test_single_deep_dip_is_one_band():
    assert band_indices(curve((100, -20.0))) == [100]


def test_two_separated_dips_are_two_bands():
    assert band_indices(curve((60, -18.0), (140, -25.0))) == [60, 140]


def test_dips_closer_than_150_mhz_count_once():
    assert count_bands(curve((100, -20.0), (105, -22.0), width=1.0)) == 1


def test_shallow_dip_above_minus_10_db_is_not_a_band():
    y = curve((100, -9.0))
    assert count_bands(y) == 0 and not is_functioning(y)


def test_dip_with_too_little_prominence_is_not_a_band():
    assert count_bands(curve((100, -12.0), base=-10.5)) == 0


def test_minimum_at_band_edge_functions_without_a_band():
    y = np.linspace(-15.0, -2.0, 201)  # deepest at 1 GHz (index 0)
    assert is_functioning(y) and count_bands(y) == 0


def test_functioning_is_strict():
    y = np.full(201, -10.0)
    assert not is_functioning(y)


def test_wrong_length_is_rejected():
    with pytest.raises(ValueError):
        band_indices(np.zeros(200))
