#!/bin/sh
# Runs every browser suite against local copies of the built site.
# First build both copies and serve the local-login one:
#   npm run build:local
#   npm run build:access-test
#   npx vite preview --port 4173 --strictPort
# The milestone suites use the local copy (username demo, password demo) on port 4173.
# access_check serves the hosted copy (dist-access) itself, with a stand-in for Cloudflare Access.
# ask_check serves the local copy itself (port 4184), with a scripted stand-in for the Ask AI model.
# Needs Python 3 with Playwright, and Chrome (set CHROME to its path if it is not /usr/bin/google-chrome).
cd "$(dirname "$0")" || exit 1
for s in m1_check m2_check m2b_check m3_check m3b_check m4_check m4b_check m5_check review_check s1_check s1b_check s2_check s3_check s4_check s5_check s6_check s7_check access_check ask_check; do
  echo "== $s"
  python3 "$s.py" 2>&1 | grep -E "FAIL|console|passed$|STOPPED"
done
