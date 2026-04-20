# Makefile for EPUB to XTC Converter & Optimizer

.PHONY: all serve docker-serve cli-install cli-convert cli-optimize \
        wasm-build wasm-run wasm-install wasm tag help

PORT ?= 8000
WASM_OUT ?= wasm-build/out

# Default target
all: help

## Development:

serve: ## Run local web server (http://localhost:8000)
	@echo "Starting server at http://localhost:8000"
	@cd web && python3 -m http.server 8000

docker-serve: ## Run in Docker (Ctrl+C to stop). Usage: make docker-serve [PORT=8000]
	@docker build -t epub-to-xtc .
	@echo "Running at http://localhost:$(PORT) (Ctrl+C to stop)"
	@docker run --rm -p $(PORT):8000 epub-to-xtc

## CLI:

cli-install: ## Install CLI dependencies
	@cd cli && npm install

cli-convert: ## Convert EPUB to XTC. Usage: make cli-convert INPUT=book.epub OUTPUT=book.xtc CONFIG=settings.json
	@cd cli && node index.js convert $(INPUT) -o $(OUTPUT) -c $(CONFIG)

cli-optimize: ## Optimize EPUB for e-paper. Usage: make cli-optimize INPUT=book.epub OUTPUT=optimized.epub CONFIG=settings.json
	@cd cli && node index.js optimize $(INPUT) -o $(OUTPUT) -c $(CONFIG)

## WASM rebuild:

wasm-build: ## Build the Docker image that compiles crengine.wasm from source (~15 min first run)
	@docker build -t crengine-wasm-build wasm-build

wasm-run: ## Run the build inside the image; produces wasm-build/out/crengine.{js,wasm}
	@mkdir -p $(WASM_OUT)
	@docker run --rm -v "$(abspath $(WASM_OUT)):/out" crengine-wasm-build
	@ls -la $(WASM_OUT)

wasm-install: ## Drop the freshly built artifacts into web/ (preserves vendored copies on first run)
	@test -f $(WASM_OUT)/crengine.wasm && test -f $(WASM_OUT)/crengine.js || { echo "Missing artifacts in $(WASM_OUT)/ (need crengine.js and crengine.wasm). Run 'make wasm-run' first."; exit 1; }
	@if [ ! -f web/crengine.js.vendored ] || [ ! -f web/crengine.wasm.vendored ]; then \
		echo "Snapshotting current web/crengine.{js,wasm} -> .vendored (missing copies only)"; \
	fi
	@[ -f web/crengine.js.vendored ]   || cp web/crengine.js   web/crengine.js.vendored
	@[ -f web/crengine.wasm.vendored ] || cp web/crengine.wasm web/crengine.wasm.vendored
	@cp $(WASM_OUT)/crengine.js   web/crengine.js
	@cp $(WASM_OUT)/crengine.wasm web/crengine.wasm
	@echo "Installed:"; ls -la web/crengine.js web/crengine.wasm

wasm: wasm-build wasm-run wasm-install ## End-to-end: build image, run build, install into web/

## Release:

tag: ## Create and push a version tag (triggers GitHub release)
	@read -p "Enter tag version (e.g., 1.0.0): " TAG; \
	if [[ $$TAG =~ ^[0-9]+\.[0-9]+\.[0-9]+$$ ]]; then \
		git tag -a v$$TAG -m "v$$TAG"; \
		git push origin v$$TAG; \
		echo "Tag v$$TAG created and pushed successfully."; \
	else \
		echo "Invalid tag format. Please use X.Y.Z (e.g., 1.0.0)"; \
		exit 1; \
	fi

## Help:

help: ## Show this help
	@echo "EPUB to XTC Converter - Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; section=""} \
		/^##/ { section=substr($$0, 4); next } \
		/^[a-zA-Z_-]+:.*##/ { \
			if (section != "") { printf "\n\033[1m%s\033[0m\n", section; section="" } \
			printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 \
		}' $(MAKEFILE_LIST)
	@echo ""