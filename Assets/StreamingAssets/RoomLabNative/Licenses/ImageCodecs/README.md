# RoomLab native image codecs v1 — Windows x64

Status: built and self-tested; frozen for independent acceptance. **Not installed into Unity.**
All implementation/build/test outputs are contained in this directory. No Unity,
room-editor, game source, Packages or system PATH was changed. The build uses a
child cmd process with `setlocal` and the existing Visual Studio toolchain.

## Deliverables

- `bin/roomlab_images.dll`: one native x64 DLL, statically linked libwebp 1.6.0
  and MSVC CRT (`/MT`). No browser, ffmpeg, System.Drawing, Python, .NET or CLI
  process is used by the decoder. Python/Pillow is a fixture-generation test tool only.
- `include/roomlab_images.h`: versioned C ABI with five exports.
- `src/roomlab_images.cpp`, `build.cmd`, vendored official source archive/tree.
- `docs/RoomLabImageCodec.cs`: C# P/Invoke example tested against the real DLL.
- `tests/fixtures`, `tests/result.json`: golden encoded bytes, output frame hashes,
  delays and loops; `tests/test_codecs.py` defines expected pixels explicitly.
- `SOURCE.json`, `licenses/`, `ARTIFACTS.json` and `dist/` redistribution bundle.

`dumpbin /headers` confirms machine 8664 (x64). `dumpbin /dependents` lists only
`ole32.dll`, `SHLWAPI.dll`, `KERNEL32.dll`. WIC is loaded through the Windows COM
factory, so the installed OS component `WindowsCodecs.dll` is also required at
runtime. No third-party codec pack, Windows Store extension or VC redistributable
is required by this build. Target: ordinary Windows 10/11 x64 desktop; actual
tests ran on this Windows 11 machine, not a clean Windows 10 VM.

## Formats and behavior

GIF87a/GIF89a: strict container block bounds/trailer, in-box WIC raw frame decode,
own full-canvas composition with frame offsets, transparency and disposal 0/1/2/3.
Disposal 2 clears the old subrectangle to transparent when that frame declares
transparency; otherwise to the logical global background color. Disposal 3 restores
the canvas before that frame. GIF delay is the raw centisecond value multiplied
by 10; no undocumented browser-style minimum delay clamp is applied.

WebP: official libwebp `WebPAnimDecoder`, including static/lossless/lossy and
animated data. Canvas size/count are inspected through demux **before** animation
decoder pixel allocation. `GetNext` supplies a fully reconstructed canvas;
duration is the difference of successive millisecond timestamps. The caller's
bytes need only remain valid for the duration of Decode; output is independently owned.

Both return straight-alpha RGBA8, top-left origin, full width × height for every
frame. Format IDs GIF=1/WebP=2. `play_count=0` means infinite; other values mean
total plays (GIF's finite Netscape repeat count is converted to repeats+1).
A non-animated image has play_count=1 and duration=0. Zero frame durations remain
zero; playback policy and editor-configured frame-rate overrides belong to the
consumer. No ICC color transformation, EXIF orientation transformation, resizing,
texture allocation or animation playback is performed. GIF plain-text extension
is not rendered. Color management/orientation beyond raw decoded pixels is not
claimed browser-equivalent.

## Limits and ownership

- Encoded input 1..25 MiB; each side 1..4096; 1..1024 frames.
- Before allocating RGBA output, `(frame_count + 3) * width * height * 4`
  must be at most 128 MiB. Three canvas allowances cover composition buffers.
  This is an RGBA-buffer budget, not a guarantee that all native heap/OS/WIC
  metadata and compressed decoder scratch fit inside exactly 128 MiB.
- No filesystem path, output directory or user entry extraction exists in the ABI.
  Images are decoded only from caller-provided bytes. No external process starts.
- `RlImageDecode` returns 0 on success. On failure output is NULL and a bounded
  ASCII error is returned; no C++ exception crosses the ABI. `GetInfo/GetFrame`
  return nonzero for invalid/null arguments or frame indexes.
- `GetFrame` borrows an immutable pointer valid until `RlImageFree`.
  Free each successful handle exactly once, after all users finish. Never race
  Free against GetInfo/GetFrame; separate images can be decoded independently.
- C# sample copies all frames before Free; this temporarily retains managed plus
  native copies. Production Unity should upload frames sequentially and release
  the native handle promptly. Flip rows once if the chosen Unity upload path
  requires bottom-left ordering. Candidate import must complete before replacing
  the current game, and decoder errors must retain the current game.

## Build and verify

Run from this directory. No SDK/software installation is needed on this machine.

```powershell
.\build.cmd
python tests/test_codecs.py
& 'E:/Unity/6000.6.4f1/Editor/Data/DotNetSdk/dotnet.exe' run --project tests/PInvokeSmoke/PInvokeSmoke.csproj
```

`build.cmd` uses `E:/VS/VC/Auxiliary/Build/vcvars64.bat`, official nmake
release-static/RTLIBCFG=static/ARCH=x64, then the small DLL. Relative nmake output
paths intentionally avoid its failure with spaces in absolute target names.
The official build also produces cwebp/dwebp utilities in `build/`; these are
build artifacts and are neither shipped nor invoked by the runtime decoder.
Missing optional PDB xcopy messages in the release build are nonfatal.

Latest actual results: **79 native-DLL assertions**, seven self-authored fixtures,
11 negative cases; **23 C# P/Invoke assertions**. Positive coverage includes all
GIF disposal modes, subrectangles, transparent pixels, opaque background, GIF87,
unequal frame times, finite/infinite loops, WebP static transparency and four-frame
animation. Every frame is compared byte-for-byte with explicit expected RGBA;
the C# runner independently checks frozen frame SHA256/delay/loop values. Negatives
include truncated/malformed containers, oversized dimensions/input, RGBA budget,
1025 frames, frame outside canvas, and atomic NULL on decode failure.

Python requires the already-installed Pillow 12.3.0 only to encode the self-defined
WebP test vectors. The C# runner uses the committed fixture bytes and has no NuGet
or Pillow dependency. Source/ABI tests are not Unity Editor/Mono/IL2CPP acceptance;
the P4 owner must explicitly integrate and run the Windows Player before claiming
the editor import format matrix complete.

## Provenance and redistribution

Google source archive:
https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz

Archive SHA256 `e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564`,
4,296,070 bytes. Official v1.6.0 tag resolves to
`4fa21912338357f89e4fd51cf2368325b59e9bd9`. Eight relevant release files,
including demux source, headers, Makefile and license, were compared byte-for-byte
against that official tag. This is a locally calculated archive hash, not a
claim that Google published a signed checksum. Detailed URLs/hashes: SOURCE.json.

libwebp license is BSD-3-Clause; preserve `licenses/libwebp-COPYING.txt`,
`libwebp-PATENTS.txt`, and AUTHORS with binary redistribution. The wrapper/sample/
tests are MIT (LICENSE.txt). GIF composition state ordering was researched against
Microsoft's MIT-licensed WicAnimatedGif sample; its license is included, although
sample C++ code was not copied. Windows system DLLs are OS components and are
not bundled. Preserve all supplied notices when redistributing the single DLL.
