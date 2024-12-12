#!/bin/bash

npx jsdoc --configure jsdoc.json ./scripts/inject-script.js
rm -rf docs
mv out docs
cp public/favicon.ico docs/favicon.ico
