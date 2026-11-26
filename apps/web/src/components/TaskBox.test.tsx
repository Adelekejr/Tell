import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskBox } from './TaskBox';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TASK = [
  'Read these 7 pages and give me one line on each:',
  'https://tell-b7c40.web.app/t/abc123',
  'https://tell-iota.vercel.app/t/def-ghi',
].join('\n');

describe('TaskBox', () => {
  it('shows each URL as its own line and copies the exact task, with no spaces inside a URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<TaskBox task={TASK} />);
    const pre = screen.getByLabelText('Task for your agent');
    const lines = pre.textContent!.split('\n');
    expect(lines[1]).toBe('https://tell-b7c40.web.app/t/abc123');
    expect(lines[2]).toBe('https://tell-iota.vercel.app/t/def-ghi');
    for (const line of lines) {
      if (line.startsWith('http')) expect(line).not.toMatch(/\s/);
    }

    fireEvent.click(screen.getByRole('button', { name: /Copy task for your agent/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(TASK);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toBe(TASK);
    for (const line of copied.split('\n')) {
      if (line.startsWith('http')) {
        expect(line.includes(' ')).toBe(false);
        expect(line.includes('\n')).toBe(false);
      }
    }
  });
});
