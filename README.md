# gitalyze

A CLI tool that analyzes a Git repository's history and prints an in-terminal report with charts. Based on the analysis techniques from [Git Commands You Should Run Before Reading Any Code](https://piechowski.io/post/git-commands-before-reading-code/).

## What it reports

- **Code Churn Hotspots** — most frequently modified files in the past year
- **Contributor Activity** — all contributors ranked by commit count (bus factor)
- **Recent Contributor Activity** — active contributors in the last 6 months
- **Bug Hotspots** — files with the most bug-related commits
- **Development Velocity** — monthly commit frequency over the repo's lifetime
- **Firefighting Frequency** — reverts, hotfixes, and emergency commits in the past year

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [gnuplot](http://www.gnuplot.info/) (optional, for in-terminal charts)

gnuplot must be installed separately:

```sh
# macOS
brew install gnuplot

# Debian / Ubuntu
sudo apt install gnuplot

# Fedora
sudo dnf install gnuplot
```

If gnuplot is not installed, gitalyze will still run and print the tabular report — charts will simply be skipped.

## Installation

```sh
git clone <repo-url> && cd gitalyze
bun install
bun link
```

After `bun link`, the `gitalyze` command is available globally.

## Usage

Run from inside any Git repository:

```sh
gitalyze
```
