# EasyEV AI Virtual Showroom

This is a standalone showroom module served at `/showroom/`. It reuses the main project's Agora vehicle adapter while keeping its UI, catalogue, and viewer code isolated inside `showroom/`.

## Real vehicle collection

The module displays only the six products available under `assets/3d cars/`:

- Tata Punch.ev — 24-frame exterior spin
- Tata Nexon.ev — 72-frame exterior, 72-frame open-door view, and cubemap interior
- MG Comet EV — 72-frame exterior and 72-frame open-door view
- Citroën C3 — 24-frame exterior spin; clearly labelled as the petrol C3
- Ather Rizta — 36-frame exterior spin
- TVS King Kargo HD EV — 96 frames covering two colours and four cargo-body configurations

`vehicle-catalog.js` contains the corresponding manufacturer-backed specification summary, source link, asset manifest, and vehicle-specific voice prompt. It does not fetch or merge the old Top 12 catalogue.

## User experience

- Filter by Cars, Scooters, and 3-Wheelers.
- Drag any vehicle to rotate it with inertia.
- Use automatic rotation, frame stepping, keyboard arrows, and full screen.
- Switch to open-door and interior views where the supplied assets support them.
- Change the TVS cargo body and colour using real image sequences.
- Speak or type requests such as “show the Nexon interior”, “open the Comet doors”, “show me the back”, “show the left side”, “show the blue container”, or “rotate left”.
- Front, rear, left, and right requests use explicit source-frame mappings for every spin sequence.
- Unsupported top, roof, or underbody requests return a truthful limitation and offer the available angles.
- Long EasyEV messages collapse after three or four lines with Read more and Read less controls.
- Switch vehicles during an Agora call and reconnect to the selected vehicle's exact specialist prompt.

## Files

- `index.html` loads the existing Agora bundle, the local SpinViewer, and vendored Pannellum.
- `showroom.js` owns catalogue filtering, real-view lifecycle, voice events, deterministic commands, and cleanup.
- `vehicle-catalog.js` is the six-product asset and specification manifest shared with the server.
- `showroom.css` provides the responsive white/black/EV-green showroom design.
- `assets/3d cars/js/viewer360.js` provides progressive frame loading, drag inertia, auto-rotation, and safe teardown.

The server exposes `assets/3d cars/` through the restricted `/showroom-assets/` route. Do not open `showroom/index.html` with `file://`; run `npm start` and open `http://localhost:4173/showroom/`.

## Agora flow

1. The user starts the voice tour and grants microphone permission.
2. The page joins the selected product's vehicle session through `createVehicleAgoraAdapter()`.
3. Agent state and transcript events update EasyEV's visible state.
4. Final user transcripts enter the allowlisted showroom command interpreter. Supported scene actions execute locally before the AI response arrives.
5. Switching products ends the current specialist and joins the selected product's specialist.
6. Page exit stops the viewer and voice resources.

The server resolves the six showroom IDs before its broader EV catalogue, preventing the MG Comet, Citroën C3, or TVS King Kargo from falling back to an unrelated vehicle prompt.

## Performance and accuracy

- Only the selected vehicle sequence is preloaded; catalogue cards use one lazy thumbnail each.
- The 72-frame Nexon and Comet sequences sample every third source frame, reducing active image decoding from 72 to 24 views while preserving full 360-degree coverage.
- Rotation becomes interactive as soon as the first frame is decoded; remaining sampled frames continue loading in the background.
- Direction, view, colour, and body-style commands avoid an extra model or tool round-trip; the language model only supplies the spoken acknowledgement.
- The vehicle agent uses shorter responses and a scoped 300 ms end-of-speech window to reduce perceived voice latency.
- The first frame is shown progressively while the remaining frames load.
- Viewer listeners and animation frames are aborted on every view change.
- Pannellum is loaded locally for the Nexon cubemap interior.
- Reduced-motion and responsive layouts are supported.
- Manufacturer figures are identified as certified, IDC, or variant-dependent where appropriate.
- Indicative starting ex-showroom prices are displayed with a September 2026 check date and an explicit local-verification qualifier; live stock, discounts, finance and on-road totals remain intentionally unquoted.

## Verification

Run:

```powershell
npm start
```

Then open `http://localhost:4173/showroom/` and verify:

- all six catalogue cards;
- exterior spins for every product;
- Nexon open-door and interior views;
- Comet open-door view;
- all eight TVS colour/body combinations;
- typed commands;
- front, rear, left, right, unsupported top, and vehicle-specific availability handling;
- Read more and Read less on a long guide response;
- Agora voice with microphone permission.
