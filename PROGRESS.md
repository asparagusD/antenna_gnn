# PROGRESS

Tick a subchunk only when every acceptance criterion has been shown passing and the work is committed
(see the subchunk loop in `CLAUDE.md`).

## C0 Setup, skills, repository graph
- [x] C0.0 Protect webapp_private/, working rules, memory files
- [x] C0.1 Install Impeccable and create the project skills
- [x] C0.2 Read every file and build the repository graph

## C1 Python reference pipeline and golden fixtures
- [x] C1.1 Extract the frozen graph builder (exact parity with training graphs)
- [x] C1.2 Feed component and reference predictor
- [x] C1.3 Golden fixtures for the TypeScript and ONNX layers

## C2 ONNX export and parity
- [x] C2.1 Attempt a direct export (≤ 1e-4 dB parity)
- [ ] C2.2 (only if C2.1 failed) Plain-PyTorch GATv2 for export — not needed: C2.1 parity passed (2.5e-5 dB)
- [ ] C2.3 Model assets for the browser (meta.json, hashes)

## C3 Web scaffold and design foundation
- [ ] C3.1 Vite + React + TypeScript scaffold and quality gate
- [ ] C3.2 Impeccable: product context and the design plan

## C4 TypeScript core (no UI)
- [ ] C4.1 Grid state model
- [ ] C4.2 TypeScript graph builder (bit-exact)
- [ ] C4.3 Inference engine and the parity test in Node
- [ ] C4.4 Web Worker and post-processing

## C5 The user interface
- [ ] C5.1 Pixel grid editor
- [ ] C5.2 Grid-size selector and fill meter with warning
- [ ] C5.3 Live S11 chart
- [ ] C5.4 Results panel, domain-of-validity note and scope notice
- [ ] C5.5 Starting points, sharing, export

## C6 Design polish with Impeccable
- [ ] C6.1 Critique the whole app and fix P0/P1
- [ ] C6.2 Audit (accessibility, performance, responsive, theming)
- [ ] C6.3 Adapt (tablet and phone)
- [ ] C6.4 Harden (errors, empty and loading states)
- [ ] C6.5 Polish and the detector check

## C7 Deployment to GitHub Pages
- [ ] C7.1 GitHub Actions workflow
- [ ] C7.2 Deploy and run the smoke test against the live site

## C8 Final verification and handover
- [ ] C8.1 Full regression
- [ ] C8.2 Performance report
- [ ] C8.3 Documentation
- [ ] C8.4 Repository graph update
- [ ] C8.5 Final summary
