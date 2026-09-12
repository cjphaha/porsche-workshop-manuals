#!/usr/bin/env python3
"""Compatibility entry point. Prefer: npm run manual:add -- --model ..."""
from pathlib import Path
import sys
from manuals import main

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in ('inspect', 'build'):
        sys.exit(main(args))
    action = args.pop(0)
    if '--model' not in args:
        args += ['--model', '981']
        # Only the original root-level 981 manual is eligible for legacy discovery.
        if '--source' not in args:
            originals = [p for p in Path(__file__).resolve().parents[1].glob('*.pdf') if '981' in p.name]
            if len(originals) == 1:
                args += ['--source', str(originals[0])]
    if action == 'inspect':
        args.append('--inspect')
    sys.exit(main(args))
