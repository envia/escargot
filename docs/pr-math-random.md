<!-- Suggested PR title: Seed Math.random independently across threads -->

## Summary

Threads initialized in the same second currently start `Math.random()`
with identical generator state. Separate worker realms then produce
identical sequences, causing token collisions in parallel WPT fetch tests.

Seed each thread's generator with multiple random values and an
initialization counter. This addresses the
[ECMA-262 requirement](https://tc39.es/ecma262/#sec-math.random) that
`Math.random` functions in distinct realms produce distinct sequences.

## Repro

The regression in
[js_vendor_tc commit 45392c19](https://github.com/envia/js_vendor_tc/commit/45392c19adbf5fb4c898e9b51f6243b55d7f7402)
compares 64 successive values from the main realm, four additional realms
on the same thread, and eight agents. Comparing complete sequences allows
individual random values to repeat legitimately.

On this branch, initialize the pinned dependencies, build a test shell,
and run the regression:

```sh
git submodule update --init third_party/GCutil test/vendortest
cmake -S . -B out/random-debug -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DESCARGOT_ENABLE_SHELL=ON \
  -DESCARGOT_TEST=ON \
  -DESCARGOT_THREADING=ON
cmake --build out/random-debug --parallel
./out/random-debug/escargot \
  test/vendortest/Escargot/regression-tests/assert.js \
  test/vendortest/Escargot/regression-tests/issue-math-random-realms.js
```

Using an unmodified shell built from `589c2347` with the same test files
fails with `Agent 0 repeated another realm's Math.random sequence`.
The agent number can vary. All ten baseline runs failed; all ten runs
with the fix passed.

## Root cause

`ThreadLocal::initialize()` seeds each thread's `std::mt19937` with
`static_cast<unsigned int>(time(NULL))`. The seed has one-second
resolution, so threads initialized in that interval receive identical
generator state. `Math.random()` consumes this state through
`ThreadLocal::randEngine()`, repeating the entire sequence across agents.

## Fix

- Mix four `std::random_device` values and a process-wide initialization
  counter with `std::seed_seq`.
- Use an atomic counter when threading is enabled. The counter also
  distinguishes initializations within a process when `random_device`
  is deterministic, and survives thread finalization and reinitialization.
- For bare-metal builds, mix the counter with time and platform ticks
  without requiring an OS random device.
- Retain the existing generator per thread and the 53-bit output
  conversion.
- Update `test/vendortest` to `45392c19`. The existing `regression-tests`
  runner discovers the new test automatically. It also checks that
  returned values are in `[0, 1)`, and runs the same-thread realm checks
  when agent support is disabled.

## Testing

Validated on Linux x64 in an Ubuntu 24.04 container with GCC 13.3,
Debug builds, and `ESCARGOT_TEST=ON`.

| Check | Baseline `589c2347` | Fixed `a15318fb` |
| --- | --- | --- |
| New regression, ten runs | 0/10 passed | 10/10 passed |
| Distinct 64-value sequences from 32 processes at eight jobs | 1/32 | 32/32 |

Additional checks on the fixed build:

- `regression-tests`: 130/130 passed.
- `new-es`: 132/132 passed.
- `ESCARGOT_THREADING=OFF`: build and new regression passed; all 32
  process sequences were distinct.
- `tools/check_tidy.py` with clang-format 20: 512 files, zero errors.

Starfish integration used `envia/real-lightweight-web-engine` at
`df30f877d`, with the patched `ThreadLocal.cpp` overlaid into its Escargot
dependency and `STARFISH_MATH_RANDOM_TEST=OFF`. Both
`request-cache-no-cache.any.html` and
`request-cache-no-cache.any.worker.html` passed five repetitions at eight
jobs: 10/10 page runs and 40/40 subtests. This passed with both the original
WPT server and the server's missing-`Content-Type` fix, confirming that
the cache tests pass without that separate server fix.

Bare-metal target execution was not tested.
