# Building `crengine.wasm`

`web/crengine.wasm` and `web/crengine.js` are produced by compiling
[buggins/coolreader](https://github.com/buggins/coolreader) with
Emscripten via [`wasm-build/`](../wasm-build/). The build is fully
reproducible — see that directory's [README](../wasm-build/README.md)
for the patch list.

## Quick start

From the repo root:

```bash
make wasm
```

That runs three steps end-to-end:

- `make wasm-build` — build the Docker image (~15 min first run, cached after)
- `make wasm-run` — compile inside the container; produces `wasm-build/out/crengine.{js,wasm}`
- `make wasm-install` — copy the new artifacts into `web/`; on first run, snapshots the previous binary as `web/crengine.{js,wasm}.vendored` for rollback

You can run any step individually if you want to inspect intermediate
output (e.g. `make wasm-run` then diff `wasm-build/out/` against
`web/` before installing).

## Provenance

The historical `web/crengine.wasm` (md5 `cc0c4a9fa2ceac5644ff49ae0ed12358`)
was a prebuilt binary copied from
[x4converter.rho.sh](https://x4converter.rho.sh) by
[fdkevin0](https://github.com/fdkevin0). They have not published the
source for that specific build. The WASM in this repo today is built
fresh from upstream CoolReader using the recipe in
[`wasm-build/`](../wasm-build/), and it preserves the same JavaScript
API the rest of the codebase already depends on.

The vendored binary is preserved at `web/crengine.wasm.vendored` /
`web/crengine.js.vendored` for reference and rollback.

## Required JavaScript interface

Any rebuilt `crengine.{js,wasm}` pair must expose the API that
[`web/app.js`](../web/app.js) and
[`cli/converter.js`](../cli/converter.js) call. Verified end-to-end in
both web and CLI contexts.

### Module factory

Compiled with `-sMODULARIZE=1 -sEXPORT_NAME=CREngine`:

```js
CREngine().then(module => { /* use module */ });
```

### Module-level

- `Module.HEAPU8` — standard Emscripten heap view
- `Module.allocateMemory(nBytes)` — heap allocator (wraps `_malloc`); aliased in `post.js`
- `Module.freeMemory(ptr)` — heap free (wraps `_free`)
- `Module.EpubRenderer` — Embind-bound C++ class

### `EpubRenderer` class

Constructed once per document: `new Module.EpubRenderer(widthPx, heightPx)`.

I/O:

- `loadEpubFromMemory(ptr, len)` — returns `bool`; internally also calls `Render()` to lay out pages
- `registerFontFromMemory(ptr, len, name)` — stages bytes to MEMFS then registers; call **before** `loadEpubFromMemory`

Layout setters:

- `setMargins(left, top, right, bottom)` — CSS pixels
- `setFontSize(px)`, `setFontWeight(weight)`, `setInterlineSpace(percent)`, `setFontFace(name)`
- `setTextAlign(mode)` — no-op in current rebuild (CSS-document-level setting)
- `setHyphenation(0|2)` — `0` = off, `2` = algorithmic
- `setHyphenationLanguage(lang)` — needs dictionary files (not bundled)
- `resize(w, h)` — re-layout for new viewport

Status bar:

- `configureStatusBar(...9 booleans)` — JS callers paint their own bar over the framebuffer; the wrapper still uses the call to refresh internal layout state

Rendering:

- `goToPage(n)` / `renderCurrentPage()` — render into a 32-bit RGBA buffer
- `getFrameBuffer()` — returns a `Uint8Array` view aliasing WASM heap; size is `width × height × 4` bytes

Document queries:

- `getPageCount()`
- `getDocumentInfo()` — see schema below
- `getToc()` — array of `{ title, page, level }`

Lifecycle:

- `delete()` — Embind destructor

### `getDocumentInfo()` schema

```ts
{ title: string,
  authors: string,    // EPUB-canonical key
  author: string,     // alias for back-compat
  series: string,
  language: string,
  pageCount: number }
```

## Verification

Web app:

```bash
make serve  # http://localhost:8000
```

Drop `jane-austen_pride-and-prejudice.epub` from the repo root,
register a font (e.g. one of `fonts/Literata/`), and confirm pages
render.

CLI:

```bash
make cli-install
# Generate a fresh settings.json
cd cli && node index.js init && cd ..
# Edit cli/settings.json so font.path points at e.g.
#   ./fonts/Literata/Literata-VariableFont_opsz,wght.ttf
make cli-convert  INPUT=jane-austen_pride-and-prejudice.epub \
                  OUTPUT=/tmp/out.xtc \
                  CONFIG=cli/settings.json
```

The CLI's `optimize` command (`make cli-optimize ...`) does **not**
use the WASM — it's pure JS (sharp + JSZip), so the rebuilt binary
has no effect on optimizer output.

## Why this took a Dockerfile

CoolReader's CMake is built for desktop Linux with system-installed Qt,
freetype, fontconfig, etc. Cross-compiling to WASM via Emscripten
required:

- Replacing every `find_package(System)` with bundled subdirs
  (`-DCMAKE_DISABLE_FIND_PACKAGE_*`)
- Disabling the GUI executable target chain (`cr3gui`, `cr3qt`)
- Patching upstream `thirdparty_repo/*.meta.sh` for URL rot
  (zlib 1.3.1's `.tar.xz` is gone; zstd's pinned SHA512 is for the
  `.tar.gz`, not `.tar.xz`)
- Normalising bundled patch files to a uniform `--- a/foo` / `+++ b/foo`
  header so `patch -p1` works
- Suppressing modern-Clang `-Werror` defaults (`-Wcast-function-type-strict`)
  that vendored harfbuzz 2.8.2 trips
- Adding `target_include_directories` for cross-subdir headers
  (`fribidi-config.h`, etc.) since CoolReader's cmake doesn't propagate
  generated header paths to dependent targets
- Symlinking `fribidi/lib/fribidi → lib` so `#include <fribidi/fribidi.h>`
  resolves
- Setting `USE_FONTCONFIG=0` for the `crengine` target (default in
  `crsetup.h` is `1`)
- Writing ~210 lines of Embind wrapper around `LVDocView` to match the
  JS API above

All ten patches plus the wrapper live in
[`wasm-build/`](../wasm-build/) as auditable `RUN sed`/`COPY` steps.
