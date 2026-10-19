<!-- Suggested PR title: Seed Math.random independently across threads -->

**Escargot (please complete the following information):**

- OS: Ubuntu 24.04 container, Linux x64; GCC 13.3.
- Revision: `589c234770672fa4202b1d08698225d8c3dd1421` (before the fix).
- Configuration: Debug, `ESCARGOT_TEST=ON`, and `ESCARGOT_THREADING=ON`.

**Describe the bug**

Threads initialized in the same second start `Math.random()` with
identical generator state. Separate worker realms then produce identical
sequences, causing token collisions in parallel WPT fetch tests.

The failure repeats across complete 64-value sequences. It was reproduced
in all ten runs of the regression test on the baseline revision.

**Test case**

Save the following as `random-realms.js`. It starts eight agents, collects
64 values from each agent, and rejects duplicate sequences:

```js
const agentCount = 8;
for (let i = 0; i < agentCount; ++i) {
    $262.agent.start(`
        const values = Array.from({ length: 64 }, () => Math.random());
        $262.agent.report(JSON.stringify(values));
        $262.agent.leaving();
    `);
}

const reports = [];
const deadline = Date.now() + 30000;
while (reports.length < agentCount && Date.now() < deadline) {
    const report = $262.agent.getReport();
    if (report === null) {
        $262.agent.sleep(1);
    } else {
        reports.push(report);
    }
}
if (reports.length !== agentCount) {
    throw new Error("Timed out waiting for agents");
}
if (new Set(reports).size !== agentCount) {
    throw new Error("Different agents produced identical Math.random sequences");
}
```

Build a test shell on the affected revision and run the reproducer:

```sh
git submodule update --init third_party/GCutil
cmake -S . -B out/random-debug -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DESCARGOT_ENABLE_SHELL=ON \
  -DESCARGOT_TEST=ON \
  -DESCARGOT_THREADING=ON
cmake --build out/random-debug --parallel
./out/random-debug/escargot random-realms.js
```

**Backtrace**

The reproducer reports an uncaught JavaScript error:

```text
Uncaught Error: Different agents produced identical Math.random sequences:
random-realms.js (24:11)
```

**Expected behavior**

The agents should produce distinct sequences, as required for
`Math.random` functions in distinct realms by
[ECMA-262](https://tc39.es/ecma262/#sec-math.random). Comparing complete
sequences allows individual random values to repeat legitimately.

**Screenshots**

Not applicable; this is a command-line reproduction.

**Additional context**

`ThreadLocal::initialize()` seeds each thread's `std::mt19937` with
`static_cast<unsigned int>(time(NULL))`. The seed has one-second
resolution, so threads initialized in that interval receive identical
generator state. `Math.random()` consumes this state through
`ThreadLocal::randEngine()`, repeating the entire sequence across agents.

The fix in `a15318fb` mixes four `std::random_device` values and
a process-wide initialization counter with `std::seed_seq`. The counter
is atomic when threading is enabled and distinguishes initializations
within a process when `random_device` is deterministic. It survives
thread finalization and reinitialization. Bare-metal builds mix the
counter with time and platform ticks without requiring an OS random
device. The existing generator per thread and 53-bit output conversion
are retained.

The regression in
[js_vendor_tc commit 45392c19](https://github.com/envia/js_vendor_tc/commit/45392c19adbf5fb4c898e9b51f6243b55d7f7402)
compares the main realm, four additional realms on the same thread,
and eight agents. It also checks the `[0, 1)` range and runs the same-thread
realm checks when agent support is disabled. `test/vendortest` is updated
to that commit, and the existing `regression-tests` runner discovers it
automatically.

Validation in the environment listed above:

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
