// Deterministic model of the robot grid used by the island.h game API.
// The runner calls dispatch() synchronously whenever compiled C code calls a
// robot_* function, so every event in the log is a real call made by the
// player's program. The world view only replays this log; it never invents moves.

export const MAX_EVENTS = 5000;

/**
 * @param {{width:number,height:number,start?:[number,number],damage?:Array<[number,number,number]>,walls?:Array<[number,number]>}} cfg
 */
export function createGridWorld(cfg) {
  const width = cfg.width;
  const height = cfg.height;
  const damage = new Map();
  for (const [x, y, d] of cfg.damage || []) damage.set(`${x},${y}`, d ?? 1);
  const walls = new Set((cfg.walls || []).map(([x, y]) => `${x},${y}`));
  const state = {
    x: cfg.start ? cfg.start[0] : 0,
    y: cfg.start ? cfg.start[1] : 0,
    moves: 0,
    blocked: 0,
    repairs: 0,
    wastedRepairs: 0,
    scans: 0,
  };
  const events = [];
  let truncated = false;

  function log(ev) {
    if (events.length < MAX_EVENTS) events.push(ev);
    else truncated = true;
  }

  const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

  const api = {
    move(dirCode) {
      const dir = String.fromCharCode(dirCode & 0xff).toUpperCase();
      const d = DIRS[dir];
      if (!d) {
        log({ op: 'move', dir: String.fromCharCode(dirCode & 0xff), ok: false, invalid: true, x: state.x, y: state.y });
        state.blocked++;
        return 0;
      }
      const nx = state.x + d[0];
      const ny = state.y + d[1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || walls.has(`${nx},${ny}`)) {
        state.blocked++;
        log({ op: 'move', dir, ok: false, x: state.x, y: state.y });
        return 0;
      }
      state.x = nx;
      state.y = ny;
      state.moves++;
      log({ op: 'move', dir, ok: true, x: nx, y: ny });
      return 1;
    },
    scan() {
      state.scans++;
      const v = damage.get(`${state.x},${state.y}`) || 0;
      log({ op: 'scan', x: state.x, y: state.y, value: v });
      return v;
    },
    repair() {
      const key = `${state.x},${state.y}`;
      const v = damage.get(key) || 0;
      if (v > 0) {
        damage.delete(key);
        state.repairs++;
      } else {
        state.wastedRepairs++;
      }
      log({ op: 'repair', x: state.x, y: state.y, was: v });
    },
    x() {
      log({ op: 'x', value: state.x });
      return state.x;
    },
    y() {
      log({ op: 'y', value: state.y });
      return state.y;
    },
  };

  function summary() {
    return {
      x: state.x,
      y: state.y,
      moves: state.moves,
      blocked: state.blocked,
      repairs: state.repairs,
      wastedRepairs: state.wastedRepairs,
      scans: state.scans,
      remainingDamage: [...damage.entries()].map(([k, d]) => [...k.split(',').map(Number), d]),
      eventsTruncated: truncated,
    };
  }

  return { api, events, summary, config: cfg };
}
