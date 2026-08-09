# Supabase migration order

For a new project, run these files from top to bottom in the Supabase SQL editor. For an existing project, run only migrations that have not already been applied. SQL changes are not applied by a GitHub or Vercel deployment.

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
11. `add-profile-follows.sql`
12. `add-showcase-posts.sql`
13. `add-showcase-ratings.sql`
14. `add-showcase-comments.sql`
15. `add-showcase-reports.sql`
16. `add-owner-report-review.sql`
17. `add-coaching-marketplace.sql`
18. `add-coach-interest-status.sql`
19. `add-challenge-booking-links.sql`
20. `add-region-booking-shortcuts.sql`
21. `add-teams-and-requests.sql`
22. `add-challenge-linked-teams.sql`
23. `add-team-member-roles.sql`
24. `add-storage-buckets.sql`
25. `add-expert-help-requests.sql`
26. `add-expert-profiles.sql`
27. `add-expert-help-assignment.sql`
28. `add-expert-help-responses.sql`
29. `add-expert-help-scheduling.sql`
30. `add-expert-session-links.sql`
31. `add-expert-session-feedback.sql`
32. `add-expert-pricing-availability.sql`
33. `add-payment-interests.sql`
34. `add-founder-feedback.sql`
35. `add-first-wave-interests.sql`
36. `add-challenge-messages.sql`
37. `expand-expert-help-types.sql`
38. `add-delete-proof-showcase-policies.sql`
39. `add-edit-content-policies.sql`
40. `add-challenge-room-delete-policies.sql`
41. `tighten-challenge-completion-and-proof-policies.sql`
42. `add-shared-listen-rooms.sql`
43. `add-notification-read-state.sql`
44. `harden-production-user-actions.sql`
45. `add-account-deletion-workflow.sql`
46. `add-payments.sql`
47. `add-opponent-discovery.sql`

Keep `tighten-challenge-completion-and-proof-policies.sql` after all challenge-related migrations. The shared listen-room migration is independent and can be applied after it.
