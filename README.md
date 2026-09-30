# Demand Management

An internal demand-management app: staff raise service requests from a predefined catalog, leads and
managers triage and assign them to people, and dashboards show demand, delivery, and team capacity.
Built with React, TypeScript, Tailwind CSS, and Firebase.

## Features

- **Service catalog**: predefined services, each with a category and delivering team
- **Service requests**: numbered `REQ-YYYYMMDD-NNNN`; staff describe the need, and every new request goes to the triage queue
- **Triage and assignment**: leads and managers set impact × urgency priority (P1–P4), an estimate, and planned dates,
  seeing each person's existing load and a warning if they'd go over capacity
- **Capacity**: per-person weekly capacity, planned vs. logged hours, and team consumption reports
- **Dashboards**: backlog, demand trend, most requested services, on-time delivery, lead time, utilization

## Roles

| Role | Can |
|---|---|
| Staff | Raise requests, track their own, and work on requests assigned to them |
| Lead / Manager | Everything staff can, plus triage, assign, re-plan, and view capacity; managers also edit the catalog |
| Admin | Everything, plus manage users (role, team, weekly capacity) |

Users stored with the old `customer` role are treated as Staff.

## Getting Started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build for production
npm run lint      # run ESLint
```

The app uses Firebase (Auth + Firestore). Its config is read from `dev.properties` in the project
root, which is shared by the app and the admin scripts. Restart `npm run dev` after changing it.

### Admin scripts

These run against the same Firebase project as the app:

```bash
npm run list-users            # print all users in the `users` collection
npm run set-admin <userId>    # give a user the admin role
npm run sync-users            # fill in missing fields on user documents
npm run load-services         # add a starter service catalog (skips anything that already exists)
```


## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
