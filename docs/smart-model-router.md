# AI Credit Saver & Smart Model Router

The router computes a 0–100 Model Need Score from task words, risk, sensitive files, file count, active agents, context pressure, recent errors, and user level.

|  Score | Category            |
| -----: | ------------------- |
|   0–30 | `fast_cheap`        |
|  31–60 | `standard_code`     |
|  61–80 | `advanced_code`     |
| 81–100 | `premium_reasoning` |

Provider model names are not hard-coded. A catalog maps configurable categories to display labels and relative cost. Savings are relative planning estimates, not provider invoices.

Simple documentation, formatting, translation, and naming work lowers the score. Architecture, security, authentication, payments, risky migrations, production incidents, and multiple sensitive files raise it. High daily/weekly usage adds an economy recommendation but does not weaken the risk threshold.

The monitor never changes the model automatically. `requiresConfirmation` is always true.

Codinfy Agent Monitor · `/codinfy saver` · `/codinfy model-advice`
Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
