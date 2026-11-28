/**
 * Runs at most `max` tasks at once; the rest wait their turn (first in,
 * first out). Used where one screen would otherwise fire a burst of heavy
 * requests at the same moment (Discover's rows).
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  // A finished task hands its slot straight to the next waiter, so a new
  // call can't slip in between and run more than `max` (or jump the queue).
  const next = () => {
    const waiter = waiting.shift();
    if (waiter) waiter();
    else active -= 1;
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await task();
    } finally {
      next();
    }
  };
}
