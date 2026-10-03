# Church-owned prayer groups (pilot)

Groups connect directly to a church-owned Google Apps Script deployment. There
is no Closet Prayer account service, group directory, or central prayer database.
The website and all service code remain in this public repository. Prayer data,
credentials, and the church's deployment belong in the church's Google account.

## Pilot status

This implementation includes direct invitations, QR scanning, public submissions,
spreadsheet moderation, daily/on-demand downloads, offline reading, and group-only
sharing restrictions. The admin interface is the spreadsheet's Closet Prayer menu.
A separate console subdomain and provider integrations beyond Google Apps Script
are future work. Existing hosting and personal prayer records remain unchanged.

Automated tests exercise the protocol, IndexedDB migration/transactions, and the
service through Google API test doubles. Before real church use, complete the
live deployment checks below on Android and iOS. In particular, cross-origin
Google redirects, anonymous deployment access, OAuth consent, and iframe behavior
must be verified with an actual deployment. Mock responses cannot prove those.

## Set up a group

Use a Google account controlled by the church, and keep access available when an
administrator changes. A free Google account can be used within Google's quotas.

1. Create an empty Google Sheet. Keep its sharing restricted to administrators.
   Do not publish the spreadsheet or enable public link access to its contents.
2. Open **Extensions > Apps Script**. Replace the default script with
   [Code.gs](../group-service/google-apps-script/Code.gs).
3. In Apps Script's project settings, enable showing the `appsscript.json` manifest.
   Use [appsscript.json](../group-service/google-apps-script/appsscript.json).
   The script requests spreadsheet access and spreadsheet UI access. It does not
   need Drive-wide access, Gmail, or access to members' Google accounts.
4. In Closet Prayer, open **Settings > Manage groups > Set up a church-owned group**.
   Enter the group name and choose **Create setup code**. Keep this screen open.
   Keep a private copy of the generated setup code for recovery and updates.
   It contains the member and submission keys; never put it in GitHub or a website.
5. Reload the spreadsheet to see its **Closet Prayer** menu. Choose **Configure
   group**, authorize the script after reviewing its permissions, and paste the
   setup code. This creates `Requests` and `Inbox` tabs without replacing other tabs.
   Google may show an unverified-app consent screen for a copied script. Workspace
   administrators may restrict execution or public deployment access.
6. In Apps Script choose **Deploy > New deployment > Web app**. Select **Execute as:
   Me** and **Who has access: Anyone**. The script checks scoped credentials itself;
   the spreadsheet remains private. A deployment requiring visitors to sign into
   Google is not supported by this prototype. Use the `/exec` URL, not `/dev`.
7. Paste the deployment URL into the setup screen and choose **Create invitations**.
   It generates a private member link/QR and a separate public submission link/QR.
8. Join through the private invitation, verify the group name and downloaded data,
   then complete the live checks below before distributing invitations.

The links default to `https://closetprayer.com/`. During local development, replace
only that app origin with the local test address, keeping the entire `#group=...`
fragment intact. The Google endpoint inside the code must always use HTTPS.
Camera scanning requires HTTPS or localhost. Pasting a link also works without a
camera. No connection is made for member invitations until the user confirms Join.

## Moderate prayers

- `Inbox` receives pending submissions. Contact details appear here only. Select
  the submitted rows and choose **Publish selected requests** or **Decline selected
  submissions** from the Closet Prayer menu. Approval copies only the prayer fields
  into `Requests`; contact details never enter the member feed.
- Use **Add draft prayer** for administrator-authored requests. Edit title,
  description, requestor, and requested date in `Requests`, then select the row and
  choose **Publish selected requests**.
- Use **Mark selected prayers answered**, **Restrict selected prayers to group**,
  and **Withdraw selected prayers** to maintain the group feed.
- Keep the header names and IDs intact. Request IDs are permanent; do not reuse
  IDs for different requests. Dates must be valid dates or ISO timestamps.
- `publication` is `draft`, `published`, or `withdrawn`; `status` is `requested` or
  `answered`. `visibility` is `group-only` or `shareable`.
- `consent` records the submitter's maximum sharing permission. The service only
  exposes `shareable` if both `visibility` and `consent` equal `shareable`. Otherwise
  the request stays group-only. Do not widen consent without renewed permission.
  For administrator-authored prayers, record the subject's consent before changing
  either value to `shareable`.

Spreadsheet owners can edit all underlying values, including consent. These
rules protect the supported workflow, not against a malicious account owner.

## Public submission form

The setup screen supplies an iframe snippet for the public submission link. It
targets this app with a submission-scoped code. No member credential is included.
The form defaults to group-only, requires explicit consent, and stores submissions
for review. It does not publish automatically or reveal other submissions.

Use a text-only form for this pilot. The service caps accepted submissions at 20
per UTC hour and 100 per UTC day per group, limits field lengths, neutralizes
spreadsheet formulas, uses a honeypot, and deduplicates retries by request ID.
These limits bound writes; they are not comprehensive bot protection. A determined
attacker can exhaust the public endpoint's quota. Start with a limited pilot and
assess whether a church needs a CAPTCHA or a different provider for public traffic.

## Local data, sync, and privacy

- Memberships and credentials are in `groups`; downloaded prayers are in
  `groupPrayers`. They are separate from personal prayers, requestors, categories,
  events, and journals. Joining never uploads those personal records or vault keys.
- Group caches and access credentials are not encrypted by Private Vault. Joining
  requires acknowledgement of this. Google and church administrators can access
  hosted plaintext. Group-only describes audience/sharing, not encryption.
- The first join downloads a full validated snapshot. Subsequent requests send a
  revision digest; unchanged responses avoid downloading the prayer text again.
  A changed response is another complete snapshot, applied in one local transaction.
  Withdrawn or deleted server rows therefore disappear at the next successful sync.
- Sync runs while the app is open/visible when 24 hours have elapsed, and retries
  ordinary failures after 15 minutes. Opening the app or regaining connectivity
  triggers a due check. Members can use **Sync now**. Closed-app daily background
  execution is not guaranteed by mobile browsers.
- Failed, incomplete, or invalid updates preserve the last valid cache. An explicit
  access-denied response clears that group's downloaded prayers and asks the member
  to obtain a new invitation. Offline copies cannot be remotely erased while offline.
- Group-only prayers appear on Daily but have no Security, QR, edit/copy, or export
  controls. Shareable prayers can be selected for Security. Every export/QR creation
  first synchronizes to recheck current permission; sharing is unavailable offline.
- Normal personal backups exclude group data and credentials. Restored devices must
  rejoin. Intentionally exported shareable prayers contain only ordinary portable
  prayer records, never membership keys. Once exported, copies cannot be recalled.
- Any holder of the member invitation can join. This pilot has no individual member
  approval/revocation. Restrict invitations accordingly. Changing the member key
  invalidates all old member invitations and future requests using that key.
- Share restrictions cannot prevent screenshots, manual copying, browser inspection,
  or a modified client from retaining data it already received.

## Limits and maintenance

The prototype accepts up to 1,000 published prayers and a 2 MB response, with up
to 2,000 data rows in either spreadsheet tab. Archive older inbox/request rows when
needed. Do not delete a pending row just to circumvent a submission limit.
Google's per-account quotas also apply; all this church's traffic uses its deploying
account. The client uses a short randomized delay on automatic checks and retries
later on failures. There is no guaranteed service availability.

Update the script code in the same Apps Script project, then edit the existing web
app deployment to use a new version so its address remains the same. Keep the
`CP_*` script properties and the spreadsheet IDs/headers. Changes to the public GitHub
repository do not update church deployments automatically. Protocol version 1 must
remain supported during migrations. Moving to a different deployment address
requires new invitations and rejoining in this initial implementation.

To rotate a lost member credential, recover the original private setup configuration,
replace only `memberToken` with a freshly generated 32-byte base64url credential,
and run Configure group again with the same `groupId`. Generate/distribute a matching
new member invitation. Do not invent a short password or reuse the public submission
key. A friendlier rotation/recovery interface is future work.

## Live deployment acceptance checks

1. Join using a member link from a fresh browser session with no Google login.
   Verify the expected church name and a published test prayer.
2. Scan the generated member QR on Android and iOS. Confirm scanning alone does
   not join; approval is required in the Groups screen.
3. Load the public submission link and its iframe on a church test page. Submit a
   group-only test prayer. Verify it is pending in Inbox and absent from member sync.
4. Approve it in the spreadsheet, then Sync now. Verify full-width text on mobile,
   visibility on Daily, and no way to add it to Security or export it.
5. Publish a separate shareable prayer. Select it for Security, export it, and scan
   its animated QR on another device. Inspect the exported file for absence of keys
   and submitter contact information.
6. Restrict or withdraw that prayer, then try sharing again. The current app must
   refuse sharing and apply the new state. Going offline must preserve reading but
   prevent a new group export.
7. Leave a group during a slow sync. Its records must not reappear. Verify all
   existing personal prayers, journal entries, backups, and QR transfers still work.
8. Export a personal backup and confirm group records/credentials are absent.

## Development verification

Use Node 22 or newer. `npm test` runs the protocol, database, and service tests.
`node node_modules/vite/bin/vite.js build` builds the app. The optional
`tests/group-browser.mjs` runs a browser smoke test against a preview at
`http://127.0.0.1:4174`, with Playwright installed or `CP_PLAYWRIGHT_PATH` pointing
to a Playwright package. That test uses an isolated browser and mocked Google
responses; it does not create or access a real church's Google data.

References: [Google web apps](https://developers.google.com/apps-script/guides/web),
[Content Service redirects](https://developers.google.com/apps-script/guides/content),
[Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas),
[OAuth verification](https://developers.google.com/apps-script/guides/client-verification).
