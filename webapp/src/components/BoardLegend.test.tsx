import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardLegend } from './BoardLegend';

describe('BoardLegend', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('names every board mark in words, with drawn (not glyph) swatches', () => {
    const { container } = render(<BoardLegend />);
    const list = screen.getByRole('list', { name: 'Board legend' });
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Copper connected to the feed',
      'Not connected (dashed edge)',
      'Seed pixel, always metal',
      'Feed',
    ]);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
  });

  it('says how to paint, with mouse, touch and keyboard', () => {
    render(<BoardLegend />);
    expect(screen.getByText('Click or drag to paint; keyboard: arrows move, Space toggles.')).toBeDefined();
  });
});
