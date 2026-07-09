#!/bin/bash
# Double-click to start La Bobine: studio server + app, then opens the browser.
cd "$(dirname "$0")"
( sleep 3 && open "http://localhost:5788" ) &
npm run studio
