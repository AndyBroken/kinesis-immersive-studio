# Kinesis — Immersive 3D Web Studio (Concept)

Scroll-driven 3D website for a fictional creative web studio. The page is one continuous camera flight through a real-time WebGL world; each chapter of the story is its own scene.

**Live demo:** https://andybroken.github.io/kinesis-immersive-studio/

**Features**
- Camera flies along a 3D spline as you scroll, with smoothing, banking on turns and a speed-based FOV "warp"
- Custom GLSL shaders: noise-displaced iridescent "liquid" spheres, procedural nebula sky
- Scenes: ring gates, floating service objects (physical materials, iridescence, clearcoat), gallery of live project screens (click to open), warp-speed tunnel, glowing core finale
- Bloom post-processing with selective HDR glow
- 3D-anchored HTML labels, chapter rail navigation, live coordinates HUD
- Custom cursor, magnetic buttons, 3D tilt cards, text-scramble reveals, marquee
- Portfolio grid, pricing packages, contact form with validation
- Adaptive quality for phones (fewer particles, lower resolution), reduced-motion support, fallback without WebGL

**Tech:** Three.js (r160, ES modules from CDN), GLSL, vanilla JavaScript, HTML5, CSS3. No build step: static files, hosted on GitHub Pages.

`?p=0.6` jumps to a point in the flight (0–1), and `?shot=1` turns off the loader animation and cursor for screenshots.

*Concept / demo project. Kinesis is a fictional brand, and no messages are sent.*
