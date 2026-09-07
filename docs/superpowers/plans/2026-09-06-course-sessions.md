# Custom-course marking sessions

The user approved replacing the fixed EEE301 setup with a working new-course
flow. Setup starts blank, accepts course code/title plus assessment context and
answers, and carries that identity through the existing analysis/save/export
pipeline. Loading the sample is explicit. Custom drafts never open sample
results as if their own answers had been analysed.

- [ ] Add separate in-memory setup draft state, editable course metadata,
  new-session controls, and matching navigation labels.
- [ ] Verify custom identity through analysis, recovery, persistence, and
  exports; preserve existing CSV validation and prevent accidental paid demos.
- [ ] Run focused tests, production build, and desktop/mobile browser checks.
  Report remaining live-service configuration requirements accurately.

The draft remains separate from the active reviewed session and survives route
navigation. Account changes clear it. Existing saved sessions retain their
course details. No real student data or paid AI calls are used in verification.

Local readiness: Supabase URL/anon key and Gemini key are present; the server
service-role key is missing. The user has been asked to add it locally. Hosted
migration status must be verified before claiming live marking works.
