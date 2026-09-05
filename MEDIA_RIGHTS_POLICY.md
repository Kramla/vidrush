# Media discovery and publishing-rights policy

ScriptFlow separates three independent decisions:

1. **Discovery:** a search provider returns a potentially relevant asset.
2. **Visual verification:** Gemini inspects copied image pixels or sampled video frames and confirms that the asset satisfies the scene's exact visual contract.
3. **Rights clearance:** the asset has recorded reuse terms that permit the intended commercial, edited video use.

An asset is eligible for automatic selection and n8n publishing only when both visual verification and rights clearance pass. A visually accurate result with unknown rights is rejected. A licensed but visually inaccurate result is also rejected.

## Automatically eligible sources

- Pexels assets with their Pexels source page and license URL recorded.
- Pixabay assets with their Pixabay source page and license URL recorded.
- Unsplash assets with their Unsplash source page and license URL recorded.
- Wikimedia Commons and Openverse assets only when API metadata identifies public domain, CC0, or an unrestricted CC BY license.
- Gemini Image and Gemini Veo outputs with the generation model, prompt, provider terms, and a warning to review third-party logos, characters, artwork, and likenesses.

The strict open-license filter rejects missing or unknown licenses and automatically excludes NonCommercial, NoDerivatives, and ShareAlike variants. ShareAlike material can be lawful, but this workflow does not yet automate downstream license compatibility and relicensing obligations, so it requires manual legal review.

## Why not download from all Google Images results

A search result proves that media is discoverable, not that it is licensed. Google Images, ordinary web search, social platforms, news sites, films, and other YouTube videos can expose copyrighted media without granting reuse permission. Gemini can judge visual relevance, but it cannot create a license or reliably determine ownership from pixels.

The whole internet may be used as a **discovery layer**, but automatic downloading must remain blocked until a rights resolver verifies a source-page license or the user records direct permission. There is no honest way to guarantee zero Content ID claims or copyright strikes; even correctly licensed work may receive an erroneous claim.

## Safe broader-web connector

A future Google Programmable Search, Bing, Brave, or similar connector should return discovery records only. Before an item can enter the candidate pool, the backend must:

1. Resolve the original publisher page rather than use a search thumbnail.
2. Extract machine-readable license metadata and creator attribution.
3. Accept only configured commercial-use and modification-compatible licenses.
4. Store the source URL, license URL, creator, retrieval time, and evidence level.
5. Save a hash or snapshot of the license evidence for dispute support.
6. Check model/property releases when recognizable people, private property, trademarks, or protected artwork are prominent.
7. Copy the original media, then run Gemini pixel/frame verification against the visual contract.
8. Block automatic publishing if any evidence is missing or contradictory.

## Official references

- YouTube copyright guidance: https://support.google.com/youtube/answer/2797466
- YouTube license types and attribution: https://support.google.com/youtube/answer/2797468
- Creative Commons license conditions: https://creativecommons.org/cc-licenses/
- Pexels license: https://www.pexels.com/license/
- Pixabay license summary: https://pixabay.com/service/license-summary/
- Unsplash license: https://unsplash.com/license

This policy is a technical risk-control system, not legal advice or a guarantee against claims.
