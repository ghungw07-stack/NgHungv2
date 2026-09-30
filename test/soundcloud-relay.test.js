import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSoundCloudDownloadRelayUrl,
  parseSoundCloudRelayJson,
  resolveSoundCloudArtwork,
  resolveSoundCloudCanvasArtwork,
  resolveSoundCloudArtworkCandidates,
} from "../src/service-ngh/api-crawl/music-content/soundcloud-relay.js";

test("parses SoundCloud JSON returned through the Web relay", () => {
  const payload = [
    "Title: ",
    "",
    "URL Source: http://api-v2.soundcloud.com/search/tracks?q=test",
    "",
    "Markdown Content:",
    '{"collection":[{"id":123,"title":"Test track"}]}',
  ].join("\n");

  assert.deepEqual(parseSoundCloudRelayJson(payload), {
    collection: [{ id: 123, title: "Test track" }],
  });
});

test("accepts direct SoundCloud JSON responses unchanged", () => {
  const payload = { url: "https://cf-media.sndcdn.com/example.mp3" };
  assert.equal(parseSoundCloudRelayJson(payload), payload);
});

test("builds a relay URL for the selected SoundCloud track", () => {
  const value = buildSoundCloudDownloadRelayUrl({
    permalink_url: "https://soundcloud.com/artist/tim-em",
    title: "Tim em & o lai",
    user: { username: "Nghe si" },
  });
  const url = new URL(value);

  assert.equal(url.hostname, "soundcloudmp3.org");
  assert.equal(url.pathname, "/download.php");
  assert.equal(url.searchParams.get("sc"), "https://soundcloud.com/artist/tim-em");
  assert.equal(url.searchParams.get("title"), "Tim em & o lai");
  assert.equal(url.searchParams.get("artist"), "Nghe si");
});

test("rejects non-SoundCloud relay targets", () => {
  assert.equal(buildSoundCloudDownloadRelayUrl({ permalink_url: "https://example.com/audio" }), null);
});

test("uses track artwork first and falls back to the SoundCloud user avatar", () => {
  assert.equal(
    resolveSoundCloudArtwork({ artwork_url: "https://i1.sndcdn.com/artworks-test-large.jpg" }),
    "https://i1.sndcdn.com/artworks-test-t500x500.jpg"
  );
  assert.equal(
    resolveSoundCloudArtwork({ user: { avatar_url: "https://i1.sndcdn.com/avatars-test-t50x50.jpg" } }),
    "https://i1.sndcdn.com/avatars-test-t500x500.jpg"
  );
});

test("keeps waveform and avatar fallbacks for unavailable artwork", () => {
  assert.deepEqual(
    resolveSoundCloudArtworkCandidates({
      artwork_url: "https://i1.sndcdn.com/artworks-test-large.jpg",
      waveform_url: "https://wave.sndcdn.com/test.png",
      user: { avatar_url: "https://i1.sndcdn.com/avatars-test-t50x50.jpg" },
    }),
    [
      "https://i1.sndcdn.com/artworks-test-t500x500.jpg",
      "https://wave.sndcdn.com/test.png",
      "https://i1.sndcdn.com/avatars-test-t500x500.jpg",
    ]
  );
});

test("proxies SoundCloud artwork used by the result canvas", () => {
  const value = resolveSoundCloudCanvasArtwork({
    artwork_url: "https://i1.sndcdn.com/artworks-test-large.jpg",
  });
  const url = new URL(value);
  assert.equal(url.hostname, "images.weserv.nl");
  assert.equal(url.searchParams.get("url"), "https://i1.sndcdn.com/artworks-test-t500x500.jpg");
  assert.equal(url.searchParams.get("w"), "180");
  assert.equal(url.searchParams.get("h"), "180");
});
