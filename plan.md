1. **Understand the problem**:
    - The current `handleListFeeds` function performs an N+1 query by mapping over `feedIds` (which is an array of strings) and fetching the `feed:{feedId}` from KV for each ID.
    - Our memory indicates we should implement a denormalized pattern where `user:${userId}:feeds` stores an array of `(string | Omit<Feed, "userId">)`.
    - It also indicates we should implement a lazy migration in `handleListFeeds` so that if legacy strings are found, we fetch them via `env.DATA.get` concurrently using `Promise.all` and then rewrite the array with the objects if any strings were migrated.

2. **Measure / Benchmark**:
    - The existing `tests/performance-feeds.test.ts` already benchmarks the fallback GET behavior. I will add a second test in it for the denormalized behavior to show the massive performance improvement.

3. **Implement**:
    - Update `handleCreateFeed` to push a denormalized feed object (`Omit<Feed, "userId">`) to the user's feed list instead of just the ID.
    - Update `handleListFeeds` to parse the array as `(string | Omit<Feed, "userId">)[]`. Map over it, returning the object directly if it's not a string, or doing the fallback `env.DATA.get` if it is a string. Set a `needsMigration` flag if strings are found.
    - Write back to KV if `needsMigration` is true, replacing the old string list with the fetched objects.
    - Update `handleDeleteFeed` to handle filtering the array where elements might be strings or objects.

4. **Verify**:
    - Run the tests (`bun run test`) and `tests/performance-feeds.test.ts`.
    - Verify types are correct.

5. **Pre-commit**:
    - Complete pre commit steps to make sure proper testing, verifications, reviews and reflections are done.
    - Call `pre_commit_instructions`.

6. **Submit**:
    - Submit PR with measured performance improvement.
