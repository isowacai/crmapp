# My Shop CRM

This is a modern CRM application built with React, TypeScript, and Tailwind CSS.

## Features

- Dashboard with key metrics and visualizations
- Customer management
- Product catalog
- Task management
- Beautiful UI with Tailwind CSS
- Responsive design
- Data visualization with custom charts

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
npm run load-data             # load sample data
npm run number-orders         # preview order numbers for older orders (add `-- --apply` to save)
```


## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
