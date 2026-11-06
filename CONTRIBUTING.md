# Contributing

Thanks for helping. adhd-status is one Markdown skill file plus docs, so changes are small.

## How to contribute

- **Bugs and ideas:** open an [issue](https://github.com/maumoya/adhd-status/issues). Say what you
  asked, what the skill replied, and what you expected.
- **Security problems:** do not open a public issue; follow [SECURITY.md](SECURITY.md).
- **Changes:** fork, branch, and open a pull request against `main`.

## Requirements for a pull request

- English only, plain words, short sentences.
- Keep the skill's promise: one table (leaf: 3 rows, last finished, now, next; main: every open row, grouped; master: one row per main thread plus at most 5 critical actions) and one next action.
- The CodeQL check must pass before merge.
- No tracking, network calls or data collection (see [PRIVACY.md](PRIVACY.md)).

## Tests

The `evals/` folder is the test suite, in the format `claude plugin eval` reads. Run it from the
repository root:

```bash
claude plugin eval . --scaffold --allow-tools Edit,Write,Bash
```

The free offline checks (reply linter, hooks, eval folders) run in CI and locally:

```bash
python3 -I -m unittest discover -s tests
```

**Policy:** every change to the skill's behavior adds or updates a test case in `evals/` that would
fail without the change. Pull requests that change behavior without a test are not merged.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
