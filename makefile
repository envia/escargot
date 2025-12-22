.PHONY: all try

all: third_party/GCutil/CMakeLists.txt build.ninja
	ninja

try: third_party/GCutil/CMakeLists.txt build.ninja
	ninja -k0

third_party/GCutil/CMakeLists.txt:
	git submodule update --init --recursive

build.ninja:
	cmake -DESCARGOT_MODE=release -DESCARGOT_OUTPUT=shell -GNinja
