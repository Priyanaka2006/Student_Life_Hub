<<<<<<< HEAD
# Student Life Hub

The interface uses plain HTML, CSS, and browser JavaScript. An optional Node.js/Express server adds a SQLite database for persistent data.

## Run with the backend

1. Install Node.js 20 or newer.
2. In this project folder, run `npm install`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000`.

On the first server visit, the app initializes SQLite from the data available to that browser (starter records are supplied if it is a new browser profile). Later visits load the saved database data. The database is created automatically at `data/student-life-hub.sqlite`.

Opening `index.html` directly still works using browser `localStorage`, but that mode does not connect to SQLite. Browsers keep `file://` and `http://127.0.0.1` storage separately, so existing data from directly opening the HTML file is not automatically migrated to the server.

## Before publishing online

This starter backend is intended for one person's local use: it has no sign-in or per-user access controls, so clients connected to the same server share its records. Add authentication, per-user database ownership, HTTPS, and deployment-specific protections before making it public.
=======
# Student_Life_Hub
A modern student productivity web app that helps college students manage assignments, attendance, exams, study plans, important links, and motivation in one place.
>>>>>>> 369c2632825b9996c2a1d155c4e64b4caf49098c
