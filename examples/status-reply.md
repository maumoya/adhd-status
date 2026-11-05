# Example

Earlier in the session the assistant asked the user to run a database migration, opened a
change whose tests are still running, fixed a README typo, and promised a rate limit that was
never added.

**User:** `STATUS`

**Assistant:**

| Task | Why | Status |
|---|---|---|
| Database migration | new signup fields work | 👉 you: run it, ~1 min |
| Login rate limit | stops password guessing | ⚠️ forgotten, not started, ~20 min |
| Signup form | new users can join | 🔄 tests running, ~8 min |
| README typo | docs read right | ✅ merged |

```bash
npm run migrate
```

Next turn the assistant checks the migration result itself; the user never pastes output.
