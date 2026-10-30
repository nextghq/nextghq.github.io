---
topic: ai-infra
title: "A tensor accelerator in PolarFire fabric, 81× over the board's own CPUs"
description: "Apache TVM's VTA running in PolarFire SoC fabric: 49 GOPS across ResNet-18's convolution layers at 84 % of the array's theoretical peak, driven from Linux on the RISC-V cores with no kernel module. Plus the one PolarFire-specific RTL requirement that porting VTA depends on."
author: Dan Mihai Dumitriu
date: 2026-10-30
tags: [VTA, TVM, FPGA, PolarFire, RISC-V, Chisel]
---

A Microchip PolarFire SoC Discovery Kit has four RISC-V application cores and a large block of FPGA fabric beside them. We put [Apache TVM's VTA](https://tvm.apache.org/docs/topic/vta/index.html) — an open, parameterised INT8 tensor accelerator — into that fabric, drove it from Linux on the MSS cores, and compiled real ResNet-18 convolution layers onto it through TVM.

The result is worth the fabric it occupies: 49 GOPS across ten convolution layers, 84 % of the configuration's theoretical peak while the array is running, and 81× the throughput of the same layers on all four application cores. This post covers how it is put together, what it measures, and the one PolarFire-specific RTL requirement that a port like this depends on.

<div class="stats">
  <div class="stat"><b>49 GOPS</b><span>ten ResNet-18 conv layers, end to end through TVM</span></div>
  <div class="stat"><b>81×</b><span>against the same layers on the board's four RISC-V cores</span></div>
  <div class="stat"><b>84 %</b><span>of theoretical peak while the array is running</span></div>
  <div class="stat"><b>91 %</b><span>of wall time spent inside the accelerator</span></div>
</div>

## How it is put together

VTA sits in the fabric behind FIC0, the MSS's AXI port into the fabric, with its control registers on one interconnect and its DMA master on another. The configuration is a 1 × 16 × 16 INT8 array at 125 MHz: 256 multiply-accumulate units, two operations each, giving 64 GOPS of theoretical peak. Synthesis maps the array onto 128 of the MPFS095T's 292 MATH blocks, two multipliers per block in dual 9 × 9 mode, and the scratchpads onto LSRAM.

The software side needs no kernel module. A userspace driver maps VTA's registers and a reserved, non-cached DRAM region through `/dev/mem`. Using the non-cached alias is what keeps the CPU and the accelerator coherent without any cache maintenance: there is no cached view of those buffers to go stale, so the driver never has to flush or invalidate. The region is reserved `no-map` in the device tree, so Linux never allocates from it.

On top of that the ordinary TVM path works end to end: write a schedule, `vta.build` it, cross-compile the host side for riscv64, ship it to the board over RPC, execute on the accelerator, and check the result against a NumPy reference. Two details are specific to this board. The RISC-V target needs both its ISA string and its ABI pinned — the distribution's compiler defaults to an extension set whose vector code will not run on this part, and LLVM otherwise emits soft-float-ABI objects that the `lp64d` linker refuses to merge with the rootfs libraries. And modules are exported as cross-compiled shared libraries rather than object files for the RPC server to link, which it cannot do here.

## What it measures

Every convolution layer of ResNet-18, each compiled twice from the same TVM source — once for the accelerator, once for the board's own CPUs:

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

Two things keep that table honest. The CPU baseline uses all four cores — measured at 4.09 cores across four threads, by sampling `/proc/<pid>/stat` deltas rather than trusting `ps`, whose `%CPU` is a lifetime average and reads near zero on a busy worker. And neither side is autotuned: TVM reports a fallback schedule for both, because `tophub` carries no entries for this board. So 81× is the right order of magnitude rather than a precise figure, and tuning would likely help the CPU proportionally more, since the accelerator is already near its ceiling and the CPU is nowhere near its own.

The CPU is flat at 0.5–0.8 GOPS whatever the layer: it issues scalar INT8 multiply-accumulates, so its time tracks op count and nothing else. VTA ranges from 12 to 56 GOPS depending on how well the shape suits the array. The gap widens with channel depth — 60× at 64 channels, 112× at 512 — because deeper channels fill a 16 × 16 array better and the CPU gains nothing from them. The 1 × 1 layers are the array's weakest case: they move nearly as much data for a ninth of the arithmetic, so they are bound by DMA rather than by compute. Note that the CPU holds its usual rate on those same layers, so the narrower gap there is the accelerator slowing down, not the CPU catching up.

Reading VTA's own cycle counter alongside wall time separates accelerator time from system time. Of 26.6 ms, the array is busy for 24.3 ms: a 91 % duty cycle, 53.9 GOPS while running, 84 % of peak, rising to 96 % on C11. MAC utilisation climbs as spatial size shrinks and channels grow, from 83 % on C2 to 96 % on C11, because fewer and larger tiles mean fewer instructions issued per unit of arithmetic.

## Instruction queues must be synchronous-read on PolarFire

One RTL change is a hard requirement for this port, and it is not obvious from the Chisel.

VTA's LOAD and STORE modules each buffer their instruction stream in a queue. Upstream both declare a plain Chisel `Queue`, which is an **asynchronous-read** `Mem`. At 512 entries × 128 bits, PolarFire synthesis maps that into LSRAM — which can only read synchronously. The instruction presented at the queue's output then does not match what was written into it. COMPUTE, whose micro-op and accumulator loads are driven the same way, has always used `SyncQueue` and is unaffected.

```scala
// Load.scala and Store.scala
- val inst_q = Module(new Queue(UInt(INST_BITS.W), p(CoreKey).instQueueEntries))
+ val inst_q = Module(new SyncQueue(UInt(INST_BITS.W), p(CoreKey).instQueueEntries))
```

The corruption is visible directly in hardware. Adding read-only counters to VTA's control register block, tapping the instruction at the queue's input and again at the moment the tensor load starts, the two disagree:

```text
Fetch → LOAD queue   LOAD inp  xsize=2  ysize=1  dram=205520912   written
tensor-load start    LOAD inp  xsize=2  ysize=0  dram=205520896   read back
```

<div class="callout">
<p class="callout-title">What a corrupted instruction field does downstream</p>

Corrupt `xsize` to 0 and the instruction decodes as a **sync**: the load is skipped silently, no input data reaches the MAC array, and every product becomes a multiplication by zero. The weight load in the following instruction is untouched, so weights look perfectly healthy.

Corrupt `ysize` to 0 and the DMA command generator finishes at line index `ysize-1`, which wraps to 65535. It issues no command at all and never completes.

Which bits corrupt varies between builds, so the same root cause presents as wrong results, as a stall, or intermittently as neither.
</div>

With both queues on `SyncQueue` the full suite passes at every size, sixty consecutive executions are correct, and timing improves as a side effect — worst accelerator slack goes to +0.980 ns — because `SyncQueue` maps onto LSRAM cleanly instead of fighting the inference.

The portable lesson is worth stating plainly, because upstream VTA runs this same code on Zynq without trouble: **an asynchronous-read `Mem` is fine in Xilinx distributed RAM and silently wrong in PolarFire LSRAM.** Nothing in the Chisel marks the difference, and synthesis does not warn.

## What's left

The accelerator is now the limit rather than the software around it, which sets the order of what to do next.

**Raise the clock.** The build closes at 125 MHz with +0.980 ns of slack and a minimum period of 6.885 ns, implying roughly 145 MHz of headroom. Peak scales linearly and the array already runs at 84 % of peak, so this converts almost directly into throughput. It requires the MSS FIC clock configuration to match the fabric clock.

**Run a whole network.** Compiling ResNet-18 as a single Relay graph — quantise, pack to the accelerator's tensor layout, build, run under the graph executor — keeps weights resident and intermediates on the device, and turns ten measured layers into an actual classifier. The first thing to measure there is the CPU-side share: the 7 × 7 × 3 first layer, pooling and softmax stay on the application cores, and on an in-order core those could cost more than the 24 ms the accelerator spends on everything else. The CPU column above makes that predictable rather than a surprise.

**Autotuning needs an upstream fix first,** and is worth less than it sounds. VTA's `schedule_conv2d_packed` assumes its output is an epilogue operation, so when autotvm builds the configuration space the output *is* the convolution stage and gets scheduled twice. Beyond that, the payoff is capped: the 3 × 3 layers already run at 81–96 % MAC utilisation, and the 1 × 1 layers where the headroom actually sits account for 2.5 ms of 26.6 ms.

**A wider array** has the largest ceiling. The design uses 128 of the part's 292 MATH blocks; raising the block or batch factor raises peak proportionally, bounded by scratchpad LSRAM capacity and by timing — the path from the input scratchpad to the multiplier inputs is the one that tightens first.

The RTL, driver, test harnesses, debug-register decoder and the full Libero build flow are on the `polarfire-timing` branch of our [tvm-vta fork](https://github.com/pvnis/tvm-vta/tree/polarfire-timing); the TVM-side target support is on [`polarfire-mpfs`](https://github.com/pvnis/tvm/tree/polarfire-mpfs).
