"""Fetch portable official binaries under .git; no system install or production access.

PostgreSQL's EDB archive includes pgAdmin. HTTP byte ranges fetch only server,
client, libraries and bootstrap data rather than the unrelated GUI distribution.
The final download is checked by ZIP CRC before execution.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import pathlib
import subprocess
import time
import zipfile

POSTGRES_URL = "https://get.enterprisedb.com/postgresql/postgresql-16.15-5-windows-x64-binaries.zip"
POSTGREST_URL = "https://github.com/PostgREST/postgrest/releases/download/v16.4/postgrest-v16.4-windows-x86-64.zip"
POSTGREST_SHA256 = "29a5b56e5a09b7168bb552ef14aa7ade40bf0a81dd0687cffa86610187b89d78"
CHUNK = 65536


class RemoteZip(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        self.position = 0
        self.cache = {}
        self.size = 373254386 if url == POSTGRES_URL else 15073226
        self.directory = pathlib.Path('.git/dashboard-db-runtime/postgresql-directory-and-footer.bin') if url == POSTGRES_URL else None
        self.directory_bytes = self.directory.read_bytes() if self.directory and self.directory.exists() else None
        self.directory_offset = self.size - len(self.directory_bytes) if self.directory_bytes else None

    def seekable(self):
        return True

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        return self.position

    def tell(self):
        return self.position

    def chunk(self, offset):
        if offset not in self.cache:
            end = min(offset + CHUNK - 1, self.size - 1)
            for attempt in range(3):
                process = subprocess.run(['curl.exe', '--http1.1', '-L', '--fail', '--silent', '--show-error', '--range', f'{offset}-{end}',
                                          '--max-time', '20', self.url], capture_output=True)
                if process.returncode == 0 and len(process.stdout) == end - offset + 1:
                    self.cache[offset] = process.stdout
                    break
                if attempt == 2:
                    raise RuntimeError(f'Archive range failed at {offset}: {process.stderr.decode(errors="replace")}')
                time.sleep(1)
        return self.cache[offset]

    def read(self, size=-1):
        size = self.size - self.position if size < 0 else min(size, self.size - self.position)
        if size <= 0:
            return b""
        if self.directory_bytes and self.position >= self.directory_offset:
            start = self.position - self.directory_offset
            self.position += size
            return self.directory_bytes[start:start + size]
        first = self.position // CHUNK * CHUNK
        offsets = list(range(first, self.position + size, CHUNK))
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            data = b"".join(executor.map(self.chunk, offsets))
        begin = self.position - first
        self.position += size
        return data[begin:begin + size]


def extract(url, target, predicate):
    if url == POSTGREST_URL:
        remote_source = RemoteZip(url)
        # The single Windows executable occupies almost the whole ZIP. Fetch it
        # concurrently and verify GitHub's release asset digest before extraction.
        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
            chunks = list(executor.map(remote_source.chunk, range(0, remote_source.size, CHUNK)))
        archive_bytes = b"".join(chunks)
        if hashlib.sha256(archive_bytes).hexdigest() != POSTGREST_SHA256:
            raise RuntimeError("PostgREST archive differs from official release SHA256")
        remote = io.BytesIO(archive_bytes)
        source_size = remote_source.size
    else:
        remote = RemoteZip(url)
        source_size = remote.size
    with zipfile.ZipFile(remote) as archive:
        selected = [entry for entry in archive.infolist() if predicate(entry.filename)]
        print(json.dumps({"archive": url, "entries": len(selected), "compressedBytes": sum(entry.compress_size for entry in selected)}), flush=True)
        for index, entry in enumerate(selected):
            destination = (target / entry.filename).resolve()
            if not destination.is_relative_to(target.resolve()):
                raise RuntimeError("Archive path escapes runtime")
            archive.extract(entry, target)
            if index % 50 == 0:
                print(json.dumps({'extracted': index + 1, 'entries': len(selected)}), flush=True)
    return {"source": url, "archiveBytes": source_size, "downloadedBytes": source_size if url == POSTGREST_URL else sum(map(len, remote.cache.values())), "entries": len(selected),
            **({"archiveSha256": POSTGREST_SHA256} if url == POSTGREST_URL else {})}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", default=".git/dashboard-db-runtime")
    args = parser.parse_args()
    runtime = pathlib.Path(args.runtime).resolve()
    repository = pathlib.Path(__file__).resolve().parents[2]
    if not runtime.is_relative_to(repository / '.git'):
        raise RuntimeError('The portable runtime must remain inside this checkout .git directory')
    runtime.mkdir(parents=True, exist_ok=True)
    metadata_file = runtime / "runtime-sources.json"
    metadata = json.loads(metadata_file.read_text(encoding="utf-8-sig")) if metadata_file.exists() else {}
    if not (runtime / "postgresql/complete.json").exists():
        metadata["postgresql"] = extract(POSTGRES_URL, runtime / "postgresql", lambda name: name.startswith(("pgsql/bin/", "pgsql/lib/", "pgsql/share/")))
        (runtime / "postgresql/complete.json").write_text(json.dumps(metadata["postgresql"]), encoding="utf-8")
    if not (runtime / "postgrest/complete.json").exists():
        metadata["postgrest"] = extract(POSTGREST_URL, runtime / "postgrest", lambda name: name.lower().endswith((".exe", ".dll")))
        (runtime / "postgrest/complete.json").write_text(json.dumps(metadata["postgrest"]), encoding="utf-8")
    versions = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in {
        "postgres.exe": runtime / "postgresql/pgsql/bin/postgres.exe",
        "postgrest.exe": runtime / "postgrest/postgrest.exe",
    }.items()}
    metadata["binarySha256"] = versions
    metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
