#!/usr/bin/env bash
# Rebuild the `vps` branch: reset it to BASE and merge every branch listed in
# deploy/vps-branches (read from the local/deploy branch, not the working tree).
#
# Run it inside the worktree that has `vps` checked out:
#   cd ~/dev/rav-webmail/rav-vps && deploy/refresh-vps-branch.sh
# then build with deploy/build-native.sh.
#
# On a merge conflict the script stops; resolve, `git commit`, and run it again.
# rerere is enabled, so a conflict resolved once is reapplied automatically.
set -euo pipefail

# Everything runs inside main() so bash has read the whole script before
# `git reset` replaces this file on disk.
main() {
    if [[ "$(git branch --show-current)" != "vps" ]]; then
        echo "error: run this in the worktree where 'vps' is checked out" >&2
        exit 1
    fi
    if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
        echo "error: uncommitted changes in $(pwd); commit or discard them first" >&2
        exit 1
    fi

    local list base
    list=$(git show local/deploy:deploy/vps-branches | sed -e 's/#.*//' -e '/^[[:space:]]*$/d')
    base=$(awk '$1 == "BASE" { print $2 }' <<<"$list")
    base=${base:-origin/main}

    git config rerere.enabled true
    git config rerere.autoUpdate true
    git fetch --quiet origin

    git reset --quiet --hard "$base"
    echo "vps reset to $base ($(git rev-parse --short HEAD))"

    local branch
    while read -r branch; do
        echo "merging $branch"
        if ! git merge --quiet --no-edit "$branch"; then
            if [[ -z "$(git diff --name-only --diff-filter=U)" ]]; then
                git commit --quiet --no-edit
                echo "  conflict resolved by rerere"
            else
                echo "error: conflict merging $branch; resolve it, 'git commit', then rerun" >&2
                exit 1
            fi
        fi
    done < <(awk '$1 != "BASE"' <<<"$list")

    echo "vps is at $(git rev-parse --short HEAD)"
}

main "$@"
exit
