import { subscribeToNotifications } from './notificationsChannel';

type Status = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

/** A fake Supabase client that records channels and lets tests drive them. */
function fakeClient() {
  const channels: {
    topic: string;
    emit: (row: { id?: string }) => void;
    status: (s: Status) => void;
    removed: boolean;
  }[] = [];
  const client = {
    auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) },
    realtime: { setAuth: jest.fn(async () => undefined) },
    channel: jest.fn((topic: string) => {
      const record = { topic, emit: (_: { id?: string }) => {}, status: (_: Status) => {}, removed: false };
      channels.push(record);
      const chan = {
        on: (_type: string, _filter: unknown, cb: (p: { new: { id?: string } }) => void) => {
          record.emit = (row) => cb({ new: row });
          return chan;
        },
        subscribe: (cb: (s: Status) => void) => {
          record.status = cb;
          return chan;
        },
        record,
      };
      return chan;
    }),
    removeChannel: jest.fn(async (chan: { record: { removed: boolean } }) => {
      chan.record.removed = true;
      return 'ok';
    }),
  };
  return { client, channels };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('subscribeToNotifications', () => {
  beforeEach(() => jest.useRealTimers());

  it('authorizes, uses a unique topic per subscription, and resyncs on join', async () => {
    const { client, channels } = fakeClient();
    const onResync = jest.fn();
    const onInsert = jest.fn();
    const stopA = subscribeToNotifications({ client: client as never, userId: 'u', onResync, onInsert });
    const stopB = subscribeToNotifications({ client: client as never, userId: 'u', onResync, onInsert });
    await flush();
    expect(client.realtime.setAuth).toHaveBeenCalledWith('jwt');
    expect(new Set(channels.map((c) => c.topic)).size).toBe(2);
    channels[0]!.status('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(1);
    channels[0]!.emit({ id: 'n1' });
    expect(onInsert).toHaveBeenCalledWith('n1');
    stopA();
    stopB();
  });

  it('resyncs again after a reconnect', async () => {
    const { client, channels } = fakeClient();
    const onResync = jest.fn();
    const stop = subscribeToNotifications({
      client: client as never,
      userId: 'u',
      onResync,
      onInsert: jest.fn(),
    });
    await flush();
    channels[0]!.status('SUBSCRIBED');
    channels[0]!.status('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(2);
    stop();
  });

  it('tears down and retries with a fresh channel after an error', async () => {
    const { client, channels } = fakeClient();
    const stop = subscribeToNotifications({
      client: client as never,
      userId: 'u',
      onResync: jest.fn(),
      onInsert: jest.fn(),
      backoff: () => 0,
    });
    await flush();
    channels[0]!.status('CHANNEL_ERROR');
    expect(channels[0]!.removed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flush();
    expect(channels).toHaveLength(2);
    expect(channels[1]!.topic).not.toBe(channels[0]!.topic);
    stop();
  });

  it('stops cleanly: removes the channel and ignores late callbacks', async () => {
    const { client, channels } = fakeClient();
    const onResync = jest.fn();
    const stop = subscribeToNotifications({
      client: client as never,
      userId: 'u',
      onResync,
      onInsert: jest.fn(),
    });
    await flush();
    stop();
    expect(channels[0]!.removed).toBe(true);
    channels[0]!.status('SUBSCRIBED');
    expect(onResync).not.toHaveBeenCalled();
  });
});
