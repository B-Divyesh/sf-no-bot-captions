# Demo sandbox

Open `https://no-bot-captions.sociobot.in/demo` or choose **Try it with sample
data** on the landing page. The demo needs no picker, account, license, or
meeting audio.

It starts with three realistic meeting captions. One line is marked uncertain.
Use **Replay 12 s**, **Try again**, and **Edit text** to inspect the repair
loop. The banner stays visible while the sample is open:

> Demo — sample data, nothing is saved to your real captions.

Demo edits use only the `demo:no-bot-captions:state` localStorage key. The
normal archive key is `no-bot:archive`, and the normal license key is
`sb_license:no-bot-captions`; demo code never reads or writes either one.

**Reset demo** deletes the demo namespace and reloads the shipped sample.
**Start for real** deletes the demo namespace before returning to `/`. No demo
caption, replay buffer, license, or archive becomes real data.

The one-click demo is client-side and has no backend tenant because it does not
make a user workspace or send sample data to the server. Its isolated browser
namespace is the complete sandbox boundary. Every browser claim test begins at
`/demo` in a fresh context; the manifest is `.factory/claims.json`.
