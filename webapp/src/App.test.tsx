import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import committedMeta from '../public/model/meta.json';
import { App } from './App';

describe('App top-bar model status', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports the model state, not the metadata (jsdom has no Web Workers, so the model cannot run)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(committedMeta), { status: 200 }))),
    );
    render(<App />);
    expect(await screen.findByText('Model failed to load')).toBeDefined();
    expect(screen.queryByText(/model meta/)).toBeNull();
  });

  it('shows the error when meta.json cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('missing', { status: 404 }))),
    );
    render(<App />);
    expect(
      await screen.findByText(/Could not load the model description \(meta\.json: HTTP 404 for /),
    ).toBeDefined();
  });
});
