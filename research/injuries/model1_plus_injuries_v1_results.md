# NFL Model 1.0 vs 1.0 + injuries -- results

Run 2026-10-22T22:22:17Z, exactly as `NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md`. 2,227 games (2,227 with injury features); Model 1.0 reproduced to 2.4e-11.

| Walk-forward 2020-2025 | Log loss | Brier | Accuracy |
|---|---|---|---|
| Model 1.0 | 0.6402 | 0.2245 | 64.6% |
| 1.0 + injuries | 0.6348 | 0.2221 | 64.4% |

Log-loss change -0.00540 (95% interval -0.01007 to -0.00066); better in 4 of 6 seasons -> **BETTER: build Model 2.0**.

| Season | 1.0 log loss | + injuries | 1.0 accuracy | + injuries |
|---|---|---|---|---|
| 2020 | 0.6461 | 0.6473 | 61.7% | 61.7% |
| 2021 | 0.6673 | 0.6584 | 60.7% | 61.8% |
| 2022 | 0.6219 | 0.6123 | 66.9% | 67.6% |
| 2023 | 0.6694 | 0.6673 | 62.8% | 60.7% |
| 2024 | 0.6117 | 0.5978 | 69.8% | 71.6% |
| 2025 | 0.6251 | 0.6263 | 65.3% | 63.2% |
