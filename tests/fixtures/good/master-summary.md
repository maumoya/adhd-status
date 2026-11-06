| Task | Why | Status |
|---|---|---|
| **Main threads** | | |
| Core platform | the base everything runs on | 👉 9 open, 1 blocked, 2 need you |
| Production | ship the products | 🔄 4 open, 0 blocked, 0 need you |
| Job search | land the next job | ✅ 0 open |
| **Critical** | | |
| Login release | sign in from the phone | 👉 in core platform thread, ~2 min |
| Nightly backup | don't lose data | ❌ in core platform thread, ~20 min |
| Store listing | app can go public | ⏸ in production thread, after review |
