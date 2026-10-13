# Quiz Night RSVP

Halloween Quiz Night (October 29) attendance page. One Bun server, no dependencies.

```sh
bun start
```

- RSVP page: `http://localhost:3131`
- Admin (list, delete entries, random teams): `http://localhost:3131/admin?key=<ADMIN_KEY>`

The admin link is printed when the server starts. Set `ADMIN_KEY` to keep the same key across restarts, otherwise a new random one is generated each time. Set `PORT` to change the port.

```sh
ADMIN_KEY=my-secret PORT=8080 bun start
```

Answers are saved in `data/rsvps.json`. Submitting the same name again updates that person's answer.

## Deploy

Runs under pm2 on the server at `/root/projects/prod/halloween-tbc`, port 3131, behind `https://halloween.tbcap.mn`.

First time:

```sh
git clone git@github.com:soulforger1/halloween-tbc.git /root/projects/prod/halloween-tbc
/root/projects/prod/halloween-tbc/deploy.sh
```

After that, `./deploy.sh` (git pull, pm2 reload). The first run creates `.env` with `PORT` and a random `ADMIN_KEY` and prints the admin link; edit `.env` to change either. `data/rsvps.json` stays on the server and is not touched by deploys.
