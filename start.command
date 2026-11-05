#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js is not installed. Download it from https://nodejs.org (LTS), then run this again."; read -p "Press Enter"; exit 1; fi
export HOST=0.0.0.0
(sleep 2; open http://localhost:3000) &
node server.js
