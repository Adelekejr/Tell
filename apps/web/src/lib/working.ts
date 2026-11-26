/**
 * A tiny app-wide "something is working" count. API calls and long tasks add
 * themselves while they run, and drop the count when they settle.
 */
type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

/** Marks one piece of work as started. Call the returned function once when it ends. */
export function beginWork(): () => void {
  count += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count -= 1;
    emit();
  };
}

/** Runs `task` as work, then settles, success or failure. */
export async function trackWork<T>(task: () => Promise<T>): Promise<T> {
  const end = beginWork();
  try {
    return await task();
  } finally {
    end();
  }
}

export function isWorking(): boolean {
  return count > 0;
}

export function subscribeWork(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
