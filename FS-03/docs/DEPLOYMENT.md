# Running the whole stack in Docker (and deploying)

The brief accepts "deployed **or** screen-recorded". A clean screen recording of the local version is enough.
If you also want it deployed, this is the shortest route.

## All-in-one on your machine
```bash
cd server && cp .env.example .env     # Windows: copy .env.example .env   (set JWT_SECRET)
cd ..
docker compose -f docker-compose.prod.yml up --build
```
Open **http://localhost:8080**. Four containers run: MongoDB, Redis, the API, the video worker, plus nginx serving the React build.
Seed demo data once the stack is up:
```bash
docker compose -f docker-compose.prod.yml exec api node src/scripts/seedAdmin.js
docker compose -f docker-compose.prod.yml exec api node src/scripts/seedDemo.js
```

## On a server (any Linux VM, e.g. an AWS EC2 free-tier instance)
1. Install Docker, copy the project, create `server/.env` with real values.
2. In `docker-compose.prod.yml`, change `CLIENT_URL` and `PUBLIC_API_URL` from `http://localhost:8080` to your server's address (for example `http://<server-ip>:8080`), and open port 8080 in the instance's security group.
3. Run the same `docker compose ... up --build -d` command.
4. Stripe: add a webhook endpoint `https://<your-domain>/api/payments/webhook` in the Stripe dashboard and put its `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
5. Camera access for live classes needs HTTPS in browsers, so put a domain and HTTPS (for example Caddy or nginx with Let's Encrypt) in front before testing live classes on a server. On `localhost` it works without HTTPS.

## Why the worker and API share volumes
The API saves an uploaded video to a temp folder and the worker picks it up from the same path, so both containers
mount the same `tmp` volume. With `STORAGE_DRIVER=s3` the finished files go to S3 and the `media` volume is unused.
