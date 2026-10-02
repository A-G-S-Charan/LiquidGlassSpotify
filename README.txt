LIQUID GLASS FOR SPOTIFY
========================

Turns the Spotify desktop app into Apple-style "liquid glass":
  - the current song's Canvas video plays, blurred, behind the whole app
  - every panel, menu and popup becomes frosted glass
  - lyrics get a soft glow on the current line
  - the lyrics (mic) button opens the lyrics in the middle, between your library
    and the song details panel (full-screen lyrics still work as usual)
  - songs without a Canvas show their album art as a slowly moving blur

HOW TO INSTALL
--------------
1. Make sure you have Spotify from spotify.com/download
   (NOT the Microsoft Store version), and you've opened it and logged in once.
2. Extract this whole zip to a folder.
3. Double-click  Install.bat
   - If Windows shows "Windows protected your PC", click  More info  ->  Run anyway.
   - If Spicetify isn't installed yet, the installer downloads it from its
     official site (github.com/spicetify). Only the parts Liquid Glass needs
     are installed - the Spicetify Marketplace is not.
4. Spotify restarts with the new look.

LITE MODE (for low-end PCs)
---------------------------
Look for the droplet button in Spotify's top bar, next to the back/forward
arrows. Click it to switch between:

  Full quality  - everything on (default)
  Lite mode     - same design, much lighter on the PC:
                  * no liquid wobble on the background video (the heaviest effect)
                  * much smaller blurs everywhere
                  * no sheen / rotating album-art animations
                  * streams a smaller Canvas video (426p instead of 854p)

The button dims while Lite is on, and your choice is remembered.

IF SPOTIFY STILL FEELS SLOW
---------------------------
1. Turn ON hardware acceleration: Spotify -> Settings -> Hardware acceleration,
   then restart Spotify. (This is the most common cause of lag.)
2. Plug the laptop in, and set Windows power mode to Balanced or Best
   performance (battery saver throttles the graphics a lot).
3. Dual-graphics laptops: Windows Settings -> System -> Display -> Graphics,
   add Spotify.exe and set it to High performance.

AFTER A SPOTIFY UPDATE
----------------------
Spotify updates can remove the look. Just double-click Install.bat again.

HOW TO REMOVE
-------------
Double-click  Uninstall.bat  (keeps Spicetify and your other extensions).
To remove all Spicetify changes from Spotify, run in PowerShell:  spicetify restore

TWEAKING
--------
Open  %APPDATA%\spicetify\Extensions\liquidGlass.js  in Notepad and change the
CONFIG values at the top (video brightness/contrast/blur, glass darkness).
Then run  spicetify apply.

Requires Windows 10/11 and the Spotify desktop app. Uses Spicetify (spicetify.app).
