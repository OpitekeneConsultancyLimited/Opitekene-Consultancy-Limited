# Production database infrastructure recommendation

Audit finding **L4**. This is a recommendation for management. **No plan has been changed and nothing has been spent.** Prices are from Supabase's published pages as read on 14 Nov 2026 (US dollars, before tax). Check them again before deciding.

## Current position (Free plan)

| Area | Today | Risk |
|---|---|---|
| Backups | No Supabase-managed backups on Free. TaxComp's own encrypted daily export (02:30, owner PC, copy in OneDrive), restore-drilled 14 Nov (1,974/1,974 rows) | Depends on the owner's PC being on. Covers the `taxcomp` schema only (not `auth.users` or Storage files: N6). Worst-case data loss about 24 hours. |
| Point-in-time recovery | Not available | Cannot rewind to before a bad change |
| Availability | Free projects pause after about a week without activity | An outage if traffic stops (low now, but real at launch) |
| Support | Community only | No help in an incident |
| Security features | No leaked-password protection, no session time-outs (M4) | Covered by interim controls only |
| Capacity | 500 MB database, shared micro compute, 1 GB file storage | Enough for the pilot; tight once documents are uploaded |

## Options

| Option | Monthly cost (approx.) | Backups | PITR | Fits |
|---|---|---|---|---|
| A. Stay on Free | $0 | Own daily export only | No | Pilot with no paying users |
| **B. Pro (recommended at launch)** | **$25** (includes $10 compute credit = one Micro instance) | Daily, kept 7 days | Optional | Launch with paying users |
| C. Pro + PITR 7 days | about $125 ($25 + about $100 for PITR) | Daily + PITR | 7-day window, minutes of loss | When customer data volume or contractual promises justify it |
| D. Team | much higher (see the pricing page) | 14 days | Optional | Not needed at TaxComp's size |

Notes: PITR is billed by retention (7, 14 or 28 days; about $100, $200 or $400 a month) and is **not covered by the spend cap**. Bigger compute is extra (for example Small about $15, Medium about $60 a month).

## Recommendation

1. **Now (pilot):** stay on Free and keep the own encrypted backups. Finish moving the backup off the single PC (H3, G6) and add `auth.users` and Storage to the backup (N6).
2. **Before public launch (operations gate):** move to **Pro ($25 a month)**. Turn on leaked-password protection and session time-outs, and keep the spend cap on. This removes pausing and gives 7 days of managed backups.
3. **Add PITR** only when management sets an RPO under 24 hours (G6), or paying firms store documents that cannot be re-uploaded.
4. **Staging (N5):** a second Free project costs nothing and lets migrations be rehearsed away from production.
5. Revisit compute when monthly active users or database size grows. Watch the Supabase usage page, and the scheduled cloud audit, which already checks the project is reachable.

## Recovery objectives (management to set; G6)

Suggested starting point for discussion only:
- **Pilot:** RPO 24 hours, RTO 1 working day.
- **At launch on Pro:** RPO 24 hours (daily backups, plus the own export), RTO 4 hours.
- **With PITR:** RPO about 5 minutes.

These figures are not set until management records them.

Sources: [Supabase pricing](https://supabase.com/pricing), [Database backups](https://supabase.com/docs/guides/platform/backups), [Manage PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery), [Free plan backups FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups).
