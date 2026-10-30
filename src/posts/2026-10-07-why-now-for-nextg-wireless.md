---
topic: wireless
title: "Why Now: Open Source, AI, and Open Hardware Meet NextG Wireless"
date: 2026-10-07
series: "Building NextG Systems"
excerpt: >-
  Wireless is about to go through the same transformation data center
  networking went through a decade ago. We saw it coming, and we're building
  for it.
---

*This is the first post in a series about what we're building at NextG
Systems and why. Future posts will go deeper on the technical pieces.*

## Who we are

NextG Systems LLC builds open, programmable, and secure NextG wireless
systems. Our focus is mission-critical communications — defense, emergency
services, and other settings where a network has to be trustworthy, not just
fast.

We come to wireless from an unusual direction. Our team spent more than a
decade working on software-defined networking (SDN) in the data center and
the cloud. Over the last several years we've turned that experience toward
5G: standing up private 5G testbeds with commercial radio units, running the
major open-source cores (Open5GS, free5GC, SD-Core), building RAN
intelligent controller applications, and working deeply with the srsRAN
codebase and its successor, OCUDU. We also work closely with academic
collaborators, including the wireless research group at Princeton
University.

## We've seen this movie before

When we started in data center networking, the network was a set of sealed
boxes. Switches and routers came from a handful of large vendors, bundled
hardware with software, and exposed whatever management interfaces the vendor
chose to support. If you wanted a new feature, you filed a request and waited
for the next release.

Over roughly a decade, that changed completely:

- **The control plane was separated from the data plane**, so the logic that
  decides where traffic goes could run as ordinary software on ordinary
  servers.
- **Open protocols** replaced proprietary ones at the boundaries between
  components.
- **Merchant silicon** made high-performance switching ASICs available to
  anyone, so hardware stopped being a moat.
- **Open network operating systems** let operators run their own software on
  the switch itself.
- **Model-driven configuration** (OpenConfig, gNMI, and friends) replaced
  screen-scraping CLIs with structured, programmable interfaces.

The result was not just cheaper networks. It was networks that operators
could reason about, automate, test, and change on their own schedule. The
large cloud providers built their businesses on this.

## The same pattern is arriving in wireless

More than four years ago, the emergence of **O-RAN** made us think wireless
was next. O-RAN defined open interfaces between pieces of the radio access
network that had always been sold as one integrated product. That is the
same move as separating the control and data planes: once the boundaries are
open, each piece can be built, replaced, and improved independently.

Open-source software already existed. [OpenAirInterface](https://openairinterface.org/)
and [srsRAN](https://www.srsran.com/) offered full RAN stacks, and several
open-source 5G cores were maturing. But software alone doesn't make an
ecosystem, and for a few years momentum built slowly. Running these stacks
was a research exercise, not a deployment option.

We started building on srsRAN anyway, because we believed the direction was
right. That bet has paid off.

## OCUDU changes the game

In 2025 the U.S. Department of Defense's FutureG office selected SRS and
DeepSig to lead **OCUDU** — Open RAN Centralized Unit and Distributed Unit —
an open-source 5G/6G RAN initiative built on the srsRAN lineage. OCUDU now
lives at the Linux Foundation, with an ecosystem foundation whose members
include operators, chipmakers, and equipment vendors. In May 2026,
[Qualcomm joined as a Premier Member](https://www.linuxfoundation.org/press/qualcomm-ocudu-ecosystem-foundations-premier-membership-to-accelerate-open-source-software-for-open-ran-infrastructure),
alongside companies like AMD, AT&T, Ericsson, Nokia, NVIDIA, Samsung, and
Verizon.

This is what was missing. Sustained government backing provides a long-term
anchor customer and a reason for the community to invest. Vendor
participation means the open stack will run on real hardware and be tested
against real requirements. For the first time, an open-source RAN looks less
like a lab tool and more like the foundation of a product category.

## Merchant silicon, with a RISC-V accent

The data center story needed merchant silicon, and so does wireless. That is
starting to happen, in fits and starts. Companies like
[Picocom](https://www.picocom.com/), [EdgeQ](https://edgeq.io/), and
LeapFrog Semiconductor are building baseband and signal-processing silicon
for 5G infrastructure that isn't locked to a single equipment vendor.

What stands out to us is that these designs share a common thread: **RISC-V**.
An open instruction set at the heart of the baseband means the openness can
extend all the way down — not just to the software interfaces, but to the
processor architecture itself. Combined with open FPGA and SDR platforms, it
is becoming possible to build and inspect the whole stack.

## Thinking about the whole system

Open components are necessary but not sufficient. Data center SDN succeeded
because operators could manage the network as one coherent system. The
Open Networking Foundation's
[Aether](https://opennetworking.org/news-and-events/blog/onfs-aether-project-moving-to-lf/)
project (now hosted at the Linux Foundation) was an early and important glimpse of what that looks like for 5G:
an integrated management environment spanning the RAN, the core, and edge
compute, with multi-tenancy built in. It showed us what a private 5G network
could feel like if it were designed by people who had built cloud
infrastructure.

## Why AI makes this urgent

The final ingredient is AI, and it cuts both ways.

On one side, AI makes open, programmable networks dramatically more
valuable. AI-native signal processing, intelligent RAN control, and
automated operations all depend on being able to get inside the stack —
something closed systems don't allow.

On the other side, AI raises the stakes on security. As agentic AI makes
attacks faster and cheaper, some defenses will have to be just as
responsive. But for critical infrastructure, the stronger answer is to
eliminate whole classes of vulnerabilities before they can be exploited.
That requires systems you can inspect and, increasingly, verify. Open source
and open hardware make that possible; closed boxes don't.

## There's still a long way to go

We want to be honest: NextG wireless is not where data center SDN is today.
Interoperability is still hard. Operations tooling is immature. Performance
and reliability of open stacks still lag the best integrated systems in many
settings. Silicon options are few. Security assurance for these systems is
largely unaddressed.

That gap is the opportunity. We've watched one industry make this journey,
and we think we know some of the shortcuts and some of the potholes. NextG
Systems exists to help wireless make the same journey, with security and
mission-critical reliability built in from the start.

In the coming posts we'll go into specifics: what we've learned running
open-source 5G testbeds, where we think formal methods fit in the RAN and
core, and what a truly programmable private 5G network should look like.

We're on that journey. Come along.
