# Celebration clips

Drop your own celebration clips here (mp4 for video, mp3 for a music track).
They are picked up automatically once you list them in `src/lib/celebration.js`
— add an entry to the `MEMES` array pointing at `/memes/your-file.mp4` and it
becomes part of the random rotation that plays when a new sale lands.

No clips ship with the repo, and nothing in this folder should be committed:
use media you have the rights to. If no clips are configured (or a file fails
to load), the app skips the video and just fires the regular confetti.
