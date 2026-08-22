# Supabase migration order

For a new project, run every file below from top to bottom in the Supabase SQL editor. For an existing project, back up the database and run only files that have not already been applied. GitHub and Vercel deployments do not apply SQL.

1. `schema.sql`
2. `add-challenge-joins.sql`
3. `add-challenge-results.sql`
4. `add-user-owned-actions.sql`
5. `add-one-vote-rating-per-user.sql`
6. `add-profiles.sql`
7. `add-proof-type.sql`
8. `add-proof-review-status.sql`
9. `add-reports.sql`
10. `add-challenge-invites.sql`
11. `add-challenge-invite-lifecycle.sql`
12. `add-profile-follows.sql`
13. `add-profile-sharing.sql`
14. `add-showcase-posts.sql`
15. `add-showcase-ratings.sql`
16. `add-showcase-comments.sql`
17. `add-showcase-reports.sql`
18. `add-owner-report-review.sql`
19. `add-coaching-marketplace.sql`
20. `add-coach-interest-status.sql`
21. `add-challenge-booking-links.sql`
22. `add-region-booking-shortcuts.sql`
23. `add-teams-and-requests.sql`
24. `add-team-sharing.sql`
25. `add-challenge-linked-teams.sql`
26. `add-team-member-roles.sql`
27. `add-storage-buckets.sql`
28. `add-expert-help-requests.sql`
29. `add-expert-profiles.sql`
30. `add-expert-help-assignment.sql`
31. `add-expert-help-responses.sql`
32. `add-expert-help-scheduling.sql`
33. `add-expert-session-links.sql`
34. `add-expert-session-feedback.sql`
35. `add-expert-pricing-availability.sql`
36. `add-payment-interests.sql`
37. `add-founder-feedback.sql`
38. `add-first-wave-interests.sql`
39. `add-challenge-messages.sql`
40. `expand-expert-help-types.sql`
41. `add-delete-proof-showcase-policies.sql`
42. `add-edit-content-policies.sql`
43. `add-challenge-room-delete-policies.sql`
44. `add-shared-listen-rooms.sql`
45. `add-private-listen-rooms.sql`
46. `add-notification-read-state.sql`
47. `add-notification-dismissals.sql`
48. `add-account-deletion-workflow.sql`
49. `add-payments.sql`
50. `add-opponent-discovery.sql`
51. `add-challenge-scheduling.sql`
52. `add-challenge-room-views.sql`
53. `add-challenge-live-streams.sql`
54. `add-challenge-voting-windows.sql`
55. `add-challenge-rosters.sql`
56. `harden-challenge-scheduling-rosters.sql`
57. `enable-challenge-roster-realtime.sql`
58. `add-challenge-self-leave.sql`
59. `enforce-activity-match-formats.sql`
60. `add-athletics-events.sql`
61. `add-native-livekit-rooms.sql`
62. `fix-challenge-live-reactions.sql`
63. `enable-challenge-invite-realtime.sql`
64. `add-challenge-invite-sharing.sql`
65. `add-challenge-result-sharing.sql`
66. `add-challenge-room-sharing.sql`
67. `add-push-notifications.sql`
68. `add-saved-challenge-rooms.sql`
69. `add-saved-room-notifications.sql`
70. `tighten-challenge-completion-and-proof-policies.sql`
71. `harden-production-user-actions.sql`
72. `add-growth-engagement.sql`

The two policy-hardening migrations are intentionally after the challenge schema they protect. `add-growth-engagement.sql` is last because it extends profiles, notifications, challenges, invites, proofs, votes, teams, and Firebase's push outbox.

Never rerun the complete list against an existing production database. First compare Supabase migration history with this file, then apply only missing migrations in this order.
