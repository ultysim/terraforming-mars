# Slack setup guide

For someone who has never built a Slack app. Read this whole guide before
clicking anything.

## What you'll end up with

A Slack App named "Terraforming Mars" installed in your workspace, owning:

- A bot user that can DM any workspace member.
- A `/tm-newgame` slash command anyone in the workspace can run.

You will not publish the app or list it in the Slack App Directory - it stays
private to the workspace(s) you install it in.

## Concepts (one paragraph each)

- **Slack App** - the single configuration unit in Slack that bundles your
  bot user, slash commands, OAuth scopes, and webhook URLs. Everything is
  managed at https://api.slack.com/apps.
- **Workspace** - where the app gets installed. You need workspace-admin
  permission, or your admin must allow non-admin app installs. Most personal
  and free workspaces allow it by default.
- **Bot user** - a virtual user account owned by your app. It can post
  messages, open DMs, and call the Slack API.
- **Scopes** - granular permissions the app requests when installed. This app
  requests four:
  - `commands` - register the `/tm-newgame` slash command.
  - `chat:write` - post messages (the DMs to players).
  - `im:write` - open a direct-message channel with any user in the workspace.
  - `users:read` - look up display names for the Slack users picked in the
    modal.
- **Tokens** - Slack issues three kinds; you only care about the first:
  - `xoxb-...` **Bot User OAuth Token** - the credential the bot uses on
    every API call. Treat like a password.
  - `xoxp-...` **User OAuth Token** - acts as a specific user. Not used here.
  - `xapp-...` **App-Level Token** - only for Socket Mode. Not used here
    (we run over HTTP on Vercel).
- **Signing Secret** - a shared secret Slack uses to sign every HTTPS request
  it sends to your function. Bolt verifies the signature on every incoming
  request so unauthenticated callers can't impersonate Slack. Treat like a
  password.
- **Manifest** - a YAML/JSON document that pre-fills every setting for an
  app (scopes, slash commands, URLs). [`slack-app-manifest.yaml`](./slack-app-manifest.yaml)
  is the one to paste.

## Part A - Create the Slack app

Do this **first**. You can't deploy to Vercel without the two tokens this
gives you.

1. If you don't have a workspace, create a free one at
   https://slack.com/get-started. Personal workspaces work fine for testing.
2. Go to https://api.slack.com/apps and sign in.
3. Click **Create New App** -> **From a manifest**.
4. Pick your target workspace. Click **Next**.
5. **Delete** the example YAML in the editor and **paste** the contents of
   [`slack-app-manifest.yaml`](./slack-app-manifest.yaml). The two `url:`
   fields point to `https://example.com/api/slack/events` as placeholders -
   ignore the warning, you'll fix them in Part B.
6. Click **Next**. Slack shows a summary of what will be created (one slash
   command, four scopes, one bot user). Click **Create**.
7. You land on the app's **Basic Information** page.
   - Scroll to the **App Credentials** section.
   - Find **Signing Secret** -> click **Show** -> copy the long string.
     **This is your `SLACK_SIGNING_SECRET`** for Vercel.
8. In the left sidebar, click **OAuth & Permissions**.
   - Click the green **Install to Workspace** button at the top.
   - Slack shows what permissions the app is asking for. Click **Allow**.
   - You're redirected back. Near the top, you'll see **Bot User OAuth Token**
     starting with `xoxb-`. Copy it. **This is your `SLACK_BOT_TOKEN`** for
     Vercel.

Stop here. Follow [DEPLOY.md](./DEPLOY.md) to get a Vercel deployment URL,
then come back for Part B.

## Part B - Point the Slack app at your deployed bot

Do this **after** Vercel gives you a production URL (`<your-vercel-domain>`,
e.g. `terraforming-mars-abc123.vercel.app`).

1. Back at https://api.slack.com/apps, open your app.
2. Left sidebar -> **Slash Commands** -> click the pencil icon on the
   `/tm-newgame` row.
   - Set **Request URL** to
     `https://<your-vercel-domain>/api/slack/events`.
   - Click **Save**.
3. Left sidebar -> **Interactivity & Shortcuts**.
   - Toggle **Interactivity** **On** if it's not already.
   - Set **Request URL** to the same
     `https://<your-vercel-domain>/api/slack/events`.
   - Click **Save Changes** at the bottom right.
4. Left sidebar -> **Install App** -> **Reinstall to Workspace** -> **Allow**.
   Reinstall is required whenever URLs or scopes change; the bot token does
   not change.
5. Open your Slack workspace.
6. In any channel, type `/tm-newgame` and press Enter.
   - The modal should open within ~2 seconds.
   - Pick at least 1 Slack user, choose colors, pick a board, click
     **Create game**.
   - The modal closes. ~5-10 seconds later, every picked user receives a DM
     from the bot with their personal game link. The host (you) also gets a
     summary DM with the host dashboard and spectator links.

## FAQ

**Do I need to invite the bot to a channel before it can DM users?**
No. Slack bots can DM any user in a workspace they're installed to, without
being added to any channel.

**Can the bot DM users in other workspaces?**
No. The bot only works in workspaces where the app has been installed.

**My company Slack blocks app installs.**
Either ask your Slack admin to approve the app (they can do this from the
**Approve Apps** workflow), or create a free personal workspace for testing.

**Is the app "public"? Can other Slack workspaces see it?**
No. Apps you create at api.slack.com are private to the workspaces you
install them in. Public listing requires explicit submission to the Slack
App Directory, which is not done here.

**The slash command doesn't appear in Slack's `/` autocomplete.**
Slash commands register on install. If the `/` menu doesn't show
`/tm-newgame`, repeat Part B step 4 (Reinstall to Workspace).

**`/tm-newgame failed with the error dispatch_failed` in Slack.**
Slack couldn't reach or verify your bot. Open the Vercel project ->
**Logs** tab. Most often the issue is a typo'd `SLACK_SIGNING_SECRET`, or
env vars were added after the last deploy (Redeploy from the Deployments
tab to pick them up).

**The modal opens, I submit, but I never get a DM.**
The submission was accepted, but background work (game creation +
DMing players) failed. Check Vercel logs for the specific error. If the
host DM appears with an error message, the bot caught it; otherwise the
function may have timed out or been killed before `waitUntil` finished.

**What if I lose my Bot Token or Signing Secret?**
The Bot Token is at **OAuth & Permissions** (always visible after install).
The Signing Secret is at **Basic Information** -> **App Credentials** ->
**Show**. Both can be regenerated; if you regenerate either, update the
corresponding Vercel env var and redeploy.

**Can I rename the bot or change its avatar?**
Yes - **Basic Information** -> **Display Information** lets you set the
app name, short description, and icon. The bot user's name comes from
**App Home** -> **Your App's Presence in Slack**.

**Why are only some of the create-game options exposed?**
The Slack modal omits the long card-list fields (custom corporations,
banned cards, included cards, custom CEOs, custom preludes, custom
colonies) because each has hundreds of options - Slack's `static_select`
caps at 100. Use the web new-game form for those.
