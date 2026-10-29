"""Writes a vbaProject.bin (the macros of an .xlsm) from VBA source text, with
the Python standard library only.

The format is [MS-OVBA] inside a compound file ([MS-CFB]): a PROJECT and a
PROJECTwm stream, and a VBA storage with the dir stream (project and module
records, compressed), an _VBA_PROJECT stream and one stream per module (its
compressed source). No compiled code is written: _VBA_PROJECT's version is
0xFFFF, as the spec says to write it, so Excel compiles the source on load.
The output is deterministic.

    vba_project_bin([("ThisWorkbook", "document", source), ("Module1", "module", source)])
"""
import struct

# ---- MS-OVBA 2.4.1 compression ------------------------------------------------


def _compress_chunk(data):
    """One CompressedChunk for up to 4096 bytes of data."""
    out = bytearray()
    pos, n = 0, len(data)
    seen = {}                                # 3-byte prefix -> positions in the chunk
    while pos < n:
        flag_at = len(out)
        out.append(0)
        flags = 0
        for bit in range(8):
            if pos >= n:
                break
            # copy-token geometry depends on how far into the chunk we are
            bit_count = max((pos - 1).bit_length(), 4) if pos > 0 else 4
            max_len = (0xFFFF >> bit_count) + 3
            max_off = 1 << bit_count
            best_len, best_off = 0, 0
            for cand in reversed(seen.get(bytes(data[pos:pos + 3]), [])[-64:]):
                if pos - cand > max_off:
                    break
                ln = 0
                while ln < max_len and pos + ln < n and data[cand + ln] == data[pos + ln]:
                    ln += 1
                if ln > best_len:
                    best_len, best_off = ln, pos - cand
                    if ln == max_len:
                        break
            step = best_len if best_len >= 3 else 1
            if best_len >= 3:
                out += struct.pack("<H", ((best_off - 1) << (16 - bit_count)) | (best_len - 3))
                flags |= 1 << bit
            else:
                out.append(data[pos])
            for q in range(pos, pos + step):
                seen.setdefault(bytes(data[q:q + 3]), []).append(q)
            pos += step
        out[flag_at] = flags
    if len(out) > 4096:                      # incompressible: a raw chunk (4096 bytes)
        return struct.pack("<H", 0x3FFF) + bytes(data).ljust(4096, b"\0")
    return struct.pack("<H", 0xB000 | (len(out) - 1)) + bytes(out)


def compress(data):
    """A CompressedContainer: signature 0x01, then one chunk per 4096 bytes."""
    out = bytearray(b"\x01")
    for i in range(0, len(data), 4096):
        out += _compress_chunk(data[i:i + 4096])
    return bytes(out)


# ---- the dir stream ------------------------------------------------------------

def _rec(rid, payload=b""):
    return struct.pack("<HI", rid, len(payload)) + payload


def _u16(s):
    return s.encode("utf-16-le")


def _dir_stream(modules, codepage=1252):
    enc = lambda s: s.encode(f"cp{codepage}")
    out = bytearray()
    out += _rec(0x0001, struct.pack("<I", 1))               # SYSKIND: 32-bit Windows
    out += _rec(0x0002, struct.pack("<I", 0x0409))          # LCID
    out += _rec(0x0014, struct.pack("<I", 0x0409))          # LCIDINVOKE
    out += _rec(0x0003, struct.pack("<H", codepage))        # CODEPAGE
    out += _rec(0x0004, enc("VBAProject"))                  # NAME
    out += _rec(0x0005) + _rec(0x0040)                      # DOCSTRING (+ Unicode)
    out += _rec(0x0006) + _rec(0x003D)                      # HELPFILE 1 and 2
    out += _rec(0x0007, struct.pack("<I", 0))               # HELPCONTEXT
    out += _rec(0x0008, struct.pack("<I", 0))               # LIBFLAGS
    out += struct.pack("<HIIH", 0x0009, 4, 1, 0)            # VERSION (reserved size 4, major, minor)
    out += _rec(0x000C) + _rec(0x003C)                      # CONSTANTS (+ Unicode)
    # one reference: OLE Automation (stdole)
    libid = enc("*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\System32\\stdole2.tlb#OLE Automation")
    out += _rec(0x0016, enc("stdole")) + _rec(0x003E, _u16("stdole"))
    out += _rec(0x000D, struct.pack("<I", len(libid)) + libid + struct.pack("<IH", 0, 0))
    out += _rec(0x000F, struct.pack("<H", len(modules)))   # PROJECTMODULES
    out += _rec(0x0013, struct.pack("<H", 0xFFFF))          # PROJECTCOOKIE
    for name, kind, _ in modules:
        out += _rec(0x0019, enc(name)) + _rec(0x0047, _u16(name))       # MODULENAME
        out += _rec(0x001A, enc(name)) + _rec(0x0032, _u16(name))       # MODULESTREAMNAME
        out += _rec(0x001C) + _rec(0x0048)                              # MODULEDOCSTRING
        out += _rec(0x0031, struct.pack("<I", 0))                       # MODULEOFFSET: no compiled code
        out += _rec(0x001E, struct.pack("<I", 0))                       # MODULEHELPCONTEXT
        out += _rec(0x002C, struct.pack("<H", 0xFFFF))                  # MODULECOOKIE
        out += _rec(0x0022 if kind == "document" else 0x0021)           # MODULETYPE
        out += _rec(0x002B)                                             # terminator
    out += _rec(0x0010)                                     # dir terminator
    return bytes(out)


# The PROJECT stream's ID and protection state values ("not locked, no
# password, visible"), encrypted per MS-OVBA 2.4.3 with that ID.
_PROJECT_ID = "{8D807122-0657-42C8-BC6F-4B5FD08031C9}"
_CMG, _DPB, _GC = "DBD966ECE4F0E4F0E4F0E4F0", "5557E86E18E919E919E9", "CFCD72F0961011111111EE"


def _project_stream(modules):
    lines = [f'ID="{_PROJECT_ID}"']
    for name, kind, _ in modules:
        lines.append(f"Document={name}/&H00000000" if kind == "document" else f"Module={name}")
    lines += ['Name="VBAProject"', 'HelpContextID="0"', 'VersionCompatible32="393222000"',
              f'CMG="{_CMG}"', f'DPB="{_DPB}"', f'GC="{_GC}"', "",
              "[Host Extender Info]", "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000", "",
              "[Workspace]"]
    lines += [f"{name}=0, 0, 0, 0, C" for name, _, _ in modules]
    return ("\r\n".join(lines) + "\r\n").encode("cp1252")


def _projectwm_stream(modules):
    out = bytearray()
    for name, _, _ in modules:
        out += name.encode("cp1252") + b"\0" + _u16(name) + b"\0\0"
    return bytes(out + b"\0\0")


# ---- MS-CFB compound file (version 3: 512-byte sectors, 64-byte mini sectors) --

FREE, END, FATSECT = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD
NOSTREAM = 0xFFFFFFFF


def _cfb_key(name):
    return (len(name), name.upper())


def _tree(ids, names):
    """Children of a storage as a balanced binary search tree in CFB name
    order: -> (root id, {id: (left, right, color)}) with the nodes on an
    incomplete bottom level red (a valid red-black tree)."""
    order = sorted(ids, key=lambda i: _cfb_key(names[i]))
    links = {}
    depth_of = {}

    def build(lo, hi, depth):
        if lo > hi:
            return NOSTREAM
        mid = (lo + hi) // 2
        node = order[mid]
        depth_of[node] = depth
        links[node] = [build(lo, mid - 1, depth + 1), build(mid + 1, hi, depth + 1)]
        return node

    root = build(0, len(order) - 1, 0)
    full = (len(order) & (len(order) + 1)) == 0      # 1, 3, 7, ... nodes: every level complete
    deepest = max(depth_of.values()) if depth_of else 0
    colors = {n: (0 if (not full and d == deepest and d > 0) else 1) for n, d in depth_of.items()}
    return root, {n: (l, r, colors[n]) for n, (l, r) in links.items()}


def cfb(streams):
    """A compound file from {"path/name": bytes} (one level of storages is
    enough here). Streams under 4096 bytes go in the mini stream."""
    names, kinds, parent, data = ["Root Entry"], [5], [None], [b""]
    # (storages have start sector and size 0)
    storage_id = {"": 0}
    for path in streams:
        parts = path.split("/")
        for depth in range(len(parts) - 1):
            key = "/".join(parts[:depth + 1])
            if key not in storage_id:
                storage_id[key] = len(names)
                names.append(parts[depth]); kinds.append(1); data.append(b"")
                parent.append(storage_id["/".join(parts[:depth])])
        names.append(parts[-1]); kinds.append(2); data.append(streams[path])
        parent.append(storage_id["/".join(parts[:-1])])
    n = len(names)
    # mini stream: every stream under the cutoff, in 64-byte mini sectors
    mini, minifat, size = bytearray(), [], [0] * n
    start = [0 if kinds[i] == 1 else END for i in range(n)]
    big = []
    for i in range(n):
        if kinds[i] != 2:
            continue
        size[i] = len(data[i])
        if size[i] >= 4096:
            big.append(i)
            continue
        if size[i] == 0:
            continue
        first = len(mini) // 64
        count = (size[i] + 63) // 64
        start[i] = first
        minifat += [first + k + 1 for k in range(count - 1)] + [END]
        mini += data[i].ljust(count * 64, b"\0")
    # sectors: [FAT][directory][mini FAT][mini stream][big streams]
    dir_secs = (n * 128 + 511) // 512
    minifat_secs = (len(minifat) * 4 + 511) // 512
    mini_secs = (len(mini) + 511) // 512
    big_secs = [(len(data[i]) + 511) // 512 for i in big]
    body = dir_secs + minifat_secs + mini_secs + sum(big_secs)
    fat_secs = 1
    while fat_secs * 128 < body + fat_secs:
        fat_secs += 1
    assert fat_secs <= 109
    fat = [FATSECT] * fat_secs
    chain = lambda count: [len(fat) + k + 1 for k in range(count - 1)] + [END]
    dir_start = len(fat); fat += chain(dir_secs)
    minifat_start = len(fat) if minifat_secs else END
    fat += chain(minifat_secs) if minifat_secs else []
    mini_start = len(fat) if mini_secs else END
    fat += chain(mini_secs) if mini_secs else []
    for i, cnt in zip(big, big_secs):
        start[i] = len(fat)
        fat += chain(cnt)
    fat += [FREE] * (fat_secs * 128 - len(fat))
    start[0], size[0] = mini_start, len(mini)
    # directory entries with each storage's children as a tree
    left, right, child, color = [NOSTREAM] * n, [NOSTREAM] * n, [NOSTREAM] * n, [1] * n
    for sid in set(p for p in parent if p is not None):
        kids = [i for i in range(n) if parent[i] == sid]
        root, links = _tree(kids, names)
        child[sid] = root
        for k, (l, r, c) in links.items():
            left[k], right[k], color[k] = l, r, c
    entries = bytearray()
    for i in range(n):
        nm = _u16(names[i]) + b"\0\0"
        entries += struct.pack("<64sHBBIII16sIQQIII", nm.ljust(64, b"\0"), len(nm), kinds[i], color[i],
                               left[i], right[i], child[i], b"\0" * 16, 0, 0, 0, start[i], size[i], 0)
    entries = bytes(entries).ljust(dir_secs * 512, b"\0")
    # unused directory slots: empty entries pointing nowhere
    for k in range(n, dir_secs * 4):
        off = k * 128
        entries = entries[:off + 68] + struct.pack("<III", NOSTREAM, NOSTREAM, NOSTREAM) + entries[off + 80:]
    difat = list(range(fat_secs)) + [FREE] * (109 - fat_secs)
    header = struct.pack("<8s16sHHHHH6sIIIIIIIII", bytes.fromhex("D0CF11E0A1B11AE1"), b"\0" * 16, 0x003E, 0x0003,
                         0xFFFE, 9, 6, b"\0" * 6, 0, fat_secs, dir_start, 0, 4096, minifat_start, minifat_secs,
                         END, 0) + struct.pack("<109I", *difat)
    out = bytearray(header)
    out += struct.pack(f"<{len(fat)}I", *fat)
    out += entries
    out += struct.pack(f"<{len(minifat)}I", *minifat).ljust(minifat_secs * 512, b"\xff") if minifat_secs else b""
    out += bytes(mini).ljust(mini_secs * 512, b"\0")
    for i in big:
        out += data[i].ljust(((len(data[i]) + 511) // 512) * 512, b"\0")
    return bytes(out)


def vba_project_bin(modules):
    """modules: [(name, "document" | "module", VBA source without the
    Attribute VB_Name line)]. The document modules are the workbook's
    (ThisWorkbook) or a sheet's."""
    doc_attrs = ('Attribute VB_Base = "0{00020819-0000-0000-C000-000000000046}"\r\n'
                 "Attribute VB_GlobalNameSpace = False\r\nAttribute VB_Creatable = False\r\n"
                 "Attribute VB_PredeclaredId = True\r\nAttribute VB_Exposed = True\r\n"
                 "Attribute VB_TemplateDerived = False\r\nAttribute VB_Customizable = True\r\n")
    streams = {}
    for name, kind, src in modules:
        text = f'Attribute VB_Name = "{name}"\r\n' + (doc_attrs if kind == "document" else "")
        text += src.replace("\r\n", "\n").replace("\n", "\r\n")
        streams[f"VBA/{name}"] = compress(text.encode("cp1252"))
    streams["VBA/_VBA_PROJECT"] = struct.pack("<HHBH", 0x61CC, 0xFFFF, 0, 0)
    streams["VBA/dir"] = compress(_dir_stream(modules))
    streams["PROJECT"] = _project_stream(modules)
    streams["PROJECTwm"] = _projectwm_stream(modules)
    return cfb(streams)
