import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import committedMeta from '../public/model/meta.json';
import { App } from './App';

describe('App top-bar model status', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports a browser that cannot run the model (jsdom has no Web Workers)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(committedMeta), { status: 200 }))),
    );
    render(<App />);
    expect(await screen.findByText('This browser cannot run the model')).toBeDefined();
    expect(screen.queryByText(/model meta/)).toBeNull();
    // The chart explains what is missing and offers no Retry (retrying cannot help).
    expect(
      await screen.findByText(
        'This browser cannot run the model: it needs WebAssembly and Web Workers. Use a current version of Chrome, Edge, Firefox or Safari.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
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
