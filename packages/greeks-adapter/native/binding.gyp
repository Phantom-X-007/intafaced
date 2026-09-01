{
  "targets": [
    {
      "target_name": "quantlib_greeks",
      "sources": ["binding.cpp"],
      "defines": ["NAPI_VERSION=8"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions",
        "<!@(pkg-config --cflags quantlib 2>/dev/null || true)"
      ],
      "libraries": ["<!@(pkg-config --libs quantlib 2>/dev/null || echo -lQuantLib)"]
    }
  ]
}
