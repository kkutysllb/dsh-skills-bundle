#!/usr/bin/env python3
"""Start one or more dev servers, wait until their ports accept connections,
run a command, then tear the servers down.

Usage:
    python scripts/with_server.py --help
    python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
    python scripts/with_server.py \
        --server "cd backend && python server.py" --port 3000 \
        --server "cd frontend && npm run dev" --port 5173 \
        -- python automation.py

Servers run in the background; once every declared port accepts TCP
connections, the command after `--` runs with the servers still up. When the
command exits, all servers are terminated (SIGTERM, then SIGKILL after a
grace period). The command's exit code becomes this script's exit code.

Stdlib only. Intended to be called directly as a black box.
"""

import argparse
import signal
import socket
import subprocess
import sys
import time

GRACE_SECONDS = 5.0


def log(message):
    print(f"[with_server] {message}", file=sys.stderr, flush=True)


def port_open(port, host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex((host, port)) == 0


def wait_for_port(port, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_open(port):
            return True
        time.sleep(0.25)
    return False


def parse_args(argv):
    # Split on the first standalone "--": everything after it is the wrapped command.
    if "--" not in argv:
        raise SystemExit(
            "error: expected `-- <command>` (the command to run once servers are ready)"
        )
    separator = argv.index("--")
    pre, command = argv[:separator], argv[separator + 1 :]
    if not command:
        raise SystemExit("error: empty command after `--`")

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--server",
        action="append",
        default=[],
        help="server start command (shell string); repeatable, order matches --port",
    )
    parser.add_argument(
        "--port",
        action="append",
        type=int,
        default=[],
        help="port the server will listen on; repeatable, order matches --server",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="seconds to wait for each port before giving up (default: 60)",
    )
    args = parser.parse_args(pre)
    if len(args.server) != len(args.port):
        raise SystemExit(
            f"error: {len(args.server)} --server entries but {len(args.port)} --port entries"
        )
    args.command = command
    return args


def main():
    args = parse_args(sys.argv[1:])

    processes = []
    for server_cmd, port in zip(args.server, args.port):
        log(f"starting: {server_cmd} (expecting port {port})")
        processes.append(subprocess.Popen(server_cmd, shell=True))

    def teardown(status):
        for process in processes:
            if process.poll() is None:
                process.terminate()
        deadline = time.monotonic() + GRACE_SECONDS
        for process in processes:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                process.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        sys.exit(status)

    def on_signal(signum, _frame):
        log(f"received signal {signum}, tearing down")
        teardown(128 + signum)

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    for server_cmd, port in zip(args.server, args.port):
        if wait_for_port(port, args.timeout):
            log(f"port {port} is accepting connections")
        else:
            log(f"timed out waiting for port {port}")
            teardown(1)

    try:
        status = subprocess.run(args.command).returncode
    except KeyboardInterrupt:
        teardown(130)
    teardown(status)


if __name__ == "__main__":
    main()
