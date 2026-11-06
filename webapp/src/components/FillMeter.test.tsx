import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FillMeter, FILL_WARNING } from './FillMeter';
import { fillPercentText } from './fillText';

describe('fillPercentText', () => {
  it.each([
    [0, '0.0%'],
    [181 / 625, '29.0%'],
    [188 / 625, '30.1%'],
    [0.3, '30.0%'],
    [0.55, '55.0%'],
    [0.8, '80.0%'],
    [501 / 625, '80.2%'],
    [506 / 625, '81.0%'],
    [1, '100.0%'],
  ])('fill %s reads %s', (value, text) => {
    expect(fillPercentText(value)).toBe(text);
  });

  it('never rounds a warned fill onto the 30% or 80% bound', () => {
    // 45×45: 607 / 2025 = 29.975% (below 30%, warns) would round to "30.0%".
    expect(fillPercentText(607 / 2025)).toBe('29.9%');
    // 1621 / 2025 = 80.049% (above 80%, warns) would round to "80.0%".
    expect(fillPercentText(1621 / 2025)).toBe('80.1%');
  });
});

describe('FillMeter', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  const warning = () => screen.queryByText(FILL_WARNING);

  it.each([
    [181 / 625, true],
    [187 / 625, true],
    [188 / 625, false],
    [0.3, false],
    [0.8, false],
    [501 / 625, true],
    [506 / 625, true],
  ])('fill %s shows the warning: %s', (value, warns) => {
    render(<FillMeter value={value} />);
    expect(warning() !== null).toBe(warns);
  });

  it('exposes the value as a meter with words, not colour alone', () => {
    render(<FillMeter value={181 / 625} />);
    const meter = screen.getByRole('meter', { name: 'Metal fill' });
    expect(meter.getAttribute('aria-valuenow')).toBe('29');
    expect(meter.getAttribute('aria-valuetext')).toBe('29.0% metal, below the 30–80% training range');
    expect(screen.getByText('29.0%')).toBeDefined();
  });

  it('keeps one polite live region mounted so a new warning is announced', () => {
    const { rerender, container } = render(<FillMeter value={0.5} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');
    rerender(<FillMeter value={0.85} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toContain(FILL_WARNING);
  });
});
