1. **Update Waitlist Signup:** Modify `env.WAITLIST.put` in `handleWaitlistSignup` to store `entry` as metadata so we can access it using `list({ metadata: true })` without subsequent GET queries.
2. **Update Admin List:** In `handleAdminList`, pass `{ metadata: true }` to `env.WAITLIST.list()`.
3. **Lazy Migration:** In the `list.keys` mapping inside `handleAdminList`, check if `key.metadata` exists. If so, return it directly. If not, do a `get(key.name)`, parse the entry, rewrite the entry to `env.WAITLIST` with metadata to avoid future N+1 issues, and return the parsed entry.
4. **Pre-commit:** Complete pre-commit steps to make sure proper testing, verifications, reviews and reflections are done.
5. **Submit:** Commit code and open a PR with the performance stats.
