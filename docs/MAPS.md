# Map requests

The standard basemap uses OpenStreetMap tiles. The app must identify requests,
display attribution, respect HTTP caching, and request only the visible area.
See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Web pages use `strict-origin-when-cross-origin`, and the tile layer explicitly
sets the same referrer policy. This sends the local app origin without exposing
report paths, keywords, business IDs, or query parameters to the tile server.
An app-wide `no-referrer` header can cause the provider to reject requests.

The desktop app adds a stable SEO Bunny User-Agent for requests to the tile
host only. Google OAuth/API response policies remain separate from tile requests.
Tiles use normal browser caching. No proxy, cache-busting URL, automatic retry
loop, background download, or offline tile collection is used.

Table rows open a map on demand rather than loading a basemap for each row.
The main map fits captured locations on first display and updates its dimensions
when its container resizes. Selecting a pin does not reset the user's zoom.

If tiles fail, checkpoint data stays visible on a neutral surface with a clear
message and a manual retry button. Availability remains subject to the provider;
the app does not switch identities or providers to bypass a block.
