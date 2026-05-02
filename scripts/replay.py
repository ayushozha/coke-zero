import argparse
import json
import time

parser = argparse.ArgumentParser()
parser.add_argument("path")
parser.add_argument("--speed", type=float, default=1.0)
parser.add_argument("--no-sleep", action="store_true")
args = parser.parse_args()

last_t = None

with open(args.path, "r") as f:
    for line in f:
        line = line.strip()

        if not line:
            continue

        event = json.loads(line)
        t = event["time"]

        if last_t is not None and not args.no_sleep:
            delay = max(0, (t - last_t) / args.speed)
            time.sleep(delay)

        print(json.dumps(event), flush=True)
        last_t = t
