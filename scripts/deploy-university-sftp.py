#!/usr/bin/env python3
"""Upload an Astro dist directory via SSH-key-authenticated SFTP.

Safety: verify host key; never delete remote files; upload index.html last.
The destination defaults to the already provisioned public_html symlink.
"""
import os
import pathlib
import posixpath
import sys
import tempfile

import paramiko

HOST = "www.eng.kagawa-u.ac.jp"
PORT = 22
ROOT = pathlib.Path("dist")
REMOTE = "public_html"


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing configuration: {name}")
    return value


def main():
    if not ROOT.joinpath("index.html").is_file():
        raise SystemExit("Missing dist/index.html; build first.")
    user = required("UNIVERSITY_SFTP_USER")
    private_key = required("UNIVERSITY_SFTP_PRIVATE_KEY")
    host_keys = required("UNIVERSITY_SFTP_KNOWN_HOSTS")

    # Keep credentials out of the repository, logs, and command-line arguments.
    with tempfile.TemporaryDirectory() as tmp:
        key_path = pathlib.Path(tmp) / "deploy_key"
        host_path = pathlib.Path(tmp) / "known_hosts"
        key_path.write_text(private_key + "\n", encoding="utf-8")
        host_path.write_text(host_keys + "\n", encoding="utf-8")
        key_path.chmod(0o600)

        client = paramiko.SSHClient()
        client.load_host_keys(str(host_path))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        try:
            client.connect(
                HOST,
                port=PORT,
                username=user,
                key_filename=str(key_path),
                look_for_keys=False,
                allow_agent=False,
                timeout=25,
                auth_timeout=25,
            )
            sftp = client.open_sftp()
            try:
                sftp.chdir(REMOTE)  # Verify the existing university public directory.
                target_root = sftp.getcwd()
                if not target_root:
                    raise RuntimeError("Unable to resolve remote public_html")
                all_files = sorted(p for p in ROOT.rglob("*") if p.is_file())
                all_files.sort(key=lambda p: p.relative_to(ROOT).as_posix() == "index.html")
                for local in all_files:
                    relative = local.relative_to(ROOT).as_posix()
                    remote = posixpath.join(target_root, relative)
                    parts = relative.split("/")[:-1]
                    parent = target_root
                    for part in parts:
                        parent = posixpath.join(parent, part)
                        try:
                            sftp.stat(parent)
                        except IOError:
                            sftp.mkdir(parent)
                    # Upload to a temporary name and atomically replace where supported.
                    temp_remote = remote + ".uploading"
                    sftp.put(str(local), temp_remote)
                    try:
                        sftp.posix_rename(temp_remote, remote)
                    except IOError:
                        # Some university SFTP implementations do not support POSIX rename.
                        sftp.rename(temp_remote, remote)
                    print(f"Uploaded: {relative}")
                print(f"Uploaded {len(all_files)} files; no remote deletions performed.")
            finally:
                sftp.close()
        finally:
            client.close()


if __name__ == "__main__":
    main()
