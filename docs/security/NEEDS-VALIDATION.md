# Needs validation — Cheffy run-1

Source ref `987fde9`. Every record below is a source-grounded lead **without severity**. None is a confirmed vulnerability: this run executed no target code (see REPORT.md). Leads are listed in suggested validation order.

## NV-01. Filing a report copies private, followers-only, draft or blocked content into a snapshot the reporter can read

Fingerprint: `supabase/migrations/20261026000001_moderation_dashboard.sql:reports_before_insert:target_snapshot-visibility-bypass`

Any authenticated user who knows a post, comment or profile UUID can insert a report against it. The SECURITY DEFINER trigger reports_before_insert runs with owner rights and copies the target's current content into reports.target_snapshot. For posts that is title, review, story, visibility, status and the storage and thumbnail paths of the photos. For comments it is the body and post_id. For profiles it is username, display_name, bio and avatar_path. It also adds the owner's username. The trigger never calls can_view_post, can_view_content_of or the block helpers. Reporters have table-level SELECT on public.reports, and the reports_select_own policy lets them read their own row, so they can read target_snapshot back, for example with a PostgREST insert using return=representation or a later select=target_snapshot. A former follower, a user the author has blocked, or anyone holding a leaked deep-link UUID can therefore read the current text of private, followers-only, draft, removed or hidden posts and comments. Because only one open or reviewed report per reporter and target is allowed, they can file again and take a fresh snapshot once the earlier report is closed. Photo bytes still need storage RLS, so this exposes the paths, not the images.

**Claimed root cause.** reports_before_insert (SECURITY DEFINER, search_path='') builds the evidence snapshot by reading posts, post_images, comments and profiles without RLS. It does not apply the visibility rules (can_view_post, can_view_content_of, has_blocked/is_blocked_between, moderation hiding). The table-level grant 'grant select on public.reports to authenticated' and the reports_select_own policy then show that evidence column, which was meant for moderators, to the reporter. No later migration in the snapshot narrows these to column-level SELECT.

**Source trace**

1. `src/features/social/api.ts:227` (entrypoint, reportContent): Client inserts into public.reports with an arbitrary target_post_id, target_comment_id or target_user_id. Any authenticated user can also call it directly through PostgREST.
2. `supabase/migrations/20261018000003_rls.sql:322` (propagation, reports_insert_own policy): The insert check only requires reporter_id = auth.uid(). It says nothing about whether the reporter can see the target.
3. `supabase/migrations/20261018000002_functions.sql:247` (propagation, reports_validate_target): This BEFORE trigger fires first by name and only checks that the target id matching target_type is non-null.
4. `supabase/migrations/20261026000001_moderation_dashboard.sql:61` (propagation, reports_before_insert (SECURITY DEFINER)): Runs with owner rights, bypassing RLS. It selects the post (with image paths), comment or profile by id and writes the content into new.target_snapshot and target_owner_id, with no visibility or block check.
5. `supabase/migrations/20261018000003_rls.sql:50` (propagation, grant select on public.reports): Table-level SELECT for authenticated, so the columns added later (target_snapshot, target_owner_id) are readable too.
6. `supabase/migrations/20261018000003_rls.sql:318` (sink, reports_select_own policy): The reporter reads their own report row, including the snapshot of content they could not otherwise see.

**Evidence**

- `supabase/migrations/20261026000001_moderation_dashboard.sql:46`: reports_before_insert is declared SECURITY DEFINER (lines 46-50). Lines 61-79 copy post, image, comment and profile fields with no can_view_post or block check. Only a missing target raises an error (line 80).
- `supabase/migrations/20261021000002_private_accounts.sql:59`: can_view_post denies non-authors for non-published and private posts, posts of authors whose content they cannot view (blocked pairs, private accounts they do not follow) and followers-only posts when they do not follow. The snapshot path skips this check.
- `supabase/migrations/20261018000003_rls.sql:50`: 'grant select on public.reports to authenticated' is a table-level grant. No migration up to 20261026000001 revokes it or replaces it with column-level grants, so the new columns are readable.
- `supabase/migrations/20261018000003_rls.sql:318`: reports_select_own (reporter_id = auth.uid()) lets the reporter read every column of their own reports.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:38`: The partial unique index allows only one open or reviewed report per reporter and target. After a moderator closes the report, the reporter can file a new one and get a fresh snapshot.

**Blockers**

- This is a source-only run. No OS-enforced sandbox with memory and wall-clock limits is available on this macOS host, so the PGlite harness (tests/db/harness.ts) was not run. Nobody has observed the reporter actually reading target_snapshot back.
- Hosted Supabase may have column privileges, default privileges or API column exposure that differ from the migrations. These are not visible in source.

**Bounded local check.** In a sandboxed PGlite run of tests/db/moderation-dashboard.test.ts (TestDb from tests/db/harness.ts), create dummy users author and reporter. As author, create three posts: one with visibility 'private', one draft (status not 'published') and one 'followers' post that the reporter does not follow. Also create a block from author to reporter and a public post. Repeat for each case: (1) as reporter, run 'select 1 from public.posts where id=$1' and confirm it returns no rows; (2) as reporter, run "insert into public.reports (reporter_id,target_type,target_post_id,reason) values (auth.uid(),'post',$1,'spam') returning target_snapshot". The finding holds if the returned snapshot has the dummy title, review and story and the image paths. Do the same for a comment on a hidden post. Stop at the first returned snapshot.

**Owner-observed deployment check.** Owner-observed and read-only: in the hosted project's SQL editor, run 'select grantee, privilege_type, column_name from information_schema.column_privileges where table_schema='public' and table_name='reports' and grantee='authenticated'' and check role_table_grants. This confirms whether authenticated has SELECT on target_snapshot. Check also that the reports table is exposed through the PostgREST API schema.

## NV-02. Client INSERT and DELETE on profiles let a user set gated columns and recreate the row, bypassing unlock gating and erasing blocks others placed on them

Fingerprint: `supabase/migrations/20261018000003_rls.sql:profiles-table-level-insert-grant-privileged-columns`

Profile UPDATE is granted column by column (rls.sql:20 plus later per-column grants), so theme and frame can only be changed through set_profile_style, which checks profile_unlocks (unlocks.sql:228-248). tests/db/unlocks.test.ts:58-61 asserts that a direct UPDATE of theme is permission-denied. INSERT and DELETE on public.profiles, however, are table-level grants to authenticated (rls.sql:19). profiles_insert_own (rls.sql:81-83) checks only id = auth.uid(). The only BEFORE INSERT triggers are profiles_record_terms, which rewrites terms_*, and profiles_reject_blocked_terms, a word filter. Any authenticated user can therefore insert their profile with theme='saffron', frame='host', an arbitrary created_at, or suspended_* values. profiles_delete_own (rls.sql:90-92) lets the owner delete the row at any time; the app itself never deletes profiles from the client, because delete-account uses auth.admin.deleteUser. A delete and re-insert cascades away the user's child rows. Those include user_blocks rows where they are blocked_id (core_schema.sql:258), which are blocks other users placed on them, so the blocked user regains visibility and interaction. If fewer than 10 OG Chef slots are filled, the re-insert also awards a fresh OG slot, because the old slot keeps user_id NULL (og_chef.sql:14, 85-87). The re-insert also resets suspended_at to NULL, which the restrictive posts and comments insert policies rely on (moderation.sql:147-158). Suspension also sets auth.users.banned_until = 'infinity' (moderation_dashboard.sql:596), however, so a suspended user can post or comment again only until their current access token expires (jwt_expiry 3600). Re-redeeming an invite code after referred_id cascades away is possible but yields no net referral gain. Impact: the cosmetic unlock gate is bypassed; victims' blocks are erased; the OG Chef award may be duplicated while slots remain; suspension enforcement is weakened for at most the remaining token lifetime.

**Claimed root cause.** rls.sql:19 grants INSERT (all columns) and DELETE on public.profiles to authenticated, while UPDATE is column-granted. Columns that only the database or moderators should set (theme, frame, suspended_at, suspended_reason, created_at) are client-writable on the insert path. Client self-deletion of the profile row cascades away state that other principals own, such as user_blocks rows placed by other users. No trigger normalizes those columns or prevents client deletion.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:19` (entrypoint, grant select, insert, delete on public.profiles to authenticated): Table-level INSERT and DELETE on profiles are granted to authenticated. UPDATE (line 20) is restricted to specific columns.
2. `supabase/migrations/20261018000003_rls.sql:81` (propagation, profiles_insert_own policy): WITH CHECK constrains only id = auth.uid(). theme, frame, suspended_* and created_at are unconstrained.
3. `supabase/migrations/20261018000003_rls.sql:90` (propagation, profiles_delete_own policy): The owner may delete their own profile row at any time. FKs on user_blocks, referrals, profile_unlocks, follows and others cascade (core_schema.sql:257-258; unlocks.sql:11,47). og_chefs.user_id is set to null (og_chef.sql:14).
4. `supabase/migrations/20261022000002_terms_acceptance.sql:29` (propagation, profiles_record_terms BEFORE INSERT trigger): Overwrites only terms_version and terms_accepted_at. No trigger resets theme, frame, suspended_* or created_at on insert.
5. `supabase/migrations/20261021000009_unlocks.sql:29` (sink, profiles.theme / profiles.frame (and moderation.sql:29-30 suspended_at/suspended_reason)): The gated cosmetic columns and the suspension column are written directly with client-chosen values on insert.

**Evidence**

- `supabase/migrations/20261021000009_unlocks.sql:248`: set_profile_style writes theme and frame only after its profile_unlocks checks (lines 236-247). It is the intended sole writer.
- `tests/db/unlocks.test.ts:59`: The test asserts that a direct UPDATE of theme is permission-denied, which documents the invariant. The insert path is untested.
- `src/features/profile/api.ts:115`: The client creates its profile with a PostgREST insert on profiles, so the insert path is live. No client code deletes profiles.
- `supabase/migrations/20261018000001_core_schema.sql:258`: user_blocks.blocked_id references profiles ON DELETE CASCADE, so deleting one's own profile erases blocks other users placed on that account.
- `supabase/migrations/20261022000003_moderation.sql:147`: posts_insert_not_suspended and comments_insert_not_suspended key only on profiles.suspended_at, which a delete and re-insert resets to NULL.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:596`: Suspension also sets auth.users.banned_until = 'infinity'. This bounds suspension evasion to the remaining lifetime of an already-issued access token (config.toml jwt_expiry = 3600).
- `supabase/migrations/20261023000002_og_chef.sql:85`: The AFTER INSERT trigger awards an OG slot when fewer than 10 are used. The deleted profile's old slot keeps user_id NULL (line 14), so a re-insert can take a second slot.

**Blockers**

- Source-only run: no OS-enforced sandbox with memory and wall-clock limits is available on this macOS host, so the PGlite harness (tests/db) cannot be executed to observe the insert or the delete-and-reinsert result.
- Hosted Supabase table privileges are not visible in source and could differ from the migrations, for example through default privileges or manual revokes.

**Bounded local check.** In the sandboxed PGlite harness (tests/db/unlocks.test.ts style), with dummy users only. (1) As a fresh user with no profile_unlocks, run db.query(u.id, "insert into public.profiles (id, username, display_name, theme, frame) values ($1,'sneaky2','S','saffron','host')", [u.id]), then read theme and frame via db.admin. Expect 'saffron' and 'host'. (2) Have dummy user B insert user_blocks (blocker_id=B, blocked_id=V). As V, run delete from public.profiles where id=$1, then re-insert the profile with only id, username and display_name. Via db.admin, confirm the B->V user_blocks row is gone. (3) As an admin, set suspended_at = now() on V. Repeat the delete and re-insert as V using the same harness identity, then confirm via db.admin that suspended_at is null. Note that the harness does not model auth.users.banned_until or token expiry. Stop at these observations.

**Owner-observed deployment check.** Owner-observed and read-only: in the hosted project's SQL editor, run select has_table_privilege('authenticated','public.profiles','INSERT'), has_table_privilege('authenticated','public.profiles','DELETE'), and select privilege_type, column_name from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated', to confirm that table-level INSERT and DELETE are live. Fix: replace the table-level INSERT with a column grant on (id, username, display_name, bio, avatar_path, avatar_original_path, instagram_username, is_private, discoverable, allow_most_hated), and revoke client DELETE on profiles. Account deletion already goes through the delete-account Edge Function, which calls auth.admin.deleteUser. Alternatively, add a BEFORE INSERT trigger that forces theme, frame, suspended_* and created_at to defaults.

## NV-03. Deleting and recreating your own profile row removes blocks against you and erases report evidence, while the account keeps working

Fingerprint: `supabase/migrations/20261018000003_rls.sql:profiles_delete_own:account-deletion-side-effects-without-account-deletion`

Any signed-in user can DELETE their own public.profiles row through PostgREST and then INSERT it again with the same auth.uid(). The delete runs every account-deletion side effect: the FK cascades and the report-evidence scrub trigger. auth.users is not deleted or banned, so the session stays valid. There are two effects. (1) Block removal: user_blocks.blocked_id is ON DELETE CASCADE, so blocks that other users placed on the attacker disappear. has_blocked, is_blocked_between and can_view_content_of read only user_blocks, so the blocked user can again see the victim's profile and content and interact with them. (2) Evidence destruction: the BEFORE DELETE trigger profiles_scrub_report_evidence replaces target_snapshot with 'Author deleted their account' and nulls target_owner_id on every report about the user. reports.target_user_id is ON DELETE SET NULL, and the reported posts and comments cascade-delete, which nulls the post and comment targets. admin_reports and admin_report_detail then show no evidence and no author, so a moderator cannot link the report to the account that is still active. The cost to the attacker is losing their own posts, follows and other cascaded data. The app itself never deletes profile rows; real deletion goes through the delete-account Edge Function, which deletes the auth user.

**Claimed root cause.** rls.sql:19 grants DELETE on public.profiles to authenticated. profiles_delete_own (rls.sql:90-92) lets a user delete their own row with no lifecycle condition. The schema and triggers treat a profile delete as account deletion (cascades, SET NULL, and the reports_scrub_deleted_owner trigger at dashboard.sql:95-112), but deleting the profile row does not end the auth account. profiles_insert_own (rls.sql:81-83) then allows the profile to be created again right away. Nothing ties 'profile deleted' to 'account deleted', and no client path needs the DELETE grant.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:19` (entrypoint, grant select, insert, delete on public.profiles to authenticated): Authenticated clients can DELETE profile rows through PostgREST. No later migration revokes this.
2. `supabase/migrations/20261018000003_rls.sql:90` (propagation, profiles_delete_own): Allows deleting the row where id = auth.uid(), with no lifecycle condition.
3. `supabase/migrations/20261018000001_core_schema.sql:258` (propagation, user_blocks.blocked_id FK): ON DELETE CASCADE removes blocks that other users placed on the deleting user.
4. `supabase/migrations/20261026000001_moderation_dashboard.sql:111` (propagation, profiles_scrub_report_evidence trigger): Runs BEFORE DELETE on any profiles row. It calls reports_scrub_deleted_owner (line 95), which scrubs target_snapshot and nulls target_owner_id on every report against the user.
5. `supabase/migrations/20261018000001_core_schema.sql:270` (propagation, reports.target_user_id FK): ON DELETE SET NULL cuts the link from user reports to the account. Post and comment targets are nulled when those rows cascade-delete.
6. `supabase/migrations/20261018000003_rls.sql:81` (propagation, profiles_insert_own): The same auth.uid() can insert the profile again immediately, as the app's createProfile does.
7. `supabase/migrations/20261021000002_private_accounts.sql:51` (sink, can_view_content_of): The visibility check calls is_blocked_between, which reads only user_blocks, and the victim's block is no longer there. The moderator RPCs admin_reports (dashboard.sql:256) and admin_report_detail (dashboard.sql:348) show a scrubbed report with no owner.

**Evidence**

- `supabase/migrations/20261018000003_rls.sql:19`: Table-level DELETE grant on profiles for authenticated. No revoke and no BEFORE DELETE guard exists in any migration; the only BEFORE DELETE trigger on profiles is the scrub trigger.
- `supabase/migrations/20261018000001_core_schema.sql:257`: Both user_blocks FKs (blocker_id and blocked_id) cascade on profile delete.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:93`: The comment says the scrub exists because deleting an account removes its posts and comments, but the trigger fires on any profile-row delete.
- `supabase/functions/delete-account/index.ts:6`: The real deletion path deletes the auth user with the service role, so clients do not need the DELETE grant on profiles.
- `src/features/profile/api.ts:110`: The client only inserts profiles (createProfile) and calls the Edge Function to delete an account. It never deletes profile rows directly.

**Blockers**

- Source-only run: no OS-enforced sandbox is available on this host (memory and wall-clock limits cannot be enforced), so the PGlite harness was not run to observe the delete, cascade, scrub and re-insert under the authenticated role.
- Hosted Supabase grants on public.profiles (a revoke applied in the dashboard, or different default privileges) are not visible in source. A production REVOKE of DELETE would close the path.

**Bounded local check.** In tests/db using tests/db/harness.ts with dummy users alice, bob and carol: as alice, insert user_blocks(blocker_id=alice, blocked_id=bob). As bob, create a post; as carol, report it. As bob, run 'delete from public.profiles where id = bob' and then insert the profile again with the same id. Assert that both statements succeed, that user_blocks has no (alice, bob) row, that is_blocked_between(bob, alice) is false, that bob can select alice's profile, and that carol's report has target_snapshot->>'scrubbed' = 'true' with target_owner_id null while the auth.users row for bob still exists. (The snapshot has no tests/db/security-audit.test.ts, so write a new test case.)

**Owner-observed deployment check.** The project owner runs this in the Supabase SQL editor, read-only: select has_table_privilege('authenticated', 'public.profiles', 'DELETE'); A result of true means the path is live in production.

## NV-04. Suspended account can still publish content while its token is valid: drafts can be published, and deleting and recreating the profile clears the suspension flag

Fingerprint: `supabase/migrations/20261022000003_moderation.sql:suspension-enforced-only-on-insert-policies`

The comment at moderation.sql:146 says a suspended account cannot post or comment even with a still-valid token. The only enforcement is two restrictive FOR INSERT policies on posts and comments (moderation.sql:147-158), and both read profiles.suspended_at. Suspension through public.moderate 'suspend' (moderation_dashboard.sql:592-600) sets suspended_at and auth.users.banned_until. It removes only status='published' posts, so drafts survive. While the access token stays valid, the suspended user can send PATCH /posts?id=eq.<draft> with {status:'published'} (rating must already be set, per the core_schema.sql:103 check). The status column is UPDATE-granted (rls.sql:30-34). posts_update_own checks only author_id (rls.sql:112-115). posts_before_write blocks only transitions into or out of 'removed' (moderation.sql:96-99). The effective can_view_post (private_accounts.sql:59-76, which supersedes functions.sql:75) and its helper can_view_content_of (private_accounts.sql:41-54) have no suspension predicate. So the draft becomes visible to other users. Second variant: the user deletes their own profiles row, which is allowed by the table-level DELETE grant (rls.sql:19) and profiles_delete_own (rls.sql:90-92). They then re-insert it with suspended_at NULL, allowed by the table-level INSERT grant and profiles_insert_own (rls.sql:81-83). The INSERT gates then pass, and new posts and comments can be created. The moderator view also reports the account as not suspended (moderation_dashboard.sql:202), while auth banned_until stays set. This variant costs the attacker their existing content, because the ON DELETE CASCADE from profiles removes their posts and comments (core_schema.sql:59). It also fires profiles_scrub_report_evidence, which scrubs report snapshots about the user (moderation_dashboard.sql:95-112). The exposure window is bounded by the access-token lifetime, provided GoTrue refuses refresh for a user banned by direct SQL.

**Claimed root cause.** Suspension is enforced only by restrictive INSERT policies on posts and comments, and those policies read profiles.suspended_at, which sits on a row the suspended user can delete and recreate. No UPDATE-path check (draft to published) and no profile-lifecycle check binds the suspension state.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:112` (entrypoint, posts_update_own policy): PostgREST UPDATE by the authenticated author. USING/WITH CHECK is author_id = auth.uid() only, with no suspension predicate. status and visibility are UPDATE-granted at lines 30-34.
2. `supabase/migrations/20261022000003_moderation.sql:96` (propagation, posts_before_write): For the authenticated role, rejects only status transitions into or out of 'removed'. A draft to published transition passes, and published_at is set.
3. `supabase/migrations/20261026000001_moderation_dashboard.sql:597` (propagation, public.moderate suspend branch): Takes down only posts with status='published', so drafts remain and can be published later.
4. `supabase/migrations/20261018000003_rls.sql:19` (propagation, profiles grants and own-row policies): Table-level INSERT and DELETE on profiles, plus policies at lines 81-92 that bind only id = auth.uid(), let the user recreate their profile with suspended_at NULL.
5. `supabase/migrations/20261022000003_moderation.sql:147` (sink, posts_insert_not_suspended / comments_insert_not_suspended): The only suspension gates. They are INSERT-only and read the user-recreatable profiles.suspended_at.

**Evidence**

- `supabase/migrations/20261022000003_moderation.sql:146`: Stated invariant: suspended accounts can't post or comment even with a still-valid token.
- `supabase/migrations/20261022000003_moderation.sql:153`: The comments restrictive policy is likewise INSERT-only.
- `supabase/migrations/20261021000002_private_accounts.sql:59`: The effective can_view_post, which supersedes functions.sql:75, shows any published post subject to visibility, block and privacy checks through can_view_content_of (line 41). It has no author-suspension check, so a republished draft becomes visible.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:593`: Suspension state lives in profiles.suspended_at. auth.users.banned_until is set at line 596, but existing JWTs are not revoked.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:111`: Deleting a profile, the first step of the recreate variant, fires profiles_scrub_report_evidence, and the FK cascades from profiles delete the user's existing posts and comments. The variant still works but is costly to the attacker.
- `supabase/config.toml:166`: Local jwt_expiry=3600 bounds the window locally. The hosted value is not visible.
- `tests/db/moderation.test.ts:195`: The test asserts only that post and comment INSERT fails after suspension. Publishing a draft and recreating the profile are untested.

**Blockers**

- Source-only run: no local execution is permitted (macOS cannot enforce the required sandbox memory and wall-clock limits), so the PGlite harness case cannot be run to observe the draft to published and profile-recreate bypasses.
- The hosted Auth JWT expiry, and whether GoTrue rejects refresh_token grants for a user whose banned_until was set by direct SQL, are deployment facts that are not visible in source. They determine the exposure window.

**Bounded local check.** In tests/db/moderation.test.ts, using tests/db/harness.ts: create troll and viewer. Create a troll draft post with a rating set (status 'draft'). Call moderate(mod,'user',troll.id,'suspend'). (a) Run db.query(troll.id, "update public.posts set status='published' where id=$1", [draftId]) and expect no error. Then expect sees(viewer, draftId) to be true. (b) Run db.query(troll.id,'delete from public.profiles where id=$1',[troll.id]). Re-insert the profile as troll with a fresh username, then call db.createPost(troll.id) and expect no RLS error. Either outcome demonstrates the bypass. The fix regression must assert that both fail.

**Owner-observed deployment check.** The owner reads the hosted Auth JWT expiry setting. On a staging project, with a dummy user whose banned_until was set by SQL, the owner confirms that a refresh_token grant is rejected. This bounds the window to the access-token lifetime. No production data is touched.

## NV-05. Blocking a Co-Chef invitee or collaborator does not revoke their access to the blocker's post and photos

Fingerprint: `collaborator-visibility-survives-block`

can_view_post denies posts across a block through can_view_content_of. However, posts_select_visible also grants SELECT to anyone whose collaboration_status on a published post is 'pending' or 'accepted', and that second branch has no block check and ignores visibility. user_blocks_after_insert, last redefined in private_accounts.sql, deletes follows and follow_requests in both directions but leaves post_collaborators untouched. respond_to_collaboration has no block check, so a pending invitee who has been blocked can still accept. After user A blocks user B, or B blocks A, B can still read A's co-created post. B can also read its post_images rows, because post_images_select depends only on post visibility, and the private post-images storage objects, because post_images_objects_select depends on visible post_images rows. This includes photos A adds after the block. No later migration redefines posts_select_visible, user_blocks_after_insert or respond_to_collaboration. The only source-visible mitigation is manual: the creator can call remove_collaborator.

**Claimed root cause.** The collaboration visibility branch in posts_select_visible and the block side-effect trigger user_blocks_after_insert ignore each other. A block leaves an active pending or accepted post_collaborators row, and the collaboration branch then overrides the block rule enforced in can_view_post/can_view_content_of.

**Source trace**

1. `supabase/migrations/20261021000002_private_accounts.sql:275` (entrypoint, user_blocks_after_insert): An authenticated user inserts a user_blocks row (user_blocks_insert_own). The trigger deletes follows and follow_requests in both directions but does not change post_collaborators.
2. `supabase/migrations/20261021000007_collaborations.sql:156` (propagation, respond_to_collaboration): A blocked pending invitee can still accept. The function only checks auth.uid() and status = 'pending', with no is_blocked_between check.
3. `supabase/migrations/20261021000007_collaborations.sql:72` (propagation, posts_select_visible policy): The policy is can_view_post(...) OR (status = 'published' AND collaboration_status(id, auth.uid()) in ('pending','accepted')), defined at line 77. The second branch skips the block check and the visibility check.
4. `supabase/migrations/20261018000005_storage.sql:35` (sink, post_images_objects_select): post-images storage objects can be read whenever a post_images row that is visible to the caller references them. Those rows inherit the blocker's post visibility through the collaboration branch.

**Evidence**

- `supabase/migrations/20261021000002_private_accounts.sql:59`: Intended rule: can_view_post returns false across a block through can_view_content_of, which checks is_blocked_between (line 51).
- `supabase/migrations/20261021000007_collaborations.sql:138`: The block is checked only at invite time in invite_collaborators.
- `supabase/migrations/20261018000003_rls.sql:125`: post_images_select uses only exists(visible post), so image rows inherit post visibility, including the collaboration branch.
- `supabase/migrations/20261021000007_collaborations.sql:177`: remove_collaborator lets the creator manually set the row to 'removed'. This is the only path that revokes access, and a block does not call it.

**Blockers**

- Source-only run: no OS-enforced sandbox with memory and wall-clock limits is available on this host, so the PGlite scenario in tests/db/harness.ts could not be executed
- Storage object reads depend on hosted Supabase Storage applying storage.objects RLS with the caller's JWT, which is not observable locally beyond the PGlite policy evaluation
- Product intent for co-owned content after a block is not documented, although can_view_post states the block rule

**Bounded local check.** In an approved sandbox, using tests/db/harness.ts with dummy users A and B: (1) As A, publish a post with visibility 'followers' and insert a post_images row under A's folder. Call invite_collaborators(post, [B]). (2) Case pending: as A, insert user_blocks (A→B). As B, select from posts and post_images where post_id = the post. If any rows return, the issue is confirmed. (3) Case accept-after-block: as B, call respond_to_collaboration(post, true) and expect it to succeed. (4) Case accepted-then-block: B accepts first, then A blocks, and B repeats the selects. (5) Optionally, evaluate the storage.objects policy as B for the referenced storage_path. Stop at the first returned row. Fix: add 'and not public.is_blocked_between((select auth.uid()), author_id)' to the collaboration branch of posts_select_visible. In user_blocks_after_insert, set status 'removed' on post_collaborators rows linking the two users in either direction. Add an is_blocked_between check to respond_to_collaboration. Add regression tests for all three.

**Owner-observed deployment check.** Owner-observed, with two throwaway test accounts on a non-production project: A invites B to a published followers-only post, then A blocks B. With B's session, query /rest/v1/posts?id=eq.<post> and /rest/v1/post_images?post_id=eq.<post>, and request a signed URL for the image path. Any returned row or URL confirms the issue. Delete the test accounts afterwards.

## NV-06. Caller-chosen reply_to_user_id sends a 'replied to you' notification and push, including the post title, to any user, including one who cannot view the post

Fingerprint: `supabase/migrations/20261021000003_comment_threads.sql:comments_before_insert:reply-to-user-id-unbound-notification-recipient`

An authenticated user who can comment on a published post can insert a reply. They set parent_id to any comment on that post and reply_to_user_id to any user V. The comments_before_insert definer trigger checks only that the parent exists on the same post (and flattens replies-to-replies). It never compares reply_to_user_id with the parent's author or anyone else in the thread. The comments_notify definer trigger then calls notify() with coalesce(new.reply_to_user_id, parent author) as the comment_reply recipient. notify() drops only null recipients, self-notifications, and recipients in a block relationship with the actor. notifications_send_push then calls the definer push_message. push_message reads posts.title with no visibility check and builds '<actor> replied to you on <title>'. It sends this through pg_net to every Expo token V has registered, subject to V's push preferences. Effects: (1) Unsolicited notification rows and pushes reach arbitrary users who are not in the thread. Each new reply creates a new notification. The pushed text includes a post title, which can be the attacker's own (spam or phishing). (2) If the commenter can see a private or followers-only post that V cannot, V still gets the post owner's title (up to 80 chars) in the push. V also gets a notification row whose post_id and comment_id point at content V cannot view. The post owner's audience restriction is crossed by a derived copy. The block-hidden variant applies only when the post author blocks V and the actor is a different user: notify() checks blocks between recipient and actor only.

**Claimed root cause.** reply_to_user_id is in the authenticated column INSERT grant (comment_threads.sql:20). comments_before_insert (comment_threads.sql:23-46) never binds it to the thread: it should equal the parent comment's author or the author of an existing reply under that parent. comments_notify (notifications.sql:195) uses it as the notification recipient. notify() (notifications.sql:55) and push_message (collaborations.sql:455-482) never check that the recipient can view the post (can_view_post) before copying its title into the notification and push.

**Source trace**

1. `supabase/migrations/20261021000003_comment_threads.sql:20` (entrypoint, grant insert (post_id, author_id, body, parent_id, reply_to_user_id) on public.comments to authenticated): An authenticated client may set reply_to_user_id directly in a PostgREST insert on comments. comments_insert_own (rls.sql:217-222) requires only author_id = auth.uid() and a visible published post.
2. `supabase/migrations/20261021000003_comment_threads.sql:36` (propagation, comments_before_insert): For a non-null parent_id, the trigger checks only that the parent exists and is on the same post (37-39), and rewrites a nested parent to the top-level one (41-43). reply_to_user_id passes through unchanged and is never compared with any thread author.
3. `supabase/migrations/20261021000004_notifications.sql:195` (propagation, comments_notify (security definer after-insert trigger)): Calls notify(coalesce(new.reply_to_user_id, v_parent_author), new.author_id, 'comment_reply', new.post_id, new.id). The caller-supplied value takes precedence over the parent author.
4. `supabase/migrations/20261021000004_notifications.sql:55` (propagation, notify): The only recipient checks are null, self, and is_blocked_between(recipient, actor). There is no check of thread participation or post visibility, and the notification row is inserted for the chosen recipient.
5. `supabase/migrations/20261021000007_collaborations.sql:468` (propagation, push_message (security definer, redefined at line 455)): Reads posts.title for the notification's post_id with definer rights and no can_view_post check for the recipient. Line 475 then builds 'replied to you on <title>'.
6. `supabase/migrations/20261021000005_push.sql:168` (sink, notifications_send_push): Calls net.http_post to Expo push with the message for every push_tokens row of the attacker-chosen recipient. This runs only when push_wanted is true and pg_net is installed.

**Evidence**

- `supabase/migrations/20261021000003_comment_threads.sql:3`: The design comment says a reply 'may name the person they answer'. The intended recipient is the person being answered in the thread, not an arbitrary user.
- `supabase/migrations/20261021000003_comment_threads.sql:37`: The only validation on a reply is that the parent exists on the same post. Nothing references reply_to_user_id. No later migration redefines comments_before_insert, comments_notify or notify (checked by grep across all 26 migrations).
- `supabase/migrations/20261021000004_notifications.sql:195`: The caller-supplied reply_to_user_id takes precedence over the parent author as the comment_reply recipient.
- `supabase/migrations/20261021000007_collaborations.sql:475`: The comment_reply push text embeds the post title: 'replied to you on ' || coalesce(v_title, 'a post').
- `supabase/migrations/20261021000007_collaborations.sql:72`: posts_select_visible / can_view_post is the source-of-truth visibility rule (private, followers-only, blocks). The push path does not apply it to the recipient.
- `src/features/comments/api.ts:106`: The legitimate client sets reply_to_user_id from the UI's reply target. Nothing server-side requires it to match the thread.

**Blockers**

- Source-only run: no target code was executed, so the notification row and push_message output for a recipient who is neither in the thread nor able to view the post have not been observed locally.
- Actual push delivery depends on pg_net being installed on the hosted project (notifications_send_push skips quietly otherwise), on the recipient having registered Expo tokens, and on their notification_preferences allowing comment pushes. None of these is visible in source.

**Bounded local check.** In tests/db with tests/db/harness.ts (PGlite, all migrations applied), create dummy users A (private account, or a post with visibility 'followers'), F (an approved follower of A) and V (no relationship). A publishes a post titled 'secret-title' and adds a top-level comment. As F, insert into comments (post_id, author_id, body, parent_id, reply_to_user_id) values (<post>, F, 'x', <A's comment>, V). Assert: (a) the insert succeeds; (b) public.notifications has a row with recipient_id=V, type 'comment_reply' and that post_id; (c) as owner, select public.push_message(n) for that row returns a body containing 'secret-title'; (d) as V, select on posts for that id returns 0 rows. Regression check after the fix: the insert is rejected, or no notification is written, when reply_to_user_id is not the parent author or the author of a reply in that thread, or when V cannot view the post.

**Owner-observed deployment check.** Owner-observed, non-destructive: confirm pg_net is enabled in the hosted project. Use two owner-controlled test accounts, one with a registered device and comment pushes enabled and with no relationship to the thread. Confirm that this account's device receives the 'replied to you on <title>' push for a followers-only test post it cannot view.

## NV-07. A reported post's image path can redirect the moderator's authenticated signed-URL POST to other Supabase endpoints

Fingerprint: `web/admin/admin.js:signedPhoto:storage-path-dot-segment-traversal`

The moderation dashboard asks Storage for a signed URL for each reported photo. It builds the request URL from post_images.storage_path by splitting on '/' and applying encodeURIComponent to each segment. encodeURIComponent leaves '.' unencoded, so a segment that is exactly '..' survives, and fetch() resolves dot segments under WHATWG URL parsing. An authenticated user can insert post_images rows on their own post directly through PostgREST (INSERT is granted). The only path check in the RLS policy is that the first '/'-segment equals auth.uid(), and the table has no format constraint. So a storage_path such as '<own-uid>/../../../../../../auth/v1/logout' is accepted. Six '..' segments cancel exactly the six fixed segments storage/v1/object/sign/post-images/<uid>. When a moderator opens a report on that post, either from the 'As reported' snapshot (stored by the report trigger) or the 'Now' panel (from admin_report_detail), the dashboard sends POST <supabase>/auth/v1/logout. The request carries the moderator's bearer token, the apikey, a JSON content type and the fixed body {"expiresIn":300}. CSP connect-src allows the whole Supabase host, so it does not block the request. The query string and body cannot be controlled. The non-simple headers force a CORS preflight. delete-account answers OPTIONS with 405 and no CORS headers, so it looks unreachable unless the gateway answers preflights itself. The most plausible effect is a forced global sign-out of the moderator each time they open the report, which disrupts review of the attacker's content. This is a low-impact integrity and availability issue against moderators, pending confirmation of provider behavior.

**Claimed root cause.** signedPhoto (and, without credentials, avatarUrl) treats a user-controlled storage path as a URL path. Per-segment encodeURIComponent does not neutralise '.' or '..' segments. Server-side, post_images.storage_path has no format constraint beyond the first-segment uid check in post_images_insert_own. The report snapshot trigger and admin_report_detail both return that value verbatim to the moderator client.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:129` (entrypoint, policy post_images_insert_own): An authenticated author inserts a post_images row on their own post. The only path check is split_part(storage_path,'/',1) = auth.uid() (line 133), so '<uid>/../../../../../../auth/v1/logout' is accepted. INSERT is granted to authenticated at rls.sql:36.
2. `supabase/migrations/20261018000001_core_schema.sql:141` (propagation, table public.post_images): storage_path is plain text. Its only constraint is uniqueness, with no format CHECK.
3. `supabase/migrations/20261026000001_moderation_dashboard.sql:373` (propagation, admin_report_detail current images): The moderator RPC returns images as {'path': i.storage_path} for the current post. The report snapshot trigger at line 66 copies the same value into target_snapshot.
4. `web/admin/admin.js:403` (propagation, contentPanel -> photosFor): contentPanel passes data.images to photosFor, which calls signedPhoto(img.path) for each image (line 377) when the detail view renders.
5. `web/admin/admin.js:169` (sink, signedPhoto): fetch(API + '/storage/v1/object/sign/post-images/' + path.split('/').map(encodeURIComponent).join('/'), {method:'POST', headers:{apikey, Authorization:'Bearer '+session.access_token, 'Content-Type':'application/json'}, body:'{"expiresIn":300}'}). '..' segments are resolved, so the moderator-authenticated POST lands on an attacker-chosen path on the Supabase host.

**Evidence**

- `web/admin/admin.js:169`: Per-segment encodeURIComponent leaves '..' segments intact in the authenticated fetch URL.
- `web/admin/admin.js:171`: The request carries the moderator's access token as a Bearer header, plus the apikey and a JSON content type (non-simple, so a CORS preflight is required).
- `supabase/migrations/20261018000003_rls.sql:133`: The insert check constrains only the first path segment to the caller's uid.
- `supabase/migrations/20261018000003_rls.sql:36`: authenticated has direct INSERT on public.post_images, so the RPC-built paths are not the only write path.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:66`: The report evidence snapshot stores storage_path, so the payload persists even if the author later edits the post.
- `web/_headers:14`: CSP connect-src allows the whole Supabase project host with no path restriction, so CSP does not block the traversed request.
- `supabase/functions/delete-account/index.ts:16`: Non-POST requests, including the OPTIONS preflight, get 405 without CORS headers. This appears to stop the traversal from reaching account deletion unless the gateway answers preflights itself.

**Blockers**

- This run is source-only (no OS-enforced sandbox on this host), so the browser's fetch() dot-segment normalisation and the resulting request line were not observed locally.
- The deployed CORS behavior of the Supabase gateway for /auth/v1/*, /rest/v1/* and /functions/v1/* is not visible in source. This includes whether Edge Function preflights are answered by the gateway. It decides which endpoints are reachable; if functions were CORS-enabled, delete-account would be reachable with much higher impact.
- Whether GoTrue /auth/v1/logout accepts this cross-origin request (JSON body {"expiresIn":300}, default scope=global) and revokes the moderator's refresh tokens on other devices is a provider-behavior fact.

**Bounded local check.** Inside an approved sandbox (no network, scratch-only writes), run a headless browser against a local stub origin that stands in for the Supabase host. Load web/admin/admin.js with API pointed at the stub and a fake session. Feed a renderDetail payload whose current.images[0].path is 'u/../../../../../../auth/v1/logout'. Record the method, path and headers the stub receives. Expect POST /auth/v1/logout with Authorization: Bearer <fake> after a successful preflight from the stub. Separately, in the PGlite harness (tests/db/harness.ts), confirm that an authenticated dummy author can insert a post_images row with that storage_path on their own post. Also confirm that a report on that post snapshots the path.

**Owner-observed deployment check.** Owner check on a staging project with dummy accounts only. Create a post as dummy author A, then insert a post_images row whose storage_path is '<A-uid>/../../../../../../auth/v1/logout'. Report the post from dummy account B. Open the report in the dashboard as dummy moderator M, signed in on a second device too, and check whether M's refresh tokens are revoked. Separately, send an OPTIONS preflight from origin https://cheffy.me to /functions/v1/delete-account and to /rest/v1/rpc/<any>, and record the Access-Control-Allow-* headers. Fix: in signedPhoto/avatarUrl, reject any path containing a '.' or '..' segment, or any path not matching ^<uuid>(/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$. Add CHECK constraints on post_images.storage_path/thumb_path and profiles.avatar_path that forbid '.'/'..' segments and enforce the expected format.

## NV-08. Reported author can delete or overwrite the photos referenced by a report's evidence snapshot

Fingerprint: `storage-owner-delete-overwrite-erases-report-photo-evidence`

reports_before_insert stores the reported content as an 'as reported' evidence copy so the evidence survives later edits or deletion. For photos it keeps only the post-images object paths (and avatar_path for profile reports), not the image bytes. The storage.objects policies let an authenticated owner UPDATE or DELETE any object in their own {uid}/ folder. Nothing exempts objects that an open report points to. A reported author with ordinary privileges can therefore remove the evidence photos through the Storage API, or overwrite them at the same path with an upsert, so the moderator sees a missing or substituted photo in the dashboard's 'As reported' panel. The app also does this in normal use: deletePost and post edits (save.ts) remove the old image objects, and avatar replacement removes the old avatar file. The text fields of the snapshot are not affected. The dashboard shows 'Photo no longer available' when the signed URL fails, so deletion is visible to the moderator, but an in-place overwrite would not be.

**Claimed root cause.** Evidence preservation for photos is a path reference into storage the owner can change. The storage.objects policies post_images_objects_update_own / post_images_objects_delete_own (and avatars_update_own / avatars_delete_own) give the content owner unconditional overwrite and delete rights in their {uid}/ folder. Nothing copies the bytes to a location only moderators control, and nothing blocks changes to objects referenced by reports.target_snapshot.

**Source trace**

1. `supabase/migrations/20261026000001_moderation_dashboard.sql:66` (entrypoint, public.reports_before_insert): When a report is inserted (a reporter acting through PostgREST), the snapshot captures only the storage_path/thumb_path strings of the post's images (and avatar_path for profile reports, line 76), not the object contents.
2. `src/features/posts/api.ts:69` (propagation, deletePost): When the author deletes the reported post, the app removes the photo objects from post-images under the author's session. save.ts:129 does the same for images dropped in an edit, and profile/api.ts:162 for a replaced avatar.
3. `supabase/migrations/20261018000005_storage.sql:57` (propagation, post_images_objects_update_own / post_images_objects_delete_own (lines 52-59)): Owner UPDATE and DELETE on storage.objects are allowed for any object whose first folder is auth.uid(), even when reports.target_snapshot references it. No later migration adds a carve-out; the moderation migration only adds a moderator SELECT policy (moderation_dashboard.sql:157).
4. `web/admin/admin.js:403` (sink, contentPanel('As reported', snapshot) -> photosFor): The moderator's 'As reported' panel (admin.js:471) signs and displays the snapshot paths (photosFor, admin.js:372-382). These now resolve to nothing ('Photo no longer available') or to the image the author substituted. Profile snapshots load avatar_path from the public avatars URL (admin.js:413).

**Evidence**

- `supabase/migrations/20261026000001_moderation_dashboard.sql:20`: A comment says the snapshot keeps the content 'as it was when reported (text and photo paths)' so that deleting or editing it afterwards does not erase the evidence.
- `supabase/migrations/20261018000005_storage.sql:52`: post_images_objects_update_own lets owners overwrite objects in their own folder; post_images_objects_delete_own (line 57) lets them delete them.
- `supabase/migrations/20261018000005_storage.sql:18`: avatars_update_own / avatars_delete_own (lines 18-25) let owners overwrite or delete the avatar referenced by a profile report snapshot.
- `src/lib/supabase/storage.ts:90`: removeFiles calls storage remove under the user's own session. deletePost, post edits and avatar replacement all use it.
- `web/admin/admin.js:379`: The dashboard falls back to 'Photo no longer available' when a snapshot path cannot be signed, so deletion is visible but the evidence is gone. An in-place overwrite would show the substituted bytes with no indication.

**Blockers**

- This run is source-only: no target code may be executed (no OS-enforced sandbox with memory and wall-clock limits on this host). The PGlite harness test that would show an author deleting or overwriting a snapshot-referenced storage.objects row under RLS has not been run.
- Two facts are not visible in source: how the hosted Supabase Storage API evaluates an upsert overwrite (INSERT+SELECT+UPDATE policies), and whether CDN caching (cacheControl 31536000) would still serve the original bytes to a newly signed URL or the public avatar URL.

**Bounded local check.** Use tests/db/harness.ts with dummy principals: author A, reporter R and moderator M (listed in public.moderators). As A, create a published post with one post_images row whose storage_path and thumb_path are under A's uid/ folder. As admin, insert the matching storage.objects rows. As R, insert a post report and confirm that target_snapshot.images contains those paths. As A (authenticated role, request.jwt claims sub=A), run `delete from storage.objects where bucket_id='post-images' and name=<path>`, expecting 1 row deleted. In a fresh fixture, instead run `update storage.objects set metadata='{"swapped":true}' where bucket_id='post-images' and name=<path>`, expecting 1 row updated. Then, as M, select the snapshot path from storage.objects: expect 0 rows after the delete, or the modified row after the update. Repeat with a profile report, avatars and avatar_path. Use only dummy fixtures and stop at the row counts.

**Owner-observed deployment check.** Owner-observed on a staging Supabase project with dummy accounts only. File a report on a dummy post. As the dummy author, either call storage.from('post-images').remove([path]) or upload a different image with upsert:true to the same path. As a dummy moderator, open the report in web/admin and check whether the 'As reported' photo shows 'Photo no longer available' or shows the replacement image. Also note whether CDN caching on the signed URL or the public avatar URL keeps serving the original bytes, and for how long.

## NV-09. Restoring auto-hidden content leaves its reports open, so one more report hides it again

Fingerprint: `supabase/migrations/20261026000001_moderation_dashboard.sql:moderate:restore-leaves-open-reports-auto-hide-retrigger`

Any authenticated user can file a report on any existing post or comment by UUID. The report RLS policy only checks reporter_id = auth.uid(), and the insert triggers check only that the target exists, not that the reporter can see it. When reports from 3 distinct accounts are open or under review (the default threshold), reports_after_insert sets the post to 'removed' or hides the comment. A moderator can then restore it from the dashboard (admin_moderate_report → moderate) or from the in-app moderation screen (moderate). In the dashboard version, moderate() skips closing reports for 'restore'. The original migration dismissed the target's open reports on restore. So the earlier reports stay 'open' or 'reviewed' and still count toward the threshold. The unique index reports_one_active_per_reporter stops the original reporters from reporting again while those reports are active. But a single report from any other account, such as a freshly created one, makes the distinct-reporter count reach 3 or more. reports_after_insert then hides the restored content again and logs a new auto_hide, undoing the moderator's decision. To prevent this, moderators must dismiss each sibling report one by one, because admin_set_report_status changes only one report. A harasser can keep legitimate content hidden at the cost of one new account per restore.

**Claimed root cause.** public.moderate() in 20261026000001_moderation_dashboard.sql:613 excludes 'restore' (and 'unsuspend') from closing the target's active reports. reports_after_insert (dashboard.sql:658-662) counts every open/reviewed report on the target, whether or not a moderator has already ruled on that content.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:322` (entrypoint, reports_insert_own): An authenticated user can insert a report on any target. The only check is reporter_id = auth.uid(). reports_validate_target (functions.sql:247) and reports_before_insert (dashboard.sql:46) check only that the target exists.
2. `supabase/migrations/20261026000001_moderation_dashboard.sql:658` (propagation, reports_after_insert): For post reports, the trigger counts distinct reporters over open/reviewed reports. At the threshold (default 3) it sets status = 'removed' if the post is published.
3. `web/admin/admin.js:462` (propagation, report detail actions): Restore content is offered while the content is hidden. It calls admin_moderate_report(..., 'restore'), which calls public.moderate. The in-app src/app/(app)/moderation.tsx:139 also offers restore.
4. `supabase/migrations/20261026000001_moderation_dashboard.sql:613` (propagation, moderate): Because 'restore' is excluded from the report-closing UPDATE, the reports stay open/reviewed. Restore itself sets the post back to 'published' (line 576-578).
5. `supabase/migrations/20261026000001_moderation_dashboard.sql:662` (sink, reports_after_insert): The next report from any new reporter brings the count back to the threshold. The restored post goes back to 'removed' and an auto_hide is logged.

**Evidence**

- `supabase/migrations/20261022000003_moderation.sql:406`: The original moderate() closed (dismissed) the target's open reports for every action except 'unsuspend', including 'restore'. The dashboard rewrite removed this for restore.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:613`: 'if p_action not in ('unsuspend', 'restore') then' skips closing the reports.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:660`: The threshold count includes every open/reviewed report on the target post. Line 672 does the same for comments.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:38`: The unique index allows one active report per reporter per target, so the original reporters cannot re-report. A new account is needed, and one is enough.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:435`: admin_set_report_status changes a single report. No bulk close of sibling reports exists.
- `supabase/migrations/20261022000003_moderation.sql:61`: The default auto-hide threshold is 3 reporters.

**Blockers**

- Source-only run: the restore-then-single-report re-hide sequence has not been executed in the PGlite harness. The OS-enforced sandbox is unavailable on this host.
- The cost of creating extra reporter accounts depends on hosted Auth settings (email confirmation, sign-up rate limits, CAPTCHA), which are not visible in source.

**Bounded local check.** In an isolated PGlite run of tests/db/moderation-dashboard.test.ts, create an author with a published post, three reporters, a fourth fresh user and a moderator. Each of the three reporters inserts a report on the post; assert posts.status = 'removed'. The moderator calls admin_moderate_report(<first report id>, 'restore', 'open', ''); assert posts.status = 'published' and all three reports are still 'open'. The fourth user inserts one report. The finding holds if posts.status = 'removed' again and a new auto_hide row exists in moderation_actions. Repeat for a comment target.

**Owner-observed deployment check.** Owner-observed, non-destructive: review the hosted Supabase Auth settings (email confirmation, sign-up rate limits, CAPTCHA) to judge how costly it is to create reporter accounts. Check the hosted app_config value of moderation.auto_hide_reports.

## NV-10. Reporters can read who reviewed their report and the moderator's resolution note

Fingerprint: `supabase/migrations/20261018000003_rls.sql:reports-table-select-grant:review-fields-exposed`

The moderation dashboard migration adds review columns to public.reports: reviewed_by, reviewed_at, resolution_note, target_owner_id and alerted_at. Its own comment says these are moderator-only. Reporters still hold table-level SELECT on reports, and RLS limits them only by reporter_id = auth.uid(). So any authenticated reporter can select reviewed_by from their own report rows. That column holds the profile UUID of the moderator who handled the report (auth.uid() inside admin_set_report_status or moderate()). The reporter can also read resolution_note, the moderator's free-text note from Review/Resolve/Dismiss/Reopen and from moderate(). Moderator identity is otherwise hidden: public.moderators has every client privilege revoked, and is_moderator() only answers for the caller. Filing reports and waiting for them to be handled therefore lets a user learn which accounts are moderators and read their internal notes. Source does not visibly prevent this. Whether it happens in the deployment depends on hosted column privileges, and how much it matters depends on whether the product treats this data as confidential.

**Claimed root cause.** The table-level 'grant select on public.reports to authenticated' (rls.sql:50) predates the review columns. It was not narrowed to reporter-owned columns, and moderator-only columns were not revoked, when 20261026000001_moderation_dashboard.sql added reviewed_by, resolution_note, target_owner_id and alerted_at. RLS (reports_select_own) restricts rows, not columns.

**Source trace**

1. `supabase/migrations/20261018000003_rls.sql:50` (entrypoint, grant select on public.reports): Table-level SELECT for authenticated covers all columns, including the ones added later; PostgREST exposes it as GET /rest/v1/reports.
2. `supabase/migrations/20261026000001_moderation_dashboard.sql:469` (propagation, admin_set_report_status): The SECURITY DEFINER update sets reviewed_by = auth.uid() (the acting moderator) and resolution_note = the moderator's note when one is given.
3. `supabase/migrations/20261026000001_moderation_dashboard.sql:614` (propagation, moderate): Closing active reports about a target writes reviewed_by = auth.uid() and the moderator's note into resolution_note for every reporter's row.
4. `supabase/migrations/20261018000003_rls.sql:318` (sink, reports_select_own): The row policy lets the reporter select their own report rows, with no column restriction, so reviewed_by and resolution_note are returned.

**Evidence**

- `supabase/migrations/20261026000001_moderation_dashboard.sql:16`: reviewed_by (along with resolution_note, target_owner_id and alerted_at at lines 18-23) is added, and no migration in the snapshot revokes column SELECT on these from authenticated.
- `supabase/migrations/20261026000001_moderation_dashboard.sql:44`: The comment calls review fields moderator-only, but only the insert path enforces this (column insert grants plus the reports_before_insert trigger); SELECT is not covered.
- `supabase/migrations/20261022000003_moderation.sql:37`: public.moderators has all anon/authenticated privileges revoked, which shows moderator membership is not meant to be client-readable.
- `supabase/migrations/20261022000003_moderation.sql:75`: is_moderator() checks only auth.uid(), so no other client path reveals another user's moderator status; reviewed_by is a new disclosure channel.
- `supabase/migrations/20261018000003_rls.sql:51`: INSERT is column-scoped to reporter fields, but SELECT on line 50 is not, so the two grants are inconsistent.

**Blockers**

- This run is source-only: no sandbox is available, so a reporter's SELECT of reviewed_by and resolution_note has not been observed in the PGlite harness.
- Hosted column privileges on public.reports for the authenticated role, and any dashboard-applied revokes, are not visible in source.
- The product owner has not stated whether reviewer identity and resolution notes may be shown to reporters. The snapshot's only intent signal is the 'review fields are moderator-only' comment at moderation_dashboard.sql:44.

**Bounded local check.** In the PGlite harness (tests/db/moderation-dashboard.test.ts), create dummy users reporter and mod, add mod to public.moderators as the owner, and have reporter insert a report on a dummy post. As mod, call admin_set_report_status(report_id, 'dismissed', 'open', 'internal note'). Then, as reporter (authenticated role, jwt sub = reporter.id), run 'select reviewed_by, resolution_note from public.reports where id = $1'. The finding holds if this returns mod.id and 'internal note' rather than a permission error. Stop there.

**Owner-observed deployment check.** Owner-observed and read-only: in the hosted project, run select grantee, column_name, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='reports' and grantee='authenticated', and check has_table_privilege('authenticated','public.reports','SELECT'). Also confirm with the product owner whether reporters may see reviewer identity and resolution notes.

## NV-11. Any signed-in user can query block relationships between arbitrary third parties via has_blocked / is_blocked_between RPCs

Fingerprint: `definer-relationship-helper-block-oracle`

public.has_blocked(p_blocker, p_blocked) and public.is_blocked_between(a, b) are SECURITY DEFINER helpers written for RLS policies and internal checks. Every authenticated user can call them as PostgREST RPCs (/rest/v1/rpc/has_blocked, /rest/v1/rpc/is_blocked_between) with any two user ids. Because they run as the function owner, they read public.user_blocks without the user_blocks_select_own policy, which shows a block row only to its blocker. An attacker can therefore learn whether user A blocked user B, and in which direction, for any pair of profile ids they can collect from profiles, follows or search. Block lists are a protected resource. A user can already infer that someone blocked them, because profiles_select hides profiles that have blocked the viewer (rls.sql:79). What these RPCs newly expose is block relationships between third parties.

**Claimed root cause.** Both helpers are SECURITY DEFINER and take both principals as caller-supplied arguments, with no binding to auth.uid(). The blanket 'grant execute on all functions in schema public to authenticated' at rls.sql:54 and rpc.sql:513 runs after they are created. No later migration revokes EXECUTE on them; the only function-specific revoke in that area covers has_blocked_term. The public schema is exposed through PostgREST, so the helpers work as a direct oracle on RLS-protected user_blocks rows.

**Source trace**

1. `supabase/migrations/20261018000004_rpc.sql:513` (entrypoint, grant execute on all functions in schema public to authenticated): Grants EXECUTE on every existing public function, including the definer block helpers, to authenticated. This makes them callable by any signed-in user at /rest/v1/rpc/<name>.
2. `supabase/migrations/20261018000002_functions.sql:46` (propagation, public.has_blocked(p_blocker uuid, p_blocked uuid) SECURITY DEFINER): Takes both principals from the caller and never binds either one to auth.uid().
3. `supabase/migrations/20261018000002_functions.sql:53` (sink, select exists (select 1 from public.user_blocks ub where ub.blocker_id = p_blocker and ub.blocked_id = p_blocked)): Reads user_blocks as the function owner, bypassing RLS, and returns a boolean that reveals a third party's block.

**Evidence**

- `supabase/migrations/20261018000003_rls.sql:302`: user_blocks_select_own lets only the blocker read a block row (blocker_id = auth.uid()). This is the intended source-of-truth policy.
- `supabase/migrations/20261018000002_functions.sql:32`: is_blocked_between(a,b) is the non-directional variant: also SECURITY DEFINER and also takes arbitrary arguments. The comment at lines 29-30 says it is definer precisely to see blocks the caller's RLS hides.
- `supabase/migrations/20261018000003_rls.sql:54`: The blanket execute grant to authenticated is issued after the helpers are created.
- `supabase/migrations/20261018000004_rpc.sql:512`: Revokes only from public and anon; authenticated is granted again on the next line.
- `supabase/config.toml:13`: The public schema is exposed through the PostgREST API.

**Blockers**

- Source-only run: no target code (PGlite harness) could be executed because the required OS-enforced sandbox limits are unavailable on this macOS host, so a third user calling the RPC has not been observed.
- The hosted project's actual function privileges (any manual revokes) and its exposed API schemas are not visible in source.

**Bounded local check.** Inside an approved sandbox, use tests/db/harness.ts to create dummy users A, B and C. As A (authenticated role, JWT sub=A), insert into user_blocks (blocker_id=A, blocked_id=B). As C, run 'select * from public.user_blocks' and expect 0 rows. Then, as C, run 'select public.has_blocked(A,B), public.has_blocked(B,A), public.is_blocked_between(A,B)'. The finding is confirmed if the result is true, false, true.

**Owner-observed deployment check.** Read-only check by the owner in the SQL editor: select has_function_privilege('authenticated','public.has_blocked(uuid,uuid)','execute'), has_function_privilege('authenticated','public.is_blocked_between(uuid,uuid)','execute'); and confirm 'public' is in the API exposed schemas. If either privilege is true, the oracle is live.

## NV-12. comparison_score RPC reveals any user's private head-to-head ranking choices for any post

Fingerprint: `comparison_score-definer-ranking-comparisons-oracle`

public.comparison_score(p_user, p_post) is SECURITY DEFINER, runs with search_path '', and EXECUTE is granted to authenticated. It returns wins minus ties-excluded losses from public.ranking_comparisons for a user and post that the caller chooses. RLS on that table only lets users read their own rows (ranking_comparisons_select_own), and no later migration redefines or revokes the function. So any signed-in user can call /rpc/comparison_score with another user's id and a post UUID they know, and get that user's net head-to-head preference for the post. A nonzero result also shows the post is among the victim's creations or accepted collaborations, because record_comparison only accepts creations_of(auth.uid()). The function has no auth.uid() binding and checks no visibility, block or private-account rule, so it also works for private posts, posts on private accounts, and victims who have blocked the caller. The leak is small: one integer per post, and the attacker needs the post UUID. Impact is low.

**Claimed root cause.** comparison_score is a definer helper written so the invoker get_rankings (line 145) can order another user's equal-rated creations. It is also granted to authenticated as a callable RPC, and it neither binds p_user to auth.uid() nor checks that p_post is visible to the caller (can_view_post).

**Source trace**

1. `supabase/migrations/20261021000008_ranking_experience.sql:296` (entrypoint, grant execute on function public.comparison_score(uuid, uuid) to authenticated): Any authenticated caller can call POST /rpc/comparison_score with any p_user and p_post. Line 290 revokes only public and anon.
2. `supabase/migrations/20261021000008_ranking_experience.sql:33` (propagation, comparison_score): SECURITY DEFINER, so the owner's rights apply and the select-own RLS on ranking_comparisons is not enforced for the caller.
3. `supabase/migrations/20261021000008_ranking_experience.sql:41` (sink, comparison_score): The query filters only on c.user_id = p_user and the post. It returns the victim's net win/loss count with no auth.uid() or visibility check.

**Evidence**

- `supabase/migrations/20261021000008_ranking_experience.sql:23`: The ranking_comparisons_select_own policy limits reads to user_id = auth.uid(), so the policy treats comparisons as private.
- `tests/db/ranking-experience.test.ts:112`: The test 'accept only your own creations, and stay private' checks that another user's direct select on ranking_comparisons returns no rows. That shows the privacy is intended.
- `supabase/migrations/20261021000008_ranking_experience.sql:145`: The legitimate caller is get_rankings, which runs as invoker. It applies comparison_score only to posts that are visible under posts RLS, so its ordering use does not need a client grant or an unrestricted p_post.

**Blockers**

- Source-only run: no OS-enforced sandbox is available, so the RPC was not executed in the PGlite harness and the returned value was not observed.
- To exploit it, the attacker must know the target post UUID. Public or followers-visible post ids are easy to get, but ids of private posts must leak some other way. That limits the impact on private posts and the overall severity.

**Bounded local check.** In tests/db using tests/db/harness.ts with dummy users: user A creates two published posts P1 and P2 and sets P1 to visibility 'private'. A calls select public.record_comparison(P1, P2). User B, who has no relationship to A (repeat with B blocked by A, and with A as a private account), runs db.query(B.id, 'select public.comparison_score($1,$2) as s', [A.id, P1]). Expect s = 1, while db.query(B.id, 'select * from public.ranking_comparisons') returns []. Stop at that single value. Fix: make the result 0 (or raise an error) unless p_user = auth.uid() or the caller can view p_post (for example public.can_view_post). Better still, revoke EXECUTE from authenticated and keep the helper internal to get_rankings. Re-run to confirm B gets 0 or an error, and that get_rankings ordering for A's own and visible posts is unchanged.

**Owner-observed deployment check.** Owner-observed only, using two dummy accounts on a staging project: check that EXECUTE on public.comparison_score is still granted to authenticated (\df+ or has_function_privilege('authenticated','public.comparison_score(uuid,uuid)','execute')), and that the hosted schema has no later override.

## NV-13. collaboration_status RPC reveals hidden Co-Chef invitation states for a known post ID and any user

Fingerprint: `collaboration_status-definer-oracle`

public.collaboration_status(p_post, p_user) is SECURITY DEFINER with search_path=''. It takes both arguments from the caller and returns post_collaborators.status for that pair. The migration grants it to authenticated and no later migration redefines or revokes it. The post_collaborators_select policy shows pending, declined and removed rows only to the post creator and the invitee, and only when the post is visible to the caller. Any signed-in user who knows or obtains a post UUID can therefore learn whether a named user is pending on, declined, or was removed from that co-creation. This includes posts on private or followers-only accounts the caller cannot see. The caller needs the post UUID: the IDs are random UUIDs, so this is a targeted confirmation oracle, not something that can be enumerated blindly. The disclosure is limited to one status string per (post, user) pair. No post content is exposed.

**Claimed root cause.** A SECURITY DEFINER helper written for use inside the posts_select_visible RLS policy (called with auth.uid()) is also granted to authenticated as a client RPC. It accepts a caller-chosen p_user, never binds the user to auth.uid(), and does not check that the post is visible, so it bypasses the post_collaborators_select policy.

**Source trace**

1. `supabase/migrations/20261021000007_collaborations.sql:502` (entrypoint, grant execute on function public.collaboration_status(uuid, uuid) to authenticated): Any signed-in user can call the function through PostgREST /rpc (anon access is revoked at line 494).
2. `supabase/migrations/20261021000007_collaborations.sql:38` (propagation, public.collaboration_status(p_post uuid, p_user uuid) SECURITY DEFINER): Both the post id and the user id come from the caller. The function runs with the owner's rights, so RLS on post_collaborators does not apply.
3. `supabase/migrations/20261021000007_collaborations.sql:45` (sink, select c.status from public.post_collaborators c where c.post_id = p_post and c.user_id = p_user): Returns 'pending', 'declined', 'removed' or 'accepted' for any pair, with no auth.uid() or post-visibility check.

**Evidence**

- `supabase/migrations/20261021000007_collaborations.sql:90`: post_collaborators_select (lines 90-100) is the intended policy: a row is visible only if its post is visible to the caller, and non-accepted rows only to the invitee or the post author.
- `supabase/migrations/20261021000007_collaborations.sql:77`: The helper's intended use is inside posts_select_visible, called with (select auth.uid()) as the user.
- `supabase/migrations/20261021000007_collaborations.sql:494`: The function is revoked only from public and anon. authenticated keeps EXECUTE, and no later migration in the snapshot references collaboration_status.

**Blockers**

- Source-only run: no OS-enforced sandbox (macOS cannot enforce memory/wall-clock limits), so the PGlite harness was not executed and the RPC result as a third user is unobserved.
- Hosted function grants and the PostgREST exposed-schema setting are not visible in source.
- How readily a non-viewer can obtain a private post's UUID (shared links, notifications, push payloads) has not been established. This limits practical likelihood.

**Bounded local check.** In the tests/db/harness.ts PGlite harness, create dummy users A, B and C. Make A private. A publishes a post and calls invite_collaborators(post, [B]). B calls respond_to_collaboration(post, false). As C, a non-follower: run select public.collaboration_status('<post>', '<B>') and expect 'declined'. Then run select * from public.post_collaborators where post_id = '<post>' and expect zero rows, and select * from public.posts where id = '<post>' and expect zero rows. Stop there.

**Owner-observed deployment check.** Owner-observed, read-only: on the hosted project run select has_function_privilege('authenticated', 'public.collaboration_status(uuid, uuid)', 'execute') and confirm 'public' is in the API exposed schemas. Optionally, with two owner-controlled test accounts, call POST /rest/v1/rpc/collaboration_status with a test post ID and confirm a non-null status comes back for a pair the caller cannot see.

## NV-14. classification_usage counts private and followers-only posts, revealing per-user activity through custom labels

Fingerprint: `classification_usage-definer-counts-invisible-posts`

classification_usage(p_kind) is SECURITY DEFINER and granted to every authenticated user. It returns per-category counts over all published posts. It does not apply the visibility, block or private-account rules that profile_stats applies through counts_toward_stats. Custom classifications are created by users through ensure_custom_category, which stores created_by = auth.uid(). Every authenticated user can read the categories table, including name, is_custom and created_by. When only one user uses a custom label, its count shows how many published private or followers-only posts that user has with it, and polling the count shows when they post. Strangers, users the author has blocked, and unapproved followers of private accounts can all see it. Only counts leak, not post content, so the impact is low.

**Claimed root cause.** The aggregate runs with the definer owner's rights and filters only on p.status = 'published' (classifications_v3.sql:126). It has no can_view_post or counts_toward_stats filter, so it counts post_categories and posts rows that RLS hides from the caller. No later migration redefines classification_usage.

**Source trace**

1. `supabase/migrations/20261021000006_classifications_v3.sql:324` (entrypoint, grant execute on classification_usage(text) to authenticated): Any signed-in user can call the RPC through PostgREST. anon and public are revoked at line 322.
2. `supabase/migrations/20261021000006_classifications_v3.sql:120` (propagation, classification_usage): Declared SECURITY DEFINER with search_path='', so the posts and post_categories RLS policies do not filter rows for the caller.
3. `supabase/migrations/20261021000006_classifications_v3.sql:126` (sink, classification_usage): Joins posts only on status = 'published' and returns count(*) per category_id. Private, followers-only, blocked-author and private-account posts are all counted.

**Evidence**

- `supabase/migrations/20261021000002_private_accounts.sql:184`: counts_toward_stats is the intended rule for aggregates (can_view_post, or the public/followers posts of a private account when neither user has blocked the other). profile_stats applies it, and classification_usage does not.
- `supabase/migrations/20261018000003_rls.sql:97`: The categories_select policy is using (true), and line 22 grants table-level select on categories to authenticated. Custom label names and creators are therefore readable by everyone.
- `supabase/migrations/20261021000006_classifications_v3.sql:102`: ensure_custom_category inserts custom labels with is_custom = true and created_by = auth.uid(). This links each label to the user who created it. The column is added at line 13.

**Blockers**

- Source-only run: the macOS host cannot enforce the required sandbox memory and wall-clock limits, so the PGlite harness was not run and the counts were not observed.
- The per-user disclosure needs a data-state condition: a custom label used only, or mostly, by one user. Labels are normalized and shared by slug, so other users' public posts with the same label would blur the count.

**Bounded local check.** In the tests/db PGlite harness: (1) User A calls ensure_custom_category('cuisine', null, 'Zzunique Label'). A then calls save_post twice to publish two posts using that category, with visibility 'private'. (2) A blocks user B, or B is an unrelated stranger. (3) As B, select id, created_by, is_custom from categories where slug = slugify('Zzunique Label'). Expect created_by = A. (4) As B, call classification_usage('cuisine'). The vulnerable behavior is uses = 2 for that id. (5) Apply the fix 'and public.counts_toward_stats(p.author_id, p.visibility, p.status)' in the posts join, or count only visibility = 'public' posts with no block relationship. Re-run and expect no row, or 0, for B, while A still sees their own usage if desired.

**Owner-observed deployment check.** Owner check, read-only: confirm that the hosted database's classification_usage definition matches the migration (\df+ public.classification_usage) and that authenticated holds EXECUTE on it. Do not query other users' data.
