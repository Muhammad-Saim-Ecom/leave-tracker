# Leave Tracker

A clear dashboard on top of the Notion **✈️ Leave Tracker** (`Leave_tracker_db`). Read-only: approving, rejecting and editing still happen in Notion, and the dashboard picks changes up within a minute.

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env   # then set NOTION_TOKEN
npm start              # http://localhost:8090
```

**`NOTION_TOKEN`**: a Notion internal integration with "Read content" and "Read user information including email addresses", connected (••• → Connections) to the Leave Tracker page and the Team Members database. It only reads names, emails, employment status and leave balances from Team Members. The "Orion EOD Report" integration used by Dev Status already has access.

Set `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` before putting it anywhere other than your machine: the page shows names, emails, notes and leave balances.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Run the dashboard |
| `npm run dev` | Same, restarting on code changes |
| `npm run check` | One read-only pass, printed in the terminal (who's out today, what's waiting for approval) |
| `npm test` | Unit tests (no network) |
| `npm run typecheck` | TypeScript check |

## Tabs

The **Department** chips at the top filter every tab (remembered per browser). Notion's duplicate departments are merged: Engineering = Development, Lead Developer, Data, Architect, Engineering, Lead Engineering, After Shift Engineering, Workflow Automation, NetSuite (the same set as Notion's "Dev Dept View"); Quality Inspection = QI + Quality Inspection; Account Managers = Account Manager(s); Design; Operations = everything else (HR, Strategy, Management, Product, After Hours, …).

| Tab | Replaces in Notion | What it shows |
|---|---|---|
| **Overview** | the page itself | Out today / this week, awaiting approval, finance queue; who's out today and when they're back; the next 14 days; days off this year by type and department; days off per month (last 12 months + booked ahead) |
| **Approvals** | "Leaves for manager approval" (Approval empty) | Undecided requests split into *happening now*, *within 7 days*, *later* and *past, never decided*. Each shows dates, days, the balance it draws from and what's left after, unpaid days, overlap with colleagues in the same department, the note, and a button to review it in Notion. Filter by manager. |
| **Calendar** | "Dev Dept View" timeline | **Month** view: each day tinted by how many people are out, with their avatars (dot = leave type, dashed ring = pending). **Timeline** view: 2/4/6 weeks or a custom range, grouped by department, with a people-out bar per day; pending requests are hatched, half days are thin bars. Both show totals for the dates in view (people off, days booked, busiest day, awaiting approval) and a side panel listing who is out on the selected day and when they're back. |
| **All requests** | the grouped tables, "QI Dept View", "AM View", "dev dept table" | Every request with search, status / type / finance / manager / period filters, sortable columns, optional grouping (status, person, month, type) and CSV export |
| **Finance** | "For Kevin" (grouped by For Finance Processing) | Every request, one row each, with its **Finance** flag (NEW / PROCESSED) and a **Stage**: *To process* (approved + NEW), *Waiting for manager*, *Processed*, *Nothing to do* (rejected/cancelled), or *Fix* (rejected but NEW, approved with no flag, day counts that don't add up). The highlight tiles are filters; search for a person to see all their requests across stages. Month, type and finance filters, sortable columns, CSV export. |
| **People** | "Leaves History" (grouped by name) | One card per person: days off in the chosen year by type, unpaid days, leave balances (from Team Members), current or next leave. Click for the full history. |

Click any person or request for details and a link to the Notion page. Every ⓘ icon explains the number or column next to it (hover, tap, or focus with the keyboard).

**Only current employees are shown.** People are matched to the **Team Members** database by email (then by name); anyone whose **Employment Status** there is Resigned or Fired is left out of every tab, total and export. People not found in Team Members are still shown. Leave balances on the People tab come from Team Members too (Vacation / Sick / Emergency Leave Balance), falling back to the snapshot on the person's last request.

## How data is read

- At boot and every 30 minutes the whole leave database and Team Members are read (~25 Notion calls); every 60 seconds only rows edited since the last sync are fetched. **Refresh** in the header runs a sync now.
- A request with no **Approval** counts as pending.
- **Number of Days** is a text field in Notion; blank or non-numeric values show as "?". Monthly/yearly day totals spread each request's days over the weekdays it covers.
- **Days = Paid days + Unpaid days.** Paid days are Notion's "Days Reduced From Credit" (taken from the leave balance); unpaid days are "Unpaid Leaves Count" (deducted from salary).
