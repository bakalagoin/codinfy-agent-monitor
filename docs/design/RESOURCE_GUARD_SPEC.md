# Resource Guard

Route `/resource-guard` uses live OS memory plus sampled Node CPU/memory. Default warnings are process CPU ≥85%, process memory ≥2 GiB, and system memory ≥85%.

States are healthy, warning, and critical. Recommendations are non-destructive and route back to process inspection. The system never stops a process because a threshold was crossed.

© CODINFY PLATFORMS SASU · codinfy.com
