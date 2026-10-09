// Bootstrap for the pages without the 3D process story (projects, rental stands, approach, about, contact):
// nav state, mobile menu and reveal-on-scroll. The home page boots with main.js instead.

import { initUI } from './ui.js?v=32';

initUI({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
