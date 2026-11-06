import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import { REPOSITORY_URL, ValidityNote } from './ValidityNote';

const meta = parseMeta(structuredClone(committedMeta));

describe('ValidityNote', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('states what the model learned and that it is a surrogate', () => {
    render(<ValidityNote N={25} scope={meta.scope} />);
    const text = screen.getByRole('region', { name: 'About this prediction' }).textContent;
    expect(text).toContain('not a full-wave simulation');
    expect(text).toContain('randomly generated');
    expect(text).toContain('1–4 GHz');
    expect(text).toContain('12×12, 15×15, 35×35 and 45×45');
    expect(text).toContain('single-band and non-functioning');
    expect(text).toContain('Hand-drawn shapes');
  });

  it.each([
    [12, '0.49 dB', '500'],
    [15, '0.45 dB', '500'],
    [25, '0.39 dB', '9,983'],
    [35, '0.31 dB', '500'],
    [45, '0.31 dB', '500'],
  ])('shows the %i×%i test MAE from meta.json (%s over %s antennas)', (N, mae, n) => {
    render(<ValidityNote N={N} scope={meta.scope} />);
    const line = screen.getByText(/mean absolute error/);
    expect(line.textContent).toContain(`${String(N)}×${String(N)}`);
    expect(line.textContent).toContain(mae);
    expect(line.textContent).toContain(`${n} test antennas`);
  });

  it('notes that the balanced test sets hold only single-band and non-functioning antennas', () => {
    render(<ValidityNote N={35} scope={meta.scope} />);
    expect(screen.getByText(/mean absolute error/).textContent).toContain('single-band and non-functioning');
    cleanup();
    render(<ValidityNote N={25} scope={meta.scope} />);
    expect(screen.getByText(/mean absolute error/).textContent).not.toContain('single-band');
  });

  it('links to the repository only (no paper citation)', () => {
    render(<ValidityNote N={25} scope={meta.scope} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(REPOSITORY_URL);
    expect(REPOSITORY_URL).toBe('https://github.com/asparagusD/antenna_gnn');
    expect(document.body.textContent).not.toMatch(/paper|IEEE|doi/i);
  });
});
