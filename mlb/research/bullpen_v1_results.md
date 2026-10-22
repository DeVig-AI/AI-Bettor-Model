# MLB bullpen study v1 -- results

Run 2026-10-22T21:32:12Z, exactly as `MLB_BULLPEN_STUDY_V1_PREREG.md`: walk-forward, test seasons 2015-2025, 22,697 games. Relief rows read: 0; games with bullpen features: 33,561 of 33,561.

| Pooled 2015-2025 | Log loss | Brier | Accuracy |
|---|---|---|---|
| Model C (10) | 0.6828 | 0.2449 | 56.1% |
| C + bullpen (14) | 0.6828 | 0.2449 | 56.1% |

Log-loss change -0.00000 (95% interval -0.00000 to +0.00000); better in 0 of 11 seasons -> **no clear help**.

| Season | C log loss | C+bullpen | C accuracy | C+bullpen |
|---|---|---|---|---|
| 2015 | 0.6861 | 0.6861 | 55.7% | 55.7% |
| 2016 | 0.6868 | 0.6868 | 55.3% | 55.3% |
| 2017 | 0.6815 | 0.6815 | 55.8% | 55.8% |
| 2018 | 0.6781 | 0.6781 | 57.9% | 57.9% |
| 2019 | 0.6799 | 0.6799 | 58.1% | 58.1% |
| 2020 | 0.6771 | 0.6771 | 57.7% | 57.7% |
| 2021 | 0.6800 | 0.6800 | 56.6% | 56.6% |
| 2022 | 0.6788 | 0.6788 | 57.6% | 57.6% |
| 2023 | 0.6895 | 0.6895 | 52.9% | 52.9% |
| 2024 | 0.6862 | 0.6862 | 55.7% | 55.7% |
| 2025 | 0.6831 | 0.6831 | 54.8% | 54.8% |
