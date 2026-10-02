# Celebration clips

Drop your own celebration clips here (mp4 for video, mp3 for a music track).
To use one, add an entry to the `MEMES` array in `src/lib/celebration.js`
pointing at `/memes/your-file.mp4`. It then joins the random rotation that
plays when a new sale lands.

No clips ship with the repo, and nothing in this folder should be committed:
use media you have the rights to. If no clips are configured (or a file fails
to load), the app skips the video and just fires the regular confetti.
