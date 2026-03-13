#!/bin/bash
# Clear all IDE-inherited Electron environment variables
# These interfere with running our own Electron app

unset ELECTRON_RUN_AS_NODE
unset ELECTRON_FORCE_IS_PACKAGED
unset VSCODE_RUN_IN_ELECTRON
unset ICUBE_IS_ELECTRON
unset ICUBE_ELECTRON_PATH

# Start Electron
exec "$(dirname "$0")/node_modules/.bin/electron" .
