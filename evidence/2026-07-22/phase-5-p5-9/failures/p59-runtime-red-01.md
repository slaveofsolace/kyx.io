# P5.9 retained red — Vite launcher quoting

The first Vite bootstrap through a nested command-shell string failed on Windows quoting. The service was then launched directly through the Node runtime with `VITE_KYX_AUTHORITY_ORIGIN=http://127.0.0.1:8787`; Vite became healthy on `127.0.0.1:5173` and the two-client run continued.
