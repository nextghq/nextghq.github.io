---
title: "Conformant Is Not Performant: What OpenFlow Can Teach O-RAN"
description: "If you were in networking when OpenFlow arrived, O-RAN should feel familiar. Data center networking eventually got openness right with SONiC. Here's what wireless can learn from that, and where the analogy breaks down."
author: Dan Mihai Dumitriu
date: 2026-10-29
tags: [O-RAN, SDN, OCUDU, E2, E3]
---

If you worked in networking around 2010, you remember the excitement around
OpenFlow. Pull the control plane out of the switch, put it on a server, speak
a standard protocol between the two, and the network becomes software. Vendor
lock-in would end. Researchers and operators would invent new things without
waiting on a vendor's release schedule.

Some of that came true. Most of it didn't happen the way anyone expected.

If you work in wireless today, the story of **O-RAN** should sound familiar.
Open the interfaces between the pieces of the radio access network. Let
operators mix and match vendors. Add a RAN Intelligent Controller (RIC) so
third parties can write apps that tune the network. It's the same promise,
and it's running into some of the same walls.

We spent more than a decade in data center SDN before turning to 5G, so we
have watched one industry go through this already. This post compares the two
journeys: what each set out to do, where each got stuck, and what the
eventual success in data center networking does and doesn't tell us about
where wireless should go next.

## Same goal, different decade

OpenFlow and O-RAN were both reactions to the same problem: a vertically
integrated box whose internals the buyer couldn't see or change. In the data
center it was the switch: ASIC, operating system, and protocols from one
vendor. In wireless it's the base station: radio, baseband, and software
from one vendor.

Both proposed the same cure: define open interfaces between the pieces, and
let an ecosystem grow around them. OpenFlow separated the control plane from
the forwarding plane and defined a protocol between them. O-RAN split the
RAN into a radio unit (RU), distributed unit (DU), and central unit (CU),
defined interfaces between them, and added a RIC with its own interfaces for
third-party applications.

Both changed what buyers believed was possible. Both also standardized
things that turned out to be much harder to make interoperable in practice
than on paper.

## What happened to OpenFlow

OpenFlow's core bet was that a switch could be reduced to a generic
match-action table, programmed by a controller over a standard protocol.

The problem wasn't the protocol. It was the gap between what the
specification allowed and what implementations actually did. Real switching
ASICs have fixed pipelines with many tables of different sizes and
capabilities. OpenFlow 1.0 assumed one flexible table; later versions added
multiple tables, but couldn't make every ASIC look the same. Much of the
spec was optional. Vendors shipped switches that were OpenFlow-conformant but
supported a different subset of matches and actions, had flow tables a
fraction of the size you needed, or quietly sent some rules to a slow
software path. OpenFlow 1.3 became the version everyone used; later versions
added features few switches implemented. Efforts like Table Type Patterns
and Broadcom's OF-DPA tried to describe what a given switch could actually
do, which was an admission that "supports OpenFlow" didn't mean much on its
own.

So for a controller application to work, you had to find the intersection of
what your controller used and what your particular switch got right. That
intersection was often small.

Where OpenFlow did work, one party controlled both ends. Google's B4 WAN used
it successfully, with switches and controllers Google built itself. Open
vSwitch, a software switch, made OpenFlow the basis of network
virtualization. In neither case was there a multi-vendor interoperability
problem to solve.

The hyperscalers ended up getting programmability a different way: BGP in
the data center, running on switches whose software they controlled. That
brings us to SONiC. But first, O-RAN.

## O-RAN's report card

### Open fronthaul: real success, real growing pains

The O-RAN open fronthaul (OFH) interface between the DU and the radio unit,
the 7.2x split, is the clearest success of the O-RAN program. Before it, the
link between baseband and radio was a vendor-specific variant of CPRI, and
you bought both ends from the same vendor. Today there's a genuine market of
O-RUs from many suppliers, and open-source DUs can drive them. That's a
structural change.

But it isn't plug-and-play yet. OFH leaves a lot of room for choices:
compression schemes, section types and extensions, beamforming methods,
timing windows, synchronization configurations. Two products can each pass
conformance testing and still not work well together, or work but deliver a
fraction of the expected throughput. As a wise colleague in the OCUDU
community puts it, **"conformant is not necessarily performant."**

That is exactly the OpenFlow experience. A switch that implements the spec
correctly but has a 2,000-entry flow table is conformant. An O-RU that
accepts every message correctly but needs hand-tuned timing offsets and one
particular compression mode to reach line rate is conformant, too. Neither
is what you were hoping to buy.

OFH is getting better, through interoperability profiles, plugfests, and
hard-won integration experience. It's improving because the interface is
narrow and the incentive is strong: nobody can sell an O-RU that doesn't
work with the DUs people are actually deploying.

### E2 and the RIC: the OpenFlow of O-RAN

The near-real-time RIC is a great idea. Exposing RAN telemetry and control to
third-party applications is how wireless gets the same innovation curve that
data center networking got from programmability. Traffic steering, slicing,
energy savings, interference management, mobility optimization: there's a
long list of valuable applications that fit comfortably within the RIC's
10-millisecond-to-1-second control loop.

The interface that makes it work, **E2**, is the most unevenly supported
interface in O-RAN, and for the same reason OpenFlow struggled. E2 itself
(E2AP) is a fairly thin transport. The meaning lives in the *service models*:
E2SM-KPM for performance metrics, E2SM-RC for RAN control, and others. Those
service models are where implementations diverge:

- **KPM is fairly widely implemented**, but which metrics a given RAN
  actually reports, and at what granularity, varies.
- **RC is implemented partially**, with each RAN supporting a different
  subset of control styles and actions.
- **Other service models are rare** outside specific vendor and research
  combinations.

So "my RAN supports E2" is a lot like "my switch supports OpenFlow." It tells
you the protocol will connect. It doesn't tell you whether the xApp you want
to run will work. An xApp developer is back to finding the intersection of
what their app needs and what a particular RAN implements, and that
intersection is often small.

The cost of implementing service models properly is a big part of why.
They're defined in ASN.1, versioned independently, and tied to large
specifications. Adding a new metric or control means writing spec-compliant
ASN.1, generating code for it, and mapping it carefully into the RAN's
internals. That's a lot of work for a RAN developer whose users aren't asking
for it yet, and it's a chicken-and-egg problem: there are few xApps because
support is spotty, and support is spotty because there are few xApps.

### The tell: everyone builds around E2

Here's the clearest sign: people who want to do real work with a RAN often
skip E2 entirely. Project after project has added its own interface directly
into the DU: ZeroMQ sockets, WebSocket APIs, shared memory queues, custom gRPC
services. It is simply easier to add the hook you need, in the format you
want, than to define and implement a conformant service model.

Some of this work also targets applications that really do need to run
faster than E2 allows, like per-slot scheduling decisions or processing I/Q
samples and channel estimates that are too large to ship across a network.
Microsoft Research's Janus work (now the open-source jbpf framework) loads
small, verified eBPF "codelets" directly into the RAN's hot path.
Northeastern University's dApps work defines an **E3** interface for
applications that run right next to the DU. These are valuable additions.
But the main reason people go around E2 isn't timing. It's the cost of
conformance.

We've seen this before, too. In the SDN era, operators who wanted
programmability without OpenFlow's pain used NETCONF, OVSDB, BGP with custom
route injection, or simply ran their own agents on the switch. The demand
for a programmable network was real. It just found a different path.

## Why SONiC succeeded where OpenFlow didn't

OpenFlow didn't deliver an open data center network. **SONiC** did, along with
the hardware ecosystem around it. Microsoft built SONiC for Azure,
open-sourced it in 2016, and moved it to the Linux Foundation in 2022. It now
runs on switches from many vendors and ASIC families, on millions of ports.
A few choices made the difference.

**It standardized the inside of the box, not the wire.** Instead of a remote
protocol every switch had to speak, SONiC relied on the **Switch Abstraction
Interface (SAI)**, a C API defined at the Open Compute Project that each ASIC
vendor implements once for its chip. The interoperability boundary became a
local driver API, where chip differences are easier to handle.

**It reused protocols that already worked.** SONiC didn't replace BGP with a
controller. It ran BGP (through Quagga, later FRR) on the switch.
Centralized intelligence came in through automation and policy that
configured those protocols, not by replacing them.

**The code came first.** SONiC was a working production system before it was
a community standard. "It runs SONiC" became the practical definition of
interoperability. Features were added when a real operator needed them.

**It had an anchor customer running it in production.** Azure ran SONiC at
scale. That gave vendors a reason to write SAI drivers and gave the code a
level of hardening no lab could.

**Its components share a common state store.** Inside SONiC, every component,
from the BGP daemon to the process that programs the ASIC, communicates
through a set of Redis databases: configuration, application state,
ASIC state, and operational state. Components don't call each other; they
write the state they own and subscribe to the state they need. Adding a new
feature means adding a container that reads and writes those tables. This is
the officially sanctioned version of the "hack your own interface" that
people are doing to the DU today.

**ONIE separated buying hardware from choosing software.** The Open Network
Install Environment, contributed by Cumulus Networks to OCP, gave bare-metal
switches a standard way to boot and install a network operating system.

The result is that today you can buy a white-box switch, install SONiC, run
real routing protocols on it, and add your own software alongside them.
That's what OpenFlow promised. It just arrived by a different route.

## Where the analogy holds, and where it breaks

It's tempting to map SONiC's pieces one-to-one onto wireless. Some of them
map well. Some don't, and the places where they don't are the most
interesting part.

### OCUDU is in SONiC's position

The strongest parallel is the software. **OCUDU** is an open CU/DU stack with
government backing, hosted at the Linux Foundation, with operators,
chipmakers, and equipment vendors as members. If it becomes the stack that
real deployments run, "it runs OCUDU" can become the practical definition of
interoperability, the way "it runs SONiC" did. That's the code-first path,
and it's the one that worked.

### There's no single SAI, because the PHY is too big

SAI worked because a switching ASIC is a well-bounded thing. It does packet
forwarding at line rate, in fixed-function hardware, and the operating system
programs it through tables. The boundary between "commodity silicon" and
"software" is obvious.

The RAN's physical layer is a different animal. It's the bulk of the compute,
it's algorithmically rich, and the quality of the receiver is where a lot of
real differentiation lives. And OCUDU implements the PHY itself, in software,
with accelerators where they help. So the obvious candidate for "the SAI of
wireless," the Small Cell Forum's FAPI interface between the PHY and the
layer above it, doesn't fit. FAPI is the right boundary for merchant-PHY
silicon that ships a complete PHY, but in an OCUDU deployment the PHY is
part of the open stack, not under it.

If the PHY is in software, where is the hardware boundary? There are really
three:

- **Lookaside accelerators** for functions like LDPC decoding, reached through
  driver frameworks like DPDK's bbdev and the O-RAN acceleration abstraction
  layer. This looks less like SAI and more like the driver model of a
  software router running on servers.
- **The fronthaul to the radio unit.** With the 7.2x split, the RU does the
  low PHY (FFT, beamforming, digital front end), and the DU programs it every
  slot through control-plane messages. With split 8, the RU is essentially
  converters and RF, and the DU does everything else.
- **The compute platform itself**: CPUs, GPUs, and the timing hardware that
  keeps it all synchronized.

Of these, the radio unit is the closest thing to a switching ASIC: fixed
function, line rate, built on vendor silicon. That makes the RU interface the
truest analogue of SAI. In fact, OCUDU already has an internal radio-unit
abstraction with two kinds of backends: open fronthaul for 7.2x O-RUs, and
SDR drivers for split-8 radios. That internal abstraction is arguably the
SAI of the open RAN, with 7.2x and split 8 as its "drivers."

But the analogy breaks in an important way. SAI is a local API whose driver
is written by the silicon vendor. The 7.2x boundary is a wire protocol with
tight timing, and on the other side is RU firmware the operator can't see or
change. That's why "conformant is not performant" bites so hard: you can't
fix or even inspect the other half.

### The biggest gap: there's no open RU

Data center networking succeeded with white-box switches because a merchant
silicon vendor shipped the ASIC, the SDK, and the SAI driver, and a
white-box vendor built the board around it. Anyone could then run SONiC.

Radio units don't have that yet. Take an RU built on the NXP LA12xx platform.
NXP provides the programmable baseband silicon and a low-level SDK, not a
complete PHY with a standard interface on top, open or closed. Building the
low PHY, the RU side of the 7.2x protocol, the management plane, and the
timing integration is left to the RU maker. We're not picking on NXP; this
is the state of the layer across the industry. The "driver" for an RU isn't a
thin shim. It's an entire low-PHY implementation.

So wireless today has merchant silicon for radios, but no merchant RU stack
and no open RU. Every O-RU is a closed box at the bottom of an otherwise
increasingly open system. That's a bigger gap than anything at the top of the
stack, and we think it's where some of the most important work is.

### Is E3 the state bus?

The other missing piece is SONiC's shared state store. The open DU has no
equivalent, which is why every project invents its own hook.

The leading candidate is **E3**, and it's moving fast. The O-RAN Alliance
published E3 in a research report (not yet a specification), authored by
Northeastern, SoftBank, and NVIDIA. DeepSig, one of OCUDU's leads, has
released a preview of a dApp platform for OCUDU with its own E3: an in-process
C interface that runs in microseconds, plus an E3 management protocol and a
data profile for streaming telemetry like PUSCH and SRS data.

It's still early, and it's a real step forward. But is it a SONiC-style
state bus? Not yet, and maybe not by design. A few observations:

- **It's an application interface, not an internal integration fabric.**
  SONiC's databases are how SONiC's own components talk to each other. E3 is
  how outside applications talk to the DU. DeepSig's design is explicit that
  dApps don't call each other. The model is subscribe, indicate, and control,
  the same as E2.
- **It inherits E2's machinery.** The management protocol uses ASN.1 over
  SCTP and follows E2's setup, subscription, and indication structure. That
  makes bridging to E2 easy, but it brings along some of the same
  implementation weight.
- **There are already two E3s.** By DeepSig's own description, its E3 is not a
  ratified O-RAN interface, and its wire format isn't byte-compatible with
  the libe3 implementation from the research-report lineage. That's
  understandable for a preview, but it's exactly how fragmentation starts.
- **It lives in the reference implementation.** This is the big difference
  from E2. If the dominant open DU ships E3, with versioned schemas and a
  frozen ABI, then the service model gap may never open in the first place,
  because there's one implementation everyone uses.

So E3 could go either way. If it becomes "the interface OCUDU ships," with
one implementation and a well-defined state model behind it, it gets the
code-first advantage SONiC had. If it becomes a family of compatible-in-spirit
protocols implemented differently by each RAN, it will have E2's problem at
a faster timescale.

## What we expect

Here's what we expect over the next several years.

- **E2 will survive, in a narrower role.** It will be used for telemetry and
  slower policy, with KPM as the most widely used piece, much as OpenFlow
  survives in software switches and specific deployments. It will matter most
  where one vendor controls both the RAN and the RIC.
- **Real programmability will move toward the open DU itself.** Extension
  points inside the open stack, like codelets and dApps, will become the main
  way to add intelligence, because it's easier to build on one implementation
  than to wait for many to converge on a spec.
- **The open stack will become the reference.** Interop results, test
  harnesses, and deployment experience built around OCUDU will matter more
  than paper conformance.
- **Open fronthaul will keep maturing** through profiles and testing, and
  will become boring, which is the best thing that can happen to an
  interface.
- **The RU will remain the hardest part to open,** until someone treats the
  low PHY and RU software as a product category in its own right.

## What we should push for

**Code-first interfaces.** An interface should be validated by a working open
implementation, with tests, before it's finalized. A service model that
doesn't exist in the open stack isn't ready.

**One state model for the open DU.** Rather than each application interface
mapping separately into RAN internals, the DU should have one well-defined,
versioned model of its own state and controls, the way SONiC has its
databases. E2 and E3 can then be views onto that model, and much of each
service model could be generated rather than hand-written. That would make
conformant implementations far cheaper, and it would make E3 much less likely
to repeat E2's story.

**Safe extension inside the node.** Code running in the hot path of critical
infrastructure must not be able to crash it or leak data from it. Sandboxing
and verification should be built in from the start, and the interfaces
need authentication before they leave localhost. This is where formal methods
earn their keep.

**An open RU.** Open low-PHY software and open RU-side fronthaul and
management, on open FPGA and SDR platforms as well as merchant baseband
silicon. Split 8 radios are a practical starting point, because the boundary
is simple and the low PHY can run in the open stack. Until there's an open
RU, the bottom of the open RAN is still a closed box.

**Performance, not just conformance.** Plugfests and certification for open
fronthaul should publish performance results (throughput, latency, timing
margins) alongside pass/fail, using open test harnesses anyone can
reproduce. "Conformant and performant" should be the bar.

**Anchor deployments in production.** SONiC succeeded because Azure ran it.
Open RAN needs real networks, with real users, running the open stack.
Government programs are in a unique position to provide that, and to require
openness all the way down as a condition.

## The lesson

OpenFlow wasn't wrong about the goal. It was wrong to trust a specification to
deliver interoperability that only working code and real deployments could.
Data center networking got there in the end by standardizing the inside of
the box, reusing what worked, and letting an open implementation become the
standard.

Wireless won't follow that path exactly. The PHY is bigger than a switching
ASIC, and the radio unit is still closed. But O-RAN has already done the
hardest part: it convinced an industry that the RAN should be open. Open
fronthaul shows it can work. With OCUDU, wireless now has its SONiC
candidate. What it needs next is an internal state model to build on, and an
open radio at the bottom of the stack. We'd like to help build both.
