# Church-owned prayer groups (pilot)

Groups connect directly to a church-owned Google Apps Script deployment. There
is no Closet Prayer account service, group directory, or central prayer database.
The website and all service code remain in this public repository. Prayer data,
credentials, and the church's deployment belong in the church's Google account.

## Pilot status

This implementation includes direct invitations, QR scanning, public submissions,
spreadsheet moderation, daily/on-demand downloads, offline reading, and group-only
sharing restrictions. The [administrator console](https://console.closetprayer.com/)
supports Google login, guided group creation, prayer editing, moderation, and public
submission embeds. The new guided creation flow needs a live Google-account pilot
before general rollout. Existing groups keep working without repeating setup.
Other providers are future work. Existing hosting and personal records are unchanged.

Automated tests exercise the protocol, IndexedDB migration/transactions, and the
service through Google API test doubles. Before real church use, complete the
live deployment checks below on Android and iOS. In particular, cross-origin
Google redirects, anonymous deployment access, OAuth consent, and iframe behavior
must be verified with an actual deployment. Mock responses cannot prove those.

## Set up a group

Use a Google account controlled by the church, and keep access available when an
administrator changes. A free Google account can be used within Google's quotas.

1. Open the [administrator console](https://console.closetprayer.com/) and connect
   your church's Google account. Choose **Create a new group**. If a group already
   exists, choose its spreadsheet instead; do not create a replacement.
2. Enter the church/group name. Follow the console's link to Google script settings
   and enable **Google Apps Script API** once for this account. Return to the console,
   review the permission/privacy notice, and choose **Prepare my group**.
3. Approve Google's additional script-management permission using the same account.
   The console creates a private sheet and a bound script from the bundled service
   template. No copying code, creating a Cloud project, or typing deployment URLs is
   required for the normal church-admin flow.
4. Choose **Open Google approval**. Approve access for this church's service, then
   return to the console and choose **Finish setup**. This separate approval cannot
   be skipped by the console. Google may show an unverified-app warning; review the
   account, permissions, and script before deciding whether to proceed. Organization
   policy may block public web apps.
5. After the connection checks pass, create/manage prayers and choose **Verify
   service and show embed**. The panel provides the public submission link/iframe,
   plus a separate private member invitation and QR for guided-setup groups.
6. Test with fictional information using the live checks below. Share the private
   invitation with members only. Additional administrators need Editor permission
   on the sheet, not a shared Google password.

The console operator must first enable the Apps Script API and configure its
additional OAuth scopes once; individual churches do not repeat that Cloud setup.
See [guided creation requirements and recovery](https://console.closetprayer.com/setup.html#guided-creation).
Script-management permission is broader than one file. The generated service also
requests spreadsheet and spreadsheet-menu access under its owner's account. Keep
the sheet restricted to trusted administrators; group data is not end-to-end encrypted.

An unfinished group can be resumed by selecting the same spreadsheet. Setup IDs,
access keys, and an approval receipt live in its private `GroupSetup` tab, never a
central database. Do not edit that tab or post its contents for support. If a
connection fails during creation, check Drive before starting again to avoid duplicates.
The console never deletes a partially created sheet or script automatically.

The links default to `https://closetprayer.com/`. During local development, replace
only that app origin with the local test address, keeping the entire `#group=...`
fragment intact. The Google endpoint inside the code must always use HTTPS.
Camera scanning requires HTTPS or localhost. Pasting a link also works without a
camera. No connection is made for member invitations until the user confirms Join.

## Moderate prayers

In the console, pending submissions offer **Review and approve** or **Decline**.
Review the wording before approval. **New prayer** begins as a group-only draft;
use **Publication** to publish when ready. **Edit prayer** changes wording, date,
requested/answered status, publication, and permitted sharing. Group-only consent
cannot be widened by approval/editing; shareable prayers can be restricted further.
Contacts remain in Inbox, so do not copy private contact details into prayer wording.
Members receive published changes on their next successful sync.

The spreadsheet menu also remains available:

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

Use the console or spreadsheet menu for normal changes. Direct cell edits, sorting,
row deletion, and other API clients bypass the script's lock: coordinate any such
maintenance with other administrators. Console saves reject stale edits rather
than silently overwriting a newer version. Close the editor, refresh, then review
the current record before editing again.

## Upgrade an existing group for the console

Keep the existing spreadsheet, script project, deployment URL, and private setup
code. Make a private recovery copy of the sheet and retain the previous script
version. A code release does not automatically update church deployments.

1. In the existing bound Apps Script project, replace [Code.gs](../group-service/google-apps-script/Code.gs)
   and [appsscript.json](../group-service/google-apps-script/appsscript.json).
   Keep all `CP_*` properties. Do not configure a new group or generate replacement
   keys just to enable the console.
2. Check the **Sheets** advanced service appears under **Services**. If absent use
   **Services + > Google Sheets API > Add**. A script linked to a standard Cloud
   project also needs Google Sheets API enabled in that project's API Library.
   See [Google's instructions](https://developers.google.com/apps-script/guides/services/advanced).
3. Save, then **Deploy > Manage deployments > Edit > New version > Deploy** for
   the existing web app. Keep Execute as Me, access Anyone, and the same `/exec` URL.
4. Reload the spreadsheet. Run **Closet Prayer > Enable administrator console**
   with the existing **public submission link**, not the private member invitation.
   Review any Google authorization prompt. This adds `ConsoleSettings` and
   `ConsoleCommands` without clearing Requests or Inbox. Keep all tabs private.
5. Reload the console, reconnect, and select the spreadsheet. Editing controls
   should appear. Verify the service in **Church website submissions** to obtain
   the public link and iframe. The service must identify this selected sheet.

Ordinary administration of existing groups does not need the new setup scopes.
Do not replace working OAuth/API keys to upgrade a church service.
If the public submission link was lost, recover it from the church's existing
form/setup records. Re-run Enable administrator console if that key is rotated.
Older groups remain readable in the console until this upgrade is complete.
The [console guide](https://console.closetprayer.com/setup.html#management-upgrade)
has a detailed walkthrough and live testing checklist.

If a save loses its connection, use **Check / retry this save**. After reloading,
refresh and inspect **Change history**, then **Check / finish pending change** if
needed. Do not create another change until the earlier outcome is known. Signing
out does not undo a queued change. Pending operations expire after 24 hours and
require a console check/retry; there is no background worker. Commands and receipts
remain in the private sheet, including prayer wording that was later changed or
withdrawn. This is operational history, not a verified-author/tamper-proof audit log.

## Public submission form

The console's **Church website submissions** panel verifies the selected sheet's
service and supplies an iframe snippet and a public link. Group creation is managed
entirely in the console, not in the prayer journal. The iframe
targets this app with a submission-scoped code. No member credential is included.
The form defaults to group-only, requires explicit consent, and stores submissions
for review. It does not publish automatically or reveal other submissions.

Paste the snippet into a church website HTML/embed block. No administrator login
is required for visitors. The form is hosted on closetprayer.com and posts directly
to the church service. No new domain or central prayer database is required. Test
in a signed-out/private window and on a phone. If the church's website restricts
frames, allow `https://closetprayer.com` in its frame policy. Avoid an iframe sandbox
that disables scripts, forms, or origin access. Offer the public link as a fallback.

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
  triggers a due check. Members can use **Sync now** per group or **Refresh all groups**
  directly on the Settings card. Refresh all checks groups sequentially and reports
  partial failures without discarding other groups' data. Closed-app daily background
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
- Members can choose **Submit a prayer** for a joined group. Only the completed form
  is sent, with explicit consent; personal journal data is never included. Requests
  enter the same private Inbox as public submissions and wait for administrator review.
  Existing churches need the updated script deployed for this feature; older groups
  show an explanation and can keep using their public website form. Sending requires
  a connection; there is no offline submission queue. A lost response can be retried
  with the same unedited form without duplicating the accepted request.
- Share restrictions cannot prevent screenshots, manual copying, browser inspection,
  or a modified client from retaining data it already received.

## Limits and maintenance

The prototype accepts up to 1,000 published prayers and a 2 MB response, with up
to 2,000 data rows in either spreadsheet tab. Archive older inbox/request rows when
needed. Do not delete a pending row just to circumvent a submission limit.
Console history is also capped at 2,000 data rows. Privately archive only completed
command rows older than 24 hours, preserving headers and coordinating with other
administrators. Never edit command payloads or delete pending commands as routine
maintenance. Archive copies contain sensitive prayer wording too.
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
For guided groups, the private `GroupSetup` record contains the original keys.
After rotating, update that private record to match before redistributing invitations;
the console cannot infer a replacement key from its server-side hash.

## Live deployment acceptance checks

1. Join using a member link from a fresh browser session with no Google login.
   Verify the expected church name and a published test prayer.
2. Scan the generated member QR on Android and iOS. Confirm scanning alone does
   not join; approval is required in the Groups screen.
3. Load the public submission link and its iframe on a church test page. Submit a
   group-only test prayer. Verify it is pending in Inbox and absent from member sync.
4. Approve it in the console, then Sync now. Verify full-width text on mobile,
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
9. With two Editors, open the same prayer and save different edits. The second,
   stale edit must conflict. Submit another public prayer while editing a different
   request; neither should be lost. Also check spreadsheet-menu changes against an
   already-open console editor.
10. Interrupt a console save, reconnect, and check/retry that same operation.
    Confirm only one resulting prayer and an applied receipt. Revoke Editor access
    and verify later reads/writes fail; an already queued command may still finish.
11. Submit a fictional prayer from **Manage groups > Submit a prayer**. It must remain
    pending until approval, with private contact details absent from member sync.
12. Refresh two joined groups from Settings, including one unavailable service.
    Confirm the successful group updates and the offline group's last good data remains.

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
