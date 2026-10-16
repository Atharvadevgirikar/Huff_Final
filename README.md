# HuffZip — Vercel Static Edition

This version is a static HTML/CSS/JavaScript website deployable on Vercel. The UI and tree walkthrough are retained. The browser-side JavaScript implementation performs analysis, compression and decompression without PHP, server storage, or a server-side compiler. `huffman.c` is retained as the original C implementation/source for the NLDS project.

## Deploy to Vercel
1. Upload this folder to a GitHub repository (the `index.html` file must be at the repository root, or set the Root Directory to `HuffZip_NLDS` if keeping the parent folder).
2. Import the repository in Vercel.
3. Choose **Other** as framework preset. Leave Build Command and Output Directory empty (or use `.` as output directory).
4. Deploy.

## Notes
- This deployment does not execute C in the browser; the browser-side JavaScript implements the same Huffman algorithm and `.huff` file format (`HFZ1` with 256 64-bit little-endian frequencies followed by packed Huffman bits). The C source remains included for inspection/compilation in a native environment.
- Files are processed locally in the browser; the app does not upload selected files to a server.
- Maximum demo file size: 20 MB. Large files can use significant browser memory.
- Browser-side downloads are used instead of server-side download endpoints.
