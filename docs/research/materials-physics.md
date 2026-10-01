# 赛博拼豆 — Fuse-bead materials, geometry, melt physics, tools and palette

Research date 2026-10-01. Companion files in this folder:

- `palette-mard.json` — 295 MARD entries (221 base + 70 specials + 4 new glow), array of `{code, series, group, tier, hex, finish, conf, alt?, states?, note?}`.
- `palette-other-brands.json` — Perler (103), Hama Midi (92), Artkal S (199), Artkal C official (197), Artkal M official (221).

## 0. How to read this document

Every number carries a provenance tag. Do not trust an untagged number.

| Tag | Meaning |
|---|---|
| **[O]** | Official manufacturer / vendor page (Perler, Hama, Artkal, pixel-beads.com MARD chart) |
| **[R]** | Reference work (Wikipedia, textbook polymer data) |
| **[W]** | Secondary web source: tutorials, retail listings, Chinese content sites. Used only where several sources agree, or flagged "single source" |
| **[D]** | Derived by me from tagged numbers (formula given) |
| **[E]** | Engineering estimate. No source found. Treat as a tunable default |

### Ten things that matter most

1. **Do not hard-code 5 mm.** MARD (the Chinese market-leading brand and the palette you asked for) sells only **2.6 mm minis** [W: kandiverse.com, bitbead.pomodiary.com], while Western Perler / Hama / Artkal S are 5 mm "midi" (5 mm beads are also sold and used in China). Build the sim around a `scale` parameter (midi 5.0 mm pitch, mini 2.6 mm pitch).
2. **Official 5 mm bead sizes disagree slightly.** Perler states "5.07 mm high × 4.77 mm wide" [O]. Hama states 5 mm × 5 mm with a 2 mm bore [O]. Hama's own lab note says 1 kg ≈ 17,000 beads [O], i.e. 0.059 g/bead, which implies a bore of about 2.6 mm [D]. Use outer Ø 4.8 / inner Ø 2.5 / height 5.0 mm.
3. **Pitch is 5.0 mm.** Perler 29-peg board = 5.7 in = 144.8 mm [O] → 4.993 mm per peg [D]. MARD-class mini boards: 2.6 mm pitch (52 pegs = 135.2 mm) [W].
4. **Beads are a short extruded polyethylene (PE, sometimes PE/EVA) tube** cut by a spinning blade [W]. They fuse at the *contact surfaces* first; the beads do not melt as a whole [W: pindoule.com]. Holes close last.
5. **Official ironing recipe** (Perler): medium household iron, circular motion, **do not press**, 10–20 s per side, stop while the holes are still open, flip, repeat [O]. Hama: "cotton" dial, stop when the bead colours show clearly through the paper, cool under a book [O].
6. **The finished slab is thin.** Volume conservation gives about 2.6 mm for a fully closed midi slab and about 1.6 mm for mini [D]. Half-closed holes ≈ 2.9 mm.
7. **Flattening goes top-down.** Heat enters through the bead tops, so the iron side flattens first and the board side stays bumpy until you flip the piece [W + D].
8. **Cooling warps pieces** unless pressed flat while still soft. Weights and a cold slab (marble, tile, glass) fix it [W].
9. **MARD palette**: 221 base colours (series A–H, M) + 70 specials (P pearl, R jelly, Q thermochromic, T glitter/translucent-white, Y glow, ZG photochromic) = 291; a 2026 card adds 4 glow colours = 295 [O + W]. Public hex tables differ by more than ΔE00 3 on about a third of the base codes (and by more than 6 on about 15 %); I shipped the newest "official-synced" chart as primary with confidence flags and alternates.
10. **Published hex values are design values, not photographs of beads.** Real photographed white beads are about `#E5ECF1`–`#EAEFEE` and black about `#141315`–`#323234` (Hama / Perler / Artkal S, community data [W]). Clamp albedo when rendering (section 7).

---

## 1. Bead geometry and material

### 1.1 Dimensions

| Bead | Outer Ø (mm) | Height (mm) | Bore Ø (mm) | Mass / bead | Source |
|---|---|---|---|---|---|
| Perler "classic" midi | **4.77** (width) | **5.07** | not stated | not stated | [O] perler.com 1,000-bead page: "Actual bead size is 5.07mm high x 4.77mm wide" |
| Hama Original (Midi) | 5.0 | 5.0 | **2.0** nominal | **0.0588 g** (1 kg ≈ 17,000 beads) | [O] hamabeads.com/hama-beads-sizes; [O] hama.dk/en/pages/instructions-1 (lab test note) |
| Hama Mini | 2.0 | 2.0 | 1.0 | not stated | [O] hamabeads.com/hama-beads-sizes (many retailers say 2.5 mm; Wikipedia says 2 mm) |
| Hama Maxi ("My First Hama") | 10 | 10 | 5.0 | ≈0.55 g [D] | [O] hamabeads.com |
| Perler Mini, Artkal C/M/A, MARD | 2.6 | ≈2.6 [E] | ≈1.3 [D] | **≈0.010 g** (10 g per 1,000; "1 g ≈ 100 beads") | [W] pindou.online/shop (MARD 221 set, "~1000 beads (10g) per bag"); [W] fusingfunbeads.com packing note |
| Perler Biggie | ≈10 | ≈10 | ≈5 [E] | n/a | [W] Beadify; board 5.875 in [O] |
| Artkal S (5 mm) | 5 | 5 | n/a | n/a | [W] Artkal listings ("Round 5mm PE Midi Beads") |

Derived checks [D] (density 0.93 g/cm³, V = π/4 (D² − d²) H):

| Assumption | Volume | Mass | Beads per kg |
|---|---|---|---|
| D 4.77, d 2.5, H 5.07 (Perler outer, guessed bore) | 65.7 mm³ | 0.0611 g | 16,360 |
| D 5.0, d 2.0, H 5.0 (Hama nominal) | 82.5 mm³ | 0.0767 g | 13,040 |
| D 4.8, d 2.5, H 5.0 (**recommended**) | 65.9 mm³ | 0.0613 g | 16,300 |
| Bore needed to hit Hama's 17,000/kg with D 4.8, H 5.0 | | | **d ≈ 2.6 mm** |
| Mini D 2.6, d 1.3, H 2.6 | 10.4 mm³ | 0.0096 g | matches 10 g/1000 |

Conclusion: Hama's "2 mm inside diameter" is a nominal figure. A bore of about 2.5 mm (wall ≈ 1.15 mm) is consistent with both the mass data and Perler's outer size. For mini beads the bore is about half the outer diameter (Hama Mini: 1 mm bore in a 2 mm bead [O]; 10 g per 1,000 beads gives ≈ 1.2 mm for a 2.6 mm bead [D]). Bead-pen needles come in 1.0 / 1.1 / 1.2 mm [W: Taobao 豆针 listings], which fits a ≈ 1.3 mm mini bore [E].

### 1.2 Shape details

- **Hollow cylinder, slightly taller than wide** (Perler 5.07 / 4.77 = 1.063) [O]. Chinese tutorials say each bead has a "taller" and a "shorter" end face, and recommend placing the taller face up so the iron touches it first [W: pindoumao.com/tutorial/5, single source]. Model as a small end-to-end asymmetry [E].
- **Manufacturing**: pellets + pigment + release additives are melted at about 200 °C, extruded through a round die as a continuous tube, cooled in a water bath, cut into 5 mm pieces by a spinning blade, then screened for size [W: perlerbeadai.com/faq/how-are-perler-beads-made]. Consequences:
  - Outer wall and bore are smooth (die-formed). Cut ends are flat, blade-cut.
  - Length varies bead to bead ("tiny size differences are normal" [W]).
  - Cheap beads have **burrs (毛刺) and "high-low" beads (高低豆)** that cause uneven fusing [W: smzdm.com/p/aww78lo4; pixelbeads.io QA].
- **Edge profile**: no source gives a chamfer. Use a 0.10 mm edge softening for rendering [E]. No ribs or flats are reported anywhere (smooth cylinder).
- **Tolerances** [E]: premium ±0.08 mm outer Ø, ±0.12 mm height; cheap lots ×2–3 (plus burr). Perler's own two numbers (5.07 vs 4.77) show that height and width are not equal, so never model beads as perfect cubes in plan.

### 1.3 Polymer and thermal range

| Material | Facts | Source |
|---|---|---|
| Polyethylene (PE) | Density 0.88–0.96 g/cm³. Melting point overall 115–135 °C; average commercial LDPE 105–115 °C; MDPE/HDPE 120–130 °C. LDPE crystallinity ≈ 35 %, HDPE up to 80 %. Colourless-to-milky depending on crystallite size: LDPE more transparent. | [R] en.wikipedia.org/wiki/Polyethylene |
| EVA (ethylene-vinyl acetate) | Melting point ≈ 90 °C; vinyl-acetate 1–40 %, hot-melt adhesives ≈ 11 %; rubber-like; **vinegar-like odour**. | [R] en.wikipedia.org/wiki/Ethylene-vinyl_acetate |
| Perler / Hama / Artkal | All described as polyethylene ("low-density"), formula differs by brand; softer generic blends melt faster and close holes sooner. Perler fuses fastest, Artkal slower, Hama between. | [W] perlerbeadai.com; kandiverse.com |
| Chinese "hard bead" vs "soft / fusion bead" | Hard (常规豆, MARD): iron 160–180 °C, 30–60 s/side, glossy, slides freely. Soft (EVA / modified PE, Artkal-type): 120–140 °C, 20–40 s/side, frosted, clings by static. Artkal lines A and R are soft; S, C, M are hard. | [W] pindoupic.com (single blog); beadary.com/compare/artkal-series |
| PE vs EVA look | PE: "brighter, clearer"; EVA: "matte, colours half a tone greyer". | [W] Baidu Wenku summary (single source) |
| Water-fuse beads (PVA / Aqua Dots / Bindeez) | Spherical, fused by water spray, not heat. Not a pegboard bead. | [R] Wikipedia "Fuse beads" |

Working model [E]: bead polymer softens from ≈ 95 °C, welds at contact from ≈ 105–115 °C, flows from ≈ 120–135 °C; iron dial settings of 130–150 °C reach those temperatures at the bead top through the paper. Melting behaviour depends on pigment: Perler states "some colors may fuse more quickly than others" [O].

### 1.4 Surface finish, translucency, batch variation

- **Finish**: satin to matte before ironing; the iron-side finish is then dominated by the paper or cloth (section 3.6). Hama is described as "slightly rounder, more matte" and Perler "flatter" [W: kandiverse, single source]. PBR default for raw beads: roughness 0.5, dielectric F0 0.04 [E].
- **Opaque colours**: the product lines "translucent" and "clear" are sold separately, so ordinary colours are pigment-loaded and opaque in bulk. Light-coloured beads show some edge glow because walls are only ≈ 1.15 mm [E]. Under-ironed holes "still let light through" [W: pixelbeads.io QA].
- **Translucent / jelly**: stained-glass effect; "let light pass through" [W: pixel-pattern.com colour guide]. MARD R series is "a translucent finish" [O: pixel-beads.com].
- **Colour after melting**: "some shades look lighter or darker after melting"; cheap beads fade or darken [W: pixel-pattern.com]. Details in 3.4.
- **Batch variation**: different batches have different melting points, so mixing batches gives uneven fusion [W: toutiao.com/article/7684653678250230326]; mixing brands in one colour block gives "uneven surface height" [W: pindoule.com]; sun-aged beads behave differently [W: perlerbeadai.com]. For rendering: per-bead random colour offset ΔE00 ≈ 1–2 and per-bead length jitter [E].

---

## 2. Pegboards

### 2.1 Dimensions

| Board | Pegs | Size | Source |
|---|---|---|---|
| Perler Large Clear Square (midi) | 29 × 29 (841) | **5.7 in = 144.8 mm**; 4 snapped together **11.375 in = 288.9 mm** | [O] perler.com/products/large-clear-square-pegboards-4-ct |
| Perler pitch derived | | 144.8 / 29 = **4.993 mm**; 288.9 / 58 = 4.981 mm | [D] |
| Hama Large Square (midi) | 29 × 29 (841) | **15 cm × 15 cm**, interlocking (also with Hama hexagon boards); retail listing says 14.5 cm | [O] hamabeads.com interlocking-large-square; [W] kids-world.com |
| Hama Small Square | 196 (14 × 14) | n/a | [O] hamabeads.com |
| Hama Medium Round | 397 | n/a | [O] hama.dk |
| Perler Biggie boards (10 mm) | ≈ 15 × 15 [D] | 5.875 in = 149.2 mm | [O] perler.com |
| Perler Super-Sized Clear | ≈ 53 × 71 [D] | 10.5 × 14 in = 266.7 × 355.6 mm | [O] perler.com |
| Artkal BCP01 (mini, clear, "triangle connection") | **50 × 50** | 14.5 × 14.5 cm | [W] millroadcrafts.nl |
| Chinese mini boards (MARD class) | **52 × 52** standard; 78 × 78, 104 × 104 also sold | 52 × 2.6 = 135.2 mm of pegs (≈ 14 × 14 cm overall); 104 pegs ≈ 27 cm | [W] bean.gojolab.cn ("52x52 = 135.2 mm", "104x104 ≈ 27 cm"); JD / 1688 listings |

Pitch: midi 5.0 mm [O]; mini 2.6 mm nominal, boards quoted as 2.6–2.7 mm [W: Baidu Wenku snippets]. The Artkal BCP01 figure (145 mm / 50 = 2.9 mm) includes a margin.

Standard-size remark: Perler, Hama, Artkal and generic midi boards all converge on 29 × 29 and are cross-compatible; the boards are not compatible between sizes (midi vs mini vs maxi) [W + O].

### 2.2 Peg and plate geometry (mostly estimated)

Official sources give no peg dimensions. What is known: pegs are **conical (tapered)** [W: thingiverse thing:2313172 "conical pegs"]; for mini beads there are **long-peg (长钉) boards** that hold beads better and "tall-peg boards" exist for shaky hands and 3D builds [W: pixelbeads.io, Chinese Taobao encyclopedia titles]. Some tutorials say beads must be "tapped so they sit fully in the peg cups" [W: pixelbeads.io; single source].

Recommended geometry (all [E], consistent with a 2.5 mm bore and 5.07 mm bead height):

| Parameter | Midi | Mini |
|---|---|---|
| Peg base Ø | 2.3 mm | 1.15 mm |
| Peg tip Ø | 1.9 mm | 0.95 mm |
| Peg height above plate | 3.6 mm (bead 5.0 mm tall: the peg tip sits ≈ 1.4 mm below the bead rim; the top of the bore is visibly open) | 1.8 mm standard; ≈ 2.3 mm on "long peg" boards |
| Plate thickness | 2.2 mm | 1.6–2.2 mm |
| Bead–peg radial clearance | 0.1 mm at base, up to ≈ 0.3 mm at the tip → loose fit, bead can tilt a few degrees | |

### 2.3 Material, tint, edges, connectors

- **Clear boards** (Perler, Hama, Artkal): transparent rigid plastic so you can lay a pattern underneath [O: perler.com "lay it right over a pattern"]. Exact polymer is not stated on the retrieved vendor pages (likely PS / SAN-type) [E].
- **Heat-resistant Chinese boards**: ABS (Amazon listing for 52 × 52 board) or "ABS + PP blend" with seller-claimed heat-deflection ≈ 145 °C [W, seller claim]. Typical colours: white ("大白板", smooth), clear, coloured with printed lines.
- **Board softening is the limiting factor**: pegs soften if the iron rests more than about 5 s on one spot [W: mypindou.com/guides/ironing]; Hama warns not to touch the pegboard with the iron because it damages pegs [O: hama.dk]; Hama states boards "will not warp if the instructions are followed" [O].
- **Edges and connectors**: boards interlock with edge tabs ("公母扣" male/female [W]), Artkal uses triangular tabs [W], Hama interlocks with hexagon boards [O]. Perler's 4-board assembly (288.9 mm) is 2 × 144.8 mm minus 0.64 mm [D], so each interlocking seam overlaps by about 0.64 mm.
- **Grid lines**: "lined / graduated pegboards" with printed or engraved grid lines exist ("棋盘格长钉", "104钉带刻线", "彩色画线") [W: pixelbeads.io; 1688 titles]. One creator recommends avoiding smooth big white boards and drawing grid lines on the pegs with a pen if you already own one [W: smzdm.com/p/aww78lo4].
- **Shapes**: square (workhorse, tiles), circle, hexagon, heart, star, plus themed shapes [O: perler.com collections; hama.dk]. Chinese shops also sell 15 × 15 small squares, round and hexagon boards [W].

### 2.4 How a bead behaves on a peg

- **Fit**: clearance fit, not a snap. Beads slide on freely and sit on the plate. There is no sourced "click"; the audible/tactile cue is the bead bottom hitting the plate (short plastic tick) [E].
- **Wobble**: because the bore (≈ 2.5 mm) is larger than the peg tip (≈ 1.9 mm), a bead can tilt by roughly 5° (4–6° depending on how far it is shifted sideways at the base) before the bore wall touches the peg [D from E geometry]. Tapping the board edge with a tweezer handle seats beads [W: pixelbeads.io].
- **Falling off**: beads "fall off the pegboard before they are ironed" is explicitly acknowledged by Hama, who sell an adhesive sheet (Bead-Tac) for this [O: hama.dk]. Never carry a full loose board; tilt beyond roughly 45–60° or a bump sheds beads, much sooner on short-peg boards [E]. Static or humidity can make beads cling to the board or plastic [W: TikTok snippet, weak].
- **Transfer methods**: masking-tape lift (flip a board of beads onto tape, iron the reverse; mirror the pattern), see 3.9 [W].

---

## 3. The melt

### 3.1 Parameter summary (what sources say)

| Item | Value | Source |
|---|---|---|
| Iron setting, 5 mm | "medium", wool/cotton dial, steam off. 130–150 °C [W: pindoule.com, toonbead.com]; 150–180 °C [W: mypindou.com, beads.studio]; 110–130 °C [W: toutiao]. Hama: Midi = cotton ●●, Mini = wool ●●, Maxi = linen ●●● | [O] hama.dk; [W] others |
| Iron setting, 2.6 mm mini | one notch lower: 100–115 °C [W: toutiao]; "再低一档" [W: mypindou] | [W] |
| Time per side, 5 mm | **10–20 s** (Perler official). Small piece 10–15 s, 14–20 grid 15–25 s, 29 × 29 25–40 s [W: duopindou.online]. Per 29 × 29 board 60–90 s in several passes [W: toonbead] | [O] perler.com; [W] |
| Time per side, mini | 5–10 s per pass, total 40–90 s [W: toutiao] | [W] |
| Back side | about half the front time (15–20 s less) [W: duopindou, toonbead] | [W] |
| Heat press (烫画机) | 150 °C, 2 × 45 s, rotate each 45 s, on a tile [W: smzdm.com/p/aww78lo4] | [W] single source |
| Iron motion / pressure | Circular, never stationary; **do not press**, the iron's weight is enough | [O] perler, hama |
| Steam | Off. Steam wets paper, wrinkles it, makes beads jump, leaves white blisters/haze | [W] many |
| Cooling | Under a flat weight 2–5 min [W: mypindou, pindoule, toonbead]; 5–10 min [W: duopindou] | [W] |
| Brand speed | Perler 10–15 s, Hama middle, Artkal 15–25 s [W: kandiverse]. "Some colours fuse more quickly than others" | [O] perler |
| Dial caveat | A "medium" dial can be 120 °C or 160 °C depending on the iron; calibrate on 5–10 scrap beads | [W: mypindou] |
| Iron types | Household flat iron; mini constant-temp "拼豆熨斗" 35–60 W (slow, 3–10 min heat-up) or 300–500 W adjustable (M-001: 400 W, 15 s preheat); hair straightener / heat gun / oven are workarounds | [W] listings |

### 3.2 Stage model

Model the melt as a scalar "heat dose" `u` accumulated per bead from contact time, iron temperature and pressure. `u = 1` means the front face has just closed. Times assume a 5 mm bead, a 140 °C dial, light pressure and continuous contact; scatter between sources is about ×2, so expose iron power and time scale as parameters. Mini beads reach each stage in about half the time [W]. Soft EVA-type beads at about ×0.7 time [W].

| # | Stage | u | t, midi (s) [E] | t, mini (s) [E] | Bore Ø (mm) [D/E] | Thickness (mm) [D/E] | What it looks like |
|---|---|---|---|---|---|---|---|
| 0 | Loose on pegs | 0 | 0 | 0 | 2.5 | 5.0 | Round tubes, ≈ 0.2 mm gaps between neighbours; round beads cover only ≈ 53 % of each 5 × 5 mm cell [D]. Satin sheen. |
| 1 | Warming | 0–0.10 | 0–3 | 0–1.5 | 2.5 | 5.0 → 4.9 | Bead tops soften. Through the paper the bead colours become **more clearly visible** (this is Hama's stop cue for a light fuse [O]). No bonding yet. |
| 2 | Touching / slightly stuck | 0.10–0.25 | 3–7 | 1.5–3.5 | 2.5 | 4.9 → 4.5 | Rims bulge and touch; thin welded necks (≈ 0.2–0.6 mm). Lifting the paper drags beads along; the mat tears easily. |
| 3 | Edges fused, holes open ("window" look) | 0.25–0.45 | 7–13 | 3.5–6 | 2.5 → 2.2 | 4.5 → 3.9 | Neighbours fully welded along their contact lines; cell corners fill; surface still bumpy. **Light fusion**: flexible, "holes clearly visible", 10–15 s [W: shoudihand.com]. Under-ironed pieces still "let light through the holes" [W]. |
| 4 | Holes shrinking (**target**) | 0.45–0.75 | 13–21 | 6–10 | 2.2 → 1.3 | 3.9 → 3.2 | Beads become rounded squares; seams shallow grooves; holes at ≈ half their original size. **Medium fusion**, the most recommended stage [W: shoudihand, toonbead, pindoule all say to stop when the holes have narrowed to about half]. Perler's official 10–20 s/side lands here. |
| 5 | Pinholes | 0.75–1.0 | 21–28 | 10–14 | 1.3 → 0 | 3.2 → 2.7 | Seams vanish; dots of holes remain. |
| 6 | Closed flat slab ("闷豆" muffled) | 1.0–1.3 | 28–36 | 14–18 | 0 on the front; peg pits remain on the back | 2.7 → 2.5 | Looks like one plastic sheet; rigid; "full fusion, 30 s+" [W]. Bead texture is gone. Perler warns that closed centres ruin any assembly through the holes [O]. |
| 7 | Over-melted | 1.3–1.7 | 36–48 | 18–24 | 0 | < 2.5, thin | **Glassy gloss, colours deeper/darker, hazy bleeding across colour boundaries (≈ 0.3–0.8 mm), edges flare beyond the pitch, thin and brittle, paper sticks, board pegs soften.** "Irreversible" [W]. |
| 8 | Puddle / burn | > 1.7 | > 48 | > 24 | | | Blisters and bubbles (strongly with steam), yellowing / browning ("发黄: temperature too high" [W]), warped board. |

Notes on the stage model:

- **Top-down heating.** The iron touches the bead tops through paper; the board side stays cooler. So the front face passes stages 3–6 while the back is still stage 1–2. After flipping, the former back (now facing the iron) is ironed for about half the time [W].
- **Holes cannot fully close around the peg while on the board.** The bore below the peg tip is occupied by the peg. After lifting the piece, the back shows peg-shaped pits ("背面的凸点会在豆子底部留下凹陷" [W: pindoule.com]), which second-side ironing flattens. [D]
- **Fusion happens at the interface**, not by melting the whole bead [W: pindoule.com]. Stage 3 is therefore a distinct, stable look, which is why the "window" look exists as a product style.
- **Sources disagree about brittleness.** Fully closed pieces are called "rigid and strongest" in some tutorials and "thin and brittle, easy to crack" in others (over-melted). Treat closed-but-not-thin (u ≈ 1.0–1.2) as strongest and over-melted (u > 1.3) as brittle [E].

### 3.3 Dimensional change (volume conservation)

Bead volume V ≈ 65.9 mm³ [D]. A cell is 25 mm² at 5.0 mm pitch. Fully filling the cell with no hole gives thickness t = V / A:

| Hole area left | Hole Ø (mm) | Slab thickness t = V / (25 − A_hole) |
|---|---|---|
| 100 % | 2.50 | 3.28 (cell filled, hole untouched) |
| 70 % | 2.09 | 3.06 |
| 50 % | 1.77 | 2.92 |
| 25 % | 1.25 | 2.77 |
| 0 % | 0 | **2.64 mm** |

For mini (V ≈ 10.7 mm³, cell 6.76 mm²): closed slab 1.58 mm, half-hole 1.76 mm [D]. So the beads expand sideways until neighbours touch (they only have about 0.2 mm of slack at 4.8 / 5.0), then height drops from 5.0 to about 3 mm; a closed midi slab is about 2.6–2.8 mm, which matches the common "about 1/8 in" impression [E].

Plan size: on the board, piece size stays at pitch × count (29 × 29 = 14.5 cm "once beads melt together" [W: perlerbeadai.com]). After lifting off and cooling, expect a further **≈ 1–1.5 % linear shrink** (thermal contraction of PE over ≈ 75 K: α ≈ 1.2–2.0 × 10⁻⁴ /K → 0.9–1.5 %, i.e. 1.3–2.2 mm over 145 mm) [D, general polymer data]. Over-melted edges can flare 0.1–0.3 mm beyond the peg pitch [E]. A Chinese article claims measured "shrinkage rates" before/after ironing but was not retrievable.

### 3.4 Colour and gloss changes

Reported, with direction only (no sourced magnitudes):

- Single-side fuse keeps the **brightest colours and strongest 3D bead feel**; double-side fusing makes colours **"a shade darker"** and removes hole texture [W: mypindou.com].
- Over-melting: "surface glossy and darker, colours markedly deeper, edges deformed" [W: mypindou]; "colour diffusion / haze ('blurred colours')" [W: pixelbeads.io, pindou.io]; **yellowing when too hot** [W: pindoule.com]; cheap beads "fade or darken" [W: pixel-pattern.com].
- **Translucent beads lose clarity if over-ironed**; glow beads' emissive layer can be damaged; glitter sparkle drops with too much heat. Recommended single-side, 5–10 s per pass [W: mypindou; pixel-pattern.com].
- With a steam iron, "white haze and blisters" [W].
- Physical reasoning [E]: as bore shadows disappear and the surface smooths, the diffuse "hole darkening" vanishes (piece looks more uniform and slightly lighter in area average), while flow-induced loss of microscopic roughness makes the colour read more saturated/deeper. Suggested shading: albedo × (1 + 0.04 u) for u ≤ 1 then × (1 − 0.12 (u − 1)) beyond, plus increasing smoothness.

### 3.5 Back side

Before flipping: the back is the board side, still stage 1–2: round bead bottoms with peg-shaped pits, matte, loose, easy to pull apart ("背面是散的") [W: mypindou]. After ironing the back for about half the time, pits flatten and the slab is fully joined; recommended for keychains, coasters and anything handled [W]. Flip only after the first side has cooled, otherwise the piece stretches [W: mypindou]. Toonbead instead says to lift the piece from the board while it is still soft, so beads do not stick to the pegs [W]. Treat the lifting window as "warm, not hot" [E].

### 3.6 Paper and cloth: sticking and surface imprint

- **Parchment / baking paper** (silicone-coated) is the correct interface: it stops molten plastic sticking to the iron, spreads heat and pins beads. **Wax paper melts onto beads and the iron: never** [W: Beadify, duopindou]. Paper can be reused 20–30 times until yellowed, brittle, creased or fouled [W: mypindou]; Baidu snippet says white 烫纸 reused 2–3 times [W].
- **Sticking**: beads stick to the paper if the iron is too hot, the paper is cheap, or you peel while very hot; peel when cool to the touch (some tutorials say "30 s after ironing, while still slightly warm") [W; conflicting]. A reused, dirty or woven cloth prints its texture ("woven imprint means the cloth is dirty") [W: pixelbeads.io QA].
- **Surface imprint = texture of whatever covers the beads** [W: perlerbeads.io 22-effects article; bitbead.app]:

| Cover | Result |
|---|---|
| Parchment / baking paper | Flat **matte / misty** finish ("烘焙纸烫出来是雾面"), faint paper grain; creases print as lines |
| White baking cloth (烘焙布, PTFE-coated glass fibre; 0.25 mm "coarse texture" sold) | Matte frosted "磨砂"; sheds glass fibres when creased [W] |
| Towel (毛巾烫) | Fuzzy plush texture |
| Loofah / bath-sponge mesh (澡巾烫) | Soft matte, dotted mesh pattern |
| Glossy film / yellow ironing sheet (黄烫片, polyimide) | Glossy, reflective surface; reusable; same side always faces beads; clear transparent sheets deform at heat |
| Mesh / waffle fabric (网格烫, 华夫格) | Regular grid imprint |
| Crumpled paper (褶皱烫) | Random wrinkles |
| Glitter / velvet transfer film (格利特, 仙度瑞拉) | Sparkle or velvet pile transferred to the surface (a lamination step after fusing, low heat) [W: bitbead.app] |

Rendering defaults [E]: paper-ironed roughness 0.55–0.7; cloth-ironed 0.6–0.8; glossy film 0.15–0.25; original bead sides 0.4–0.5. Colour does not depend on cover, but perceived saturation rises with gloss.

### 3.7 Pressure

The iron's weight is enough; pressing hard "squashes beads flat", pushes plastic sideways ("串色" colour bleeding, extra flash at the edges), shifts beads and drives them into the pegs so the piece sticks to the board [W: toutiao; duopindou]. In the model, add pressure as a multiplier on closure rate and on lateral smear [E].

### 3.8 Cooling, warping, shrinkage and flattening

- **Why it curls**: the two faces cool and contract at different rates; the more-fused ironed face (hotter, flatter) contracts more, bowing the piece **towards the ironed side**. Larger pieces and one-sided fusing warp more; edges are often more fused than the centre [W: Beadify, toonbead, bilibili summary]. Sourced, but mechanism explanation is mine [D].
- **Prevention**: iron both sides evenly; immediately press under a **heavy flat book while still warm** for 2–5 min (2–3 min [mypindou]; 5–10 min [duopindou]; hours for bigger pieces); put the piece on a **cold marble / tile / glass** slab to pull heat out; keep the paper on until cool [W].
- **Fixes**: reheat the back face lightly with paper (130–140 °C, 3–5 s) and press flat while soft; or hair dryer then press; 24 h under weight recovers partially [W: mypindou, smzdm].
- **Why the board warps**: pegs and plate soften above the iron's reach if the iron lingers (> 5 s); tape method and fused-board cooling protect boards [W].
- **Stays pliable until ≈ 50 °C** (LDPE heat-deflection region), about 1–3 min for a 3 mm slab in air [E]; a cold slab roughly halves that [E].

### 3.9 Why circular ironing displaces beads

Beads sit loosely on the pegs and only gravity plus a fraction of a millimetre of radial slack holds them. The iron applies a downward load plus a lateral drag through the paper: friction (paper on bead tops) × normal load. Softening beads adhere to the paper and the paper wrinkles or catches at its edge, so the leading edge of the iron shears beads forward or lifts them (**"beads jump off the board"** especially with steam, which also wets and wrinkles the paper) [W: beads.studio, duopindou, Toonbead]. Circular motion avoids building a long push in one direction and spreads heat (back-and-forth strokes build up heat at each turnaround [W: pindoule.com]). Mitigations in the sim: iron weight only, paper larger than the piece by 1–3 cm, edges taped or pinned, the masking-tape transfer method for big pieces [W]. Displacement probability per bead ∝ lateral force − static hold [E].

### 3.10 Finished piece properties

- **Stiffness** [W + E]: light fusion "soft and flexible"; full fusion "hard, rigid"; PE stays slightly flexible and survives drops better than brittle plastics [W: perlerbeadai.com]. A 3 mm closed LDPE-like plate (flexural modulus ≈ 0.2–0.4 GPa; HDPE ≈ 1 GPa; EVA ≪ 0.1 GPa) is stiff for a keychain but bends visibly under finger force [R-general, E].
- **Sound** [E]: dull, low "tock" with fast decay (high-damping PE), not a ring.
- **Edge feel** [W + E]: light fusion edges are serrated and bumpy, full fusion edges smooth with slightly rippled outer walls; stray single beads (孤立豆) fall off.
- **Weak spots** [W]: single-bead necks, 1–2 bead wide features, and board seams on multi-board pieces (iron across the seam, fuse sections overlapping).

### 3.11 Failure catalogue (for the sim's "ruined piece" visuals)

| Failure | Cause | Look |
|---|---|---|
| Falls apart | Too cool / too short | Beads pop out, rims only glossy |
| Muffled (闷豆) | Hot spot, uneven heat | Holes closed, solid sheet |
| High-low | Uneven bead height or pressure | Stepped surface |
| Blurred / bleeding colours | Over-heat, pressing hard | Haze across colour boundaries |
| Burn marks / yellow | Temperature too high | Yellow-brown tint |
| Blisters, white haze | Steam or moisture | Bubbles, cloudy patches |
| Stuck to board | Over-hot or pressed in | Pegs fused to bead undersides |
| Curl / dome | No weighted cooling | Warped slab |
| Paper stuck | Cheap/wax/overheated paper | Paper shreds in surface |
| Woven imprint | Dirty cloth | Regular dotted pattern |
| Peg melt | Iron lingers on the board | Peg tips slump; board warps |

---

## 4. Tools (physical descriptions and dimensions)

Dimensions are mostly from retail listings and tutorials [W]; unmarked values are estimates [E].

| Tool | Description | Dimensions / notes | Source |
|---|---|---|---|
| **镊子 tweezers** | Stainless precision tweezers; straight pointed, bent/angled, flat-tip; anti-static ESD series (ESD-10/11/12/14 straight pointed, **ESD-13 flat head**, **ESD-15 bent tip**). Tips must close precisely so beads do not slip or fly; avoid plastic kit tweezers | **12–14 cm**, 12 ± 1 cm "optimal" (under 10 cm wobbles, over 14 cm clumsy); tip width ≈ 0.2–0.5 mm at the point [E] | [W] 1688 ESD-10…15 listing; Taobao encyclopedia; 10100.com |
| **豆笔 / 豆针 bead pen / needle** | Single-needle pen (one bead, best for detail), double-needle pen (picks and slides a row, fastest for lines), push-button reservoir pen (holds many same-colour beads, best for large fills) | Needle Ø **1.0 / 1.1 / 1.2 mm** for 2.6 mm beads; pen length ≈ 13–15 cm [E] | [W] beadshub.net; Taobao listing titles |
| **豆铲 / 小勺 scoop** | Small plastic spoon with a groove to scoop and pour beads | ≈ 8–12 cm [E] | [W] 10100.com |
| **豆盘 / 分豆盘 tray** | Shallow tray, often triangular with a pointed corner to pour beads back; round/square large trays; "漏斗" funnel types | A5-ish [E] | [W] 10100.com; 1688 |
| **豆盒 / 分格收纳盒** | Transparent-lid compartment boxes of 24 / 36 / 48 / 60+ cells; cell depth 2–3 cm; small box ≈ 2,000 beads; an A4 case holds ≈ 40 small boxes. Label codes on the lid | | [W] pindoule.com/tutorials/storage-and-sorting; 10100.com |
| **烘焙纸 / 烫纸 parchment** | Silicone-coated paper (white 烫纸, or air-fryer sheet) | Cut 2–3 cm larger than the piece; reuse 20–30 times | [W] mypindou |
| **烘焙布 baking cloth** | PTFE-coated glass-fibre cloth, white or brown, coarse or fine weave; reusable; frosted finish | 0.25 mm thick, sheets 20 × 15 cm to 1 m long; a cotton-like "special ironing cloth" 0.8–1.2 mm is also described | [W] Taobao / Shopee listings; Baidu note |
| **澡巾 / 毛巾 loofah, towel** | Textured pads for surface-effect ironing | | [W] perlerbeads.io |
| **粘毛器 lint roller** | Mini tear-off sticky roller to pick up stray beads and clean debris from baking cloth | ≈ 10 cm roller [E] | [W] Taobao encyclopedia / Douyin titles |
| **熨斗 iron** | Household flat iron; "拼豆熨斗" mini constant-temperature iron | Mini 35–60 W (slow, minutes to heat), 300–500 W adjustable; M-001 400 W with 15 s preheat; soleplate must be clean (stains print through paper) | [W] listings; duopindou |
| **熨烫机 / 烫画机 heat press** | Flat press, 150 °C, used on a tile, rotate every 45 s | | [W] smzdm |
| **散热垫 cooling slab** | Marble / porcelain tile / glass; natural stone is thermally massive and flat | 10 × 10 to 30 × 30 cm | [W] Taobao encyclopedia; Baidu snippets |
| **压书 / 压板 weight** | Heavy hardcover book or flat plate; press 2–10 min | | [W] |
| **美纹纸 masking tape** | Tape transfer of the finished layout, iron the reverse (mirror the pattern) | wider than the board | [W] smzdm, pixelbeads.io |
| **钥匙扣配件 keychain parts** | Split key ring Ø 20–30 mm (25 mm common), wire 0.8–1.2 mm; ball / snake chain 5–15 cm; lobster clasp; earring hooks 12–20 mm; brooch back 20–35 mm | Magnets Ø 8–20 × 1–3 mm (a 6 × 2 mm cylinder also used) or flexible rubber magnet sheet with adhesive; glue B6000 / B7000; Velcro | [W] pindoupic.com accessories guide; makerworld listing; 1pindou.com keychain guide |

Keychain eyes: leave one empty peg position at the top while placing, so the fused piece has a clean hole; hot-needle or drill holes afterwards are unreliable [W: 1pindou.com, pindoule.com].

---

## 5. Colour palette (MARD focus)

### 5.1 What was found

**Primary source**: `maxcleme/beadcolors` (MIT), file `raw/mard.csv` at commit `6e269260` (2026-08-11, "fix: sync Mard RGB with official pixel-beads.com chart"), identical to the card hex values on **pixel-beads.com/mard-bead-color-chart** ("Ultimate MARD Bead Color Chart (2026 Revised Edition)", 291 colours). I parsed the page HTML directly, which also yielded the photochromic UV colours that the CSV lacks. https://github.com/maxcleme/beadcolors , https://www.pixel-beads.com/mard-bead-color-chart

**Cross-check lineages** (all compared per code with CIEDE2000):

| Lineage | Colours | Licence | Notes |
|---|---|---|---|
| maxcleme master = pixel-beads 2026 | 291 | MIT | Primary. 123 of 221 base values were revised vs. the older snapshot |
| Zippland/perler-beads `colorSystemMapping.json` = maxcleme snapshot `94b9999` = Elaine / Jett / ktwu / xingxingmofashu / LunarXuan / CC-PinDou copies | 291 | AGPL-3.0 per Zippland's LICENSE notice (GitHub reports "other"); MIT (maxcleme); others vary | Older "Zippland family" (A1 `#FAF4C8`). Identical hex in ≈ 8 repos |
| HansBug/pindou-color-data `mard-291-github` (get-colors-from-beans) and `mard-221-alfonse-doudou` | 291 / 221 | MIT (custom data licence text) | "gcfb family" (A1 `#FAF5CD`). Contains obvious outliers (M2 grey instead of green, F11, G8, ZG) |
| MXBraisedFish/pindou-draw `MARD-295.json` | 295 | none stated | Only source with explicit finish types and two-state colours (photochromic, thermochromic) |
| Artkal official M series (HansBug `artkal-m-221-official`, from Artkal's 2025 RGB PDF) | 221 | MIT | MARD-compatible set (MA1 = A1, MH1 = H1 transparent). Independent manufacturer reference |

Agreement statistics (CIEDE2000 over the 221 base codes) [D]:

| Pair | Median ΔE00 | Share > 3 | Share > 6 |
|---|---|---|---|
| Zippland vs. maxcleme snapshot `94b9999` | 0.00 | 0 % | 0 % |
| get-colors vs. Alfonse | 0.00 | 5 % | 2 % |
| Zippland vs. get-colors | 1.30 | 14 % | 2 % |
| 2026 chart vs. Zippland | 0.14 | 33 % | 15 % |
| 2026 chart vs. get-colors | 2.13 | 37 % | 17 % |
| 2026 chart vs. Artkal M | 5.14 | 81 % | 40 % |
| Zippland vs. Artkal M | 5.89 | 89 % | 49 % |
| get-colors vs. Artkal M | 6.04 | 83 % | 50 % |

Reading the table: the web charts agree with each other to about ΔE 1–2 on most codes, but all of them sit about ΔE 5–6 away from Artkal's official M numbers. A ΔE of 5–6 is a clearly visible but same-hue difference, so treat Artkal M as a different measurement or product, not as ground truth.

Why the 2026 chart is primary: for the 123 base codes it changed, it moved **closer to Artkal's official M values in 91 cases** (median ΔE to Artkal 6.7 → 5.1, now equal to the unchanged codes' 5.2). It also corrects clear errors that older lineages carried (P14, P19, R6). It still has outliers (B8, F6, G17, G8, H16 sit far from every other source) so those codes are flagged `conf: "low"` with every alternative listed in `alt`.

Licence summary: palette values are factual colour references; sources are MIT (maxcleme, HansBug data), AGPL-3.0 (Zippland, used only for comparison, nothing copied), none stated (pindou-draw, used only for finish classification and the two-state colours of Q and Y6–Y9, flagged in `note`). The pixel-beads.com page carries no licence (hex values read from a public page).

### 5.2 Real product structure

Sizes: **120 / 144 / 168 / 221 / 291** are the retail sets; 221 = A–H + M; 291 adds the extended series [O: pixel-beads.com]. MARD only makes 2.6 mm beads [W]. A full 221 set is sold as 221 bags of about 1,000 beads (≈ 10 g each), ≈ 221,000 beads, priced about ¥450 [W: pindou.online/shop].

Code letters are colour families; numbers run roughly by shade or hue inside the family [W: webtomind.com]:

| Series | Count | Looks like (verified on the data) | Finish |
|---|---|---|---|
| A | 26 | yellows, oranges, cream, peach, a few coral-reds | opaque |
| B | 32 | greens, yellow-greens, teals, forest / olive darks | opaque |
| C | 29 | cyans, sky and royal blues, navy | opaque |
| D | 26 | blue-violets, purples, magentas | opaque |
| E | 24 | pinks, rose, mauve, light blush | opaque |
| F | 25 | reds, deep wine, coral, salmon, dusty pinks | opaque |
| G | 21 | browns, tan, caramel, skin tones | opaque |
| H | 23 | whites, greys, black, warm/cool neutrals (H1 = clear/transparent) | opaque (H1 clear) |
| M | 15 | muted, dusty "Morandi" tones: sage, khaki, mauve, taupe (letter probably Morandi; one community list calls it "earth") | opaque |
| P | 23 | pearlescent: sheen changes with viewing angle; no UV response | pearl |
| R | 28 | jelly: translucent finish | translucent |
| Q | 5 | thermochromic: colour changes reversibly in a temperature range (cold → warm) | thermochromic |
| T | 1 | pixel-beads: "transparent, T1 is a translucent white for transmitted light and highlights"; a Douyin listing: 葱粉 glitter | glitter / translucent white (uncertain) |
| Y | 5 (9 on the 295 card) | glow in the dark: absorbs light, glows; brightness fades | glow |
| ZG (Z) | 8 | photochromic: clear indoors, develops colour under UV | photochromic |

Douyin marketing for the 295 card: "P珠光 + R果冻 + Y夜光 + Q温变 + Z光变 + T葱粉" [W]. This is how the series names above were cross-confirmed.

Sanity verification (hue / lightness per series, primary hex): A mean lightness 0.73, 16 yellow + 8 orange; B 11 green + 10 yellow-green + 6 teal; C 12 cyan + 11 blue; D 11 blue + 8 violet + 7 pink-violet; E 14 pink-red + 6 magenta; F 21 red + 4 orange; G 17 orange-brown; H 12 grey; no code is outside its family except warm-pink greys H8 and H10. Pure `#FFFFFF` (H2) and `#000000` (H7) occur; they are design values (see 5.4).

### 5.3 How shops organise the bead wall

- One bag or bin per code, labelled with the code on the lid or front, sorted by series letter, then number [W: pindoule.com, aigeoyh.com].
- Transparent-lid compartment boxes (24 / 36 / 48 / 60+), at least a few spare cells per box; cell depth 2–3 cm; label on the lid [W].
- Work flow: first split into **nine series piles** (A–H, M), then by shade; the hobbyist pours only the colours of a pattern into small dishes before placing [W: pindoule.com "分两轮, 先按色系粗分成九堆"].
- Franchise guides: check the boxes on arrival, label with the exact colour code, standardise shelf display [W: Douyin franchise video title]. Don't merge "same-looking" colours from different brands [W].
- 221 colours × ≈ 1,000 beads = a "全色号" wall; special series are shelved after H/M.

### 5.4 Using the JSON

Schema (`palette-mard.json`, array):

| Field | Meaning |
|---|---|
| `code` | MARD code (`A1`, `ZG3`, ...) |
| `series` | `A`–`H`, `M`, `P`, `Q`, `R`, `T`, `Y`, `ZG` |
| `group` | colour family label |
| `tier` | `base221`, `special70`, `new295` (glow Y6–Y9, only on the newer card) |
| `hex` | primary hex (`#RRGGBB`). For Q: cold-state colour; for ZG: `#FFFFFF` stand-in for "clear" |
| `finish` | `opaque`, `translucent`, `pearl`, `glitter`, `glow`, `thermochromic`, `photochromic` |
| `conf` | `high` (≥ 2 independent lineages within ΔE00 4), `medium` (1), `low` (0 or single source) |
| `alt` | other lineages' hex where they differ by ΔE00 > 4 (`pinned` = Zippland family, `gcfb` = get-colors, `alfonse`, `artkalM` = Artkal official M, `draw` = pindou-draw; Q also carries `pixel_beads`) |
| `states` | Q: `{cold, warm}` (from pindou-draw); ZG: `{default, uv}` (UV colour from pixel-beads.com) |
| `alt_uv` | ZG only: the older charts' ZG values (they disagree with the 2026 UV colours and each other, so they are probably not the same quantity) |
| `note` | caveats (21 entries: H1, H2, H7, T1, Q × 5, ZG × 8, Y6–Y9) |

Counts: 295 entries; base 221 → conf high 161 / medium 36 / low 24; specials 70 → high 51 / medium 4 / low 15 (specials are less certain by nature). Finish counts: opaque 220, translucent 29 (R × 28 + H1), pearl 23, glow 9, photochromic 8, thermochromic 5, glitter 1.

**There are no official colour names**: MARD publishes codes only; community Chinese names are auto-assigned and duplicated, so none were shipped.

**Rendering caveats**

1. Hex values are screen approximations. The 2026 page says so itself: "one HEX cannot represent every state of a special series".
2. Official-style tables use pure `#FFFFFF` / `#000000` (also Artkal's official PDF: C01 `#FFFFFF`, C02 `#000000`), but photographed real beads are:

   | Brand | White | Black |
   |---|---|---|
   | Perler | `#EAEFEE` | `#323234` |
   | Hama | `#E5ECF1` | `#141315` |
   | Artkal S | `#EAEEF3` | `#292A2B` |

   So scale MARD albedo roughly into `[0.02, 0.80]` linear (sRGB ≈ 40–230): map `#FFFFFF` → `#E8EDF0`, `#000000` → `#2A2A2C` before lighting.
3. **Translucent R / H1 / T1 values** are apparent body colours on a light backdrop: render them as tint plus transmission, not opaque albedo.
4. **Q and ZG** need a two-state shader (`states`); the single published hex mixes states.
5. Y (glow): `hex` is the daylight colour; glow emission colour is not published (typically green or blue [W: pixel-pattern.com]).

### 5.5 Other brands

`palette-other-brands.json` holds Perler (103, with product names and Perler item codes), Hama Midi (92 H-codes with names), Artkal S (199 with names), Artkal C official (197) and Artkal M official (221, MARD-compatible). Sources: maxcleme/beadcolors (MIT) and HansBug/pindou-color-data (MIT data). Again screen approximations.

---

## 6. Special bead types

| Type | Where | Look | Melt / handling differences | Source |
|---|---|---|---|---|
| **Translucent / clear** | MARD R (jelly, 28), H1 clear; Perler translucent/clear; Artkal CT01–CT09 / "jewel" | Light passes through; stained-glass look; clear is hazy-milky PE rather than glass; colours look lighter on white and deeper over black | **Over-ironing loses transparency**; single side, 5–10 s per pass; unpigmented plastic fuses at lower heat and spreads first in mixed pieces [W, weak]; thick layers get milky | [W] mypindou; pixel-pattern; [O] pixel-beads |
| **Pearl (珠光)** | MARD P (23); Hama H64 [W: perleland.dk]; Perler "pearls" | Shell-like pearlescent sheen, shifts with angle, softer saturation; **not UV reactive** | Surface sheen reduces if you flatten and gloss it; high or long heat dulls it [W, weak]; use matte cover to keep a soft sheen | [O] pixel-beads; [W] b2bwiki; [O] Perler Stripes 'n Pearls tray |
| **Glitter (闪粉/葱粉)** | MARD T1 (maybe); Hama H61 / H62 gold and silver glitter [W: perleland.dk]; Perler glitter; glitter-film transfer ironing | Tiny sparkles mixed into the plastic; sparkle visible at angles | "Iron lightly on one side, too much heat reduces sparkle" | [W] pixel-pattern.com |
| **Glow (夜光)** | MARD Y (5 + 4 new); Perler glow mix; Artkal glow | Pale pastel body in daylight; emits green/blue afterwards; brightness fades over time | The emissive layer "may be damaged": single side, 5–10 s per pass | [O] pixel-beads; [W] mypindou |
| **Neon / fluorescent** | Perler neon; Hama H35/H37 neon | Extremely bright; faint glow under blacklight | Same as opaque; rendering needs an HDR-ish albedo boost | [W] pixel-pattern.com |
| **Thermochromic (温变)** | MARD Q (5) | Colour in the cold state; turns pale/another hue when warm; reversible; the iron's heat flips it while ironing | Changes while ironing and returns on cooling; hand warmth flips it | [O] pixel-beads; Douyin title [W]; pindou-draw state pairs |
| **Photochromic (光变, ZG/Z)** | MARD ZG (8; Z1–Z9 on one list) | **Transparent before exposure, colour under UV/sunlight**; depth depends on UV dose | Treat as clear until UV; effect of ironing heat on the dye is not documented | [O] pixel-beads.com |
| **Stripes / marbled / mixed** | Perler Stripes (zebra etc.), Stripes 'n Pearls tray (16 compartments, 4,000 beads); Chinese "混色豆" mixed bags | Two-tone banded or swirled bead; each bead keeps a repeating pattern | Colours stay on their bead when melted, smearing at the edges; mix of lots → uneven fusion | [O] perler.com |
| **Gradient / 晕染 (渐变撒豆)** | A placement technique, not a bead type: random scatter of two similar colours to fake gradients | A dithered transition | Same as opaque | [W] Baidu title |

For all special beads, expect fusion behaviour to differ per pigment and base polymer; give each finish its own `rate` multiplier in the melt model (opaque 1.0; translucent 0.9 and clarity loss at u > 0.8; glow and glitter 0.9 with emission/sparkle loss above u 0.8) [E].

---

## 7. Recommended simulation constants

Paste-ready defaults. Tags mark confidence.

```js
// All lengths in millimetres, masses in grams, temperatures in °C.
export const PINDOU = {
  scales: {
    midi: { pitch: 5.0,  outerD: 4.8, innerD: 2.5, height: 5.0, mass: 0.059 },                    // [O][D]
    mini: { pitch: 2.6,  outerD: 2.6, innerD: 1.3, height: 2.6, mass: 0.010 },                    // [W][D]
    maxi: { pitch: 10.0, outerD: 10,  innerD: 5.0, height: 10,  mass: 0.55  },                    // [O][D]
  },
  beadTolerance: { outerD: 0.08, height: 0.12, cheapMultiplier: 2.5 },   // [E]
  beadEdgeBevel: 0.10,                                                    // [E]
  beadPigmentJitterDE00: 1.5,                                             // [E]
  polymer: { density: 0.93, soften: 95, weld: 110, flow: 125, melt: [105, 135] },  // [R][E]

  boards: {
    midi29: { pegs: 29, pitch: 4.993, size: 144.8, plate: 2.2, pegBaseD: 2.3, pegTipD: 1.9, pegH: 3.6 }, // size [O]; rest [E]
    mini52: { pegs: 52, pitch: 2.6,   size: 135.2, plate: 2.0, pegBaseD: 1.15, pegTipD: 0.95, pegH: 1.8, longPegH: 2.3 }, // [W][E]
    interlockOverlap: 0.64,                                                  // [D] Perler 4-board assembly (2 x 144.8 - 288.9)
    shapes: ['square', 'circle', 'hexagon', 'heart', 'star'],               // [O]
    softenTemp: { PS_clear: 95, ABS: 100, PP_ABS_heatResistant: 145 },       // [E]/[W seller claim]
    hold: { clearanceRadial: 0.1, tiltDeg: 5, shedTiltDeg: 50 },             // [D from E geometry] / [E]
  },

  iron: {
    dialMid: 140, dialRange: [120, 160], steam: false,                        // [O][W]
    perSideSeconds: { small: [10, 15], medium: [15, 25], full29: [25, 40] }, // [W]
    officialPerSide: [10, 20],                                               // [O] Perler
    backSideFactor: 0.5,                                                     // [W]
    pressure: 'iron weight only',
    miniSeconds: [5, 10], heatPress: { temp: 150, seconds: 45, rounds: 2 },  // [W]
    rateVsTemp: 'time scales by 2^((140 - T)/15)',                           // [E]
  },

  // Heat dose u accumulates at du/dt = 1/28 s^-1 (midi, 140 °C dial, light pressure).
  // Mini: x2 faster. Soft EVA-type: x1.4 faster. u values are stage boundaries.
  melt: {
    closeTimeMidi: 28, closeTimeMini: 14,                                     // [E] aggregated from [O][W]
    stages: [
      { id: 'loose',       u: 0.00, hole: 2.50, thickness: 5.00, note: 'round beads, 0.2 mm gaps' },
      { id: 'warming',     u: 0.03, hole: 2.50, thickness: 5.00, note: 'colour clears through paper (Hama stop cue ends here)' },
      { id: 'touching',    u: 0.10, hole: 2.50, thickness: 4.90, note: 'necks form, mat tears easily' },
      { id: 'window',      u: 0.25, hole: 2.50, thickness: 4.50, note: 'edges fused, holes open: light fusion' },
      { id: 'shrinking',   u: 0.45, hole: 2.20, thickness: 3.90, note: 'target 0.55-0.65: holes about half' },
      { id: 'pinholes',    u: 0.75, hole: 1.30, thickness: 3.20 },
      { id: 'closed',      u: 1.00, hole: 0.00, thickness: 2.70, note: 'front closed; back keeps peg pits' },
      { id: 'overmelted',  u: 1.30, hole: 0.00, thickness: 2.50, note: 'gloss, darker, bleeding, edge flare' },
      { id: 'burn',        u: 1.70, hole: 0.00, thickness: 2.30, note: 'blisters, yellowing, board warp' },
    ],
    thicknessFormula: 'V/(pitch^2 - holeArea), V = 65.9 mm^3 midi, 10.7 mm^3 mini', // [D]
    bleedWidth: [0.3, 0.8], edgeFlare: [0.1, 0.3],                              // [E]
    colour: { darkenPerUBelow1: -0.04, darkenPerUAbove1: 0.12 },               // [E] direction [W]
    finishRate: { opaque: 1.0, translucent: 0.9, pearl: 1.0, glitter: 0.9, glow: 0.9, neon: 1.0 }, // [E]
  },

  cooling: { softUntil: 50, pliableSecondsAir: [60, 180], weightMinutes: [2, 5], coldSlabFactor: 0.5 }, // [E][W]
  shrinkAfterLift: { linearPercent: [1.0, 1.5] },                                                       // [D]

  surface: {
    roughnessRaw: 0.45, roughnessParchment: 0.62, roughnessCloth: 0.7, roughnessGlossFilm: 0.2, // [E]
    ior: 1.51, F0: 0.04,                                                                        // [R-general]
  },

  albedoClamp: { whiteSRGB: '#E8EDF0', blackSRGB: '#2A2A2C' },  // [D] from photographed brands
  flexuralModulusGPa: { LDPE: 0.25, HDPE: 1.0, EVA: 0.05 },      // [R-general]
};
```

Open items (cheap to measure with calipers on a handful of real MARD beads and a board): bore and height of 2.6 mm beads, peg diameter / height / taper, plate thickness, closed-slab thickness after ironing, tap sound, true gloss, and the actual colour of the white and black beads.

---

## 8. Sources

**Official / vendor [O]**

- Perler 1,000-bead product page (bead size): https://perler.com/products/1-000-perler-beads-brick
- Perler Standard Fusing Method: https://perler.com/blogs/projects/standard-fusing-method
- Perler Large Clear Square Pegboards (5.7 in / 11.375 in): https://perler.com/products/large-clear-square-pegboards-4-ct
- Perler Biggie boards: https://perler.com/products/biggie-beads-clear-pegboards-2-ct ; Super-Sized: https://perler.com/products/super-sized-clear-pegboard ; collection: https://perler.com/collections/pegboards ; Stripes 'n Pearls: https://perler.com/products/stripes-n-pearls-perler-bead-tray
- Hama bead sizes: https://www.hamabeads.com/hama-beads-sizes/ ; how to use: https://www.hamabeads.com/how-to-use/ ; instructions, lab test and Bead-Tac: https://hama.dk/en/pages/instructions-1 ; Large square board: https://www.hamabeads.com/product/interlocking-large-square-midi-hama-beads-pegboard/ ; https://hama.dk/en/products/midi-pegboard-large-square ; medium round: https://hama.dk/en/products/midi-pegboard-medium-round
- Artkal store: https://www.artkalfusebeads.com/
- pixel-beads.com MARD chart (series definitions, hex): https://www.pixel-beads.com/mard-bead-color-chart
- Artkal official RGB PDFs, via HansBug: C 2024 https://cdn.shopify.com/s/files/1/1323/8195/files/C_MINI_Beads_RGB_Color_Chart_2024.pdf?v=1744700289 ; M 2025 https://cdn.shopify.com/s/files/1/1323/8195/files/M_MINI_Beads_RGB_Color_Chart_2025.pdf?v=1760661747

**Reference [R]**

- https://en.wikipedia.org/wiki/Fuse_beads ; https://en.wikipedia.org/wiki/Polyethylene ; https://en.wikipedia.org/wiki/Ethylene-vinyl_acetate ; https://zh.wikipedia.org/wiki/拼豆

**Palette data and code**

- https://github.com/maxcleme/beadcolors (MIT; commit 6e269260 sync, 94b9999 snapshot)
- https://github.com/HansBug/pindou-color-data (MIT data licence text)
- https://github.com/Zippland/perler-beads (AGPL-3.0; comparison only)
- https://github.com/MXBraisedFish/pindou-draw (no licence; `src/assets/color_card/MARD-295.json`)
- https://github.com/zwhy149/bead-grid-studio (Apache-2.0; documents the maxcleme provenance); https://github.com/Aswellle/Pindou-Studio ; https://github.com/CIawevy/pindou-skill ; https://github.com/Jett-Wu/Perler_Beads_Generator ; https://github.com/xingxingmofashu/pindou ; https://github.com/ElaineZhao92/PINDOU-App ; https://github.com/ktwu01/perler-beads (copies of the same lineages, used for cross-checking only)

**Secondary web [W]**

- Ironing and melt: https://www.pindoule.com/tutorials/ironing-tips ; https://mypindou.com/guides/ironing/ ; https://www.toutiao.com/article/7684653678250230326/ ; https://toonbead.com/zh-cn/blog/how-to-iron-perler-beads ; https://www.duopindou.online/zh/blog/how-to-iron-perler-beads ; https://shoudihand.com/pindou/bead-starter-tutorial ; https://beadifyapp.com/blog/how-to-iron-perler-beads.html ; https://www.beads.studio/en/learn/ironing-guide ; https://www.pixelbeads.io/blog/perler-bead-beginner-qa ; https://pindou.io/guides/how-to-iron-beads ; https://perlerbeads.io/zh/blog/perler-bead-ironing-effects ; https://www.bitbead.app/en/guides/bead-ironing-methods ; https://post.smzdm.com/p/aww78lo4/ ; https://post.smzdm.com/p/aqrgnpkp/
- Sizes, boards: https://beadifyapp.com/blog/perler-bead-sizes.html ; https://stitchmate.app/guides/perler-bead-sizes-and-pegboards ; https://bean.gojolab.cn/zh/guide/sizes ; https://ipindou.vip/guides/bead-size-and-board-guide ; https://www.pixelbeads.io/blog/perler-bead-shift-prevention-and-rescue ; https://www.pindoumao.com/tutorial/5 ; https://www.millroadcrafts.nl/product/336664/artkal-bcp01-2-6mm-clear-square-pegboard-triangle-connection ; https://www.thingiverse.com/thing:2313172 ; https://www.amazon.com/ARTKAL-2-6mm-Square-Pegboards-BCP01-4/dp/B01LY52BUF
- Materials, brands: https://perlerbeadai.com/faq/how-are-perler-beads-made/ ; https://perlerbeadai.com/faq/what-are-perler-beads-made-of/ ; https://kandiverse.com/tutorials-artkal-vs-perler-vs-hama ; https://beadary.com/compare/artkal-series ; https://www.pindoupic.com/jiaocheng/ruan-dou-ying-dou-qu-bie-xuan-gou ; https://pixel-pattern.com/blog/perler-bead-colors-the-complete-guide-to-shades-sets-matching ; https://perleland.dk/en/blog/hama-perler-farvekoder-oversigt (Hama H-codes) ; https://bitbead.pomodiary.com/zh/colors ; https://www.pindou.online/shop ; https://webtomind.com/zh-CN/blog/mard-bead-color-chart
- Tools, storage: https://www.beadshub.net/blog/pindou-doubi-tuijian ; https://www.pindoule.com/tutorials/storage-and-sorting ; https://www.aigeoyh.com/knowledge/perler-bead-color-storage-sorting ; https://www.10100.com/article/24196200 ; https://www.pindoupic.com/jiaocheng/pin-dou-pei-jian-zen-me-xuan ; https://www.1pindou.com/tutorials/make-keychain/ ; Taobao / 1688 / JD / Shopee listings for tweezers (ESD-10…15), baking cloth, mini irons, magnets (titles only)
- Douyin titles quoted for the 295-colour series names (video pages not fetchable): https://www.douyin.com/video/7663514062886211050 ; https://www.douyin.com/video/7635882860277165962

Pages that returned bot-check or login walls (Baidu Baike / Wenku, Reddit, Xiaohongshu, Cnblogs article farm) were not bypassed; only their search snippets were used, flagged where relied upon.
