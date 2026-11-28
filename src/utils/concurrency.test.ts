import { createLimiter } from './concurrency';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  it('runs at most `max` tasks at once, in order', async () => {
    const run = createLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const results = gates.map((gate, i) =>
      run(async () => {
        started.push(i);
        await gate.promise;
        return i;
      }),
    );

    await flush();
    expect(started).toEqual([0, 1]);

    gates[1]!.resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);

    gates[0]!.resolve();
    gates[2]!.resolve();
    gates[3]!.resolve();
    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3]);
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('frees the slot when a task fails', async () => {
    const run = createLimiter(1);
    const failing = run(() => Promise.reject(new Error('boom')));
    const next = run(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('hands a freed slot to the next waiter, so a new call cannot jump the queue', async () => {
    const run = createLimiter(1);
    const a = deferred();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (name: string, gate?: Promise<void>) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(name);
      await gate;
      active -= 1;
    };
    const first = run(task('A', a.promise));
    const second = run(task('B'));
    await flush();
    a.resolve();
    await first;
    // Called synchronously right after A finished, before B has started.
    const third = run(task('C'));
    await Promise.all([second, third]);
    expect(order).toEqual(['A', 'B', 'C']);
    expect(maxActive).toBe(1);
  });
});
