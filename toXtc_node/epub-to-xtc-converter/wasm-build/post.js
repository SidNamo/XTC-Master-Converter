// Bridge non-standard helpers exposed by EpubRenderer.cpp into Module.
// EpubRenderer.cpp exports `allocateMemory`/`freeMemory` (no underscore) via
// EMSCRIPTEN_KEEPALIVE; emcc routes them as `_allocateMemory`/`_freeMemory`
// on Module. The existing JS callers expect `Module.allocateMemory(n)` and
// `Module.freeMemory(p)` without the underscore.
Module.allocateMemory = Module._allocateMemory || function (n) { return Module._malloc(n); };
Module.freeMemory     = Module._freeMemory     || function (p) { return Module._free(p); };
