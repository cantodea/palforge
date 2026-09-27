# SDLPAL runtime notice

PalForge builds its browser runtime from the upstream
[sdlpal/sdlpal](https://github.com/sdlpal/sdlpal) project at the exact commit
recorded in `UPSTREAM_REVISION`.

SDLPAL is licensed under GNU GPL v3. PalForge does not modify or push to the
upstream repository. During CI, a clean checkout is created in a temporary
directory, the PalForge adapter and the auditable patch in this directory are
applied, and the WebAssembly output is produced. The corresponding adapter and
patch source are distributed with PalForge.

No original PAL game resources are included. At runtime the files selected by
the user are copied into the isolated Emscripten memory filesystem and the
source directory remains read-only.
