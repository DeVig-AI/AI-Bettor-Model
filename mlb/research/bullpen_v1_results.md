# MLB bullpen study v1 -- results

Run 2026-10-22T21:44:12Z, exactly as `MLB_BULLPEN_STUDY_V1_PREREG.md`: walk-forward, test seasons 2015-2025, 22,697 games. Relief rows read: 823,514; games with bullpen features: 33,561 of 33,561.

| Pooled 2015-2025 | Log loss | Brier | Accuracy |
|---|---|---|---|
| Model C (10) | 0.6828 | 0.2449 | 56.1% |
| C + bullpen (14) | 0.6828 | 0.2449 | 55.9% |

Log-loss change +0.00005 (95% interval -0.00018 to +0.00027); better in 7 of 11 seasons -> **no clear help**.

| Season | C log loss | C+bullpen | C accuracy | C+bullpen |
|---|---|---|---|---|
| 2015 | 0.6861 | 0.6863 | 55.7% | 55.7% |
| 2016 | 0.6868 | 0.6865 | 55.3% | 55.6% |
| 2017 | 0.6815 | 0.6812 | 55.8% | 55.3% |
| 2018 | 0.6781 | 0.6779 | 57.9% | 57.2% |
| 2019 | 0.6799 | 0.6809 | 58.1% | 57.6% |
| 2020 | 0.6771 | 0.6765 | 57.7% | 57.8% |
| 2021 | 0.6800 | 0.6799 | 56.6% | 56.5% |
| 2022 | 0.6788 | 0.6784 | 57.6% | 57.5% |
| 2023 | 0.6895 | 0.6893 | 52.9% | 53.3% |
| 2024 | 0.6862 | 0.6863 | 55.7% | 55.4% |
| 2025 | 0.6831 | 0.6836 | 54.8% | 54.6% |
