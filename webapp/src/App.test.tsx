import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import committedMeta from '../public/model/meta.json';
import { App } from './App';

describe('App placeholder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the number of grids once meta.json has loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(committedMeta), { status: 200 }))),
    );
    render(<App />);
    expect(await screen.findByText('model meta loaded: 5 grids')).toBeDefined();
  });

  it('shows the error when meta.json cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('missing', { status: 404 }))),
    );
    render(<App />);
    expect(await screen.findByText(/model meta failed to load: meta\.json: HTTP 404/)).toBeDefined();
  });
});
