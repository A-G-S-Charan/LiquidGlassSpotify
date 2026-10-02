# Liquid Glass for Spotify

Turns the Spotify desktop app into an Apple-style "liquid glass" interface, with the current song's
Canvas video playing blurred behind the whole window.

Built as a [Spicetify](https://spicetify.app) extension for Windows.

## What it does

- **Canvas video background** - the short looping clip Spotify ships with many songs plays blurred
  behind the entire app, with a slow liquid wobble. Songs without a Canvas use their album art as a
  slowly drifting blur instead.
- **Glass everywhere** - the library, main area, side panels, menus, dropdowns, tooltips, dialogs and
  popups all become frosted glass over that background.
- **Lyrics focus** - the line that's playing is sharp and glowing, its neighbours stay sharp, and the
  blur builds up gradually with distance from it.
- **Lyrics in the middle column** - the mic button opens the lyrics between your library and the song
  details panel. Full-screen lyrics are untouched.
- **Lite mode** - a droplet button in the top bar switches between full quality and a much lighter
  version for low-end PCs. Your choice is remembered.
- **Transparent window buttons** - the minimise/maximise/close buttons lose their dark box.

## Install (Windows)

1. Install Spotify from [spotify.com/download](https://www.spotify.com/download/windows/) - the
   Microsoft Store version cannot be modified. Open it and log in once.
2. Download this repo (**Code → Download ZIP**) and extract it.
3. Double-click **`Install.bat`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**.
   - If Spicetify isn't installed, the installer fetches it from the official Spicetify repo. Only
     what this theme needs is installed - the Spicetify Marketplace is not.

Spotify restarts with the new look.

After a Spotify update the look can disappear; run `Install.bat` again to restore it.

## Remove

Double-click **`Uninstall.bat`**. It removes this extension and leaves Spicetify and any other
extensions you use alone. To undo all Spicetify changes to Spotify: `spicetify restore`.

## Settings

Open `%APPDATA%\spicetify\Extensions\liquidGlass.js` in a text editor and change the `CONFIG` values
at the top, then run `spicetify apply`:

| Setting | Default | What it does |
| --- | --- | --- |
| `videoBrightness` | `0.6` | Lower is darker |
| `videoContrast` | `0.95` | Higher is punchier |
| `videoBlur` | `30` | Blur of the background video, in px |
| `panelTint` | `0.38` | 0 = clear glass, 1 = solid black panels |
| `liquidWobble` | `true` | The animated distortion on the video |

For a weak PC, use the droplet button in the top bar (Lite mode) rather than editing these.

## If Spotify feels slow

1. Turn on **Hardware acceleration** in Spotify's settings, then restart Spotify. This is the usual
   cause.
2. Plug the laptop in and set Windows power mode to Balanced or Best performance.
3. On dual-graphics laptops, set `Spotify.exe` to High performance under
   Windows Settings → System → Display → Graphics.
4. Still slow? Switch on Lite mode with the droplet button.

## How it works

The extension reads the WebM version of the song's Canvas that Spotify streams itself, stitches the
segments into a looping clip and plays it behind the app (the plain `.mp4` Canvas link can't be
decoded by Spotify's desktop build). The rest is CSS: Spotify's background colour tokens are made
transparent and its panels are re-drawn as glass. Spotify's class names are scrambled and change
between versions, so the lyric line classes are discovered at runtime from Spotify's own stylesheet.

## Notes

- Windows only, and it needs the Spotify desktop app.
- Spotify's lyrics only say which line is playing, not which word, so there is no word-by-word
  highlight. For that, see the
  [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics) extension.
- Not affiliated with Spotify. Modifying the client is not officially supported.
