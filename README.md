# Latin Fake Book — Play-Along

A free, offline web app (PWA) for practising Latin music: lead sheets and big chord charts, with a real-sampled piano and bass band
(bossa nova, samba, salsa/son montuno, cha-cha-chá, bolero, mambo, rumba, merengue, cumbia, tango, Afro-Cuban 6/8, habanera and vals).
Turn the **melody on or off**, change the key and speed, loop any bars, read in C, B♭ or E♭, and add your own songs.

Open it: https://frod2022-ui.github.io/latin-fakebook/

* Your own songs are stored only in your browser on your device (localStorage). Nothing is uploaded. Use "Back up my songs" to save a file.
* Import your own files: ABC, chord charts, MusicXML, MIDI, and Band-in-a-Box songs (.SGU/.MGU) with their MIDI styles (.STY), single files or a whole folder.
  Band-in-a-Box files are read on your device and kept there (styles in IndexedDB); the app ships no Band-in-a-Box content. Its reader was written
  from public format notes (JJazzLab, MuseScore) and from inspecting files; styles are best effort (drum-grid drums and strings are not played).
* Built-in songs are traditional or public domain (see "About this song" in the app for each source), plus original practice progressions.
* Instrument samples: Salamander Grand Piano (CC BY 3.0, Alexander Holm), FluidR3 GM via midi-js-soundfonts (MIT), VSCO 2 Community Edition (CC0). See samples/CREDITS.txt.
