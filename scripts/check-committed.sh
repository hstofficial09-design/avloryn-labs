#!/bin/sh
# Type-check what is ABOUT TO BE PUSHED, not what happens to be in the working tree.
#
# Why this exists: a commit once type-checked perfectly on this machine and failed on Railway,
# because the thing that made it compile — a widened function signature — was still an uncommitted
# edit belonging to somebody else's work in the same tree. `tsc` in the working tree can only ever
# tell you about the working tree. The deploy failed, the previous build kept serving, and the
# change simply was not live: nothing looked broken.
#
# A detached worktree is used rather than `git stash` on purpose. More than one session works in
# this repository at a time, and stashing would yank the floor out from under whoever else is
# mid-edit.
set -e
ROOT=$(git rev-parse --show-toplevel)
TMP=$(mktemp -d)
cleanup() { git -C "$ROOT" worktree remove --force "$TMP" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

git -C "$ROOT" worktree add --detach --quiet "$TMP" HEAD
# Reuse the installed dependencies rather than a fresh install — this has to be quick enough that
# it actually gets run.
ln -s "$ROOT/node_modules" "$TMP/node_modules"
cd "$TMP"
"$ROOT/node_modules/.bin/tsc" --noEmit
