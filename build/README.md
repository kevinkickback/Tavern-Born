# Packaging artwork

`icon-source.png` is the retained source artwork for the platform icons. Keep it out of `public/`:
it is an editing input, not a renderer asset. The icon and installer image filenames in this folder
are consumed by the Electron Builder configuration in `package.json`.
