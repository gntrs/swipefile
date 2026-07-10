# Party mode clips

Optional "party mode" plays a fullscreen video when a sale lands (desktop
only). It ships **off** with no clips bundled.

To enable it:

1. Drop one or more `.mp4` files in this folder.
2. Register them in [`src/lib/celebration.js`](../../src/lib/celebration.js)
   in the `MEMES` array (see the example at the top of that file).
3. Turn it on from the app: **Profile -> Party mode**, and hit **Test**.

Each meme can:

- play a **random N-second slice** of a longer clip (`clip: 20`), or
- **loop** a short clip N times (`loops: 2`), optionally with its
  green screen keyed out (`chroma: true`) and an overlay music track.

**Only add media you have the right to use.** Don't commit copyrighted
film or music to a public repo.
