# Sokoban solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/Fawulana/sokoban-solver-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/Fawulana/sokoban-solver-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver for the make.fun competition
`sokoban-solver-01-run-20261121`. One program answers all 5 instances of a
set in a single run: `node main.ts` reads `/input/<id>/level.txt` (XSB) and
writes `/output/<id>/solution.txt` (player moves in `u`/`d`/`l`/`r`).

## Approach

Every level is a one-wide hallway with one to four small rooms off it, and a
box pushed out of its room can never come back, so the level splits into
independent rooms: each room is solved push-optimally on its own, and the
per-room move strings are stitched together with walks along the hallway.

Per room the search is A* over pushes. A state is the sorted box cells plus
the player's reachable region (canonicalised to its lowest cell). The
heuristic is the minimum-cost matching of boxes to goals over precomputed
push distances, which never overestimates the pushes still needed. Dead
positions are pruned with static dead squares (an infinite matching
distance), an iterative freeze check and an explicit 2x2 block check.

All budgets are counted in expanded nodes, never in wall-clock time, so two
runs of the program produce identical bytes. The whole set runs in about
0.3 s locally, far inside the 60 s wall budget.

## Practice results

Push-optimal on every practice instance (verified with the kit scorer and an
independent replay):

| instance | pushes | P\* | points |
|----------|--------|----|--------|
| i001 | 13 | 13 | 1,000 |
| i002 | 16 | 16 | 1,000 |
| i003 | 29 | 29 | 1,000 |
| i004 | 47 | 47 | 1,000 |
| i005 | 60 | 60 | 1,000 |

Practice score **1,000,000** (house baseline plain-astar 1.0.0: 200,000).

## Files

- `main.ts` — the solver (Node 22, erasable TypeScript, stdlib only, no
  network, no clock)
- `LICENSE` — MIT
