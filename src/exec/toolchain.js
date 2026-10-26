// Shared toolchain configuration. Used by the browser compile worker AND by the
// Node verification scripts, so the game and the test suite compile C identically.

export const CLANG_PACKAGE_VERSION = '22.0.0-git20542-10';
// Public URL folder (relative to the app base) where scripts/copy-toolchain.mjs
// places the @yowasp/clang build. The version is part of the path so browser
// caches are invalidated automatically when the compiler is upgraded.
export const TOOLCHAIN_DIR = `toolchain/clang-${CLANG_PACKAGE_VERSION}/`;

export const C_STANDARD = 'c17';

export const SOURCE_FILE = 'main.c';
export const HARNESS_FILE = 'harness.c';
export const OUTPUT_FILE = 'program.wasm';
export const RUNTIME_FILE = 'game/isle_runtime.c';

// Linked into every program. Makes stdout unbuffered so prompts appear before
// the program waits for input, the way an interactive terminal behaves.
// It does not change what your program prints.
export const ISLE_RUNTIME_C = `#include <stdio.h>
__attribute__((constructor)) static void isle_terminal_mode(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
}
`;

export const MAX_SOURCE_BYTES = 64 * 1024;

// Flags shown to the player in the "How is my code compiled?" panel.
export const VISIBLE_FLAGS = ['-std=c17', '-Wall', '-Wextra', '-Wimplicit-fallthrough', '-O0'];

/**
 * Build the clang command line.
 * @param {{harness?: boolean}} opts  harness: link a test harness that supplies
 *   its own main(); the player's main() is renamed to student_main.
 */
export function compileArgs({ harness = false } = {}) {
  const args = [
    'clang',
    '--target=wasm32-wasip1',
    ...VISIBLE_FLAGS,
    '-fno-color-diagnostics',
    // Runtime checks: undefined behaviour such as signed overflow or division
    // by zero stops the program (a WebAssembly trap) instead of silently
    // producing garbage. This is a teaching aid; native gcc does not do this
    // unless you pass -fsanitize=undefined yourself.
    '-fsanitize=undefined',
    '-fsanitize-trap=undefined',
    '-I', '/game/include',
    '-Wl,--max-memory=67108864',
    '-Wl,-z,stack-size=1048576',
  ];
  if (harness) args.push('-Dmain=student_main');
  args.push(SOURCE_FILE);
  if (harness) args.push(HARNESS_FILE);
  args.push(RUNTIME_FILE);
  args.push('-o', OUTPUT_FILE, '-lm');
  return args;
}

// The game's own header. NOT part of standard C: these functions only exist
// inside Isle of C. They are implemented by the game (see src/world/gridModel.js)
// and imported into the compiled WebAssembly module.
export const ISLAND_H = `/*
 * island.h - Isle of C game API (NOT standard C).
 * These functions control PIP-7 in the game world. They do not exist in a
 * normal C installation; everything else you write is ordinary C17.
 */
#ifndef ISLAND_H
#define ISLAND_H

#define ISLAND_IMPORT(name) __attribute__((import_module("island"), import_name(name)))

/* Move one tile: 'N' (up), 'S' (down), 'E' (right) or 'W' (left).
   Returns 1 if the robot moved, 0 if a wall or the edge blocked it. */
ISLAND_IMPORT("move") int robot_move(char direction);

/* Damage level of the tile under the robot: 0 means the tile is fine. */
ISLAND_IMPORT("scan") int robot_scan(void);

/* Repair the tile under the robot (sets its damage to 0). */
ISLAND_IMPORT("repair") void robot_repair(void);

/* Current column (x, grows to the east) and row (y, grows to the south). */
ISLAND_IMPORT("x") int robot_x(void);
ISLAND_IMPORT("y") int robot_y(void);

#undef ISLAND_IMPORT
#endif
`;

export function compileFiles(source, harnessSource) {
  const files = {
    [SOURCE_FILE]: source,
    game: { include: { 'island.h': ISLAND_H }, 'isle_runtime.c': ISLE_RUNTIME_C },
  };
  if (harnessSource != null) files[HARNESS_FILE] = '#undef main\n' + harnessSource;
  return files;
}

/**
 * Parse clang/wasm-ld diagnostics into structured records.
 * @param {string} text
 */
export function parseDiagnostics(text) {
  const out = [];
  const lines = text.split('\n');
  const re = /^(?:[^:\s]*\/)?([\w.\-]+):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;
  let current = null;
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      let message = m[5];
      let flag = null;
      const fm = /\s\[(-W[\w\-=]+|-fsanitize[\w\-=]*)(?:,[^\]]*)?\]$/.exec(message);
      if (fm) {
        flag = fm[1];
        message = message.slice(0, fm.index);
      }
      current = {
        file: m[1],
        line: Number(m[2]),
        column: Number(m[3]),
        severity: m[4] === 'fatal error' ? 'error' : m[4],
        message,
        flag,
        context: [],
      };
      out.push(current);
      continue;
    }
    const ld = /^wasm-ld: error: (.*)$/.exec(line);
    if (ld) {
      current = { file: null, line: null, column: null, severity: 'error', message: ld[1], flag: null, linker: true, context: [] };
      out.push(current);
      continue;
    }
    if (current && line.trim() && !/^\d+ (warning|error)s? generated\.?$/.test(line.trim()) && !/generated\.$/.test(line)) {
      current.context.push(line);
    }
  }
  return out;
}
