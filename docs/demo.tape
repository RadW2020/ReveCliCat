# Renders docs/demo.gif — run from the repo root after `npm run build`:  vhs docs/demo.tape
Output docs/demo.gif
Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 560
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type `rcc() { node dist/cli.js "$@"; }; export FORCE_COLOR=1; ( node dist/cli.js listen --port 8787 >/dev/null 2>&1 & )`
Enter
Sleep 800ms
Type "clear"
Enter
Show

Type "rcc run scenarios/happy-year.yaml --to http://localhost:8787/webhook --speed 200 --seed 1"
Sleep 600ms
Enter
Sleep 4500ms
Type "rcc send CANCELLATION --to http://localhost:8787/webhook --set cancel_reason=BILLING_ERROR"
Sleep 400ms
Enter
Sleep 1800ms
Type "rcc tail --smee"
Sleep 400ms
Enter
Sleep 3200ms
Ctrl+C
Sleep 1200ms
