# Difficult-user scenario notes

Inputs: `demos/scenarios/`. Transcripts: `demos/transcripts/`. Runner: `backend/scripts/run-demo.ts` (`npm --prefix backend run demo`).

## Contradiction
User states incompatible values without clear correction language (e.g. 750 ml then 1 litre).  
**Why this way:** reducer marks the field `conflicted` and records both sides; gate blocks generation until an explicit correction resolves it. Ambiguity is not silently overwritten.

## Prompt injection
User tries to override role / reveal hidden instructions.  
**Why this way:** extractor intent `meta_instruction` is contained; hostile text does not rewrite ProductBrief; assistant stays on product-copy work. Control flow never moves into the model.

## Vague input
User gives non-precise data (e.g. price “cheap”).  
**Why this way:** stored as `vague` with `raw_text`, not invented as `$X`. Gate may ask once; if user declines precision, an assumption is recorded and generation can proceed without fabricating a number.

## Correction after delivery (extra)
After copy exists, “change the price to $199” overwrites with history preserved and regenerates from the updated brief.
