// A Sokoban solver.
//
// Every level is a one-wide hallway with one to four small rooms off it, and
// a box pushed out of its room can never come back, so the level splits into
// independent rooms: each room is solved push-optimally on its own, and the
// per-room move strings are stitched together with walks along the hallway.
//
// Per room the search is A* over pushes. A state is the sorted box cells plus
// the player's reachable region (canonicalised to its lowest cell). The
// heuristic is the minimum-cost matching of boxes to goals over precomputed
// push distances, which never overestimates the pushes still needed. Dead
// positions are pruned with static dead squares (an infinite matching
// distance), an iterative freeze check and an explicit 2x2 block check. All
// budgets are counted in expanded nodes, never in wall-clock time, so two
// runs of the program produce identical bytes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Node budgets (deterministic; the program never reads the clock).
const ROOM_EXPANSION_CAP = 300_000;
const ROOM_STATE_CAP = 800_000;
const GREEDY_EXPANSION_CAP = 150_000;
const GLOBAL_EXPANSION_CAP = 2_000_000;

let globalExpansions = 0;

// Directions: 0 up, 1 down, 2 left, 3 right.
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const LETTER = ['u', 'd', 'l', 'r'];
const OPP = [1, 0, 3, 2];

type Level = {
  w: number;
  h: number;
  wall: boolean[];
  goals: number[];
  goalSet: boolean[];
  boxes: number[];
  player: number;
};

type RoomSpec = {
  cells: number[];
  goals: number[];
  boxes: number[];
  entry: number;
  door: number;
};

type RoomResult = {
  moves: string;
  pushes: number;
  endPlayer: number;
  finalBoxes: number[];
};

function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall: boolean[] = new Array<boolean>(w * h).fill(true);
  const goals: number[] = [];
  const goalSet: boolean[] = new Array<boolean>(w * h).fill(false);
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      wall[i] = ch === '#';
      if (ch === '.' || ch === '*' || ch === '+') {
        goals.push(i);
        goalSet[i] = true;
      }
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  }
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goals, goalSet, boxes, player };
}

// Split the level into rooms: the connected components of floor cells that
// are not on the player's (hallway) row. Each component must open onto the
// hallway through one door cell. Returns null when the shape is not a
// hallway-plus-rooms level, so the caller can fall back to whole-level search.
function findRooms(lv: Level): RoomSpec[] | null {
  const H = (lv.player / lv.w) | 0;
  const N = lv.w * lv.h;
  const seen = new Array<boolean>(N).fill(false);
  const boxSet = new Set<number>(lv.boxes);
  const rooms: RoomSpec[] = [];
  const inHall = (i: number): boolean => ((i / lv.w) | 0) === H;
  const neighbours = (c: number): number[] => {
    const x = c % lv.w;
    const y = (c / lv.w) | 0;
    const out: number[] = [];
    if (x > 0) out.push(c - 1);
    if (x + 1 < lv.w) out.push(c + 1);
    if (y > 0) out.push(c - lv.w);
    if (y + 1 < lv.h) out.push(c + lv.w);
    return out;
  };
  for (let i = 0; i < N; i++) {
    if (lv.wall[i] || inHall(i) || seen[i]) continue;
    const cells: number[] = [];
    const q: number[] = [i];
    seen[i] = true;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]!;
      cells.push(c);
      for (const n of neighbours(c)) {
        if (lv.wall[n] || inHall(n) || seen[n]) continue;
        seen[n] = true;
        q.push(n);
      }
    }
    cells.sort((a, b) => a - b);
    let door = -1;
    let entry = -1;
    for (const c of cells) {
      for (const n of neighbours(c)) {
        if (inHall(n) && !lv.wall[n]) {
          door = c;
          entry = n;
          break;
        }
      }
      if (door >= 0) break;
    }
    if (door < 0) return null;
    const goals = cells.filter((c) => lv.goalSet[c]);
    const boxes = cells.filter((c) => boxSet.has(c));
    rooms.push({ cells, goals, boxes, entry, door });
  }
  return rooms;
}

// Deterministic shortest walk (u/d/l/r) from `from` to `to` over cells that
// are not walls and not in `boxAt`, or null when unreachable. Neighbours are
// tried in u, d, l, r order, so the walk is the same on every run.
function walkPath(
  lv: Level,
  from: number,
  to: number,
  boxAt: Set<number> | ((c: number) => boolean),
  onlyArena?: boolean[],
): string | null {
  if (from === to) return '';
  const N = lv.w * lv.h;
  const blocked = (c: number): boolean => {
    if (lv.wall[c]) return true;
    if (onlyArena !== undefined && !onlyArena[c]) return true;
    return typeof boxAt === 'function' ? boxAt(c) : boxAt.has(c);
  };
  const step = (c: number, d: number): number => {
    const nx = (c % lv.w) + DX[d]!;
    const ny = ((c / lv.w) | 0) + DY[d]!;
    if (nx < 0 || nx >= lv.w || ny < 0 || ny >= lv.h) return -1;
    return ny * lv.w + nx;
  };
  const prev = new Int32Array(N).fill(-1);
  const prevDir = new Int8Array(N).fill(-1);
  const q: number[] = [from];
  prev[from] = from;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    if (c === to) break;
    for (let d = 0; d < 4; d++) {
      const n = step(c, d);
      if (n < 0 || blocked(n) || prev[n] !== -1) continue;
      prev[n] = c;
      prevDir[n] = d;
      q.push(n);
    }
  }
  if (prev[to] === -1) return null;
  let moves = '';
  let cur = to;
  while (cur !== from) {
    moves = LETTER[prevDir[cur]!]! + moves;
    cur = prev[cur]!;
  }
  return moves;
}

// Solve one room push-optimally (A*), or with greedy best-first when `mode`
// is 'greedy'. The arena is the room's cells plus the hallway cell by the
// door; boxes never leave the room. Returns null when the node budget runs
// out or the room cannot be solved.
function solveRoom(
  lv: Level,
  room: RoomSpec,
  mode: 'astar' | 'greedy',
  expansionCap: number,
): RoomResult | null {
  const w = lv.w;
  const h = lv.h;
  const N = w * h;
  const nB = room.boxes.length;
  const goalList = room.goals.slice().sort((a, b) => a - b);
  if (nB === 0) return { moves: '', pushes: 0, endPlayer: room.entry, finalBoxes: [] };
  if (goalList.length === 0) return null;

  const inRoom = new Array<boolean>(N).fill(false);
  for (const c of room.cells) inRoom[c] = true;
  const inArena = new Array<boolean>(N).fill(false);
  for (const c of room.cells) inArena[c] = true;
  inArena[room.entry] = true;
  const isGoal = new Array<boolean>(N).fill(false);
  for (const g of goalList) isGoal[g] = true;

  const step = (c: number, d: number): number => {
    const nx = (c % w) + DX[d]!;
    const ny = ((c / w) | 0) + DY[d]!;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return -1;
    return ny * w + nx;
  };

  // Adjacency inside the arena, for region and walk searches.
  const adj: number[][] = new Array<number[]>(N);
  for (let c = 0; c < N; c++) {
    const list: number[] = [];
    if (inArena[c]) {
      for (let d = 0; d < 4; d++) {
        const n = step(c, d);
        if (n >= 0 && inArena[n]) list.push(n);
      }
    }
    adj[c] = list;
  }

  // Push distances to each goal: dist[g][cell] is the fewest pushes for a box
  // on `cell` to reach goal g, ignoring other boxes and the player. Reverse
  // BFS on the directed box-move graph: a box moves x -> y when y is a room
  // cell next to x and the player can stand on 2x - y, a floor cell in the
  // arena. A cell with no path to any goal is a static dead square.
  const INF = 1e9;
  const dist: number[][] = [];
  for (const g of goalList) {
    const dg = new Array<number>(N).fill(INF);
    dg[g] = 0;
    const q: number[] = [g];
    for (let qi = 0; qi < q.length; qi++) {
      const y = q[qi]!;
      for (let d = 0; d < 4; d++) {
        const od = OPP[d]!;
        const x = step(y, od);
        if (x < 0 || !inRoom[x] || dg[x] !== INF) continue;
        const s = step(x, od);
        if (s < 0 || !inArena[s]) continue;
        dg[x] = dg[y]! + 1;
        q.push(x);
      }
    }
    dist.push(dg);
  }

  // All permutations of the goal indices, for the matching heuristic.
  const perms: number[][] = [];
  if (goalList.length === nB) {
    const gen = (prefix: number[], rest: number[]): void => {
      if (rest.length === 0) {
        perms.push(prefix);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        gen(prefix.concat([rest[i]!]), rest.slice(0, i).concat(rest.slice(i + 1)));
      }
    };
    const base: number[] = [];
    for (let i = 0; i < nB; i++) base.push(i);
    gen([], base);
  }

  const hCache = new Map<string, number>();
  const heuristic = (boxes: number[]): number => {
    const key = boxes.join(',');
    const cached = hCache.get(key);
    if (cached !== undefined) return cached;
    let best = INF;
    if (goalList.length === nB) {
      for (const p of perms) {
        let s = 0;
        let ok = true;
        for (let i = 0; i < nB; i++) {
          const d = dist[p[i]!]![boxes[i]!]!;
          if (d >= INF) {
            ok = false;
            break;
          }
          s += d;
        }
        if (ok && s < best) best = s;
      }
    } else {
      // Unequal counts: each box's nearest goal, summed (still admissible).
      let s = 0;
      let ok = true;
      for (let i = 0; i < nB; i++) {
        let m = INF;
        for (let g = 0; g < goalList.length; g++) {
          const d = dist[g]![boxes[i]!]!;
          if (d < m) m = d;
        }
        if (m >= INF) {
          ok = false;
          break;
        }
        s += m;
      }
      if (ok) best = s;
    }
    hCache.set(key, best);
    return best;
  };

  // Stamped marks, so no array is cleared per state.
  const boxMark = new Int32Array(N);
  let boxStamp = 0;
  const regionMark = new Int32Array(N);
  let regionStamp = 0;
  const regionQ: number[] = new Array<number>(N);
  const frozenMark = new Int32Array(N);
  let frozenStamp = 0;

  const markBoxes = (boxes: number[]): number => {
    boxStamp++;
    for (const b of boxes) boxMark[b] = boxStamp;
    return boxStamp;
  };

  // The player's reachable region from `start` with boxes stamped `bs`:
  // returns its lowest cell and the stamp that marks its cells.
  const regionOf = (start: number, bs: number): { min: number; stamp: number } => {
    regionStamp++;
    const st = regionStamp;
    let qh = 0;
    let qt = 0;
    regionQ[qt++] = start;
    regionMark[start] = st;
    let min = start;
    while (qh < qt) {
      const c = regionQ[qh++]!;
      if (c < min) min = c;
      const ns = adj[c]!;
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i]!;
        if (regionMark[n] !== st && boxMark[n] !== bs) {
          regionMark[n] = st;
          regionQ[qt++] = n;
        }
      }
    }
    return { min, stamp: st };
  };

  // Deadlock test for a box arrangement stamped `bs`: a 2x2 block of boxes
  // with a box off a goal, or a box that can never move again (frozen: it
  // cannot be pushed along either axis, where a push is blocked only by a
  // wall, the arena edge or another frozen box). The freeze set is grown to a
  // fixed point, so a box blocked only by a box that can still move is never
  // called frozen.
  const deadlocked = (boxes: number[], bs: number): boolean => {
    for (const b of boxes) {
      const x = b % w;
      const y = (b / w) | 0;
      if (x + 1 < w && y + 1 < h) {
        const c2 = b + 1;
        const c3 = b + w;
        const c4 = b + w + 1;
        if (boxMark[c2] === bs && boxMark[c3] === bs && boxMark[c4] === bs) {
          if (!isGoal[b] || !isGoal[c2] || !isGoal[c3] || !isGoal[c4]) return true;
        }
      }
    }
    frozenStamp++;
    const fs = frozenStamp;
    const targetBlocked = (c: number): boolean =>
      c < 0 || !inRoom[c] || (boxMark[c] === bs && frozenMark[c] === fs);
    const standBlocked = (c: number): boolean =>
      c < 0 || !inArena[c] || (boxMark[c] === bs && frozenMark[c] === fs);
    const isFrozen = (b: number): boolean => {
      const l = step(b, 2);
      const r = step(b, 3);
      const u = step(b, 0);
      const dn = step(b, 1);
      const pushL = !targetBlocked(l) && !standBlocked(r);
      const pushR = !targetBlocked(r) && !standBlocked(l);
      const pushU = !targetBlocked(u) && !standBlocked(dn);
      const pushD = !targetBlocked(dn) && !standBlocked(u);
      return !(pushL || pushR) && !(pushU || pushD);
    };
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of boxes) {
        if (frozenMark[b] === fs) continue;
        if (isFrozen(b)) {
          frozenMark[b] = fs;
          changed = true;
        }
      }
    }
    for (const b of boxes) {
      if (!isGoal[b] && frozenMark[b] === fs) return true;
    }
    return false;
  };

  // Binary heap of [priority, g, seq, state]: smaller priority first, ties by
  // larger g, then by earlier insertion, so the order is fully deterministic.
  const heap: number[][] = [];
  const heapLess = (a: number[], b: number[]): boolean =>
    a[0]! < b[0]! ||
    (a[0]! === b[0]! && (a[1]! > b[1]! || (a[1]! === b[1]! && a[2]! < b[2]!)));
  const heapPush = (e: number[]): void => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapLess(heap[p]!, heap[i]!)) break;
      const t = heap[p]!;
      heap[p] = heap[i]!;
      heap[i] = t;
      i = p;
    }
  };
  const heapPop = (): number[] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heapLess(heap[c + 1]!, heap[c]!)) c++;
        if (heapLess(heap[i]!, heap[c]!)) break;
        const t = heap[i]!;
        heap[i] = heap[c]!;
        heap[c] = t;
        i = c;
      }
    }
    return top;
  };

  const sp: number[] = [];
  const sb: number[][] = [];
  const sg: number[] = [];
  const skey: string[] = [];
  const spar: number[] = [];
  const spushBox: number[] = [];
  const spushDir: number[] = [];
  const best = new Map<string, number>();

  const initBoxes = room.boxes.slice().sort((a, b) => a - b);
  const initH = heuristic(initBoxes);
  if (initH >= INF) return null;
  const initBs = markBoxes(initBoxes);
  const initRegion = regionOf(room.entry, initBs);
  const initKey = initBoxes.join(',') + '#' + initRegion.min;
  sp.push(room.entry);
  sb.push(initBoxes);
  sg.push(0);
  skey.push(initKey);
  spar.push(-1);
  spushBox.push(-1);
  spushDir.push(-1);
  best.set(initKey, 0);

  let seq = 0;
  const prio = (g: number, hh: number): number => (mode === 'greedy' ? hh : g + hh);
  heapPush([prio(0, initH), 0, seq++, 0]);

  let expansions = 0;
  while (heap.length > 0) {
    const top = heapPop();
    const idx = top[3]!;
    const g = sg[idx]!;
    if (best.get(skey[idx]!) !== g) continue;
    const boxes = sb[idx]!;
    let solved = true;
    for (const b of boxes) {
      if (!isGoal[b]) {
        solved = false;
        break;
      }
    }
    if (solved) {
      const order: number[] = [];
      let cur = idx;
      while (spar[cur]! >= 0) {
        order.push(cur);
        cur = spar[cur]!;
      }
      order.reverse();
      let moves = '';
      let player = sp[0]!;
      for (const t of order) {
        const p = spar[t]!;
        const stand = step(spushBox[t]!, OPP[spushDir[t]!]!);
        const walk = walkPath(lv, player, stand, (c: number) => {
          const pbs = sb[p]!;
          for (const b of pbs) if (b === c) return true;
          return false;
        }, inArena);
        if (walk === null) return null;
        moves += walk;
        moves += LETTER[spushDir[t]!]!;
        player = spushBox[t]!;
      }
      return { moves, pushes: g, endPlayer: player, finalBoxes: boxes.slice() };
    }
    if (expansions >= expansionCap || globalExpansions >= GLOBAL_EXPANSION_CAP) return null;
    if (sp.length >= ROOM_STATE_CAP) return null;
    expansions++;
    globalExpansions++;
    // Snapshot this state's boxes and player region into their own arrays:
    // generating a successor overwrites the shared stamp arrays below, so
    // the current state's membership must survive the whole expansion.
    const curBoxAt = new Uint8Array(N);
    for (const b of boxes) curBoxAt[b] = 1;
    const bs = markBoxes(boxes);
    const region = regionOf(sp[idx]!, bs);
    const curRegion = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (regionMark[c] === region.stamp) curRegion[c] = 1;
    for (let bi = 0; bi < nB; bi++) {
      const b = boxes[bi]!;
      for (let d = 0; d < 4; d++) {
        const target = step(b, d);
        if (target < 0 || !inRoom[target] || curBoxAt[target]) continue;
        const stand = step(b, OPP[d]!);
        if (stand < 0 || !inArena[stand] || curBoxAt[stand]) continue;
        if (!curRegion[stand]) continue;
        const nb = boxes.slice();
        nb[bi] = target;
        nb.sort((x, y) => x - y);
        const nbs = markBoxes(nb);
        if (deadlocked(nb, nbs)) continue;
        const hh = heuristic(nb);
        if (hh >= INF) continue;
        const nregion = regionOf(b, nbs);
        const key = nb.join(',') + '#' + nregion.min;
        const ng = g + 1;
        const prev = best.get(key);
        if (prev !== undefined && prev <= ng) continue;
        best.set(key, ng);
        const ni = sp.length;
        sp.push(b);
        sb.push(nb);
        sg.push(ng);
        skey.push(key);
        spar.push(idx);
        spushBox.push(b);
        spushDir.push(d);
        heapPush([prio(ng, hh), ng, seq++, ni]);
      }
    }
  }
  return null;
}

// Solve the whole level as a single room (fallback for levels that are not
// hallway-plus-rooms shaped).
function solveWholeLevel(lv: Level): string {
  const cells: number[] = [];
  for (let i = 0; i < lv.w * lv.h; i++) if (!lv.wall[i]) cells.push(i);
  const room: RoomSpec = {
    cells,
    goals: lv.goals.slice(),
    boxes: lv.boxes.slice(),
    entry: lv.player,
    door: lv.player,
  };
  const r =
    solveRoom(lv, room, 'astar', ROOM_EXPANSION_CAP) ??
    solveRoom(lv, room, 'greedy', GREEDY_EXPANSION_CAP);
  return r ? r.moves : '';
}

function solveLevel(lv: Level): string {
  const rooms = findRooms(lv);
  if (rooms === null || rooms.length === 0) return solveWholeLevel(lv);
  const covered = new Array<boolean>(lv.w * lv.h).fill(false);
  for (const r of rooms) for (const c of r.cells) covered[c] = true;
  for (const b of lv.boxes) if (!covered[b]) return solveWholeLevel(lv);
  for (const g of lv.goals) if (!covered[g]) return solveWholeLevel(lv);

  const sols: (RoomResult | null)[] = [];
  for (const r of rooms) {
    let s = solveRoom(lv, r, 'astar', ROOM_EXPANSION_CAP);
    if (s === null) s = solveRoom(lv, r, 'greedy', GREEDY_EXPANSION_CAP);
    sols.push(s);
  }
  if (sols.some((s) => s === null)) return '';

  // Try room orders until every hallway walk succeeds. A room whose final
  // boxes block its own door can only go last, which the permutations cover.
  const idxs = rooms.map((_, i) => i);
  const perms: number[][] = [];
  const gen = (prefix: number[], rest: number[]): void => {
    if (rest.length === 0) {
      perms.push(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      gen(prefix.concat([rest[i]!]), rest.slice(0, i).concat(rest.slice(i + 1)));
    }
  };
  gen([], idxs);
  for (const perm of perms) {
    let moves = '';
    let player = lv.player;
    const boxAt = new Set<number>(lv.boxes);
    let ok = true;
    for (const ri of perm) {
      const room = rooms[ri]!;
      const sol = sols[ri]!;
      const walk = walkPath(lv, player, room.entry, boxAt);
      if (walk === null) {
        ok = false;
        break;
      }
      moves += walk;
      moves += sol.moves;
      for (const b of room.boxes) boxAt.delete(b);
      for (const b of sol.finalBoxes) boxAt.add(b);
      player = sol.endPlayer;
    }
    if (ok) return moves;
  }
  return '';
}

for (const id of readdirSync(INPUT_DIR).sort()) {
  let moves = '';
  try {
    const text = readFileSync(join(INPUT_DIR, id, 'level.txt'), 'utf8');
    moves = solveLevel(parseLevel(text));
  } catch {
    moves = '';
  }
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'solution.txt'), `${moves}\n`);
}
