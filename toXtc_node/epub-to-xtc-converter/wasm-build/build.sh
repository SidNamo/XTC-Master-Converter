#!/usr/bin/env bash
# Build steps for crengine.wasm. Runs inside the Dockerfile in this directory
# (all upstream patches have been applied at image build time).

set -euo pipefail

EMSDK="${EMSDK:-/opt/emsdk}"
SRC="${SRC:-/opt/coolreader}"
WRAPPER="${WRAPPER:-/opt/wrapper}"
OUT="${OUT:-/out}"
BUILD="${BUILD:-/opt/build-wasm}"

echo "==> Activating Emscripten"
# shellcheck disable=SC1091
source "${EMSDK}/emsdk_env.sh"
em++ --version | head -n1

echo "==> Configuring with emcmake (GUI=CRGUI_XCB, no executable)"
mkdir -p "${BUILD}"
cd "${BUILD}"
emcmake cmake "${SRC}" \
  -DGUI=CRGUI_XCB \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TOOLS=OFF \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_DISABLE_FIND_PACKAGE_PNG=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_ZLIB=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_BZip2=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_HarfBuzz=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_BrotliDec=TRUE

echo "==> Building bundled thirdparty libraries"
# Build deps explicitly to ensure generated headers (zconf.h, fribidi-config.h)
# exist before crengine compiles. `make crengine` doesn't trigger ordering.
emmake make -j"$(nproc)" \
  zlibstatic png jpeg freetype harfbuzz fribidi unibreak libzstd_static \
  chmlib antiword qimagescale

echo "==> Building libcrengine.a"
emmake make -j"$(nproc)" crengine
ls -la "${BUILD}/crengine/libcrengine.a"

echo "==> Linking crengine.js + crengine.wasm with EpubRenderer wrapper"
mkdir -p "${OUT}"
em++ -O3 \
  -I "${SRC}/crengine/include" \
  -I "${SRC}/crengine/src" \
  "${WRAPPER}/EpubRenderer.cpp" \
  "${BUILD}/crengine/libcrengine.a" \
  "${BUILD}/thirdparty/freetype-2.11.0/libfreetype.a" \
  "${BUILD}/thirdparty/harfbuzz-2.8.2/libharfbuzz.a" \
  "${BUILD}/thirdparty/fribidi-1.0.10/libfribidi.a" \
  "${BUILD}/thirdparty/libunibreak-4.3/libunibreak.a" \
  "${BUILD}/thirdparty/libpng-1.6.37/libpng.a" \
  "${BUILD}/thirdparty/jpeg-9d/libjpeg.a" \
  "${BUILD}/thirdparty/zlib-1.3.1/libzlibstatic.a" \
  "${BUILD}/thirdparty/zstd-1.5.0/build/cmake/lib/libzstd.a" \
  "${BUILD}/thirdparty_unman/chmlib/libchmlib.a" \
  "${BUILD}/thirdparty_unman/antiword/libantiword.a" \
  "${BUILD}/thirdparty_unman/qimagescale/libqimagescale.a" \
  -lembind \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=CREngine \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=64MB \
  -sEXPORTED_RUNTIME_METHODS="['HEAPU8']" \
  -sEXPORTED_FUNCTIONS="['_malloc','_free','_allocateMemory','_freeMemory']" \
  --post-js "${WRAPPER}/post.js" \
  --bind \
  -o "${OUT}/crengine.js"

echo "==> Done. Artifacts:"
ls -la "${OUT}"
