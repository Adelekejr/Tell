import { useEffect, useState } from 'react';
import { copyText } from '../lib/copy';
import { CheckIcon, CopyIcon } from './icons';

/**
 * The copyable task for the agent, on an ink panel. Shows the first two
 * links and how many more; the full text is what gets copied.
 */
export function TaskBox({ task, compact }: { task: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const lines = task.split('\n');
  const [intro, ...links] = lines;
  const shown = compact ? links.slice(0, 2) : links;
  const more = links.length - shown.length;

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2200);
    return () => window.clearTimeout(t);
  }, [state]);

  return (
    <div className="taskbox dark">
      <pre className="taskbox-text" aria-label="Task for your agent">
        {intro}
        {'\n'}
        {shown.join('\n')}
        {more > 0 ? <span className="muted">{`\n\u2026 ${more} more links`}</span> : null}
      </pre>
      <button
        type="button"
        className="btn btn-accent taskbox-copy"
        onClick={async () => setState((await copyText(task)) ? 'copied' : 'failed')}
      >
        <span className="taskbox-copy-label">
          {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
          {state === 'copied' ? 'Copied. Paste it into your agent' : state === 'failed' ? 'Couldn\u2019t copy. Select the text above' : 'Copy task for your agent'}
        </span>
      </button>
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Task copied' : ''}
      </span>
    </div>
  );
}
