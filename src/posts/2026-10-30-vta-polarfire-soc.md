---
topic: ai-infra
title: "A DNN accelerator in PolarFire fabric, and three weeks spent chasing the wrong bug"
description: "Apache TVM's VTA running in PolarFire SoC fabric reaches 49 GOPS and beats the board's own four RISC-V cores by 81×. What hid that for weeks was two words of Chisel: a queue whose asynchronous read becomes a synchronous LSRAM, quietly corrupting the accelerator's instruction stream."
author: Dan Mihai Dumitriu
date: 2026-10-30
tags: [VTA, TVM, FPGA, PolarFire, RISC-V, Chisel]
---

A Microchip PolarFire SoC Discovery Kit has four RISC-V application cores and a lot of FPGA fabric next to them. We put [Apache TVM's VTA](https://tvm.apache.org/docs/topic/vta/index.html) — an open, parameterised INT8 tensor accelerator — into that fabric, drove it from Linux running on the MSS cores, and compiled real ResNet-18 convolution layers onto it through TVM.

It works, and it is worth having: 49 GOPS across ten convolution layers, 84 % of the configuration's theoretical peak while the array is running, and 81× the throughput of the same layers on all four U54 cores. The part most worth writing down is not the number. It is that for three weeks the accelerator returned zeros, and almost every hypothesis we formed about why was wrong — including a critical path we found, fixed, and proved irrelevant.

<div class="stats">
  <div class="stat"><b>49 GOPS</b><span>ten ResNet-18 conv layers, end to end through TVM</span></div>
  <div class="stat"><b>81×</b><span>against the same layers on the board's four RISC-V cores</span></div>
  <div class="stat"><b>2 words</b><span>the RTL change that fixed both the wrong answers and the hang</span></div>
  <div class="stat"><b>6.6×</b><span>by which every earlier performance figure understated the hardware, from a debug flag we left on</span></div>
</div>

## What it runs

VTA sits in the fabric behind FIC0, the MSS's AXI port into the fabric. A userspace driver maps its registers and a reserved non-cached DRAM region through `/dev/mem`, so there is no kernel module. On top of that the ordinary TVM path works: write a schedule, `vta.build` it, cross-compile the host side for riscv64, ship it to the board over RPC, run it on the accelerator, check the result against NumPy.

The configuration is a 1 × 16 × 16 INT8 array at 125 MHz — 256 multiply-accumulate units, two operations each, so 64 GOPS of theoretical peak. Here is every convolution layer of ResNet-18, each compiled twice from the same TVM source: once for the accelerator, once for the board's own CPUs.

<div class="table-wrap">

| Layer | Shape | CPU ms | VTA ms | VTA GOPS | Speed-up |
|---|---|---|---|---|---|
| C2 | 56² 64→64 3×3 | 286.5 | 4.75 | 48.67 | 60× |
| C3 | 56² 64→128 3×3 /2 | 153.3 | 2.38 | 48.61 | 64× |
| C4 | 56² 64→128 1×1 /2 | 15.7 | 1.06 | 12.16 | 15× |
| C5 | 28² 128→128 3×3 | 294.9 | 4.47 | 51.73 | 66× |
| C6 | 28² 128→256 3×3 /2 | 222.9 | 2.17 | 53.31 | 103× |
| C7 | 28² 128→256 1×1 /2 | 25.6 | 0.74 | 17.26 | 34× |
| C8 | 14² 256→256 3×3 | 448.4 | 4.15 | 55.70 | 108× |
| C9 | 14² 256→512 3×3 /2 | 230.5 | 2.08 | 55.52 | 111× |
| C10 | 14² 256→512 1×1 /2 | 25.4 | 0.69 | 18.66 | 37× |
| C11 | 7² 512→512 3×3 | 459.8 | 4.10 | 56.45 | 112× |
| **Total** | 1310 MOP | **2163** | **26.6** | **49.28** | **81×** |

</div>

Two things keep that table honest. The CPU baseline uses all four cores — measured at 4.09 cores across four threads, by sampling `/proc/<pid>/stat` deltas rather than trusting `ps`, whose `%CPU` is a lifetime average and reads near zero on a busy worker. And neither side is autotuned: TVM reports a fallback schedule for both, because `tophub` has no entries for this board. So 81× is the right order of magnitude, not a precise figure, and tuning would likely help the CPU proportionally more, since VTA is already near its ceiling and the CPU is nowhere near its own.

The CPU is flat at 0.5–0.8 GOPS whatever the layer: it issues scalar INT8 multiply-accumulates, so its time tracks op count and nothing else. VTA ranges from 12 to 56 GOPS depending on how well the shape suits the array. The gap widens with channel depth — 60× at 64 channels, 112× at 512 — because deeper channels fill a 16 × 16 array better, and the CPU gains nothing from them. The 1 × 1 layers are VTA's weakest because they move nearly as much data for a ninth of the arithmetic; note that the CPU holds its usual rate there, so the narrower gap is the accelerator slowing down, not the CPU catching up.

Reading VTA's own cycle counter alongside wall time shows where the remaining time goes: of 26.6 ms, the accelerator is busy for 24.3 ms. 91 % duty cycle, 53.9 GOPS while running, 84 % of peak, rising to 96 % on C11.

## Zeros at every size

Before any of that, the accelerator had a simpler behaviour: every GEMM returned exactly zero, at every size, while the ALU path was always correct. And after a handful of programs the device would stop accepting work altogether, recovering only when the FPGA was reprogrammed.

What made this expensive was not the bug. It was that we kept eliminating the right things and reaching the wrong conclusion. Over three weeks we ruled out, with evidence: the MAC array (all 128 MATH blocks present and correctly inferred in the netlist), signedness, weight structure, module concurrency, cache coherency, DMA buffer alignment, and the bitstream itself. Simulation passed every size on the exact RTL in the bitstream. The instruction stream in DRAM was correct when read back independently.

We also found a real timing problem. The worst path in the whole design ran from the input scratchpad's LSRAM output to the MAC array's multiplier inputs, closing 125 MHz by **0.139 ns** at the slow corner, with nearly 3 ns of that path being pure routing. It explained the symptoms beautifully: the ALU never touches that path, GEMM depends on it entirely, and the one three-minute window when GEMM did work followed a ten-hour idle on a cool die.

So we fixed it — VTA has a parameter for exactly this case, `scratchpadReadLatency`, which registers the scratchpad read on its way to the multipliers. Margin went up 5×, the path moved off the MAC array entirely, and GEMM was bit-for-bit as broken as before.

<div class="callout">
<p class="callout-title">A hypothesis that survives being acted on and changes nothing is wrong</p>

The 0.139 ns path was real, and closing it was a genuine improvement to a genuinely marginal design. It was not the cause. We had found a true fact and built a false explanation on it, then spent days on clock lowering, multi-pass place-and-route and RTL re-timing — each of which moved the symptom around, which we read as progress.
</div>

## Two taps and a disagreement

What finally settled it was giving up on inference and instrumenting the hardware. VTA's control register block has room for user-defined counters, so we added read-only registers that latch what the LOAD module is handed and what it actually does: DRAM beats arriving, scratchpad reads delivered to the array, the instruction captured at the queue's input, and the instruction captured at the moment the tensor load starts.

The first measurement was already decisive. On a GEMM, the weights arrived — 64 DRAM beats, correct values — and the input never left DRAM: zero beats, zero commands issued, and the input tensor load never started at all, while the program still reported completion. A later build traced the raw instruction on both sides of LOAD's instruction queue, and the two disagreed:

```text
Fetch → LOAD queue   LOAD inp  xsize=2  ysize=1  dram=205520912   correct
tensor-load start    LOAD inp  xsize=2  ysize=0  dram=205520896   corrupted
```

Nothing sits between those two taps except the queue itself. LOAD and STORE each declared theirs as a plain Chisel `Queue`, which is an **asynchronous-read** `Mem`. At 512 × 128 bits, PolarFire synthesis maps that into LSRAM, which can only read synchronously. What came out did not match what went in. COMPUTE — whose micro-op and accumulator loads never once failed in three weeks — had always used `SyncQueue`.

```scala
// Load.scala and Store.scala
- val inst_q = Module(new Queue(UInt(INST_BITS.W), p(CoreKey).instQueueEntries))
+ val inst_q = Module(new SyncQueue(UInt(INST_BITS.W), p(CoreKey).instQueueEntries))
```

<div class="callout">
<p class="callout-title">Why one bug looked like several unrelated ones</p>

Corrupt `xsize` to 0 and the instruction decodes as a **sync**: the load is silently skipped, no input ever reaches the array, every product is a multiplication by zero — and the weight load in the next instruction is untouched. That is the all-zero GEMM, including why weights looked fine.

Corrupt `ysize` to 0 and the DMA command generator finishes at line index `ysize-1`, which wraps to 65535. It issues no command at all and never completes. That is the hang.

Which bits corrupt varies between builds, which is why the symptom kept moving between zeros, hangs and one window of correct results — and why every timing experiment appeared to change something.
</div>

Two lines, two modules. Afterwards the full suite passes at every size, sixty consecutive executions are correct with no stall, and timing improved as a side effect, to +0.980 ns, because `SyncQueue` maps onto LSRAM cleanly instead of fighting the inference.

The portability lesson is worth stating plainly, because upstream VTA runs this same code on Zynq without trouble: **an asynchronous-read `Mem` is fine in Xilinx distributed RAM and silently wrong in PolarFire LSRAM.** Nothing in the Chisel says so, and nothing in the synthesis log warns.

## The instrument was the bug

Three of our wrong conclusions came from one flaw, and it was not in the hardware.

Every test compared its output buffer against a reference, with the buffer initialised to zeros. A device that has stopped executing writes nothing. A buffer of zeros is therefore indistinguishable from a computed zero — so "the accelerator produced wrong answers" and "the accelerator never ran" were, for weeks, the same observation.

That is how we came to believe that one-hot weights passed while general weights failed, and that the MAC array's MATH-block pairing was broken. Both were measured on a device that had already stopped executing, after an earlier test wedged it. Both were wrong, and we had reported both as findings.

<div class="callout">
<p class="callout-title">The fix is structural, not a matter of being careful</p>

Every test now pre-fills its output with a sentinel value and classifies each execution as one of three outcomes — never ran, ran and computed wrongly, correct. Once an instrument can distinguish those states, it cannot assert the wrong one, and no amount of discipline is required to keep that true.

The same principle caught two more traps afterwards. The simulator silently loads a prebuilt library, so a "validated" RTL change had never actually been compiled; it now refuses to run when any source file is newer than the library. And a build flow quietly dropped eight I/O constraint files, including the board's 50 MHz oscillator pin; the build script now refuses to hand over a bitstream whose reference clock is not on the right pin, or whose timing report contains no accelerator paths at all.
</div>

## We were measuring our own debug logging

With the accelerator correct, we measured performance: 7.4 GOPS, with VTA busy only 14 % of wall time. The obvious reading was that per-call runtime overhead dominated, and the obvious fix was graph-level execution to amortise it across a whole network.

One number did not fit. The overhead worked out to 78 µs per VTA instruction, and the per-call work is a few struct writes. That is three orders of magnitude too slow.

The board has no `perf`, so we sampled stacks under gdb instead. All twelve samples landed in the same place: `write()`, inside `LogMessage::~LogMessage`, inside `VTADeviceRun`. A systemd drop-in from the instruction-corruption work still set `VTA_MPFS_DEBUG=1`, and the driver was logging one line per VTA instruction, synchronously, to the journal.

Removing it took the same workload from 7.4 to 49.2 GOPS and the duty cycle from 14 % to 91 %.

<div class="callout">
<p class="callout-title">The plan was aimed at an artefact of our own configuration</p>

Graph-level execution would have been a week of work for what the measurement said was a 7× win. With the logging off, the entire remaining per-call cost is 2.3 ms across ten layers — a ceiling of about 9 %, not 7×. Every performance figure we had recorded understated the hardware by 6.6×.

What saved it was treating an implausible intermediate number as a signal rather than a rounding error. The profiler cost twenty minutes; the plan it cancelled would have cost a week.
</div>

## What's left

The accelerator is now the limit rather than the software around it, which changes the ranking of what to do next.

**Raise the clock.** The build closes at 125 MHz with +0.980 ns of slack and a minimum period of 6.885 ns, implying roughly 145 MHz of headroom. Peak scales linearly and the array already runs at 84 % of peak, so this converts almost directly into throughput. It needs the MSS FIC clock configuration to match, which is where our earlier attempts went wrong.

**Run a whole network.** Compiling ResNet-18 as one Relay graph is now a functional goal rather than a performance one: weights resident, intermediates staying on the device, an actual classifier instead of ten measured layers. The thing to measure first is the CPU-side share — the 7 × 7 × 3 first layer, pooling and softmax stay on the U54s, and on an in-order core those could cost more than the 24 ms the accelerator spends on everything else. The CPU-versus-VTA numbers above make that predictable rather than a surprise.

**Autotuning is blocked upstream,** and worth less than it sounds. VTA's `schedule_conv2d_packed` assumes its output is an epilogue operation, so when autotvm builds the configuration space the output *is* the convolution stage and gets scheduled twice. Fixing it means patching upstream scheduling code, and the payoff is capped: the 3 × 3 layers already run at 81–96 % utilisation, and the 1 × 1 layers where the headroom actually is account for 2.5 ms of 26.6 ms.

**A wider array** has the largest ceiling. The design uses 128 of the part's 292 MATH blocks; raising the block or batch factor raises peak proportionally, bounded by scratchpad LSRAM and by timing — the input-scratchpad-to-multiplier path was the critical path once already and would come back under pressure.

The RTL, driver, test harnesses, debug-register decoder and the full Libero flow are on the `polarfire-timing` branch of our [tvm-vta fork](https://github.com/pvnis/tvm-vta/tree/polarfire-timing); the TVM-side target support is on [`polarfire-mpfs`](https://github.com/pvnis/tvm/tree/polarfire-mpfs). The running record, including every retraction above in the order we made them, is in `mpfs/NOTES.md`.
